// 导入对话框辅助工具
import dialogHelper from '../dialogHelper/dialogHelper';
// 导入全球化/国际化工具
import globalize from '../../lib/globalize';
// 导入服务器连接管理器
import { ServerConnections } from 'lib/jellyfin-apiclient';
// 导入布局管理器
import layoutManager from '../layoutManager';
// 导入媒体信息组件
import mediaInfo from '../mediainfo/mediainfo';
// 导入加载动画组件
import loading from '../loading/loading';
// 导入滚动辅助工具
import scrollHelper from '../../scripts/scrollHelper';
// 导入日期时间处理工具
import datetime from '../../scripts/datetime';
// 导入图片懒加载器
import imageLoader from '../images/imageLoader';
// 导入录制字段组件
import RecordingFields from './recordingfields';
// 导入事件处理工具
import Events from '../../utils/events.ts';

import '../../elements/emby-button/emby-button';
import '../../elements/emby-button/paper-icon-button-light';
import '../../elements/emby-checkbox/emby-checkbox';
import '../../elements/emby-collapse/emby-collapse';
import '../../elements/emby-input/emby-input';
import '../formdialog.scss';
import './recordingcreator.scss';
import 'material-design-icons-iconfont';
import { playbackManager } from '../playback/playbackmanager';
import template from './recordingcreator.template.html';

import PlaceholderImage from './empty.png';

// 当前打开的对话框实例
let currentDialog;
// 关闭对话框时的操作类型（如'play'表示播放）
let closeAction;
// 当前录制字段组件实例
let currentRecordingFields;

/**
 * 关闭当前对话框
 */
function closeDialog() {
    dialogHelper.close(currentDialog);
}

/**
 * 初始化对话框事件监听器
 * @param {HTMLElement} context - 对话框容器元素
 */
function init(context) {
    // 播放按钮点击事件：设置关闭操作为播放，然后关闭对话框
    context.querySelector('.btnPlay').addEventListener('click', function () {
        closeAction = 'play';
        closeDialog();
    });

    // 取消按钮点击事件：清除关闭操作，然后关闭对话框
    context.querySelector('.btnCancel').addEventListener('click', function () {
        closeAction = null;
        closeDialog();
    });
}

/**
 * 获取节目项的图片URL
 * @param {Object} item - 节目项对象
 * @param {Object} apiClient - API客户端实例
 * @param {number} imageHeight - 图片最大高度
 * @returns {string|null} 图片URL或null
 */
function getImageUrl(item, apiClient, imageHeight) {
    // 获取图片标签，如果不存在则使用空对象
    const imageTags = item.ImageTags || {};

    // 如果存在主图片标签，则设置到imageTags中
    if (item.PrimaryImageTag) {
        imageTags.Primary = item.PrimaryImageTag;
    }

    // 优先使用主图片
    if (imageTags.Primary) {
        return apiClient.getScaledImageUrl(item.Id, {
            type: 'Primary',
            maxHeight: imageHeight,
            tag: item.ImageTags.Primary
        });
    } else if (imageTags.Thumb) {
        // 如果没有主图片，使用缩略图
        return apiClient.getScaledImageUrl(item.Id, {
            type: 'Thumb',
            maxHeight: imageHeight,
            tag: item.ImageTags.Thumb
        });
    }

    // 如果都没有，返回null
    return null;
}

/**
 * 渲染录制对话框内容
 * @param {HTMLElement} context - 对话框容器元素
 * @param {Object} defaultTimer - 默认计时器设置
 * @param {Object} program - 节目对象
 * @param {Object} apiClient - API客户端实例
 * @param {boolean} refreshRecordingStateOnly - 是否仅刷新录制状态
 */
function renderRecording(context, defaultTimer, program, apiClient, refreshRecordingStateOnly) {
    // 如果不是仅刷新录制状态，则更新所有UI元素
    if (!refreshRecordingStateOnly) {
        // 获取节目图片URL
        const imgUrl = getImageUrl(program, apiClient, 200);
        const imageContainer = context.querySelector('.recordingDialog-imageContainer');

        if (imgUrl) {
            // 使用懒加载方式显示图片
            imageContainer.innerHTML = `<img src="${PlaceholderImage}" data-src="${imgUrl}" class="recordingDialog-img lazy" />`;
            imageContainer.classList.remove('hide');

            imageLoader.lazyChildren(imageContainer);
        } else {
            // 没有图片时隐藏图片容器
            imageContainer.innerHTML = '';
            imageContainer.classList.add('hide');
        }

        // 设置节目名称
        context.querySelector('.recordingDialog-itemName').innerText = program.Name;
        context.querySelector('.formDialogHeaderTitle').innerText = program.Name;
        // 设置节目类型（用' / '分隔）
        context.querySelector('.itemGenres').innerText = (program.Genres || []).join(' / ');
        // 设置节目概述
        context.querySelector('.itemOverview').innerText = program.Overview || '';

        // 根据节目是否正在播放决定是否显示底部按钮
        const formDialogFooter = context.querySelector('.formDialogFooter');
        const now = new Date();
        if (now >= datetime.parseISO8601Date(program.StartDate, true) && now < datetime.parseISO8601Date(program.EndDate, true)) {
            // 节目正在播放中，显示底部按钮
            formDialogFooter.classList.remove('hide');
        } else {
            // 节目未播放，隐藏底部按钮
            formDialogFooter.classList.add('hide');
        }

        // 设置主要媒体信息
        context.querySelector('.itemMiscInfoPrimary').innerHTML = mediaInfo.getPrimaryMediaInfoHtml(program);
    }

    // 设置次要媒体信息
    context.querySelector('.itemMiscInfoSecondary').innerHTML = mediaInfo.getSecondaryMediaInfoHtml(program, {
    });

    // 隐藏加载动画
    loading.hide();
}

/**
 * 重新加载录制对话框数据
 * @param {HTMLElement} context - 对话框容器元素
 * @param {string} programId - 节目ID
 * @param {string} serverId - 服务器ID
 * @param {boolean} refreshRecordingStateOnly - 是否仅刷新录制状态
 */
function reload(context, programId, serverId, refreshRecordingStateOnly) {
    // 显示加载动画
    loading.show();

    // 获取API客户端
    const apiClient = ServerConnections.getApiClient(serverId);

    // 并行请求默认定时器设置和节目信息
    const promise1 = apiClient.getNewLiveTvTimerDefaults({ programId: programId });
    const promise2 = apiClient.getLiveTvProgram(programId, apiClient.getCurrentUserId());

    // 等待两个请求都完成后渲染录制信息
    Promise.all([promise1, promise2]).then(function (responses) {
        const defaults = responses[0];
        const program = responses[1];

        renderRecording(context, defaults, program, apiClient, refreshRecordingStateOnly);
    });
}

/**
 * 执行对话框关闭时的操作
 * @param {string} action - 操作类型（如'play'表示播放）
 * @param {string} programId - 节目ID
 * @param {string} serverId - 服务器ID
 */
function executeCloseAction(action, programId, serverId) {
    // 如果操作是播放，则获取节目信息并播放对应频道
    if (action === 'play') {
        const apiClient = ServerConnections.getApiClient(serverId);

        apiClient.getLiveTvProgram(programId, apiClient.getCurrentUserId()).then(function (item) {
            // 播放节目所在的频道
            playbackManager.play({
                ids: [item.ChannelId],
                serverId: serverId
            });
        });
    }
}

/**
 * 显示录制编辑器对话框
 * @param {string} itemId - 节目项ID
 * @param {string} serverId - 服务器ID
 * @returns {Promise} 返回Promise，resolve表示有更改，reject表示无更改
 */
function showEditor(itemId, serverId) {
    return new Promise(function (resolve, reject) {
        // 重置关闭操作
        closeAction = null;

        // 显示加载动画
        loading.show();

        // 配置对话框选项
        const dialogOptions = {
            removeOnClose: true, // 关闭时移除DOM元素
            scrollY: false // 禁用垂直滚动
        };

        // 根据设备类型设置对话框大小
        if (layoutManager.tv) {
            dialogOptions.size = 'fullscreen'; // TV设备使用全屏
        } else {
            dialogOptions.size = 'small'; // 其他设备使用小尺寸
        }

        // 创建对话框
        const dlg = dialogHelper.createDialog(dialogOptions);

        // 添加样式类
        dlg.classList.add('formDialog');
        dlg.classList.add('recordingDialog');

        let html = '';

        // 翻译并插入模板HTML
        html += globalize.translateHtml(template, 'core');

        dlg.innerHTML = html;

        // 保存当前对话框引用
        currentDialog = dlg;

        // 录制信息变更时的回调函数
        function onRecordingChanged() {
            reload(dlg, itemId, serverId, true);
        }

        // 监听对话框关闭事件
        dlg.addEventListener('close', function () {
            // 移除录制变更事件监听
            Events.off(currentRecordingFields, 'recordingchanged', onRecordingChanged);
            // 执行关闭操作（如播放）
            executeCloseAction(closeAction, itemId, serverId);

            // 根据是否有更改来决定resolve或reject
            if (currentRecordingFields?.hasChanged()) {
                resolve(); // 有更改，resolve
            } else {
                reject(); // 无更改，reject
            }
        });

        // 在TV设备上启用焦点居中
        if (layoutManager.tv) {
            scrollHelper.centerFocus.on(dlg.querySelector('.formDialogContent'), false);
        }

        // 初始化对话框事件监听器
        init(dlg);

        // 加载录制数据
        reload(dlg, itemId, serverId);

        // 创建录制字段组件
        currentRecordingFields = new RecordingFields({
            parent: dlg.querySelector('.recordingFields'),
            programId: itemId,
            serverId: serverId
        });

        // 监听录制变更事件
        Events.on(currentRecordingFields, 'recordingchanged', onRecordingChanged);

        // 打开对话框
        dialogHelper.open(dlg);
    });
}

// 导出录制创建器模块
export default {
    show: showEditor // 显示录制编辑器的方法
};
