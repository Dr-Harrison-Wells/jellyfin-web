/**
 * 项目刷新器模块
 * 用于监听和处理各种服务器通知事件，并在需要时刷新项目数据
 */
import { playbackManager } from './playback/playbackmanager';
import serverNotifications from '../scripts/serverNotifications';
import Events from '../utils/events.ts';

/**
 * 当用户数据发生变化时的处理函数
 * 如果监听的事件包含收藏或播放标记，则通知需要刷新
 */
function onUserDataChanged() {
    const instance = this;
    const eventsToMonitor = getEventsToMonitor(instance);

    // TODO: Check user data change reason?
    if (eventsToMonitor.indexOf('markfavorite') !== -1
        || eventsToMonitor.indexOf('markplayed') !== -1
    ) {
        instance.notifyRefreshNeeded();
    }
}

/**
 * 获取需要监听的事件列表
 * @param {ItemsRefresher} instance - 刷新器实例
 * @returns {string[]} 要监听的事件名称数组
 */
function getEventsToMonitor(instance) {
    const options = instance.options;
    const monitor = options ? options.monitorEvents : null;
    if (monitor) {
        return monitor.split(',');
    }

    return [];
}

/**
 * 通知定时器刷新
 * 如果监听事件包含 'timers'，则触发刷新
 */
function notifyTimerRefresh() {
    const instance = this;

    if (getEventsToMonitor(instance).indexOf('timers') !== -1) {
        instance.notifyRefreshNeeded();
    }
}

/**
 * 通知系列定时器刷新
 * 如果监听事件包含 'seriestimers'，则触发刷新
 */
function notifySeriesTimerRefresh() {
    const instance = this;
    if (getEventsToMonitor(instance).indexOf('seriestimers') !== -1) {
        instance.notifyRefreshNeeded();
    }
}

/**
 * 当媒体库发生变化时的处理函数
 * @param {Event} e - 事件对象
 * @param {ApiClient} apiClient - API 客户端
 * @param {Object} data - 变化数据，包含新增和删除的项目
 */
function onLibraryChanged(e, apiClient, data) {
    const instance = this;
    const eventsToMonitor = getEventsToMonitor(instance);
    if (eventsToMonitor.indexOf('seriestimers') !== -1 || eventsToMonitor.indexOf('timers') !== -1) {
        // 如果是定时器相关事件，直接返回
        return;
    }

    // 获取新增和删除的项目
    const itemsAdded = data.ItemsAdded || [];
    const itemsRemoved = data.ItemsRemoved || [];
    if (!itemsAdded.length && !itemsRemoved.length) {
        return;
    }

    // 检查是否需要针对特定父目录进行刷新
    const options = instance.options || {};
    const parentId = options.parentId;
    if (parentId) {
        const foldersAddedTo = data.FoldersAddedTo || [];
        const foldersRemovedFrom = data.FoldersRemovedFrom || [];
        const collectionFolders = data.CollectionFolders || [];

        if (foldersAddedTo.indexOf(parentId) === -1 && foldersRemovedFrom.indexOf(parentId) === -1 && collectionFolders.indexOf(parentId) === -1) {
            return;
        }
    }

    instance.notifyRefreshNeeded();
}

/**
 * 当播放停止时的处理函数
 * 根据媒体类型（视频或音频）决定是否刷新
 * @param {Event} e - 事件对象
 * @param {Object} stopInfo - 停止信息
 */
function onPlaybackStopped(e, stopInfo) {
    const instance = this;

    const state = stopInfo.state;

    const eventsToMonitor = getEventsToMonitor(instance);
    if (state.NowPlayingItem?.MediaType === 'Video') {
        if (eventsToMonitor.indexOf('videoplayback') !== -1) {
            instance.notifyRefreshNeeded(true);
            return;
        }
    } else if (state.NowPlayingItem?.MediaType === 'Audio' && eventsToMonitor.indexOf('audioplayback') !== -1) {
        instance.notifyRefreshNeeded(true);
        return;
    }
}

/**
 * 添加通知事件监听器
 * @param {ItemsRefresher} instance - 刷新器实例
 * @param {string} name - 事件名称
 * @param {Function} handler - 事件处理函数
 * @param {Object} owner - 事件所有者，默认为 serverNotifications
 */
function addNotificationEvent(instance, name, handler, owner) {
    const localHandler = handler.bind(instance);
    owner = owner || serverNotifications;
    Events.on(owner, name, localHandler);
    instance['event_' + name] = localHandler;
}

/**
 * 移除通知事件监听器
 * @param {ItemsRefresher} instance - 刷新器实例
 * @param {string} name - 事件名称
 * @param {Object} owner - 事件所有者，默认为 serverNotifications
 */
function removeNotificationEvent(instance, name, owner) {
    const handler = instance['event_' + name];
    if (handler) {
        owner = owner || serverNotifications;
        Events.off(owner, name, handler);
        instance['event_' + name] = null;
    }
}

/**
 * 项目刷新器类
 * 用于管理项目数据的自动刷新和事件监听
 */
class ItemsRefresher {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {string} options.monitorEvents - 要监听的事件列表（逗号分隔）
     * @param {string} options.parentId - 父目录 ID
     * @param {number} options.refreshIntervalMs - 刷新间隔（毫秒）
     */
    constructor(options) {
        this.options = options || {};

        addNotificationEvent(this, 'UserDataChanged', onUserDataChanged);
        addNotificationEvent(this, 'TimerCreated', notifyTimerRefresh);
        addNotificationEvent(this, 'SeriesTimerCreated', notifySeriesTimerRefresh);
        addNotificationEvent(this, 'TimerCancelled', notifyTimerRefresh);
        addNotificationEvent(this, 'SeriesTimerCancelled', notifySeriesTimerRefresh);
        addNotificationEvent(this, 'LibraryChanged', onLibraryChanged);
        addNotificationEvent(this, 'playbackstop', onPlaybackStopped, playbackManager);
    }

    /**
     * 暂停刷新器
     * 清除刷新间隔并标记为暂停状态
     */
    pause() {
        clearRefreshInterval(this, true);

        this.paused = true;
    }

    /**
     * 恢复刷新器
     * @param {Object} options - 恢复选项
     * @param {boolean} options.refresh - 是否立即刷新
     * @returns {Promise} 刷新操作的 Promise
     */
    resume(options) {
        this.paused = false;

        const refreshIntervalEndTime = this.refreshIntervalEndTime;
        if (refreshIntervalEndTime) {
            const remainingMs = refreshIntervalEndTime - new Date().getTime();
            if (remainingMs > 0 && !this.needsRefresh) {
                resetRefreshInterval(this, remainingMs);
            } else {
                this.needsRefresh = true;
                this.refreshIntervalEndTime = null;
            }
        }

        if (this.needsRefresh || (options?.refresh)) {
            return this.refreshItems();
        }

        return Promise.resolve();
    }

    /**
     * 刷新项目数据
     * 调用 fetchData 函数获取新数据
     * @returns {Promise} 刷新操作的 Promise
     */
    refreshItems() {
        if (!this.fetchData) {
            return Promise.resolve();
        }

        if (this.paused) {
            this.needsRefresh = true;
            return Promise.resolve();
        }

        this.needsRefresh = false;

        return this.fetchData().then(onDataFetched.bind(this));
    }

    /**
     * 通知需要刷新
     * @param {boolean} isInForeground - 是否在前台，如果是则立即刷新，否则延迟 10 秒刷新
     */
    notifyRefreshNeeded(isInForeground) {
        if (this.paused) {
            this.needsRefresh = true;
            return;
        }

        const timeout = this.refreshTimeout;
        if (timeout) {
            clearTimeout(timeout);
        }

        if (isInForeground === true) {
            this.refreshItems();
        } else {
            this.refreshTimeout = setTimeout(this.refreshItems.bind(this), 10000);
        }
    }

    /**
     * 销毁刷新器
     * 清除所有事件监听器和引用
     */
    destroy() {
        clearRefreshInterval(this);

        removeNotificationEvent(this, 'UserDataChanged');
        removeNotificationEvent(this, 'TimerCreated');
        removeNotificationEvent(this, 'SeriesTimerCreated');
        removeNotificationEvent(this, 'TimerCancelled');
        removeNotificationEvent(this, 'SeriesTimerCancelled');
        removeNotificationEvent(this, 'LibraryChanged');
        removeNotificationEvent(this, 'playbackstop', playbackManager);

        this.fetchData = null;
        this.options = null;
    }
}

/**
 * 清除刷新间隔定时器
 * @param {ItemsRefresher} instance - 刷新器实例
 * @param {boolean} isPausing - 是否是暂停操作
 */
function clearRefreshInterval(instance, isPausing) {
    if (instance.refreshInterval) {
        clearInterval(instance.refreshInterval);
        instance.refreshInterval = null;

        if (!isPausing) {
            instance.refreshIntervalEndTime = null;
        }
    }
}

/**
 * 重置刷新间隔定时器
 * @param {ItemsRefresher} instance - 刷新器实例
 * @param {number} intervalMs - 间隔时间（毫秒），如果未提供则从配置中读取
 */
function resetRefreshInterval(instance, intervalMs) {
    clearRefreshInterval(instance);

    if (!intervalMs) {
        const options = instance.options;
        if (options) {
            intervalMs = options.refreshIntervalMs;
        }
    }

    if (intervalMs) {
        instance.refreshInterval = setInterval(instance.notifyRefreshNeeded.bind(instance), intervalMs);
        instance.refreshIntervalEndTime = new Date().getTime() + intervalMs;
    }
}

/**
 * 数据获取完成后的回调函数
 * 重置刷新间隔并调用 afterRefresh 回调
 * @param {*} result - 获取的数据结果
 */
function onDataFetched(result) {
    resetRefreshInterval(this);

    if (this.afterRefresh) {
        this.afterRefresh(result);
    }
}

export default ItemsRefresher;
