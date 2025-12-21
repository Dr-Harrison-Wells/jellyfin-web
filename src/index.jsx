// 导入旧版浏览器兼容性补丁
import 'lib/legacy';

// React 核心库
import React from 'react';
// React DOM 客户端渲染
import { createRoot } from 'react-dom/client';

// 注意：需要首先导入此模块以初始化连接
// Jellyfin API 客户端服务器连接管理
import { ServerConnections } from 'lib/jellyfin-apiclient';

// 应用主机功能
import { appHost } from './components/apphost';
// 自动聚焦管理器
import autoFocuser from './components/autoFocuser';
// 加载动画组件
import loading from 'components/loading/loading';
// 插件管理器
import { pluginManager } from './components/pluginManager';
// 应用路由器
import { appRouter } from './components/router/appRouter';
// 应用特性常量
import { AppFeature } from 'constants/appFeature';
// 全球化/国际化工具
import globalize from './lib/globalize';
// 核心字典加载器
import { loadCoreDictionary } from 'lib/globalize/loader';
// 自动投射初始化
import { initialize as initializeAutoCast } from 'scripts/autocast';
// 浏览器检测工具
import browser from './scripts/browser';
// 键盘导航功能
import keyboardNavigation from './scripts/keyboardNavigation';
// Web 设置中的插件获取
import { getPlugins } from './scripts/settings/webSettings';
// 任务按钮组件
import taskButton from './scripts/taskbutton';
// 仪表板工具函数
import { pageClassOn, serverAddress } from './utils/dashboard';
// 事件管理器
import Events from './utils/events';

// 根应用组件
import RootApp from './RootApp';

// 导入按钮 Web 组件以在整个站点中使用
// 注意：这是一个临时解决方案，文件应在使用前确保组件已导入
import './elements/emby-button/emby-button';

// 导入自动运行的组件
// 注意：这是一种反模式
// 显示镜像管理器
import './components/playback/displayMirrorManager';
// 播放器选择菜单
import './components/playback/playerSelectionMenu';
// 主题媒体播放器
import './components/themeMediaPlayer';
// 自动主题切换
import './scripts/autoThemes';
// 鼠标管理器
import './scripts/mouseManager';
// 屏幕保护程序管理器
import './scripts/screensavermanager';
// 服务器通知
import './scripts/serverNotifications';

// 导入站点样式
// 主站点样式
import './styles/site.scss';
// 直播电视样式
import './styles/livetv.scss';
// 仪表板样式
import './styles/dashboard.scss';
// 详情表格样式
import './styles/detailtable.scss';
// 媒体库浏览器样式
import './styles/librarybrowser.scss';

/**
 * 初始化应用程序
 * 负责启动整个 Jellyfin Web 应用，包括：
 * - 初始化 API 客户端连接
 * - 加载国际化资源
 * - 加载插件
 * - 建立 WebSocket 连接
 * - 渲染 React 应用
 */
async function init() {
    // 将当前版本记录到控制台，以帮助问题分类和调试
    console.info(
        `[${__PACKAGE_JSON_NAME__}]
version: ${__PACKAGE_JSON_VERSION__}
commit: ${__COMMIT_SHA__}
build: ${__JF_BUILD_VERSION__}`);

    // 注册插件中使用的全局变量
    window.Events = Events;
    window.TaskButton = taskButton;

    // 注册处理程序以更新头部类
    pageClassOn('viewshow', 'standalonePage', function () {
        document.querySelector('.skinHeader').classList.add('noHeaderRight');
    });
    pageClassOn('viewhide', 'standalonePage', function () {
        document.querySelector('.skinHeader').classList.remove('noHeaderRight');
    });

    // 初始化 API 客户端
    const serverUrl = await serverAddress();
    if (serverUrl) {
        // 使用服务器地址初始化 API 客户端连接
        ServerConnections.initApiClient(serverUrl);
    }

    // 初始化自动（默认）投射目标
    initializeAutoCast();

    // 加载翻译字典
    await loadCoreDictionary();
    // 在用户更改时更新本地化
    Events.on(ServerConnections, 'localusersignedin', globalize.updateCurrentCulture);
    Events.on(ServerConnections, 'localusersignedout', globalize.updateCurrentCulture);

    // 加载字体样式
    loadFonts();

    // 加载 iOS 特定样式
    if (browser.iOS) {
        import('./styles/ios.scss');
    }

    // 加载前端插件
    await loadPlugins();

    // 建立 WebSocket 连接
    Events.on(appHost, 'resume', () => {
        ServerConnections.currentApiClient()?.ensureWebSocket();
    });

    // 注册 API 请求错误处理程序
    ServerConnections.getApiClients().forEach(apiClient => {
        Events.off(apiClient, 'requestfail', appRouter.onRequestFail);
        Events.on(apiClient, 'requestfail', appRouter.onRequestFail);
    });
    Events.on(ServerConnections, 'apiclientcreated', (_e, apiClient) => {
        Events.off(apiClient, 'requestfail', appRouter.onRequestFail);
        Events.on(apiClient, 'requestfail', appRouter.onRequestFail);
    });

    // 渲染应用
    await renderApp();

    // 加载平台特定功能
    loadPlatformFeatures();

    // 启用导航控制
    keyboardNavigation.enable();
    autoFocuser.enable();
}

/**
 * 加载字体样式
 * 根据平台和配置决定使用系统字体还是自定义字体
 */
function loadFonts() {
    if (browser.tv && !browser.android) {
        console.debug('using system fonts with explicit sizes');
        import('./styles/fonts.sized.scss');
    } else if (__USE_SYSTEM_FONTS__) {
        console.debug('using system fonts');
        import('./styles/fonts.scss');
    } else {
        console.debug('using default fonts');
        import('./styles/fonts.scss');
        import('./styles/fonts.noto.scss');
    }
}

/**
 * 加载前端插件
 * 根据平台能力和浏览器支持情况加载相应的插件
 * 包括播放器插件、投射插件等
 */
async function loadPlugins() {
    console.groupCollapsed('loading installed plugins');
    console.dir(pluginManager);

    let list = await getPlugins();
    if (!appHost.supports(AppFeature.RemoteControl)) {
        // 如果不支持远程控制，禁用远程播放器插件
        list = list.filter(plugin => !plugin.startsWith('sessionPlayer')
            && !plugin.startsWith('chromecastPlayer'));
    } else if (!browser.chrome && !browser.edgeChromium && !browser.opera) {
        // 在不支持的浏览器中禁用 Chromecast 播放器
        list = list.filter(plugin => !plugin.startsWith('chromecastPlayer'));
    }

    // 添加任何原生插件
    if (window.NativeShell) {
        list = list.concat(window.NativeShell.getPlugins());
    }

    try {
        await Promise.all(list.map(plugin => pluginManager.loadPlugin(plugin)));
        console.debug('finished loading plugins');
    } catch (e) {
        console.warn('failed loading plugins', e);
    }

    console.groupEnd('loading installed plugins');
}

/**
 * 加载平台特定功能
 * 根据设备类型和浏览器能力加载不同的功能模块
 * 如播放控制条、远程控制、音量显示、Service Worker 等
 */
function loadPlatformFeatures() {
    if (!browser.tv && !browser.xboxOne && !browser.ps4) {
        import('./components/nowPlayingBar/nowPlayingBar');
    }

    if (appHost.supports(AppFeature.RemoteControl)) {
        import('./components/playback/playerSelectionMenu');
        import('./components/playback/remotecontrolautoplay');
    }

    if (!appHost.supports(AppFeature.PhysicalVolumeControl) || browser.touch) {
        import('./components/playback/volumeosd');
    }

    if (!browser.tv && !browser.xboxOne) {
        import('./components/playback/playbackorientation');
        registerServiceWorker();

        if (window.Notification) {
            import('./components/notifications/notifications');
        }
    }
}

/**
 * 注册 Service Worker
 * 用于实现离线功能和资源缓存
 * 仅在支持的浏览器和非原生应用模式下注册
 */
function registerServiceWorker() {
    if (navigator.serviceWorker && window.appMode !== 'cordova' && window.appMode !== 'android') {
        navigator.serviceWorker.register('serviceworker.js').then(() =>
            console.log('serviceWorker registered')
        ).catch(error =>
            console.log('error registering serviceWorker: ' + error)
        );
    } else {
        console.warn('serviceWorker unsupported');
    }
}

/**
 * 渲染 React 应用
 * 清除启动画面并将 React 根组件挂载到 DOM
 */
async function renderApp() {
    const container = document.getElementById('reactRoot');
    // 移除启动画面 logo
    container.innerHTML = '';

    loading.show();

    const root = createRoot(container);
    root.render(
        <RootApp />
    );
}

// 启动应用程序
init();
