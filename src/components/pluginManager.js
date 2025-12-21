/**
 * 插件管理器模块
 * 负责加载、注册和管理 Jellyfin Web 应用中的各种插件
 */

import Events from '../utils/events.ts';
import globalize from '../lib/globalize';
import loading from './loading/loading';
import appSettings from '../scripts/settings/appSettings';
import { playbackManager } from './playback/playbackmanager';
import { appHost } from '../components/apphost';
import { appRouter } from './router/appRouter';
import * as inputManager from '../scripts/inputManager';
import toast from '../components/toast/toast';
import confirm from '../components/confirm/confirm';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import * as dashboard from '../utils/dashboard';

// TODO: 用每个插件的版本号替换此缓存参数
// 缓存参数，用于防止浏览器缓存旧版本的插件文件
const cacheParam = new Date().getTime();

/**
 * 插件管理器类
 * 提供插件的加载、注册、查询等核心功能
 */
class PluginManager {
    /** @type {Array} 已注册的插件列表 */
    pluginsList = [];

    /**
     * 获取所有已注册的插件
     * @returns {Array} 插件列表
     */
    get plugins() {
        return this.pluginsList;
    }

    /**
     * 加载插件的翻译字符串
     * @private
     * @param {Object} plugin - 插件对象
     * @returns {Promise} 加载翻译字符串的 Promise
     */
    #loadStrings(plugin) {
        // 如果插件提供了 getTranslations 方法，则获取翻译内容，否则使用空数组
        const strings = plugin.getTranslations ? plugin.getTranslations() : [];
        return globalize.loadStrings({
            name: plugin.id || plugin.packageName,
            strings: strings
        });
    }

    /**
     * 注册插件并加载其翻译字符串
     * @private
     * @param {Object} plugin - 要注册的插件对象
     * @returns {Promise<Object>} 返回插件对象
     */
    async #registerPlugin(plugin) {
        // 将插件添加到插件列表中
        this.#register(plugin);

        if (plugin.type === 'skin') {
            // 皮肤类型的插件不会立即加载翻译，而是在需要时才加载
            return plugin;
        } else {
            // 其他类型的插件立即加载翻译字符串
            return this.#loadStrings(plugin);
        }
    }

    /**
     * 准备插件以便注册
     * 设置插件的 URL 和基础路径信息
     * @private
     * @param {string|Object} pluginSpec - 插件规范（URL 字符串或对象）
     * @param {Object} plugin - 插件实例
     * @returns {Promise} 注册插件的 Promise
     */
    async #preparePlugin(pluginSpec, plugin) {
        if (typeof pluginSpec === 'string') {
            // 检查插件是否已经安装
            const existing = this.plugins.filter(function (p) {
                return p.id === plugin.id;
            })[0];

            if (existing) {
                return pluginSpec;
            }

            // 设置插件的安装 URL
            plugin.installUrl = pluginSpec;

            // 提取插件的基础 URL（去除文件名部分）
            const separatorIndex = Math.max(pluginSpec.lastIndexOf('/'), pluginSpec.lastIndexOf('\\'));
            plugin.baseUrl = pluginSpec.substring(0, separatorIndex);
        }

        return this.#registerPlugin(plugin);
    }

    /**
     * 加载插件
     * 支持多种加载方式：通过 window 对象、动态导入或 Promise
     * @param {string|Promise} pluginSpec - 插件规范（可以是字符串、Promise 等）
     * @returns {Promise<Object>} 返回加载并注册后的插件
     * @throws {TypeError} 当插件定义格式不正确时抛出错误
     */
    async loadPlugin(pluginSpec) {
        let plugin;

        if (typeof pluginSpec === 'string') {
            if (pluginSpec in window) {
                // 方式 1: 从 window 对象加载插件
                console.log(`Loading plugin (via window): ${pluginSpec}`);

                const pluginDefinition = await window[pluginSpec];
                if (typeof pluginDefinition !== 'function') {
                    throw new TypeError('Plugin definitions in window have to be an (async) function returning the plugin class');
                }

                const PluginClass = await pluginDefinition();
                if (typeof PluginClass !== 'function') {
                    throw new TypeError(`Plugin definition doesn't return a class for '${pluginSpec}'`);
                }

                // 初始化插件并传递基础依赖项
                plugin = new PluginClass({
                    events: Events,
                    loading,
                    appSettings,
                    playbackManager,
                    globalize,
                    appHost,
                    appRouter,
                    inputManager,
                    toast,
                    confirm,
                    dashboard,
                    ServerConnections
                });
            } else {
                // 方式 2: 通过动态导入加载插件
                console.debug(`Loading plugin (via dynamic import): ${pluginSpec}`);
                const pluginResult = await import(/* webpackChunkName: "[request]" */ `../plugins/${pluginSpec}`);
                plugin = new pluginResult.default;
            }
        } else if (pluginSpec.then) {
            // 方式 3: 通过 Promise 或异步函数加载插件
            console.debug('Loading plugin (via promise/async function)');

            const pluginResult = await pluginSpec;
            plugin = new pluginResult.default;
        } else {
            throw new TypeError('Plugins have to be a Promise that resolves to a plugin builder function');
        }

        // 准备并注册插件
        return this.#preparePlugin(pluginSpec, plugin);
    }

    /**
     * 注册插件到插件列表
     * 由于没有自动发现机制，插件需要手动注册
     * 每个插件对象应包含以下属性：
     * - name: 插件名称
     * - type: 插件类型（如 skin、screensaver 等）
     * @private
     * @param {Object} obj - 要注册的插件对象
     */
    #register(obj) {
        // 将插件添加到列表中
        this.pluginsList.push(obj);
        // 触发 'registered' 事件，通知其他模块有新插件注册
        Events.trigger(this, 'registered', [obj]);
    }

    /**
     * 获取指定类型的所有插件
     * @param {string} type - 插件类型（如 'skin'、'screensaver' 等）
     * @returns {Array} 匹配类型的插件数组
     */
    ofType(type) {
        return this.pluginsList.filter(plugin => plugin.type === type);
    }

    /**
     * 获取指定类型中优先级最高的插件
     * @param {string} type - 插件类型
     * @returns {Object|undefined} 优先级最高的插件，如果没有则返回 undefined
     */
    firstOfType(type) {
        // 获取指定类型的所有插件
        return this.ofType(type)
            // 按优先级排序，返回优先级最高（数值最小）的插件
            .sort((p1, p2) => (p1.priority || 0) - (p2.priority || 0))[0];
    }

    /**
     * 将插件的相对路径映射为完整的 URL
     * @param {string|Object} plugin - 插件 ID（字符串）或插件对象
     * @param {string} path - 插件内的相对路径
     * @param {boolean} addCacheParam - 是否添加缓存参数
     * @returns {string} 完整的 URL 路径
     */
    mapPath(plugin, path, addCacheParam) {
        // 如果传入的是插件 ID，则查找对应的插件对象
        if (typeof plugin === 'string') {
            plugin = this.pluginsList.filter((p) => {
                return (p.id || p.packageName) === plugin;
            })[0];
        }

        // 构建完整的 URL
        let url = plugin.baseUrl + '/' + path;

        // 如果需要添加缓存参数，防止浏览器缓存
        if (addCacheParam) {
            url += url.includes('?') ? '&' : '?';
            url += 'v=' + cacheParam;
        }

        return url;
    }
}

/**
 * 插件管理器单例实例
 * @type {PluginManager}
 */
export const pluginManager = new PluginManager();
