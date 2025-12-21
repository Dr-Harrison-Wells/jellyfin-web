/**
 * 项目详情页面控制器
 * 负责渲染和管理媒体项目的详细信息页面,包括电影、剧集、音乐等
 */

// Jellyfin SDK 相关导入
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { PersonKind } from '@jellyfin/sdk/lib/generated-client/models/person-kind';

// 第三方库导入
import { intervalToDuration } from 'date-fns'; // 日期时间计算
import DOMPurify from 'dompurify'; // HTML 内容清理
import escapeHtml from 'escape-html'; // HTML 转义
import markdownIt from 'markdown-it'; // Markdown 渲染
import isEqual from 'lodash-es/isEqual'; // 深度比较

// 应用组件导入
import { appHost } from 'components/apphost'; // 应用宿主
import { clearBackdrop, setBackdrops } from 'components/backdrop/backdrop'; // 背景图片管理
import cardBuilder from 'components/cardbuilder/cardBuilder'; // 卡片构建器
import { buildCardImage } from 'components/cardbuilder/cardImage'; // 卡片图片构建
import confirm from 'components/confirm/confirm'; // 确认对话框
import imageLoader from 'components/images/imageLoader'; // 图片懒加载
import itemContextMenu from 'components/itemContextMenu'; // 项目上下文菜单
import itemHelper from 'components/itemHelper'; // 项目辅助工具
import mediaInfo from 'components/mediainfo/mediainfo'; // 媒体信息显示
import layoutManager from 'components/layoutManager'; // 布局管理器
import listView from 'components/listview/listview'; // 列表视图
import loading from 'components/loading/loading'; // 加载指示器
import { playbackManager } from 'components/playback/playbackmanager'; // 播放管理器
import { appRouter } from 'components/router/appRouter'; // 应用路由
import itemShortcuts from 'components/shortcuts'; // 键盘快捷键
import { AppFeature } from 'constants/appFeature'; // 应用功能常量
import globalize from 'lib/globalize'; // 国际化
import { ServerConnections } from 'lib/jellyfin-apiclient'; // 服务器连接
import browser from 'scripts/browser'; // 浏览器检测
import datetime from 'scripts/datetime'; // 日期时间工具
import dom from 'scripts/dom'; // DOM 操作工具
import { download } from 'scripts/fileDownloader'; // 文件下载
import libraryMenu from 'scripts/libraryMenu'; // 库菜单
import * as userSettings from 'scripts/settings/userSettings'; // 用户设置
import { getPortraitShape, getSquareShape } from 'utils/card'; // 卡片形状工具
import Dashboard from 'utils/dashboard'; // 仪表盘工具
import Events from 'utils/events'; // 事件系统
import { getItemBackdropImageUrl } from 'utils/jellyfin-apiclient/backdropImage'; // 背景图片 URL

// Web Components 导入
import 'elements/emby-itemscontainer/emby-itemscontainer'; // 项目容器元素
import 'elements/emby-checkbox/emby-checkbox'; // 复选框元素
import 'elements/emby-button/emby-button'; // 按钮元素
import 'elements/emby-playstatebutton/emby-playstatebutton'; // 播放状态按钮
import 'elements/emby-ratingbutton/emby-ratingbutton'; // 评分按钮
import 'elements/emby-scroller/emby-scroller'; // 滚动容器
import 'elements/emby-select/emby-select'; // 下拉选择框

// 样式导入
import 'styles/scrollstyles.scss'; // 滚动条样式

/**
 * 自动聚焦容器中的元素
 * @param {HTMLElement} container - 需要自动聚焦的容器元素
 */
function autoFocus(container) {
    import('../../components/autoFocuser').then(({ default: autoFocuser }) => {
        autoFocuser.autoFocus(container);
    });
}

/**
 * 根据参数获取项目数据的 Promise
 * @param {Object} apiClient - API 客户端实例
 * @param {Object} params - 路由参数对象
 * @param {string} [params.id] - 项目 ID
 * @param {string} [params.seriesTimerId] - 系列定时器 ID
 * @param {string} [params.genre] - 类型名称
 * @param {string} [params.musicgenre] - 音乐类型名称
 * @param {string} [params.musicartist] - 音乐艺术家名称
 * @returns {Promise} 返回项目数据的 Promise
 * @throws {Error} 当请求参数无效时抛出错误
 */
function getPromise(apiClient, params) {
    const id = params.id;

    if (id) {
        return apiClient.getItem(apiClient.getCurrentUserId(), id);
    }

    if (params.seriesTimerId) {
        return apiClient.getLiveTvSeriesTimer(params.seriesTimerId);
    }

    if (params.genre) {
        return apiClient.getGenre(params.genre, apiClient.getCurrentUserId());
    }

    if (params.musicgenre) {
        return apiClient.getMusicGenre(params.musicgenre, apiClient.getCurrentUserId());
    }

    if (params.musicartist) {
        return apiClient.getArtist(params.musicartist, apiClient.getCurrentUserId());
    }

    throw new Error('Invalid request');
}

/**
 * 显示或隐藏页面中指定类名的所有元素
 * @param {HTMLElement} page - 页面容器元素
 * @param {string} className - CSS 类名
 * @param {boolean} show - true 表示显示,false 表示隐藏
 */
function hideAll(page, className, show) {
    for (const elem of page.querySelectorAll('.' + className)) {
        if (show) {
            elem.classList.remove('hide');
        } else {
            elem.classList.add('hide');
        }
    }
}

/**
 * 获取上下文菜单选项配置
 * @param {Object} item - 媒体项目对象
 * @param {Object} user - 用户对象
 * @param {HTMLElement} button - 触发菜单的按钮元素
 * @returns {Object} 上下文菜单配置对象
 */
function getContextMenuOptions(item, user, button) {
    return {
        item: item,
        open: false,
        play: false,
        playAllFromHere: false,
        queueAllFromHere: false,
        positionTo: button,
        cancelTimer: false,
        record: false,
        deleteItem: item.CanDelete === true,
        shuffle: false,
        instantMix: false,
        user: user,
        share: true
    };
}

/**
 * 生成节目时间表的 HTML
 * @param {Array} items - 节目项目数组
 * @param {string} action - 点击项目时的操作,默认为 'none'
 * @returns {string} 列表视图的 HTML 字符串
 */
function getProgramScheduleHtml(items, action = 'none') {
    return listView.getListViewHtml({
        items: items,
        enableUserDataButtons: false,
        image: true,
        imageSource: 'channel',
        showProgramDateTime: true,
        showChannel: false,
        mediaInfo: true,
        runtime: false,
        action,
        moreButton: false,
        recordButton: false
    });
}

/**
 * 获取页面中选中的媒体源
 * @param {HTMLElement} page - 页面容器元素
 * @param {Array} mediaSources - 媒体源数组
 * @returns {Object} 选中的媒体源对象
 */
function getSelectedMediaSource(page, mediaSources) {
    const mediaSourceId = page.querySelector('.selectSource').value;
    return mediaSources.filter(m => m.Id === mediaSourceId)[0];
}

/**
 * 渲染系列定时器的录制计划
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} apiClient - API 客户端实例
 * @param {string} seriesTimerId - 系列定时器 ID
 */
function renderSeriesTimerSchedule(page, apiClient, seriesTimerId) {
    apiClient.getLiveTvTimers({
        UserId: apiClient.getCurrentUserId(),
        ImageTypeLimit: 1,
        SortBy: 'StartDate',
        EnableTotalRecordCount: false,
        EnableUserData: false,
        SeriesTimerId: seriesTimerId,
        Fields: 'ChannelInfo,ChannelImage'
    }).then(function (result) {
        if (result.Items.length && result.Items[0].SeriesTimerId != seriesTimerId) {
            result.Items = [];
        }

        const html = getProgramScheduleHtml(result.Items);
        const scheduleTab = page.querySelector('#seriesTimerSchedule');
        scheduleTab.innerHTML = html;
        imageLoader.lazyChildren(scheduleTab);
    });
}

/**
 * 渲染定时器编辑器
 * 用于显示或隐藏取消录制的按钮
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 * @param {Object} apiClient - API 客户端实例
 * @param {Object} user - 用户对象
 */
function renderTimerEditor(page, item, apiClient, user) {
    if (item.Type !== 'Recording' || !user.Policy.EnableLiveTvManagement || !item.TimerId || item.Status !== 'InProgress') {
        hideAll(page, 'btnCancelTimer');
        return;
    }

    hideAll(page, 'btnCancelTimer', true);
}

/**
 * 渲染系列定时器编辑器
 * 用于管理系列节目的录制设置
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 * @param {Object} apiClient - API 客户端实例
 * @param {Object} user - 用户对象
 */
function renderSeriesTimerEditor(page, item, apiClient, user) {
    if (item.Type !== 'SeriesTimer') {
        hideAll(page, 'btnCancelSeriesTimer');
        return;
    }

    if (user.Policy.EnableLiveTvManagement) {
        import('../../components/recordingcreator/seriesrecordingeditor').then(({ default: seriesRecordingEditor }) => {
            seriesRecordingEditor.embed(item, apiClient.serverId(), {
                context: page.querySelector('.seriesRecordingEditor')
            });
        });

        page.querySelector('#seriesTimerScheduleSection').classList.remove('hide');
        hideAll(page, 'btnCancelSeriesTimer', true);
        renderSeriesTimerSchedule(page, apiClient, item.Id);
        return;
    }

    page.querySelector('#seriesTimerScheduleSection').classList.add('hide');
    hideAll(page, 'btnCancelSeriesTimer');
}

/**
 * 渲染媒体轨道选择界面
 * 包括视频、音频和字幕轨道的选择
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} instance - 控制器实例
 * @param {Object} item - 媒体项目对象
 * @param {boolean} forceReload - 是否强制重新加载
 */
function renderTrackSelections(page, instance, item, forceReload) {
    const select = page.querySelector('.selectSource');

    if (!item.MediaSources || !itemHelper.supportsMediaSourceSelection(item) || playbackManager.getSupportedCommands().indexOf('PlayMediaSource') === -1 || !playbackManager.canPlay(item)) {
        page.querySelector('.trackSelections').classList.add('hide');
        select.innerHTML = '';
        page.querySelector('.selectVideo').innerHTML = '';
        page.querySelector('.selectAudio').innerHTML = '';
        page.querySelector('.selectSubtitles').innerHTML = '';
        return;
    }

    const mediaSources = item.MediaSources;
    instance._currentPlaybackMediaSources = mediaSources;

    page.querySelector('.trackSelections').classList.remove('hide');
    select.setLabel(globalize.translate('LabelVersion'));

    const currentValue = select.value;

    const selectedId = mediaSources[0].Id;
    select.innerHTML = mediaSources.map(function (v) {
        const selected = v.Id === selectedId ? ' selected' : '';
        return '<option value="' + v.Id + '"' + selected + '>' + escapeHtml(v.Name) + '</option>';
    }).join('');

    if (mediaSources.length > 1) {
        page.querySelector('.selectSourceContainer').classList.remove('hide');
    } else {
        page.querySelector('.selectSourceContainer').classList.add('hide');
    }

    if (select.value !== currentValue || forceReload) {
        renderVideoSelections(page, mediaSources);
        renderAudioSelections(page, mediaSources);
        renderSubtitleSelections(page, mediaSources);
    }
}

/**
 * 渲染视频轨道选择器
 * 显示可用的视频轨道及其分辨率和编解码器信息
 * @param {HTMLElement} page - 页面容器元素
 * @param {Array} mediaSources - 媒体源数组
 */
function renderVideoSelections(page, mediaSources) {
    const mediaSource = getSelectedMediaSource(page, mediaSources);

    const tracks = mediaSource.MediaStreams.filter(function (m) {
        return m.Type === 'Video';
    });

    const select = page.querySelector('.selectVideo');
    select.setLabel(globalize.translate('Video'));
    const selectedId = tracks.length ? tracks[0].Index : -1;
    select.innerHTML = tracks.map(function (v) {
        const selected = v.Index === selectedId ? ' selected' : '';
        const titleParts = [];
        const resolutionText = mediaInfo.getResolutionText(v);

        if (resolutionText) {
            titleParts.push(resolutionText);
        }

        if (v.Codec) {
            titleParts.push(v.Codec.toUpperCase());
        }

        return '<option value="' + v.Index + '" ' + selected + '>' + (v.DisplayTitle || titleParts.join(' ')) + '</option>';
    }).join('');
    select.setAttribute('disabled', 'disabled');

    if (tracks.length) {
        page.querySelector('.selectVideoContainer').classList.remove('hide');
    } else {
        page.querySelector('.selectVideoContainer').classList.add('hide');
    }
}

/**
 * 渲染音频轨道选择器
 * 显示可用的音频轨道列表，并根据默认音频流索引选中对应项
 * @param {HTMLElement} page - 页面容器元素
 * @param {Array} mediaSources - 媒体源数组
 */
function renderAudioSelections(page, mediaSources) {
    const mediaSource = getSelectedMediaSource(page, mediaSources);

    const tracks = mediaSource.MediaStreams.filter(function (m) {
        return m.Type === 'Audio';
    });
    tracks.sort(itemHelper.sortTracks);
    const select = page.querySelector('.selectAudio');
    select.setLabel(globalize.translate('Audio'));
    const selectedId = mediaSource.DefaultAudioStreamIndex;
    select.innerHTML = tracks.map(function (v) {
        const selected = v.Index === selectedId ? ' selected' : '';
        return '<option value="' + v.Index + '" ' + selected + '>' + v.DisplayTitle + '</option>';
    }).join('');

    if (tracks.length > 1) {
        select.removeAttribute('disabled');
    } else {
        select.setAttribute('disabled', 'disabled');
    }

    if (tracks.length) {
        page.querySelector('.selectAudioContainer').classList.remove('hide');
    } else {
        page.querySelector('.selectAudioContainer').classList.add('hide');
    }
}

/**
 * 渲染字幕轨道选择器
 * 显示可用的字幕轨道列表，包括"关闭"选项，并根据默认字幕流索引选中对应项
 * @param {HTMLElement} page - 页面容器元素
 * @param {Array} mediaSources - 媒体源数组
 */
function renderSubtitleSelections(page, mediaSources) {
    const mediaSource = getSelectedMediaSource(page, mediaSources);

    const tracks = mediaSource.MediaStreams.filter(function (m) {
        return m.Type === 'Subtitle';
    });
    tracks.sort(itemHelper.sortTracks);
    const select = page.querySelector('.selectSubtitles');
    select.setLabel(globalize.translate('Subtitles'));
    const selectedId = mediaSource.DefaultSubtitleStreamIndex == null ? -1 : mediaSource.DefaultSubtitleStreamIndex;

    let selected = selectedId === -1 ? ' selected' : '';
    select.innerHTML = '<option value="-1">' + globalize.translate('Off') + '</option>' + tracks.map(function (v) {
        selected = v.Index === selectedId ? ' selected' : '';
        return '<option value="' + v.Index + '" ' + selected + '>' + v.DisplayTitle + '</option>';
    }).join('');

    if (tracks.length > 0) {
        select.removeAttribute('disabled');
    } else {
        select.setAttribute('disabled', 'disabled');
    }

    if (tracks.length) {
        page.querySelector('.selectSubtitlesContainer').classList.remove('hide');
    } else {
        page.querySelector('.selectSubtitlesContainer').classList.add('hide');
    }
}

/**
 * 重新加载播放按钮
 * 根据项目类型和播放状态显示或隐藏播放、重播、混播等按钮
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 * @returns {boolean} 返回项目是否可播放
 */
function reloadPlayButtons(page, item) {
    let canPlay = false;

    if (item.Type == 'Program') {
        const now = new Date();

        if (now >= datetime.parseISO8601Date(item.StartDate, true) && now < datetime.parseISO8601Date(item.EndDate, true)) {
            hideAll(page, 'btnPlay', true);
            canPlay = true;
        } else {
            hideAll(page, 'btnPlay');
        }

        hideAll(page, 'btnReplay');
        hideAll(page, 'btnInstantMix');
        hideAll(page, 'btnShuffle');
    } else if (playbackManager.canPlay(item)) {
        hideAll(page, 'btnPlay', true);
        const enableInstantMix = ['Audio', 'MusicAlbum', 'MusicGenre', 'MusicArtist'].indexOf(item.Type) !== -1;
        hideAll(page, 'btnInstantMix', enableInstantMix);
        const enableShuffle = item.IsFolder || ['MusicAlbum', 'MusicGenre', 'MusicArtist'].indexOf(item.Type) !== -1;
        hideAll(page, 'btnShuffle', enableShuffle);
        canPlay = true;

        const isResumable = item.UserData && item.UserData.PlaybackPositionTicks > 0;
        hideAll(page, 'btnReplay', isResumable);

        for (const btnPlay of page.querySelectorAll('.btnPlay')) {
            if (isResumable) {
                btnPlay.title = globalize.translate('ButtonResume');
            } else {
                btnPlay.title = globalize.translate('Play');
            }
        }
    } else {
        hideAll(page, 'btnPlay');
        hideAll(page, 'btnReplay');
        hideAll(page, 'btnInstantMix');
        hideAll(page, 'btnShuffle');
    }

    return canPlay;
}

/**
 * 重新加载用户数据相关按钮
 * 包括已播放状态按钮和评分按钮
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 */
function reloadUserDataButtons(page, item) {
    let i;
    let length;
    const btnPlaystates = page.querySelectorAll('.btnPlaystate');

    for (i = 0, length = btnPlaystates.length; i < length; i++) {
        const btnPlaystate = btnPlaystates[i];

        if (itemHelper.canMarkPlayed(item)) {
            btnPlaystate.classList.remove('hide');
            btnPlaystate.setItem(item);
        } else {
            btnPlaystate.classList.add('hide');
            btnPlaystate.setItem(null);
        }
    }

    const btnUserRatings = page.querySelectorAll('.btnUserRating');

    for (i = 0, length = btnUserRatings.length; i < length; i++) {
        const btnUserRating = btnUserRatings[i];

        if (itemHelper.canRate(item)) {
            btnUserRating.classList.remove('hide');
            btnUserRating.setItem(item);
        } else {
            btnUserRating.classList.add('hide');
            btnUserRating.setItem(null);
        }
    }
}

/**
 * 生成艺术家链接的 HTML
 * @param {Array} artists - 艺术家对象数组
 * @param {string} serverId - 服务器 ID
 * @param {string} context - 应用上下文
 * @returns {string} 艺术家链接的 HTML 字符串
 */
function getArtistLinksHtml(artists, serverId, context) {
    const html = [];
    const numberOfArtists = artists.length;

    for (let i = 0; i < Math.min(numberOfArtists, 10); i++) {
        const artist = artists[i];
        const href = appRouter.getRouteUrl(artist, {
            context,
            itemType: 'MusicArtist',
            serverId
        });
        html.push('<a style="color:inherit;" class="button-link" is="emby-linkbutton" href="' + href + '">' + escapeHtml(artist.Name) + '</a>');
    }

    let fullHtml = html.join(' / ');

    if (numberOfArtists > 10) {
        fullHtml = globalize.translate('AndOtherArtists', fullHtml, numberOfArtists - 10);
    }

    return fullHtml;
}

/**
 * Renders the item's name block
 * @param {Object} item - Item used to render the name.
 * @param {HTMLDivElement} container - Container to render the information into.
 * @param {Object} context - Application context.
 */
function renderName(item, container, context) {
    const parentNameHtml = [];
    let parentNameLast = false;

    if (item.AlbumArtists) {
        parentNameHtml.push(getArtistLinksHtml(item.AlbumArtists, item.ServerId, context));
        parentNameLast = true;
    } else if (item.ArtistItems?.length && item.Type === 'MusicVideo') {
        parentNameHtml.push(getArtistLinksHtml(item.ArtistItems, item.ServerId, context));
        parentNameLast = true;
    } else if (item.SeriesName && item.Type === 'Episode') {
        parentNameHtml.push(`<a style="color:inherit;" class="button-link itemAction" is="emby-linkbutton" href="#" data-action="link" data-id="${item.SeriesId}" data-serverid="${item.ServerId}" data-type="Series" data-isfolder="true">${escapeHtml(item.SeriesName)}</a>`);
    } else if (item.IsSeries || item.EpisodeTitle) {
        parentNameHtml.push(escapeHtml(item.Name));
    }

    if (item.SeriesName && item.Type === 'Season') {
        parentNameHtml.push(`<a style="color:inherit;" class="button-link itemAction" is="emby-linkbutton" href="#" data-action="link" data-id="${item.SeriesId}" data-serverid="${item.ServerId}" data-type="Series" data-isfolder="true">${escapeHtml(item.SeriesName)}</a>`);
    } else if (item.ParentIndexNumber != null && item.Type === 'Episode') {
        parentNameHtml.push(`<a style="color:inherit;" class="button-link itemAction" is="emby-linkbutton" href="#" data-action="link" data-id="${item.SeasonId}" data-serverid="${item.ServerId}" data-type="Season" data-isfolder="true">${escapeHtml(item.SeasonName)}</a>`);
    } else if (item.ParentIndexNumber != null && item.IsSeries) {
        parentNameHtml.push(escapeHtml(item.SeasonName || 'S' + item.ParentIndexNumber));
    } else if (item.Album && item.AlbumId && (item.Type === 'MusicVideo' || item.Type === 'Audio')) {
        parentNameHtml.push(`<a style="color:inherit;" class="button-link itemAction" is="emby-linkbutton" href="#" data-action="link" data-id="${item.AlbumId}" data-serverid="${item.ServerId}" data-type="MusicAlbum" data-isfolder="true">${escapeHtml(item.Album)}</a>`);
    } else if (item.Album) {
        parentNameHtml.push(escapeHtml(item.Album));
    }

    // FIXME: This whole section needs some refactoring, so it becames easier to scale across all form factors. See GH #1022
    let html = '';
    const tvShowHtml = parentNameHtml[0];
    const tvSeasonHtml = parentNameHtml[1];

    if (parentNameHtml.length) {
        if (parentNameLast) {
            // Music
            if (layoutManager.mobile) {
                html = '<h3 class="parentName musicParentName">' + parentNameHtml.join('</br>') + '</h3>';
            } else {
                html = '<h3 class="parentName musicParentName focuscontainer-x">' + parentNameHtml.join(' - ') + '</h3>';
            }
        } else {
            html = '<h1 class="parentName focuscontainer-x"><bdi>' + tvShowHtml + '</bdi></h1>';
        }
    }

    const name = escapeHtml(itemHelper.getDisplayName(item, {
        includeParentInfo: false
    }));

    if (html && !parentNameLast) {
        if (tvSeasonHtml) {
            html += '<h3 class="itemName infoText subtitle focuscontainer-x"><bdi>' + tvSeasonHtml + ' - ' + name + '</bdi></h3>';
        } else {
            html += '<h3 class="itemName infoText subtitle"><bdi>' + name + '</bdi></h3>';
        }
    } else if (item.OriginalTitle && item.OriginalTitle != item.Name) {
        html = '<h1 class="itemName infoText parentNameLast withOriginalTitle"><bdi>' + name + '</bdi></h1>' + html;
    } else {
        html = '<h1 class="itemName infoText parentNameLast"><bdi>' + name + '</bdi></h1>' + html;
    }

    if (item.OriginalTitle && item.OriginalTitle != item.Name) {
        html += '<h4 class="itemName infoText originalTitle">' + escapeHtml(item.OriginalTitle) + '</h4>';
    }

    container.innerHTML = html;

    if (html.length) {
        container.classList.remove('hide');
    } else {
        container.classList.add('hide');
    }
}

/**
 * 设置预告片按钮的可见性
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 */
function setTrailerButtonVisibility(page, item) {
    if ((item.LocalTrailerCount || item.RemoteTrailers?.length) && playbackManager.getSupportedCommands().indexOf('PlayTrailers') !== -1) {
        hideAll(page, 'btnPlayTrailer', true);
    } else {
        hideAll(page, 'btnPlayTrailer');
    }
}

/**
 * 渲染页面背景图
 * 根据设备类型和用户设置显示或隐藏背景
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 */
function renderBackdrop(page, item) {
    if (!layoutManager.mobile && dom.getWindowSize().innerWidth >= 1000) {
        const isBannerEnabled = !layoutManager.tv && userSettings.detailsBanner();
        // If backdrops are disabled, but the header banner is enabled, add a class to the page to disable the transparency
        page.classList.toggle('noBackdropTransparency', isBannerEnabled && !userSettings.enableBackdrops());

        setBackdrops([item], null, isBannerEnabled);
    } else {
        clearBackdrop();
    }
}

/**
 * 渲染页面头部背景图
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 * @param {Object} apiClient - API 客户端实例
 * @returns {boolean} 是否有背景图
 */
function renderHeaderBackdrop(page, item, apiClient) {
    // Details banner is disabled in user settings
    if (!userSettings.detailsBanner()) {
        return false;
    }

    // Disable item backdrop for books and people because they only have primary images
    if (item.Type === 'Person' || item.Type === 'Book') {
        return false;
    }

    let hasbackdrop = false;
    const itemBackdropElement = page.querySelector('#itemBackdrop');

    const imgUrl = getItemBackdropImageUrl(apiClient, item, { maxWidth: dom.getScreenWidth() }, false);

    if (imgUrl) {
        imageLoader.lazyImage(itemBackdropElement, imgUrl);
        hasbackdrop = true;
    } else {
        itemBackdropElement.style.backgroundImage = '';
    }

    return hasbackdrop;
}

/**
 * 从项目数据重新加载页面内容
 * 这是整个页面渲染的主函数
 * @param {Object} instance - 控制器实例
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} params - 路由参数对象
 * @param {Object} item - 媒体项目对象
 * @param {Object} user - 用户对象
 */
function reloadFromItem(instance, page, params, item, user) {
    const apiClient = ServerConnections.getApiClient(item.ServerId);

    libraryMenu.setTitle('');

    // Start rendering the artwork first
    renderImage(page, item, apiClient);

    renderLogo(page, item, apiClient);

    // Render the mobile header backdrop
    if (layoutManager.mobile) {
        renderHeaderBackdrop(page, item, apiClient);
    }

    renderBackdrop(page, item);

    // Render the main information for the item
    page.querySelector('.detailPagePrimaryContainer').classList.add('detailRibbon');
    renderName(item, page.querySelector('.nameContainer'), params.context);
    renderDetails(page, item, apiClient, params.context);
    renderTrackSelections(page, instance, item);

    renderSeriesTimerEditor(page, item, apiClient, user);
    renderTimerEditor(page, item, apiClient, user);
    setInitialCollapsibleState(page, item, apiClient, params.context, user);
    const canPlay = reloadPlayButtons(page, item);

    setTrailerButtonVisibility(page, item);

    if (item.Type !== 'Program' || canPlay) {
        hideAll(page, 'mainDetailButtons', true);
    } else {
        hideAll(page, 'mainDetailButtons');
    }

    showRecordingFields(instance, page, item, user);
    const groupedVersions = (item.MediaSources || []).filter(function (g) {
        return g.Type == 'Grouping';
    });

    if (user.Policy.IsAdministrator && groupedVersions.length) {
        page.querySelector('.btnSplitVersions').classList.remove('hide');
    } else {
        page.querySelector('.btnSplitVersions').classList.add('hide');
    }

    itemContextMenu.getCommands(getContextMenuOptions(item, user)).then(commands => {
        if (commands.length) {
            hideAll(page, 'btnMoreCommands', true);
        } else {
            hideAll(page, 'btnMoreCommands');
        }
    });

    const itemBirthday = page.querySelector('#itemBirthday');

    if (item.Type == 'Person' && item.PremiereDate) {
        try {
            const birthday = datetime.parseISO8601Date(item.PremiereDate, true);
            const durationSinceBorn = intervalToDuration({ start: birthday, end: Date.now() });
            itemBirthday.classList.remove('hide');
            if (item.EndDate) {
                itemBirthday.innerHTML = globalize.translate('BirthDateValue', birthday.toLocaleDateString());
            } else {
                itemBirthday.innerHTML = `${globalize.translate('BirthDateValue', birthday.toLocaleDateString())} ${globalize.translate('AgeValue', durationSinceBorn.years)}`;
            }
        } catch (err) {
            console.error(err);
            itemBirthday.classList.add('hide');
        }
    } else {
        itemBirthday.classList.add('hide');
    }

    const itemDeathDate = page.querySelector('#itemDeathDate');

    if (item.Type == 'Person' && item.EndDate) {
        try {
            const deathday = datetime.parseISO8601Date(item.EndDate, true);
            itemDeathDate.classList.remove('hide');
            if (item.PremiereDate) {
                const birthday = datetime.parseISO8601Date(item.PremiereDate, true);
                const durationSinceBorn = intervalToDuration({ start: birthday, end: deathday });

                itemDeathDate.innerHTML = `${globalize.translate('DeathDateValue', deathday.toLocaleDateString())} ${globalize.translate('AgeValue', durationSinceBorn.years)}`;
            } else {
                itemDeathDate.innerHTML = globalize.translate('DeathDateValue', deathday.toLocaleDateString());
            }
        } catch (err) {
            console.error(err);
            itemDeathDate.classList.add('hide');
        }
    } else {
        itemDeathDate.classList.add('hide');
    }

    const itemBirthLocation = page.querySelector('#itemBirthLocation');

    if (item.Type == 'Person' && item.ProductionLocations && item.ProductionLocations.length) {
        let location = item.ProductionLocations[0];
        if (!layoutManager.tv && appHost.supports(AppFeature.ExternalLinks)) {
            location = `<a is="emby-linkbutton" class="button-link textlink" target="_blank" href="https://www.openstreetmap.org/search?query=${encodeURIComponent(location)}">${escapeHtml(location)}</a>`;
        } else {
            location = escapeHtml(location);
        }
        itemBirthLocation.classList.remove('hide');
        itemBirthLocation.innerHTML = globalize.translate('BirthPlaceValue', location);
    } else {
        itemBirthLocation.classList.add('hide');
    }

    setPeopleHeader(page, item);
    loading.hide();

    if (item.Type === 'Book' && item.CanDownload && appHost.supports(AppFeature.FileDownload)) {
        hideAll(page, 'btnDownload', true);
    }

    autoFocus(page);
}

/**
 * 获取项目 Logo 图片 URL
 * @param {Object} item - 媒体项目对象
 * @param {Object} apiClient - API 客户端实例
 * @param {Object} options - 图片选项
 * @returns {string|null} Logo 图片 URL 或 null
 */
function logoImageUrl(item, apiClient, options) {
    options = options || {};
    options.type = 'Logo';

    if (item.ImageTags?.Logo) {
        options.tag = item.ImageTags.Logo;
        return apiClient.getScaledImageUrl(item.Id, options);
    }

    if (item.ParentLogoImageTag) {
        options.tag = item.ParentLogoImageTag;
        return apiClient.getScaledImageUrl(item.ParentLogoItemId, options);
    }

    return null;
}

/**
 * 渲染项目 Logo 图片
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 * @param {Object} apiClient - API 客户端实例
 */
function renderLogo(page, item, apiClient) {
    const detailLogo = page.querySelector('.detailLogo');

    const url = logoImageUrl(item, apiClient, {});

    if (url) {
        detailLogo.classList.remove('hide');
        imageLoader.setLazyImage(detailLogo, url);
    } else {
        detailLogo.classList.add('hide');
    }
}

/**
 * 显示录制设置字段
 * 用于电视节目的录制功能
 * @param {Object} instance - 控制器实例
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 * @param {Object} user - 用户对象
 */
function showRecordingFields(instance, page, item, user) {
    if (!instance.currentRecordingFields) {
        const recordingFieldsElement = page.querySelector('.recordingFields');

        if (item.Type == 'Program' && user.Policy.EnableLiveTvManagement) {
            import('../../components/recordingcreator/recordingfields').then(({ default: RecordingFields }) => {
                instance.currentRecordingFields = new RecordingFields({
                    parent: recordingFieldsElement,
                    programId: item.Id,
                    serverId: item.ServerId
                });
                recordingFieldsElement.classList.remove('hide');
            });
        } else {
            recordingFieldsElement.classList.add('hide');
            recordingFieldsElement.innerHTML = '';
        }
    }
}

/**
 * 渲染项目的外部链接
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 */
function renderLinks(page, item) {
    const externalLinksElem = page.querySelector('.itemExternalLinks');

    const links = [];

    if (!layoutManager.tv && item.HomePageUrl) {
        links.push(`<a is="emby-linkbutton" class="button-link" href="${item.HomePageUrl}" target="_blank">${globalize.translate('ButtonWebsite')}</a>`);
    }

    if (item.ExternalUrls) {
        for (const url of item.ExternalUrls) {
            links.push(`<a is="emby-linkbutton" class="button-link" href="${url.Url}" target="_blank">${escapeHtml(url.Name)}</a>`);
        }
    }

    const html = [];
    if (links.length) {
        html.push(links.join(', '));
    }

    externalLinksElem.innerHTML = html.join(', ');

    if (html.length) {
        externalLinksElem.classList.remove('hide');
    } else {
        externalLinksElem.classList.add('hide');
    }
}

/**
 * 渲染详情页面的项目图片
 * @param {Object} apiClient - API 客户端实例
 * @param {HTMLElement} elem - 图片容器元素
 * @param {Object} item - 媒体项目对象
 * @param {Object} loader - 图片加载器
 */
function renderDetailImage(apiClient, elem, item, loader) {
    const html = buildCardImage(
        apiClient,
        item,
        { width: dom.getWindowSize().innerWidth * 0.25 }
    );

    elem.innerHTML = html;
    loader.lazyChildren(elem);
}

/**
 * 渲染项目图片
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 * @param {Object} apiClient - API 客户端实例
 */
function renderImage(page, item, apiClient) {
    renderDetailImage(
        apiClient,
        page.querySelector('.detailImageContainer'),
        item,
        imageLoader
    );
}

/**
 * 设置人物区域的标题
 * 根据媒体类型显示不同的标题文本
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 */
function setPeopleHeader(page, item) {
    if (item.MediaType == 'Audio' || item.Type == 'MusicAlbum' || item.MediaType == 'Book' || item.MediaType == 'Photo') {
        page.querySelector('#peopleHeader').innerHTML = globalize.translate('People');
    } else {
        page.querySelector('#peopleHeader').innerHTML = globalize.translate('HeaderCastAndCrew');
    }
}

/**
 * 渲染下一集区域
 * 用于显示电视剧的下一集
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 * @param {Object} user - 用户对象
 */
function renderNextUp(page, item, user) {
    const section = page.querySelector('.nextUpSection');

    if (item.Type != 'Series') {
        section.classList.add('hide');
        return;
    }

    ServerConnections.getApiClient(item.ServerId).getNextUpEpisodes({
        SeriesId: item.Id,
        UserId: user.Id,
        Fields: 'MediaSourceCount'
    }).then(function (result) {
        if (result.Items.length) {
            section.classList.remove('hide');
        } else {
            section.classList.add('hide');
        }

        const html = cardBuilder.getCardsHtml({
            items: result.Items,
            shape: 'overflowBackdrop',
            showTitle: true,
            displayAsSpecial: item.Type == 'Season' && item.IndexNumber,
            overlayText: false,
            centerText: true,
            overlayPlayButton: true
        });
        const itemsContainer = section.querySelector('.nextUpItems');
        itemsContainer.innerHTML = html;
        imageLoader.lazyChildren(itemsContainer);
    });
}

/**
 * 设置初始折叠区域的状态
 * 根据项目类型显示不同的内容区域
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 * @param {Object} apiClient - API 客户端实例
 * @param {string} context - 应用上下文
 * @param {Object} user - 用户对象
 */
function setInitialCollapsibleState(page, item, apiClient, context, user) {
    page.querySelector('.collectionItems').innerHTML = '';

    if (item.Type == 'Playlist') {
        page.querySelector('#childrenCollapsible').classList.remove('hide');
        renderPlaylistItems(page, item);
    } else if (item.Type == 'Studio' || item.Type == 'Person' || item.Type == 'Genre' || item.Type == 'MusicGenre' || item.Type == 'MusicArtist') {
        page.querySelector('#childrenCollapsible').classList.remove('hide');
        renderItemsByName(page, item);
    } else if (item.IsFolder) {
        if (item.Type == 'BoxSet') {
            page.querySelector('#childrenCollapsible').classList.add('hide');
        }

        renderChildren(page, item);
    } else {
        page.querySelector('#childrenCollapsible').classList.add('hide');
    }

    if (item.Type == 'Series') {
        renderSeriesSchedule(page, item);
        renderNextUp(page, item, user);
    } else {
        page.querySelector('.nextUpSection').classList.add('hide');
    }

    renderScenes(page, item);

    if (item.SpecialFeatureCount > 0) {
        page.querySelector('#specialsCollapsible').classList.remove('hide');
        renderSpecials(page, item, user);
    } else {
        page.querySelector('#specialsCollapsible').classList.add('hide');
    }

    const cast = [];
    const guestCast = [];
    (item.People || []).forEach(p => {
        if (p.Type === PersonKind.GuestStar) {
            guestCast.push(p);
        } else {
            cast.push(p);
        }
    });

    renderCast(page, item, cast);
    renderGuestCast(page, item, guestCast);

    if (item.PartCount && item.PartCount > 1) {
        page.querySelector('#additionalPartsCollapsible').classList.remove('hide');
        renderAdditionalParts(page, item, user);
    } else {
        page.querySelector('#additionalPartsCollapsible').classList.add('hide');
    }

    if (item.Type == 'MusicAlbum' || item.Type == 'MusicArtist') {
        renderMusicVideos(page, item, user);
    } else {
        page.querySelector('#musicVideosCollapsible').classList.add('hide');
    }
}

/**
 * 切换文本的展开/折叠状态
 * @param {HTMLElement} clampTarget - 需要切换的文本元素
 * @param {Event} e - 事件对象
 */
function toggleLineClamp(clampTarget, e) {
    const expandButton = e.target;
    const clampClassName = 'detail-clamp-text';

    if (clampTarget.classList.contains(clampClassName)) {
        clampTarget.classList.remove(clampClassName);
        expandButton.innerHTML = globalize.translate('ShowLess');
    } else {
        clampTarget.classList.add(clampClassName);
        expandButton.innerHTML = globalize.translate('ShowMore');
    }
}

/**
 * 渲染项目的描述/简介
 * 支持 Markdown 格式并提供展开/折叠功能
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 */
function renderOverview(page, item) {
    const overviewElements = page.querySelectorAll('.overview');

    if (overviewElements.length > 0) {
        // eslint-disable-next-line sonarjs/disabled-auto-escaping
        const overview = DOMPurify.sanitize(markdownIt({ html: true }).render(item.Overview || ''));

        if (overview) {
            for (const overviewElemnt of overviewElements) {
                overviewElemnt.innerHTML = '<bdi>' + overview + '</bdi>';
                overviewElemnt.classList.remove('hide');
                overviewElemnt.classList.add('detail-clamp-text');

                // Grab the sibling element to control the expand state
                const expandButton = overviewElemnt.parentElement.querySelector('.overview-expand');

                // Detect if we have overflow of text. Based on this StackOverflow answer
                // https://stackoverflow.com/a/35157976
                if (Math.abs(overviewElemnt.scrollHeight - overviewElemnt.offsetHeight) > 2) {
                    expandButton.classList.remove('hide');
                } else {
                    expandButton.classList.add('hide');
                }

                expandButton.addEventListener('click', toggleLineClamp.bind(null, overviewElemnt));

                for (const anchor of overviewElemnt.querySelectorAll('a')) {
                    anchor.setAttribute('target', '_blank');
                }
            }
        } else {
            for (const overviewElemnt of overviewElements) {
                overviewElemnt.innerHTML = '';
                overviewElemnt.classList.add('hide');
            }
        }
    }
}

/**
 * 渲染项目的类型/风格
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 * @param {string} context - 应用上下文,默认从项目类型推断
 */
function renderGenres(page, item, context = inferContext(item)) {
    const genres = item.GenreItems || [];
    const type = context === 'music' ? 'MusicGenre' : 'Genre';

    const html = genres.map(function (p) {
        return '<a style="color:inherit;" class="button-link" is="emby-linkbutton" href="' + appRouter.getRouteUrl({
            Name: p.Name,
            Type: type,
            ServerId: item.ServerId,
            Id: p.Id
        }, {
            context: context
        }) + '">' + escapeHtml(p.Name) + '</a>';
    }).join(', ');

    const genresLabel = page.querySelector('.genresLabel');
    genresLabel.innerHTML = globalize.translate(genres.length > 1 ? 'Genres' : 'Genre');
    const genresValue = page.querySelector('.genres');
    genresValue.innerHTML = html;

    const genresGroup = page.querySelector('.genresGroup');
    if (genres.length) {
        genresGroup.classList.remove('hide');
    } else {
        genresGroup.classList.add('hide');
    }
}

/**
 * 渲染编剧信息
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 * @param {string} context - 应用上下文
 */
function renderWriter(page, item, context) {
    const writers = (item.People || []).filter(function (person) {
        return person.Type === 'Writer';
    });

    const html = writers.map(function (person) {
        return '<a style="color:inherit;" class="button-link" is="emby-linkbutton" href="' + appRouter.getRouteUrl({
            Name: person.Name,
            Type: 'Person',
            ServerId: item.ServerId,
            Id: person.Id
        }, {
            context: context
        }) + '">' + escapeHtml(person.Name) + '</a>';
    }).join(', ');

    const writersLabel = page.querySelector('.writersLabel');
    writersLabel.innerHTML = globalize.translate(writers.length > 1 ? 'Writers' : 'Writer');
    const writersValue = page.querySelector('.writers');
    writersValue.innerHTML = html;

    const writersGroup = page.querySelector('.writersGroup');
    if (writers.length) {
        writersGroup.classList.remove('hide');
    } else {
        writersGroup.classList.add('hide');
    }
}

/**
 * 渲染导演信息
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 * @param {string} context - 应用上下文
 */
function renderDirector(page, item, context) {
    const directors = (item.People || []).filter(function (person) {
        return person.Type === 'Director';
    });

    const html = directors.map(function (person) {
        return '<a style="color:inherit;" class="button-link" is="emby-linkbutton" href="' + appRouter.getRouteUrl({
            Name: person.Name,
            Type: 'Person',
            ServerId: item.ServerId,
            Id: person.Id
        }, {
            context: context
        }) + '">' + escapeHtml(person.Name) + '</a>';
    }).join(', ');

    const directorsLabel = page.querySelector('.directorsLabel');
    directorsLabel.innerHTML = globalize.translate(directors.length > 1 ? 'Directors' : 'Director');
    const directorsValue = page.querySelector('.directors');
    directorsValue.innerHTML = html;

    const directorsGroup = page.querySelector('.directorsGroup');
    if (directors.length) {
        directorsGroup.classList.remove('hide');
    } else {
        directorsGroup.classList.add('hide');
    }
}

/**
 * 渲染制片公司/工作室信息
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 * @param {string} context - 应用上下文
 */
function renderStudio(page, item, context) {
    // The list of studios can be massive for collections of items
    if ([BaseItemKind.BoxSet, BaseItemKind.Playlist].includes(item.Type)) return;

    const studios = item.Studios || [];

    const html = studios.map(function (studio) {
        return '<a style="color:inherit;" class="button-link" is="emby-linkbutton" href="' + appRouter.getRouteUrl({
            Name: studio.Name,
            Type: 'Studio',
            ServerId: item.ServerId,
            Id: studio.Id
        }, {
            context: context
        }) + '">' + escapeHtml(studio.Name) + '</a>';
    }).join(', ');

    const studiosLabel = page.querySelector('.studiosLabel');
    studiosLabel.innerText = globalize.translate(studios.length > 1 ? 'Studios' : 'Studio');
    const studiosValue = page.querySelector('.studios');
    studiosValue.innerHTML = html;

    const studiosGroup = page.querySelector('.studiosGroup');
    studiosGroup.classList.toggle('hide', !studios.length);
}

/**
 * 渲染媒体的其他信息
 * 包括分辨率、时长、编解码器等技术信息
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 */
function renderMiscInfo(page, item) {
    const primaryItemMiscInfo = page.querySelectorAll('.itemMiscInfo-primary');

    for (const miscInfo of primaryItemMiscInfo) {
        mediaInfo.fillPrimaryMediaInfo(miscInfo, item, {
            interactive: true,
            episodeTitle: false,
            subtitles: false
        });

        if (miscInfo.innerHTML && item.Type !== 'SeriesTimer') {
            miscInfo.classList.remove('hide');
        } else {
            miscInfo.classList.add('hide');
        }
    }

    const secondaryItemMiscInfo = page.querySelectorAll('.itemMiscInfo-secondary');

    for (const miscInfo of secondaryItemMiscInfo) {
        mediaInfo.fillSecondaryMediaInfo(miscInfo, item, {
            interactive: true
        });

        if (miscInfo.innerHTML && item.Type !== 'SeriesTimer') {
            miscInfo.classList.remove('hide');
        } else {
            miscInfo.classList.add('hide');
        }
    }
}

/**
 * 渲染项目的宣传语
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 */
function renderTagline(page, item) {
    const taglineElement = page.querySelector('.tagline');

    if (item.Taglines?.length) {
        taglineElement.classList.remove('hide');
        taglineElement.innerHTML = '<bdi>' + escapeHtml(item.Taglines[0]) + '</bdi>';
    } else {
        taglineElement.classList.add('hide');
    }
}

/**
 * 渲染项目的所有详细信息
 * 这是一个综合性函数,调用多个子渲染函数
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 * @param {Object} apiClient - API 客户端实例
 * @param {string} context - 应用上下文
 */
function renderDetails(page, item, apiClient, context) {
    renderSimilarItems(page, item, context);
    renderMoreFromSeason(page, item, apiClient);
    renderMoreFromArtist(page, item, apiClient);
    renderDirector(page, item, context);
    renderStudio(page, item, context);
    renderWriter(page, item, context);
    renderGenres(page, item, context);
    renderChannelGuide(page, apiClient, item);
    renderTagline(page, item);
    renderOverview(page, item);
    renderMiscInfo(page, item);
    reloadUserDataButtons(page, item);
    renderLyricsContainer(page, item, apiClient);

    // Don't allow redirection to other websites from the TV layout
    if (!layoutManager.tv && appHost.supports(AppFeature.ExternalLinks)) {
        renderLinks(page, item);
    }

    renderTags(page, item);
    renderSeriesAirTime(page, item);
}

/**
 * 判断是否启用水平滚动
 * @returns {boolean} 在移动设备上且屏幕宽度小于 1000px 时返回 true
 */
function enableScrollX() {
    return browser.mobile && window.screen.availWidth <= 1000;
}

/**
 * 渲染歌词容器
 * 仅对音频项目显示歌词，从 API 获取歌词数据并显示
 * @param {HTMLElement} view - 页面视图元素
 * @param {Object} item - 媒体项目对象
 * @param {Object} apiClient - API 客户端实例
 */
function renderLyricsContainer(view, item, apiClient) {
    const lyricContainer = view.querySelector('.lyricsContainer');
    if (lyricContainer && item.HasLyrics) {
        if (item.Type !== 'Audio') {
            lyricContainer.classList.add('hide');
            return;
        }
        // 获取歌词
        apiClient.ajax({
            url: apiClient.getUrl('Audio/' + item.Id + '/Lyrics'),
            type: 'GET',
            dataType: 'json'
        }).then((response) => {
            if (!response.Lyrics) {
                lyricContainer.classList.add('hide');
                return;
            }
            lyricContainer.classList.remove('hide');
            const itemsContainer = lyricContainer.querySelector('.itemsContainer');
            if (itemsContainer) {
                const html = response.Lyrics.reduce((htmlAccumulator, lyric) => {
                    htmlAccumulator += escapeHtml(lyric.Text) + '<br/>';
                    return htmlAccumulator;
                }, '');
                itemsContainer.innerHTML = html;
            }
        }).catch(() => {
            lyricContainer.classList.add('hide');
        });
    }
}

/**
 * 渲染“本季更多剧集”区域
 * 显示当前剧集所在季的其他剧集，并自动滚动到当前剧集位置
 * @param {HTMLElement} view - 页面视图元素
 * @param {Object} item - 当前剧集项目对象
 * @param {Object} apiClient - API 客户端实例
 */
function renderMoreFromSeason(view, item, apiClient) {
    const section = view.querySelector('.moreFromSeasonSection');

    if (section) {
        if (item.Type !== 'Episode' || !item.SeasonId || !item.SeriesId) {
            section.classList.add('hide');
            return;
        }

        const userId = apiClient.getCurrentUserId();
        apiClient.getEpisodes(item.SeriesId, {
            SeasonId: item.SeasonId,
            UserId: userId,
            Fields: 'ItemCounts,PrimaryImageAspectRatio,CanDelete,MediaSourceCount'
        }).then(function (result) {
            if (result.Items.length < 2) {
                section.classList.add('hide');
                return;
            }

            section.classList.remove('hide');
            section.querySelector('h2').innerText = globalize.translate('MoreFromValue', item.SeasonName);
            const itemsContainer = section.querySelector('.itemsContainer');
            cardBuilder.buildCards(result.Items, {
                parentContainer: section,
                itemsContainer: itemsContainer,
                shape: 'autooverflow',
                sectionTitleTagName: 'h2',
                scalable: true,
                showTitle: true,
                overlayText: false,
                centerText: true,
                includeParentInfoInTitle: false,
                allowBottomPadding: false
            });
            const card = itemsContainer.querySelector('.card[data-id="' + item.Id + '"]');

            if (card) {
                setTimeout(function () {
                    section.querySelector('.emby-scroller').toStart(card.previousSibling || card, true);
                }, 100);
            }
        });
    }
}

/**
 * 渲染“来自该艺术家的更多作品”区域
 * 显示相同艺术家的其他音乐专辑
 * @param {HTMLElement} view - 页面视图元素
 * @param {Object} item - 当前项目对象（音乐艺术家/音频/音乐专辑）
 * @param {Object} apiClient - API 客户端实例
 */
function renderMoreFromArtist(view, item, apiClient) {
    const section = view.querySelector('.moreFromArtistSection');

    if (section) {
        if (item.Type !== 'MusicArtist' && item.Type !== 'Audio' && (item.Type !== 'MusicAlbum' || !item.AlbumArtists || !item.AlbumArtists.length)) {
            section.classList.add('hide');
            return;
        }

        const query = {
            IncludeItemTypes: 'MusicAlbum',
            Recursive: true,
            ExcludeItemIds: item.Id,
            SortBy: 'PremiereDate,ProductionYear,SortName',
            SortOrder: 'Descending'
        };

        if (item.Type === 'MusicArtist') {
            query.ContributingArtistIds = item.Id;
        } else {
            query.ContributingArtistIds = item.AlbumArtists.map(artist => artist.Id).join(',');
        }

        apiClient.getItems(apiClient.getCurrentUserId(), query).then(function (result) {
            if (!result.Items.length) {
                section.classList.add('hide');
                return;
            }

            section.classList.remove('hide');

            if (item.Type === 'MusicArtist') {
                section.querySelector('h2').innerText = globalize.translate('HeaderAppearsOn');
            } else {
                section.querySelector('h2').innerText = globalize.translate('MoreFromValue', item.AlbumArtists[0].Name);
            }

            cardBuilder.buildCards(result.Items, {
                parentContainer: section,
                itemsContainer: section.querySelector('.itemsContainer'),
                shape: 'autooverflow',
                sectionTitleTagName: 'h2',
                scalable: true,
                coverImage: item.Type === 'MusicArtist' || item.Type === 'MusicAlbum',
                showTitle: true,
                showParentTitle: false,
                centerText: true,
                overlayText: false,
                overlayPlayButton: true,
                showYear: true
            });
        });
    }
}

/**
 * 渲染相似项目区域
 * 基于当前项目的特征显示相似的媒体内容
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 当前媒体项目对象
 * @param {string} context - 应用上下文
 */
function renderSimilarItems(page, item, context) {
    const similarCollapsible = page.querySelector('#similarCollapsible');

    if (similarCollapsible) {
        if (item.Type != 'Movie' && item.Type != 'Trailer' && item.Type != 'Series' && item.Type != 'Program' && item.Type != 'Recording' && item.Type != 'MusicAlbum' && item.Type != 'MusicArtist' && item.Type != 'Playlist' && item.Type != 'Audio') {
            similarCollapsible.classList.add('hide');
            return;
        }

        similarCollapsible.classList.remove('hide');
        const apiClient = ServerConnections.getApiClient(item.ServerId);
        const options = {
            userId: apiClient.getCurrentUserId(),
            limit: 12,
            fields: 'PrimaryImageAspectRatio,CanDelete'
        };

        if (item.Type == 'MusicAlbum' && item.AlbumArtists && item.AlbumArtists.length) {
            options.ExcludeArtistIds = item.AlbumArtists[0].Id;
        }

        apiClient.getSimilarItems(item.Id, options).then(function (result) {
            if (!result.Items.length) {
                similarCollapsible.classList.add('hide');
                return;
            }

            similarCollapsible.classList.remove('hide');
            let html = '';
            html += cardBuilder.getCardsHtml({
                items: result.Items,
                shape: 'autooverflow',
                showParentTitle: item.Type == 'MusicAlbum',
                centerText: true,
                showTitle: true,
                context: context,
                lazy: true,
                showDetailsMenu: true,
                coverImage: item.Type == 'MusicAlbum' || item.Type == 'MusicArtist',
                overlayPlayButton: true,
                overlayText: false,
                showYear: item.Type === 'Movie' || item.Type === 'Trailer' || item.Type === 'Series'
            });
            const similarContent = similarCollapsible.querySelector('.similarContent');
            similarContent.innerHTML = html;
            imageLoader.lazyChildren(similarContent);
        });
    }
}

/**
 * 渲染电视剧播出时间
 * 显示电视剧的播出时间表（星期几和具体时间）
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 电视剧项目对象
 */
function renderSeriesAirTime(page, item) {
    const seriesAirTime = page.querySelector('#seriesAirTime');
    if (item.Type != 'Series') {
        seriesAirTime.classList.add('hide');
        return;
    }
    let html = '';
    if (item.AirDays?.length) {
        if (item.AirDays.length == 7) {
            html += 'daily';
        } else {
            html += item.AirDays.map(function (a) {
                return a + 's';
            }).join(',');
        }
    }
    if (item.AirTime) {
        html += ' at ' + item.AirTime;
    }
    if (html) {
        html = (item.Status == 'Ended' ? 'Aired ' : 'Airs ') + html;
        seriesAirTime.innerHTML = html;
        seriesAirTime.classList.remove('hide');
    } else {
        seriesAirTime.classList.add('hide');
    }
}

/**
 * 渲染项目标签
 * 显示项目的所有标签，每个标签为一个可点击的链接
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 */
function renderTags(page, item) {
    const itemTags = page.querySelector('.itemTags');
    const tagElements = [];
    let tags = item.Tags || [];

    if (item.Type === 'Program') {
        tags = [];
    }

    tags.forEach(tag => {
        const href = appRouter.getRouteUrl('tag', {
            tag,
            serverId: item.ServerId
        });
        tagElements.push(
            `<a href="${href}" class="button-link" is="emby-linkbutton">`
            + escapeHtml(tag)
            + '</a>'
        );
    });

    if (tagElements.length) {
        itemTags.innerHTML = globalize.translate('TagsValue', tagElements.join(', '));
        itemTags.classList.remove('hide');
    } else {
        itemTags.innerHTML = '';
        itemTags.classList.add('hide');
    }
}

/**
 * 渲染项目的子项目
 * 根据项目类型显示季、剧集、音轨等
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 */
function renderChildren(page, item) {
    let fields = 'ItemCounts,PrimaryImageAspectRatio,CanDelete,MediaSourceCount';
    const query = {
        ParentId: item.Id,
        Fields: fields
    };

    if (item.Type == 'MusicAlbum') {
        query.SortBy = 'ParentIndexNumber,IndexNumber,SortName';
    } else if (item.Type !== 'BoxSet') {
        query.SortBy = 'SortName';
    }

    let promise;
    const apiClient = ServerConnections.getApiClient(item.ServerId);
    const userId = apiClient.getCurrentUserId();

    if (item.Type == 'Series') {
        promise = apiClient.getSeasons(item.Id, {
            userId: userId,
            Fields: fields
        });
    } else if (item.Type == 'Season') {
        fields += ',Overview';
        promise = apiClient.getEpisodes(item.SeriesId, {
            seasonId: item.Id,
            userId: userId,
            Fields: fields
        });
    } else if (item.Type == 'MusicArtist') {
        query.SortBy = 'PremiereDate,ProductionYear,SortName';
    }

    promise = promise || apiClient.getItems(apiClient.getCurrentUserId(), query);
    promise.then(function (result) {
        let html = '';
        let scrollX = false;
        let isList = false;
        const childrenItemsContainer = page.querySelector('.childrenItemsContainer');

        if (item.Type == 'MusicAlbum') {
            let showArtist = false;
            for (const track of result.Items) {
                if (!isEqual(track.ArtistItems.map(x => x.Id).sort(), track.AlbumArtists.map(x => x.Id).sort())) {
                    showArtist = true;
                    break;
                }
            }
            const discNumbers = result.Items.map(x => x.ParentIndexNumber);
            html = listView.getListViewHtml({
                items: result.Items,
                smallIcon: true,
                showIndex: new Set(discNumbers).size > 1 || (discNumbers.length >= 1 && discNumbers[0] > 1),
                index: 'disc',
                showIndexNumberLeft: true,
                playFromHere: true,
                action: 'playallfromhere',
                image: false,
                artist: showArtist,
                containerAlbumArtists: item.AlbumArtists
            });
            isList = true;
        } else if (item.Type == 'Series') {
            scrollX = enableScrollX();
            html = cardBuilder.getCardsHtml({
                items: result.Items,
                shape: 'overflowPortrait',
                showTitle: true,
                centerText: true,
                lazy: true,
                overlayPlayButton: true,
                allowBottomPadding: !scrollX
            });
        } else if (item.Type == 'Season' || item.Type == 'Episode') {
            if (item.Type !== 'Episode') {
                isList = true;
            }
            scrollX = item.Type == 'Episode';
            if (result.Items.length < 2 && item.Type === 'Episode') {
                return;
            }

            if (item.Type === 'Episode') {
                html = cardBuilder.getCardsHtml({
                    items: result.Items,
                    shape: 'overflowBackdrop',
                    showTitle: true,
                    displayAsSpecial: item.Type == 'Season' && item.IndexNumber,
                    playFromHere: true,
                    overlayText: true,
                    lazy: true,
                    showDetailsMenu: true,
                    overlayPlayButton: true,
                    allowBottomPadding: !scrollX,
                    includeParentInfoInTitle: false
                });
            } else if (item.Type === 'Season') {
                html = listView.getListViewHtml({
                    items: result.Items,
                    showIndexNumber: false,
                    enableOverview: true,
                    enablePlayedButton: !layoutManager.mobile,
                    infoButton: !layoutManager.mobile,
                    imageSize: 'large',
                    enableSideMediaInfo: false,
                    highlight: false,
                    action: !layoutManager.desktop ? 'link' : 'none',
                    imagePlayButton: true,
                    includeParentInfoInTitle: false
                });
            }
        }

        if (item.Type !== 'BoxSet') {
            page.querySelector('#childrenCollapsible').classList.remove('hide');
        }
        if (scrollX) {
            childrenItemsContainer.classList.add('scrollX');
            childrenItemsContainer.classList.add('hiddenScrollX');
            childrenItemsContainer.classList.remove('vertical-wrap');
            childrenItemsContainer.classList.remove('vertical-list');
        } else {
            childrenItemsContainer.classList.remove('scrollX');
            childrenItemsContainer.classList.remove('hiddenScrollX');
            childrenItemsContainer.classList.remove('smoothScrollX');
            if (isList) {
                childrenItemsContainer.classList.add('vertical-list');
                childrenItemsContainer.classList.remove('vertical-wrap');
            } else {
                childrenItemsContainer.classList.add('vertical-wrap');
                childrenItemsContainer.classList.remove('vertical-list');
            }
        }
        if (layoutManager.mobile) {
            childrenItemsContainer.classList.remove('padded-right');
        }
        childrenItemsContainer.innerHTML = html;
        imageLoader.lazyChildren(childrenItemsContainer);
        if (item.Type == 'BoxSet') {
            const collectionItemTypes = [{
                name: globalize.translate('Movies'),
                type: 'Movie'
            }, {
                name: globalize.translate('Series'),
                type: 'Series'
            }, {
                name: globalize.translate('Episodes'),
                type: 'Episode'
            }, {
                name: globalize.translate('HeaderVideos'),
                mediaType: 'Video'
            }, {
                name: globalize.translate('Albums'),
                type: 'MusicAlbum'
            }, {
                name: globalize.translate('Books'),
                type: 'Book'
            }, {
                name: globalize.translate('Collections'),
                type: 'BoxSet'
            }];
            renderCollectionItems(page, item, collectionItemTypes, result.Items);
        }
    });

    if (item.Type == 'Season') {
        page.querySelector('#childrenTitle').innerHTML = globalize.translate('Episodes');
    } else if (item.Type == 'Series') {
        page.querySelector('#childrenTitle').innerHTML = globalize.translate('HeaderSeasons');
    } else if (item.Type == 'MusicAlbum') {
        page.querySelector('#childrenTitle').innerHTML = globalize.translate('HeaderTracks');
    } else {
        page.querySelector('#childrenTitle').innerHTML = globalize.translate('Items');
    }

    if (item.Type == 'MusicAlbum' || item.Type == 'Season') {
        page.querySelector('.childrenSectionHeader').classList.add('hide');
        page.querySelector('#childrenCollapsible').classList.add('verticalSection-extrabottompadding');
    } else {
        page.querySelector('.childrenSectionHeader').classList.remove('hide');
    }
}

/**
 * 按名称渲染项目列表
 * 用于类型、艺术家、工作室等特殊类型页面
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 */
function renderItemsByName(page, item) {
    import('../../scripts/itemsByName').then(({ default: ItemsByName }) => {
        ItemsByName.renderItems(page, item);
    });
}

/**
 * 渲染播放列表中的项目
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 播放列表项目对象
 */
function renderPlaylistItems(page, item) {
    import('../../scripts/playlistViewer').then(({ default: PlaylistViewer }) => {
        PlaylistViewer.render(page, item);
    });
}

/**
 * 渲染频道的节目列表
 * 按日期分组显示电视频道的节目指南
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} result - API 返回的节目列表结果
 */
function renderProgramsForChannel(page, result) {
    let html = '';
    let currentItems = [];
    let currentStartDate = null;

    for (let i = 0, length = result.Items.length; i < length; i++) {
        const item = result.Items[i];
        const itemStartDate = datetime.parseISO8601Date(item.StartDate);

        if (!(currentStartDate && currentStartDate.toDateString() === itemStartDate.toDateString())) {
            if (currentItems.length) {
                html += '<div class="verticalSection verticalDetailSection">';
                html += '<h2 class="sectionTitle padded-left">' + datetime.toLocaleDateString(currentStartDate, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric'
                }) + '</h2>';
                html += '<div is="emby-itemscontainer" class="vertical-list padded-left padded-right">' + listView.getListViewHtml({
                    items: currentItems,
                    enableUserDataButtons: false,
                    showParentTitle: true,
                    image: false,
                    showProgramTime: true,
                    mediaInfo: false,
                    parentTitleWithTitle: true
                }) + '</div></div>';
            }

            currentStartDate = itemStartDate;
            currentItems = [];
        }

        currentItems.push(item);
    }

    if (currentItems.length) {
        html += '<div class="verticalSection verticalDetailSection">';
        html += '<h2 class="sectionTitle padded-left">' + datetime.toLocaleDateString(currentStartDate, {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        }) + '</h2>';
        html += '<div is="emby-itemscontainer" class="vertical-list padded-left padded-right">' + listView.getListViewHtml({
            items: currentItems,
            enableUserDataButtons: false,
            showParentTitle: true,
            image: false,
            showProgramTime: true,
            mediaInfo: false,
            parentTitleWithTitle: true
        }) + '</div></div>';
    }

    page.querySelector('.programGuide').innerHTML = html;
}

/**
 * 渲染频道节目指南
 * 如果项目是电视频道，则显示该频道的节目安排
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} apiClient - API 客户端实例
 * @param {Object} item - 媒体项目对象
 */
function renderChannelGuide(page, apiClient, item) {
    if (item.Type === 'TvChannel') {
        page.querySelector('.programGuideSection').classList.remove('hide');
        apiClient.getLiveTvPrograms({
            ChannelIds: item.Id,
            UserId: apiClient.getCurrentUserId(),
            HasAired: false,
            SortBy: 'StartDate',
            EnableTotalRecordCount: false,
            EnableImages: false,
            ImageTypeLimit: 0,
            EnableUserData: false
        }).then(function (result) {
            renderProgramsForChannel(page, result);
        });
    }
}

/**
 * 渲染电视剧的播出时间表
 * 显示电视剧在直播电视中的未来播出安排
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 电视剧项目对象
 */
function renderSeriesSchedule(page, item) {
    const apiClient = ServerConnections.getApiClient(item.ServerId);
    apiClient.getLiveTvPrograms({
        UserId: apiClient.getCurrentUserId(),
        ImageTypeLimit: 1,
        HasAired: false,
        SortBy: 'StartDate',
        EnableTotalRecordCount: false,
        Limit: 50,
        EnableUserData: false,
        Fields: 'ChannelInfo,ChannelImage',
        LibrarySeriesId: item.Id
    }).then(function (result) {
        if (result.Items.length) {
            page.querySelector('#seriesScheduleSection').classList.remove('hide');
        } else {
            page.querySelector('#seriesScheduleSection').classList.add('hide');
        }

        const html = getProgramScheduleHtml(result.Items, 'programdialog');
        const scheduleTab = page.querySelector('#seriesScheduleList');
        scheduleTab.innerHTML = html;
        imageLoader.lazyChildren(scheduleTab);

        loading.hide();
    });
}

/**
 * 渲染频道的节目列表
 * 按日期分组显示电视频道的节目指南
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} result - API 返回的节目列表结果
 */
function renderProgramsForChannel(page, result) {
    let html = '';
    let currentItems = [];
    let currentStartDate = null;

    for (let i = 0, length = result.Items.length; i < length; i++) {
        const item = result.Items[i];
        const itemStartDate = datetime.parseISO8601Date(item.StartDate);

        if (!(currentStartDate && currentStartDate.toDateString() === itemStartDate.toDateString())) {
            if (currentItems.length) {
                html += '<div class="verticalSection verticalDetailSection">';
                html += '<h2 class="sectionTitle padded-left">' + datetime.toLocaleDateString(currentStartDate, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric'
                }) + '</h2>';
                html += '<div is="emby-itemscontainer" class="vertical-list padded-left padded-right">' + listView.getListViewHtml({
                    items: currentItems,
                    enableUserDataButtons: false,
                    showParentTitle: true,
                    image: false,
                    showProgramTime: true,
                    mediaInfo: false,
                    parentTitleWithTitle: true
                }) + '</div></div>';
            }

            currentStartDate = itemStartDate;
            currentItems = [];
        }

        currentItems.push(item);
    }

    if (currentItems.length) {
        html += '<div class="verticalSection verticalDetailSection">';
        html += '<h2 class="sectionTitle padded-left">' + datetime.toLocaleDateString(currentStartDate, {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        }) + '</h2>';
        html += '<div is="emby-itemscontainer" class="vertical-list padded-left padded-right">' + listView.getListViewHtml({
            items: currentItems,
            enableUserDataButtons: false,
            showParentTitle: true,
            image: false,
            showProgramTime: true,
            mediaInfo: false,
            parentTitleWithTitle: true
        }) + '</div></div>';
    }

    page.querySelector('.programGuide').innerHTML = html;
}

/**
 * 渲染频道节目指南
 * 如果项目是电视频道,则显示该频道的节目安排
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} apiClient - API 客户端实例
 * @param {Object} item - 媒体项目对象
 */
function renderChannelGuide(page, apiClient, item) {
    if (item.Type === 'TvChannel') {
        page.querySelector('.programGuideSection').classList.remove('hide');
        apiClient.getLiveTvPrograms({
            ChannelIds: item.Id,
            UserId: apiClient.getCurrentUserId(),
            HasAired: false,
            SortBy: 'StartDate',
            EnableTotalRecordCount: false,
            EnableImages: false,
            ImageTypeLimit: 0,
            EnableUserData: false
        }).then(function (result) {
            renderProgramsForChannel(page, result);
        });
    }
}

/**
 * 渲染电视剧的播出时间表
 * 显示电视剧在直播电视中的未来播出安排
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 电视剧项目对象
 */
function renderSeriesSchedule(page, item) {
    const apiClient = ServerConnections.getApiClient(item.ServerId);
    apiClient.getLiveTvPrograms({
        UserId: apiClient.getCurrentUserId(),
        ImageTypeLimit: 1,
        HasAired: false,
        SortBy: 'StartDate',
        EnableTotalRecordCount: false,
        Limit: 50,
        EnableUserData: false,
        Fields: 'ChannelInfo,ChannelImage',
        LibrarySeriesId: item.Id
    }).then(function (result) {
        if (result.Items.length) {
            page.querySelector('#seriesScheduleSection').classList.remove('hide');
        } else {
            page.querySelector('#seriesScheduleSection').classList.add('hide');
        }

        const html = getProgramScheduleHtml(result.Items, 'programdialog');
        const scheduleTab = page.querySelector('#seriesScheduleList');
        scheduleTab.innerHTML = html;
        imageLoader.lazyChildren(scheduleTab);

        loading.hide();
    });
}

/**
 * 根据项目类型推断应用上下文
 * @param {Object} item - 媒体项目对象
 * @returns {string|null} 上下文字符串: 'movies', 'tvshows', 'music', 'livetv' 或 null
 */
function inferContext(item) {
    if (item.Type === 'Movie' || item.Type === 'BoxSet') {
        return 'movies';
    }

    if (item.Type === 'Series' || item.Type === 'Season' || item.Type === 'Episode') {
        return 'tvshows';
    }

    if (item.Type === 'MusicArtist' || item.Type === 'MusicAlbum' || item.Type === 'Audio' || item.Type === 'AudioBook') {
        return 'music';
    }

    if (item.Type === 'Program') {
        return 'livetv';
    }

    return null;
}

/**
 * 按集合项目类型过滤项目
 * 根据媒体类型或项目类型将项目分为匹配和不匹配两组
 * @param {Array} items - 待过滤的项目数组
 * @param {Object} typeInfo - 类型信息对象,包含 mediaType 或 type 属性
 * @returns {Array} 包含两个数组的数组: [匹配的项目, 不匹配的项目]
 */
function filterItemsByCollectionItemType(items, typeInfo) {
    const filteredItems = [];
    const leftoverItems = [];
    items.forEach(function(item) {
        if ((typeInfo.mediaType && item.MediaType == typeInfo.mediaType) || (item.Type == typeInfo.type)) {
            filteredItems.push(item);
        } else {
            leftoverItems.push(item);
        }
    });
    return [filteredItems, leftoverItems];
}

/**
 * 检查集合中是否有可播放的项目
 * 遍历项目数组,检查是否至少有一个项目可以播放
 * @param {Array} items - 项目数组
 * @returns {boolean} 如果至少有一个项目可播放则返回 true,否则返回 false
 */
function canPlaySomeItemInCollection(items) {
    let i = 0;

    for (let length = items.length; i < length; i++) {
        if (playbackManager.canPlay(items[i])) {
            return true;
        }
    }

    return false;
}

/**
 * 渲染集合中的项目
 * 按类型分组显示集合中的项目,并为每个容器设置刷新回调
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} parentItem - 父级集合项目对象
 * @param {Array} types - 类型定义数组,每个类型包含 name 和 type/mediaType
 * @param {Array} items - 集合中的项目数组
 */
function renderCollectionItems(page, parentItem, types, items) {
    page.querySelector('.collectionItems').classList.remove('hide');
    page.querySelector('.collectionItems').innerHTML = '';

    if (!items.length) {
        renderCollectionItemType(page, parentItem, {
            name: globalize.translate('Items')
        }, items);
    } else {
        let typeItems = [];
        let otherTypeItems = items;

        for (const type of types) {
            [typeItems, otherTypeItems] = filterItemsByCollectionItemType(otherTypeItems, type);

            if (typeItems.length) {
                renderCollectionItemType(page, parentItem, type, typeItems);
            }
        }

        if (otherTypeItems.length) {
            const otherType = {
                name: globalize.translate('HeaderOtherItems')
            };
            renderCollectionItemType(page, parentItem, otherType, otherTypeItems);
        }
    }

    const containers = page.querySelectorAll('.collectionItemsContainer');

    const notifyRefreshNeeded = function () {
        renderChildren(page, parentItem);
    };

    for (const container of containers) {
        container.notifyRefreshNeeded = notifyRefreshNeeded;
    }

    // if nothing in the collection can be played hide play and shuffle buttons
    if (!canPlaySomeItemInCollection(items)) {
        hideAll(page, 'btnPlay', false);
        hideAll(page, 'btnShuffle', false);
    }

    // HACK: Call autoFocuser again because btnPlay may be hidden, but focused by reloadFromItem
    // FIXME: Sometimes focus does not move until all (?) sections are loaded
    autoFocus(page);
}

/**
 * 渲染集合中特定类型的项目
 * 为集合中的特定类型项目创建卡片布局并添加到页面
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} parentItem - 父级集合项目对象
 * @param {Object} type - 类型信息对象,包含 name、type 和 mediaType
 * @param {Array} items - 该类型的项目数组
 */
function renderCollectionItemType(page, parentItem, type, items) {
    let html = '';
    html += '<div class="verticalSection">';
    html += '<div class="sectionTitleContainer sectionTitleContainer-cards padded-left">';
    html += '<h2 class="sectionTitle sectionTitle-cards">';
    html += '<span>' + type.name + '</span>';
    html += '</h2>';
    html += '</div>';
    html += '<div is="emby-itemscontainer" class="itemsContainer collectionItemsContainer vertical-wrap padded-left padded-right">';
    const shape = type.type == 'MusicAlbum' ? getSquareShape(false) : getPortraitShape(false);
    html += cardBuilder.getCardsHtml({
        items: items,
        shape: shape,
        showTitle: true,
        showYear: type.mediaType === 'Video' || type.type === 'Series' || type.type === 'Movie',
        centerText: true,
        lazy: true,
        showDetailsMenu: true,
        overlayMoreButton: true,
        showAddToCollection: false,
        showRemoveFromCollection: true,
        collectionId: parentItem.Id
    });
    html += '</div>';
    html += '</div>';
    const collectionItems = page.querySelector('.collectionItems');
    collectionItems.insertAdjacentHTML('beforeend', html);
    imageLoader.lazyChildren(collectionItems.lastChild);
}

/**
 * 渲染音乐视频列表
 * 显示与音乐艺术家或音乐专辑相关的音乐视频
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 音乐项目对象（MusicArtist 或 MusicAlbum）
 * @param {Object} user - 用户对象
 */
function renderMusicVideos(page, item, user) {
    const request = {
        SortBy: 'SortName',
        SortOrder: 'Ascending',
        IncludeItemTypes: 'MusicVideo',
        Recursive: true,
        Fields: 'PrimaryImageAspectRatio,CanDelete,MediaSourceCount'
    };

    if (item.Type == 'MusicAlbum') {
        request.AlbumIds = item.Id;
    } else {
        request.ArtistIds = item.Id;
    }

    ServerConnections.getApiClient(item.ServerId).getItems(user.Id, request).then(function (result) {
        if (result.Items.length) {
            page.querySelector('#musicVideosCollapsible').classList.remove('hide');
            const musicVideosContent = page.querySelector('#musicVideosContent');
            musicVideosContent.innerHTML = getVideosHtml(result.Items);
            imageLoader.lazyChildren(musicVideosContent);
        } else {
            page.querySelector('#musicVideosCollapsible').classList.add('hide');
        }
    });
}

/**
 * 渲染额外的视频部分
 * 显示多部分视频的其他部分（如电影的多个文件）
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 * @param {Object} user - 用户对象
 */
function renderAdditionalParts(page, item, user) {
    ServerConnections.getApiClient(item.ServerId).getAdditionalVideoParts(user.Id, item.Id).then(function (result) {
        if (result.Items.length) {
            page.querySelector('#additionalPartsCollapsible').classList.remove('hide');
            const additionalPartsContent = page.querySelector('#additionalPartsContent');
            additionalPartsContent.innerHTML = getVideosHtml(result.Items);
            imageLoader.lazyChildren(additionalPartsContent);
        } else {
            page.querySelector('#additionalPartsCollapsible').classList.add('hide');
        }
    });
}

/**
 * 渲染场景/章节信息
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 */
function renderScenes(page, item) {
    let chapters = item.Chapters || [];

    if (chapters.length && !chapters[0].ImageTag) {
        chapters = [];
    }

    if (chapters.length) {
        page.querySelector('#scenesCollapsible').classList.remove('hide');
        const scenesContent = page.querySelector('#scenesContent');

        import('../../components/cardbuilder/chaptercardbuilder').then(({ default: chaptercardbuilder }) => {
            chaptercardbuilder.buildChapterCards(item, chapters, {
                itemsContainer: scenesContent,
                backdropShape: 'overflowBackdrop',
                squareShape: 'overflowSquare',
                imageBlurhashes: item.ImageBlurHashes
            });
        });
    } else {
        page.querySelector('#scenesCollapsible').classList.add('hide');
    }
}

/**
 * 生成视频项目的 HTML
 * @param {Array} items - 视频项目数组
 * @returns {string} 卡片 HTML 字符串
 */
function getVideosHtml(items) {
    return cardBuilder.getCardsHtml({
        items: items,
        shape: 'autooverflow',
        showTitle: true,
        action: 'play',
        overlayText: false,
        centerText: true,
        showRuntime: true
    });
}

/**
 * 渲染特别内容/花絮
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 * @param {Object} user - 用户对象
 */
function renderSpecials(page, item, user) {
    ServerConnections.getApiClient(item.ServerId).getSpecialFeatures(user.Id, item.Id).then(function (specials) {
        const specialsContent = page.querySelector('#specialsContent');
        specialsContent.innerHTML = getVideosHtml(specials);
        imageLoader.lazyChildren(specialsContent);
    });
}

/**
 * 渲染演员表
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 * @param {Array} people - 演员列表
 */
function renderCast(page, item, people) {
    if (!people.length) {
        page.querySelector('#castCollapsible').classList.add('hide');
        return;
    }

    page.querySelector('#castCollapsible').classList.remove('hide');
    const castContent = page.querySelector('#castContent');

    import('../../components/cardbuilder/peoplecardbuilder').then(({ default: peoplecardbuilder }) => {
        peoplecardbuilder.buildPeopleCards(people, {
            itemsContainer: castContent,
            coverImage: true,
            serverId: item.ServerId,
            shape: 'overflowPortrait',
            imageBlurhashes: item.ImageBlurHashes
        });
    });
}

/**
 * 渲染客串演员
 * @param {HTMLElement} page - 页面容器元素
 * @param {Object} item - 媒体项目对象
 * @param {Array} people - 客串演员列表
 */
function renderGuestCast(page, item, people) {
    if (!people.length) {
        page.querySelector('#guestCastCollapsible').classList.add('hide');
        return;
    }

    page.querySelector('#guestCastCollapsible').classList.remove('hide');
    const guestCastContent = page.querySelector('#guestCastContent');

    import('../../components/cardbuilder/peoplecardbuilder').then(({ default: peoplecardbuilder }) => {
        peoplecardbuilder.buildPeopleCards(people, {
            itemsContainer: guestCastContent,
            coverImage: true,
            serverId: item.ServerId,
            shape: 'overflowPortrait',
            imageBlurhashes: item.ImageBlurHashes
        });
    });
}

/**
 * 项目详情页面类
 * 用于管理项目详情页面的公共方法
 * @constructor
 */
function ItemDetailPage() {
    const self = this;
    self.setInitialCollapsibleState = setInitialCollapsibleState;
    self.renderDetails = renderDetails;
    self.renderCast = renderCast;
    self.renderGuestCast = renderGuestCast;
}

/**
 * 为指定选择器的所有元素绑定事件
 * @param {HTMLElement} view - 视图容器元素
 * @param {string} selector - CSS 选择器
 * @param {string} eventName - 事件名称
 * @param {Function} fn - 事件处理函数
 */
function bindAll(view, selector, eventName, fn) {
    const elems = view.querySelectorAll(selector);

    for (const elem of elems) {
        elem.addEventListener(eventName, fn);
    }
}

/**
 * 轨道选择表单提交事件处理
 * 阻止表单的默认提交行为，避免页面刷新
 * @param {Event} e - 表单提交事件对象
 * @returns {boolean} 始终返回 false 以阻止默认行为
 */
function onTrackSelectionsSubmit(e) {
    e.preventDefault();
    return false;
}

window.ItemDetailPage = new ItemDetailPage();

/**
 * 项目详情页面控制器的默认导出
 * @param {HTMLElement} view - 页面视图元素
 * @param {Object} params - 路由参数对象
 * @returns {void}
 */
export default function (view, params) {
    /**
     * 获取 API 客户端实例
     * @returns {Object} API 客户端
     */
    function getApiClient() {
        return params.serverId ? ServerConnections.getApiClient(params.serverId) : ApiClient;
    }

    /**
     * 重新加载页面数据
     * @param {Object} instance - 控制器实例
     * @param {HTMLElement} page - 页面容器元素
     * @param {Object} pageParams - 页面参数
     */
    function reload(instance, page, pageParams) {
        loading.show();

        const apiClient = getApiClient();

        Promise.all([getPromise(apiClient, pageParams), apiClient.getCurrentUser()]).then(([item, user]) => {
            currentItem = item;
            reloadFromItem(instance, page, pageParams, item, user);
        }).catch((error) => {
            console.error('failed to get item or current user: ', error);
        });
    }

    /**
     * 分离媒体版本
     * 将组合的媒体源分离成单独的项目
     * @param {Object} instance - 控制器实例
     * @param {HTMLElement} page - 页面容器元素
     * @param {Object} apiClient - API 客户端实例
     * @param {Object} pageParams - 页面参数
     */
    function splitVersions(instance, page, apiClient, pageParams) {
        confirm('Are you sure you wish to split the media sources into separate items?', 'Split Media Apart').then(function () {
            loading.show();
            apiClient.ajax({
                type: 'DELETE',
                url: apiClient.getUrl('Videos/' + pageParams.id + '/AlternateSources')
            }).then(function () {
                loading.hide();
                reload(instance, page, pageParams);
            });
        });
    }

    /**
     * 获取播放选项配置
     * 从页面上的选择器中获取媒体源、音轨、字幕等播放设置
     * @param {number} startPosition - 播放起始位置（以 ticks 为单位）
     * @returns {Object} 播放选项对象，包含媒体源ID、音轨索引、字幕索引等
     */
    function getPlayOptions(startPosition) {
        const audioStreamIndex = view.querySelector('.selectAudio').value || null;
        return {
            startPositionTicks: startPosition,
            mediaSourceId: view.querySelector('.selectSource').value,
            audioStreamIndex: audioStreamIndex,
            subtitleStreamIndex: view.querySelector('.selectSubtitles').value
        };
    }

    /**
     * 播放项目
     * @param {Object} item - 媒体项目对象
     * @param {number} startPosition - 开始播放位置（ticks）
     */
    function playItem(item, startPosition) {
        const playOptions = getPlayOptions(startPosition);
        playOptions.items = [item];
        playbackManager.play(playOptions);
    }

    /**
     * 播放预告片
     */
    function playTrailer() {
        playbackManager.playTrailers(currentItem);
    }

    /**
     * 播放当前项目
     * @param {HTMLElement} button - 触发播放的按钮元素
     * @param {string} mode - 播放模式（'resume' 表示继续播放）
     */
    function playCurrentItem(button, mode) {
        const item = currentItem;

        if (item.Type === 'Program') {
            const apiClient = ServerConnections.getApiClient(item.ServerId);
            apiClient.getLiveTvChannel(item.ChannelId, apiClient.getCurrentUserId()).then(function (channel) {
                playbackManager.play({
                    items: [channel]
                });
            });
            return;
        }

        playItem(item, item.UserData && mode === 'resume' ? item.UserData.PlaybackPositionTicks : 0);
    }

    /**
     * 播放按钮点击事件处理
     * 获取按钮的 data-action 属性并执行相应的播放操作
     */
    function onPlayClick() {
        let actionElem = this;
        let action = actionElem.getAttribute('data-action');

        if (!action) {
            actionElem = actionElem.querySelector('[data-action]') || actionElem;
            action = actionElem.getAttribute('data-action');
        }

        playCurrentItem(actionElem, action);
    }

    /**
     * 即时混音按钮点击事件处理
     * 基于当前项目创建即时混音播放列表
     */
    function onInstantMixClick() {
        playbackManager.instantMix(currentItem);
    }

    /**
     * 随机播放按钮点击事件处理
     * 随机播放当前项目的内容
     */
    function onShuffleClick() {
        playbackManager.shuffle(currentItem);
    }

    /**
     * 取消系列定时器按钮点击事件处理
     * 取消电视剧集的录制定时器并返回直播电视页面
     */
    function onCancelSeriesTimerClick() {
        import('../../components/recordingcreator/recordinghelper').then(({ default: recordingHelper }) => {
            recordingHelper.cancelSeriesTimerWithConfirmation(currentItem.Id, currentItem.ServerId).then(function () {
                Dashboard.navigate('livetv');
            });
        });
    }

    /**
     * 取消定时器按钮点击事件处理
     * 取消单个录制定时器并重新加载页面
     */
    function onCancelTimerClick() {
        import('../../components/recordingcreator/recordinghelper').then(({ default: recordingHelper }) => {
            recordingHelper.cancelTimer(ServerConnections.getApiClient(currentItem.ServerId), currentItem.TimerId).then(function () {
                reload(self, view, params);
            });
        });
    }

    /**
     * 播放预告片按钮点击事件处理
     */
    function onPlayTrailerClick() {
        playTrailer();
    }

    /**
     * 下载按钮点击事件处理
     * 下载当前媒体项目到本地设备
     */
    function onDownloadClick() {
        const downloadHref = getApiClient().getItemDownloadUrl(currentItem.Id);
        download([{
            url: downloadHref,
            item: currentItem,
            itemId: currentItem.Id,
            serverId: currentItem.ServerId,
            title: currentItem.Name,
            filename: currentItem.Path.replace(/^.*[\\/]/, '')
        }]);
    }

    /**
     * 更多命令按钮点击事件处理
     * 显示上下文菜单并处理用户选择的操作结果
     * - 如果项目被删除，导航到父级项目或首页
     * - 如果项目被更新，重新加载当前页面
     */
    function onMoreCommandsClick() {
        const button = this;
        let selectedItem = view.querySelector('.selectSource').value || currentItem.Id;

        const apiClient = getApiClient();

        apiClient.getItem(apiClient.getCurrentUserId(), selectedItem).then(function (item) {
            selectedItem = item;

            apiClient.getCurrentUser().then(function (user) {
                itemContextMenu.show(getContextMenuOptions(selectedItem, user, button))
                    .then(function (result) {
                        if (result.deleted) {
                            const parentId = selectedItem.SeasonId || selectedItem.SeriesId || selectedItem.ParentId;

                            if (parentId) {
                                appRouter.showItem(parentId, item.ServerId);
                            } else {
                                appRouter.goHome();
                            }
                        } else if (result.updated) {
                            reload(self, view, params);
                        }
                    })
                    .catch(() => { /* no-op */ });
            });
        });
    }

    /**
     * 播放器变化事件处理
     * 当播放器状态改变时更新轨道选择和预告片按钮的可见性
     */
    function onPlayerChange() {
        renderTrackSelections(view, self, currentItem);
        setTrailerButtonVisibility(view, currentItem);
    }

    /**
     * WebSocket 消息处理
     * 监听用户数据变化并更新页面
     * @param {Event} e - 事件对象
     * @param {Object} data - 消息数据
     */
    function onWebSocketMessage(e, data) {
        const msg = data;
        const apiClient = getApiClient();

        if (msg.MessageType === 'UserDataChanged' && currentItem && msg.Data.UserId == apiClient.getCurrentUserId()) {
            const key = currentItem.UserData.Key;
            const userData = msg.Data.UserDataList.filter(function (u) {
                return u.Key == key;
            })[0];

            if (userData) {
                currentItem.UserData = userData;
                reloadPlayButtons(view, currentItem);
                autoFocus(view);
            }
        }
    }

    let currentItem;
    const self = this;

    /**
     * 初始化页面
     * 设置事件监听器和视图生命周期事件
     */
    function init() {
        const apiClient = getApiClient();

        bindAll(view, '.btnPlay', 'click', onPlayClick);
        bindAll(view, '.btnReplay', 'click', onPlayClick);
        bindAll(view, '.btnInstantMix', 'click', onInstantMixClick);
        bindAll(view, '.btnShuffle', 'click', onShuffleClick);
        bindAll(view, '.btnPlayTrailer', 'click', onPlayTrailerClick);
        bindAll(view, '.btnCancelSeriesTimer', 'click', onCancelSeriesTimerClick);
        bindAll(view, '.btnCancelTimer', 'click', onCancelTimerClick);
        bindAll(view, '.btnDownload', 'click', onDownloadClick);
        view.querySelector('.trackSelections').addEventListener('submit', onTrackSelectionsSubmit);
        view.querySelector('.btnSplitVersions').addEventListener('click', function () {
            splitVersions(self, view, apiClient, params);
        });
        bindAll(view, '.btnMoreCommands', 'click', onMoreCommandsClick);
        view.querySelector('.selectSource').addEventListener('change', function () {
            renderVideoSelections(view, self._currentPlaybackMediaSources);
            renderAudioSelections(view, self._currentPlaybackMediaSources);
            renderSubtitleSelections(view, self._currentPlaybackMediaSources);
            updateMiscInfo();
        });
        view.addEventListener('viewshow', function (e) {
            const page = this;

            libraryMenu.setTransparentMenu(!layoutManager.mobile);

            if (e.detail.isRestored) {
                if (currentItem) {
                    libraryMenu.setTitle('');
                    renderTrackSelections(page, self, currentItem, true);
                    renderBackdrop(page, currentItem);
                }
            } else {
                reload(self, page, params);
            }

            Events.on(apiClient, 'message', onWebSocketMessage);
            Events.on(playbackManager, 'playerchange', onPlayerChange);

            itemShortcuts.on(view.querySelector('.nameContainer'));
        });
        view.addEventListener('viewbeforehide', function () {
            itemShortcuts.off(view.querySelector('.nameContainer'));
            Events.off(apiClient, 'message', onWebSocketMessage);
            Events.off(playbackManager, 'playerchange', onPlayerChange);
            libraryMenu.setTransparentMenu(false);
        });
        view.addEventListener('viewdestroy', function () {
            currentItem = null;
            self._currentPlaybackMediaSources = null;
            self.currentRecordingFields = null;
        });
    }

    /**
     * 更新媒体信息
     * 根据选中的媒体源更新技术信息
     */
    function updateMiscInfo() {
        const selectedMediaSource = getSelectedMediaSource(view, self._currentPlaybackMediaSources);
        renderMiscInfo(view, {
            // patch currentItem (primary item) with details from the selected MediaSource:
            ...currentItem,
            ...selectedMediaSource
        });
    }

    init();
}
