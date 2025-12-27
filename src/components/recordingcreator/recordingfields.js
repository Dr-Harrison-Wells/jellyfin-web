// 导入国际化模块
import globalize from '../../lib/globalize';
// 导入服务器连接模块
import { ServerConnections } from 'lib/jellyfin-apiclient';
// 导入事件处理模块
import Events from '../../utils/events.ts';
// 导入服务器通知模块
import serverNotifications from '../../scripts/serverNotifications';
// 导入加载动画组件
import loading from '../loading/loading';
// 导入DOM操作工具
import dom from '../../scripts/dom';
// 导入录制帮助工具
import recordingHelper from './recordinghelper';

// 导入UI按钮组件
import '../../elements/emby-button/emby-button';
import '../../elements/emby-button/paper-icon-button-light';
// 导入样式表
import './recordingfields.scss';
import '../../styles/flexstyles.scss';
// 导入消息提示组件
import toast from '../toast/toast';
// 导入HTML模板
import template from './recordingfields.template.html';

/**
 * 加载节目数据并更新UI
 * @param {HTMLElement} parent - 父容器元素
 * @param {Object} program - 节目对象
 */
function loadData(parent, program) {
    // 如果是系列节目，显示系列录制容器
    if (program.IsSeries) {
        parent.querySelector('.recordSeriesContainer').classList.remove('hide');
    } else {
        parent.querySelector('.recordSeriesContainer').classList.add('hide');
    }

    // 根据是否有系列计时器ID更新系列录制按钮状态
    if (program.SeriesTimerId) {
        // 显示管理系列录制按钮
        parent.querySelector('.btnManageSeriesRecording').classList.remove('hide');
        // 激活录制图标
        parent.querySelector('.seriesRecordingButton .recordingIcon').classList.add('recordingIcon-active');
        // 设置按钮文本为"取消系列"
        parent.querySelector('.seriesRecordingButton .buttonText').innerHTML = globalize.translate('CancelSeries');
    } else {
        // 隐藏管理系列录制按钮
        parent.querySelector('.btnManageSeriesRecording').classList.add('hide');
        // 取消激活录制图标
        parent.querySelector('.seriesRecordingButton .recordingIcon').classList.remove('recordingIcon-active');
        // 设置按钮文本为"录制系列"
        parent.querySelector('.seriesRecordingButton .buttonText').innerHTML = globalize.translate('RecordSeries');
    }

    // 根据计时器ID和状态更新单个录制按钮
    if (program.TimerId && program.Status !== 'Cancelled') {
        // 显示管理录制按钮
        parent.querySelector('.btnManageRecording').classList.remove('hide');
        // 激活录制图标
        parent.querySelector('.singleRecordingButton .recordingIcon').classList.add('recordingIcon-active');
        // 如果正在录制，显示"停止录制"按钮
        if (program.Status === 'InProgress') {
            parent.querySelector('.singleRecordingButton .buttonText').innerHTML = globalize.translate('StopRecording');
        } else {
            // 否则显示"不录制"按钮
            parent.querySelector('.singleRecordingButton .buttonText').innerHTML = globalize.translate('DoNotRecord');
        }
    } else {
        // 隐藏管理录制按钮
        parent.querySelector('.btnManageRecording').classList.add('hide');
        // 取消激活录制图标
        parent.querySelector('.singleRecordingButton .recordingIcon').classList.remove('recordingIcon-active');
        // 设置按钮文本为"录制"
        parent.querySelector('.singleRecordingButton .buttonText').innerHTML = globalize.translate('Record');
    }
}

/**
 * 从服务器获取节目数据
 * @param {RecordingEditor} instance - 录制编辑器实例
 * @returns {Promise} 返回Promise对象
 */
function fetchData(instance) {
    const options = instance.options;
    // 获取API客户端
    const apiClient = ServerConnections.getApiClient(options.serverId);

    // 显示录制字段区域
    options.parent.querySelector('.recordingFields').classList.remove('hide');
    // 获取直播电视节目信息
    return apiClient.getLiveTvProgram(options.programId, apiClient.getCurrentUserId()).then(function (program) {
        // 更新实例的计时器信息
        instance.TimerId = program.TimerId;
        instance.Status = program.Status;
        instance.SeriesTimerId = program.SeriesTimerId;
        // 加载数据到UI
        loadData(options.parent, program);
    });
}

/**
 * 计时器外部变化事件处理函数
 * @param {Event} e - 事件对象
 * @param {Object} apiClient - API客户端
 * @param {Object} data - 数据对象
 */
function onTimerChangedExternally(e, apiClient, data) {
    const options = this.options;

    // 如果变化的计时器ID或节目ID与当前实例匹配，则刷新数据
    if ((data.Id && this.TimerId === data.Id)
        || (data.ProgramId && options && options.programId === data.ProgramId)
    ) {
        this.refresh();
    }
}

/**
 * 系列计时器外部变化事件处理函数
 * @param {Event} e - 事件对象
 * @param {Object} apiClient - API客户端
 * @param {Object} data - 数据对象
 */
function onSeriesTimerChangedExternally(e, apiClient, data) {
    const options = this.options;

    // 如果变化的系列计时器ID或节目ID与当前实例匹配，则刷新数据
    if ((data.Id && this.SeriesTimerId === data.Id)
        || (data.ProgramId && options && options.programId === data.ProgramId)
    ) {
        this.refresh();
    }
}

/**
 * 录制编辑器类
 * 用于管理电视节目的录制功能
 */
class RecordingEditor {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     */
    constructor(options) {
        this.options = options;
        // 嵌入编辑器到页面
        this.embed();

        // 绑定计时器变化处理函数
        const timerChangedHandler = onTimerChangedExternally.bind(this);
        this.timerChangedHandler = timerChangedHandler;

        // 监听计时器创建和取消事件
        Events.on(serverNotifications, 'TimerCreated', timerChangedHandler);
        Events.on(serverNotifications, 'TimerCancelled', timerChangedHandler);

        // 绑定系列计时器变化处理函数
        const seriesTimerChangedHandler = onSeriesTimerChangedExternally.bind(this);
        this.seriesTimerChangedHandler = seriesTimerChangedHandler;

        // 监听系列计时器创建和取消事件
        Events.on(serverNotifications, 'SeriesTimerCreated', seriesTimerChangedHandler);
        Events.on(serverNotifications, 'SeriesTimerCancelled', seriesTimerChangedHandler);
    }

    /**
     * 将录制编辑器嵌入到页面中
     * @returns {Promise} 返回Promise对象
     */
    embed() {
        const self = this;
        return new Promise(function (resolve) {
            const options = self.options;
            const context = options.parent;
            // 将模板翻译后插入到容器中
            context.innerHTML = globalize.translateHtml(template, 'core');

            // 绑定单个录制按钮点击事件
            context.querySelector('.singleRecordingButton').addEventListener('click', onRecordChange.bind(self));
            // 绑定系列录制按钮点击事件
            context.querySelector('.seriesRecordingButton').addEventListener('click', onRecordSeriesChange.bind(self));
            // 绑定管理录制按钮点击事件
            context.querySelector('.btnManageRecording').addEventListener('click', onManageRecordingClick.bind(self));
            // 绑定管理系列录制按钮点击事件
            context.querySelector('.btnManageSeriesRecording').addEventListener('click', onManageSeriesRecordingClick.bind(self));

            // 获取数据并在完成后resolve
            fetchData(self).then(resolve);
        });
    }

    /**
     * 检查是否有变更
     * @returns {boolean} 是否有变更
     */
    hasChanged() {
        return this.changed;
    }

    /**
     * 刷新录制编辑器数据
     */
    refresh() {
        fetchData(this);
    }

    /**
     * 销毁录制编辑器，清理事件监听器
     */
    destroy() {
        // 移除计时器变化事件监听
        const timerChangedHandler = this.timerChangedHandler;
        this.timerChangedHandler = null;

        Events.off(serverNotifications, 'TimerCreated', timerChangedHandler);
        Events.off(serverNotifications, 'TimerCancelled', timerChangedHandler);

        // 移除系列计时器变化事件监听
        const seriesTimerChangedHandler = this.seriesTimerChangedHandler;
        this.seriesTimerChangedHandler = null;

        Events.off(serverNotifications, 'SeriesTimerCreated', seriesTimerChangedHandler);
        Events.off(serverNotifications, 'SeriesTimerCancelled', seriesTimerChangedHandler);
    }
}

/**
 * 管理录制按钮点击事件处理函数
 */
function onManageRecordingClick() {
    const options = this.options;
    // 如果没有计时器ID或状态为已取消，则直接返回
    if (!this.TimerId || this.Status === 'Cancelled') {
        return;
    }

    const self = this;
    // 动态导入录制编辑器并显示
    import('./recordingeditor').then(({ default: recordingEditor }) => {
        recordingEditor.show(self.TimerId, options.serverId, {
            enableCancel: false
        }).then(function () {
            // 标记为已更改
            self.changed = true;
        });
    });
}

/**
 * 管理系列录制按钮点击事件处理函数
 */
function onManageSeriesRecordingClick() {
    const options = this.options;

    // 如果没有系列计时器ID，则直接返回
    if (!this.SeriesTimerId) {
        return;
    }

    const self = this;

    // 动态导入系列录制编辑器并显示
    import('./seriesrecordingeditor').then(({ default: seriesRecordingEditor }) => {
        seriesRecordingEditor.show(self.SeriesTimerId, options.serverId, {

            enableCancel: false

        }).then(function () {
            // 标记为已更改
            self.changed = true;
        });
    });
}

/**
 * 单个录制按钮状态改变事件处理函数
 * @param {Event} e - 事件对象
 */
function onRecordChange(e) {
    // 标记为已更改
    this.changed = true;

    const self = this;
    const options = this.options;
    // 获取API客户端
    const apiClient = ServerConnections.getApiClient(options.serverId);

    // 获取按钮元素
    const button = dom.parentWithTag(e.target, 'BUTTON');
    // 判断是否选中（通过图标是否激活来判断）
    const isChecked = !button.querySelector('.material-icons').classList.contains('recordingIcon-active');

    // 判断是否有启用的计时器
    const hasEnabledTimer = this.TimerId && this.Status !== 'Cancelled';

    if (isChecked) {
        // 如果选中但没有启用的计时器，创建新录制
        if (!hasEnabledTimer) {
            loading.show();
            recordingHelper.createRecording(apiClient, options.programId, false).then(function () {
                // 触发录制变更事件
                Events.trigger(self, 'recordingchanged');
                // 重新获取数据
                fetchData(self);
                loading.hide();
            });
        }
    } else if (hasEnabledTimer) {
        // 如果取消选中且有启用的计时器，取消录制
        loading.show();
        recordingHelper.cancelTimer(apiClient, this.TimerId, true).then(function () {
            // 触发录制变更事件
            Events.trigger(self, 'recordingchanged');
            // 重新获取数据
            fetchData(self);
            loading.hide();
        });
    }
}

/**
 * 系列录制按钮状态改变事件处理函数
 * @param {Event} e - 事件对象
 */
function onRecordSeriesChange(e) {
    // 标记为已更改
    this.changed = true;

    const self = this;
    const options = this.options;
    // 获取API客户端
    const apiClient = ServerConnections.getApiClient(options.serverId);

    // 获取按钮元素
    const button = dom.parentWithTag(e.target, 'BUTTON');
    // 判断是否选中（通过图标是否激活来判断）
    const isChecked = !button.querySelector('.material-icons').classList.contains('recordingIcon-active');

    if (isChecked) {
        // 显示系列录制容器
        options.parent.querySelector('.recordSeriesContainer').classList.remove('hide');
        if (!this.SeriesTimerId) {
            // 如果已有单个录制计时器，则转换为系列录制；否则创建新的系列录制
            const promise = this.TimerId ?
                recordingHelper.changeRecordingToSeries(apiClient, this.TimerId, options.programId) :
                recordingHelper.createRecording(apiClient, options.programId, true);
            promise.then(function () {
                // 重新获取数据
                fetchData(self);
            });
        }
    } else if (this.SeriesTimerId) {
        // 取消系列录制
        apiClient.cancelLiveTvSeriesTimer(this.SeriesTimerId).then(function () {
            // 显示取消提示
            toast(globalize.translate('RecordingCancelled'));
            // 重新获取数据
            fetchData(self);
        });
    }
}

// 导出录制编辑器类
export default RecordingEditor;
