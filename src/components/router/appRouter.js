// 导入集合类型枚举
import { CollectionType } from '@jellyfin/sdk/lib/generated-client/models/collection-type';

// 导入背景相关功能
import { setBackdropTransparency } from '../backdrop/backdrop';
// 导入国际化模块
import globalize from '../../lib/globalize';
// 导入项目辅助工具
import itemHelper from '../itemHelper';
// 导入加载指示器
import loading from '../loading/loading';
// 导入警告对话框
import alert from '../alert';

// 导入项目查询钩子
import { getItemQuery } from 'hooks/useItem';
// 导入服务器连接管理器
import { ServerConnections } from 'lib/jellyfin-apiclient';
// 导入 API 兼容性转换工具
import { toApi } from 'utils/jellyfin-apiclient/compat';
// 导入查询客户端
import { queryClient } from 'utils/query/queryClient';
// 导入历史记录对象
import { history } from 'RootAppRouter';

/** 起始页面路径（当"返回"按钮的行为应该不同时，可能会退出应用程序） */
const START_PAGE_PATHS = ['/home', '/login', '/selectserver'];

/** 不需要用户登录即可查看的公共页面 */
const PUBLIC_PATHS = [
    '/addserver',
    '/selectserver',
    '/login',
    '/forgotpassword',
    '/forgotpasswordpin',
    '/wizardremoteaccess',
    '/wizardfinish',
    '/wizardlibrary',
    '/wizardsettings',
    '/wizardstart',
    '/wizarduser'
];

/**
 * 应用路由器类
 * 负责管理应用程序的路由导航、页面跳转和用户认证状态
 */
class AppRouter {
    forcedLogoutMsg; // 强制登出消息
    msgTimeout; // 消息超时句柄
    promiseShow; // 显示页面的 Promise
    resolveOnNextShow; // 下次显示时的解析函数

    /**
     * 构造函数
     * 初始化路由器，设置基础路由和监听器
     */
    constructor() {
        // 监听视图显示事件
        document.addEventListener('viewshow', () => this.onViewShow());

        // 记录上次访问的路径
        this.lastPath = history.location.pathname + history.location.search;
        // 开始监听路由变化
        this.listen();

        // TODO: 能否简化 baseRoute 逻辑？
        // 设置基础路由 URL
        this.baseRoute = window.location.href.split('?')[0].replace(this.#getRequestFile(), '');
        // 支持 hashbang 模式
        this.baseRoute = this.baseRoute.split('#')[0];
        // 移除末尾的斜杠（除非是协议部分）
        if (this.baseRoute.endsWith('/') && !this.baseRoute.endsWith('://')) {
            this.baseRoute = this.baseRoute.substring(0, this.baseRoute.length - 1);
        }
    }

    /**
     * 等待路由器就绪
     * @returns {Promise} 当前显示 Promise 或已解析的 Promise
     */
    /**
     * 等待路由器就绪
     * @returns {Promise} 当前显示 Promise 或已解析的 Promise
     */
    ready() {
        return this.promiseShow || Promise.resolve();
    }

    /**
     * 返回上一页
     * @returns {Promise} 返回操作完成的 Promise
     */
    async back() {
        // 如果正在显示页面，等待完成
        if (this.promiseShow) await this.promiseShow;

        // 创建新的 Promise 来跟踪返回操作
        this.promiseShow = new Promise((resolve) => {
            const unlisten = history.listen(() => {
                unlisten(); // 取消监听
                this.promiseShow = null;
                resolve();
            });
            history.back(); // 执行返回操作
        });

        return this.promiseShow;
    }

    /**
     * 显示指定路径的页面
     * @param {string} path - 要导航到的路径
     * @param {Object} options - 导航选项
     * @returns {Promise} 导航完成的 Promise
     */
    async show(path, options) {
        // 如果正在显示页面，等待完成
        if (this.promiseShow) await this.promiseShow;

        // 确保路径不以 '#' 开头（因为路由器会自动添加）
        if (path.startsWith('#')) {
            path = path.substring(1);
        }
        // 支持旧的 '#!' 路由（用户可能有旧书签等）
        if (path.startsWith('!')) {
            path = path.substring(1);
        }

        // 如果路径不是以 '/' 开头且不是完整 URL，则添加 '/'
        if (!path.startsWith('/') && path.indexOf('://') === -1) {
            path = '/' + path;
        }

        // 移除基础 URL 部分
        path = path.replace(this.baseUrl(), '');

        // 如果当前路径与目标路径相同（且不是首页），直接返回
        // 由于返回菜单的原因，目前不能对首页使用此逻辑
        if (history.location.pathname === path && path !== '/home') {
            loading.hide();
            return Promise.resolve();
        }

        // 创建新的 Promise 来跟踪页面显示
        this.promiseShow = new Promise((resolve) => {
            this.resolveOnNextShow = resolve;
            // 异步执行导航操作
            setTimeout(() => history.push(path, options), 0);
        });

        return this.promiseShow;
    }

    /**
     * 监听路由变化
     * 当路径改变时更新 lastPath 并处理视图显示
     */
    listen() {
        history.listen(({ location }) => {
            // 规范化路径（移除前导 '!'）
            const normalizedPath = location.pathname.replace(/^!/, '');
            const fullPath = normalizedPath + location.search;

            // 如果路径未改变，直接解析 Promise
            if (fullPath === this.lastPath) {
                console.debug('[appRouter] path did not change, resolving promise');
                this.onViewShow();
            }

            // 更新上次访问的路径
            this.lastPath = fullPath;
        });
    }

    /**
     * 获取基础 URL
     * @returns {string} 基础路由 URL
     */
    baseUrl() {
        return this.baseRoute;
    }

    /**
     * 检查是否可以返回上一页
     * @returns {boolean} 如果可以返回则返回 true
     */
    canGoBack() {
        const path = history.location.pathname;

        // 如果没有对话框且当前在起始页面，则不能返回
        if (
            !document.querySelector('.dialogContainer')
            && START_PAGE_PATHS.includes(path)
        ) {
            return false;
        }

        // 检查历史记录是否有多于一条记录
        return window.history.length > 1;
    }

    /**
     * 显示项目详情或列表
     * @param {Object|string} item - 项目对象或项目 ID
     * @param {string} serverId - 服务器 ID
     * @param {Object} options - 显示选项
     */
    showItem(item, serverId, options) {
        // TODO: 重构此方法，使其只接受项目对象，而非字符串
        if (typeof item === 'string') {
            // 如果传入的是字符串 ID，则先获取项目对象
            const apiClient = serverId ? ServerConnections.getApiClient(serverId) : ServerConnections.currentApiClient();
            const api = toApi(apiClient);
            const userId = apiClient.getCurrentUserId();

            queryClient
                .fetchQuery(getItemQuery(api, item, userId))
                .then(itemObject => {
                    this.showItem(itemObject, options);
                })
                .catch(err => {
                    console.error('[AppRouter] Failed to fetch item', err);
                });
        } else {
            // 处理参数（兼容旧的调用方式）
            if (arguments.length === 2) {
                options = arguments[1];
            }

            // 获取路由 URL 并导航
            const url = this.getRouteUrl(item, options);
            this.show(url);
        }
    }

    /**
     * 设置背景、背景板和文档的透明度
     * @deprecated 使用 Dashboard.setBackdropTransparency 代替
     * @param {string} level - 透明度级别
     */
    setTransparency(level) {
        // TODO: 在 JMP 更新后移除此函数
        console.warn('Deprecated! Use Dashboard.setBackdropTransparency');
        setBackdropTransparency(level);
    }

    /**
     * 视图显示时的回调
     * 解析待处理的 Promise
     */
    onViewShow() {
        const resolve = this.resolveOnNextShow;
        if (resolve) {
            this.promiseShow = null;
            this.resolveOnNextShow = null;
            resolve();
        }
    }

    /**
     * 强制登出消息超时回调
     * 显示强制登出的警告消息
     */
    onForcedLogoutMessageTimeout() {
        const msg = this.forcedLogoutMsg;
        this.forcedLogoutMsg = null;

        if (msg) {
            alert(msg);
        }
    }

    /**
     * 显示强制登出消息
     * @param {string} msg - 要显示的消息
     */
    showForcedLogoutMessage(msg) {
        this.forcedLogoutMsg = msg;
        if (this.msgTimeout) {
            clearTimeout(this.msgTimeout);
        }

        // 延迟 100ms 后显示消息
        this.msgTimeout = setTimeout(this.onForcedLogoutMessageTimeout, 100);
    }

    /**
     * 请求失败时的处理函数
     * @param {Event} _e - 事件对象（未使用）
     * @param {Object} data - 响应数据
     */
    /**
     * 请求失败时的处理函数
     * @param {Event} _e - 事件对象（未使用）
     * @param {Object} data - 响应数据
     */
    onRequestFail(_e, data) {
        const apiClient = this;

        // 如果是 403 错误且错误码为 ParentalControl（家长控制）
        if (data.status === 403 && data.errorCode === 'ParentalControl') {
            const isPublicPage = PUBLIC_PATHS.includes(history.location.pathname);

            // 跳转到登录界面，但如果密码输入失败则不跳转
            if (!isPublicPage) {
                appRouter.showForcedLogoutMessage(globalize.translate('AccessRestrictedTryAgainLater'));
                appRouter.showLocalLogin(apiClient.serverId());
            }
        }
    }

    /**
     * 获取请求的文件路径
     * @private
     * @returns {string} 当前请求的文件路径
     */
    #getRequestFile() {
        let path = window.location.pathname || '';

        const index = path.lastIndexOf('/');
        if (index !== -1) {
            path = path.substring(index);
        } else {
            path = '/' + path;
        }

        // 如果路径为空或为根路径，默认为 index.html
        if (!path || path === '/') {
            path = '/index.html';
        }

        return path;
    }

    /**
     * 根据项目获取路由 URL
     * @param {Object|string} item - 项目对象或特殊标识符
     * @param {Object} options - 路由选项
     * @returns {string} 路由 URL
     */
    getRouteUrl(item, options) {
        if (!item) {
            throw new Error('item cannot be null');
        }

        // 如果项目已有 URL，直接返回
        if (item.url) {
            return item.url;
        }

        const context = options ? options.context : null;
        const id = item.Id || item.ItemId;

        if (!options) {
            options = {};
        }

        let url;
        // TODO: options 永远不会是 false，使用 lodash 的 isEmpty() 替换此条件
        const itemType = item.Type || (options ? options.itemType : null);
        const serverId = item.ServerId || options.serverId;

        // 处理特殊的字符串标识符
        if (item === 'settings') {
            return '#/mypreferencesmenu';
        }

        if (item === 'wizard') {
            return '#/wizardstart';
        }

        if (item === 'manageserver') {
            return '#/dashboard';
        }

        if (item === 'recordedtv') {
            return '#/livetv?tab=3&serverId=' + options.serverId;
        }

        if (item === 'nextup') {
            return '#/list?type=nextup&serverId=' + options.serverId;
        }

        // 处理列表类型
        if (item === 'list') {
            let urlForList = '#/list?serverId=' + options.serverId + '&type=' + options.itemTypes;

            if (options.isFavorite) {
                urlForList += '&IsFavorite=true';
            }

            if (options.isAiring) {
                urlForList += '&IsAiring=true';
            }

            if (options.isMovie) {
                urlForList += '&IsMovie=true';
            }

            if (options.isSeries) {
                urlForList += '&IsSeries=true&IsMovie=false&IsNews=false';
            }

            if (options.isSports) {
                urlForList += '&IsSports=true';
            }

            if (options.isKids) {
                urlForList += '&IsKids=true';
            }

            if (options.isNews) {
                urlForList += '&IsNews=true';
            }

            return urlForList;
        }

        // 处理直播电视相关路由
        if (item === 'livetv') {
            if (options.section === 'programs') {
                return '#/livetv?tab=0&serverId=' + options.serverId;
            }
            if (options.section === 'guide') {
                return '#/livetv?tab=1&serverId=' + options.serverId;
            }

            if (options.section === 'movies') {
                return '#/list?type=Programs&IsMovie=true&serverId=' + options.serverId;
            }

            if (options.section === 'shows') {
                return '#/list?type=Programs&IsSeries=true&IsMovie=false&IsNews=false&serverId=' + options.serverId;
            }

            if (options.section === 'sports') {
                return '#/list?type=Programs&IsSports=true&serverId=' + options.serverId;
            }

            if (options.section === 'kids') {
                return '#/list?type=Programs&IsKids=true&serverId=' + options.serverId;
            }

            if (options.section === 'news') {
                return '#/list?type=Programs&IsNews=true&serverId=' + options.serverId;
            }

            if (options.section === 'onnow') {
                return '#/list?type=Programs&IsAiring=true&serverId=' + options.serverId;
            }

            if (options.section === 'channels') {
                return '#/livetv?tab=2&serverId=' + options.serverId;
            }

            if (options.section === 'dvrschedule') {
                return '#/livetv?tab=4&serverId=' + options.serverId;
            }

            if (options.section === 'seriesrecording') {
                return '#/livetv?tab=5&serverId=' + options.serverId;
            }

            return '#/livetv?serverId=' + options.serverId;
        }

        // 处理系列定时器类型
        if (itemType == 'SeriesTimer') {
            return '#/details?seriesTimerId=' + id + '&serverId=' + serverId;
        }

        // 处理直播电视集合类型
        if (item.CollectionType == CollectionType.Livetv) {
            return `#/livetv?collectionType=${item.CollectionType}`;
        }

        // 处理类型（Genre）
        if (item.Type === 'Genre') {
            url = '#/list?genreId=' + item.Id + '&serverId=' + serverId;

            if (context === 'livetv') {
                url += '&type=Programs';
            }

            if (options.parentId) {
                url += '&parentId=' + options.parentId;
            }

            return url;
        }

        // 处理音乐类型
        if (item.Type === 'MusicGenre') {
            url = '#/list?musicGenreId=' + item.Id + '&serverId=' + serverId;

            if (options.parentId) {
                url += '&parentId=' + options.parentId;
            }

            return url;
        }

        // 处理工作室类型
        if (item.Type === 'Studio') {
            url = '#/list?studioId=' + item.Id + '&serverId=' + serverId;

            if (options.parentId) {
                url += '&parentId=' + options.parentId;
            }

            return url;
        }

        // 处理标签类型
        if (item === 'tag') {
            url = `#/list?type=tag&tag=${encodeURIComponent(options.tag)}&serverId=${serverId}`;

            if (options.parentId) {
                url += '&parentId=' + options.parentId;
            }

            return url;
        }

        // 处理非文件夹上下文且非本地项目的情况
        if (context !== 'folders' && !itemHelper.isLocalItem(item)) {
            // 电影集合
            if (item.CollectionType == CollectionType.Movies) {
                url = `#/movies?topParentId=${item.Id}&collectionType=${item.CollectionType}`;

                if (options && options.section === 'latest') {
                    url += '&tab=1';
                }

                return url;
            }

            // 电视节目集合
            if (item.CollectionType == CollectionType.Tvshows) {
                url = `#/tv?topParentId=${item.Id}&collectionType=${item.CollectionType}`;

                if (options && options.section === 'latest') {
                    url += '&tab=1';
                }

                return url;
            }

            // 音乐集合
            if (item.CollectionType == CollectionType.Music) {
                url = `#/music?topParentId=${item.Id}&collectionType=${item.CollectionType}`;

                if (options?.section === 'latest') {
                    url += '&tab=1';
                }

                return url;
            }

            // 获取本地存储的布局模式
            const layoutMode = localStorage.getItem('layout');

            // 家庭视频集合（实验性布局）
            if (layoutMode === 'experimental' && item.CollectionType == CollectionType.Homevideos) {
                url = '#/homevideos?topParentId=' + item.Id;

                return url;
            }
        }

        // 需要显示详情页的项目类型列表
        const itemTypes = ['Playlist', 'TvChannel', 'Program', 'BoxSet', 'MusicAlbum', 'MusicGenre', 'Person', 'Recording', 'MusicArtist'];

        if (itemTypes.indexOf(itemType) >= 0) {
            return '#/details?id=' + id + '&serverId=' + serverId;
        }

        // 构建上下文后缀
        const contextSuffix = context ? '&context=' + context : '';

        // 处理剧集、季、集数类型
        if (itemType == 'Series' || itemType == 'Season' || itemType == 'Episode') {
            return '#/details?id=' + id + contextSuffix + '&serverId=' + serverId;
        }

        // 处理文件夹类型
        if (item.IsFolder) {
            if (id) {
                return '#/list?parentId=' + id + '&serverId=' + serverId;
            }

            return '#';
        }

        // 默认返回详情页
        return '#/details?id=' + id + '&serverId=' + serverId;
    }

    /**
     * 显示本地登录页面
     * @param {string} serverId - 服务器 ID
     * @returns {Promise} 导航完成的 Promise
     */
    showLocalLogin(serverId) {
        return this.show('login?serverid=' + serverId);
    }

    /**
     * 显示视频播放界面
     * @returns {Promise} 导航完成的 Promise
     */
    showVideoOsd() {
        return this.show('video');
    }

    /**
     * 显示服务器选择页面
     * @returns {Promise} 导航完成的 Promise
     */
    showSelectServer() {
        return this.show('selectserver');
    }

    /**
     * 显示设置页面
     * @returns {Promise} 导航完成的 Promise
     */
    showSettings() {
        return this.show('mypreferencesmenu');
    }

    /**
     * 显示正在播放页面
     * @returns {Promise} 导航完成的 Promise
     */
    showNowPlaying() {
        return this.show('queue');
    }

    /**
     * 显示节目指南
     * @returns {Promise} 导航完成的 Promise
     */
    showGuide() {
        return this.show('livetv?tab=1');
    }

    /**
     * 返回主页
     * @returns {Promise} 导航完成的 Promise
     */
    goHome() {
        return this.show('home');
    }

    /**
     * 显示搜索页面
     * @returns {Promise} 导航完成的 Promise
     */
    showSearch() {
        return this.show('search');
    }

    /**
     * 显示直播电视页面
     * @returns {Promise} 导航完成的 Promise
     */
    showLiveTV() {
        return this.show('livetv');
    }

    /**
     * 显示录制电视页面
     * @returns {Promise} 导航完成的 Promise
     */
    showRecordedTV() {
        return this.show('livetv?tab=3');
    }

    /**
     * 显示收藏页面
     * @returns {Promise} 导航完成的 Promise
     */
    showFavorites() {
        return this.show('home?tab=1');
    }
}

// 导出应用路由器实例
export const appRouter = new AppRouter();

/**
 * 检查当前是否在歌词页面
 * @returns {boolean} 如果在歌词页面则返回 true
 */
export const isLyricsPage = () => history.location.pathname.toLowerCase() === '/lyrics';

// 向后兼容：将路由器挂载到全局 Emby 对象
window.Emby = window.Emby || {};
window.Emby.Page = appRouter;
