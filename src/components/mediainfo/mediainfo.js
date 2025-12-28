/**
 * 媒体信息组件
 * 用于显示媒体项的各种信息，包括评分、时长、年份等
 */

import escapeHtml from 'escape-html';
import datetime from '../../scripts/datetime';
import globalize from '../../lib/globalize';
import { appRouter } from '../router/appRouter';
import itemHelper from '../itemHelper';
import indicators from '../indicators/indicators';
import 'material-design-icons-iconfont';
import './mediainfo.scss';
import '../guide/programs.scss';
import '../../elements/emby-button/emby-button';
import * as userSettings from '../../scripts/settings/userSettings';

/**
 * 获取定时器指示器图标
 * @param {Object} item - 媒体项对象
 * @returns {string} HTML 字符串形式的定时器图标
 */
function getTimerIndicator(item) {
    let status;

    if (item.Type === 'SeriesTimer') {
        return '<span class="material-icons mediaInfoItem mediaInfoIconItem mediaInfoTimerIcon fiber_smart_record" aria-hidden="true"></span>';
    } else if (item.TimerId || item.SeriesTimerId) {
        status = item.Status || 'Cancelled';
    } else if (item.Type === 'Timer') {
        status = item.Status;
    } else {
        return '';
    }

    if (item.SeriesTimerId) {
        if (status !== 'Cancelled') {
            return '<span class="material-icons mediaInfoItem mediaInfoIconItem mediaInfoTimerIcon fiber_smart_record" aria-hidden="true"></span>';
        }

        return '<span class="material-icons mediaInfoItem mediaInfoIconItem fiber_smart_record" aria-hidden="true"></span>';
    }

    return '<span class="material-icons mediaInfoItem mediaInfoIconItem mediaInfoTimerIcon fiber_manual_record" aria-hidden="true"></span>';
}

/**
 * 获取电视节目信息的 HTML
 * @param {Object} item - 节目项对象
 * @param {Object} options - 显示选项
 * @returns {string} HTML 字符串
 */
function getProgramInfoHtml(item, options) {
    let html = '';

    const miscInfo = [];
    let text;
    let date;

    // 显示节目开始和结束时间
    if (item.StartDate && options.programTime !== false) {
        try {
            text = '';

            date = datetime.parseISO8601Date(item.StartDate);

            if (options.startDate !== false) {
                text += datetime.toLocaleDateString(date, { weekday: 'short', month: 'short', day: 'numeric' });
            }

            text += ` ${datetime.getDisplayTime(date)}`;

            if (item.EndDate) {
                date = datetime.parseISO8601Date(item.EndDate);
                text += ` - ${datetime.getDisplayTime(date)}`;
            }

            miscInfo.push(text);
        } catch (e) {
            console.error('error parsing date:', item.StartDate, e);
        }
    }

    // 显示频道号
    if (item.ChannelNumber) {
        miscInfo.push(`CH ${item.ChannelNumber}`);
    }

    // 显示频道名称
    if (item.ChannelName) {
        if (options.interactive && item.ChannelId) {
            miscInfo.push({
                html: `<a is="emby-linkbutton" class="button-flat mediaInfoItem" href="${appRouter.getRouteUrl({

                    ServerId: item.ServerId,
                    Type: 'TvChannel',
                    Name: item.ChannelName,
                    Id: item.ChannelId

                })}">${escapeHtml(item.ChannelName)}</a>`
            });
        } else {
            miscInfo.push(escapeHtml(item.ChannelName));
        }
    }

    // 显示定时器指示器
    if (options.timerIndicator !== false) {
        const timerHtml = getTimerIndicator(item);
        if (timerHtml) {
            miscInfo.push({
                html: timerHtml
            });
        }
    }

    html += miscInfo.map(m => {
        return getMediaInfoItem(m);
    }).join('');

    return html;
}

/**
 * 获取媒体信息的 HTML
 * @param {Object} item - 媒体项对象
 * @param {Object} options - 显示选项配置
 * @returns {string} HTML 字符串
 */
export function getMediaInfoHtml(item, options = {}) {
    let html = '';

    const miscInfo = [];
    let text;
    let date;
    let count;

    // 判断是否显示文件夹运行时长（适用于音乐专辑、播放列表等）
    const showFolderRuntime = item.Type === 'MusicAlbum' || item.MediaType === 'MusicArtist' || item.Type === 'Playlist' || item.MediaType === 'Playlist' || item.MediaType === 'MusicGenre';

    if (showFolderRuntime) {
        count = item.SongCount || item.ChildCount;

        if (count) {
            miscInfo.push(globalize.translate('TrackCount', count));
        }

        if (item.RunTimeTicks) {
            miscInfo.push(datetime.getDisplayDuration(item.RunTimeTicks));
        }
    } else if (item.Type === 'PhotoAlbum' || item.Type === 'BoxSet') {
        count = item.ChildCount;

        if (count) {
            miscInfo.push(globalize.translate('ItemCount', count));
        }
    }

    // 显示原始播出日期（适用于剧集和照片）
    if ((item.Type === 'Episode' || item.MediaType === 'Photo')
            && options.originalAirDate !== false
            && item.PremiereDate
    ) {
        try {
            // 如果是剧集，不要将日期转换为本地时区，因为只存储日期（不包含时间）
            //don't modify date to locale if episode. Only Dates (not times) are stored, or editable in the edit metadata dialog
            date = datetime.parseISO8601Date(item.PremiereDate, item.Type !== 'Episode');

            text = datetime.toLocaleDateString(date);
            miscInfo.push(text);
        } catch (e) {
            console.error('error parsing date:', item.PremiereDate, e);
        }
    }

    // 系列定时器的录制信息
    if (item.Type === 'SeriesTimer') {
        if (item.RecordAnyTime) {
            miscInfo.push(globalize.translate('Anytime'));
        } else {
            miscInfo.push(datetime.getDisplayTime(item.StartDate));
        }

        if (item.RecordAnyChannel) {
            miscInfo.push(globalize.translate('AllChannels'));
        } else {
            miscInfo.push(item.ChannelName || globalize.translate('OneChannel'));
        }
    }

    if (item.StartDate && item.Type !== 'Program' && item.Type !== 'SeriesTimer' && item.Type !== 'Timer') {
        try {
            date = datetime.parseISO8601Date(item.StartDate);

            text = datetime.toLocaleDateString(date);
            miscInfo.push(text);

            if (item.Type !== 'Recording') {
                text = datetime.getDisplayTime(date);
                miscInfo.push(text);
            }
        } catch (e) {
            console.error('error parsing date:', item.StartDate, e);
        }
    }

    // 显示系列的年份范围
    if (options.year !== false && item.ProductionYear && item.Type === 'Series') {
        if (item.Status === 'Continuing') {
            // 系列仍在继续
            miscInfo.push(globalize.translate('SeriesYearToPresent', datetime.toLocaleString(item.ProductionYear, { useGrouping: false })));
        } else if (item.ProductionYear) {
            text = datetime.toLocaleString(item.ProductionYear, { useGrouping: false });

            if (item.EndDate) {
                try {
                    const endYear = datetime.toLocaleString(datetime.parseISO8601Date(item.EndDate).getFullYear(), { useGrouping: false });
                    /* At this point, text will contain only the start year */
                    if (endYear !== text) {
                        text += ` - ${endYear}`;
                    }
                } catch (e) {
                    console.error('error parsing date:', item.EndDate, e);
                }
            }

            miscInfo.push(text);
        }
    }

    if (item.Type === 'Program' || item.Type === 'Timer') {
        let program = item;
        if (item.Type === 'Timer') {
            program = item.ProgramInfo;
        }

        // 显示节目指示器（直播、首映、新剧集、重播）
        if (options.programIndicator !== false) {
            if (program.IsLive && userSettings.get('guide-indicator-live') === 'true') {
                miscInfo.push({
                    html: `<div class="mediaInfoProgramAttribute mediaInfoItem liveTvProgram">${globalize.translate('Live')}</div>`
                });
            } else if (program.IsPremiere && userSettings.get('guide-indicator-premiere') === 'true') {
                miscInfo.push({
                    html: `<div class="mediaInfoProgramAttribute mediaInfoItem premiereTvProgram">${globalize.translate('Premiere')}</div>`
                });
            } else if (program.IsSeries && !program.IsRepeat && userSettings.get('guide-indicator-new') === 'true') {
                miscInfo.push({
                    html: `<div class="mediaInfoProgramAttribute mediaInfoItem newTvProgram">${globalize.translate('New')}</div>`
                });
            } else if (program.IsSeries && program.IsRepeat && userSettings.get('guide-indicator-repeat') === 'true') {
                miscInfo.push({
                    html: `<div class="mediaInfoProgramAttribute mediaInfoItem repeatTvProgram">${globalize.translate('Repeat')}</div>`
                });
            }
        }

        if ((program.IsSeries || program.EpisodeTitle) && options.episodeTitle !== false) {
            text = itemHelper.getDisplayName(program, {
                includeIndexNumber: options.episodeTitleIndexNumber
            });

            if (text) {
                miscInfo.push(escapeHtml(text));
            }
        } else if (program.IsMovie && program.ProductionYear && options.originalAirDate !== false) {
            miscInfo.push(program.ProductionYear);
        } else if (program.PremiereDate && options.originalAirDate !== false) {
            try {
                date = datetime.parseISO8601Date(program.PremiereDate);
                text = globalize.translate('OriginalAirDateValue', datetime.toLocaleDateString(date));
                miscInfo.push(text);
            } catch (e) {
                console.error('error parsing date:', program.PremiereDate, e);
            }
        } else if (program.ProductionYear && options.year !== false ) {
            miscInfo.push(program.ProductionYear);
        }
    }

    if (options.year !== false && item.Type !== 'Series' && item.Type !== 'Episode' && item.Type !== 'Person'
            && item.MediaType !== 'Photo' && item.Type !== 'Program' && item.Type !== 'Season'
    ) {
        if (item.ProductionYear) {
            miscInfo.push(item.ProductionYear);
        } else if (item.PremiereDate) {
            try {
                text = datetime.toLocaleString(datetime.parseISO8601Date(item.PremiereDate).getFullYear(), { useGrouping: false });
                miscInfo.push(text);
            } catch (e) {
                console.error('error parsing date:', item.PremiereDate, e);
            }
        }
    }

    // 显示运行时长
    if (item.RunTimeTicks && item.Type !== 'Series' && item.Type !== 'Program' && item.Type !== 'Timer' && item.Type !== 'Book' && !showFolderRuntime && options.runtime !== false) {
        if (item.Type === 'Audio') {
            miscInfo.push(datetime.getDisplayRunningTime(item.RunTimeTicks));
        } else {
            miscInfo.push(datetime.getDisplayDuration(item.RunTimeTicks));
        }
    }

    // 显示官方评级
    if (options.officialRating !== false && item.OfficialRating && item.Type !== 'Season' && item.Type !== 'Episode') {
        miscInfo.push({
            text: item.OfficialRating,
            cssClass: 'mediaInfoText mediaInfoOfficialRating'
        });
    }

    // 显示 3D 格式标识
    if (item.Video3DFormat) {
        miscInfo.push('3D');
    }

    if (item.MediaType === 'Photo' && item.Width && item.Height) {
        miscInfo.push(`${item.Width}x${item.Height}`);
    }

    if (options.container !== false && item.Type === 'Audio' && item.Container) {
        miscInfo.push(item.Container);
    }

    html += miscInfo.map(m => {
        return getMediaInfoItem(m);
    }).join('');

    // 显示星级评分
    if (options.starRating !== false) {
        html += getStarIconsHtml(item);
    }

    // 显示字幕标识
    if (item.HasSubtitles && options.subtitles !== false) {
        html += '<div class="mediaInfoItem mediaInfoText closedCaptionMediaInfoText">CC</div>';
    }

    // 显示评论家评分（根据分数显示不同样式）
    if (item.CriticRating && options.criticRating !== false) {
        if (item.CriticRating >= 60) {
            html += `<div class="mediaInfoItem mediaInfoCriticRating mediaInfoCriticRatingFresh">${item.CriticRating}</div>`;
        } else {
            html += `<div class="mediaInfoItem mediaInfoCriticRating mediaInfoCriticRatingRotten">${item.CriticRating}</div>`;
        }
    }

    if (options.endsAt !== false) {
        const endsAt = getEndsAt(item);
        if (endsAt) {
            html += getMediaInfoItem(endsAt, 'endsAt');
        }
    }

    html += indicators.getMissingIndicator(item);

    return html;
}

/**
 * 获取媒体结束时间
 * @param {Object} item - 媒体项对象
 * @returns {string|null} 格式化的结束时间文本
 */
export function getEndsAt(item) {
    if (item.MediaType === 'Video' && item.RunTimeTicks && !item.StartDate) {
        let endDate = new Date().getTime() + (item.RunTimeTicks / 10000);
        endDate = new Date(endDate);

        const displayTime = datetime.getDisplayTime(endDate);
        return globalize.translate('EndsAtValue', displayTime);
    }

    return null;
}

/**
 * 根据当前播放位置计算结束时间
 * @param {number} runtimeTicks - 总运行时长（ticks）
 * @param {number} positionTicks - 当前播放位置（ticks）
 * @param {number} playbackRate - 播放速率
 * @param {boolean} includeText - 是否包含文本前缀
 * @returns {string} 格式化的结束时间
 */
export function getEndsAtFromPosition(runtimeTicks, positionTicks, playbackRate, includeText) {
    let endDate = new Date().getTime() + (1 / playbackRate) * ((runtimeTicks - (positionTicks || 0)) / 10000);
    endDate = new Date(endDate);

    const displayTime = datetime.getDisplayTime(endDate);

    if (includeText === false) {
        return displayTime;
    }
    return globalize.translate('EndsAtValue', displayTime);
}

/**
 * 创建单个媒体信息项的 HTML
 * @param {string|Object} m - 媒体信息文本或对象
 * @param {string} cssClass - CSS 类名
 * @returns {string} HTML 字符串
 */
function getMediaInfoItem(m, cssClass) {
    cssClass = cssClass ? (`${cssClass} mediaInfoItem`) : 'mediaInfoItem';
    let mediaInfoText = m;

    if (typeof (m) !== 'string' && typeof (m) !== 'number') {
        if (m.html) {
            return m.html;
        }
        mediaInfoText = m.text;
        cssClass += ` ${m.cssClass}`;
    }
    return `<div class="${cssClass}">${mediaInfoText}</div>`;
}

/**
 * 获取星级评分的 HTML
 * @param {Object} item - 媒体项对象
 * @returns {string} HTML 字符串
 */
function getStarIconsHtml(item) {
    let html = '';

    if (item.CommunityRating) {
        html += '<div class="starRatingContainer mediaInfoItem">';

        html += '<span class="material-icons starIcon star" aria-hidden="true"></span>';
        html += item.CommunityRating.toFixed(1);
        html += '</div>';
    }

    return html;
}

/**
 * 动态更新结束时间显示
 * @param {HTMLElement} elem - 要更新的元素
 * @param {Object} item - 媒体项对象
 */
function dynamicEndTime(elem, item) {
    const interval = setInterval(() => {
        if (!document.body.contains(elem)) {
            clearInterval(interval);
            return;
        }

        elem.innerHTML = getEndsAt(item);
    }, 60000); // 每分钟更新一次
}

/**
 * 填充主要媒体信息到元素
 * @param {HTMLElement} elem - 目标元素
 * @param {Object} item - 媒体项对象
 * @param {Object} options - 显示选项
 */
export function fillPrimaryMediaInfo(elem, item, options) {
    const html = getPrimaryMediaInfoHtml(item, options);

    elem.innerHTML = html;
    afterFill(elem, item, options);
}

/**
 * 填充次要媒体信息到元素
 * @param {HTMLElement} elem - 目标元素
 * @param {Object} item - 媒体项对象
 * @param {Object} options - 显示选项
 */
export function fillSecondaryMediaInfo(elem, item, options) {
    const html = getSecondaryMediaInfoHtml(item, options);

    elem.innerHTML = html;
    afterFill(elem, item, options);
}

/**
 * 填充完成后的处理函数
 * @param {HTMLElement} elem - 目标元素
 * @param {Object} item - 媒体项对象
 * @param {Object} options - 显示选项
 */
function afterFill(elem, item, options) {
    if (options.endsAt !== false) {
        const endsAtElem = elem.querySelector('.endsAt');
        if (endsAtElem) {
            dynamicEndTime(endsAtElem, item);
        }
    }

    const lnkChannel = elem.querySelector('.lnkChannel');
    if (lnkChannel) {
        lnkChannel.addEventListener('click', onChannelLinkClick);
    }
}

/**
 * 处理频道链接点击事件
 * @param {Event} e - 点击事件对象
 */
function onChannelLinkClick(e) {
    const channelId = this.getAttribute('data-id');
    const serverId = this.getAttribute('data-serverid');

    appRouter.showItem(channelId, serverId);

    e.preventDefault();
    return false;
}

/**
 * 获取主要媒体信息的 HTML
 * @param {Object} item - 媒体项对象
 * @param {Object} options - 显示选项（默认为非交互式）
 * @returns {string} HTML 字符串
 */
export function getPrimaryMediaInfoHtml(item, options = {}) {
    if (options.interactive === undefined) {
        options.interactive = false;
    }

    return getMediaInfoHtml(item, options);
}

/**
 * 获取次要媒体信息的 HTML
 * @param {Object} item - 媒体项对象
 * @param {Object} options - 显示选项
 * @returns {string} HTML 字符串
 */
export function getSecondaryMediaInfoHtml(item, options) {
    options = options || {};
    if (options.interactive == null) {
        options.interactive = false;
    }
    if (item.Type === 'Program') {
        return getProgramInfoHtml(item, options);
    }

    return '';
}

/**
 * 根据视频宽高获取分辨率文本
 * @param {Object} i - 包含 Width、Height 和 IsInterlaced 属性的对象
 * @returns {string|null} 分辨率文本（如 '1080p', '720i' 等）
 */
export function getResolutionText(i) {
    const width = i.Width;
    const height = i.Height;

    if (width && height) {
        if (width >= 3800 || height >= 2000) {
            return '4K';
        }
        if (width >= 2500 || height >= 1400) {
            if (i.IsInterlaced) {
                return '1440i';
            }
            return '1440p';
        }
        if (width >= 1800 || height >= 1000) {
            if (i.IsInterlaced) {
                return '1080i';
            }
            return '1080p';
        }
        if (width >= 1200 || height >= 700) {
            if (i.IsInterlaced) {
                return '720i';
            }
            return '720p';
        }
        if (width >= 700 || height >= 400) {
            if (i.IsInterlaced) {
                return '480i';
            }
            return '480p';
        }
    }
    return null;
}

/**
 * 获取用于显示的音频流
 * @param {Object} item - 媒体项对象
 * @returns {Object|null} 音频流对象
 */
function getAudioStreamForDisplay(item) {
    if (!item.MediaSources) {
        return null;
    }

    const mediaSource = item.MediaSources[0];
    if (!mediaSource) {
        return null;
    }

    return (mediaSource.MediaStreams || []).filter(i => {
        return i.Type === 'Audio' && (i.Index === mediaSource.DefaultAudioStreamIndex || mediaSource.DefaultAudioStreamIndex == null);
    })[0];
}

/**
 * 获取媒体统计信息
 * @param {Object} item - 媒体项对象
 * @returns {Array} 媒体统计信息数组
 */
export function getMediaInfoStats(item) {
    const list = [];

    const mediaSource = (item.MediaSources || [])[0] || {};

    const videoStream = (mediaSource.MediaStreams || []).filter(i => {
        return i.Type === 'Video';
    })[0] || {};
    const audioStream = getAudioStreamForDisplay(item) || {};

    if (item.VideoType === 'Dvd') {
        list.push({
            type: 'mediainfo',
            text: 'Dvd'
        });
    }

    if (item.VideoType === 'BluRay') {
        list.push({
            type: 'mediainfo',
            text: 'BluRay'
        });
    }

    const resolutionText = getResolutionText(videoStream);
    if (resolutionText) {
        list.push({
            type: 'mediainfo',
            text: resolutionText
        });
    }

    if (videoStream.Codec) {
        list.push({
            type: 'mediainfo',
            text: videoStream.Codec
        });
    }

    // 根据音频声道数确定声道文本
    const channels = audioStream.Channels;
    let channelText;

    if (channels === 8) {
        channelText = '7.1';
    } else if (channels === 7) {
        channelText = '6.1';
    } else if (channels === 6) {
        channelText = '5.1';
    } else if (channels === 2) {
        channelText = '2.0';
    }

    if (channelText) {
        list.push({
            type: 'mediainfo',
            text: channelText
        });
    }

    const audioCodec = (audioStream.Codec || '').toLowerCase();

    if ((audioCodec === 'dca' || audioCodec === 'dts') && audioStream.Profile) {
        list.push({
            type: 'mediainfo',
            text: audioStream.Profile
        });
    } else if (audioStream.Codec) {
        list.push({
            type: 'mediainfo',
            text: audioStream.Codec
        });
    }

    // 显示添加日期
    if (item.DateCreated && itemHelper.enableDateAddedDisplay(item)) {
        const dateCreated = datetime.parseISO8601Date(item.DateCreated);

        list.push({
            type: 'added',
            text: globalize.translate('AddedOnValue', `${datetime.toLocaleDateString(dateCreated)} ${datetime.getDisplayTime(dateCreated)}`)
        });
    }

    return list;
}

/**
 * 导出媒体信息相关的函数集合
 */
export default {
    getMediaInfoHtml: getPrimaryMediaInfoHtml,
    getEndsAt: getEndsAt,
    getEndsAtFromPosition: getEndsAtFromPosition,
    getPrimaryMediaInfoHtml: getPrimaryMediaInfoHtml,
    getSecondaryMediaInfoHtml: getSecondaryMediaInfoHtml,
    fillPrimaryMediaInfo: fillPrimaryMediaInfo,
    fillSecondaryMediaInfo: fillSecondaryMediaInfo,
    getMediaInfoStats: getMediaInfoStats,
    getResolutionText: getResolutionText
};
