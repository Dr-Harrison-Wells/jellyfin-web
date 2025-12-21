/**
 * Dashboard 工具模块
 * 提供 Jellyfin Web 仪表板相关的核心功能，包括用户管理、服务器连接、导航、UI 交互等
 */

// 应用程序相关导入
import { appHost } from 'components/apphost';
import viewContainer from 'components/viewContainer';
import { AppFeature } from 'constants/appFeature';
import { ServerConnections } from 'lib/jellyfin-apiclient';

// UI 组件导入
import toast from '../components/toast/toast';
import loading from '../components/loading/loading';
import { appRouter } from '../components/router/appRouter';
import baseAlert from '../components/alert';
import baseConfirm from '../components/confirm/confirm';
import globalize from '../lib/globalize';
import * as webSettings from '../scripts/settings/webSettings';
import datetime from '../scripts/datetime';
import { setBackdropTransparency } from '../components/backdrop/backdrop';
import DirectoryBrowser from '../components/directorybrowser/directorybrowser';
import dialogHelper from '../components/dialogHelper/dialogHelper';
import itemIdentifier from '../components/itemidentifier/itemidentifier';
import { getLocationSearch } from './url.ts';
import { queryClient } from './query/queryClient';

/**
 * 获取当前登录用户信息
 * @returns {Promise} 当前用户对象的 Promise
 */
export function getCurrentUser() {
    return window.ApiClient.getCurrentUser(false);
}

/**
 * 获取服务器地址
 * 按优先级尝试以下来源：
 * 1. 已连接的 ApiClient
 * 2. config.json 中配置的服务器列表
 * 3. 从当前 URL 计算的基础地址
 * @returns {Promise<string|undefined>} 服务器地址的 Promise
 */
// TODO: investigate url prefix support for serverAddress function
export async function serverAddress() {
    const apiClient = window.ApiClient;

    if (apiClient) {
        return Promise.resolve(apiClient.serverAddress());
    }

    // 使用 config.json 中指定的服务器
    const urls = await webSettings.getServers();

    if (urls.length === 0) {
        // 否则使用计算出的基础 URL
        let url;
        const index = window.location.href.toLowerCase().lastIndexOf('/web');
        if (index != -1) {
            url = window.location.href.substring(0, index);
        } else {
            // 回退到不带路径的地址
            url = window.location.origin;
        }

        // 不使用打包应用的 URL (file:) 作为服务器 URL
        if (url.startsWith('file:')) {
            return Promise.resolve();
        }

        urls.push(url);
    }

    console.debug('URL candidates:', urls);

    const promises = urls.map(url => {
        return fetch(`${url}/System/Info/Public`, { cache: 'no-cache' })
            .then(async resp => {
                if (!resp.ok) {
                    return;
                }

                let config;
                try {
                    config = await resp.json();
                } catch {
                    return;
                }

                return {
                    url,
                    config
                };
            }).catch(error => {
                console.error(error);
            });
    });

    return Promise.all(promises).then(responses => {
        return responses.filter(obj => obj?.config);
    }).then(configs => {
        const selection = configs.find(obj => !obj.config.StartupWizardCompleted) || configs[0];
        return selection?.url;
    }).catch(error => {
        console.error(error);
    });
}

/**
 * 获取当前登录用户的 ID
 * @returns {string|null} 用户 ID，未登录则返回 null
 */
export function getCurrentUserId() {
    const apiClient = window.ApiClient;

    if (apiClient) {
        return apiClient.getCurrentUserId();
    }

    return null;
}

/**
 * 服务器切换时的回调函数
 * @param {string} _userId - 用户 ID（未使用）
 * @param {string} _accessToken - 访问令牌（未使用）
 * @param {Object} apiClient - API 客户端实例
 */
export function onServerChanged(_userId, _accessToken, apiClient) {
    ServerConnections.setLocalApiClient(apiClient);
}

/**
 * 注销当前用户
 * 清除查询缓存、重置视图，并根据是否支持多服务器导航到相应页面
 */
export function logout() {
    ServerConnections.logout().then(function () {
        // 清除查询缓存
        queryClient.clear();
        // 重置缓存的视图
        viewContainer.reset();
        appHost.supports(AppFeature.MultiServer) ?
            navigate('selectserver') : navigate('login');
    });
}

/**
 * 获取插件配置页面的 URL
 * @param {string} name - 插件名称
 * @returns {string} 插件配置页面的 URL
 */
export function getPluginUrl(name) {
    return 'configurationpage?name=' + encodeURIComponent(name);
}

/**
 * 获取配置资源的 URL
 * @param {string} name - 配置资源名称
 * @returns {string} 配置资源的完整 URL
 */
export function getConfigurationResourceUrl(name) {
    return ApiClient.getUrl('web/ConfigurationPage', {
        name: name
    });
}

/**
 * 导航到指定 URL
 * @param {string} url - 要导航到的 URL
 * @param {boolean} [preserveQueryString] - 是否将当前查询字符串附加到新 URL（可选）
 * @returns {Promise<any>} 导航 Promise
 */
export function navigate(url, preserveQueryString) {
    if (!url) {
        throw new Error('url cannot be null or empty');
    }

    const queryString = getLocationSearch();

    if (preserveQueryString && queryString) {
        url += queryString;
    }

    return appRouter.show(url);
}

/**
 * 处理插件配置更新结果
 * 隐藏加载动画并显示成功提示
 */
export function processPluginConfigurationUpdateResult() {
    loading.hide();
    toast(globalize.translate('SettingsSaved'));
}

/**
 * 处理服务器配置更新结果
 * 隐藏加载动画并显示成功提示
 */
export function processServerConfigurationUpdateResult() {
    loading.hide();
    toast(globalize.translate('SettingsSaved'));
}

/**
 * 处理错误响应
 * 隐藏加载动画并显示错误提示对话框
 * @param {Response} response - HTTP 响应对象
 */
export function processErrorResponse(response) {
    loading.hide();

    let status = '' + response.status;

    if (response.statusText) {
        status = response.statusText;
    }

    baseAlert({
        title: status,
        text: response.headers ? response.headers.get('X-Application-Error-Code') : null
    });
}

/**
 * 显示警告/提示对话框
 * @param {string|Object} options - 字符串消息或配置对象
 * @param {string} [options.title] - 对话框标题
 * @param {string} [options.message] - 对话框消息内容
 * @param {Function} [options.callback] - 关闭对话框后的回调函数
 */
export function alert(options) {
    if (typeof options == 'string') {
        toast({
            text: options
        });
    } else {
        baseAlert({
            title: options.title || globalize.translate('HeaderAlert'),
            text: options.message
        }).then(options.callback || function () { /* no-op */ });
    }
}

/**
 * 获取客户端能力信息
 * 返回客户端支持的媒体类型、命令和其他功能
 * @param {Object} host - 应用主机对象
 * @returns {Object} 客户端能力配置对象
 */
export function capabilities(host) {
    return Object.assign({
        PlayableMediaTypes: ['Audio', 'Video'], // 可播放的媒体类型
        SupportedCommands: ['MoveUp', 'MoveDown', 'MoveLeft', 'MoveRight', 'PageUp', 'PageDown', 'PreviousLetter', 'NextLetter', 'ToggleOsd', 'ToggleContextMenu', 'Select', 'Back', 'SendKey', 'SendString', 'GoHome', 'GoToSettings', 'VolumeUp', 'VolumeDown', 'Mute', 'Unmute', 'ToggleMute', 'SetVolume', 'SetAudioStreamIndex', 'SetSubtitleStreamIndex', 'DisplayContent', 'GoToSearch', 'DisplayMessage', 'SetRepeatMode', 'SetShuffleQueue', 'ChannelUp', 'ChannelDown', 'PlayMediaSource', 'PlayTrailers'], // 支持的命令列表
        SupportsPersistentIdentifier: window.appMode === 'cordova' || window.appMode === 'android', // 是否支持持久化标识符
        SupportsMediaControl: true // 是否支持媒体控制
    }, host.getPushTokenInfo());
}

/**
 * 选择服务器
 * 如果是原生应用则调用原生方法，否则导航到服务器选择页面
 */
export function selectServer() {
    if (window.NativeShell && typeof window.NativeShell.selectServer === 'function') {
        window.NativeShell.selectServer();
    } else {
        navigate('selectserver');
    }
}

/**
 * 隐藏加载提示
 */
export function hideLoadingMsg() {
    loading.hide();
}

/**
 * 显示加载提示
 */
export function showLoadingMsg() {
    loading.show();
}

/**
 * 显示确认对话框
 * @param {string} message - 确认消息内容
 * @param {string} title - 对话框标题
 * @param {Function} callback - 回调函数，参数为 true（确认）或 false（取消）
 */
export function confirm(message, title, callback) {
    baseConfirm(message, title).then(function() {
        callback(true);
    }).catch(function() {
        callback(false);
    });
}

/**
 * 为具有指定 class 的页面元素添加事件监听器
 * @param {string} eventName - 事件名称
 * @param {string} className - CSS 类名
 * @param {Function} fn - 事件处理函数
 */
export const pageClassOn = function(eventName, className, fn) {
    document.addEventListener(eventName, function (event) {
        const target = event.target;

        if (target.classList.contains(className)) {
            fn.call(target, event);
        }
    });
};

/**
 * 为具有指定 ID 的页面元素添加事件监听器
 * @param {string} eventName - 事件名称
 * @param {string} id - 元素 ID
 * @param {Function} fn - 事件处理函数
 */
export const pageIdOn = function(eventName, id, fn) {
    document.addEventListener(eventName, function (event) {
        const target = event.target;

        if (target.id === id) {
            fn.call(target, event);
        }
    });
};

/**
 * Dashboard 对象
 * 导出所有仪表板相关功能的集合
 */
const Dashboard = {
    alert,
    capabilities,
    confirm,
    getPluginUrl,
    getConfigurationResourceUrl,
    getCurrentUser,
    getCurrentUserId,
    hideLoadingMsg,
    logout,
    navigate,
    onServerChanged,
    processErrorResponse,
    processPluginConfigurationUpdateResult,
    processServerConfigurationUpdateResult,
    selectServer,
    serverAddress,
    showLoadingMsg,
    datetime,
    DirectoryBrowser,
    dialogHelper,
    itemIdentifier,
    setBackdropTransparency
};

// 此对象在插件和模板中使用，因此暂时保留
// TODO: 一旦插件不再需要，就移除此定义
window.Dashboard = Dashboard;

export default Dashboard;
