/**
 * ConnectionManager.js
 * 连接管理器模块
 *
 * 该模块负责管理 Jellyfin 客户端与服务器之间的连接，
 * 包括服务器发现、连接建立、认证验证、会话管理等核心功能。
 */

// 从 Jellyfin SDK 导入授权头常量和工具函数
import { AUTHORIZATION_HEADER } from '@jellyfin/sdk/lib/api';
import { getAuthorizationHeader } from '@jellyfin/sdk/lib/utils';
import { MINIMUM_VERSION } from '@jellyfin/sdk/lib/versions'; // 最低支持的服务器版本
import { ApiClient } from 'jellyfin-apiclient'; // API 客户端类

import events from 'utils/events'; // 事件处理工具
import { ajax } from 'utils/fetch'; // AJAX 请求工具
import { equalsIgnoreCase } from 'utils/string'; // 字符串比较工具

import { ConnectionMode } from './connectionMode'; // 连接模式枚举
import { ConnectionState } from './connectionState'; // 连接状态枚举
import { compareVersions } from './utils/compareVersions'; // 版本比较工具

// 默认连接超时时间（毫秒）
const DEFAULT_CONNECTION_TIMEOUT = 20000;

/**
 * 根据连接模式获取服务器地址
 * @param {Object} server - 服务器信息对象
 * @param {ConnectionMode} mode - 连接模式（本地/手动/远程）
 * @returns {string} 服务器地址
 */
function getServerAddress(server, mode) {
    switch (mode) {
        case ConnectionMode.Local:
            return server.LocalAddress; // 本地地址
        case ConnectionMode.Manual:
            return server.ManualAddress; // 手动配置的地址
        case ConnectionMode.Remote:
            return server.RemoteAddress; // 远程地址
        default:
            // 按优先级返回可用地址
            return server.ManualAddress || server.LocalAddress || server.RemoteAddress;
    }
}

/**
 * 更新服务器信息
 * 从系统信息中提取并更新服务器的基本属性
 * @param {Object} server - 服务器对象
 * @param {Object} systemInfo - 系统信息对象
 */
function updateServerInfo(server, systemInfo) {
    server.Name = systemInfo.ServerName; // 更新服务器名称

    if (systemInfo.Id) {
        server.Id = systemInfo.Id; // 更新服务器 ID
    }

    if (systemInfo.LocalAddress) {
        server.LocalAddress = systemInfo.LocalAddress; // 更新本地地址
    }
}

/**
 * 规范化地址格式
 * 修正常见的地址输入错误，确保协议为小写
 * @param {string} address - 原始地址
 * @returns {string} 规范化后的地址
 */
function normalizeAddress(address) {
    // 尝试修正错误输入
    address = address.trim(); // 去除首尾空格

    // iOS 中协议必须为小写，否则会出现连接失败
    address = address.replace('Http:', 'http:');
    address = address.replace('Https:', 'https:');

    return address;
}

/**
 * ConnectionManager 类
 * 连接管理器，负责管理所有服务器连接和 API 客户端实例
 */
export default class ConnectionManager {
    /**
     * 构造函数
     * @param {Object} credentialProvider - 凭据提供者，用于管理用户认证信息
     * @param {string} appName - 应用名称
     * @param {string} appVersion - 应用版本
     * @param {string} deviceName - 设备名称
     * @param {string} deviceId - 设备唯一标识符
     * @param {Object} capabilities - 设备能力配置
     */
    constructor(credentialProvider, appName, appVersion, deviceName, deviceId, capabilities) {
        console.log('Begin ConnectionManager constructor');

        const self = this;
        this._apiClients = []; // API 客户端实例数组

        // 设置最低支持的服务器版本，与 SDK 保持一致
        self._minServerVersion = MINIMUM_VERSION;

        // 获取应用版本
        self.appVersion = () => appVersion;

        // 获取应用名称
        self.appName = () => appName;

        // 获取设备能力
        self.capabilities = () => capabilities;

        // 获取设备 ID
        self.deviceId = () => deviceId;

        // 获取凭据提供者
        self.credentialProvider = () => credentialProvider;

        /**
         * 根据 ID 获取服务器信息
         * @param {string} id - 服务器 ID
         * @returns {Object|undefined} 服务器信息对象
         */
        self.getServerInfo = (id) => {
            const servers = credentialProvider.credentials().Servers;

            return servers.filter((s) => s.Id === id)[0];
        };

        /**
         * 获取最近使用的服务器
         * 根据最后访问时间排序，返回最近访问的服务器
         * @returns {Object|null} 最近使用的服务器信息，如果没有则返回 null
         */
        self.getLastUsedServer = () => {
            const servers = credentialProvider.credentials().Servers;

            // 按最后访问时间降序排序
            servers.sort((a, b) => (b.DateLastAccessed || 0) - (a.DateLastAccessed || 0));

            if (!servers.length) {
                return null;
            }

            return servers[0];
        };

        /**
         * 添加 API 客户端
         * 将新的 API 客户端添加到管理器，并更新服务器信息
         * @param {ApiClient} apiClient - 要添加的 API 客户端实例
         */
        self.addApiClient = (apiClient) => {
            self._apiClients.push(apiClient);

            // 查找是否已经存在相同地址的服务器
            const existingServers = credentialProvider
                .credentials()
                .Servers.filter(
                    (s) =>
                        equalsIgnoreCase(s.ManualAddress, apiClient.serverAddress())
                        || equalsIgnoreCase(s.LocalAddress, apiClient.serverAddress())
                        || equalsIgnoreCase(s.RemoteAddress, apiClient.serverAddress())
                );

            const existingServer = existingServers.length ? existingServers[0] : apiClient.serverInfo();
            existingServer.DateLastAccessed = new Date().getTime(); // 更新最后访问时间
            existingServer.LastConnectionMode = ConnectionMode.Manual; // 设置连接模式
            existingServer.ManualAddress = apiClient.serverAddress(); // 设置手动地址

            if (apiClient.manualAddressOnly) {
                existingServer.manualAddressOnly = true; // 标记仅使用手动地址
            }

            apiClient.serverInfo(existingServer);

            // 设置认证回调
            apiClient.onAuthenticated = (instance, result) => onAuthenticated(instance, result, {}, true);

            // 如果是新服务器，添加到凭据存储中
            if (!existingServers.length) {
                const credentials = credentialProvider.credentials();
                credentials.Servers = [existingServer];
                credentialProvider.credentials(credentials);
            }

            // 触发 API 客户端创建事件
            events.trigger(self, 'apiclientcreated', [apiClient]);
        };

        /**
         * 清除所有连接数据
         * 清除所有保存的服务器信息和凭据
         */
        self.clearData = () => {
            console.log('connection manager clearing data');

            const credentials = credentialProvider.credentials();
            credentials.Servers = []; // 清空服务器列表
            credentialProvider.credentials(credentials);
        };

        /**
         * 获取或添加 API 客户端
         * 如果已存在则返回，否则创建新的 API 客户端实例
         * @param {Object} server - 服务器信息对象
         * @param {string} serverUrl - 服务器 URL
         * @returns {ApiClient} API 客户端实例
         */
        self._getOrAddApiClient = (server, serverUrl) => {
            let apiClient = self.getApiClient(server.Id);

            // 如果不存在，创建新的 API 客户端
            if (!apiClient) {
                apiClient = new ApiClient(serverUrl, appName, appVersion, deviceName, deviceId);

                self._apiClients.push(apiClient);

                apiClient.serverInfo(server);

                // 设置认证回调
                apiClient.onAuthenticated = (instance, result) => {
                    return onAuthenticated(instance, result, {}, true);
                };

                // 触发创建事件
                events.trigger(self, 'apiclientcreated', [apiClient]);
            }

            console.log('returning instance from getOrAddApiClient');
            return apiClient;
        };

        /**
         * 根据服务器 ID 获取或创建 API 客户端
         * @param {string} serverId - 服务器 ID
         * @returns {ApiClient} API 客户端实例
         * @throws {Error} 当找不到服务器时抛出错误
         */
        self.getOrCreateApiClient = (serverId) => {
            const credentials = credentialProvider.credentials();
            const servers = credentials.Servers.filter((s) => equalsIgnoreCase(s.Id, serverId));

            if (!servers.length) {
                throw new Error(`Server not found: ${serverId}`);
            }

            const server = servers[0];

            return self._getOrAddApiClient(server, getServerAddress(server, server.LastConnectionMode));
        };

        /**
         * 认证成功回调函数
         * 处理用户认证成功后的逻辑，更新服务器信息和凭据
         * @param {ApiClient} apiClient - API 客户端实例
         * @param {Object} result - 认证结果对象
         * @param {Object} options - 选项配置
         * @param {boolean} saveCredentials - 是否保存凭据
         * @returns {Promise} 认证处理结果
         */
        function onAuthenticated(apiClient, result, options, saveCredentials) {
            const credentials = credentialProvider.credentials();
            const servers = credentials.Servers.filter((s) => s.Id === result.ServerId);

            const server = servers.length ? servers[0] : apiClient.serverInfo();

            if (options.updateDateLastAccessed !== false) {
                server.DateLastAccessed = new Date().getTime(); // 更新最后访问时间
            }
            server.Id = result.ServerId;

            if (saveCredentials) {
                // 保存用户信息和访问令牌
                server.UserId = result.User.Id;
                server.AccessToken = result.AccessToken;
            } else {
                // 清除凭据
                server.UserId = null;
                server.AccessToken = null;
            }

            credentialProvider.addOrUpdateServer(credentials.Servers, server);
            credentialProvider.credentials(credentials);

            // 在更新服务器信息之前设置，否则不会及时生效
            apiClient.enableAutomaticBitrateDetection = options.enableAutomaticBitrateDetection;

            apiClient.serverInfo(server);
            apiClient.setAuthenticationInfo(result.AccessToken, result.User.Id);
            afterConnected(apiClient, options);

            return onLocalUserSignIn(server, apiClient.serverAddress(), result.User);
        }

        /**
         * 连接成功后的处理
         * 配置 API 客户端的后续设置，如报告能力和启用 WebSocket
         * @param {ApiClient} apiClient - API 客户端实例
         * @param {Object} options - 配置选项
         */
        function afterConnected(apiClient, options = {}) {
            if (options.reportCapabilities !== false) {
                apiClient.reportCapabilities(capabilities); // 报告设备能力
            }
            apiClient.enableAutomaticBitrateDetection = options.enableAutomaticBitrateDetection;

            if (options.enableWebSocket !== false) {
                console.log('calling apiClient.ensureWebSocket');

                apiClient.ensureWebSocket(); // 启用 WebSocket 连接
            }
        }

        /**
         * 本地用户登入处理
         * 处理用户登入事件，触发相关事件监听器
         * @param {Object} server - 服务器信息
         * @param {string} serverUrl - 服务器 URL
         * @param {Object} user - 用户信息
         * @returns {Promise} 登入处理结果
         */
        function onLocalUserSignIn(server, serverUrl, user) {
            // 确保创建 API 客户端，以便事件监听器可以获取实例
            self._getOrAddApiClient(server, serverUrl);

            // 允许应用有一个单一的钩子在其他事件之前触发
            const promise = self.onLocalUserSignedIn ? self.onLocalUserSignedIn.call(self, user) : Promise.resolve();

            return promise.then(() => {
                events.trigger(self, 'localusersignedin', [user]); // 触发用户登入事件
            });
        }

        /**
         * 验证认证信息
         * 通过请求系统信息来验证访问令牌是否有效
         * @param {Object} server - 服务器信息
         * @param {string} serverUrl - 服务器 URL
         * @returns {Promise} 验证结果
         */
        function validateAuthentication(server, serverUrl) {
            return ajax({
                type: 'GET',
                url: `${serverUrl}/System/Info`,
                dataType: 'json',
                headers: {
                    [AUTHORIZATION_HEADER]: getAuthorizationHeader(
                        {
                            name: appName,
                            version: appVersion
                        },
                        {
                            id: deviceId,
                            name: deviceName
                        },
                        server.AccessToken
                    )
                }
            }).then(
                (systemInfo) => {
                    updateServerInfo(server, systemInfo); // 更新服务器信息
                    return Promise.resolve();
                },
                () => {
                    // 验证失败，清除凭据
                    server.UserId = null;
                    server.AccessToken = null;
                    return Promise.resolve();
                }
            );
        }

        /**
         * 获取用户头像 URL
         * @param {Object} localUser - 本地用户信息
         * @returns {Object} 包含 URL 和支持参数标志的对象
         */
        function getImageUrl(localUser) {
            if (localUser && localUser.PrimaryImageTag) {
                const apiClient = self.getApiClient(localUser);

                const url = apiClient.getUserImageUrl(localUser.Id, {
                    tag: localUser.PrimaryImageTag,
                    type: 'Primary'
                });

                return {
                    url,
                    supportsParams: true // 支持参数
                };
            }

            return {
                url: null,
                supportsParams: false
            };
        }

        /**
         * 获取当前用户信息
         * @param {ApiClient} apiClient - API 客户端实例
         * @returns {Promise} 用户信息 Promise
         */
        self.user = (apiClient) =>
            new Promise((resolve) => {
                let localUser;

                function onLocalUserDone() {
                    if (apiClient && apiClient.getCurrentUserId()) {
                        // 获取当前用户信息
                        apiClient.getCurrentUser().then((u) => {
                            localUser = u;
                            const image = getImageUrl(localUser);

                            resolve({
                                localUser,
                                name: localUser ? localUser.Name : null,
                                imageUrl: image.url,
                                supportsImageParams: image.supportsParams
                            });
                        });
                    }
                }

                if (apiClient && apiClient.getCurrentUserId()) {
                    onLocalUserDone();
                }
            });

        /**
         * 登出所有服务器
         * 清除所有服务器的访问令牌和用户信息
         * @returns {Promise} 登出结果
         */
        self.logout = () => {
            const promises = [];

            // 登出所有已认证的 API 客户端
            for (let i = 0, length = self._apiClients.length; i < length; i++) {
                const apiClient = self._apiClients[i];

                if (apiClient.accessToken()) {
                    promises.push(logoutOfServer(apiClient));
                }
            }

            return Promise.all(promises).then(() => {
                const credentials = credentialProvider.credentials();

                // 过滤掉访客类型的服务器
                const servers = credentials.Servers.filter((u) => u.UserLinkType !== 'Guest');

                // 清除所有服务器的认证信息
                for (let j = 0, numServers = servers.length; j < numServers; j++) {
                    const server = servers[j];

                    server.UserId = null;
                    server.AccessToken = null;
                    server.ExchangeToken = null;
                }
            });
        };

        /**
         * 从单个服务器登出
         * @param {ApiClient} apiClient - API 客户端实例
         * @returns {Promise} 登出结果
         */
        function logoutOfServer(apiClient) {
            const serverInfo = apiClient.serverInfo() || {};

            const logoutInfo = {
                serverId: serverInfo.Id
            };

            return apiClient.logout().then(
                () => {
                    // 登出成功，触发事件
                    events.trigger(self, 'localusersignedout', [logoutInfo]);
                },
                () => {
                    // 登出失败，仍然触发事件
                    events.trigger(self, 'localusersignedout', [logoutInfo]);
                }
            );
        }

        /**
         * 获取保存的服务器列表
         * 按最后访问时间排序
         * @returns {Array} 服务器列表
         */
        self.getSavedServers = () => {
            const credentials = credentialProvider.credentials();

            const servers = credentials.Servers.slice(0); // 克隆数组

            // 按最后访问时间降序排序
            servers.sort((a, b) => (b.DateLastAccessed || 0) - (a.DateLastAccessed || 0));

            return servers;
        };

        /**
         * 获取可用服务器列表
         * 包括保存的服务器和发现的新服务器
         * @returns {Promise<Array>} 服务器列表 Promise
         */
        self.getAvailableServers = () => {
            console.log('Begin getAvailableServers');

            // 克隆数组
            const credentials = credentialProvider.credentials();

            return Promise.all([findServers()]).then((responses) => {
                const foundServers = responses[0];
                const servers = credentials.Servers.slice(0);
                // 将新发现的服务器添加或更新到列表中
                foundServers.forEach(server => {
                    credentialProvider.addOrUpdateServer(servers, server);
                });

                // 按最后访问时间排序
                servers.sort((a, b) => (b.DateLastAccessed || 0) - (a.DateLastAccessed || 0));
                credentials.Servers = servers;
                credentialProvider.credentials(credentials);

                return servers;
            });
        };

        /**
         * 发现本地网络中的服务器
         * 使用原生 Shell 接口进行服务器发现
         * @returns {Promise<Array>} 发现的服务器列表
         */
        function findServers() {
            return new Promise((resolve) => {
                const onFinish = function (foundServers) {
                    // 将发现的服务器转换为标准格式
                    const servers = foundServers.map((foundServer) => {
                        const info = {
                            Id: foundServer.Id,
                            LocalAddress: convertEndpointAddressToManualAddress(foundServer) || foundServer.Address,
                            Name: foundServer.Name
                        };
                        info.LastConnectionMode = info.ManualAddress ? ConnectionMode.Manual : ConnectionMode.Local;
                        return info;
                    });
                    resolve(servers);
                };

                // 如果原生 Shell 支持服务器发现，则调用
                if (window && window.NativeShell && typeof window.NativeShell.findServers === 'function') {
                    window.NativeShell.findServers(1e3).then(onFinish, function () {
                        onFinish([]);
                    });
                } else {
                    resolve([]);
                }
            });
        }

        /**
         * 将端点地址转换为手动地址格式
         * @param {Object} info - 服务器信息对象
         * @returns {string|null} 转换后的地址或 null
         */
        function convertEndpointAddressToManualAddress(info) {
            if (info.Address && info.EndpointAddress) {
                // 提取 IP 地址部分
                let address = info.EndpointAddress.split(':')[0];

                // 判断是否有端口
                const parts = info.Address.split(':');
                if (parts.length > 1) {
                    const portString = parts[parts.length - 1];

                    if (!isNaN(parseInt(portString, 10))) {
                        address += `:${portString}`; // 添加端口
                    }
                }

                return normalizeAddress(address);
            }

            return null;
        }

        /**
         * 连接到多个服务器
         * 尝试连接到第一个可用的服务器
         * @param {Array} servers - 服务器列表
         * @param {Object} options - 连接选项
         * @returns {Promise} 连接结果
         */
        self.connectToServers = (servers, options) => {
            console.log(`Begin connectToServers, with ${servers.length} servers`);

            const firstServer = servers.length ? servers[0] : null;
            // 尝试使用保存的凭据自动登录
            if (firstServer) {
                return self.connectToServer(firstServer, options).then((result) => {
                    console.log('resolving connectToServers with result.State: ' + result.State);
                    return result;
                });
            }

            return Promise.resolve({
                Servers: servers,
                State: ConnectionState.ServerSelection // 需要选择服务器
            });
        };

        /**
         * 获取尝试连接的 Promise
         * 向指定 URL 发起连接请求
         * @param {string} url - 服务器 URL
         * @param {ConnectionMode} connectionMode - 连接模式
         * @param {Object} state - 连接状态对象
         * @param {Function} resolve - Promise resolve 函数
         * @param {Function} reject - Promise reject 函数
         */
        function getTryConnectPromise(url, connectionMode, state, resolve, reject) {
            console.log('getTryConnectPromise ' + url);

            ajax({
                url: `${url}/System/Info/Public`,
                timeout: DEFAULT_CONNECTION_TIMEOUT,
                type: 'GET',
                dataType: 'json'
            }).then(
                (result) => {
                    if (!state.resolved) {
                        state.resolved = true;

                        console.log('Reconnect succeeded to ' + url);
                        resolve({
                            url: url,
                            connectionMode: connectionMode,
                            data: result
                        });
                    }
                },
                () => {
                    console.log('Reconnect failed to ' + url);

                    if (!state.resolved) {
                        state.rejects++;
                        // 如果所有地址都尝试失败，则拒绝 Promise
                        if (state.rejects >= state.numAddresses) {
                            reject();
                        }
                    }
                }
            );
        }

        /**
         * 尝试重新连接服务器
         * 尝试所有可用的地址（本地、手动、远程）
         * @param {Object} serverInfo - 服务器信息
         * @returns {Promise} 连接结果
         */
        function tryReconnect(serverInfo) {
            const addresses = [];
            const addressesStrings = [];

            // 超时设置是一个小技巧，以确保远程地址不会首先解析

            // manualAddressOnly 用于始终连接到固定地址的本地 Web 应用
            if (
                !serverInfo.manualAddressOnly
                && serverInfo.LocalAddress
                && addressesStrings.indexOf(serverInfo.LocalAddress) === -1
            ) {
                addresses.push({
                    url: serverInfo.LocalAddress,
                    mode: ConnectionMode.Local,
                    timeout: 0 // 本地地址优先级最高，无超时
                });
                addressesStrings.push(addresses[addresses.length - 1].url);
            }
            if (serverInfo.ManualAddress && addressesStrings.indexOf(serverInfo.ManualAddress) === -1) {
                addresses.push({
                    url: serverInfo.ManualAddress,
                    mode: ConnectionMode.Manual,
                    timeout: 100 // 手动地址延迟 100ms
                });
                addressesStrings.push(addresses[addresses.length - 1].url);
            }
            if (
                !serverInfo.manualAddressOnly
                && serverInfo.RemoteAddress
                && addressesStrings.indexOf(serverInfo.RemoteAddress) === -1
            ) {
                addresses.push({
                    url: serverInfo.RemoteAddress,
                    mode: ConnectionMode.Remote,
                    timeout: 200 // 远程地址延迟 200ms
                });
                addressesStrings.push(addresses[addresses.length - 1].url);
            }

            console.log('tryReconnect: ' + addressesStrings.join('|'));

            return new Promise((resolve, reject) => {
                const state = {};
                state.numAddresses = addresses.length;
                state.rejects = 0;

                // 按设定的超时尝试每个地址
                addresses.forEach((url) => {
                    setTimeout(() => {
                        if (!state.resolved) {
                            getTryConnectPromise(url.url, url.mode, state, resolve, reject);
                        }
                    }, url.timeout);
                });
            });
        }

        /**
         * 连接到服务器
         * @param {Object} server - 服务器信息
         * @param {Object} options - 连接选项
         * @returns {Promise} 连接结果
         */
        self.connectToServer = (server, options) => {
            console.log('begin connectToServer');

            return new Promise((resolve) => {
                options = options || {};

                tryReconnect(server).then(
                    (result) => {
                        const serverUrl = result.url;
                        const connectionMode = result.connectionMode;
                        result = result.data;

                        // 检查服务器版本是否满足最低要求
                        if (compareVersions(self.minServerVersion(), result.Version) === 1) {
                            console.log('minServerVersion requirement not met. Server version: ' + result.Version);
                            resolve({
                                State: ConnectionState.ServerUpdateNeeded,
                                Servers: [server]
                            });
                        } else if (server.Id && result.Id !== server.Id) {
                            // 检查服务器 ID 是否匹配
                            console.log(
                                'http request succeeded, but found a different server Id than what was expected'
                            );
                            resolve({
                                State: ConnectionState.Unavailable
                            });
                        } else {
                            // 连接成功
                            onSuccessfulConnection(server, result, connectionMode, serverUrl, true, resolve, options);
                        }
                    },
                    () => {
                        // 连接失败
                        resolve({
                            State: ConnectionState.Unavailable
                        });
                    }
                );
            });
        };

        /**
         * 连接成功后的处理
         * @param {Object} server - 服务器信息
         * @param {Object} systemInfo - 系统信息
         * @param {ConnectionMode} connectionMode - 连接模式
         * @param {string} serverUrl - 服务器 URL
         * @param {boolean} verifyLocalAuthentication - 是否验证本地认证
         * @param {Function} resolve - Promise resolve 函数
         * @param {Object} options - 选项
         */
        function onSuccessfulConnection(server, systemInfo, connectionMode, serverUrl, verifyLocalAuthentication, resolve, options = {}) {
            const credentials = credentialProvider.credentials();

            if (options.enableAutoLogin === false) {
                // 禁用自动登录，清除凭据
                server.UserId = null;
                server.AccessToken = null;
            } else if (server.AccessToken && verifyLocalAuthentication) {
                // 验证本地认证
                void validateAuthentication(server, serverUrl).then(function () {
                    onSuccessfulConnection(server, systemInfo, connectionMode, serverUrl, false, resolve, options);
                });
                return;
            }

            updateServerInfo(server, systemInfo);

            server.LastConnectionMode = connectionMode;

            if (options.updateDateLastAccessed !== false) {
                server.DateLastAccessed = new Date().getTime(); // 更新最后访问时间
            }
            credentialProvider.addOrUpdateServer(credentials.Servers, server);
            credentialProvider.credentials(credentials);

            const result = {
                Servers: []
            };

            result.ApiClient = self._getOrAddApiClient(server, serverUrl);

            result.ApiClient.setSystemInfo(systemInfo);
            result.SystemInfo = systemInfo;

            // 根据是否有访问令牌决定连接状态
            result.State = server.AccessToken && options.enableAutoLogin !== false ? ConnectionState.SignedIn : ConnectionState.ServerSignIn;

            result.Servers.push(server);

            // 在更新服务器信息之前设置，否则不会及时生效
            result.ApiClient.enableAutomaticBitrateDetection = options.enableAutomaticBitrateDetection;

            result.ApiClient.updateServerInfo(server, serverUrl);
            result.ApiClient.setAuthenticationInfo(server.AccessToken, server.UserId);

            const resolveActions = function () {
                resolve(result);

                events.trigger(self, 'connected', [result]); // 触发连接成功事件
            };

            if (result.State === ConnectionState.SignedIn) {
                // 已登录状态，获取当前用户信息
                afterConnected(result.ApiClient, options);

                result.ApiClient.getCurrentUser().then((user) => {
                    onLocalUserSignIn(server, serverUrl, user).then(resolveActions, resolveActions);
                }, resolveActions);
            } else {
                // 需要登录
                resolveActions();
            }
        }

        /**
         * 尝试连接到指定地址
         * @param {string} address - 服务器地址
         * @param {Object} options - 连接选项
         * @returns {Promise} 连接结果
         */
        function tryConnectToAddress(address, options) {
            const server = {
                ManualAddress: address,
                LastConnectionMode: ConnectionMode.Manual
            };

            return self.connectToServer(server, options).then((result) => {
                // connectToServer 从不拒绝，但会解析为 State=ConnectionState.Unavailable
                if (result.State === ConnectionState.Unavailable) {
                    return Promise.reject();
                }
                return result;
            });
        }

        /**
         * 连接到指定地址
         * 尝试使用 HTTPS 和 HTTP 连接
         * @param {string} address - 服务器地址
         * @param {Object} options - 连接选项
         * @returns {Promise} 连接结果
         */
        self.connectToAddress = function (address, options) {
            if (!address) {
                return Promise.reject();
            }

            address = normalizeAddress(address);

            const urls = [];

            if (/^[^:]+:\/\//.test(address)) {
                // 已指定协议 - 按原样连接
                urls.push(address);
            } else {
                // 没有协议，先尝试 HTTPS，再尝试 HTTP
                urls.push(`https://${address}`);
                urls.push(`http://${address}`);
            }

            let i = 0;

            function onFail() {
                console.log(`connectToAddress ${urls[i]} failed`);

                if (++i < urls.length) {
                    // 尝试下一个 URL
                    return tryConnectToAddress(urls[i], options).catch(onFail);
                }

                return Promise.resolve({
                    State: ConnectionState.Unavailable
                });
            }

            return tryConnectToAddress(urls[i], options).catch(onFail);
        };

        /**
         * 删除服务器
         * 从凭据存储中移除指定的服务器
         * @param {string} serverId - 服务器 ID
         * @returns {Promise} 删除结果
         */
        self.deleteServer = (serverId) => {
            if (!serverId) {
                throw new Error('null serverId');
            }

            let server = credentialProvider.credentials().Servers.filter((s) => s.Id === serverId);
            server = server.length ? server[0] : null;

            return new Promise((resolve) => {
                function onDone() {
                    const credentials = credentialProvider.credentials();

                    // 从列表中移除服务器
                    credentials.Servers = credentials.Servers.filter((s) => s.Id !== serverId);

                    credentialProvider.credentials(credentials);
                    resolve();
                }

                if (!server.ConnectServerId) {
                    onDone();
                }
            });
        };
    }

    /**
     * 连接到可用服务器
     * 获取可用服务器列表并尝试连接
     * @param {Object} options - 连接选项
     * @returns {Promise} 连接结果
     */
    connect(options) {
        console.log('Begin connect');

        return this.getAvailableServers().then((servers) => {
            return this.connectToServers(servers, options);
        });
    }

    /**
     * 处理接收到的消息
     * 将消息路由到对应的 API 客户端
     * @param {Object} msg - 消息对象
     */
    handleMessageReceived(msg) {
        const serverId = msg.ServerId;
        if (serverId) {
            const apiClient = this.getApiClient(serverId);
            if (apiClient) {
                // 尝试解析 JSON 数据
                if (typeof msg.Data === 'string') {
                    try {
                        msg.Data = JSON.parse(msg.Data);
                    } catch (err) {
                        console.log('unable to parse json content: ' + err);
                    }
                }

                // 将消息传递给 API 客户端处理
                apiClient.handleMessageReceived(msg);
            }
        }
    }

    /**
     * 获取所有 API 客户端实例
     * 为所有保存的服务器创建 API 客户端
     * @returns {Array<ApiClient>} API 客户端数组
     */
    getApiClients() {
        const servers = this.getSavedServers();

        // 为每个服务器创建 API 客户端
        for (let i = 0, length = servers.length; i < length; i++) {
            const server = servers[i];
            if (server.Id) {
                this._getOrAddApiClient(server, getServerAddress(server, server.LastConnectionMode));
            }
        }

        return this._apiClients;
    }

    /**
     * 获取 API 客户端
     * 根据 BaseItem 或 ServerId 获取对应的 API 客户端
     * @param {import('@jellyfin/sdk/lib/generated-client').BaseItemDto | string | undefined} item - 项目对象或服务器 ID
     * @returns {ApiClient} API 客户端实例
     */
    getApiClient(item) {
        if (!item) {
            throw new Error('item or serverId cannot be null');
        }

        // 接受字符串和对象
        if (item.ServerId) {
            item = item.ServerId;
        }

        return this._apiClients.filter((a) => {
            const serverInfo = a.serverInfo();

            // 由于 addApiClient 方法，必须保留此判断
            return !serverInfo || serverInfo.Id === item;
        })[0];
    }

    /**
     * 获取或设置最低服务器版本
     * @param {string} [val] - 要设置的版本号，可选
     * @returns {string} 当前最低服务器版本
     */
    minServerVersion(val) {
        if (val) {
            this._minServerVersion = val;
        }

        return this._minServerVersion;
    }
}
