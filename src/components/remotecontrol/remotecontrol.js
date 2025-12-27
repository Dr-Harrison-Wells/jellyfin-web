// 导入 HTML 转义工具，防止 XSS 攻击
import escapeHtml from 'escape-html';

// 导入播放相关工具函数
import { getImageUrl } from 'apps/stable/features/playback/utils/image';
import { getItemTextLines } from 'apps/stable/features/playback/utils/itemText';
import { AppFeature } from 'constants/appFeature';

// 导入日期时间处理工具
import datetime from '../../scripts/datetime';
// 导入背景图片管理工具
import { clearBackdrop, setBackdrops } from '../backdrop/backdrop';
// 导入列表视图组件
import listView from '../listview/listview';
// 导入图片加载器
import imageLoader from '../images/imageLoader';
// 导入播放管理器
import { playbackManager } from '../playback/playbackmanager';
// 导入事件系统
import Events from '../../utils/events.ts';
// 导入应用主机工具
import { appHost } from '../apphost';
// 导入国际化工具
import globalize from '../../lib/globalize';
// 导入服务器连接管理器
import { ServerConnections } from 'lib/jellyfin-apiclient';
// 导入布局管理器
import layoutManager from '../layoutManager';
// 导入用户设置
import * as userSettings from '../../scripts/settings/userSettings';
// 导入项目上下文菜单
import itemContextMenu from '../itemContextMenu';

// 导入样式和自定义元素
import '../cardbuilder/card.scss';
import '../../elements/emby-button/emby-button';
import '../../elements/emby-button/paper-icon-button-light';
import '../../elements/emby-itemscontainer/emby-itemscontainer';
import './remotecontrol.scss';
import '../../elements/emby-ratingbutton/emby-ratingbutton';
import '../../elements/emby-slider/emby-slider';
// 导入提示框组件
import toast from '../toast/toast';
// 导入应用路由器
let showMuteButton = true;
let showVolumeSlider = true;

/**
 * 显示音频轨道选择菜单
 * @param {HTMLElement} context - 上下文元素
 * @param {Object} player - 播放器实例
 * @param {HTMLElement} button - 触发按钮元素
 */
function showAudioMenu(context, player, button) {
    // 获取当前音频流索引
    const currentIndex = playbackManager.getAudioStreamIndex(player);
    // 获取所有可用的音频轨道
    const streams = playbackManager.audioTracks(player);
    // 将音频流转换为菜单项
    const menuItems = streams.map(function (s) {
        const menuItem = {
    });

    // 动态加载并显示操作表单
    import('../actionSheet/actionSheet').then((actionsheet) => {
        actionsheet.show({
            items: menuItems,
            positionTo: button,
            callback: function (id) {
                // 设置选中的音频流索引
                playbackManager.setAudioStreamIndex(parseInt(id, 10), player);
            }
        });
    });
}

/**
 * 显示字幕轨道选择菜单
 * @param {HTMLElement} context - 上下文元素
 * @param {Object} player - 播放器实例
 * @param {HTMLElement} button - 触发按钮元素
 */
function showSubtitleMenu(context, player, button) {
    // 获取当前字幕流索引
    const currentIndex = playbackManager.getSubtitleStreamIndex(player);
    // 获取所有可用的字幕轨道
    const streams = playbackManager.subtitleTracks(player);
    // 将字幕流转换为菜单项
    const menuItems = streams.map(function (s) {
        const menuItem = {
            name: s.DisplayTitle,
            id: s.Index
        };
    });

    // 动态加载并显示字幕选择表单
    import('../actionSheet/actionSheet').then((actionsheet) => {
        actionsheet.show({
            items: menuItems,
            positionTo: button,
            callback: function (id) {
                // 设置选中的字幕流索引
                playbackManager.setSubtitleStreamIndex(parseInt(id, 10), player);
            }
        });
    });
}

/**
 * 更新当前播放信息显示
 * @param {HTMLElement} context - 上下文元素
 * @param {Object} state - 播放状态对象
 * @param {string} serverId - 服务器ID
 */
function updateNowPlayingInfo(context, state, serverId) {
    // 获取当前播放项
    const item = state.NowPlayingItem;
                if (item.ArtistItems != null) {
                    for (const artist of item.ArtistItems) {
                        // 创建艺术家链接
                        artistsSeries += `<a class="button-link" is="emby-linkbutton" href="#/details?id=${artist.Id}&serverId=${nowPlayingServerId}">${escapeHtml(artist.Name)}</a>`;
                        // 如果不是最后一个艺术家，添加逗号分隔符
                        if (artist !== item.ArtistItems.slice(-1)[0]) {
                            artistsSeries += ', ';
                        }
                    }
                } else if (item.Artists) {
                    // 某些情况下（如 Chromecast 播放器）不返回 ArtistItems 对象，需要使用 Artists 字段
                    // TODO: 规范化所有播放器返回的字段
                    for (const artist of item.Artists) {
                        // 创建艺术家文本（无链接）
                        artistsSeries += `<a>${escapeHtml(artist)}</a>`;
                        if (artist !== item.Artists.slice(-1)[0]) {
                            artistsSeries += ', ';
                        }
                    }
                }
            }
            // 处理专辑信息
            if (item.Album != null) {
                albumName = '<a class="button-link" is="emby-linkbutton" href="#/details?id=' + item.AlbumId + `&serverId=${nowPlayingServerId}">` + escapeHtml(item.Album) + '</a>';
            }
            // 更新界面显示：专辑、艺术家、歌曲名
            context.querySelector('.nowPlayingAlbum').innerHTML = albumName;
            context.querySelector('.nowPlayingArtist').innerHTML = artistsSeries;
            context.querySelector('.nowPlayingSongName').innerText = item.Name;
            context.querySelector('.nowPlayingSongName').innerText = item.Name;
        } else if (item.Type == 'Episode') {
            // 处理剧集类型
            if (item.SeasonName != null) {
                // 显示季信息
                const seasonName = item.SeasonName;
                context.querySelector('.nowPlayingSeason').innerHTML = '<a class="button-link" is="emby-linkbutton" href="#/details?id=' + item.SeasonId + `&serverId=${nowPlayingServerId}">${escapeHtml(seasonName)}</a>`;
            }
            // 显示剧集系列信息
            if (item.SeriesName != null) {
                const seriesName = item.SeriesName;
                // 如果有系列ID，创建链接
                if (item.SeriesId != null) {
                    context.querySelector('.nowPlayingSerie').innerHTML = '<a class="button-link" is="emby-linkbutton" href="#/details?id=' + item.SeriesId + `&serverId=${nowPlayingServerId}">${escapeHtml(seriesName)}</a>`;
                } else {
                    // 否则仅显示文本
                    context.querySelector('.nowPlayingSerie').innerText = seriesName;
                }
            }
            // 显示剧集名称
            context.querySelector('.nowPlayingEpisode').innerText = item.Name;
        } else {
            // 其他类型直接显示标题
            context.querySelector('.nowPlayingPageTitle').innerHTML = displayName;
        }

        // 根据类型决定是否显示页面标题
        if (displayName.length > 0 && item.Type != 'Audio' && item.Type != 'Episode') {
            context.querySelector('.nowPlayingPageTitle').classList.remove('hide');
        } else {
            context.querySelector('.nowPlayingPageTitle').classList.add('hide');
        }           }
                } else if (item.Artists) {
                    // For some reason, Chromecast Player doesn't return a item.ArtistItems object, so we need to fallback
                    // to normal item.Artists item.
                    // TODO: Normalise fields returned by all the players
                    for (const artist of item.Artists) {
                        artistsSeries += `<a>${escapeHtml(artist)}</a>`;
                        if (artist !== item.Artists.slice(-1)[0]) {
                            artistsSeries += ', ';
                        }
                    }
                }
            }
            if (item.Album != null) {
                albumName = '<a class="button-link" is="emby-linkbutton" href="#/details?id=' + item.AlbumId + `&serverId=${nowPlayingServerId}">` + escapeHtml(item.Album) + '</a>';
            }
            context.querySelector('.nowPlayingAlbum').innerHTML = albumName;
            context.querySelector('.nowPlayingArtist').innerHTML = artistsSeries;
            context.querySelector('.nowPlayingSongName').innerText = item.Name;
        } else if (item.Type == 'Episode') {
            if (item.SeasonName != null) {
                const seasonName = item.SeasonName;
                context.querySelector('.nowPlayingSeason').innerHTML = '<a class="button-link" is="emby-linkbutton" href="#/details?id=' + item.SeasonId + `&serverId=${nowPlayingServerId}">${escapeHtml(seasonName)}</a>`;
            }
            if (item.SeriesName != null) {
                const seriesName = item.SeriesName;
                if (item.SeriesId != null) {
                    context.querySelector('.nowPlayingSerie').innerHTML = '<a class="button-link" is="emby-linkbutton" href="#/details?id=' + item.SeriesId + `&serverId=${nowPlayingServerId}">${escapeHtml(seriesName)}</a>`;
                } else {
                    context.querySelector('.nowPlayingSerie').innerText = seriesName;
                }
            }
            context.querySelector('.nowPlayingEpisode').innerText = item.Name;
        } else {
            context.querySelector('.nowPlayingPageTitle').innerHTML = displayName;
        }

        if (displayName.length > 0 && item.Type != 'Audio' && item.Type != 'Episode') {
            context.querySelector('.nowPlayingPageTitle').classList.remove('hide');
        } else {
            context.querySelector('.nowPlayingPageTitle').classList.add('hide');
        }

        // 获取项目封面图片URL，限制最大高度为300像素
        const url = getImageUrl(item, {
            maxHeight: 300
        });

        // 获取上下文菜单按钮
        let contextButton = context.querySelector('.btnToggleContextMenu');
        // 通过替换元素来移除之前的事件监听器（每次更新事件时执行）
        const autoFocusContextButton = document.activeElement === contextButton;
        // 克隆按钮并替换，以清除旧的事件监听器
        const contextButtonClone = contextButton.cloneNode(true);
        contextButton.parentNode.replaceChild(contextButtonClone, contextButton);
        contextButton = context.querySelector('.btnToggleContextMenu');
        // 如果原按钮有焦点，恢复焦点
        if (autoFocusContextButton) {
            contextButton.focus();
        }
        // 配置上下文菜单选项
        const options = {
            play: false,
            queue: false,
            stopPlayback: true,
            clearQueue: true,
            openAlbum: false,
            positionTo: contextButton
        };
        // 获取API客户端并加载完整项目信息
        const apiClient = ServerConnections.getApiClient(item.ServerId);
        apiClient.getItem(apiClient.getCurrentUserId(), item.Id).then(function (fullItem) {
            apiClient.getCurrentUser().then(function (user) {
                // 为上下文菜单按钮添加点击事件
                contextButton.addEventListener('click', function () {
                    itemContextMenu.show(Object.assign({
                        item: fullItem,
                        user: user,
                        isMobile: layoutManager.mobile
                    }, options))
                        .catch(() => { /* 忽略错误 */ });
                });
            });
        });
        // 设置图片URL和背景
        setImageUrl(context, state, url);
        setBackdrops([item]);
        // 加载完整项目信息以显示用户数据按钮（收藏、点赞等）
        apiClient.getItem(apiClient.getCurrentUserId(), item.Id).then(function (fullItem) {
            const userData = fullItem.UserData || {};
            const likes = userData.Likes == null ? '' : userData.Likes;
            // 生成评分按钮HTML
            context.querySelector('.nowPlayingPageUserDataButtonsTitle').innerHTML = '<button is="emby-ratingbutton" type="button" class="paper-icon-button-light" data-id="' + fullItem.Id + '" data-serverid="' + fullItem.ServerId + '" data-itemtype="' + fullItem.Type + '" data-likes="' + likes + '" data-isfavorite="' + userData.IsFavorite + '"><span class="material-icons favorite" aria-hidden="true"></span></button>';
            context.querySelector('.nowPlayingPageUserDataButtons').innerHTML = '<button is="emby-ratingbutton" type="button" class="paper-icon-button-light" data-id="' + fullItem.Id + '" data-serverid="' + fullItem.ServerId + '" data-itemtype="' + fullItem.Type + '" data-likes="' + likes + '" data-isfavorite="' + userData.IsFavorite + '"><span class="material-icons favorite" aria-hidden="true"></span></button>';
        });
    } else {
        // 如果没有播放项，清除背景和用户数据按钮
        clearBackdrop();
        context.querySelector('.nowPlayingPageUserDataButtons').innerHTML = '';
    }
}

/**
 * 设置正在播放页面的图片URL
 * @param {HTMLElement} context - 上下文元素
 * @param {Object} state - 播放状态对象
 * @param {string} url - 图片URL
 */
function setImageUrl(context, state, url) {
    const item = state.NowPlayingItem;
    const imgContainer = context.querySelector('.nowPlayingPageImageContainer');

    if (url) {
        // 如果有图片URL，显示图片
        imgContainer.innerHTML = '<img class="nowPlayingPageImage" src="' + url + '" />';

        // 根据类型切换图片样式（音频或海报）
        context.querySelector('.nowPlayingPageImage').classList.toggle('nowPlayingPageImageAudio', item.Type === 'Audio');
        context.querySelector('.nowPlayingPageImage').classList.toggle('nowPlayingPageImagePoster', item.Type !== 'Audio');
    } else {
        // 如果没有图片URL，显示默认的专辑图标
        imgContainer.innerHTML = '<div class="nowPlayingPageImageContainerNoAlbum"><button data-action="link" class="cardImageContainer coveredImage ' + getDefaultBackgroundClass(item.Name) + ' cardContent cardContent-shadow itemAction"><span class="cardImageIcon material-icons album" aria-hidden="true"></span></button></div>';
function buttonVisible(btn, enabled) {
    if (enabled) {
        // 显示按钮
        btn.classList.remove('hide');
    } else {
        // 隐藏按钮
        btn.classList.add('hide');
    }
}

/**
 * 根据播放器支持的命令更新按钮状态
 * @param {HTMLElement} context - 上下文元素
 * @param {Array} commands - 支持的命令列表
 */
function updateSupportedCommands(context, commands) {
function updateSupportedCommands(context, commands) {
    // 获取所有命令按钮
    const all = context.querySelectorAll('.btnCommand');

    // 根据播放器支持的命令启用或禁用按钮
    for (let i = 0, length = all.length; i < length; i++) {
        const enableButton = commands.indexOf(all[i].getAttribute('data-command')) !== -1;
        all[i].disabled = !enableButton;
    }
}
    function toggleRepeat() {
        // 循环切换重复模式：全部重复 -> 单曲重复 -> 不重复 -> 全部重复
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
    }

    /**
     * 更新播放器状态
     * @param {Object} player - 播放器实例
     * @param {HTMLElement} context - 上下文元素
     * @param {Object} state - 播放状态对象
     */
    function updatePlayerState(player, context, state) {
        // 保存最新的播放器状态
        lastPlayerState = state;
        const item = state.NowPlayingItem;
        const playerInfo = playbackManager.getPlayerInfo();
        const supportedCommands = playerInfo.supportedCommands;
        currentPlayerSupportedCommands = supportedCommands;
        const playState = state.PlayState || {};
        // 判断是否支持远程控制命令
        const isSupportedCommands = supportedCommands.includes('DisplayMessage') || supportedCommands.includes('SendString') || supportedCommands.includes('Select');
        // 显示或隐藏全屏切换按钮
        buttonVisible(context.querySelector('.btnToggleFullscreen'), item && item.MediaType == 'Video' && supportedCommands.includes('ToggleFullscreen'));
        // 更新音频和字幕轨道显示
        updateAudioTracksDisplay(player, context);
        updateSubtitleTracksDisplay(player, context);
                playbackManager.setRepeatMode('RepeatAll');
        }
        updateAudioTracksDisplay(player, context);
        updateSubtitleTracksDisplay(player, context);

        // 根据播放器支持的命令和是否为本地播放器，控制各个功能区的显示
        // 显示消息发送区域
        if (supportedCommands.includes('DisplayMessage') && !currentPlayer.isLocalPlayer) {
            context.querySelector('.sendMessageSection').classList.remove('hide');
        } else {
            context.querySelector('.sendMessageSection').classList.add('hide');
        }

        // 显示文本输入区域
        if (supportedCommands.includes('SendString') && !currentPlayer.isLocalPlayer) {
            context.querySelector('.sendTextSection').classList.remove('hide');
        } else {
            context.querySelector('.sendTextSection').classList.add('hide');
        }

        // 显示导航控制区域
        if (supportedCommands.includes('Select') && !currentPlayer.isLocalPlayer) {
            context.querySelector('.navigationSection').classList.remove('hide');
        } else {
            context.querySelector('.navigationSection').classList.add('hide');
        }

        }

        // 控制各个按钮的可见性
        // 歌词按钮：仅在播放音频且非移动设备时显示
        buttonVisible(context.querySelector('.btnLyrics'), item?.Type === 'Audio' && !layoutManager.mobile);
        // 停止、下一曲、上一曲按钮：有播放项时显示
        buttonVisible(context.querySelector('.btnStop'), item != null);
        buttonVisible(context.querySelector('.btnNextTrack'), item != null);
        buttonVisible(context.querySelector('.btnPreviousTrack'), item != null);
        // 移动设备上的按钮显示逻辑
        if (layoutManager.mobile) {des('Select') && !currentPlayer.isLocalPlayer) {
            context.querySelector('.navigationSection').classList.remove('hide');
        } else {
        if (layoutManager.mobile) {
            const playingVideo = playbackManager.isPlayingVideo() && item !== null;
            const playingAudio = !playbackManager.isPlayingVideo() && item !== null;
            const playingAudioBook = playingAudio && item.Type == 'AudioBook';
            // 重复和随机按钮：仅在播放非有声书音频时显示
            buttonVisible(context.querySelector('.btnRepeat'), playingAudio && !playingAudioBook);
            buttonVisible(context.querySelector('.btnShuffleQueue'), playingAudio && !playingAudioBook);
            // 快退和快进按钮：在播放视频或有声书时显示
            buttonVisible(context.querySelector('.btnRewind'), playingVideo || playingAudioBook);
            buttonVisible(context.querySelector('.btnFastForward'), playingVideo || playingAudioBook);
            // 次要按钮区域的随机和重复按钮：仅在播放视频时显示
            buttonVisible(context.querySelector('.nowPlayingSecondaryButtons .btnShuffleQueue'), playingVideo);
            buttonVisible(context.querySelector('.nowPlayingSecondaryButtons .btnRepeat'), playingVideo);
        } else {
            // 非移动设备：有播放项时显示快退和快进按钮
            buttonVisible(context.querySelector('.btnRewind'), item != null);
            buttonVisible(context.querySelector('.btnFastForward'), item != null);
        }
        const positionSlider = context.querySelector('.nowPlayingPositionSlider');

        // 如果存在进度滑块且有播放项，设置键盘快捷键的步进值
        if (positionSlider && item && item.RunTimeTicks) {
            positionSlider.setKeyboardSteps(userSettings.skipBackLength() * 1000000 / item.RunTimeTicks,
                userSettings.skipForwardLength() * 1000000 / item.RunTimeTicks);
        }

        // 更新进度滑块状态
        if (positionSlider && !positionSlider.dragging) {
            // 根据是否可跳转来启用或禁用滑块
            positionSlider.disabled = !playState.CanSeek;
            // 如果媒体源没有总时长，设置为清除状态
            const isProgressClear = state.MediaSource && state.MediaSource.RunTimeTicks == null;
            positionSlider.setIsClear(isProgressClear);
        }

        // 更新播放/暂停状态、时间显示、音量状态
        updatePlayPauseState(playState.IsPaused, item != null);
        updateTimeDisplay(playState.PositionTicks, item ? item.RunTimeTicks : null);
        updatePlayerVolumeState(context, playState.IsMuted, playState.VolumeLevel);

        // 根据媒体类型显示或隐藏视频按钮
        if (item && item.MediaType == 'Video') {
            context.classList.remove('hideVideoButtons');
        } else {
            context.classList.add('hideVideoButtons');
        }

        // 更新重复模式显示、随机模式、当前播放信息
        updateRepeatModeDisplay(playbackManager.getRepeatMode());
        onShuffleQueueModeChange(false);
        updateNowPlayingInfo(context, state);
    }

    /**
     * 更新音频轨道按钮的显示
     * @param {Object} player - 播放器实例
     * @param {HTMLElement} context - 上下文元素
     */
    function updateAudioTracksDisplay(player, context) {ed, playState.VolumeLevel);

        if (item && item.MediaType == 'Video') {
            context.classList.remove('hideVideoButtons');
        } else {
            context.classList.add('hideVideoButtons');
        }

        updateRepeatModeDisplay(playbackManager.getRepeatMode());
        onShuffleQueueModeChange(false);
        updateNowPlayingInfo(context, state);
    }

    function updateAudioTracksDisplay(player, context) {
        const supportedCommands = currentPlayerSupportedCommands;
        // 仅当有多个音频轨道且播放器支持切换音轨时显示按钮
        buttonVisible(context.querySelector('.btnAudioTracks'), playbackManager.audioTracks(player).length > 1 && supportedCommands.indexOf('SetAudioStreamIndex') != -1);
    }

    /**
     * 更新字幕轨道按钮的显示
     * @param {Object} player - 播放器实例
     * @param {HTMLElement} context - 上下文元素
     */
    function updateSubtitleTracksDisplay(player, context) {
        const supportedCommands = currentPlayerSupportedCommands;
        // 当有字幕轨道且播放器支持切换字幕时显示按钮
        buttonVisible(context.querySelector('.btnSubtitles'), playbackManager.subtitleTracks(player).length && supportedCommands.indexOf('SetSubtitleStreamIndex') != -1);
    }

    /**
     * 更新重复模式显示
     * @param {string} repeatMode - 重复模式（RepeatAll/RepeatOne/RepeatNone）
     */
    function updateRepeatModeDisplay(repeatMode) {
        const context = dlg;
        const toggleRepeatButtons = context.querySelectorAll('.repeatToggleButton');
        const cssClass = 'buttonActive';
        let innHtml = '<span class="material-icons repeat" aria-hidden="true"></span>';
        let repeatOn = true;

        // 根据重复模式设置图标和激活状态
        switch (repeatMode) {
            case 'RepeatAll':
                // 全部重复模式
                break;
            case 'RepeatOne':
                // 单曲重复模式
                innHtml = '<span class="material-icons repeat_one" aria-hidden="true"></span>';
                break;
            case 'RepeatNone':
            default:
                // 不重复模式
                repeatOn = false;
                break;
        }

        // 更新所有重复模式按钮的样式和图标
        for (const toggleRepeatButton of toggleRepeatButtons) {
    function updatePlayerVolumeState(context, isMuted, volumeLevel) {
        const view = context;
        const supportedCommands = currentPlayerSupportedCommands;

        // 根据播放器支持的命令决定是否显示静音和音量控制
        if (supportedCommands.indexOf('Mute') === -1) {
            showMuteButton = false;
        }

        if (supportedCommands.indexOf('SetVolume') === -1) {
            showVolumeSlider = false;
        }

        // 如果是本地播放器且支持物理音量控制，隐藏软件音量控制
        if (currentPlayer.isLocalPlayer && appHost.supports(AppFeature.PhysicalVolumeControl)) {
            showMuteButton = false;
            showVolumeSlider = false;
        }

        const buttonMute = view.querySelector('.buttonMute');
        const buttonMuteIcon = buttonMute.querySelector('.material-icons');

        // 清除现有图标类
        buttonMuteIcon.classList.remove('volume_off', 'volume_up');

        // 根据静音状态设置图标
        if (isMuted) {
            buttonMute.setAttribute('title', globalize.translate('Unmute'));
            buttonMuteIcon.classList.add('volume_off');
        } else {
            buttonMute.setAttribute('title', globalize.translate('Mute'));
            buttonMuteIcon.classList.add('volume_up');
        }

        // 控制音量控制区域的可见性
        if (!showMuteButton && !showVolumeSlider) {
            context.querySelector('.volumecontrol').classList.add('hide');
        } else {
            buttonMute.classList.toggle('hide', !showMuteButton);

            const nowPlayingVolumeSlider = context.querySelector('.nowPlayingVolumeSlider');
            const nowPlayingVolumeSliderContainer = context.querySelector('.nowPlayingVolumeSliderContainer');

            if (nowPlayingVolumeSlider) {
                nowPlayingVolumeSliderContainer.classList.toggle('hide', !showVolumeSlider);

                // 如果不在拖动中，更新滑块值
                if (!nowPlayingVolumeSlider.dragging) {
                    nowPlayingVolumeSlider.value = volumeLevel || 0;
                }
            }
        }
    }

    /**
     * 更新播放/暂停按钮状态
     * @param {boolean} isPaused - 是否暂停
     * @param {boolean} isActive - 是否有活动播放
     */
    function updatePlayPauseState(isPaused, isActive) {
        const context = dlg;
        const btnPlayPause = context.querySelector('.btnPlayPause');
        const btnPlayPauseIcon = btnPlayPause.querySelector('.material-icons');

        // 清除现有图标类
        btnPlayPauseIcon.classList.remove('play_circle_filled', 'pause_circle_filled');
        // 根据暂停状态设置图标
        btnPlayPauseIcon.classList.add(isPaused ? 'play_circle_filled' : 'pause_circle_filled');

        // 更新播放列表指示器的暂停状态
        const playlistIndicator = context.querySelector('.playlistIndexIndicatorImage');
        if (playlistIndicator) {
            playlistIndicator.classList.toggle('playlistIndexIndicatorPausedImage', isPaused);
        }

        // 控制按钮可见性
        buttonVisible(btnPlayPause, isActive);
    }

    /**
     * 更新时间显示
     * @param {number} positionTicks - 当前位置（ticks）
     * @param {number} runtimeTicks - 总时长（ticks）
     */
    function updateTimeDisplay(positionTicks, runtimeTicks) {', 'pause_circle_filled');
        btnPlayPauseIcon.classList.add(isPaused ? 'play_circle_filled' : 'pause_circle_filled');
    function updateTimeDisplay(positionTicks, runtimeTicks) {
        const context = dlg;
        const positionSlider = context.querySelector('.nowPlayingPositionSlider');

        // 更新进度滑块位置（如果不在拖动中）
        if (positionSlider && !positionSlider.dragging) {
            if (runtimeTicks) {
                // 计算播放进度百分比
                let pct = positionTicks / runtimeTicks;
                pct *= 100;
                positionSlider.value = pct;
            } else {
                positionSlider.value = 0;
            }
        }

        // 更新时间文本显示
        context.querySelector('.positionTime').innerHTML = Number.isFinite(positionTicks) ? datetime.getDisplayRunningTime(positionTicks) : '--:--';
        context.querySelector('.runtime').innerHTML = Number.isFinite(runtimeTicks) ? datetime.getDisplayRunningTime(runtimeTicks) : '--:--';
    }

    /**
    function loadPlaylist(context, player) {
        getPlaylistItems(player).then(function (items) {
            // 如果播放列表为空，直接返回
            if (items.length === 0) {
                return;
            }

            let html = '';
            let favoritesEnabled = true;
            // 移动设备上的播放列表显示控制
            if (layoutManager.mobile) {
                if (items.length > 0) {
                    context.querySelector('.btnTogglePlaylist').classList.remove('hide');
                } else {
                    context.querySelector('.btnTogglePlaylist').classList.add('hide');
                }
                favoritesEnabled = false;
            }

            // 生成播放列表HTML
            html += listView.getListViewHtml({
                items: items,
                smallIcon: true,
                action: 'setplaylistindex',
                enableUserDataButtons: favoritesEnabled,
                rightButtons: [{
                    icon: 'remove_circle_outline',
                    title: globalize.translate('ButtonRemove'),
                    id: 'remove'
                }],
                dragHandle: true
            });

            const itemsContainer = context.querySelector('.playlist');
            // 保存当前焦点的播放列表项ID
            let focusedItemPlaylistId = itemsContainer.querySelector('button:focus');
            // 更新播放列表内容
            itemsContainer.innerHTML = html;
            // 恢复焦点
            if (focusedItemPlaylistId !== null) {
                focusedItemPlaylistId = focusedItemPlaylistId.getAttribute('data-playlistitemid');
                const newFocusedItem = itemsContainer.querySelector(`button[data-playlistitemid="${focusedItemPlaylistId}"]`);
                if (newFocusedItem !== null) {
                    newFocusedItem.focus();
                }
            }

            // 获取当前播放的播放列表项ID
            const playlistItemId = playbackManager.getCurrentPlaylistItemId(player);

            // 为当前播放项添加指示器
            if (playlistItemId) {
                const img = itemsContainer.querySelector(`.listItem[data-playlistItemId="${playlistItemId}"] .listItemImage`);

                if (img) {
                    img.classList.remove('lazy');
                    img.classList.add('playlistIndexIndicatorImage');
                    img.classList.toggle('playlistIndexIndicatorPausedImage', playbackManager.paused());
                }
            }

            // 延迟加载播放列表中的图片
            imageLoader.lazyChildren(itemsContainer);
        });
    }

    /**
     * 播放开始事件处理
     */
    function onPlaybackStart(e, state) {
        console.debug('remotecontrol event: ' + e.type);
        const player = this;
        onStateChanged.call(player, e, state);
    }

    /**
    function onShuffleQueueModeChange(updateView = true) {
        const shuffleMode = playbackManager.getQueueShuffleMode(this);
        const context = dlg;
        const cssClass = 'buttonActive';
        const shuffleButtons = context.querySelectorAll('.btnShuffleQueue');

        // 更新所有随机播放按钮的激活状态
        for (const shuffleButton of shuffleButtons) {
            switch (shuffleMode) {
                case 'Shuffle':
                    shuffleButton.classList.add(cssClass);
                    break;
                case 'Sorted':
                default:
                    shuffleButton.classList.remove(cssClass);
                    break;
            }
        }

        // 如果需要，更新播放列表视图
        if (updateView) {
            onPlaylistUpdate();
        }
    }

    /**
     * 播放列表更新事件处理
     */
    function onPlaylistUpdate() {
        loadPlaylist(dlg, this);
    }

    /**
     * 播放列表项移除事件处理
     * @param {Event} e - 事件对象
     * @param {Object} info - 移除信息
     */
    function onPlaylistItemRemoved(e, info) {
    function onRepeatModeChange() {
        updateRepeatModeDisplay(playbackManager.getRepeatMode());
    function onPlaylistItemRemoved(e, info) {
        const context = dlg;
        if (info !== undefined) {
            const playlistItemIds = info.playlistItemIds;

            // 从DOM中移除被删除的播放列表项
            for (let i = 0, length = playlistItemIds.length; i < length; i++) {
                const listItem = context.querySelector('.listItem[data-playlistItemId="' + playlistItemIds[i] + '"]');

                if (listItem) {
                    listItem.parentNode.removeChild(listItem);
                }
            }
        } else {
            // 如果没有具体信息，重新加载整个播放列表
            onPlaylistUpdate();
        }
    }

    /**
     * 播放停止事件处理
     */
    function onPlaybackStopped(e, state) {
        console.debug('remotecontrol event: ' + e.type);
        const player = this;

        // 如果没有下一个媒体类型，清空播放器状态并返回上一页
        if (!state.NextMediaType) {
            updatePlayerState(player, dlg, {});
            appRouter.back();
        }
    }

    /**
     * 播放/暂停状态改变事件处理
     */
    function onPlayPauseStateChanged() {
        updatePlayPauseState(this.paused(), true);
    }

    /**
     * 播放状态改变事件处理
     */
    function onStateChanged(event, state) {
        const player = this;
        updatePlayerState(player, dlg, state);
        onPlaylistUpdate();
    }

    /**
     * 时间更新事件处理（节流处理，每700ms更新一次）
     */
    function onTimeUpdate() {
    function releaseCurrentPlayer() {
        const player = currentPlayer;

        if (player) {
            // 移除所有事件监听器
            Events.off(player, 'playbackstart', onPlaybackStart);
            Events.off(player, 'statechange', onStateChanged);
            Events.off(player, 'repeatmodechange', onRepeatModeChange);
            Events.off(player, 'shufflequeuemodechange', onShuffleQueueModeChange);
            Events.off(player, 'playlistitemremove', onPlaylistItemRemoved);
            Events.off(player, 'playlistitemmove', onPlaylistUpdate);
            Events.off(player, 'playlistitemadd', onPlaylistUpdate);
            Events.off(player, 'playbackstop', onPlaybackStopped);
            Events.off(player, 'volumechange', onVolumeChanged);
            Events.off(player, 'pause', onPlayPauseStateChanged);
            Events.off(player, 'unpause', onPlayPauseStateChanged);
            Events.off(player, 'timeupdate', onTimeUpdate);
            currentPlayer = null;
        }
    }

    /**
     * 绑定到指定播放器
     * @param {HTMLElement} context - 上下文元素
     * @param {Object} player - 播放器实例
     */
    function bindToPlayer(context, player) {
     */
    function releaseCurrentPlayer() {
    }

    function onPlayPauseStateChanged() {
        updatePlayPauseState(this.paused(), true);
    }

    function onStateChanged(event, state) {
        const player = this;
        updatePlayerState(player, dlg, state);
        onPlaylistUpdate();
    function bindToPlayer(context, player) {
        // 先释放之前的播放器
        releaseCurrentPlayer();
        currentPlayer = player;

        if (player) {
            // 获取并设置初始状态
            const state = playbackManager.getPlayerState(player);
            onStateChanged.call(player, {
                type: 'init'
            }, state);
            // 添加所有事件监听器
            Events.on(player, 'playbackstart', onPlaybackStart);
            Events.on(player, 'statechange', onStateChanged);
            Events.on(player, 'repeatmodechange', onRepeatModeChange);
            Events.on(player, 'shufflequeuemodechange', onShuffleQueueModeChange);
            Events.on(player, 'playlistitemremove', onPlaylistItemRemoved);
            Events.on(player, 'playlistitemmove', onPlaylistUpdate);
            Events.on(player, 'playlistitemadd', onPlaylistUpdate);
            Events.on(player, 'playbackstop', onPlaybackStopped);
            Events.on(player, 'volumechange', onVolumeChanged);
            Events.on(player, 'pause', onPlayPauseStateChanged);
            Events.on(player, 'unpause', onPlayPauseStateChanged);
            Events.on(player, 'timeupdate', onTimeUpdate);
            // 更新支持的命令
            const playerInfo = playbackManager.getPlayerInfo();
            const supportedCommands = playerInfo.supportedCommands;
            currentPlayerSupportedCommands = supportedCommands;
            updateSupportedCommands(context, supportedCommands);
        }
    }

    /**
     * 命令按钮点击事件处理
     */
    function onBtnCommandClick() {aylistitemadd', onPlaylistUpdate);
            Events.off(player, 'playbackstop', onPlaybackStopped);
            Events.off(player, 'volumechange', onVolumeChanged);
    function onBtnCommandClick() {
        if (currentPlayer) {
            // 如果是重复模式按钮，执行切换重复模式
            if (this.classList.contains('repeatToggleButton')) {
                toggleRepeat();
            } else {
                // 否则发送命令到播放器
                playbackManager.sendCommand({
                    Name: this.getAttribute('data-command')
                }, currentPlayer);
            }
        }
    function getSaveablePlaylistItems() {
        return getPlaylistItems(currentPlayer).then(function (items) {
            // 只返回有ID和ServerId的项（可保存的项）
            return items.filter(function (i) {
                return i.Id && i.ServerId;
            });
        });
    }

    /**
     * 保存播放列表
     */
    function savePlaylist() {
            }, state);
            Events.on(player, 'playbackstart', onPlaybackStart);
            Events.on(player, 'statechange', onStateChanged);
            Events.on(player, 'repeatmodechange', onRepeatModeChange);
            Events.on(player, 'shufflequeuemodechange', onShuffleQueueModeChange);
            Events.on(player, 'playlistitemremove', onPlaylistItemRemoved);
            Events.on(player, 'playlistitemmove', onPlaylistUpdate);
            Events.on(player, 'playlistitemadd', onPlaylistUpdate);
            Events.on(player, 'playbackstop', onPlaybackStopped);
            Events.on(player, 'volumechange', onVolumeChanged);
            Events.on(player, 'pause', onPlayPauseStateChanged);
            Events.on(player, 'unpause', onPlayPauseStateChanged);
            Events.on(player, 'timeupdate', onTimeUpdate);
            const playerInfo = playbackManager.getPlayerInfo();
            const supportedCommands = playerInfo.supportedCommands;
            currentPlayerSupportedCommands = supportedCommands;
            updateSupportedCommands(context, supportedCommands);
        }
    }

    function onBtnCommandClick() {
        if (currentPlayer) {
            if (this.classList.contains('repeatToggleButton')) {
                toggleRepeat();
            } else {
                playbackManager.sendCommand({
                    Name: this.getAttribute('data-command')
                }, currentPlayer);
            }
        }
    }

    function getSaveablePlaylistItems() {
        return getPlaylistItems(currentPlayer).then(function (items) {
            return items.filter(function (i) {
                return i.Id && i.ServerId;
            });
        });
    }

    function savePlaylist() {
        // 动态加载播放列表编辑器
        import('../playlisteditor/playlisteditor').then(({ default: PlaylistEditor }) => {
            getSaveablePlaylistItems().then(function (items) {
                // 获取服务器ID
                const serverId = items.length ? items[0].ServerId : ApiClient.serverId();
                const playlistEditor = new PlaylistEditor();
                // 显示播放列表编辑器对话框
                playlistEditor.show({
                    items: items.map(function (i) {
                        return i.Id;
                    }),
                    serverId: serverId,
                    enableAddToPlayQueue: false,
                    defaultValue: 'new'
                }).catch(() => {
                    // 对话框关闭
                });
            });
        }).catch(err => {
            console.error('[savePlaylist] 加载播放列表编辑器失败', err);
        });
    }

    /**
     * 绑定所有事件处理器
     * @param {HTMLElement} context - 上下文元素
     */
    function bindEvents(context) {
        const btnCommand = context.querySelectorAll('.btnCommand');
        const positionSlider = context.querySelector('.nowPlayingPositionSlider');

        // 为所有命令按钮添加点击事件
        for (let i = 0, length = btnCommand.length; i < length; i++) {
            btnCommand[i].addEventListener('click', onBtnCommandClick);
        }

        // 全屏切换按钮
        context.querySelector('.btnToggleFullscreen').addEventListener('click', function () {
            if (currentPlayer) {
                playbackManager.toggleFullscreen(currentPlayer);
            }
        });
        // 音频轨道选择按钮
        context.querySelector('.btnAudioTracks').addEventListener('click', function (e) {
            if (currentPlayer && lastPlayerState?.NowPlayingItem) {
                showAudioMenu(context, currentPlayer, e.target);
            }
        });
        // 字幕选择按钮
        context.querySelector('.btnSubtitles').addEventListener('click', function (e) {
            if (currentPlayer && lastPlayerState?.NowPlayingItem) {
                showSubtitleMenu(context, currentPlayer, e.target);
            }
        });
        // 停止播放按钮
        context.querySelector('.btnStop').addEventListener('click', function () {
            if (currentPlayer) {
                playbackManager.stop(currentPlayer);
            }
        });
        // 播放/暂停按钮
        context.querySelector('.btnPlayPause').addEventListener('click', function () {
            if (currentPlayer) {
                playbackManager.playPause(currentPlayer);
            }
        });
        // 下一曲按钮
        context.querySelector('.btnNextTrack').addEventListener('click', function () {
            if (currentPlayer) {
                playbackManager.nextTrack(currentPlayer);
            }
        });
        // 快退按钮
        context.querySelector('.btnRewind').addEventListener('click', function () {
            if (currentPlayer) {
                playbackManager.rewind(currentPlayer);
            }
        });
        // 快进按钮
        context.querySelector('.btnFastForward').addEventListener('click', function () {
            if (currentPlayer) {
                playbackManager.fastForward(currentPlayer);
            }
        });
        // 歌词按钮
        context.querySelector('.btnLyrics').addEventListener('click', function () {
            appRouter.show('lyrics');
        context.querySelector('.btnPreviousTrack').addEventListener('click', function (e) {
            if (currentPlayer) {
                if (playbackManager.isPlayingAudio(currentPlayer)) {
                    // 取消双击时触发的事件，实际的上一曲操作由双击事件处理
                    if (e.detail > 1 ) {
                        return;
                    }

                    // 如果当前播放时间>=5秒或已在第一首，则回到开头
                    // 否则跳到上一曲
                    if (playbackManager.currentTime(currentPlayer) >= 5 * 1000 || playbackManager.getCurrentPlaylistIndex(currentPlayer) <= 0) {
                        playbackManager.seekPercent(0, currentPlayer);
                        // 立即更新视觉反馈（避免等待playbackManager反映变化）
                        // TODO: 检查为什么seekPercent不能立即反映变化，以便移除这个临时方案
                        positionSlider.value = 0;
                        return;
                    }
                }
                playbackManager.previousTrack(currentPlayer);
            }
        });

        // 上一曲按钮双击事件
        context.querySelector('.btnPreviousTrack').addEventListener('dblclick', function () {
            if (currentPlayer) {
                playbackManager.previousTrack(currentPlayer);
            }
        });
        // 进度滑块改变事件
        positionSlider.addEventListener('change', function () {
            const value = this.value;

            if (currentPlayer) {
                const newPercent = parseFloat(value);
                playbackManager.seekPercent(newPercent, currentPlayer);
            }
        });

        // 进度滑块气泡文本显示函数
        positionSlider.getBubbleText = function (value) {
            const state = lastPlayerState;

            if (!state?.NowPlayingItem || !currentRuntimeTicks) {
                return '--:--';
            }

            // 根据滑块值计算对应的时间
            let ticks = currentRuntimeTicks;
            ticks /= 100;
            ticks *= value;
            return datetime.getDisplayRunningTime(ticks);
        };

        // 音量滑块输入事件
        context.querySelector('.nowPlayingVolumeSlider').addEventListener('input', (e) => {
            playbackManager.setVolume(e.target.value, currentPlayer);
        });

        // 静音按钮
        context.querySelector('.buttonMute').addEventListener('click', function () {
            playbackManager.toggleMute(currentPlayer);
        });
        // 播放列表容器事件
        const playlistContainer = context.querySelector('.playlist');
        // 移除播放列表项事件
        playlistContainer.addEventListener('action-remove', function (e) {
            playbackManager.removeFromPlaylist([e.detail.playlistItemId], currentPlayer);
        });
        // 拖放排序事件
        playlistContainer.addEventListener('itemdrop', function (e) {
            const newIndex = e.detail.newIndex;
            const playlistItemId = e.detail.playlistItemId;
            playbackManager.movePlaylistItem(playlistItemId, newIndex, currentPlayer);
        });
        // 保存播放列表按钮
        context.querySelector('.btnSavePlaylist').addEventListener('click', savePlaylist);
        // 切换播放列表显示按钮
        context.querySelector('.btnTogglePlaylist').addEventListener('click', function () {
        });
        const playlistContainer = context.querySelector('.playlist');
        context.querySelector('.btnTogglePlaylist').addEventListener('click', function () {
            // 切换播放列表的显示/隐藏
            if (context.querySelector('.playlist').classList.contains('hide')) {
                // 显示播放列表
                context.querySelector('.playlist').classList.remove('hide');
                context.querySelector('.btnSavePlaylist').classList.remove('hide');
                context.querySelector('.volumecontrol').classList.add('hide');
                if (layoutManager.mobile) {
                    context.querySelector('.playlistSectionButton').classList.remove('playlistSectionButtonTransparent');
                }
            } else {
                // 隐藏播放列表
                context.querySelector('.playlist').classList.add('hide');
                context.querySelector('.btnSavePlaylist').classList.add('hide');
                if (showMuteButton || showVolumeSlider) {
                    context.querySelector('.volumecontrol').classList.remove('hide');
                }
                if (layoutManager.mobile) {
                    context.querySelector('.playlistSectionButton').classList.add('playlistSectionButtonTransparent');
                }
            }
        });
    }

    /**
     * 播放器改变事件处理
     */
    function onPlayerChange() {
        bindToPlayer(dlg, playbackManager.getCurrentPlayer());
    }

    /**
     * 消息发送表单提交处理
     */
    function onMessageSubmit(e) {
        const form = e.target;
        // 发送显示消息命令到播放器
        playbackManager.sendCommand({
            Name: 'DisplayMessage',
            Arguments: {
                Header: form.querySelector('#txtMessageTitle').value,
                Text: form.querySelector('#txtMessageText', form).value
            }
        }, currentPlayer);
        // 清空输入框
        form.querySelector('input').value = '';

        toast(globalize.translate('MessageSent'));

        e.preventDefault();
        e.stopPropagation();
        return false;
    }

    /**
     * 文本输入表单提交处理
     */
    function onSendStringSubmit(e) {
        const form = e.target;
        // 发送字符串命令到播放器
    function init(ownerView, context) {
        // 构建音量控制HTML
        let volumecontrolHtml = '<div class="volumecontrol flex align-items-center flex-wrap-wrap justify-content-center">';
        volumecontrolHtml += `<button is="paper-icon-button-light" class="buttonMute autoSize" title=${globalize.translate('Mute')}><span class="xlargePaperIconButton material-icons volume_up" aria-hidden="true"></span></button>`;
        volumecontrolHtml += '<div class="sliderContainer nowPlayingVolumeSliderContainer"><input is="emby-slider" type="range" step="1" min="0" max="100" value="0" class="nowPlayingVolumeSlider"/></div>';
        volumecontrolHtml += '</div>';
        const optionsSection = context.querySelector('.playlistSectionButton');
        // 根据设备类型调整布局
        if (!layoutManager.mobile) {
            // 桌面布局：音量控制在次要按钮区域，播放列表默认显示
            context.querySelector('.nowPlayingSecondaryButtons').insertAdjacentHTML('beforeend', volumecontrolHtml);
            optionsSection.classList.remove('align-items-center', 'justify-content-center');
            optionsSection.classList.add('align-items-right', 'justify-content-flex-end');
            context.querySelector('.playlist').classList.remove('hide');
            context.querySelector('.btnSavePlaylist').classList.remove('hide');
            context.classList.add('padded-bottom');
        } else {
            // 移动布局：音量控制在切换按钮后，播放列表默认隐藏
            optionsSection.querySelector('.btnTogglePlaylist').insertAdjacentHTML('afterend', volumecontrolHtml);
            optionsSection.classList.add('playlistSectionButtonTransparent');
            context.querySelector('.btnTogglePlaylist').classList.remove('hide');
            context.querySelector('.playlistSectionButton').classList.remove('justify-content-center');
            context.querySelector('.playlistSectionButton').classList.add('justify-content-space-between');
        }

        // 绑定所有事件
        bindEvents(context);
        context.querySelector('.sendMessageForm').addEventListener('submit', onMessageSubmit);
        context.querySelector('.typeTextForm').addEventListener('submit', onSendStringSubmit);
        Events.on(playbackManager, 'playerchange', onPlayerChange);

        // 电视模式：启用进度滑块的键盘拖动
        if (layoutManager.tv) {
            const positionSlider = context.querySelector('.nowPlayingPositionSlider');
            positionSlider.classList.add('focusable');
            positionSlider.enableKeyboardDragging();
        }
    }

    /**
     * 对话框关闭处理
     */
    function onDialogClosed() {
        releaseCurrentPlayer();
        Events.off(playbackManager, 'playerchange', onPlayerChange);
        lastPlayerState = null;
    }

    /**
     * 显示时的处理
     */
    function onShow(context) {
        bindToPlayer(context, playbackManager.getCurrentPlayer());
    }

    // 模块级变量
    let dlg; // 对话框元素
    let currentPlayer; // 当前播放器
    let lastPlayerState; // 上次播放器状态
    let currentPlayerSupportedCommands = []; // 当前播放器支持的命令
    let lastUpdateTime = 0; // 上次更新时间（用于节流）
    let currentRuntimeTicks = 0; // 当前媒体总时长
    const self = this;

    /**
     * 初始化方法
     * @param {HTMLElement} ownerView - 拥有者视图
     * @param {HTMLElement} context - 上下文元素
     */
    self.init = function (ownerView, context) {
        dlg = context;
        init(ownerView, dlg);
    };

    /**
     * 显示方法
     */
    self.onShow = function () {
        onShow(dlg);
    };

    /**
     * 销毁方法
     */
    self.destroy = function () {
        onDialogClosed();
    };
}   function onDialogClosed() {
        releaseCurrentPlayer();
        Events.off(playbackManager, 'playerchange', onPlayerChange);
        lastPlayerState = null;
    }

    function onShow(context) {
        bindToPlayer(context, playbackManager.getCurrentPlayer());
    }

    let dlg;
    let currentPlayer;
    let lastPlayerState;
    let currentPlayerSupportedCommands = [];
    let lastUpdateTime = 0;
    let currentRuntimeTicks = 0;
    const self = this;

    self.init = function (ownerView, context) {
        dlg = context;
        init(ownerView, dlg);
    };

    self.onShow = function () {
        onShow(dlg);
    };

    self.destroy = function () {
        onDialogClosed();
    };
}
