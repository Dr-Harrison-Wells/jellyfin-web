/**
 * 视频播放器控制器
 *
 * 这个模块是Jellyfin Web应用的核心视频播放控制器，负责管理所有视频播放相关的UI交互和控制逻辑。
 *
 * 主要功能模块：
 * 1. OSD（屏幕显示）管理 - 控制播放界面的显示和隐藏
 * 2. 播放控制 - 播放、暂停、快进、快退、跳转等
 * 3. 音量控制 - 音量调节和静音
 * 4. 字幕/音频轨道管理 - 多轨道选择和切换
 * 5. 进度显示 - 支持按时长和按时间点两种模式
 * 6. 章节导航 - 章节跳转和预览
 * 7. Trickplay预览 - 进度条上的视频缩略图预览
 * 8. 即将播放 - 自动显示下一集提示
 * 9. 录制控制 - 直播电视录制功能
 * 10. 键盘快捷键 - 丰富的键盘控制支持
 * 11. SyncPlay同步播放 - 多用户同步观看
 * 12. 统计信息 - 播放器性能统计显示
 *
 * 支持的快捷键：
 * - 空格/K: 播放/暂停
 * - 上/下箭头: 音量控制
 * - 左/右箭头(J/L): 快退/快进
 * - F: 全屏切换
 * - M: 静音切换
 * - Shift+P/N: 上一曲/下一曲
 * - PageUp/Down: 章节切换
 * - 0-9: 跳转到对应百分比位置
 * - Shift+</>: 调整播放速度
 * - G/H: 字幕偏移调整
 * - Home/End: 跳转到开头/结尾
 *
 * @module controllers/playback/video
 */

// 导入依赖库
import escapeHtml from 'escape-html';

// 导入播放器相关常量和类型
import { PlayerEvent } from 'apps/stable/features/playback/constants/playerEvent';
import { AppFeature } from 'constants/appFeature';
import { TICKS_PER_MINUTE, TICKS_PER_SECOND } from 'constants/time';
import { EventType } from 'types/eventType';

// 导入核心组件和管理器
import { playbackManager } from '../../../components/playback/playbackmanager';
import browser from '../../../scripts/browser';
import dom from '../../../scripts/dom';
import inputManager from '../../../scripts/inputManager';
import mouseManager from '../../../scripts/mouseManager';
import datetime from '../../../scripts/datetime';
import itemHelper from '../../../components/itemHelper';
import mediaInfo from '../../../components/mediainfo/mediainfo';
import focusManager from '../../../components/focusManager';
import Events from '../../../utils/events.ts';
import globalize from '../../../lib/globalize';
import { appHost } from '../../../components/apphost';
import layoutManager from '../../../components/layoutManager';
import * as userSettings from '../../../scripts/settings/userSettings';
import keyboardnavigation from '../../../scripts/keyboardNavigation';

// 导入样式文件
import '../../../styles/scrollstyles.scss';
import '../../../elements/emby-slider/emby-slider';
import '../../../elements/emby-button/paper-icon-button-light';
import '../../../elements/emby-ratingbutton/emby-ratingbutton';
import '../../../styles/videoosd.scss';

// 导入辅助工具和路由
import shell from '../../../scripts/shell';
import SubtitleSync from '../../../components/subtitlesync/subtitlesync';
import { appRouter } from '../../../components/router/appRouter';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import LibraryMenu from '../../../scripts/libraryMenu';
import { setBackdropTransparency, TRANSPARENCY_LEVEL } from '../../../components/backdrop/backdrop';
import { pluginManager } from '../../../components/pluginManager';
import { PluginType } from '../../../types/plugin.ts';

/**
 * 获取当前打开的对话框
 * @returns {Element|null} 打开的对话框元素
 */
function getOpenedDialog() {
    return document.querySelector('.dialogContainer .dialog.opened');
}

/**
 * 视频播放器控制器主函数
 * 处理视频播放的所有UI交互和控制逻辑
 * @param {HTMLElement} view - 视频播放器视图容器
 */
export default function (view) {
    /**
     * 获取要显示的媒体项
     * 对于电视频道，获取当前正在播放的节目
     * @param {Object} item - 媒体项对象
     * @returns {Promise<Object>} 包含原始项和显示项的Promise
     */
    function getDisplayItem(item) {
        // 如果是电视频道，获取当前节目信息
        if (item.Type === 'TvChannel') {
            const apiClient = ServerConnections.getApiClient(item.ServerId);
            return apiClient.getItem(apiClient.getCurrentUserId(), item.Id).then(function (refreshedItem) {
                return {
                    originalItem: refreshedItem,
                    displayItem: refreshedItem.CurrentProgram
                };
            });
        }

        // 其他类型直接返回原始项
        return Promise.resolve({
            originalItem: item
        });
    }

    /**
     * 更新录制按钮状态
     * 根据媒体项类型和用户权限显示或隐藏录制按钮
     * @param {Object} item - 媒体项对象
     */
    function updateRecordingButton(item) {
        // 如果不是节目类型，隐藏录制按钮
        if (!item || item.Type !== 'Program') {
            if (recordingButtonManager) {
                recordingButtonManager.destroy();
                recordingButtonManager = null;
            }

            view.querySelector('.btnRecord').classList.add('hide');
            return;
        }

        // 检查用户是否有直播电视管理权限
        ServerConnections.getApiClient(item.ServerId).getCurrentUser().then(function (user) {
            if (user.Policy.EnableLiveTvManagement) {
                // 动态导入录制按钮组件
                import('../../../components/recordingcreator/recordingbutton').then(({ default: RecordingButton }) => {
                    if (recordingButtonManager) {
                        recordingButtonManager.refreshItem(item);
                        return;
                    }

                    // 创建录制按钮管理器
                    recordingButtonManager = new RecordingButton({
                        item: item,
                        button: view.querySelector('.btnRecord')
                    });
                    view.querySelector('.btnRecord').classList.remove('hide');
                });
            }
        });
    }

    /**
     * 更新显示项的信息
     * 包括标题、录制按钮、媒体信息、时间显示、评分按钮和Trickplay预览
     * @param {Object} itemInfo - 包含原始项和显示项的对象
     */
    function updateDisplayItem(itemInfo) {
        const item = itemInfo.originalItem;
        currentItem = item;
        const displayItem = itemInfo.displayItem || item;
        updateRecordingButton(displayItem);

        // 获取父级名称（系列名或专辑名）
        let parentName = displayItem.SeriesName || displayItem.Album;

        if (displayItem.EpisodeTitle || displayItem.IsSeries) {
            parentName = displayItem.Name;
        }

        setTitle(displayItem, parentName);

        // 更新次要媒体信息
        const secondaryMediaInfo = view.querySelector('.osdSecondaryMediaInfo');
        const secondaryMediaInfoHtml = mediaInfo.getSecondaryMediaInfoHtml(displayItem, {
            startDate: false,
            programTime: false
        });
        secondaryMediaInfo.innerHTML = secondaryMediaInfoHtml;

        if (secondaryMediaInfoHtml) {
            secondaryMediaInfo.classList.remove('hide');
        } else {
            secondaryMediaInfo.classList.add('hide');
        }

        // 根据时间显示进度（仅用于电视频道）
        if (enableProgressByTimeOfDay) {
            setDisplayTime(startTimeText, displayItem.StartDate);
            setDisplayTime(endTimeText, displayItem.EndDate);
            startTimeText.classList.remove('hide');
            endTimeText.classList.remove('hide');
            programStartDateMs = displayItem.StartDate ? datetime.parseISO8601Date(displayItem.StartDate).getTime() : 0;
            programEndDateMs = displayItem.EndDate ? datetime.parseISO8601Date(displayItem.EndDate).getTime() : 0;
        } else {
            startTimeText.classList.add('hide');
            endTimeText.classList.add('hide');
            startTimeText.innerHTML = '';
            endTimeText.innerHTML = '';
            programStartDateMs = 0;
            programEndDateMs = 0;
        }

        // 设置当前播放项的用户评分按钮
        const btnUserRating = view.querySelector('.btnUserRating');

        if (itemHelper.canRate(currentItem)) {
            btnUserRating.classList.remove('hide');
            btnUserRating.setItem(currentItem);
        } else {
            btnUserRating.classList.add('hide');
            btnUserRating.setItem(null);
        }

        // 更新Trickplay数据（视频预览缩略图）
        trickplayResolution = null;

        const mediaSourceId = currentPlayer.streamInfo.mediaSource.Id;
        const trickplayResolutions = item.Trickplay?.[mediaSourceId];
        if (trickplayResolutions) {
            // 优先选择不超过屏幕宽度20%的最高分辨率
            let bestWidth;
            const maxWidth = window.screen.width * window.devicePixelRatio * 0.2;
            for (const [, info] of Object.entries(trickplayResolutions)) {
                if (!bestWidth
                        || (info.Width < bestWidth && bestWidth > maxWidth) // 对象不保证排序，第一个宽度可能大于maxWidth
                        || (info.Width > bestWidth && info.Width <= maxWidth)) {
                    bestWidth = info.Width;
                }
            }

            if (bestWidth) trickplayResolution = trickplayResolutions[bestWidth];
        }
    }

    /**
     * 获取不带上午/下午的显示时间
     * 用于直播电视频道的时间显示，移除AM/PM标记
     * @param {Date} date - 日期对象
     * @param {boolean} showSeconds - 是否显示秒
     * @returns {string} 格式化的时间字符串
     */
    function getDisplayTimeWithoutAmPm(date, showSeconds) {
        if (showSeconds) {
            return datetime.toLocaleTimeString(date, {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit'
            }).toLowerCase().replace('am', '').replace('pm', '').trim();
        }

        return datetime.getDisplayTime(date).toLowerCase().replace('am', '').replace('pm', '').trim();
    }

    /**
     * 设置元素的显示时间
     * 将ISO 8601格式的日期字符串转换为显示时间并设置到元素中
     * @param {HTMLElement} elem - 目标元素
     * @param {string} date - ISO 8601格式的日期字符串
     */
    function setDisplayTime(elem, date) {
        let html;

        if (date) {
            date = datetime.parseISO8601Date(date);
            html = getDisplayTimeWithoutAmPm(date);
        }

        elem.innerHTML = html || '';
    }

    /**
     * 判断是否应该按时间显示进度
     * 仅当媒体项是电视频道且有当前节目时启用
     * @param {Object} item - 媒体项对象
     * @returns {boolean} 是否启用时间进度
     */
    function shouldEnableProgressByTimeOfDay(item) {
        return !(item.Type !== 'TvChannel' || !item.CurrentProgram);
    }

    /**
     * 更新正在播放的信息
     * 更新标题、控制按钮、字幕/音频按钮、章节按钮等所有UI元素
     * @param {Object} player - 播放器对象
     * @param {Object} state - 播放状态对象
     */
    function updateNowPlayingInfo(player, state) {
        const item = state.NowPlayingItem;

        currentItem = item;
        // 如果没有播放项，重置所有UI元素
        if (!item) {
            updateRecordingButton(null);
            LibraryMenu.setTitle('');
            nowPlayingVolumeSlider.disabled = true;
            nowPlayingPositionSlider.disabled = true;
            btnFastForward.disabled = true;
            btnRewind.disabled = true;
            view.querySelector('.btnSubtitles').classList.add('hide');
            view.querySelector('.btnAudio').classList.add('hide');
            view.querySelector('.osdTitle').innerHTML = '';
            view.querySelector('.osdMediaInfo').innerHTML = '';
            return;
        }

        // 启用按时间显示进度（仅用于电视频道）
        enableProgressByTimeOfDay = shouldEnableProgressByTimeOfDay(item);
        getDisplayItem(item).then(updateDisplayItem);

        // 启用播放控制
        nowPlayingVolumeSlider.disabled = false;
        nowPlayingPositionSlider.disabled = false;
        btnFastForward.disabled = false;
        btnRewind.disabled = false;

        // 显示或隐藏字幕按钮
        if (playbackManager.subtitleTracks(player).length) {
            view.querySelector('.btnSubtitles').classList.remove('hide');
            toggleSubtitleSync();
        } else {
            view.querySelector('.btnSubtitles').classList.add('hide');
            toggleSubtitleSync('forceToHide');
        }

        // 显示或隐藏音频轨道按钮
        if (playbackManager.audioTracks(player).length > 1) {
            view.querySelector('.btnAudio').classList.remove('hide');
        } else {
            view.querySelector('.btnAudio').classList.add('hide');
        }

        // 显示或隐藏章节按钮
        if (currentItem.Chapters?.length > 1) {
            view.querySelector('.btnPreviousChapter').classList.remove('hide');
            view.querySelector('.btnNextChapter').classList.remove('hide');
        } else {
            view.querySelector('.btnPreviousChapter').classList.add('hide');
            view.querySelector('.btnNextChapter').classList.add('hide');
        }
    }

    /**
     * 设置标题
     * 设置页面标题和浏览器标题，包括年份信息（如果有）
     * @param {Object} item - 媒体项对象
     * @param {string} parentName - 父级名称（系列名或专辑名）
     */
    function setTitle(item, parentName) {
        let itemName = itemHelper.getDisplayName(item, {
            includeParentInfo: item.Type !== 'Program',
            includeIndexNumber: item.Type !== 'Program'
        });

        if (itemName && parentName) {
            itemName = `${parentName} - ${itemName}`;
        }

        if (!itemName) {
            itemName = parentName || '';
        }

        // 如果有首映日期，在标题中显示年份
        let title = itemName;
        if (item.Type == 'Movie' && item.ProductionYear) {
            title += ` (${datetime.toLocaleString(item.ProductionYear, { useGrouping: false })})`;
        } else if (item.PremiereDate) {
            try {
                const year = datetime.toLocaleString(datetime.parseISO8601Date(item.PremiereDate).getFullYear(), { useGrouping: false });
                title += ` (${year})`;
            } catch (e) {
                console.error(e);
            }
        }

        LibraryMenu.setTitle(title);

        const documentTitle = parentName || (item ? item.Name : null);

        if (documentTitle) {
            document.title = documentTitle;
        }
    }

    // 鼠标按下状态标志
    let mouseIsDown = false;

    /**
     * 显示OSD（屏幕显示）控制界面
     * 显示播放控制条和标题栏，并重置空闲计时器
     * @param {HTMLElement} focusElement - 要聚焦的元素（可选）
     */
    function showOsd(focusElement) {
        Events.trigger(document, EventType.SHOW_VIDEO_OSD, [ true ]);
        slideDownToShow(headerElement);
        showMainOsdControls(focusElement);
        resetIdle();
    }

    /**
     * 隐藏OSD控制界面
     * 隐藏播放控制条和标题栏，并隐藏鼠标光标
     */
    function hideOsd() {
        Events.trigger(document, EventType.SHOW_VIDEO_OSD, [ false ]);
        slideUpToHide(headerElement);
        hideMainOsdControls();
        mouseManager.hideCursor();
    }

    /**
     * 切换OSD显示状态
     * 如果当前OSD可见则隐藏，否则显示
     */
    function toggleOsd() {
        if (currentVisibleMenu === 'osd') {
            hideOsd();
        } else if (!currentVisibleMenu) {
            showOsd();
        }
    }

    /**
     * 启动OSD自动隐藏计时器
     * 3秒后自动隐藏OSD，先停止现有计时器
     */
    function startOsdHideTimer() {
        stopOsdHideTimer();
        osdHideTimeout = setTimeout(hideOsd, 3e3);
    }

    /**
     * 停止OSD自动隐藏计时器
     * 清除已设置的延时执行
     */
    function stopOsdHideTimer() {
        if (osdHideTimeout) {
            clearTimeout(osdHideTimeout);
            osdHideTimeout = null;
        }
    }

    /**
     * 下滑显示元素
     * 移除隐藏CSS类，使元素以动画形式显示
     * @param {HTMLElement} elem - 要显示的元素
     */
    function slideDownToShow(elem) {
        clearHideAnimationEventListeners(elem);
        elem.classList.remove('hide');
        elem.classList.remove('osdHeader-hidden');
    }

    /**
     * 上滑隐藏元素
     * 添加隐藏CSS类，并在动画结束后执行回调
     * @param {HTMLElement} elem - 要隐藏的元素
     */
    function slideUpToHide(elem) {
        clearHideAnimationEventListeners(elem);
        elem.classList.add('osdHeader-hidden');
        elem.addEventListener(transitionEndEventName, onHideAnimationComplete);
    }

    /**
     * 清除隐藏动画事件监听器
     * 移除transitionend事件监听器，防止重复执行
     * @param {HTMLElement} elem - 目标元素
     */
    function clearHideAnimationEventListeners(elem) {
        elem.removeEventListener(transitionEndEventName, onHideAnimationComplete);
    }

    /**
     * 隐藏动画完成回调
     * 在CSS过渡结束后添加hide类，并清除事件监听器
     * @param {Event} e - 事件对象
     */
    function onHideAnimationComplete(e) {
        const elem = e.target;
        if (elem !== osdBottomElement && elem !== headerElement) return;
        elem.classList.add('hide');
        elem.removeEventListener(transitionEndEventName, onHideAnimationComplete);
    }

    /**
     * 聚焦元素的内部函数
     * 如果没有提供聚焦元素，尝试保持当前聚焦，否则默认为暂停按钮
     * @param {HTMLElement} focusElement - 要聚焦的元素（可选）
     */
    const _focus = function (focusElement) {
        // 如果没有提供焦点元素，尝试保持当前焦点，否则默认为暂停按钮
        const currentFocus = focusElement || document.activeElement;
        if (!currentFocus || !focusManager.isCurrentlyFocusable(currentFocus)) {
            focusElement = osdBottomElement.querySelector('.btnPause');
        }

        if (focusElement) focusManager.focus(focusElement);
    };

    /**
     * 显示主要OSD控制界面
     * 显示底部控制条，并在非移动设备上设置聚焦
     * @param {HTMLElement} focusElement - 要聚焦的元素（可选）
     */
    function showMainOsdControls(focusElement) {
        if (!currentVisibleMenu) {
            const elem = osdBottomElement;
            currentVisibleMenu = 'osd';
            clearHideAnimationEventListeners(elem);
            elem.classList.remove('hide');
            elem.classList.remove('videoOsdBottom-hidden');

            if (!layoutManager.mobile) {
                _focus(focusElement);
            }
            toggleSubtitleSync();
        } else if (currentVisibleMenu === 'osd' && !layoutManager.mobile) {
            _focus(focusElement);
        }
    }

    /**
     * 隐藏主要OSD控制界面
     * 隐藏底部控制条，并取消元素聚焦
     */
    function hideMainOsdControls() {
        if (currentVisibleMenu === 'osd') {
            const elem = osdBottomElement;
            clearHideAnimationEventListeners(elem);
            elem.classList.add('videoOsdBottom-hidden');

            elem.addEventListener(transitionEndEventName, onHideAnimationComplete);
            currentVisibleMenu = null;
            toggleSubtitleSync('hide');

            // Firefox does not blur by itself
            if (osdBottomElement.contains(document.activeElement)
                || headerElement.contains(document.activeElement)) {
                document.activeElement.blur();
            }
        }
    }

    // TODO: 将所有空闲相关代码移至 `inputManager` 或 `idleManager` 或 `idleHelper`（每个对话框的处理），并从那里监听事件

    /**
     * 重置空闲计时器
     * 如果OSD当前可见且没有打开对话框，则重新启动隐藏计时器
     * 用于在用户交互后延长 OSD 显示时间
     */
    function resetIdle() {
        // 如果OSD当前可见且没有打开对话框，重新启动隐藏计时器
        if (currentVisibleMenu && !mouseIsDown && !getOpenedDialog()) {
            startOsdHideTimer();
        } else {
            stopOsdHideTimer();
        }
    }

    /**
     * 指针移动事件处理
     * 检测鼠标移动，只有移动超过10像素才显示OSD（防抖动）
     * @param {PointerEvent} e - 指针事件对象
     */
    function onPointerMove(e) {
        if ((e.pointerType || (layoutManager.mobile ? 'touch' : 'mouse')) === 'mouse') {
            const eventX = e.screenX || e.clientX || 0;
            const eventY = e.screenY || e.clientY || 0;
            const obj = lastPointerMoveData;

            if (!obj) {
                lastPointerMoveData = {
                    x: eventX,
                    y: eventY
                };
                return;
            }

            // 只有在移动超过10像素时才响应
            if (Math.abs(eventX - obj.x) < 10 && Math.abs(eventY - obj.y) < 10) {
                return;
            }

            obj.x = eventX;
            obj.y = eventY;
            showOsd();
        }
    }

    /**
     * 输入命令事件处理
     * 处理来自输入管理器的各种命令（遵控器、游戏手柄等）
     * @param {CustomEvent} e - 自定义事件对象，e.detail.command包含命令名称
     */
    function onInputCommand(e) {
        const player = currentPlayer;

        switch (e.detail.command) {
            case 'left':
                // 左键：在OSD显示时刷新OSD，否则快退
                if (currentVisibleMenu === 'osd') {
                    showOsd();
                } else if (!currentVisibleMenu) {
                    e.preventDefault();
                    playbackManager.rewind(player);
                }

                break;

            case 'right':
                // 右键：在OSD显示时刷新OSD，否则快进
                if (currentVisibleMenu === 'osd') {
                    showOsd();
                } else if (!currentVisibleMenu) {
                    e.preventDefault();
                    playbackManager.fastForward(player);
                }

                break;

            case 'pageup':
                // PageUp：跳到下一章节
                playbackManager.nextChapter(player);
                break;

            case 'pagedown':
                // PageDown：跳到上一章节
                playbackManager.previousChapter(player);
                break;

            case 'up':
            case 'down':
            case 'select':
            case 'menu':
            case 'info':
            case 'play':
            case 'playpause':
            case 'pause':
            case 'fastforward':
            case 'rewind':
            case 'next':
            case 'previous':
                // 这些命令都显示OSD
                showOsd();
                break;

            case 'record':
                // 录制命令
                onRecordingCommand();
                showOsd();
                break;

            case 'togglestats':
                // 切换统计信息显示
                toggleStats();
                break;

            case 'back':
                // 返回键：如果有打开的对话框则忽略
                if (currentVisibleMenu === 'osd' && !getOpenedDialog()) {
                    hideOsd();
                    e.preventDefault();
                }
                break;
        }
    }

    /**
     * 执行录制命令
     * 触发录制按钮的点击事件（如果按钮可见）
     */
    function onRecordingCommand() {
        const btnRecord = view.querySelector('.btnRecord');

        if (!btnRecord.classList.contains('hide')) {
            btnRecord.click();
        }
    }

    /**
     * 全屏状态改变事件处理
     * 处理强制全屏退出逻辑，并更新全屏按钮图标
     */
    function onFullscreenChanged() {
        // 如果强制全屏但当前不是全屏状态，返回上一页
        if (currentPlayer.forcedFullscreen && !playbackManager.isFullscreen(currentPlayer)) {
            appRouter.back();
            return;
        }

        updateFullscreenIcon();
    }

    /**
     * 更新全屏图标
     * 根据当前全屏状态切换图标和标题
     */
    function updateFullscreenIcon() {
        const button = view.querySelector('.btnFullscreen');
        const icon = button.querySelector('.material-icons');

        icon.classList.remove('fullscreen_exit', 'fullscreen');

        if (playbackManager.isFullscreen(currentPlayer)) {
            button.setAttribute('title', globalize.translate('ExitFullscreen') + ' (F)');
            icon.classList.add('fullscreen_exit');
        } else {
            button.setAttribute('title', globalize.translate('Fullscreen') + ' (F)');
            icon.classList.add('fullscreen');
        }
    }

    /**
     * 播放器改变事件处理
     * 当播放器切换时重新绑定事件监听器
     */
    function onPlayerChange() {
        bindToPlayer(playbackManager.getCurrentPlayer());
    }

    /**
     * 播放状态改变事件处理
     * 当开始播放新媒体项时更新UI和控制器状态
     * @param {Event} event - 事件对象
     * @param {Object} state - 播放状态
     */
    function onStateChanged(event, state) {
        const player = this;

        if (state.NowPlayingItem) {
            isEnabled = true;
            updatePlayerStateInternal(event, player, state);
            updatePlaylist();
            enableStopOnBack(true);
            updatePlaybackRate(player);
        }
    }

    /**
     * 播放/暂停状态改变事件处理
     * 更新播放/暂停按钮的图标和标题
     */
    function onPlayPauseStateChanged() {
        if (isEnabled) {
            updatePlayPauseState(this.paused());
        }
    }

    /**
     * 音量改变事件处理
     * 更新音量滑块和静音按钮状态
     */
    function onVolumeChanged() {
        if (isEnabled) {
            const player = this;
            updatePlayerVolumeState(player, player.isMuted(), player.getVolume());
        }
    }

    /**
     * 播放开始事件处理
     * 初始化播放状态并重置“即将播放”对话框
     * @param {Event} e - 事件对象
     * @param {Object} state - 播放状态
     */
    function onPlaybackStart(e, state) {
        console.debug('nowplaying event: ' + e.type);
        const player = this;
        onStateChanged.call(player, e, state);
        resetUpNextDialog();
    }

    /**
     * 重置"即将播放"对话框
     */
    /**
     * 重置"即将播放"对话框
     */
    function resetUpNextDialog() {
        comingUpNextDisplayed = false;
        const dlg = currentUpNextDialog;

        if (dlg) {
            dlg.destroy();
            currentUpNextDialog = null;
        }
    }

    /**
     * 播放停止事件处理
     * 清理播放状态，如果下一个媒体不是视频则退出播放界面
     * @param {Event} e - 事件对象
     * @param {Object} state - 播放状态
     */
    function onPlaybackStopped(e, state) {
        currentRuntimeTicks = null;
        resetUpNextDialog();
        console.debug('nowplaying event: ' + e.type);

        // 如果下一个媒体不是视频，退出播放界面
        if (state.NextMediaType !== 'Video') {
            view.removeEventListener('viewbeforehide', onViewHideStopPlayback);
            appRouter.back();
        }
    }

    /**
     * 媒体流改变事件处理
     * 当音频或字幕轨道发生变化时更新UI
     */
    function onMediaStreamsChanged() {
        const player = this;
        const state = playbackManager.getPlayerState(player);
        onStateChanged.call(player, {
            type: 'init'
        }, state);
    }

    /**
     * 开始获取数据事件处理
     * 显示加载状态指示器
     */
    function onBeginFetch() {
        view.querySelector('.osdMediaStatus').classList.remove('hide');
    }

    /**
     * 结束获取数据事件处理
     * 隐藏加载状态指示器
     */
    function onEndFetch() {
        view.querySelector('.osdMediaStatus').classList.add('hide');
    }

    /**
     * 绑定到播放器
     * 注册所有播放器事件监听器并初始化状态
     * @param {Object} player - 播放器对象
     */
    function bindToPlayer(player) {
        if (player !== currentPlayer) {
            releaseCurrentPlayer();
            currentPlayer = player;
            if (!player) return;
        }
        const state = playbackManager.getPlayerState(player);
        onStateChanged.call(player, {
            type: 'init'
        }, state);

        // 绑定播放器事件
        Events.on(player, 'playbackstart', onPlaybackStart);
        Events.on(player, 'playbackstop', onPlaybackStopped);
        Events.on(player, PlayerEvent.PromptSkip, onPromptSkip);
        Events.on(player, 'volumechange', onVolumeChanged);
        Events.on(player, 'pause', onPlayPauseStateChanged);
        Events.on(player, 'unpause', onPlayPauseStateChanged);
        Events.on(player, 'timeupdate', onTimeUpdate);
        Events.on(player, 'fullscreenchange', onFullscreenChanged);
        Events.on(player, 'mediastreamschange', onMediaStreamsChanged);
        Events.on(player, 'beginFetch', onBeginFetch);
        Events.on(player, 'endFetch', onEndFetch);
        resetUpNextDialog();

        if (player.isFetching) {
            onBeginFetch();
        }
    }

    /**
     * 释放当前播放器
     * 注销所有事件监听器并清理覆盖层
     */
    function releaseCurrentPlayer() {
        destroyStats();
        destroySubtitleSync();
        resetUpNextDialog();
        const player = currentPlayer;

        if (player) {
            // 解绑所有播放器事件
            Events.off(player, 'playbackstart', onPlaybackStart);
            Events.off(player, 'playbackstop', onPlaybackStopped);
            Events.off(player, PlayerEvent.PromptSkip, onPromptSkip);
            Events.off(player, 'volumechange', onVolumeChanged);
            Events.off(player, 'pause', onPlayPauseStateChanged);
            Events.off(player, 'unpause', onPlayPauseStateChanged);
            Events.off(player, 'timeupdate', onTimeUpdate);
            Events.off(player, 'fullscreenchange', onFullscreenChanged);
            Events.off(player, 'mediastreamschange', onMediaStreamsChanged);
            currentPlayer = null;
        }
    }

    /**
     * 时间更新事件处理
     */
    /**
     * 时间更新事件处理
     * Firefox的播放器即使在断点处也会不断触发'timeupdate'事件，因此需要测试'currentItem'
     */
    function onTimeUpdate() {
        // 测试'currentItem'是必需的，因为Firefox的播放器即使在断点处也会不断触发'timeupdate'事件
        if (isEnabled && currentItem) {
            const now = new Date().getTime();

            // 限制更新频率为700ms一次
            if (now - lastUpdateTime >= 700) {
                lastUpdateTime = now;
                const player = this;
                currentRuntimeTicks = playbackManager.duration(player);
                const currentTime = playbackManager.currentTime(player) * 10000;
                updateTimeDisplay(currentTime, currentRuntimeTicks, playbackManager.playbackStartTime(player), playbackManager.getPlaybackRate(player), playbackManager.getBufferedRanges(player));
                const item = currentItem;
                refreshProgramInfoIfNeeded(player, item);
                showComingUpNextIfNeeded(player, item, currentTime, currentRuntimeTicks);
            }
        }
    }

    /**
     * 提示跳过事件处理
     * 当媒体片段（如片头/片尾）结束时，如果有下一项则显示“即将播放”
     * @param {Event} e - 事件对象
     * @param {Object} mediaSegment - 媒体片段对象
     */
    function onPromptSkip(e, mediaSegment) {
        const player = this;
        if (mediaSegment && player && mediaSegment.EndTicks != null
            && mediaSegment.EndTicks >= playbackManager.duration(player)
            && playbackManager.getNextItem()
            && userSettings.enableNextVideoInfoOverlay()
        ) {
            showComingUpNext(player);
        }
    }

    /**
     * 如果需要，显示即将播放的内容
     * 根据播放时长和剩余时间决定是否显示下一集提示
     * @param {Object} player - 播放器对象
     * @param {Object} currentItem - 当前播放项
     * @param {number} currentTimeTicks - 当前时间（ticks）
     * @param {number} runtimeTicks - 总时长（ticks）
     */
    function showComingUpNextIfNeeded(player, currentItem, currentTimeTicks, runtimeTicks) {
        if (runtimeTicks && currentTimeTicks && !comingUpNextDisplayed && !currentVisibleMenu && currentItem.Type === 'Episode' && userSettings.enableNextVideoInfoOverlay()) {
            let showAtSecondsLeft = 30;
            if (runtimeTicks >= 50 * TICKS_PER_MINUTE) {
                showAtSecondsLeft = 40;
            } else if (runtimeTicks >= 40 * TICKS_PER_MINUTE) {
                showAtSecondsLeft = 35;
            }
            const showAtTicks = runtimeTicks - showAtSecondsLeft * TICKS_PER_SECOND;
            const timeRemainingTicks = runtimeTicks - currentTimeTicks;

            if (currentTimeTicks >= showAtTicks && runtimeTicks >= (10 * TICKS_PER_MINUTE) && timeRemainingTicks >= (20 * TICKS_PER_SECOND)) {
                showComingUpNext(player);
            }
        }
    }

    /**
     * 即将播放对话框隐藏事件处理
     * 清除当前可见菜单标志
     */
    function onUpNextHidden() {
        if (currentVisibleMenu === 'upnext') {
            currentVisibleMenu = null;
        }
    }

    /**
     * 显示即将播放对话框
     * 动态加载并显示下一集的信息
     * @param {Object} player - 播放器对象
     */
    function showComingUpNext(player) {
        import('../../../components/upnextdialog/upnextdialog').then(({ default: UpNextDialog }) => {
            if (!(currentVisibleMenu || currentUpNextDialog)) {
                currentVisibleMenu = 'upnext';
                comingUpNextDisplayed = true;
                playbackManager.nextItem(player).then(function (nextItem) {
                    currentUpNextDialog = new UpNextDialog({
                        parent: view.querySelector('.upNextContainer'),
                        player: player,
                        nextItem: nextItem
                    });
                    Events.on(currentUpNextDialog, 'hide', onUpNextHidden);
                }, onUpNextHidden);
            }
        });
    }

    /**
     * 如果需要，刷新节目信息
     * 对于直播电视频道，当节目结束时刷新信息
     * @param {Object} player - 播放器对象
     * @param {Object} item - 媒体项对象
     */
    function refreshProgramInfoIfNeeded(player, item) {
        if (item.Type === 'TvChannel') {
            const program = item.CurrentProgram;

            if (program?.EndDate) {
                try {
                    const endDate = datetime.parseISO8601Date(program.EndDate);

                    if (new Date().getTime() >= endDate.getTime()) {
                        console.debug('program info needs to be refreshed');
                        const state = playbackManager.getPlayerState(player);
                        onStateChanged.call(player, {
                            type: 'init'
                        }, state);
                    }
                } catch (e) {
                    console.error('error parsing date: ' + program.EndDate, e);
                }
            }
        }
    }

    /**
     * 更新播放/暂停状态
     * 更新按钮图标和标题
     * @param {boolean} isPaused - 是否暂停
     */
    function updatePlayPauseState(isPaused) {
        const btnPlayPause = view.querySelector('.btnPause');
        const btnPlayPauseIcon = btnPlayPause.querySelector('.material-icons');

        btnPlayPauseIcon.classList.remove('play_arrow', 'pause');

        let icon;
        let title;

        if (isPaused) {
            icon = 'play_arrow';
            title = globalize.translate('Play');
        } else {
            icon = 'pause';
            title = globalize.translate('ButtonPause');
        }

        btnPlayPauseIcon.classList.add(icon);
        dom.setElementTitle(btnPlayPause, title + ' (K)', title);
    }

    /**
     * 更新播放器内部状态
     * 更新所有UI元素以反映当前播放状态
     * @param {Event} event - 事件对象
     * @param {Object} player - 播放器对象
     * @param {Object} state - 播放状态
     */
    function updatePlayerStateInternal(event, player, state) {
        const playState = state.PlayState || {};
        updatePlayPauseState(playState.IsPaused);
        const supportedCommands = playbackManager.getSupportedCommands(player);
        currentPlayerSupportedCommands = supportedCommands;
        updatePlayerVolumeState(player, playState.IsMuted, playState.VolumeLevel);

        if (nowPlayingPositionSlider && !nowPlayingPositionSlider.dragging) {
            nowPlayingPositionSlider.disabled = !playState.CanSeek;
        }

        btnFastForward.disabled = !playState.CanSeek;
        btnRewind.disabled = !playState.CanSeek;
        const nowPlayingItem = state.NowPlayingItem || {};
        playbackStartTimeTicks = playState.PlaybackStartTimeTicks;
        updateTimeDisplay(playState.PositionTicks, nowPlayingItem.RunTimeTicks, playState.PlaybackStartTimeTicks, playState.PlaybackRate, playState.BufferedRanges || []);
        updateNowPlayingInfo(player, state);

        const isProgressClear = state.MediaSource && state.MediaSource.RunTimeTicks == null;
        nowPlayingPositionSlider.setIsClear(isProgressClear);

        if (nowPlayingItem.RunTimeTicks) {
            nowPlayingPositionSlider.setKeyboardSteps(userSettings.skipBackLength() * 1000000 / nowPlayingItem.RunTimeTicks,
                userSettings.skipForwardLength() * 1000000 / nowPlayingItem.RunTimeTicks);
        }

        if (supportedCommands.indexOf('ToggleFullscreen') === -1 || player.isLocalPlayer && layoutManager.tv && playbackManager.isFullscreen(player)) {
            view.querySelector('.btnFullscreen').classList.add('hide');
        } else {
            view.querySelector('.btnFullscreen').classList.remove('hide');
        }

        if (supportedCommands.indexOf('PictureInPicture') === -1) {
            view.querySelector('.btnPip').classList.add('hide');
        } else {
            view.querySelector('.btnPip').classList.remove('hide');
        }

        if (supportedCommands.indexOf('AirPlay') === -1) {
            view.querySelector('.btnAirPlay').classList.add('hide');
        } else {
            view.querySelector('.btnAirPlay').classList.remove('hide');
        }

        onFullscreenChanged();
    }

    /**
     * 按时间计算显示百分比
     * 用于直播电视频道的进度条计算
     * @param {number} programStartDateMs - 节目开始时间（毫秒）
     * @param {number} programRuntimeMs - 节目运行时间（毫秒）
     * @param {number} currentTimeMs - 当前时间（毫秒）
     * @returns {number} 百分比 (0-100)
     */
    function getDisplayPercentByTimeOfDay(programStartDateMs, programRuntimeMs, currentTimeMs) {
        return (currentTimeMs - programStartDateMs) / programRuntimeMs * 100;
    }

    /**
     * 更新时间显示
     * 更新进度条、当前时间和总时长显示
     * 支持两种模式：按时间点（直播）和按时长（点播）
     * @param {number} positionTicks - 当前位置（ticks）
     * @param {number} runtimeTicks - 总时长（ticks）
     * @param {number} playbackStartTimeTicks - 播放开始时间（ticks）
     * @param {number} playbackRate - 播放速率
     * @param {Array} bufferedRanges - 缓冲范围数组
     */
    function updateTimeDisplay(positionTicks, runtimeTicks, playbackStartTimeTicks, playbackRate, bufferedRanges) {
        if (enableProgressByTimeOfDay) {
            if (nowPlayingPositionSlider && !nowPlayingPositionSlider.dragging) {
                if (programStartDateMs && programEndDateMs) {
                    const currentTimeMs = (playbackStartTimeTicks + (positionTicks || 0)) / 1e4;
                    const programRuntimeMs = programEndDateMs - programStartDateMs;

                    nowPlayingPositionSlider.value = getDisplayPercentByTimeOfDay(programStartDateMs, programRuntimeMs, currentTimeMs);

                    if (bufferedRanges.length) {
                        const rangeStart = getDisplayPercentByTimeOfDay(programStartDateMs, programRuntimeMs, (playbackStartTimeTicks + (bufferedRanges[0].start || 0)) / 1e4);
                        const rangeEnd = getDisplayPercentByTimeOfDay(programStartDateMs, programRuntimeMs, (playbackStartTimeTicks + (bufferedRanges[0].end || 0)) / 1e4);
                        nowPlayingPositionSlider.setBufferedRanges([{
                            start: rangeStart,
                            end: rangeEnd
                        }]);
                    } else {
                        nowPlayingPositionSlider.setBufferedRanges([]);
                    }
                } else {
                    nowPlayingPositionSlider.value = 0;
                    nowPlayingPositionSlider.setBufferedRanges([]);
                }
            }

            nowPlayingPositionText.innerHTML = '';
            nowPlayingDurationText.innerHTML = '';
        } else {
            if (nowPlayingPositionSlider && !nowPlayingPositionSlider.dragging) {
                if (runtimeTicks) {
                    let pct = positionTicks / runtimeTicks;
                    pct *= 100;
                    nowPlayingPositionSlider.value = pct;
                } else {
                    nowPlayingPositionSlider.value = 0;
                }

                if (runtimeTicks && positionTicks != null && currentRuntimeTicks && !enableProgressByTimeOfDay && currentItem.RunTimeTicks && currentItem.Type !== 'Recording' && playbackRate !== null) {
                    endsAtText.innerHTML = '&nbsp;&nbsp;&nbsp;&nbsp;' + mediaInfo.getEndsAtFromPosition(runtimeTicks, positionTicks, playbackRate, true);
                } else {
                    endsAtText.innerHTML = '';
                }
            }

            if (nowPlayingPositionSlider) {
                nowPlayingPositionSlider.setBufferedRanges(bufferedRanges, runtimeTicks, positionTicks);
            }

            if (positionTicks >= 0) {
                updateTimeText(nowPlayingPositionText, positionTicks);
                nowPlayingPositionText.classList.remove('hide');
            } else {
                nowPlayingPositionText.classList.add('hide');
            }

            if (userSettings.enableVideoRemainingTime()) {
                const leftTicks = runtimeTicks - positionTicks;
                if (leftTicks >= 0) {
                    updateTimeText(nowPlayingDurationText, leftTicks);
                    nowPlayingDurationText.innerHTML = '-' + nowPlayingDurationText.innerHTML;
                    nowPlayingDurationText.classList.remove('hide');
                } else {
                    nowPlayingPositionText.classList.add('hide');
                }
            } else {
                updateTimeText(nowPlayingDurationText, runtimeTicks);
                nowPlayingDurationText.classList.remove('hide');
            }
        }
    }

    /**
     * 更新播放器音量状态
     * 更新音量滑块和静音按钮的显示和状态
     * @param {Object} player - 播放器对象
     * @param {boolean} isMuted - 是否静音
     * @param {number} volumeLevel - 音量级别 (0-100)
     */
    function updatePlayerVolumeState(player, isMuted, volumeLevel) {
        const supportedCommands = currentPlayerSupportedCommands;
        let showMuteButton = true;
        let showVolumeSlider = true;

        if (supportedCommands.indexOf('Mute') === -1) {
            showMuteButton = false;
        }

        if (supportedCommands.indexOf('SetVolume') === -1) {
            showVolumeSlider = false;
        }

        if (player.isLocalPlayer && appHost.supports(AppFeature.PhysicalVolumeControl)) {
            showMuteButton = false;
            showVolumeSlider = false;
        }

        const buttonMute = view.querySelector('.buttonMute');
        const buttonMuteIcon = buttonMute.querySelector('.material-icons');

        buttonMuteIcon.classList.remove('volume_off', 'volume_up');

        if (isMuted) {
            buttonMute.setAttribute('title', globalize.translate('Unmute') + ' (M)');
            buttonMuteIcon.classList.add('volume_off');
        } else {
            buttonMute.setAttribute('title', globalize.translate('Mute') + ' (M)');
            buttonMuteIcon.classList.add('volume_up');
        }

        if (showMuteButton) {
            buttonMute.classList.remove('hide');
        } else {
            buttonMute.classList.add('hide');
        }

        if (nowPlayingVolumeSlider) {
            if (showVolumeSlider) {
                nowPlayingVolumeSliderContainer.classList.remove('hide');
            } else {
                nowPlayingVolumeSliderContainer.classList.add('hide');
            }

            if (!nowPlayingVolumeSlider.dragging) {
                nowPlayingVolumeSlider.value = volumeLevel || 0;
            }
        }
    }

    /**
     * 更新播放列表
     * 如果播放列表有多个项，显示上一曲/下一曲按钮
     */
    async function updatePlaylist() {
        try {
            const playlist = await playbackManager.getPlaylist();

            if (playlist && playlist.length > 1) {
                const btnPreviousTrack = view.querySelector('.btnPreviousTrack');
                const btnNextTrack = view.querySelector('.btnNextTrack');
                btnPreviousTrack.classList.remove('hide');
                btnNextTrack.classList.remove('hide');
                btnPreviousTrack.disabled = false;
                btnNextTrack.disabled = false;
            }
        } catch (err) {
            console.error('[VideoPlayer] failed to get playlist', err);
        }
    }

    /**
     * 更新时间文本
     * 将ticks转换为可读的时间格式并设置到元素
     * @param {HTMLElement} elem - 目标元素
     * @param {number} ticks - 时间（ticks）
     * @param {boolean} divider - 是否添加分隔符
     */
    function updateTimeText(elem, ticks, divider) {
        if (ticks == null) {
            elem.innerHTML = '';
            return;
        }

        let html = datetime.getDisplayRunningTime(ticks);

        if (divider) {
            html = '&nbsp;/&nbsp;' + html;
        }

        elem.innerHTML = html;
    }

    /**
     * 持续时间文本点击事件处理
     * 切换显示剩余时间/总时长
     */
    function nowPlayingDurationTextClick() {
        userSettings.enableVideoRemainingTime(!userSettings.enableVideoRemainingTime());
        // immediately update the text, without waiting for the next tick update or if the player is paused
        const state = playbackManager.getPlayerState(currentPlayer);
        const playState = state.PlayState;
        const nowPlayingItem = state.NowPlayingItem;
        updateTimeDisplay(playState.PositionTicks, nowPlayingItem.RunTimeTicks, playState.PlaybackStartTimeTicks, playState.PlaybackRate, playState.BufferedRanges || []);
    }

    /**
     * 设置按钮点击事件处理
     * 显示播放器设置菜单（画质、统计信息、字幕偏移等）
     */
    function onSettingsButtonClick() {
        const btn = this;

        import('../../../components/playback/playersettingsmenu').then((playerSettingsMenu) => {
            const player = currentPlayer;

            if (player) {
                const state = playbackManager.getPlayerState(player);

                // show subtitle offset feature only if player and media support it
                const showSubOffset = playbackManager.supportSubtitleOffset(player)
                        && playbackManager.canHandleOffsetOnCurrentSubtitle(player);

                playerSettingsMenu.show({
                    mediaType: 'Video',
                    player: player,
                    positionTo: btn,
                    quality: state.MediaSource?.SupportsTranscoding,
                    stats: true,
                    suboffset: showSubOffset,
                    onOption: onSettingsOption
                }).finally(() => {
                    resetIdle();
                });

                setTimeout(resetIdle, 0);
            }
        });
    }

    /**
     * 设置选项选择处理
     * 处理设置菜单中的选项选择（统计信息、字幕偏移）
     * @param {string} selectedOption - 选中的选项
     */
    function onSettingsOption(selectedOption) {
        if (selectedOption === 'stats') {
            toggleStats();
        } else if (selectedOption === 'suboffset') {
            const player = currentPlayer;
            if (player) {
                playbackManager.enableShowingSubtitleOffset(player);
                toggleSubtitleSync();
            }
        }
    }

    /**
     * 切换统计信息显示
     * 显示或隐藏播放器统计信息覆盖层
     */
    function toggleStats() {
        import('../../../components/playerstats/playerstats').then(({ default: PlayerStats }) => {
            const player = currentPlayer;

            if (player) {
                if (statsOverlay) {
                    statsOverlay.toggle();
                } else {
                    statsOverlay = new PlayerStats({
                        player: player
                    });
                }
            }
        });
    }

    /**
     * 销毁统计信息覆盖层
     * 释放统计信息覆盖层资源
     */
    function destroyStats() {
        if (statsOverlay) {
            statsOverlay.destroy();
            statsOverlay = null;
        }
    }

    /**
     * 显示音频轨道选择菜单
     * 显示所有可用的音频轨道供用户选择
     */
    function showAudioTrackSelection() {
        const player = currentPlayer;
        const audioTracks = playbackManager.audioTracks(player);
        const currentIndex = playbackManager.getAudioStreamIndex(player);
        const menuItems = audioTracks.map(function (stream) {
            const opt = {
                name: stream.DisplayTitle,
                id: stream.Index
            };

            if (stream.Index === currentIndex) {
                opt.selected = true;
            }

            return opt;
        });
        const positionTo = this;

        import('../../../components/actionSheet/actionSheet').then(({ default: actionsheet }) => {
            actionsheet.show({
                items: menuItems,
                title: globalize.translate('Audio'),
                positionTo: positionTo
            }).then(function (id) {
                const index = parseInt(id, 10);

                if (index !== currentIndex) {
                    playbackManager.setAudioStreamIndex(index, player);
                }
            }).finally(() => {
                resetIdle();
            });

            setTimeout(resetIdle, 0);
        });
    }

    /**
     * 显示次要字幕菜单
     * 显示次要字幕选择菜单（仅在播放器支持时）
     * @param {Object} actionsheet - 动作表单对象
     * @param {HTMLElement} positionTo - 定位到的元素
     */
    function showSecondarySubtitlesMenu(actionsheet, positionTo) {
        const player = currentPlayer;
        if (!playbackManager.playerHasSecondarySubtitleSupport(player)) return;
        let currentIndex = playbackManager.getSecondarySubtitleStreamIndex(player);
        const streams = playbackManager.secondarySubtitleTracks(player);

        if (currentIndex == null) {
            currentIndex = -1;
        }

        streams.unshift({
            Index: -1,
            DisplayTitle: globalize.translate('Off')
        });

        const menuItems = streams.map(function (stream) {
            const opt = {
                name: stream.DisplayTitle,
                id: stream.Index
            };

            if (stream.Index === currentIndex) {
                opt.selected = true;
            }

            return opt;
        });

        actionsheet.show({
            title: globalize.translate('SecondarySubtitles'),
            items: menuItems,
            positionTo
        }).then(function (id) {
            if (id) {
                const index = parseInt(id, 10);
                if (index !== currentIndex) {
                    playbackManager.setSecondarySubtitleStreamIndex(index, player);
                }
            }
        })
            .finally(() => {
                resetIdle();
            });

        setTimeout(resetIdle, 0);
    }

    /**
     * 显示字幕轨道选择菜单
     * 显示主字幕和次要字幕选择菜单
     */
    function showSubtitleTrackSelection() {
        const player = currentPlayer;
        const streams = playbackManager.subtitleTracks(player);
        const secondaryStreams = playbackManager.secondarySubtitleTracks(player);
        let currentIndex = playbackManager.getSubtitleStreamIndex(player);

        if (currentIndex == null) {
            currentIndex = -1;
        }

        streams.unshift({
            Index: -1,
            DisplayTitle: globalize.translate('Off')
        });
        const menuItems = streams.map(function (stream) {
            const opt = {
                name: stream.DisplayTitle,
                id: stream.Index
            };

            if (stream.Index === currentIndex) {
                opt.selected = true;
            }

            return opt;
        });

        /**
            * Only show option if:
            * - player has support
            * - has more than 1 subtitle track
            * - has valid secondary tracks
            * - primary subtitle is not off
            * - primary subtitle has support
            */
        const currentTrackCanAddSecondarySubtitle = playbackManager.playerHasSecondarySubtitleSupport(player)
                && streams.length > 1
                && secondaryStreams.length > 0
                && currentIndex !== -1
                && playbackManager.trackHasSecondarySubtitleSupport(playbackManager.getSubtitleStream(player, currentIndex), player);

        if (currentTrackCanAddSecondarySubtitle) {
            const secondarySubtitleMenuItem = {
                name: globalize.translate('SecondarySubtitles'),
                id: 'secondarysubtitle'
            };
            menuItems.unshift(secondarySubtitleMenuItem);
        }

        const positionTo = this;

        import('../../../components/actionSheet/actionSheet').then(({ default: actionsheet }) => {
            actionsheet.show({
                title: globalize.translate('Subtitles'),
                items: menuItems,
                positionTo: positionTo
            }).then(function (id) {
                if (id === 'secondarysubtitle') {
                    try {
                        showSecondarySubtitlesMenu(actionsheet, positionTo);
                    } catch (e) {
                        console.error(e);
                    }
                } else {
                    const index = parseInt(id, 10);

                    if (index !== currentIndex) {
                        playbackManager.setSubtitleStreamIndex(index, player);
                    }
                }

                toggleSubtitleSync();
            }).finally(() => {
                resetIdle();
            });

            setTimeout(resetIdle, 0);
        });
    }

    /**
     * 切换字幕同步显示
     * 显示或隐藏字幕同步调整工具
     * @param {string} action - 动作类型 ('hide', 'forceToHide', 等)
     */
    function toggleSubtitleSync(action) {
        const player = currentPlayer;
        if (subtitleSyncOverlay) {
            subtitleSyncOverlay.toggle(action);
        } else if (player) {
            subtitleSyncOverlay = new SubtitleSync(player);
        }
    }

    /**
     * 销毁字幕同步覆盖层
     * 释放字幕同步覆盖层资源
     */
    function destroySubtitleSync() {
        if (subtitleSyncOverlay) {
            subtitleSyncOverlay.destroy();
            subtitleSyncOverlay = null;
        }
    }

    /**
     * 已点击的元素
     * 用于跳过Firefox/Edge上的'click'处理
     */
    let clickedElement;

    /**
     * 点击事件捕获处理
     * Firefox/Edge即使在`keydown`上使用了`preventDefault`也会触发`click`
     * 如果原始点击的是另一个元素，则忽略'click'
     * @param {MouseEvent} e - 鼠标事件对象
     * @returns {boolean} 是否继续传播事件
     */
    function onClickCapture(e) {
        // Firefox/Edge即使在`keydown`上使用了`preventDefault`也会触发`click`
        // 如果原始点击的是另一个元素，则忽略'click'
        if (!e.target.contains(clickedElement)) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }

    /**
     * 键盘按下事件处理
     * 处理所有键盘快捷键
     * 支持的快捷键：
     * - 空格/K: 播放/暂停
     * - 上/下箭头: 音量控制
     * - 左/右箭头(J/L): 快退/快进
     * - F: 全屏切换
     * - M: 静音切换
     * - Shift+P/N: 上一曲/下一曲
     * - PageUp/Down: 章节切换
     * - 0-9: 跳转到对应百分比位置
     * - Shift+</>: 调整播放速度
     * - G/H: 字幕偏移调整
     * - Home/End: 跳转到开头/结尾
     * @param {KeyboardEvent} e - 键盘事件对象
     */
    function onKeyDown(e) {
        clickedElement = e.target;

        const isKeyModified = e.ctrlKey || e.altKey || e.metaKey;

        // 跳过修饰键
        if (isKeyModified) return;

        const key = keyboardnavigation.getKeyName(e);

        const btnPlayPause = osdBottomElement.querySelector('.btnPause');

        // 空格键：播放/暂停
        if (e.keyCode === 32) {
            if (e.target.tagName !== 'BUTTON' || !layoutManager.tv) {
                playbackManager.playPause(currentPlayer);
                showOsd(btnPlayPause);
                e.preventDefault();
                e.stopPropagation();
                // 用null元素欺骗Firefox以跳过下一次点击
                clickedElement = null;
            } else {
                showOsd();
            }
            return;
        }

        // 电视模式下OSD隐藏时的特殊行为
        if (layoutManager.tv && !currentVisibleMenu) {
            // 当OSD隐藏时改变某些键的行为
            switch (key) {
                case 'ArrowLeft':
                case 'ArrowRight':
                    if (!e.shiftKey) {
                        e.preventDefault();
                        showOsd(nowPlayingPositionSlider);
                        nowPlayingPositionSlider.dispatchEvent(new KeyboardEvent(e.type, e));
                    }
                    return;
                case 'Enter':
                    if (e.target.tagName !== 'BUTTON') {
                        e.preventDefault();
                        playbackManager.playPause(currentPlayer);
                        showOsd(btnPlayPause);
                    }
                    return;
            }
        }

        // 电视模式下导航键显示OSD
        if (layoutManager.tv && keyboardnavigation.isNavigationKey(key)) {
            if (!e.shiftKey) showOsd();
            return;
        }

        // 键盘快捷键处理
        switch (key) {
            case 'Enter':
                showOsd();
                break;
            case 'Escape':
            case 'Back':
                // 有对话框打开时忽略按键
                if (currentVisibleMenu === 'osd' && !getOpenedDialog()) {
                    hideOsd();
                    e.stopPropagation();
                }
                break;
            case 'k':
            case 'K':
                // K键：播放/暂停
                if (!e.shiftKey) {
                    e.preventDefault();
                    playbackManager.playPause(currentPlayer);
                    showOsd(btnPlayPause);
                }
                break;
            case 'ArrowUp':
            case 'Up':
                // 上箭头：增加音量
                if (!e.shiftKey) {
                    e.preventDefault();
                    playbackManager.volumeUp(currentPlayer);
                }
                break;
            case 'ArrowDown':
            case 'Down':
                // 下箭头：减小音量
                if (!e.shiftKey) {
                    e.preventDefault();
                    playbackManager.volumeDown(currentPlayer);
                }
                break;
            case 'l':
            case 'L':
            case 'ArrowRight':
            case 'Right':
                // L或右箭头：快进
                if (!e.shiftKey) {
                    e.preventDefault();
                    playbackManager.fastForward(currentPlayer);
                    showOsd(btnFastForward);
                }
                break;
            case 'j':
            case 'J':
            case 'ArrowLeft':
            case 'Left':
                // J或左箭头：快退
                if (!e.shiftKey) {
                    e.preventDefault();
                    playbackManager.rewind(currentPlayer);
                    showOsd(btnRewind);
                }
                break;
            case 'f':
            case 'F':
                // F键：切换全屏
                if (!e.shiftKey) {
                    e.preventDefault();
                    playbackManager.toggleFullscreen(currentPlayer);
                }
                break;
            case 'm':
            case 'M':
                // M键：切换静音
                if (!e.shiftKey) {
                    e.preventDefault();
                    playbackManager.toggleMute(currentPlayer);
                }
                break;
            case 'p':
            case 'P':
                // Shift+P：上一曲
                if (e.shiftKey) {
                    e.preventDefault();
                    playbackManager.previousTrack(currentPlayer);
                }
                break;
            case 'n':
            case 'N':
                // Shift+N：下一曲
                if (e.shiftKey) {
                    e.preventDefault();
                    playbackManager.nextTrack(currentPlayer);
                }
                break;
            case 'NavigationLeft':
            case 'GamepadDPadLeft':
            case 'GamepadLeftThumbstickLeft':
                // 忽略始终触发的游戏手柄事件，即使未聚焦
                if (document.hasFocus()) {
                    playbackManager.rewind(currentPlayer);
                    showOsd(btnRewind);
                }
                break;
            case 'NavigationRight':
            case 'GamepadDPadRight':
            case 'GamepadLeftThumbstickRight':
                // 忽略始终触发的游戏手柄事件，即使未聚焦
                if (document.hasFocus()) {
                    playbackManager.fastForward(currentPlayer);
                    showOsd(btnFastForward);
                }
                break;
            case 'Home':
                // Home键：跳到开始
                if (!e.shiftKey) {
                    e.preventDefault();
                    playbackManager.seekPercent(0, currentPlayer);
                }
                break;
            case 'End':
                // End键：跳到结束
                if (!e.shiftKey) {
                    e.preventDefault();
                    playbackManager.seekPercent(100, currentPlayer);
                }
                break;
            case '0':
            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
            case '6':
            case '7':
            case '8':
            case '9': { // 数字键：跳到对应百分比位置
                e.preventDefault();
                const percent = parseInt(key, 10) * 10;
                playbackManager.seekPercent(percent, currentPlayer);
                break;
            }
            case '>': // Shift+.：增加播放速度
                e.preventDefault();
                playbackManager.increasePlaybackRate(currentPlayer);
                break;
            case '<': // Shift+,：减小播放速度
                e.preventDefault();
                playbackManager.decreasePlaybackRate(currentPlayer);
                break;
            case 'PageUp':
                // PageUp：下一章节
                if (!e.shiftKey) {
                    e.preventDefault();
                    playbackManager.nextChapter(currentPlayer);
                }
                break;
            case 'PageDown':
                // PageDown：上一章节
                if (!e.shiftKey) {
                    e.preventDefault();
                    playbackManager.previousChapter(currentPlayer);
                }
                break;
            case 'g':
            case 'G':
                // G键：减小字幕偏移
                if (!e.shiftKey) {
                    e.preventDefault();
                    subtitleSyncOverlay?.decrementOffset();
                }
                break;
            case 'h':
            case 'H':
                // H键：增加字幕偏移
                if (!e.shiftKey) {
                    e.preventDefault();
                    subtitleSyncOverlay?.incrementOffset();
                }
                break;
        }
    }

    /**
     * 键盘按下捕获处理
     * 在捕获阶段重置空闲计时器
     */
    function onKeyDownCapture() {
        resetIdle();
    }

    /**
     * 鼠标滚轮事件处理
     * 向上滚动增加音量，向下滚动减小音量
     * @param {WheelEvent} e - 滚轮事件对象
     */
    function onWheel(e) {
        if (getOpenedDialog()) return;
        // 向上滚动增加音量
        if (e.deltaY < 0) {
            playbackManager.volumeUp(currentPlayer);
        }
        // 向下滚动减小音量
        if (e.deltaY > 0) {
            playbackManager.volumeDown(currentPlayer);
        }
    }

    /**
     * 窗口鼠标按下事件处理
     * 记录点击元素和鼠标按下状态，重置空闲计时器
     * @param {MouseEvent} e - 鼠标事件对象
     */
    function onWindowMouseDown(e) {
        clickedElement = e.target;
        mouseIsDown = true;
        resetIdle();
    }

    /**
     * 窗口鼠标释放事件处理
     * 清除鼠标按下状态并重置空闲计时器
     */
    function onWindowMouseUp() {
        mouseIsDown = false;
        resetIdle();
    }

    /**
     * 窗口拖拽结束事件处理
     * mousedown -> dragstart -> dragend !!! 没有mouseup :(
     * 清除鼠标按下状态并重置空闲计时器
     */
    function onWindowDragEnd() {
        // mousedown -> dragstart -> dragend !!! 没有mouseup :(
        mouseIsDown = false;
        resetIdle();
    }

    /**
     * 更新Trickplay气泡HTML
     * 根据播放位置计算平铺缩略图的偏移量并显示对应帧
     * @param {Object} apiClient - API客户端
     * @param {Object} trickplayInfo - Trickplay信息对象
     * @param {Object} item - 媒体项对象
     * @param {string} mediaSourceId - 媒体源ID
     * @param {HTMLElement} bubble - 气泡元素
     * @param {number} positionTicks - 位置（ticks）
     * @returns {boolean} 是否成功更新
     */
    function updateTrickplayBubbleHtml(apiClient, trickplayInfo, item, mediaSourceId, bubble, positionTicks) {
        let doFullUpdate = false;
        let chapterThumbContainer = bubble.querySelector('.chapterThumbContainer');
        let chapterThumb;
        let chapterThumbText;
        let chapterThumbName;

        // 如果气泡元素不存在，则创建它们
        if (chapterThumbContainer) {
            chapterThumb = chapterThumbContainer.querySelector('.chapterThumbWrapper');
            chapterThumbText = chapterThumbContainer.querySelector('h2.chapterThumbText');
            chapterThumbName = chapterThumbContainer.querySelector('div.chapterThumbText');
        } else {
            doFullUpdate = true;

            chapterThumbContainer = document.createElement('div');
            chapterThumbContainer.classList.add('chapterThumbContainer');
            chapterThumbContainer.style.overflow = 'hidden';

            chapterThumb = document.createElement('div');
            chapterThumb.classList.add('chapterThumbWrapper');
            chapterThumb.style.overflow = 'hidden';
            chapterThumb.style.width = trickplayInfo.Width + 'px';
            chapterThumb.style.height = trickplayInfo.Height + 'px';
            chapterThumbContainer.appendChild(chapterThumb);

            const chapterThumbTextContainer = document.createElement('div');
            chapterThumbTextContainer.classList.add('chapterThumbTextContainer');
            chapterThumbContainer.appendChild(chapterThumbTextContainer);

            chapterThumbName = document.createElement('div');
            chapterThumbName.classList.add('chapterThumbText', 'chapterThumbText-dim');
            chapterThumbTextContainer.appendChild(chapterThumbName);

            chapterThumbText = document.createElement('h2');
            chapterThumbText.classList.add('chapterThumbText');
            chapterThumbTextContainer.appendChild(chapterThumbText);
        }

        // 查找当前章节
        let chapter;
        for (const currentChapter of item.Chapters || []) {
            if (positionTicks < currentChapter.StartPositionTicks) {
                break;
            }

            chapter = currentChapter;
        }

        // 更新Trickplay值
        const currentTimeMs = positionTicks / 10_000;
        const currentTile = Math.floor(currentTimeMs / trickplayInfo.Interval);

        const tileSize = trickplayInfo.TileWidth * trickplayInfo.TileHeight;
        const tileOffset = currentTile % tileSize;
        const index = Math.floor(currentTile / tileSize);

        const tileOffsetX = tileOffset % trickplayInfo.TileWidth;
        const tileOffsetY = Math.floor(tileOffset / trickplayInfo.TileWidth);
        const offsetX = -(tileOffsetX * trickplayInfo.Width);
        const offsetY = -(tileOffsetY * trickplayInfo.Height);

        const imgSrc = apiClient.getUrl('Videos/' + item.Id + '/Trickplay/' + trickplayInfo.Width + '/' + index + '.jpg', {
            api_key: apiClient.accessToken(),
            MediaSourceId: mediaSourceId
        });

        chapterThumb.style.backgroundImage = `url('${imgSrc}')`;
        chapterThumb.style.backgroundPositionX = offsetX + 'px';
        chapterThumb.style.backgroundPositionY = offsetY + 'px';

        chapterThumbText.textContent = datetime.getDisplayRunningTime(positionTicks);
        chapterThumbName.textContent = chapter?.Name || '';

        // 如果容器不是DOM的一部分，则设置气泡innerHTML
        if (doFullUpdate) {
            bubble.innerHTML = chapterThumbContainer.outerHTML;
        }

        return true;
    }

    /**
     * 获取图片URL
     * 获取章节缩略图的缩放URL
     * @param {Object} item - 媒体项对象
     * @param {Object} chapter - 章节对象
     * @param {number} index - 索引
     * @param {number} maxWidth - 最大宽度
     * @param {Object} apiClient - API客户端
     * @returns {string|null} 图片URL或null
     */
    function getImgUrl(item, chapter, index, maxWidth, apiClient) {
        if (chapter.ImageTag) {
            return apiClient.getScaledImageUrl(item.Id, {
                maxWidth: maxWidth,
                tag: chapter.ImageTag,
                type: 'Chapter',
                index: index
            });
        }

        return null;
    }

    /**
     * 获取章节气泡HTML
     * 根据播放位置生成章节预览气泡的HTML
     * @param {Object} apiClient - API客户端
     * @param {Object} item - 媒体项对象
     * @param {Array} chapters - 章节数组
     * @param {number} positionTicks - 位置（ticks）
     * @returns {string|null} HTML字符串或null
     */
    function getChapterBubbleHtml(apiClient, item, chapters, positionTicks) {
        let chapter;
        let index = -1;

        for (let i = 0, length = chapters.length; i < length; i++) {
            const currentChapter = chapters[i];

            if (positionTicks >= currentChapter.StartPositionTicks) {
                chapter = currentChapter;
                index = i;
            }
        }

        if (!chapter) {
            return null;
        }

        const src = getImgUrl(item, chapter, index, 400, apiClient);

        if (src) {
            let html = '<div class="chapterThumbContainer">';
            html += '<img class="chapterThumb" src="' + src + '" />';
            html += '<div class="chapterThumbTextContainer">';
            html += '<div class="chapterThumbText chapterThumbText-dim">';
            html += escapeHtml(chapter.Name);
            html += '</div>';
            html += '<h2 class="chapterThumbText">';
            html += datetime.getDisplayRunningTime(positionTicks);
            html += '</h2>';
            html += '</div>';
            return html + '</div>';
        }

        return null;
    }

    let playPauseClickTimeout;
    /**
     * 视图隐藏时停止播放事件处理
     * 当视图隐藏时停止视频播放并退出全屏
     */
    function onViewHideStopPlayback() {
        if (playbackManager.isPlayingVideo()) {
            shell.disableFullscreen();

            clearTimeout(playPauseClickTimeout);
            const player = currentPlayer;
            view.removeEventListener('viewbeforehide', onViewHideStopPlayback);
            releaseCurrentPlayer();
            playbackManager.stop(player);
        }
    }

    /**
     * 启用或禁用返回时停止播放
     * 控制是否在视图隐藏时自动停止播放
     * @param {boolean} enabled - 是否启用
     */
    function enableStopOnBack(enabled) {
        view.removeEventListener('viewbeforehide', onViewHideStopPlayback);

        if (enabled && playbackManager.isPlayingVideo(currentPlayer)) {
            view.addEventListener('viewbeforehide', onViewHideStopPlayback);
        }
    }

    /**
     * 更新播放速率
     * 从会话存储中恢复播放速度设置
     * @param {Object} player - 播放器对象
     */
    function updatePlaybackRate(player) {
        // Restore playback speed control, if it exists in the session.
        const playbackRateSpeed = sessionStorage.getItem('playbackRateSpeed');
        if (playbackRateSpeed !== null) {
            player.setPlaybackRate(playbackRateSpeed);
        }
    }

    shell.enableFullscreen();

    // 播放器状态变量
    let currentPlayer; // 当前播放器实例
    let comingUpNextDisplayed; // 是否已显示"即将播放"对话框
    let currentUpNextDialog; // 当前"即将播放"对话框实例
    let isEnabled; // 控制器是否启用
    let currentItem; // 当前播放项
    let recordingButtonManager; // 录制按钮管理器
    let enableProgressByTimeOfDay; // 是否按时间显示进度
    let currentVisibleMenu; // 当前可见的菜单
    let statsOverlay; // 统计信息覆盖层
    let osdHideTimeout; // OSD自动隐藏计时器
    let lastPointerMoveData; // 上次指针移动数据
    const self = this;
    let currentPlayerSupportedCommands = []; // 当前播放器支持的命令列表
    let currentRuntimeTicks = 0; // 当前运行时长（ticks）
    let lastUpdateTime = 0; // 上次更新时间
    let programStartDateMs = 0; // 节目开始时间（毫秒）
    let programEndDateMs = 0; // 节目结束时间（毫秒）
    let playbackStartTimeTicks = 0; // 播放开始时间（ticks）
    let subtitleSyncOverlay; // 字幕同步覆盖层
    let trickplayResolution = null; // Trickplay分辨率

    // UI元素引用
    const nowPlayingVolumeSlider = view.querySelector('.osdVolumeSlider');
    const nowPlayingVolumeSliderContainer = view.querySelector('.osdVolumeSliderContainer');
    const nowPlayingPositionSlider = view.querySelector('.osdPositionSlider');
    const nowPlayingPositionText = view.querySelector('.osdPositionText');
    const nowPlayingDurationText = view.querySelector('.osdDurationText');
    const startTimeText = view.querySelector('.startTimeText');
    const endTimeText = view.querySelector('.endTimeText');
    const endsAtText = view.querySelector('.endsAtText');
    const btnRewind = view.querySelector('.btnRewind');
    const btnFastForward = view.querySelector('.btnFastForward');
    const transitionEndEventName = dom.whichTransitionEvent();
    const headerElement = document.querySelector('.skinHeader');
    const osdBottomElement = view.querySelector('.videoOsdBottom-maincontrols');

    // 启用滑块键盘拖拽功能
    nowPlayingPositionSlider.enableKeyboardDragging();
    nowPlayingVolumeSlider.enableKeyboardDragging();

    // 在电视模式下，使位置滑块可聚焦
    if (layoutManager.tv) {
        nowPlayingPositionSlider.classList.add('focusable');
    }

    // 绑定持续时间文本点击事件
    nowPlayingDurationText.addEventListener('click', nowPlayingDurationTextClick);

    view.addEventListener('viewbeforeshow', function () {
        headerElement.classList.add('osdHeader');
        setBackdropTransparency(TRANSPARENCY_LEVEL.Full);
    });
    view.addEventListener('viewshow', function () {
        try {
            Events.on(playbackManager, 'playerchange', onPlayerChange);
            bindToPlayer(playbackManager.getCurrentPlayer());
            /* eslint-disable-next-line compat/compat */
            dom.addEventListener(document, window.PointerEvent ? 'pointermove' : 'mousemove', onPointerMove, {
                passive: true
            });
            showOsd();
            inputManager.on(window, onInputCommand);
            document.addEventListener('keydown', onKeyDown);
            dom.addEventListener(document, 'keydown', onKeyDownCapture, {
                capture: true,
                passive: true
            });
            document.addEventListener('wheel', onWheel);
            /* eslint-disable-next-line compat/compat */
            dom.addEventListener(window, window.PointerEvent ? 'pointerdown' : 'mousedown', onWindowMouseDown, {
                capture: true,
                passive: true
            });
            /* eslint-disable-next-line compat/compat */
            dom.addEventListener(window, window.PointerEvent ? 'pointerup' : 'mouseup', onWindowMouseUp, {
                capture: true,
                passive: true
            });
            dom.addEventListener(window, 'touchstart', onWindowMouseDown, {
                capture: true,
                passive: true
            });
            ['touchend', 'touchcancel'].forEach((event) => {
                dom.addEventListener(window, event, onWindowMouseUp, {
                    capture: true,
                    passive: true
                });
            });
            dom.addEventListener(window, 'dragend', onWindowDragEnd, {
                capture: true,
                passive: true
            });
            if (browser.firefox || browser.edge) {
                dom.addEventListener(document, 'click', onClickCapture, { capture: true });
            }
        } catch {
            setBackdropTransparency(TRANSPARENCY_LEVEL.None); // reset state set in viewbeforeshow
            appRouter.goHome();
        }
    });
    view.addEventListener('viewbeforehide', function () {
        if (statsOverlay) {
            statsOverlay.enabled(false);
        }

        document.removeEventListener('keydown', onKeyDown);
        dom.removeEventListener(document, 'keydown', onKeyDownCapture, {
            capture: true,
            passive: true
        });
        document.removeEventListener('wheel', onWheel);
        /* eslint-disable-next-line compat/compat */
        dom.removeEventListener(window, window.PointerEvent ? 'pointerdown' : 'mousedown', onWindowMouseDown, {
            capture: true,
            passive: true
        });
        /* eslint-disable-next-line compat/compat */
        dom.removeEventListener(window, window.PointerEvent ? 'pointerup' : 'mouseup', onWindowMouseUp, {
            capture: true,
            passive: true
        });
        dom.removeEventListener(window, 'touchstart', onWindowMouseDown, {
            capture: true,
            passive: true
        });
        ['touchend', 'touchcancel'].forEach((event) => {
            dom.removeEventListener(window, event, onWindowMouseUp, {
                capture: true,
                passive: true
            });
        });
        dom.removeEventListener(window, 'dragend', onWindowDragEnd, {
            capture: true,
            passive: true
        });
        if (browser.firefox || browser.edge) {
            dom.removeEventListener(document, 'click', onClickCapture, { capture: true });
        }
        stopOsdHideTimer();
        headerElement.classList.remove('osdHeader');
        headerElement.classList.remove('osdHeader-hidden');
        /* eslint-disable-next-line compat/compat */
        dom.removeEventListener(document, window.PointerEvent ? 'pointermove' : 'mousemove', onPointerMove, {
            passive: true
        });
        inputManager.off(window, onInputCommand);
        Events.off(playbackManager, 'playerchange', onPlayerChange);
        releaseCurrentPlayer();
    });
    view.querySelector('.btnFullscreen').addEventListener('click', function () {
        playbackManager.toggleFullscreen(currentPlayer);
    });
    view.querySelector('.btnPip').addEventListener('click', function () {
        playbackManager.togglePictureInPicture(currentPlayer);
    });
    view.querySelector('.btnAirPlay').addEventListener('click', function () {
        playbackManager.toggleAirPlay(currentPlayer);
    });
    view.querySelector('.btnVideoOsdSettings').addEventListener('click', onSettingsButtonClick);
    view.addEventListener('viewhide', function () {
        headerElement.classList.remove('hide');
    });
    view.addEventListener('viewdestroy', function () {
        if (self.touchHelper) {
            self.touchHelper.destroy();
            self.touchHelper = null;
        }

        if (recordingButtonManager) {
            recordingButtonManager.destroy();
            recordingButtonManager = null;
        }

        destroyStats();
        destroySubtitleSync();
    });
    let lastPointerDown = 0;
    /* eslint-disable-next-line compat/compat */
    dom.addEventListener(view, window.PointerEvent ? 'pointerdown' : 'click', function (e) {
        if (dom.parentWithClass(e.target, ['videoOsdBottom', 'upNextContainer'])) {
            showOsd();
            return;
        }

        const pointerType = e.pointerType || (layoutManager.mobile ? 'touch' : 'mouse');
        const now = new Date().getTime();

        switch (pointerType) {
            case 'touch':
                if (now - lastPointerDown > 300) {
                    lastPointerDown = now;
                    toggleOsd();
                }

                break;

            case 'mouse':
                if (!e.button) {
                    if (playPauseClickTimeout) {
                        clearTimeout(playPauseClickTimeout);
                        playPauseClickTimeout = 0;
                    } else {
                        playPauseClickTimeout = setTimeout(function() {
                            playbackManager.playPause(currentPlayer);
                            showOsd();
                            playPauseClickTimeout = 0;
                        }, 300);
                    }
                }

                break;

            default:
                playbackManager.playPause(currentPlayer);
                showOsd();
        }
    }, {
        passive: true
    });

    dom.addEventListener(view, 'dblclick', (e) => {
        if (e.target !== view) return;
        playbackManager.toggleFullscreen(currentPlayer);
    });

    view.querySelector('.buttonMute').addEventListener('click', function () {
        playbackManager.toggleMute(currentPlayer);
    });

    nowPlayingVolumeSlider.addEventListener('input', (e) => {
        playbackManager.setVolume(e.target.value, currentPlayer);
    });

    nowPlayingPositionSlider.addEventListener('change', function () {
        const player = currentPlayer;

        if (player) {
            const newPercent = parseFloat(this.value);

            if (enableProgressByTimeOfDay) {
                let seekAirTimeTicks = newPercent / 100 * (programEndDateMs - programStartDateMs) * 1e4;
                seekAirTimeTicks += 1e4 * programStartDateMs;
                seekAirTimeTicks -= playbackStartTimeTicks;
                playbackManager.seek(seekAirTimeTicks, player);
            } else {
                playbackManager.seekPercent(newPercent, player);
            }
        }
    });

    nowPlayingPositionSlider.addEventListener('keydown', function (e) {
        if (e.defaultPrevented) return;

        const key = keyboardnavigation.getKeyName(e);
        if (key === 'Enter') {
            playbackManager.playPause(currentPlayer);
        }
    });

    nowPlayingPositionSlider.updateBubbleHtml = function(bubble, value) {
        showOsd();

        const item = currentItem;
        const ticks = currentRuntimeTicks * value / 100;

        if (trickplayResolution && item?.Trickplay) {
            return updateTrickplayBubbleHtml(
                ServerConnections.getApiClient(item.ServerId),
                trickplayResolution,
                item,
                currentPlayer.streamInfo.mediaSource.Id,
                bubble,
                ticks);
        }

        return false;
    };

    nowPlayingPositionSlider.getBubbleHtml = function (value) {
        showOsd();
        if (enableProgressByTimeOfDay) {
            if (programStartDateMs && programEndDateMs) {
                let ms = programEndDateMs - programStartDateMs;
                ms /= 100;
                ms *= value;
                ms += programStartDateMs;
                return '<h1 class="sliderBubbleText">' + getDisplayTimeWithoutAmPm(new Date(parseInt(ms, 10)), true) + '</h1>';
            }

            return '--:--';
        }

        if (!currentRuntimeTicks) {
            return '--:--';
        }

        let ticks = currentRuntimeTicks;
        ticks /= 100;
        ticks *= value;
        const item = currentItem;

        if (item?.Chapters?.length && item.Chapters[0].ImageTag) {
            const html = getChapterBubbleHtml(ServerConnections.getApiClient(item.ServerId), item, item.Chapters, ticks);

            if (html) {
                return html;
            }
        }

        return '<h1 class="sliderBubbleText">' + datetime.getDisplayRunningTime(ticks) + '</h1>';
    };

    nowPlayingPositionSlider.getMarkerInfo = function () {
        // use markers based on chapters
        return currentItem?.Chapters?.map(currentChapter => ({
            name: currentChapter.Name,
            progress: currentChapter.StartPositionTicks / currentItem.RunTimeTicks
        })) || [];
    };

    view.querySelector('.btnPreviousTrack').addEventListener('click', function () {
        playbackManager.previousTrack(currentPlayer);
    });
    view.querySelector('.btnPreviousChapter').addEventListener('click', function () {
        playbackManager.previousChapter(currentPlayer);
    });
    view.querySelector('.btnPause').addEventListener('click', function () {
        playbackManager.playPause(currentPlayer);
    });
    view.querySelector('.btnNextChapter').addEventListener('click', function () {
        playbackManager.nextChapter(currentPlayer);
    });
    view.querySelector('.btnNextTrack').addEventListener('click', function () {
        playbackManager.nextTrack(currentPlayer);
    });
    btnRewind.addEventListener('click', function () {
        playbackManager.rewind(currentPlayer);
    });
    btnFastForward.addEventListener('click', function () {
        playbackManager.fastForward(currentPlayer);
    });
    view.querySelector('.btnAudio').addEventListener('click', showAudioTrackSelection);
    view.querySelector('.btnSubtitles').addEventListener('click', showSubtitleTrackSelection);

    // 从emby-button中移除评分按钮，使其外观与其他按钮一致
    // HACK：从评分按钮中移除`emby-button`类，使其看起来像其他按钮
    view.querySelector('.btnUserRating').classList.remove('emby-button');

    /**
     * 显示SyncPlay图标
     * 根据同步播放状态显示不同的动画图标
     * @param {string} action - 动作类型：
     *   - 'schedule-play': 计划播放
     *   - 'unpause': 取消暂停
     *   - 'pause': 暂停
     *   - 'seek': 搜索
     *   - 'buffering': 缓冲
     *   - 'wait-pause': 等待暂停
     *   - 'wait-unpause': 等待取消暂停
     */
    const showIcon = (action) => {
        let primaryIconName = '';
        let secondaryIconName = '';
        let animationClass = 'oneShotPulse';
        let iconVisibilityTime = 1500;
        const syncPlayIcon = view.querySelector('#syncPlayIcon');

        switch (action) {
            case 'schedule-play':
                // 计划播放：显示同步旋转图标和播放箭头
                primaryIconName = 'sync spin';
                secondaryIconName = 'play_arrow centered';
                animationClass = 'infinitePulse';
                iconVisibilityTime = -1;
                hideOsd();
                break;
            case 'unpause':
                // 取消暂停：显示播放圆圈轮廓图标
                primaryIconName = 'play_circle_outline';
                break;
            case 'pause':
                // 暂停：显示暂停圆圈轮廓图标
                primaryIconName = 'pause_circle_outline';
                showOsd();
                break;
            case 'seek':
                // 搜索：显示更新图标
                primaryIconName = 'update';
                animationClass = 'infinitePulse';
                iconVisibilityTime = -1;
                break;
            case 'buffering':
                // 缓冲：显示计划图标
                primaryIconName = 'schedule';
                animationClass = 'infinitePulse';
                iconVisibilityTime = -1;
                break;
            case 'wait-pause':
                // 等待暂停：显示计划图标和暂停图标
                primaryIconName = 'schedule';
                secondaryIconName = 'pause shifted';
                animationClass = 'infinitePulse';
                iconVisibilityTime = -1;
                break;
            case 'wait-unpause':
                // 等待取消暂停：显示计划图标和播放箭头
                primaryIconName = 'schedule';
                secondaryIconName = 'play_arrow shifted';
                animationClass = 'infinitePulse';
                iconVisibilityTime = -1;
                break;
            default: {
                // 默认：隐藏图标
                syncPlayIcon.style.visibility = 'hidden';
                return;
            }
        }

        syncPlayIcon.setAttribute('class', 'syncPlayIconCircle ' + animationClass);

        const primaryIcon = syncPlayIcon.querySelector('.primary-icon');
        primaryIcon.setAttribute('class', 'primary-icon material-icons ' + primaryIconName);

        const secondaryIcon = syncPlayIcon.querySelector('.secondary-icon');
        secondaryIcon.setAttribute('class', 'secondary-icon material-icons ' + secondaryIconName);

        // 克隆节点以重新启动动画
        const clone = syncPlayIcon.cloneNode(true);
        clone.style.visibility = 'visible';
        syncPlayIcon.parentNode.replaceChild(clone, syncPlayIcon);

        if (iconVisibilityTime < 0) {
            return;
        }

        setTimeout(() => {
            clone.style.visibility = 'hidden';
        }, iconVisibilityTime);
    };

    // 注册SyncPlay播放事件并显示大型动画图标
    const SyncPlay = pluginManager.firstOfType(PluginType.SyncPlay)?.instance;
    if (SyncPlay) {
        // 监听SyncPlay启用/禁用事件
        Events.on(SyncPlay.Manager, 'enabled', (_event, enabled) => {
            if (!enabled) {
                const syncPlayIcon = view.querySelector('#syncPlayIcon');
                syncPlayIcon.style.visibility = 'hidden';
            }
        });

        // 监听OSD通知事件
        Events.on(SyncPlay.Manager, 'notify-osd', (_event, action) => {
            showIcon(action);
        });

        // 监听组状态更新事件
        Events.on(SyncPlay.Manager, 'group-state-update', (_event, state, reason) => {
            if (state === 'Playing' && reason === 'Unpause') {
                showIcon('schedule-play');
            } else if (state === 'Playing' && reason === 'Ready') {
                showIcon('schedule-play');
            } else if (state === 'Paused' && reason === 'Pause') {
                showIcon('pause');
            } else if (state === 'Paused' && reason === 'Ready') {
                showIcon('clear');
            } else if (state === 'Waiting' && reason === 'Seek') {
                showIcon('seek');
            } else if (state === 'Waiting' && reason === 'Buffer') {
                showIcon('buffering');
            } else if (state === 'Waiting' && reason === 'Pause') {
                showIcon('wait-pause');
            } else if (state === 'Waiting' && reason === 'Unpause') {
                showIcon('wait-unpause');
            }
        });
    }
}

