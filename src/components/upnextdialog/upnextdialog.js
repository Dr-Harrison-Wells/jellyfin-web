// 导入DOM操作工具
import dom from '../../scripts/dom';
// 导入播放管理器，用于控制媒体播放
import { playbackManager } from '../playback/playbackmanager';
// 导入事件工具，用于事件触发和监听
import Events from '../../utils/events.ts';
// 导入媒体信息组件，用于显示媒体详情
import mediaInfo from '../mediainfo/mediainfo';
// 导入布局管理器，用于判断设备类型（如TV）
import layoutManager from '../layoutManager';
// 导入焦点管理器，用于管理界面焦点
import focusManager from '../focusManager';
// 导入国际化工具，用于文本翻译
import globalize from '../../lib/globalize';
// 导入服务器连接工具
import { ServerConnections } from 'lib/jellyfin-apiclient';
// 导入项目辅助工具，用于处理媒体项目信息
import itemHelper from '../itemHelper';

// 导入样式文件
import './upnextdialog.scss';
import '../../elements/emby-button/emby-button';
import '../../styles/flexstyles.scss';

// 获取当前浏览器支持的过渡动画结束事件名称
const transitionEndEventName = dom.whichTransitionEvent();

/**
 * 生成"即将播放"对话框的HTML结构
 * @returns {string} 对话框的HTML字符串
 */
function getHtml() {
    let html = '';

    // 主容器，使用flex布局，垂直排列
    html += '<div class="flex flex-direction-column flex-grow">';

    // 显示"下一个视频将在X秒后播放"的文本
    html += '<h2 class="upNextDialog-nextVideoText" style="margin:.25em 0;">&nbsp;</h2>';

    // 显示下一个视频的标题
    html += '<h3 class="upNextDialog-title" style="margin:.25em 0 .5em;"></h3>';

    // 媒体信息容器（评分、首播日期等）
    html += '<div class="flex flex-direction-row upNextDialog-mediainfo">';
    html += '</div>';

    // 按钮容器
    html += '<div class="flex flex-direction-row upNextDialog-buttons" style="margin-top:1em;">';

    // "立即播放"按钮
    html += '<button type="button" is="emby-button" class="raised raised-mini btnStartNow upNextDialog-button">';
    html += globalize.translate('HeaderStartNow');
    html += '</button>';

    // "隐藏"按钮
    html += '<button type="button" is="emby-button" class="raised raised-mini btnHide upNextDialog-button">';
    html += globalize.translate('Hide');
    html += '</button>';

    // 结束按钮容器
    html += '</div>';

    // 结束主容器
    html += '</div>';

    return html;
}

/**
 * 设置并更新"下一个视频"的倒计时文本
 * 根据剩余时间和视频类型（剧集或普通视频）显示不同的提示文本
 */
function setNextVideoText() {
    const instance = this;

    const elem = instance.options.parent;

    // 计算剩余秒数（最小为0）
    const secondsRemaining = Math.max(Math.round(getTimeRemainingMs(instance) / 1000), 0);

    console.debug('up next seconds remaining: ' + secondsRemaining);

    // 生成倒计时文本的HTML
    const timeText = '<span class="upNextDialog-countdownText">' + globalize.translate('HeaderSecondsValue', secondsRemaining) + '</span>';

    let nextVideoText;
    // 根据媒体类型（剧集或普通视频）显示不同的文本
    if (instance.itemType === 'Episode') {
        // 如果显示静态文本（自动播放关闭），则不显示倒计时
        nextVideoText = instance.showStaticNextText ?
            globalize.translate('HeaderNextEpisode') :
            globalize.translate('HeaderNextEpisodePlayingInValue', timeText);
    } else {
        nextVideoText = instance.showStaticNextText ?
            globalize.translate('HeaderNextVideo') :
            globalize.translate('HeaderNextVideoPlayingInValue', timeText);
    }

    // 更新DOM元素的内容
    elem.querySelector('.upNextDialog-nextVideoText').innerHTML = nextVideoText;
}

/**
 * 填充对话框中的媒体项目信息
 * @param {Object} item - 要播放的下一个媒体项目
 */
function fillItem(item) {
    const instance = this;

    const elem = instance.options.parent;

    // 填充媒体信息（评分、星级等）
    elem.querySelector('.upNextDialog-mediainfo').innerHTML = mediaInfo.getPrimaryMediaInfoHtml(item, {
        criticRating: true, // 显示评论家评分
        originalAirDate: false, // 不显示首播日期
        starRating: true, // 显示星级评分
        subtitles: false // 不显示字幕信息
    });

    // 获取显示名称
    let title = itemHelper.getDisplayName(item);
    // 如果是剧集，则在标题前加上系列名称
    if (item.SeriesName) {
        title = item.SeriesName + ' - ' + title;
    }

    // 设置标题文本
    elem.querySelector('.upNextDialog-title').innerText = title || '';

    // 保存媒体类型（用于判断显示文本）
    instance.itemType = item.Type;

    // 显示对话框
    instance.show();
}

/**
 * 清除倒计时更新定时器
 * @param {UpNextDialog} instance - 对话框实例
 */
function clearCountdownTextTimeout(instance) {
    if (instance._countdownTextTimeout) {
        clearInterval(instance._countdownTextTimeout);
        instance._countdownTextTimeout = null;
    }
}

/**
 * "立即播放"按钮点击事件处理函数
 * 隐藏对话框并立即播放下一个媒体
 */
async function onStartNowClick() {
    const options = this.options;

    if (options) {
        const player = options.player;

        // 隐藏对话框
        await this.hide();

        // 播放下一个曲目/视频
        playbackManager.nextTrack(player);
    }
}

/**
 * 初始化"即将播放"对话框
 * @param {UpNextDialog} instance - 对话框实例
 * @param {Object} options - 配置选项，包含父元素、下一个项目等信息
 */
async function init(instance, options) {
    // 检查用户是否禁用了自动播放，如果禁用则显示静态文本
    instance.showStaticNextText = await showStaticNextText(options.nextItem);

    // 生成并插入HTML结构
    options.parent.innerHTML = getHtml();

    // 初始化时隐藏对话框
    options.parent.classList.add('hide');
    options.parent.classList.add('upNextDialog');
    options.parent.classList.add('upNextDialog-hidden');

    // 填充媒体项目信息
    fillItem.call(instance, options.nextItem);

    // 绑定"隐藏"按钮点击事件
    options.parent.querySelector('.btnHide').addEventListener('click', instance.hide.bind(instance));
    // 绑定"立即播放"按钮点击事件
    options.parent.querySelector('.btnStartNow').addEventListener('click', onStartNowClick.bind(instance));
}

/**
 * 清除隐藏动画的事件监听器
 * @param {UpNextDialog} instance - 对话框实例
 * @param {HTMLElement} elem - DOM元素
 */
function clearHideAnimationEventListeners(instance, elem) {
    const fn = instance._onHideAnimationComplete;

    if (fn) {
        dom.removeEventListener(elem, transitionEndEventName, fn, {
            once: true
        });
    }
}

/**
 * 隐藏动画完成时的回调函数
 * @param {Event} e - 过渡事件对象
 */
function onHideAnimationComplete(e) {
    const instance = this;
    const elem = e.target;

    // 添加hide类完全隐藏元素
    elem.classList.add('hide');

    // 清除动画事件监听器
    clearHideAnimationEventListeners(instance, elem);
    // 触发hide事件，通知外部对话框已隐藏
    Events.trigger(instance, 'hide');
}

/**
 * 隐藏"即将播放"对话框
 * 使用CSS过渡动画平滑隐藏对话框
 */
async function hideComingUpNext() {
    const instance = this;
    // 清除倒计时定时器
    clearCountdownTextTimeout(this);

    if (!instance.options) {
        return;
    }

    const elem = instance.options.parent;

    if (!elem) {
        return;
    }

    // 清除之前的动画事件监听器
    clearHideAnimationEventListeners(this, elem);

    // 如果已经隐藏，则直接返回
    if (elem.classList.contains('upNextDialog-hidden')) {
        return;
    }

    // 绑定动画完成回调函数
    const fn = onHideAnimationComplete.bind(instance);
    instance._onHideAnimationComplete = fn;

    // 等待过渡动画完成
    const transitionEvent = await new Promise((resolve) => {
        dom.addEventListener(elem, transitionEndEventName, resolve, {
            once: true
        });

        // 触发重排以确保动画执行
        void elem.offsetWidth;

        // 添加隐藏类触发CSS过渡动画
        elem.classList.add('upNextDialog-hidden');
    });

    // 调用动画完成回调
    instance._onHideAnimationComplete(transitionEvent);
}

/**
 * 计算当前播放媒体的剩余时间（毫秒）
 * @param {UpNextDialog} instance - 对话框实例
 * @returns {number} 剩余时间（毫秒）
 */
function getTimeRemainingMs(instance) {
    const options = instance.options;
    if (options) {
        // 获取总时长（以ticks为单位，1 tick = 100纳秒）
        const runtimeTicks = playbackManager.duration(options.player);

        if (runtimeTicks) {
            // 计算剩余时间（ticks）= 总时长 - 当前时间 * 10000
            // 当前时间是秒，需要转换为ticks（1秒 = 10,000,000 ticks）
            const timeRemainingTicks = runtimeTicks - playbackManager.currentTime(options.player) * 10000;

            // 转换为毫秒（1 tick = 0.0001毫秒）
            return Math.round(timeRemainingTicks / 10000);
        }
    }

    return 0;
}

/**
 * 启动倒计时定时器
 * 每隔400毫秒更新一次倒计时文本
 * @param {UpNextDialog} instance - 对话框实例
 */
function startComingUpNextHideTimer(instance) {
    const timeRemainingMs = getTimeRemainingMs(instance);

    // 如果没有剩余时间，则不启动定时器
    if (timeRemainingMs <= 0) {
        return;
    }

    // 首次设置文本
    setNextVideoText.call(instance);
    // 清除旧的定时器
    clearCountdownTextTimeout(instance);

    // 如果不是静态文本（即启用了自动播放），则启动定时器定期更新倒计时
    if (!instance.showStaticNextText) instance._countdownTextTimeout = setInterval(setNextVideoText.bind(instance), 400);
}

/**
 * 检查是否应该显示静态文本（无倒计时）
 * 根据用户配置判断是否启用了自动播放
 * @param {Object} nextItem - 下一个要播放的媒体项目
 * @returns {Promise<boolean>} 如果用户禁用了自动播放，返回true
 */
async function showStaticNextText(nextItem) {
    const apiClient = ServerConnections.getApiClient(nextItem);
    const currentUser = await apiClient.getCurrentUser();
    // 返回自动播放配置的反值（禁用自动播放 = 显示静态文本）
    return !currentUser.Configuration.EnableNextEpisodeAutoPlay;
}

/**
 * "即将播放"对话框类
 * 用于在当前媒体即将结束时显示下一个视频的预告
 * 提供倒计时和快速跳转功能
 */
class UpNextDialog {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {HTMLElement} options.parent - 父容器元素
     * @param {Object} options.player - 播放器实例
     * @param {Object} options.nextItem - 下一个要播放的媒体项目
     */
    constructor(options) {
        this.options = options;
        this.showStaticNextText = false; // 默认显示倒计时文本

        // 初始化对话框
        init(this, options);
    }
    /**
     * 显示对话框
     * 使用CSS过渡动画平滑显示，并启动倒计时
     */
    show() {
        const elem = this.options.parent;

        // 清除之前的动画事件监听器
        clearHideAnimationEventListeners(this, elem);

        // 移除隐藏类
        elem.classList.remove('hide');

        // 触发重排以确保动画执行
        void elem.offsetWidth;

        // 移除隐藏类触发CSS过渡动画
        elem.classList.remove('upNextDialog-hidden');

        // 如果是TV设备，自动聚焦到"立即播放"按钮
        if (layoutManager.tv) {
            setTimeout(function () {
                focusManager.focus(elem.querySelector('.btnStartNow'));
            }, 50);
        }

        // 启动倒计时定时器
        startComingUpNextHideTimer(this);
    }
    /**
     * 隐藏对话框
     */
    async hide() {
        await hideComingUpNext.bind(this)();
    }
    /**
     * 销毁对话框
     * 清理所有资源和引用
     */
    destroy() {
        // 隐藏对话框
        hideComingUpNext.call(this);

        // 清理引用
        this.options = null;
        this.showStaticNextText = false;
        this.itemType = null;
    }
}

// 导出类供外部使用
export default UpNextDialog;
