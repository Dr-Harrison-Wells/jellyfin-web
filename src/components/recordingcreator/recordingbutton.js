// 导入服务器连接模块
import { ServerConnections } from 'lib/jellyfin-apiclient';
// 导入 DOM 操作工具
import dom from '../../scripts/dom';
// 导入录制助手模块
import recordingHelper from './recordinghelper';

// 导入按钮组件样式
import '../../elements/emby-button/paper-icon-button-light';
import '../../elements/emby-button/emby-button';
import './recordingfields.scss';

/**
 * 录制按钮点击事件处理函数
 * 当用户点击录制按钮时触发，用于切换录制状态
 */
function onRecordingButtonClick() {
    const item = this.item;

    if (item) {
        // 获取服务器 ID
        const serverId = item.ServerId;
        // 获取节目 ID
        const programId = item.Id;
        // 获取定时器 ID
        const timerId = item.TimerId;
        // 获取定时器状态
        const timerStatus = item.Status;
        // 获取系列定时器 ID
        const seriesTimerId = item.SeriesTimerId;

        const instance = this;

        // 切换录制状态，完成后刷新按钮状态
        recordingHelper.toggleRecording(serverId, programId, timerId, timerStatus, seriesTimerId).then(function () {
            instance.refresh(serverId, programId);
        });
    }
}

/**
 * 设置按钮图标
 * @param {HTMLElement} button - 按钮元素
 * @param {string} icon - 图标类名
 */
function setButtonIcon(button, icon) {
    const inner = button.querySelector('.material-icons');
    // 移除旧的图标类
    inner.classList.remove('fiber_smart_record');
    inner.classList.remove('fiber_manual_record');
    // 添加新的图标类
    inner.classList.add(icon);
}

/**
 * 录制按钮类
 * 管理直播电视节目的录制按钮功能
 */
class RecordingButton {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {HTMLElement} options.button - 按钮元素
     * @param {Object} [options.item] - 节目项数据
     * @param {string} [options.itemId] - 节目 ID
     * @param {string} [options.serverId] - 服务器 ID
     */
    constructor(options) {
        this.options = options;

        const button = options.button;

        // 设置默认图标
        setButtonIcon(button, 'fiber_manual_record');

        // 根据传入的参数刷新按钮状态
        if (options.item) {
            // 如果直接传入了节目项数据，使用该数据刷新
            this.refreshItem(options.item);
        } else if (options.itemId && options.serverId) {
            // 如果传入了 ID，则从服务器获取数据后刷新
            this.refresh(options.itemId, options.serverId);
        }

        // 绑定点击事件处理函数
        const clickFn = onRecordingButtonClick.bind(this);
        this.clickFn = clickFn;

        // 为按钮添加点击事件监听器
        dom.addEventListener(button, 'click', clickFn, {
            passive: true
        });
    }

    /**
     * 从服务器获取数据并刷新按钮状态
     * @param {string} serverId - 服务器 ID
     * @param {string} itemId - 节目 ID
     */
    refresh(serverId, itemId) {
        // 获取 API 客户端实例
        const apiClient = ServerConnections.getApiClient(serverId);
        const self = this;
        // 从服务器获取节目数据
        apiClient.getItem(apiClient.getCurrentUserId(), itemId).then(function (item) {
            self.refreshItem(item);
        });
    }

    /**
     * 使用节目数据刷新按钮状态
     * @param {Object} item - 节目项数据
     */
    refreshItem(item) {
        const options = this.options;
        const button = options.button;
        this.item = item;
        // 根据节目数据设置相应的图标
        setButtonIcon(button, getIndicatorIcon(item));

        // 根据录制状态设置按钮激活状态
        if (item.TimerId && (item.Status || 'Cancelled') !== 'Cancelled') {
            // 如果存在定时器且状态未取消，添加激活样式
            button.classList.add('recordingIcon-active');
        } else {
            // 否则移除激活样式
            button.classList.remove('recordingIcon-active');
        }
    }

    /**
     * 销毁按钮实例，清理事件监听器和引用
     */
    destroy() {
        const options = this.options;

        if (options) {
            const button = options.button;

            const clickFn = this.clickFn;

            // 移除点击事件监听器
            if (clickFn) {
                dom.removeEventListener(button, 'click', clickFn, {
                    passive: true
                });
            }
        }

        // 清空引用，防止内存泄漏
        this.options = null;
        this.item = null;
    }
}

/**
 * 根据节目项数据获取指示器图标
 * @param {Object} item - 节目项数据
 * @returns {string} 图标类名
 */
function getIndicatorIcon(item) {
    let status;

    // 系列定时器使用智能录制图标
    if (item.Type === 'SeriesTimer') {
        return 'fiber_smart_record';
    } else if (item.TimerId || item.SeriesTimerId) {
        // 如果有定时器 ID 或系列定时器 ID，获取状态
        status = item.Status || 'Cancelled';
    } else if (item.Type === 'Timer') {
        // 如果是定时器类型，获取状态
        status = item.Status;
    } else {
        // 默认返回手动录制图标
        return 'fiber_manual_record';
    }

    // 如果有系列定时器且未取消，返回智能录制图标
    if (item.SeriesTimerId && status !== 'Cancelled') {
        return 'fiber_smart_record';
    }

    // 默认返回手动录制图标
    return 'fiber_manual_record';
}

// 导出录制按钮类
export default RecordingButton;
