/**
 * Web配置设置模块
 * 用于加载和管理Jellyfin Web客户端的配置选项
 */

import DefaultConfig from '../../config.json';
import fetchLocal from '../../utils/fetchLocal.ts';

/**
 * 缓存的配置数据
 * @type {Object|undefined}
 */
let data;

/**
 * 异步获取Web配置
 * 首次调用时从config.json文件加载配置，后续调用返回缓存的数据
 * 如果加载失败，则使用默认配置
 *
 * @returns {Promise<Object>} 配置对象
 */
async function getConfig() {
    // 如果已有缓存数据，直接返回
    if (data) return Promise.resolve(data);
    try {
        // 从本地获取配置文件，禁用缓存以确保获取最新配置
        const response = await fetchLocal('config.json', {
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error('network response was not ok');
        }

        // 解析JSON并缓存数据
        data = await response.json();

        return data;
    } catch (error) {
        console.warn('failed to fetch the web config file:', error);
        // 加载失败时使用默认配置
        data = DefaultConfig;
        return data;
    }
}

/**
 * 获取是否包含CORS凭据的配置
 * 用于跨域请求时是否携带认证信息
 *
 * @returns {Promise<boolean>} 是否包含CORS凭据
 */
export function getIncludeCorsCredentials() {
    return getConfig()
        .then(config => !!config.includeCorsCredentials)
        .catch(error => {
            console.log('cannot get web config:', error);
            return false;
        });
}

/**
 * 获取是否启用多服务器支持
 * 在webpack开发环境下默认启用多服务器支持
 *
 * @returns {Promise<boolean>} 是否启用多服务器
 */
export function getMultiServer() {
    // 在webpack serve模式下启用多服务器支持
    if (__WEBPACK_SERVE__) {
        return Promise.resolve(true);
    }

    return getConfig().then(config => {
        return !!config.multiserver;
    }).catch(error => {
        console.log('cannot get web config:', error);
        return false;
    });
}

/**
 * 获取预配置的服务器列表
 * 返回配置文件中定义的服务器数组
 *
 * @returns {Promise<Array>} 服务器配置数组
 */
export function getServers() {
    return getConfig().then(config => {
        return config.servers || [];
    }).catch(error => {
        console.log('cannot get web config:', error);
        return [];
    });
}

/**
 * 基础默认主题配置
 * 当配置中没有指定默认主题时使用此配置
 */
const baseDefaultTheme = {
    'name': 'Dark',
    'id': 'dark',
    'default': true
};

/**
 * 内部默认主题
 * 根据配置动态设置
 * @type {Object}
 */
let internalDefaultTheme = baseDefaultTheme;

/**
 * 检查并设置默认主题
 * 从主题列表中查找标记为默认的主题
 * 如果未找到，则使用基础默认主题
 *
 * @param {Array} themes - 主题配置数组
 */
const checkDefaultTheme = (themes) => {
    if (themes) {
        // 查找标记为default的主题
        const defaultTheme = themes.find((theme) => theme.default);

        if (defaultTheme) {
            internalDefaultTheme = defaultTheme;
            return;
        }
    }

    // 未找到默认主题时使用基础配置
    internalDefaultTheme = baseDefaultTheme;
};

/**
 * 获取可用的主题列表
 * 从配置文件加载主题配置，并验证配置的有效性
 * 同时更新默认主题设置
 *
 * @returns {Promise<Array>} 主题配置数组
 */
export function getThemes() {
    return getConfig().then(config => {
        if (!Array.isArray(config.themes)) {
            console.error('web config is invalid, missing themes:', config);
        }
        // 确保返回有效的主题数组
        const themes = Array.isArray(config.themes) ? config.themes : DefaultConfig.themes;
        // 检查并设置默认主题
        checkDefaultTheme(themes);
        return themes;
    }).catch(error => {
        console.log('cannot get web config:', error);
        checkDefaultTheme();
        return DefaultConfig.themes;
    });
}

/**
 * 获取当前的默认主题配置
 *
 * @returns {Object} 默认主题对象
 */
export const getDefaultTheme = () => internalDefaultTheme;

/**
 * 获取菜单链接配置
 * 返回自定义菜单链接列表，用于在界面中显示额外的导航链接
 *
 * @returns {Promise<Array>} 菜单链接配置数组
 */
export function getMenuLinks() {
    return getConfig().then(config => {
        if (!config.menuLinks) {
            console.error('web config is invalid, missing menuLinks:', config);
        }
        return config.menuLinks || [];
    }).catch(error => {
        console.log('cannot get web config:', error);
        return [];
    });
}

/**
 * 获取插件配置列表
 * 返回需要加载的插件配置，如果配置文件中未指定则使用默认插件配置
 *
 * @returns {Promise<Array>} 插件配置数组
 */
export function getPlugins() {
    return getConfig().then(config => {
        if (!config.plugins) {
            console.error('web config is invalid, missing plugins:', config);
        }
        return config.plugins || DefaultConfig.plugins;
    }).catch(error => {
        console.log('cannot get web config:', error);
        return DefaultConfig.plugins;
    });
}
