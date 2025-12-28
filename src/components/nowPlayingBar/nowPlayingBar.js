import { getImageUrl } from 'apps/stable/features/playback/utils/image';
import { getItemTextLines } from 'apps/stable/features/playback/utils/itemText';
import { appRouter, isLyricsPage } from 'components/router/appRouter';
import { AppFeature } from 'constants/appFeature';
import { ServerConnections } from 'lib/jellyfin-apiclient';

import datetime from '../../scripts/datetime';
import Events from '../../utils/events.ts';
import browser from '../../scripts/browser';
import imageLoader from '../images/imageLoader';
import layoutManager from '../layoutManager';
import { playbackManager } from '../playback/playbackmanager';
import { appHost } from '../apphost';
import dom from '../../scripts/dom';
import globalize from 'lib/globalize';
import itemContextMenu from '../itemContextMenu';
import '../../elements/emby-button/paper-icon-button-light';
import '../../elements/emby-ratingbutton/emby-ratingbutton';
import appFooter from '../appFooter/appFooter';
import itemShortcuts from '../shortcuts';
import './nowPlayingBar.scss';
import '../../elements/emby-slider/emby-slider';

// nowPlayingBar：底部“正在播放”控制条。
// 目标：当播放器进入音频播放状态时显示控制条，并同步进度/音量/循环/随机等状态。
// 注意：这里以 DOM + 事件绑定为主，尽量避免在 timeupdate 里频繁改 DOM（有节流）。

let currentPlayer;
let currentPlayerSupportedCommands = [];

let currentTimeElement;
let nowPlayingImageElement;
let nowPlayingImageUrl;
let nowPlayingTextElement;
let nowPlayingUserData;
let muteButton;
let volumeSlider;
let volumeSliderContainer;
let playPauseButtons;
let positionSlider;
let toggleAirPlayButton;
let toggleRepeatButton;
let toggleRepeatButtonIcon;
let lyricButton;

let lastUpdateTime = 0;
let lastPlayerState = {};
let isEnabled;
let currentRuntimeTicks = 0;

let isVisibilityAllowed = true;

let isLyricPageActive = false;

function getNowPlayingBarHtml() {
    // 生成 nowPlayingBar 的静态 HTML 结构（后续通过 bindEvents 绑定事件/引用元素）。
    let html = '';

    html += '<div class="nowPlayingBar hide nowPlayingBar-hidden">';

    html += '<div class="nowPlayingBarTop">';
    html += '<div class="nowPlayingBarPositionContainer sliderContainer" dir="ltr">';
    html += '<input type="range" is="emby-slider" pin step=".01" min="0" max="100" value="0" class="slider-medium-thumb nowPlayingBarPositionSlider" data-slider-keep-progress="true"/>';
    html += '</div>';

    html += '<div class="nowPlayingBarInfoContainer">';
    html += '<div class="nowPlayingImage"></div>';
    html += '<div class="nowPlayingBarText"></div>';
    html += '</div>';

    // The onclicks are needed due to the return false above
    // 由于上层有 return false 的拦截，这些按钮需要显式绑定 click。
    html += '<div class="nowPlayingBarCenter" dir="ltr">';

    html += `<button is="paper-icon-button-light" class="previousTrackButton mediaButton" title="${globalize.translate('ButtonPreviousTrack')}"><span class="material-icons skip_previous" aria-hidden="true"></span></button>`;

    html += `<button is="paper-icon-button-light" class="playPauseButton mediaButton" title="${globalize.translate('ButtonPause')}"><span class="material-icons pause" aria-hidden="true"></span></button>`;

    html += `<button is="paper-icon-button-light" class="stopButton mediaButton" title="${globalize.translate('ButtonStop')}"><span class="material-icons stop" aria-hidden="true"></span></button>`;
    if (!layoutManager.mobile) {
        html += `<button is="paper-icon-button-light" class="nextTrackButton mediaButton" title="${globalize.translate('ButtonNextTrack')}"><span class="material-icons skip_next" aria-hidden="true"></span></button>`;
    }

    html += '<div class="nowPlayingBarCurrentTime"></div>';
    html += '</div>';

    html += '<div class="nowPlayingBarRight">';

    html += `<button is="paper-icon-button-light" class="muteButton mediaButton" title="${globalize.translate('Mute')}"><span class="material-icons volume_up" aria-hidden="true"></span></button>`;

    html += '<div class="sliderContainer nowPlayingBarVolumeSliderContainer hide" style="width:9em;vertical-align:middle;display:inline-flex;">';
    html += '<input type="range" is="emby-slider" pin step="1" min="0" max="100" value="0" class="slider-medium-thumb nowPlayingBarVolumeSlider"/>';
    html += '</div>';

    html += `<button is="paper-icon-button-light" class="btnAirPlay mediaButton" title="${globalize.translate('AirPlay')}"><span class="material-icons airplay" aria-hidden="true"></span></button>`;

    html += `<button is="paper-icon-button-light" class="openLyricsButton mediaButton hide" title="${globalize.translate('Lyrics')}"><span class="material-icons lyrics" style="top:0.1em" aria-hidden="true"></span></button>`;

    html += `<button is="paper-icon-button-light" class="toggleRepeatButton mediaButton" title="${globalize.translate('Repeat')}"><span class="material-icons repeat" aria-hidden="true"></span></button>`;
    html += `<button is="paper-icon-button-light" class="btnShuffleQueue mediaButton" title="${globalize.translate('Shuffle')}"><span class="material-icons shuffle" aria-hidden="true"></span></button>`;

    html += '<div class="nowPlayingBarUserDataButtons">';
    html += '</div>';

    html += `<button is="paper-icon-button-light" class="playPauseButton mediaButton" title="${globalize.translate('ButtonPause')}"><span class="material-icons pause" aria-hidden="true"></span></button>`;
    if (layoutManager.mobile) {
        html += `<button is="paper-icon-button-light" class="nextTrackButton mediaButton" title="${globalize.translate('ButtonNextTrack')}"><span class="material-icons skip_next" aria-hidden="true"></span></button>`;
    } else {
        html += `<button is="paper-icon-button-light" class="btnToggleContextMenu mediaButton" title="${globalize.translate('ButtonMore')}"><span class="material-icons more_vert" aria-hidden="true"></span></button>`;
    }

    html += '</div>';
    html += '</div>';

    html += '</div>';

    return html;
}

function onSlideDownComplete() {
    // 收起动画结束后，真正把元素隐藏（避免占位/可点击）。
    this.classList.add('hide');
}

function slideDown(elem) {
    // 向下收起（带 CSS transition）。
    // trigger reflow
    void elem.offsetWidth;

    elem.classList.add('nowPlayingBar-hidden');

    dom.addEventListener(elem, dom.whichTransitionEvent(), onSlideDownComplete, {
        once: true
    });
}

function slideUp(elem) {
    // 向上展开（带 CSS transition）。
    dom.removeEventListener(elem, dom.whichTransitionEvent(), onSlideDownComplete, {
        once: true
    });

    elem.classList.remove('hide');

    // trigger reflow
    void elem.offsetWidth;

    elem.classList.remove('nowPlayingBar-hidden');
}

function onPlayPauseClick() {
    // 播放/暂停切换
    playbackManager.playPause(currentPlayer);
}

function bindEvents(elem) {
    // 绑定 UI 事件 + 缓存常用 DOM 引用。
    // 这里把 slider / button 的处理集中在一起，避免在状态更新里反复 querySelector。
    currentTimeElement = elem.querySelector('.nowPlayingBarCurrentTime');
    nowPlayingImageElement = elem.querySelector('.nowPlayingImage');
    nowPlayingTextElement = elem.querySelector('.nowPlayingBarText');
    nowPlayingUserData = elem.querySelector('.nowPlayingBarUserDataButtons');
    positionSlider = elem.querySelector('.nowPlayingBarPositionSlider');
    muteButton = elem.querySelector('.muteButton');
    playPauseButtons = elem.querySelectorAll('.playPauseButton');
    toggleRepeatButton = elem.querySelector('.toggleRepeatButton');
    volumeSlider = elem.querySelector('.nowPlayingBarVolumeSlider');
    volumeSliderContainer = elem.querySelector('.nowPlayingBarVolumeSliderContainer');
    lyricButton = nowPlayingBarElement.querySelector('.openLyricsButton');

    muteButton.addEventListener('click', function () {
        if (currentPlayer) {
            playbackManager.toggleMute(currentPlayer);
        }
    });

    elem.querySelector('.stopButton').addEventListener('click', function () {
        if (currentPlayer) {
            playbackManager.stop(currentPlayer);
        }
    });

    playPauseButtons.forEach((button) => {
        button.addEventListener('click', onPlayPauseClick);
    });

    elem.querySelector('.nextTrackButton').addEventListener('click', function () {
        if (currentPlayer) {
            playbackManager.nextTrack(currentPlayer);
        }
    });

    elem.querySelector('.previousTrackButton').addEventListener('click', function (e) {
        if (currentPlayer) {
            if (playbackManager.isPlayingAudio(currentPlayer)) {
                // Cancel this event if doubleclick is fired. The actual previousTrack will be processed by the 'dblclick' event
                // 双击上一曲时：单击事件会先触发，这里用 e.detail>1 来避免重复处理。
                if (e.detail > 1 ) {
                    return;
                }

                // Return to start of track, unless we are already (almost) at the beginning. In the latter case, continue and move
                // to the previous track, unless we are at the first track so no previous track exists.
                // currentTime is in msec.

                if (playbackManager.currentTime(currentPlayer) >= 5 * 1000 || playbackManager.getCurrentPlaylistIndex(currentPlayer) <= 0) {
                    // 单击上一曲：优先回到本曲开头（>=5s 时），或当已在列表第一首时也回到开头。
                    playbackManager.seekPercent(0, currentPlayer);
                    // This is done automatically by playbackManager, however, setting this here gives instant visual feedback.
                    // TODO: Check why seekPercent doesn't reflect the changes inmmediately, so we can remove this workaround.
                    // seekPercent 会异步更新 UI；这里先手动置 0 提供即时反馈。
                    positionSlider.value = 0;
                    return;
                }
            }
            playbackManager.previousTrack(currentPlayer);
        }
    });

    elem.querySelector('.previousTrackButton').addEventListener('dblclick', function () {
        if (currentPlayer) {
            playbackManager.previousTrack(currentPlayer);
        }
    });

    toggleAirPlayButton = elem.querySelector('.btnAirPlay');
    toggleAirPlayButton.addEventListener('click', function () {
        if (currentPlayer) {
            playbackManager.toggleAirPlay(currentPlayer);
        }
    });

    elem.querySelector('.btnShuffleQueue').addEventListener('click', function () {
        if (currentPlayer) {
            playbackManager.toggleQueueShuffleMode();
        }
    });

    lyricButton.addEventListener('click', function() {
        // 歌词页按钮：已在歌词页则返回，否则跳转到歌词页。
        if (isLyricPageActive) {
            appRouter.back();
        } else {
            appRouter.show('lyrics');
        }
    });

    toggleRepeatButton = elem.querySelector('.toggleRepeatButton');
    toggleRepeatButton.addEventListener('click', function () {
        switch (playbackManager.getRepeatMode()) {
            case 'RepeatAll':
                playbackManager.setRepeatMode('RepeatOne');
                break;
            case 'RepeatOne':
                playbackManager.setRepeatMode('RepeatNone');
                break;
            case 'RepeatNone':
                playbackManager.setRepeatMode('RepeatAll');
        }
    });

    toggleRepeatButtonIcon = toggleRepeatButton.querySelector('.material-icons');

    volumeSliderContainer.classList.toggle('hide', appHost.supports(AppFeature.PhysicalVolumeControl));

    volumeSlider.addEventListener('input', (e) => {
        if (currentPlayer) {
            currentPlayer.setVolume(e.target.value);
        }
    });

    positionSlider.addEventListener('change', function () {
        if (currentPlayer) {
            const newPercent = parseFloat(this.value);

            playbackManager.seekPercent(newPercent, currentPlayer);
        }
    });

    positionSlider.getBubbleText = function (value) {
        // 进度条气泡提示：根据当前播放时长（ticks）和百分比计算显示时间。
        const state = lastPlayerState;

        if (!state?.NowPlayingItem || !currentRuntimeTicks) {
            return '--:--';
        }

        let ticks = currentRuntimeTicks;
        ticks /= 100;
        ticks *= value;

        return datetime.getDisplayRunningTime(ticks);
    };

    elem.addEventListener('click', function (e) {
        // 点击空白区域打开“正在播放/遥控器”页面；点到按钮/滑块则不触发。
        if (!dom.parentWithTag(e.target, ['BUTTON', 'INPUT'])) {
            showRemoteControl();
        }
    });
}

function showRemoteControl() {
    // 打开 Now Playing 页面（在不同端可能表现为遥控器/正在播放详情）。
    appRouter.showNowPlaying();
}

let nowPlayingBarElement;
function getNowPlayingBar() {
    // 懒加载：首次需要时才插入 nowPlayingBar 的 DOM，并绑定事件。
    if (nowPlayingBarElement) {
        return nowPlayingBarElement;
    }

    const parentContainer = appFooter.element;
    nowPlayingBarElement = parentContainer.querySelector('.nowPlayingBar');

    if (nowPlayingBarElement) {
        return nowPlayingBarElement;
    }

    parentContainer.insertAdjacentHTML('afterbegin', getNowPlayingBarHtml());
    window.CustomElements.upgradeSubtree(parentContainer);

    nowPlayingBarElement = parentContainer.querySelector('.nowPlayingBar');

    if (layoutManager.mobile) {
        // 移动端：隐藏中间控制区与随机按钮（避免过于拥挤）。
        nowPlayingBarElement.querySelector('.btnShuffleQueue').classList.add('hide');
        nowPlayingBarElement.querySelector('.nowPlayingBarCenter').classList.add('hide');
    }

    if (browser.safari && browser.slow) {
        // Not handled well here. The wrong elements receive events, bar doesn't update quickly enough, etc.
        nowPlayingBarElement.classList.add('noMediaProgress');
    }

    itemShortcuts.on(nowPlayingBarElement);

    bindEvents(nowPlayingBarElement);

    return nowPlayingBarElement;
}

function updatePlayPauseState(isPaused) {
    // 同步两个 play/pause 按钮（左侧/右侧）图标与 title。
    if (playPauseButtons) {
        playPauseButtons.forEach((button) => {
            const icon = button.querySelector('.material-icons');
            icon.classList.remove('play_arrow', 'pause');
            icon.classList.add(isPaused ? 'play_arrow' : 'pause');
            button.title = globalize.translate(isPaused ? 'Play' : 'ButtonPause');
        });
    }
}

function updatePlayerStateInternal(event, state, player) {
    // 根据播放器 state 刷新控制条 UI（按钮可用性、进度、音量、封面、文本等）。
    showNowPlayingBar();

    lastPlayerState = state;

    const playerInfo = playbackManager.getPlayerInfo();

    const playState = state.PlayState || {};

    updatePlayPauseState(playState.IsPaused);

    const supportedCommands = playerInfo.supportedCommands;
    currentPlayerSupportedCommands = supportedCommands;

    // supportedCommands 由播放端能力决定：例如远程投送/某些播放器不支持设置音量/循环等。

    if (supportedCommands.indexOf('SetRepeatMode') === -1) {
        toggleRepeatButton.classList.add('hide');
    } else {
        toggleRepeatButton.classList.remove('hide');
    }

    const hideAirPlayButton = supportedCommands.indexOf('AirPlay') === -1;
    toggleAirPlayButton.classList.toggle('hide', hideAirPlayButton);

    updateRepeatModeDisplay(playbackManager.getRepeatMode());
    onQueueShuffleModeChange();

    updatePlayerVolumeState(playState.IsMuted, playState.VolumeLevel);

    if (positionSlider && !positionSlider.dragging) {
        // 用户拖动时不强行覆盖 slider 值，避免“抢手”。
        positionSlider.disabled = !playState.CanSeek;

        // determines if both forward and backward buffer progress will be visible
        const isProgressClear = state.MediaSource && state.MediaSource.RunTimeTicks == null;
        positionSlider.setIsClear(isProgressClear);
    }

    const nowPlayingItem = state.NowPlayingItem || {};
    updateTimeDisplay(playState.PositionTicks, nowPlayingItem.RunTimeTicks, playbackManager.getBufferedRanges(player));

    updateNowPlayingInfo(state);
    updateLyricButton(nowPlayingItem);
}

function updateRepeatModeDisplay(repeatMode) {
    // 循环模式：RepeatAll / RepeatOne / RepeatNone
    toggleRepeatButtonIcon.classList.remove('repeat', 'repeat_one');
    const cssClass = 'buttonActive';

    switch (repeatMode) {
        case 'RepeatAll':
            toggleRepeatButtonIcon.classList.add('repeat');
            toggleRepeatButton.classList.add(cssClass);
            break;
        case 'RepeatOne':
            toggleRepeatButtonIcon.classList.add('repeat_one');
            toggleRepeatButton.classList.add(cssClass);
            break;
        case 'RepeatNone':
        default:
            toggleRepeatButtonIcon.classList.add('repeat');
            toggleRepeatButton.classList.remove(cssClass);
            break;
    }
}

function updateTimeDisplay(positionTicks, runtimeTicks, bufferedRanges) {
    // 更新进度条、缓冲区和时间文本。
    // See bindEvents for why this is necessary
    if (positionSlider && !positionSlider.dragging) {
        if (runtimeTicks) {
            let pct = positionTicks / runtimeTicks;
            pct *= 100;

            positionSlider.value = pct;
        } else {
            positionSlider.value = 0;
        }
    }

    if (positionSlider) {
        positionSlider.setBufferedRanges(bufferedRanges, runtimeTicks, positionTicks);
    }

    if (currentTimeElement) {
        let timeText = positionTicks == null ? '--:--' : datetime.getDisplayRunningTime(positionTicks);
        if (runtimeTicks) {
            timeText += ' / ' + datetime.getDisplayRunningTime(runtimeTicks);
        }

        currentTimeElement.innerHTML = timeText;
    }
}

function updatePlayerVolumeState(isMuted, volumeLevel) {
    // 更新静音按钮/音量条，并根据能力（supportedCommands/物理音量）决定是否隐藏。
    const supportedCommands = currentPlayerSupportedCommands;

    let showMuteButton = true;
    let showVolumeSlider = true;

    if (supportedCommands.indexOf('ToggleMute') === -1) {
        showMuteButton = false;
    }

    const muteButtonIcon = muteButton.querySelector('.material-icons');
    muteButtonIcon.classList.remove('volume_off', 'volume_up');
    muteButtonIcon.classList.add(isMuted ? 'volume_off' : 'volume_up');
    muteButton.title = globalize.translate(isMuted ? 'Unmute' : 'Mute');

    if (supportedCommands.indexOf('SetVolume') === -1) {
        showVolumeSlider = false;
    }

    if (currentPlayer.isLocalPlayer && appHost.supports(AppFeature.PhysicalVolumeControl)) {
        showMuteButton = false;
        showVolumeSlider = false;
    }

    muteButton.classList.toggle('hide', !showMuteButton);

    // See bindEvents for why this is necessary
    if (volumeSlider) {
        volumeSliderContainer.classList.toggle('hide', !showVolumeSlider);

        if (!volumeSlider.dragging) {
            volumeSlider.value = volumeLevel || 0;
        }
    }
}

function updateLyricButton(item) {
    // 歌词按钮：仅音频 + HasLyrics 时显示。
    if (!isEnabled) return;

    const hasLyrics = !!item && item.Type === 'Audio' && item.HasLyrics;
    lyricButton.classList.toggle('hide', !hasLyrics);
    setLyricButtonActiveStatus();
}

function setLyricButtonActiveStatus() {
    // 通过 buttonActive 样式反映“当前是否在歌词页”。
    if (!isEnabled) return;

    lyricButton.classList.toggle('buttonActive', isLyricPageActive);
}

function updateNowPlayingInfo(state) {
    // 更新文本（标题/副标题）、封面图、以及用户数据按钮（喜欢/收藏等）。
    const nowPlayingItem = state.NowPlayingItem;

    const textLines = nowPlayingItem ? getItemTextLines(nowPlayingItem) : undefined;
    nowPlayingTextElement.innerHTML = '';
    if (textLines) {
        const itemText = document.createElement('div');
        const secondaryText = document.createElement('div');
        secondaryText.classList.add('nowPlayingBarSecondaryText');
        if (textLines.length > 1 && textLines[1]) {
            const text = document.createElement('a');
            text.innerText = textLines[1];
            secondaryText.appendChild(text);
        }

        if (textLines[0]) {
            const text = document.createElement('a');
            text.innerText = textLines[0];
            itemText.appendChild(text);
        }
        nowPlayingTextElement.appendChild(itemText);
        nowPlayingTextElement.appendChild(secondaryText);
    }

    const imgHeight = 70;

    const url = nowPlayingItem ? getImageUrl(nowPlayingItem, {
        height: imgHeight
    }) : null;

    if (url !== nowPlayingImageUrl) {
        if (url) {
            nowPlayingImageUrl = url;
            imageLoader.lazyImage(nowPlayingImageElement, nowPlayingImageUrl);
            nowPlayingImageElement.style.display = null;
            nowPlayingTextElement.style.marginLeft = null;
        } else {
            nowPlayingImageUrl = null;
            nowPlayingImageElement.style.backgroundImage = '';
            nowPlayingImageElement.style.display = 'none';
            nowPlayingTextElement.style.marginLeft = '1em';
        }
    }

    if (nowPlayingItem.Id) {
        // 需要额外请求一次 item，取到 UserData（Likes/Favorite）用于渲染按钮。
        const apiClient = ServerConnections.getApiClient(nowPlayingItem.ServerId);
        apiClient.getItem(apiClient.getCurrentUserId(), nowPlayingItem.Id).then(function (item) {
            const userData = item.UserData || {};
            const likes = userData.Likes == null ? '' : userData.Likes;
            if (!layoutManager.mobile) {
                let contextButton = nowPlayingBarElement.querySelector('.btnToggleContextMenu');
                // We remove the previous event listener by replacing the item in each update event
                // 通过替换节点的方式清理旧的 click 监听，避免重复绑定。
                const contextButtonClone = contextButton.cloneNode(true);
                contextButton.parentNode.replaceChild(contextButtonClone, contextButton);
                contextButton = nowPlayingBarElement.querySelector('.btnToggleContextMenu');
                const options = {
                    play: false,
                    queue: false,
                    stopPlayback: true,
                    clearQueue: true,
                    positionTo: contextButton
                };
                apiClient.getCurrentUser().then(function (user) {
                    contextButton.addEventListener('click', function () {
                        itemContextMenu.show(Object.assign({
                            item: item,
                            user: user
                        }, options))
                            .catch(() => { /* no-op */ });
                    });
                });
            }
            nowPlayingUserData.innerHTML = '<button is="emby-ratingbutton" type="button" class="mediaButton paper-icon-button-light" data-id="' + item.Id + '" data-serverid="' + item.ServerId + '" data-itemtype="' + item.Type + '" data-likes="' + likes + '" data-isfavorite="' + (userData.IsFavorite) + '"><span class="material-icons favorite" aria-hidden="true"></span></button>';
        });
    } else {
        nowPlayingUserData.innerHTML = '';
    }
}

function onPlaybackStart(e, state) {
    // playbackstart / statechange 的统一入口：复用 onStateChanged 逻辑。
    console.debug('nowplaying event: ' + e.type);
    const player = this;

    onStateChanged.call(player, e, state);
}

function onRepeatModeChange() {
    if (!isEnabled) {
        return;
    }

    updateRepeatModeDisplay(playbackManager.getRepeatMode());
}

function onQueueShuffleModeChange() {
    // 随机/排序状态变化时，更新按钮的激活态。
    if (!isEnabled) {
        return;
    }

    const shuffleMode = playbackManager.getQueueShuffleMode();
    const context = nowPlayingBarElement;
    const cssClass = 'buttonActive';
    const toggleShuffleButton = context.querySelector('.btnShuffleQueue');
    switch (shuffleMode) {
        case 'Shuffle':
            toggleShuffleButton.classList.add(cssClass);
            break;
        case 'Sorted':
        default:
            toggleShuffleButton.classList.remove(cssClass);
            break;
    }
}

function showNowPlayingBar() {
    // 显示控制条（若当前 view 不允许显示，则直接隐藏）。
    if (!isVisibilityAllowed) {
        hideNowPlayingBar();
        return;
    }

    slideUp(getNowPlayingBar());
}

function hideNowPlayingBar() {
    // 隐藏控制条，并重置启用状态。
    isEnabled = false;

    // Use a timeout to prevent the bar from hiding and showing quickly
    // in the event of a stop->play command

    // Don't call getNowPlayingBar here because we don't want to end up creating it just to hide it
    const elem = document.getElementsByClassName('nowPlayingBar')[0];
    if (elem) {
        slideDown(elem);
    }
}

function onPlaybackStopped(e, state) {
    // 播放停止：在一些场景下隐藏控制条（例如非音频/无下一媒体类型）。
    console.debug('[nowPlayingBar:onPlaybackStopped] event: ' + e.type);

    const player = this;

    if (player.isLocalPlayer) {
        if (state.NextMediaType !== 'Audio') {
            hideNowPlayingBar();
        }
    } else if (!state.NextMediaType) {
        hideNowPlayingBar();
    }
}

function onPlayPauseStateChanged() {
    if (!isEnabled) {
        return;
    }

    const player = this;
    updatePlayPauseState(player.paused());
}

function onStateChanged(event, state) {
    // 播放状态变化：决定是否显示控制条，并触发一次 UI 刷新。
    if (event.type === 'init') {
        // skip non-ready state
        // init 阶段仅用于建立绑定，不刷新 UI。
        return;
    }

    console.debug('[nowPlayingBar:onStateChanged] event: ' + event.type);
    const player = this;

    if (!state.NowPlayingItem || layoutManager.tv || state.IsFullscreen === false) {
        // 无播放项/TV 布局/明确不是全屏时：不显示控制条。
        hideNowPlayingBar();
        return;
    }

    if (player.isLocalPlayer && state.NowPlayingItem && state.NowPlayingItem.MediaType === 'Video') {
        // 本地视频播放：不显示该控制条（视频有自己的控制 UI）。
        hideNowPlayingBar();
        return;
    }

    isEnabled = true;

    if (nowPlayingBarElement) {
        updatePlayerStateInternal(event, state, player);
        return;
    }

    getNowPlayingBar();
    updateLyricButton(state.NowPlayingItem);
    updatePlayerStateInternal(event, state, player);
}

function onTimeUpdate() {
    // timeupdate：定期同步进度/时间（带节流，避免频繁更新 DOM）。
    if (!isEnabled) {
        return;
    }

    // Try to avoid hammering the document with changes
    const now = new Date().getTime();
    if ((now - lastUpdateTime) < 700) {
        return;
    }
    lastUpdateTime = now;

    const player = this;
    currentRuntimeTicks = playbackManager.duration(player);
    updateTimeDisplay(playbackManager.currentTime(player) * 10000, currentRuntimeTicks, playbackManager.getBufferedRanges(player));
}

function releaseCurrentPlayer() {
    // 解绑旧 player 的所有事件，防止泄漏与重复刷新。
    const player = currentPlayer;

    if (player) {
        Events.off(player, 'playbackstart', onPlaybackStart);
        Events.off(player, 'statechange', onPlaybackStart);
        Events.off(player, 'repeatmodechange', onRepeatModeChange);
        Events.off(player, 'shufflequeuemodechange', onQueueShuffleModeChange);
        Events.off(player, 'playbackstop', onPlaybackStopped);
        Events.off(player, 'volumechange', onVolumeChanged);
        Events.off(player, 'pause', onPlayPauseStateChanged);
        Events.off(player, 'unpause', onPlayPauseStateChanged);
        Events.off(player, 'timeupdate', onTimeUpdate);

        currentPlayer = null;
        hideNowPlayingBar();
    }
}

function onVolumeChanged() {
    // 音量/静音变化时刷新按钮与滑块。
    if (!isEnabled) {
        return;
    }

    const player = this;

    updatePlayerVolumeState(player.isMuted(), player.getVolume());
}

function refreshFromPlayer(player, type) {
    // 从 player 主动拉取一次 state，并走 onStateChanged 流程刷新。
    const state = playbackManager.getPlayerState(player);

    onStateChanged.call(player, { type }, state);
}

function bindToPlayer(player) {
    // 绑定到新 player：先释放旧绑定，再注册一组事件监听。
    isLyricPageActive = isLyricsPage();
    if (player === currentPlayer) {
        return;
    }

    releaseCurrentPlayer();

    currentPlayer = player;

    if (!player) {
        return;
    }

    refreshFromPlayer(player, 'init');

    Events.on(player, 'playbackstart', onPlaybackStart);
    Events.on(player, 'statechange', onPlaybackStart);
    Events.on(player, 'repeatmodechange', onRepeatModeChange);
    Events.on(player, 'shufflequeuemodechange', onQueueShuffleModeChange);
    Events.on(player, 'playbackstop', onPlaybackStopped);
    Events.on(player, 'volumechange', onVolumeChanged);
    Events.on(player, 'pause', onPlayPauseStateChanged);
    Events.on(player, 'unpause', onPlayPauseStateChanged);
    Events.on(player, 'timeupdate', onTimeUpdate);
}

Events.on(playbackManager, 'playerchange', function () {
    // 当前播放器实例切换（例如投送/切换播放端）。
    bindToPlayer(playbackManager.getCurrentPlayer());
});

bindToPlayer(playbackManager.getCurrentPlayer());

document.addEventListener('viewbeforeshow', function (e) {
    // 页面切换前：根据 view 的 enableMediaControl 决定是否允许显示控制条。
    isLyricPageActive = isLyricsPage();
    setLyricButtonActiveStatus();
    if (!e.detail.options.enableMediaControl) {
        if (isVisibilityAllowed) {
            isVisibilityAllowed = false;
            hideNowPlayingBar();
        }
    } else if (!isVisibilityAllowed) {
        isVisibilityAllowed = true;
        if (currentPlayer) {
            refreshFromPlayer(currentPlayer, 'refresh');
        } else {
            hideNowPlayingBar();
        }
    }
});
