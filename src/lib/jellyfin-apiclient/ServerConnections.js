/**
 * ServerConnections.js
 * 服务器连接管理模块
 *
 * 该模块负责管理 Jellyfin 客户端与服务器之间的连接,
 * 包括 API 客户端的创建、用户登录/登出处理、连接管理等核心功能。
 */

// NOTE: This is used for jsdoc return type
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Api } from '@jellyfin/sdk';
import { Credentials, ApiClient } from 'jellyfin-apiclient';

import { appHost } from 'components/apphost';
import appSettings from 'scripts/settings/appSettings';
import { setUserInfo } from 'scripts/settings/userSettings';
import Dashboard from 'utils/dashboard';
import Events from 'utils/events.ts';
import { toApi } from 'utils/jellyfin-apiclient/compat';

import ConnectionManager from './connectionManager';

/**
 * 标准化图片选项
 * 当指定了图片尺寸相关参数但未设置质量时,自动设置默认质量为 90
 * @param {Object} options - 图片选项对象
 */
const normalizeImageOptions = options => {
    if (!options.quality && (options.maxWidth || options.width || options.maxHeight || options.height || options.fillWidth || options.fillHeight)) {
        options.quality = 90;
    }
};

/**
 * 获取最大带宽
 * 使用 Network Information API 检测网络连接的最大下行速度
 * @returns {number|null} 计算后的最大带宽(bps),如果无法获取则返回 null
 */
const getMaxBandwidth = () => {
    if (navigator.connection) {
        let max = navigator.connection.downlinkMax;
        if (max && max > 0 && max < Number.POSITIVE_INFINITY) {
            max /= 8; // 转换为字节
            max *= 1000000; // 转换为比特每秒
            max *= 0.7; // 应用 70% 的安全系数
            return parseInt(max, 10);
        }
    }

    return null;
};

/**
 * ServerConnections 类
 * 继承自 ConnectionManager,用于管理与 Jellyfin 服务器的连接
 */
class ServerConnections extends ConnectionManager {
    /**
     * 构造函数
     * 初始化本地 API 客户端并设置事件监听器
     */
    constructor() {
        super(...arguments);
        this.localApiClient = null; // 本地 API 客户端实例
        this.firstConnection = null; // 首次连接标记

        // 监听本地用户登出事件
        Events.on(this, 'localusersignedout', (_e, logoutInfo) => {
            // 清除用户信息
            setUserInfo(null, null);
            // 确保更新后的凭据持久化到存储
            credentialProvider.credentials(credentialProvider.credentials());

            // 如果存在原生外壳,通知其用户已登出
            if (window.NativeShell && typeof window.NativeShell.onLocalUserSignedOut === 'function') {
                window.NativeShell.onLocalUserSignedOut(logoutInfo);
            }
        });

        // 监听 API 客户端创建事件
        Events.on(this, 'apiclientcreated', (_e, apiClient) => {
            // 为新创建的 API 客户端附加带宽和图片选项处理方法
            apiClient.getMaxBandwidth = getMaxBandwidth;
            apiClient.normalizeImageOptions = normalizeImageOptions;
        });
    }

    /**
     * 初始化 API 客户端
     * 创建一个新的 ApiClient 单例实例并配置其属性
     * @param {Object} server - 服务器信息对象
     */
    initApiClient(server) {
        console.debug('creating ApiClient singleton');

        // 使用应用和设备信息创建 API 客户端
        const apiClient = new ApiClient(
            server,
            appHost.appName(), // 应用名称
            appHost.appVersion(), // 应用版本
            appHost.deviceName(), // 设备名称
            appHost.deviceId() // 设备 ID
        );

        // 禁用自动网络配置,仅使用手动地址
        apiClient.enableAutomaticNetworking = false;
        apiClient.manualAddressOnly = true;

        // 将客户端添加到连接管理器
        this.addApiClient(apiClient);

        // 设置为本地 API 客户端
        this.setLocalApiClient(apiClient);

        console.debug('loaded ApiClient singleton');
    }

    /**
     * 连接到服务器
     * 覆盖父类的 connect 方法,添加自动登录配置
     * @param {Object} options - 连接选项
     * @returns {Promise} 连接结果
     */
    connect(options) {
        return super.connect({
            enableAutoLogin: appSettings.enableAutoLogin(), // 从应用设置获取自动登录配置
            ...options
        });
    }

    /**
     * 设置本地 API 客户端
     * 将指定的 API 客户端设为本地客户端,并暴露到全局 window 对象
     * @param {ApiClient} apiClient - API 客户端实例
     */
    setLocalApiClient(apiClient) {
        if (apiClient) {
            this.localApiClient = apiClient;
            window.ApiClient = apiClient; // 暴露到全局作用域供其他模块使用
        }
    }

    /**
     * 获取本地 API 客户端
     * @returns {ApiClient|null} 当前本地 API 客户端实例
     */
    getLocalApiClient() {
        return this.localApiClient;
    }

    /**
     * 获取当前连接的 API 客户端
     * 优先返回本地 API 客户端,如果不存在则尝试从最后使用的服务器获取
     * @returns {ApiClient|undefined} API 客户端实例,如果没有可用的客户端则返回 undefined
     */
    currentApiClient() {
        // 首先尝试获取本地 API 客户端
        let apiClient = this.getLocalApiClient();

        // 如果本地客户端不存在,尝试从最后使用的服务器获取
        if (!apiClient) {
            const server = this.getLastUsedServer();

            if (server) {
                apiClient = this.getApiClient(server.Id);
            }
        }

        return apiClient;
    }

    /**
     * 获取当前连接的 API 实例
     * 将 ApiClient 转换为 Jellyfin SDK 的 Api 格式
     * @returns {Api|undefined} 当前 API 实例,如果没有可用的客户端则返回 undefined
     */
    getCurrentApi() {
        const apiClient = this.currentApiClient();
        if (!apiClient) return;

        // 将 ApiClient 转换为 SDK 兼容的 Api 对象
        return toApi(apiClient);
    }

    /**
     * 异步获取当前连接的 API 客户端
     * 如果没有可用的 API 客户端,将抛出异常
     * @async
     * @returns {Promise<ApiClient>} 当前 API 客户端实例的 Promise
     * @throws {Error} 当没有可用的 API 客户端时抛出错误
     */
    async getCurrentApiClientAsync() {
        const apiClient = this.currentApiClient();
        if (!apiClient) throw new Error('[ServerConnection] No current ApiClient instance');

        return apiClient;
    }

    /**
     * 本地用户登录处理
     * 当用户成功登录时调用,设置用户信息并通知原生外壳
     * @param {Object} user - 用户对象,包含用户 ID 和服务器 ID 等信息
     * @returns {Promise} 登录处理结果的 Promise
     */
    onLocalUserSignedIn(user) {
        // 根据用户的服务器 ID 获取对应的 API 客户端
        const apiClient = this.getApiClient(user.ServerId);
        // 设置为本地 API 客户端
        this.setLocalApiClient(apiClient);
        // 保存用户信息
        return setUserInfo(user.Id, apiClient).then(() => {
            // 如果存在原生外壳,通知其用户已登录
            if (window.NativeShell && typeof window.NativeShell.onLocalUserSignedIn === 'function') {
                return window.NativeShell.onLocalUserSignedIn(user, apiClient.accessToken());
            }
            return Promise.resolve();
        });
    }
}

// 创建凭据提供者实例,用于管理用户认证凭据
const credentialProvider = new Credentials();

// 获取设备能力配置
const capabilities = Dashboard.capabilities(appHost);

// 导出 ServerConnections 单例实例
// 使用凭据提供者、应用信息、设备信息和能力配置进行初始化
export default new ServerConnections(
    credentialProvider, // 凭据提供者
    appHost.appName(), // 应用名称
    appHost.appVersion(), // 应用版本
    appHost.deviceName(), // 设备名称
    appHost.deviceId(), // 设备 ID
    capabilities); // 设备能力
