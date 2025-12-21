/**
 * @fileoverview Jellyfin 播放管理器
 *
 * 核心播放控制模块,负责管理所有媒体播放功能:
 * - 播放器生命周期管理(初始化、切换、销毁)
 * - 播放队列管理(添加、删除、移动、排序)
 * - 媒体流控制(音频轨、字幕轨、码率调整)
 * - 播放状态同步(进度上报、状态追踪)
 * - 转码决策(直接播放、直接流、转码)
 * - 全屏控制、画中画、AirPlay 支持
 * - 音量控制、播放速率、亮度调整
 * - 媒体段跳过(片头、片尾、广告)
 * - 多设备播放支持(本地播放器、远程播放器)
 *
 * @module playbackmanager
 */

import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind.js';
import { PlaybackErrorCode } from '@jellyfin/sdk/lib/generated-client/models/playback-error-code.js';
import { getMediaInfoApi } from '@jellyfin/sdk/lib/utils/api/media-info-api';
import { MediaType } from '@jellyfin/sdk/lib/generated-client/models/media-type';
import merge from 'lodash-es/merge';
import Screenfull from 'screenfull';

import Events from '../../utils/events.ts';
import datetime from '../../scripts/datetime';
import appSettings from '../../scripts/settings/appSettings';
import itemHelper from '../itemHelper';
import { pluginManager } from '../pluginManager';
import PlayQueueManager from './playqueuemanager';
import * as userSettings from '../../scripts/settings/userSettings';
import globalize from '../../lib/globalize';
import loading from '../loading/loading';
import { appHost } from '../apphost';
import alert from '../alert';
import { PluginType } from '../../types/plugin.ts';
import { includesAny } from '../../utils/container.ts';
import { getItems } from '../../utils/jellyfin-apiclient/getItems.ts';
import { getItemBackdropImageUrl } from '../../utils/jellyfin-apiclient/backdropImage';

import { PlayerEvent } from 'apps/stable/features/playback/constants/playerEvent';
import { bindMediaSegmentManager } from 'apps/stable/features/playback/utils/mediaSegmentManager';
import { bindMediaSessionSubscriber } from 'apps/stable/features/playback/utils/mediaSessionSubscriber';
import { AppFeature } from 'constants/appFeature';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { MediaError } from 'types/mediaError';
import { getMediaError } from 'utils/mediaError';
import { toApi } from 'utils/jellyfin-apiclient/compat';
import { bindSkipSegment } from './skipsegment.ts';

/**
 * 无限制项目数量标记
 * 当设置为 -1 时,表示不限制查询返回的项目数量
 */
const UNLIMITED_ITEMS = -1;

/**
 * 判断是否启用本地播放列表管理
 *
 * @param {Object} player - 播放器实例
 * @returns {boolean} 如果播放器自己实现了播放列表管理则返回 false,本地播放器返回 true
 */
function enableLocalPlaylistManagement(player) {
    if (player.getPlaylist) {
        return false;
    }

    return player.isLocalPlayer;
}

/**
 * 检查播放器是否支持物理音量控制
 *
 * @param {Object} player - 播放器实例
 * @returns {boolean} 本地播放器且设备支持物理音量控制时返回 true
 */
function supportsPhysicalVolumeControl(player) {
    return player.isLocalPlayer && appHost.supports(AppFeature.PhysicalVolumeControl);
}

/**
 * 绑定全屏状态变化事件
 *
 * 监听浏览器的全屏状态变化,并触发播放器的 fullscreenchange 事件
 * 兼容标准 Screenfull API 和 iOS Safari 的 webkit 全屏 API
 *
 * @param {Object} player - 播放器实例
 */
function bindToFullscreenChange(player) {
    if (Screenfull.isEnabled) {
        Screenfull.on('change', function () {
            Events.trigger(player, 'fullscreenchange');
        });
    } else {
        // iOS Safari
        document.addEventListener('webkitfullscreenchange', function () {
            Events.trigger(player, 'fullscreenchange');
        }, false);
    }
}

/**
 * 触发播放器切换事件
 *
 * @param {PlaybackManager} playbackManagerInstance - 播放管理器实例
 * @param {Object} newPlayer - 新播放器实例
 * @param {Object} newTarget - 新目标设备信息
 * @param {Object} previousPlayer - 之前的播放器实例
 * @param {Object} previousTargetInfo - 之前的目标设备信息
 */
function triggerPlayerChange(playbackManagerInstance, newPlayer, newTarget, previousPlayer, previousTargetInfo) {
    if (!newPlayer && !previousPlayer) {
        return;
    }

    if (newTarget && previousTargetInfo && newTarget.id === previousTargetInfo.id) {
        return;
    }

    Events.trigger(playbackManagerInstance, 'playerchange', [newPlayer, newTarget, previousPlayer]);
}

/**
 * 向服务器报告播放状态
 *
 * @param {PlaybackManager} playbackManagerInstance - 播放管理器实例
 * @param {Object} state - 播放状态对象
 * @param {Object} player - 播放器实例
 * @param {boolean} reportPlaylist - 是否上报播放列表信息
 * @param {string} serverId - 服务器 ID
 * @param {string} method - API 方法名(reportPlaybackStart/reportPlaybackProgress/reportPlaybackStopped)
 * @param {string} progressEventName - 进度事件名称
 */
function reportPlayback(playbackManagerInstance, state, player, reportPlaylist, serverId, method, progressEventName) {
    if (!serverId) {
        // Not a server item
        // We can expand on this later and possibly report them
        Events.trigger(playbackManagerInstance, 'reportplayback', [false]);
        return;
    }

    const info = Object.assign({}, state.PlayState);
    info.ItemId = state.NowPlayingItem.Id;

    if (progressEventName) {
        info.EventName = progressEventName;
    }

    if (reportPlaylist) {
        addPlaylistToPlaybackReport(playbackManagerInstance, info, player, serverId);
    }

    const apiClient = ServerConnections.getApiClient(serverId);
    const reportPlaybackPromise = apiClient[method](info);
    // Notify that report has been sent
    reportPlaybackPromise.then(() => {
        Events.trigger(playbackManagerInstance, 'reportplayback', [true]);
    });
}

/**
 * 同步获取播放列表
 *
 * @param {PlaybackManager} playbackManagerInstance - 播放管理器实例
 * @param {Object} player - 播放器实例
 * @returns {Array} 播放列表项数组
 */
function getPlaylistSync(playbackManagerInstance, player) {
    player = player || playbackManagerInstance._currentPlayer;
    if (player && !enableLocalPlaylistManagement(player)) {
        return player.getPlaylistSync();
    }

    return playbackManagerInstance._playQueueManager.getPlaylist();
}

/**
 * 将播放列表信息添加到播放报告中
 *
 * @param {PlaybackManager} playbackManagerInstance - 播放管理器实例
 * @param {Object} info - 播放报告信息对象
 * @param {Object} player - 播放器实例
 * @param {string} serverId - 服务器 ID
 */
function addPlaylistToPlaybackReport(playbackManagerInstance, info, player, serverId) {
    info.NowPlayingQueue = getPlaylistSync(playbackManagerInstance, player).map(function (i) {
        const itemInfo = {
            Id: i.Id,
            PlaylistItemId: i.PlaylistItemId
        };

        if (i.ServerId !== serverId) {
            itemInfo.ServerId = i.ServerId;
        }

        return itemInfo;
    });
}

/**
 * 标准化名称(转小写并移除空格)
 *
 * @param {string} t - 待标准化的文本
 * @returns {string} 标准化后的名称
 */
function normalizeName(t) {
    return t.toLowerCase().replace(' ', '');
}

/**
 * 获取用于播放的媒体项目列表
 *
 * @param {string} serverId - 服务器 ID
 * @param {Object} query - 查询参数对象
 * @returns {Promise} 返回包含媒体项目的 Promise
 */
function getItemsForPlayback(serverId, query) {
    const apiClient = ServerConnections.getApiClient(serverId);

    if (query.Ids && query.Ids.split(',').length === 1) {
        const itemId = query.Ids.split(',');

        return apiClient.getItem(apiClient.getCurrentUserId(), itemId).then(function (item) {
            return {
                Items: [item],
                TotalRecordCount: 1
            };
        });
    } else {
        if (query.Limit === UNLIMITED_ITEMS) {
            delete query.Limit;
        } else {
            query.Limit = query.Limit || 300;
        }
        query.Fields = ['Chapters', 'Trickplay'];
        query.ExcludeLocationTypes = 'Virtual';
        query.EnableTotalRecordCount = false;
        query.CollapseBoxSetItems = false;

        return getItems(apiClient, apiClient.getCurrentUserId(), query);
    }
}

/**
 * 从 URL 项目创建流信息对象
 *
 * @param {Object} item - 媒体项目对象
 * @returns {Object} 流信息对象,包含 URL、播放方法等
 */
function createStreamInfoFromUrlItem(item) {
    // Check item.Path for games
    return {
        url: item.Url || item.Path,
        playMethod: 'DirectPlay',
        item: item,
        textTracks: [],
        mediaType: item.MediaType
    };
}

/**
 * 合并播放查询参数
 *
 * @param {Object} obj1 - 第一个查询对象
 * @param {Object} obj2 - 第二个查询对象
 * @returns {Object} 合并后的查询对象
 */
function mergePlaybackQueries(obj1, obj2) {
    const query = merge({}, obj1, obj2);

    const filters = query.Filters ? query.Filters.split(',') : [];
    if (filters.indexOf('IsNotFolder') === -1) {
        filters.push('IsNotFolder');
    }
    query.Filters = filters.join(',');
    return query;
}

/**
 * 根据媒体类型和容器格式获取 MIME 类型
 *
 * @param {string} type - 媒体类型(audio/video)
 * @param {string} container - 容器格式(如 opus, webma, mkv, mp4 等)
 * @returns {string} MIME 类型字符串
 */
function getMimeType(type, container) {
    container = (container || '').toLowerCase();

    if (type === 'audio') {
        if (container === 'opus') {
            return 'audio/ogg';
        }
        if (container === 'webma') {
            return 'audio/webm';
        }
        if (container === 'm4a') {
            return 'audio/mp4';
        }
    } else if (type === 'video') {
        if (container === 'mkv') {
            return 'video/x-matroska';
        }
        if (container === 'm4v') {
            return 'video/mp4';
        }
        if (container === 'mov') {
            return 'video/quicktime';
        }
        if (container === 'mpg') {
            return 'video/mpeg';
        }
        if (container === 'flv') {
            return 'video/x-flv';
        }
    }

    return type + '/' + container;
}

function getParam(name, url) {
    // eslint-disable-next-line sonarjs/single-char-in-character-classes
    name = name.replace(/[[]/, '\\[').replace(/[\]]/, '\\]');
    const regexS = '[\\?&]' + name + '=([^&#]*)';
    const regex = new RegExp(regexS, 'i');

    const results = regex.exec(url);
    if (results == null) {
        return '';
    } else {
        return decodeURIComponent(results[1].replace(/\+/g, ' '));
    }
}

/**
 * 判断是否为自动播放器(本地播放器)
 *
 * @param {Object} player - 播放器实例
 * @returns {boolean} 是否为本地播放器
 */
function isAutomaticPlayer(player) {
    return player.isLocalPlayer;
}

/**
 * 获取自动播放器列表
 *
 * @param {PlaybackManager} instance - 播放管理器实例
 * @param {boolean} forceLocalPlayer - 是否强制使用本地播放器
 * @returns {Array} 播放器数组
 */
function getAutomaticPlayers(instance, forceLocalPlayer) {
    if (!forceLocalPlayer) {
        const player = instance._currentPlayer;
        if (player && !isAutomaticPlayer(player)) {
            return [player];
        }
    }

    return instance.getPlayers().filter(isAutomaticPlayer);
}

/**
 * 判断是否为服务器项目(通过检查是否有 ID)
 *
 * @param {Object} item - 媒体项目对象
 * @returns {boolean} 是否为服务器项目
 */
function isServerItem(item) {
    return !!item.Id;
}

/**
 * 判断是否启用片头播放
 *
 * @param {Object} item - 媒体项目对象
 * @returns {boolean} 是否应该播放片头
 */
function enableIntros(item) {
    if (item.MediaType !== 'Video') {
        return false;
    }
    if (item.Type === 'TvChannel') {
        return false;
    }
    // disable for in-progress recordings
    if (item.Status === 'InProgress') {
        return false;
    }

    return isServerItem(item);
}

/**
 * 获取媒体项目的片头列表
 *
 * @param {Object} firstItem - 第一个媒体项目
 * @param {Object} apiClient - API 客户端实例
 * @param {Object} options - 播放选项
 * @returns {Promise} 返回片头列表的 Promise
 */
function getIntros(firstItem, apiClient, options) {
    if (options.startPositionTicks || options.startIndex || options.fullscreen === false || !enableIntros(firstItem) || !userSettings.enableCinemaMode()) {
        return Promise.resolve({
            Items: []
        });
    }

    return apiClient.getIntros(firstItem.Id).then(function (result) {
        return result;
    }, function () {
        return Promise.resolve({
            Items: []
        });
    });
}

/**
 * 从设备配置文件中提取音频的最大值限制
 *
 * @param {Object} deviceProfile - 设备配置文件
 * @returns {Object} 包含 maxAudioSampleRate、maxAudioBitDepth、maxAudioBitrate 的对象
 */
function getAudioMaxValues(deviceProfile) {
    // TODO - this could vary per codec and should be done on the server using the entire profile
    let maxAudioSampleRate = null;
    let maxAudioBitDepth = null;
    let maxAudioBitrate = null;

    deviceProfile.CodecProfiles.forEach(codecProfile => {
        if (codecProfile.Type === 'Audio') {
            (codecProfile.Conditions || []).forEach(condition => {
                if (condition.Condition === 'LessThanEqual' && condition.Property === 'AudioBitDepth') {
                    maxAudioBitDepth = condition.Value;
                } else if (condition.Condition === 'LessThanEqual' && condition.Property === 'AudioSampleRate') {
                    maxAudioSampleRate = condition.Value;
                } else if (condition.Condition === 'LessThanEqual' && condition.Property === 'AudioBitrate') {
                    maxAudioBitrate = condition.Value;
                }
            });
        }
    });

    return {
        maxAudioSampleRate: maxAudioSampleRate,
        maxAudioBitDepth: maxAudioBitDepth,
        maxAudioBitrate: maxAudioBitrate
    };
}

/** 播放会话起始时间戳,用于生成唯一的播放会话 ID */
let startingPlaySession = new Date().getTime();

/**
 * 获取音频流 URL
 *
 * @param {Object} item - 媒体项目对象
 * @param {Object} transcodingProfile - 转码配置
 * @param {string} directPlayContainers - 支持直接播放的容器格式
 * @param {Object} apiClient - API 客户端实例
 * @param {number} startPosition - 起始位置(ticks)
 * @param {Object} maxValues - 最大值限制对象
 * @returns {string} 音频流 URL
 */
function getAudioStreamUrl(item, transcodingProfile, directPlayContainers, apiClient, startPosition, maxValues) {
    const url = 'Audio/' + item.Id + '/universal';

    startingPlaySession++;
    return apiClient.getUrl(url, {
        UserId: apiClient.getCurrentUserId(),
        DeviceId: apiClient.deviceId(),
        MaxStreamingBitrate: maxValues.maxAudioBitrate || maxValues.maxBitrate,
        Container: directPlayContainers,
        TranscodingContainer: transcodingProfile.Container || null,
        TranscodingProtocol: transcodingProfile.Protocol || null,
        AudioCodec: transcodingProfile.AudioCodec,
        MaxAudioSampleRate: maxValues.maxAudioSampleRate,
        MaxAudioBitDepth: maxValues.maxAudioBitDepth,
        api_key: apiClient.accessToken(),
        PlaySessionId: startingPlaySession,
        StartTimeTicks: startPosition || 0,
        EnableRedirection: true,
        EnableRemoteMedia: appHost.supports(AppFeature.RemoteAudio),
        EnableAudioVbrEncoding: transcodingProfile.EnableAudioVbrEncoding
    });
}

/**
 * 根据设备配置文件获取音频流 URL
 *
 * @param {Object} item - 媒体项目对象
 * @param {Object} deviceProfile - 设备配置文件
 * @param {number} maxBitrate - 最大码率
 * @param {Object} apiClient - API 客户端实例
 * @param {number} startPosition - 起始位置(ticks)
 * @returns {string} 音频流 URL
 */
function getAudioStreamUrlFromDeviceProfile(item, deviceProfile, maxBitrate, apiClient, startPosition) {
    const transcodingProfile = deviceProfile.TranscodingProfiles.filter(function (p) {
        return p.Type === 'Audio' && p.Context === 'Streaming';
    })[0];

    let directPlayContainers = '';

    deviceProfile.DirectPlayProfiles.forEach(p => {
        if (p.Type === 'Audio') {
            if (directPlayContainers) {
                directPlayContainers += ',' + p.Container;
            } else {
                directPlayContainers = p.Container;
            }

            if (p.AudioCodec) {
                directPlayContainers += '|' + p.AudioCodec;
            }
        }
    });

    const maxValues = getAudioMaxValues(deviceProfile);

    return getAudioStreamUrl(item, transcodingProfile, directPlayContainers, apiClient, startPosition, { maxBitrate, ...maxValues });
}

/**
 * 获取多个项目的流 URL 列表
 *
 * @param {Array} items - 媒体项目数组
 * @param {Object} deviceProfile - 设备配置文件
 * @param {number} maxBitrate - 最大码率
 * @param {Object} apiClient - API 客户端实例
 * @param {number} startPosition - 起始位置(ticks)
 * @returns {Promise<Array>} 流 URL 数组的 Promise
 */
function getStreamUrls(items, deviceProfile, maxBitrate, apiClient, startPosition) {
    const audioTranscodingProfile = deviceProfile.TranscodingProfiles.filter(function (p) {
        return p.Type === 'Audio' && p.Context === 'Streaming';
    })[0];

    let audioDirectPlayContainers = '';

    deviceProfile.DirectPlayProfiles.forEach(p => {
        if (p.Type === 'Audio') {
            if (audioDirectPlayContainers) {
                audioDirectPlayContainers += ',' + p.Container;
            } else {
                audioDirectPlayContainers = p.Container;
            }

            if (p.AudioCodec) {
                audioDirectPlayContainers += '|' + p.AudioCodec;
            }
        }
    });

    const maxValues = getAudioMaxValues(deviceProfile);

    const streamUrls = [];

    for (let i = 0, length = items.length; i < length; i++) {
        const item = items[i];
        let streamUrl;

        if (item.MediaType === 'Audio' && !itemHelper.isLocalItem(item)) {
            streamUrl = getAudioStreamUrl(item, audioTranscodingProfile, audioDirectPlayContainers, apiClient, startPosition, { maxBitrate, ...maxValues });
        }

        streamUrls.push(streamUrl || '');

        if (i === 0) {
            startPosition = 0;
        }
    }

    return Promise.resolve(streamUrls);
}

/**
 * 设置流URL到项目
 *
 * 为每个项目预设媒体源和流URL
 *
 * @param {Array} items - 项目数组
 * @param {Object} deviceProfile - 设备配置
 * @param {number} maxBitrate - 最大码率
 * @param {Object} apiClient - API客户端
 * @param {number} startPosition - 起始位置
 * @returns {Promise} Promise
 */
function setStreamUrls(items, deviceProfile, maxBitrate, apiClient, startPosition) {
    return getStreamUrls(items, deviceProfile, maxBitrate, apiClient, startPosition).then(function (streamUrls) {
        for (let i = 0, length = items.length; i < length; i++) {
            const item = items[i];
            const streamUrl = streamUrls[i];

            if (streamUrl) {
                item.PresetMediaSource = {
                    StreamUrl: streamUrl,
                    Id: item.Id,
                    MediaStreams: [],
                    RunTimeTicks: item.RunTimeTicks
                };
            }
        }
    });
}

/**
 * 获取播放信息
 *
 * 从服务器获取播放信息,包括:
 * - 媒体源信息
 * - 流URL
 * - 转码参数
 * - 直播流ID
 *
 * @param {Object} player - 播放器实例
 * @param {Object} apiClient - API客户端
 * @param {Object} item - 媒体项目
 * @param {Object} deviceProfile - 设备配置
 * @param {string} mediaSourceId - 媒体源ID
 * @param {string} liveStreamId - 直播流ID
 * @param {Object} options - 选项对象
 * @returns {Promise<Object>} 播放信息Promise
 */
async function getPlaybackInfo(player, apiClient, item, deviceProfile, mediaSourceId, liveStreamId, options) {
    if (!itemHelper.isLocalItem(item) && item.MediaType === 'Audio' && !player.useServerPlaybackInfoForAudio) {
        return {
            MediaSources: [
                {
                    StreamUrl: getAudioStreamUrlFromDeviceProfile(item, deviceProfile, options.maxBitrate, apiClient, options.startPosition),
                    Id: item.Id,
                    MediaStreams: [],
                    RunTimeTicks: item.RunTimeTicks
                }]
        };
    }

    if (item.PresetMediaSource) {
        return {
            MediaSources: [item.PresetMediaSource]
        };
    }

    const itemId = item.Id;

    const query = {
        UserId: apiClient.getCurrentUserId(),
        StartTimeTicks: options.startPosition || 0
    };

    const api = toApi(apiClient);
    const mediaInfoApi = getMediaInfoApi(api);

    if (options.isPlayback) {
        query.IsPlayback = true;
        query.AutoOpenLiveStream = true;
    } else {
        query.IsPlayback = false;
        query.AutoOpenLiveStream = false;
    }

    if (options.audioStreamIndex != null) {
        query.AudioStreamIndex = options.audioStreamIndex;
    }
    if (options.subtitleStreamIndex != null) {
        query.SubtitleStreamIndex = options.subtitleStreamIndex;
    }
    if (options.secondarySubtitleStreamIndex != null) {
        query.SecondarySubtitleStreamIndex = options.secondarySubtitleStreamIndex;
    }
    if (options.enableDirectPlay != null) {
        query.EnableDirectPlay = options.enableDirectPlay;
    }
    if (options.enableDirectStream != null) {
        query.EnableDirectStream = options.enableDirectStream;
    }
    if (options.allowVideoStreamCopy != null) {
        query.AllowVideoStreamCopy = options.allowVideoStreamCopy;
    }
    if (options.allowAudioStreamCopy != null) {
        query.AllowAudioStreamCopy = options.allowAudioStreamCopy;
    }
    if (mediaSourceId) {
        query.MediaSourceId = mediaSourceId;
    }
    if (liveStreamId) {
        query.LiveStreamId = liveStreamId;
    }
    if (options.maxBitrate) {
        query.MaxStreamingBitrate = options.maxBitrate;
    }
    if (player.enableMediaProbe && !player.enableMediaProbe(item)) {
        query.EnableMediaProbe = false;
    }

    // lastly, enforce player overrides for special situations
    if (query.EnableDirectStream !== false
        && player.supportsPlayMethod && !player.supportsPlayMethod('DirectStream', item)
    ) {
        query.EnableDirectStream = false;
    }

    if (player.getDirectPlayProtocols) {
        query.DirectPlayProtocols = player.getDirectPlayProtocols();
    }

    query.AlwaysBurnInSubtitleWhenTranscoding = appSettings.alwaysBurnInSubtitleWhenTranscoding();

    query.DeviceProfile = deviceProfile;

    const res = await mediaInfoApi.getPostedPlaybackInfo({ itemId: itemId, playbackInfoDto: query });
    return res.data;
}

/**
 * 获取最优媒体源
 *
 * 从多个媒体源版本中选择最优的:
 * 1. 优先支持直接播放的
 * 2. 其次支持直接串流的
 * 3. 最后支持转码的
 * 4. 都不支持则返回第一个
 *
 * @param {Object} apiClient - API客户端
 * @param {Object} item - 媒体项目
 * @param {Array} versions - 媒体源版本数组
 * @returns {Promise<Object>} 最优媒体源Promise
 */
function getOptimalMediaSource(apiClient, item, versions) {
    const promises = versions.map(function (v) {
        return supportsDirectPlay(apiClient, item, v);
    });

    if (!promises.length) {
        return Promise.reject();
    }

    return Promise.all(promises).then(function (results) {
        for (let i = 0, length = versions.length; i < length; i++) {
            versions[i].enableDirectPlay = results[i] || false;
        }
        let optimalVersion = versions.filter(function (v) {
            return v.enableDirectPlay;
        })[0];

        if (!optimalVersion) {
            optimalVersion = versions.filter(function (v) {
                return v.SupportsDirectStream;
            })[0];
        }

        optimalVersion = optimalVersion || versions.filter(function (s) {
            return s.SupportsTranscoding;
        })[0];

        return optimalVersion || versions[0];
    });
}

/**
 * 获取直播流
 *
 * 打开一个新的直播流会话(用于直播电视、转码流等)
 *
 * @param {Object} player - 播放器实例
 * @param {Object} apiClient - API客户端
 * @param {Object} item - 媒体项目
 * @param {string} playSessionId - 播放会话ID
 * @param {Object} deviceProfile - 设备配置
 * @param {Object} mediaSource - 媒体源对象
 * @param {Object} options - 选项对象
 * @returns {Promise} 直播流Promise
 */
function getLiveStream(player, apiClient, item, playSessionId, deviceProfile, mediaSource, options) {
    const postData = {
        DeviceProfile: deviceProfile,
        OpenToken: mediaSource.OpenToken
    };

    const query = {
        UserId: apiClient.getCurrentUserId(),
        StartTimeTicks: options.startPosition || 0,
        ItemId: item.Id,
        PlaySessionId: playSessionId
    };

    if (options.maxBitrate) {
        query.MaxStreamingBitrate = options.maxBitrate;
    }
    if (options.audioStreamIndex != null) {
        query.AudioStreamIndex = options.audioStreamIndex;
    }
    if (options.subtitleStreamIndex != null) {
        query.SubtitleStreamIndex = options.subtitleStreamIndex;
    }

    // lastly, enforce player overrides for special situations
    if (query.EnableDirectStream !== false
        && player.supportsPlayMethod && !player.supportsPlayMethod('DirectStream', item)
    ) {
        query.EnableDirectStream = false;
    }

    return apiClient.ajax({
        url: apiClient.getUrl('LiveStreams/Open', query),
        type: 'POST',
        data: JSON.stringify(postData),
        contentType: 'application/json',
        dataType: 'json'

    });
}

/**
 * 检查主机是否可达
 *
 * 判断媒体源的主机是否可以访问:
 * - 远程源总是可达
 * - 本地网络内可达
 * - localhost/127.0.0.1只在同一机器上可达
 *
 * @param {Object} mediaSource - 媒体源对象
 * @param {Object} apiClient - API客户端
 * @returns {Promise<boolean>} 是否可达的Promise
 */
function isHostReachable(mediaSource, apiClient) {
    if (mediaSource.IsRemote) {
        return Promise.resolve(true);
    }

    return apiClient.getEndpointInfo().then(function (endpointInfo) {
        if (endpointInfo.IsInNetwork) {
            if (!endpointInfo.IsLocal) {
                const path = (mediaSource.Path || '').toLowerCase();
                if (path.indexOf('localhost') !== -1 || path.indexOf('127.0.0.1') !== -1) {
                    // This will only work if the app is on the same machine as the server
                    return Promise.resolve(false);
                }
            }

            return Promise.resolve(true);
        }

        // media source is in network, but connection is out of network
        return Promise.resolve(false);
    });
}

/**
 * 检查是否支持直接播放
 *
 * 判断媒体源是否可以直接播放(不需要转码):
 * - 检查媒体源标志
 * - 检查文件夹翻录(蓝光/DVD)
 * - 检查远程视频支持
 * - 检查HTTP协议和主机可达性
 *
 * @param {Object} apiClient - API客户端
 * @param {Object} item - 媒体项目
 * @param {Object} mediaSource - 媒体源对象
 * @returns {Promise<boolean>} 是否支持直接播放的Promise
 */
function supportsDirectPlay(apiClient, item, mediaSource) {
    // folder rip hacks due to not yet being supported by the stream building engine
    const isFolderRip = mediaSource.VideoType === 'BluRay' || mediaSource.VideoType === 'Dvd' || mediaSource.VideoType === 'HdDvd';

    if (mediaSource.SupportsDirectPlay || isFolderRip) {
        if (mediaSource.IsRemote && !appHost.supports(AppFeature.RemoteVideo)) {
            return Promise.resolve(false);
        }

        if (mediaSource.Protocol === 'Http' && !mediaSource.RequiredHttpHeaders.length) {
            // If this is the only way it can be played, then allow it
            if (!mediaSource.SupportsDirectStream && !mediaSource.SupportsTranscoding) {
                return Promise.resolve(true);
            } else {
                return isHostReachable(mediaSource, apiClient);
            }
        }
    }

    return Promise.resolve(false);
}

/**
 * 验证播放信息结果
 *
 * 检查播放信息是否包含错误,如果有则显示错误消息
 *
 * @param {PlaybackManager} instance - PlaybackManager实例
 * @param {import('@jellyfin/sdk/lib/generated-client/index.js').PlaybackInfoResponse} result - 播放信息响应
 * @returns {boolean} 是否有效(无错误)
 */
function validatePlaybackInfoResult(instance, result) {
    if (result.ErrorCode) {
        // NOTE: To avoid needing to retranslate the "NoCompatibleStream" message,
        // we need to keep the key in the same format.
        const errMessage = result.ErrorCode === PlaybackErrorCode.NoCompatibleStream ?
            'PlaybackErrorNoCompatibleStream' : `PlaybackError.${result.ErrorCode}`;
        showPlaybackInfoErrorMessage(instance, errMessage);
        return false;
    }

    return true;
}

/**
 * 显示播放信息错误消息
 *
 * 以对话框形式显示本地化的错误消息
 *
 * @param {PlaybackManager} instance - PlaybackManager实例
 * @param {string} errorCode - 错误代码
 */
function showPlaybackInfoErrorMessage(instance, errorCode) {
    alert({
        text: globalize.translate(errorCode),
        title: globalize.translate('HeaderPlaybackError')
    });
}

/**
 * 规范化播放选项
 *
 * 设置播放选项的默认值(fullscreen默认为true)
 *
 * @param {Object} playOptions - 播放选项对象
 */
function normalizePlayOptions(playOptions) {
    playOptions.fullscreen = playOptions.fullscreen !== false;
}

/**
 * 截断播放选项
 *
 * 只保留必要的播放选项字段,用于传递给下一个播放项
 *
 * @param {Object} playOptions - 完整的播放选项
 * @returns {Object} 精简的播放选项
 */
function truncatePlayOptions(playOptions) {
    return {
        fullscreen: playOptions.fullscreen,
        mediaSourceId: playOptions.mediaSourceId,
        audioStreamIndex: playOptions.audioStreamIndex,
        subtitleStreamIndex: playOptions.subtitleStreamIndex,
        startPositionTicks: playOptions.startPositionTicks
    };
}

/**
 * 获取用于上报的正在播放项目
 *
 * 创建项目副本并更新运行时长和媒体流信息
 *
 * @param {Object} player - 播放器实例
 * @param {Object} item - 媒体项目
 * @param {Object} mediaSource - 媒体源对象
 * @returns {Object} 用于上报的项目对象
 */
function getNowPlayingItemForReporting(player, item, mediaSource) {
    const nowPlayingItem = Object.assign({}, item);

    if (mediaSource) {
        nowPlayingItem.RunTimeTicks = mediaSource.RunTimeTicks;
        nowPlayingItem.MediaStreams = mediaSource.MediaStreams;

        // not needed
        nowPlayingItem.MediaSources = null;
    }

    nowPlayingItem.RunTimeTicks = nowPlayingItem.RunTimeTicks || player.duration() * 10000;

    return nowPlayingItem;
}

/**
 * 判断播放器是否单独显示
 *
 * 非本地播放器(如远程播放器)需要单独显示
 *
 * @param {Object} player - 播放器实例
 * @returns {boolean} 是否单独显示
 */
function displayPlayerIndividually(player) {
    return !player.isLocalPlayer;
}

/**
 * 创建播放器目标对象
 *
 * 将播放器信息转换为目标对象格式
 *
 * @param {PlaybackManager} instance - PlaybackManager实例
 * @param {Object} player - 播放器实例
 * @returns {Object} 目标对象
 */
function createTarget(instance, player) {
    return {
        name: player.name,
        id: player.id,
        playerName: player.name,
        playableMediaTypes: ['Audio', 'Video', 'Photo', 'Book'].map(player.canPlayMediaType),
        isLocalPlayer: player.isLocalPlayer,
        supportedCommands: instance.getSupportedCommands(player)
    };
}

/**
 * 获取播放器目标列表
 *
 * 如果播放器有getTargets方法则调用,否则创建默认目标
 *
 * @param {Object} player - 播放器实例
 * @returns {Promise<Array>} 目标列表Promise
 */
function getPlayerTargets(player) {
    if (player.getTargets) {
        return player.getTargets();
    }

    return Promise.resolve([createTarget(player)]);
}

/**
 * 排序播放器目标
 *
 * 按照本地播放器优先,然后按名称排序
 *
 * @param {Object} a - 目标A
 * @param {Object} b - 目标B
 * @returns {number} 比较结果
 */
function sortPlayerTargets(a, b) {
    let aVal = a.isLocalPlayer ? 0 : 1;
    let bVal = b.isLocalPlayer ? 0 : 1;

    aVal = aVal.toString() + a.name;
    bVal = bVal.toString() + b.name;

    return aVal.localeCompare(bVal);
}

export class PlaybackManager {
    constructor() {
        const self = this;

        const players = [];
        let currentTargetInfo;
        let currentPairingId = null;

        this._playNextAfterEnded = true;
        const playerStates = {};

        this._playQueueManager = new PlayQueueManager();

        /**
         * 获取当前播放的媒体项目
         *
         * @param {Object} player - 播放器实例
         * @returns {Object|null} 当前播放的项目对象
         */
        self.currentItem = function (player) {
            if (!player) {
                throw new Error('player cannot be null');
            }

            if (player.currentItem) {
                return player.currentItem();
            }

            const data = getPlayerData(player);
            return data.streamInfo ? data.streamInfo.item : null;
        };

        /**
         * 获取当前媒体源
         *
         * @param {Object} player - 播放器实例
         * @returns {Object|null} 当前媒体源对象
         */
        self.currentMediaSource = function (player) {
            if (!player) {
                throw new Error('player cannot be null');
            }

            if (player.currentMediaSource) {
                return player.currentMediaSource();
            }

            const data = getPlayerData(player);
            return data.streamInfo ? data.streamInfo.mediaSource : null;
        };

        /**
         * 获取播放方法(DirectPlay/DirectStream/Transcode)
         *
         * @param {Object} player - 播放器实例
         * @returns {string|null} 播放方法
         */
        self.playMethod = function (player) {
            if (!player) {
                throw new Error('player cannot be null');
            }

            if (player.playMethod) {
                return player.playMethod();
            }

            const data = getPlayerData(player);
            return data.streamInfo ? data.streamInfo.playMethod : null;
        };

        /**
         * 获取播放会话 ID
         *
         * @param {Object} player - 播放器实例
         * @returns {string|null} 播放会话 ID
         */
        self.playSessionId = function (player) {
            if (!player) {
                throw new Error('player cannot be null');
            }

            if (player.playSessionId) {
                return player.playSessionId();
            }

            const data = getPlayerData(player);
            return data.streamInfo ? data.streamInfo.playSessionId : null;
        };

        /**
         * 获取当前播放器信息
         *
         * @returns {Object|null} 播放器信息对象(包含名称、是否本地、设备信息等)
         */
        self.getPlayerInfo = function () {
            const player = self._currentPlayer;

            if (!player) {
                return null;
            }

            const target = currentTargetInfo || {};

            return {
                name: player.name,
                isLocalPlayer: player.isLocalPlayer,
                id: target.id,
                deviceName: target.deviceName,
                playableMediaTypes: target.playableMediaTypes,
                supportedCommands: target.supportedCommands
            };
        };

        /**
         * 设置活动播放器
         *
         * @param {Object|string} player - 播放器实例或播放器名称
         * @param {Object} targetInfo - 目标设备信息
         */
        self.setActivePlayer = function (player, targetInfo) {
            if (player === 'localplayer' || player.name === 'localplayer') {
                if (self._currentPlayer?.isLocalPlayer) {
                    return;
                }
                setCurrentPlayerInternal(null, null);
                return;
            }

            if (typeof (player) === 'string') {
                player = players.filter(function (p) {
                    return p.name === player;
                })[0];
            }

            if (!player) {
                throw new Error('null player');
            }

            setCurrentPlayerInternal(player, targetInfo);
        };

        /**
         * 尝试设置活动播放器(带配对流程)
         *
         * @param {Object|string} player - 播放器实例或播放器名称
         * @param {Object} targetInfo - 目标设备信息
         */
        self.trySetActivePlayer = function (player, targetInfo) {
            if (player === 'localplayer' || player.name === 'localplayer') {
                if (self._currentPlayer?.isLocalPlayer) {
                    return;
                }
                return;
            }

            if (typeof (player) === 'string') {
                player = players.filter(function (p) {
                    return p.name === player;
                })[0];
            }

            if (!player) {
                throw new Error('null player');
            }

            if (currentPairingId === targetInfo.id) {
                return;
            }

            currentPairingId = targetInfo.id;

            const promise = player.tryPair ?
                player.tryPair(targetInfo) :
                Promise.resolve();

            Events.trigger(self, 'pairing');

            promise.then(function () {
                Events.trigger(self, 'paired');
                setCurrentPlayerInternal(player, targetInfo);
            }, function () {
                Events.trigger(self, 'pairerror');
                if (currentPairingId === targetInfo.id) {
                    currentPairingId = null;
                }
            });
        };

        self.getTargets = function () {
            const promises = players.filter(displayPlayerIndividually).map(getPlayerTargets);

            return Promise.all(promises)
                .then(responses => responses.flat().sort(sortPlayerTargets));
        };

        /**
         * 检查播放器是否支持第二字幕
         *
         * @param {Object} player - 播放器实例
         * @returns {boolean} 是否支持第二字幕
         */
        self.playerHasSecondarySubtitleSupport = function (player = self._currentPlayer) {
            if (!player) return false;
            return Boolean(player.supports('SecondarySubtitles'));
        };

        /**
         * 检查字幕轨道是否支持作为第二字幕
         *
         * 检查条件:
         * - 可以直接用作第二字幕
         * - 或者作为主字幕时可以与第二字幕配对
         *
         * 注意: 目前仅支持非 SSA/ASS 格式的外部字幕,
         * 因为 SSA/ASS 渲染复杂且有字幕重叠风险
         *
         * @param {Object} track - 字幕轨道对象
         * @param {Object} player - 播放器实例
         * @returns {boolean} 是否支持第二字幕
         */
        self.trackHasSecondarySubtitleSupport = function (track, player = self._currentPlayer) {
            if (!player || !track) return false;
            const format = (track.Codec || '').toLowerCase();
            // Currently, only non-SSA/non-ASS external subtitles are supported.
            // Showing secondary subtitles does not work with any SSA/ASS subtitle combinations because
            // of the complexity of how they are rendered and the risk of the subtitles overlapping
            return format !== 'ssa' && format !== 'ass' && getDeliveryMethod(track) === 'External';
        };

        /**
         * 获取支持作为第二字幕的字幕轨道列表
         *
         * 过滤出所有支持第二字幕功能的字幕轨道
         *
         * @param {Object} player - 播放器实例
         * @returns {Array} 支持第二字幕的字幕轨道数组
         */
        self.secondarySubtitleTracks = function (player = self._currentPlayer) {
            const streams = self.subtitleTracks(player);
            return streams.filter((stream) => self.trackHasSecondarySubtitleSupport(stream, player));
        };

        /**
         * 获取当前字幕流
         *
         * @param {Object} player - 播放器实例
         * @param {boolean} isSecondaryStream - 是否获取第二字幕流
         * @returns {Object|null} 字幕流对象,未启用时返回 null
         */
        function getCurrentSubtitleStream(player, isSecondaryStream = false) {
            if (!player) {
                throw new Error('player cannot be null');
            }

            const index = isSecondaryStream ? getPlayerData(player).secondarySubtitleStreamIndex : getPlayerData(player).subtitleStreamIndex;

            if (index == null || index === -1) {
                return null;
            }

            return self.getSubtitleStream(player, index);
        }

        /**
         * 根据索引获取字幕流
         *
         * @param {Object} player - 播放器实例
         * @param {number} index - 字幕流索引
         * @returns {Object|undefined} 字幕流对象
         */
        self.getSubtitleStream = function (player, index) {
            return self.subtitleTracks(player).filter(function (s) {
                return s.Type === 'Subtitle' && s.Index === index;
            })[0];
        };

        /**
         * 获取播放列表
         *
         * 如果播放器支持本地播放列表管理,使用播放队列管理器;
         * 否则委托给播放器自身的播放列表管理
         *
         * @param {Object} player - 播放器实例
         * @returns {Promise<Array>} 播放列表 Promise
         */
        self.getPlaylist = function (player) {
            player = player || self._currentPlayer;
            if (player && !enableLocalPlaylistManagement(player)) {
                if (player.getPlaylistSync) {
                    return Promise.resolve(player.getPlaylistSync());
                }

                return player.getPlaylist();
            }

            return Promise.resolve(self._playQueueManager.getPlaylist());
        };

        /**
         * 提示跳过媒体片段
         *
         * 用于提示用户跳过特定媒体片段(如片头、片尾、广告等)
         *
         * @param {Object} mediaSegment - 媒体片段对象
         * @param {Object} player - 播放器实例
         */
        self.promptToSkip = function (mediaSegment, player) {
            player = player || self._currentPlayer;

            if (mediaSegment && this._skipSegment) {
                Events.trigger(player, PlayerEvent.PromptSkip, [mediaSegment]);
            }
        };

        /**
         * 移除当前播放器
         *
         * 如果传入的播放器是当前播放器,则将其设置为 null
         *
         * @param {Object} player - 要移除的播放器实例
         */
        function removeCurrentPlayer(player) {
            const previousPlayer = self._currentPlayer;

            if (!previousPlayer || player.id === previousPlayer.id) {
                setCurrentPlayerInternal(null);
            }
        }

        /**
         * 内部设置当前播放器
         *
         * 处理播放器切换逻辑:
         * - 为本地播放器创建目标信息
         * - 停止前一个播放器的更新
         * - 启动新播放器的更新
         * - 触发播放器切换事件
         *
         * @param {Object|null} player - 新播放器实例
         * @param {Object} targetInfo - 目标设备信息
         */
        function setCurrentPlayerInternal(player, targetInfo) {
            const previousPlayer = self._currentPlayer;
            const previousTargetInfo = currentTargetInfo;

            if (player && !targetInfo && player.isLocalPlayer) {
                targetInfo = createTarget(self, player);
            }

            if (player && !targetInfo) {
                throw new Error('targetInfo cannot be null');
            }

            currentPairingId = null;
            self._currentPlayer = player;
            currentTargetInfo = targetInfo;

            if (targetInfo) {
                console.debug('Active player: ' + JSON.stringify(targetInfo));
            }

            if (previousPlayer) {
                self.endPlayerUpdates(previousPlayer);
            }

            if (player) {
                self.beginPlayerUpdates(player);
            }

            triggerPlayerChange(self, player, targetInfo, previousPlayer, previousTargetInfo);
        }

        /**
         * 检查播放器是否正在播放
         *
         * @param {Object} player - 播放器实例
         * @returns {boolean} 是否正在播放
         */
        self.isPlaying = function (player) {
            player = player || self._currentPlayer;

            if (player?.isPlaying) {
                return player.isPlaying();
            }

            return player?.currentSrc() != null;
        };

        /**
         * 检查是否正在播放指定媒体类型
         *
         * @param {string} mediaType - 媒体类型(Video/Audio 等)
         * @param {Object} player - 播放器实例
         * @returns {boolean} 是否正在播放该类型
         */
        self.isPlayingMediaType = function (mediaType, player) {
            player = player || self._currentPlayer;

            if (player?.isPlaying) {
                return player.isPlaying(mediaType);
            }

            if (self.isPlaying(player)) {
                const playerData = getPlayerData(player);

                return playerData.streamInfo.mediaType === mediaType;
            }

            return false;
        };

        /**
         * 检查是否在本地播放指定媒体类型
         *
         * @param {Array<string>} mediaTypes - 媒体类型数组
         * @param {Object} player - 播放器实例
         * @returns {boolean} 是否在本地播放任一指定类型
         */
        self.isPlayingLocally = function (mediaTypes, player) {
            player = player || self._currentPlayer;

            if (!player?.isLocalPlayer) {
                return false;
            }

            return mediaTypes.filter(function (mediaType) {
                return self.isPlayingMediaType(mediaType, player);
            }).length > 0;
        };

        /**
         * 检查是否正在播放视频
         *
         * @param {Object} player - 播放器实例
         * @returns {boolean} 是否正在播放视频
         */
        self.isPlayingVideo = function (player) {
            return self.isPlayingMediaType('Video', player);
        };

        /**
         * 检查是否正在播放音频
         *
         * @param {Object} player - 播放器实例
         * @returns {boolean} 是否正在播放音频
         */
        self.isPlayingAudio = function (player) {
            return self.isPlayingMediaType('Audio', player);
        };

        /**
         * 获取所有已注册的播放器
         *
         * @returns {Array} 播放器数组
         */
        self.getPlayers = function () {
            return players;
        };

        /**
         * 获取默认播放选项
         *
         * @returns {Object} 默认播放选项(fullscreen: true)
         */
        function getDefaultPlayOptions() {
            return {
                fullscreen: true
            };
        }

        /**
         * 检查媒体项目是否可播放
         *
         * 判断逻辑:
         * - 集合类型(相册、播放列表、系列等)可播放
         * - 虚拟位置的项目(除节目外)不可播放
         * - 节目需在播出时间内
         * - 其他项目需找到可用的播放器
         *
         * @param {Object} item - 媒体项目
         * @returns {boolean} 是否可播放
         */
        self.canPlay = function (item) {
            const itemType = item.Type;

            if (itemType === 'PhotoAlbum' || itemType === 'MusicGenre' || itemType === 'Season' || itemType === 'Series' || itemType === 'BoxSet' || itemType === 'MusicAlbum' || itemType === 'MusicArtist' || itemType === 'Playlist') {
                return true;
            }

            if (item.LocationType === 'Virtual' && itemType !== 'Program') {
                return false;
            }

            if (itemType === 'Program') {
                if (!item.EndDate || !item.StartDate) {
                    return false;
                }

                if (new Date().getTime() > datetime.parseISO8601Date(item.EndDate).getTime() || new Date().getTime() < datetime.parseISO8601Date(item.StartDate).getTime()) {
                    return false;
                }
            }

            return getPlayer(item, getDefaultPlayOptions()) != null;
        };

        /**
         * 切换宽高比
         *
         * 循环切换所有支持的宽高比选项,到达末尾时返回第一个
         *
         * @param {Object} player - 播放器实例
         */
        self.toggleAspectRatio = function (player) {
            player = player || self._currentPlayer;

            if (player) {
                const current = self.getAspectRatio(player);

                const supported = self.getSupportedAspectRatios(player);

                let index = -1;
                for (let i = 0, length = supported.length; i < length; i++) {
                    if (supported[i].id === current) {
                        index = i;
                        break;
                    }
                }

                index++;
                if (index >= supported.length) {
                    index = 0;
                }

                self.setAspectRatio(supported[index].id, player);
            }
        };

        /**
         * 设置宽高比
         *
         * @param {string} val - 宽高比值
         * @param {Object} player - 播放器实例
         */
        self.setAspectRatio = function (val, player) {
            player = player || self._currentPlayer;

            if (player?.setAspectRatio) {
                player.setAspectRatio(val);
            }
        };

        /**
         * 获取支持的宽高比列表
         *
         * @param {Object} player - 播放器实例
         * @returns {Array} 支持的宽高比数组
         */
        self.getSupportedAspectRatios = function (player) {
            player = player || self._currentPlayer;

            if (player?.getSupportedAspectRatios) {
                return player.getSupportedAspectRatios();
            }

            return [];
        };

        /**
         * 获取当前宽高比
         *
         * @param {Object} player - 播放器实例
         * @returns {string|undefined} 当前宽高比值
         */
        self.getAspectRatio = function (player) {
            player = player || self._currentPlayer;

            if (player?.getAspectRatio) {
                return player.getAspectRatio();
            }
        };

        /**
         * 提高播放速率
         *
         * 在支持的播放速率列表中选择下一个更高的速率
         *
         * @param {Object} player - 播放器实例
         */
        self.increasePlaybackRate = function (player) {
            player = player || self._currentPlayer;
            if (player) {
                const current = self.getPlaybackRate(player);
                const supported = self.getSupportedPlaybackRates(player);

                let index = -1;
                for (let i = 0, length = supported.length; i < length; i++) {
                    if (supported[i].id === current) {
                        index = i;
                        break;
                    }
                }

                index = Math.min(index + 1, supported.length - 1);
                self.setPlaybackRate(supported[index].id, player);
            }
        };

        /**
         * 降低播放速率
         *
         * 在支持的播放速率列表中选择上一个更低的速率
         *
         * @param {Object} player - 播放器实例
         */
        self.decreasePlaybackRate = function (player) {
            player = player || self._currentPlayer;
            if (player) {
                const current = self.getPlaybackRate(player);
                const supported = self.getSupportedPlaybackRates(player);

                let index = -1;
                for (let i = 0, length = supported.length; i < length; i++) {
                    if (supported[i].id === current) {
                        index = i;
                        break;
                    }
                }

                index = Math.max(index - 1, 0);
                self.setPlaybackRate(supported[index].id, player);
            }
        };

        /**
         * 获取支持的播放速率列表
         *
         * @param {Object} player - 播放器实例
         * @returns {Array} 支持的播放速率数组
         */
        self.getSupportedPlaybackRates = function (player) {
            player = player || self._currentPlayer;
            if (player?.getSupportedPlaybackRates) {
                return player.getSupportedPlaybackRates();
            }
            return [];
        };

        let brightnessOsdLoaded;
        /**
         * 设置屏幕亮度
         *
         * 首次调用时会动态加载亮度 OSD 模块
         *
         * @param {number} val - 亮度值
         * @param {Object} player - 播放器实例
         */
        self.setBrightness = function (val, player) {
            player = player || self._currentPlayer;

            if (player) {
                if (!brightnessOsdLoaded) {
                    brightnessOsdLoaded = true;
                    // TODO: Have this trigger an event instead to get the osd out of here
                    import('./brightnessosd').then();
                }
                player.setBrightness(val);
            }
        };

        /**
         * 获取屏幕亮度
         *
         * @param {Object} player - 播放器实例
         * @returns {number|undefined} 亮度值
         */
        self.getBrightness = function (player) {
            player = player || self._currentPlayer;

            if (player) {
                return player.getBrightness();
            }
        };

        /**
         * 设置音量
         *
         * @param {number} val - 音量值(0-100)
         * @param {Object} player - 播放器实例
         */
        self.setVolume = function (val, player) {
            player = player || self._currentPlayer;

            if (player && !supportsPhysicalVolumeControl(player)) {
                player.setVolume(val);
            }
        };

        /**
         * 获取音量
         *
         * @param {Object} player - 播放器实例
         * @returns {number} 音量值(0-100),物理音量控制时返回 1
         */
        self.getVolume = function (player) {
            player = player || self._currentPlayer;

            if (player && !supportsPhysicalVolumeControl(player)) {
                return player.getVolume();
            }

            return 1;
        };

        /**
         * 增加音量
         *
         * @param {Object} player - 播放器实例
         */
        self.volumeUp = function (player) {
            player = player || self._currentPlayer;

            if (player && !supportsPhysicalVolumeControl(player)) {
                player.volumeUp();
            }
        };

        /**
         * 降低音量
         *
         * @param {Object} player - 播放器实例
         */
        self.volumeDown = function (player) {
            player = player || self._currentPlayer;

            if (player && !supportsPhysicalVolumeControl(player)) {
                player.volumeDown();
            }
        };

        /**
         * 切换到下一个音频轨道
         *
         * 循环切换所有可用的音频流,到达末尾时返回第一个
         *
         * @param {Object} player - 播放器实例
         */
        self.changeAudioStream = function (player) {
            player = player || self._currentPlayer;
            if (player && !enableLocalPlaylistManagement(player)) {
                return player.changeAudioStream();
            }

            if (!player) {
                return;
            }

            const currentMediaSource = self.currentMediaSource(player);
            const mediaStreams = [];
            for (let i = 0, length = currentMediaSource.MediaStreams.length; i < length; i++) {
                if (currentMediaSource.MediaStreams[i].Type === 'Audio') {
                    mediaStreams.push(currentMediaSource.MediaStreams[i]);
                }
            }

            // Nothing to change
            if (mediaStreams.length <= 1) {
                return;
            }

            const currentStreamIndex = self.getAudioStreamIndex(player);
            let indexInList = -1;
            for (let i = 0, length = mediaStreams.length; i < length; i++) {
                if (mediaStreams[i].Index === currentStreamIndex) {
                    indexInList = i;
                    break;
                }
            }

            let nextIndex = indexInList + 1;
            if (nextIndex >= mediaStreams.length) {
                nextIndex = 0;
            }

            nextIndex = nextIndex === -1 ? -1 : mediaStreams[nextIndex].Index;

            self.setAudioStreamIndex(nextIndex, player);
        };

        /**
         * 切换到下一个字幕轨道
         *
         * 循环切换所有可用的字幕流,到达末尾时禁用字幕(index=-1)
         *
         * @param {Object} player - 播放器实例
         */
        self.changeSubtitleStream = function (player) {
            player = player || self._currentPlayer;
            if (player && !enableLocalPlaylistManagement(player)) {
                return player.changeSubtitleStream();
            }

            if (!player) {
                return;
            }

            const currentMediaSource = self.currentMediaSource(player);
            const mediaStreams = [];
            for (let i = 0, length = currentMediaSource.MediaStreams.length; i < length; i++) {
                if (currentMediaSource.MediaStreams[i].Type === 'Subtitle') {
                    mediaStreams.push(currentMediaSource.MediaStreams[i]);
                }
            }

            // No known streams, nothing to change
            if (!mediaStreams.length) {
                return;
            }

            const currentStreamIndex = self.getSubtitleStreamIndex(player);
            let indexInList = -1;
            for (let i = 0, length = mediaStreams.length; i < length; i++) {
                if (mediaStreams[i].Index === currentStreamIndex) {
                    indexInList = i;
                    break;
                }
            }

            let nextIndex = indexInList + 1;
            if (nextIndex >= mediaStreams.length) {
                nextIndex = -1;
            }

            nextIndex = nextIndex === -1 ? -1 : mediaStreams[nextIndex].Index;

            self.setSubtitleStreamIndex(nextIndex, player);
        };

        /**
         * 获取当前音频流索引
         *
         * @param {Object} player - 播放器实例
         * @returns {number} 音频流索引
         */
        self.getAudioStreamIndex = function (player) {
            player = player || self._currentPlayer;
            if (player && !enableLocalPlaylistManagement(player)) {
                return player.getAudioStreamIndex();
            }

            return getPlayerData(player).audioStreamIndex;
        };

        /**
         * 检查音频流是否被设备支持(无需转码)
         *
         * @param {Object} mediaSource - 媒体源对象
         * @param {number} index - 音频流索引
         * @param {Object} deviceProfile - 设备配置文件
         * @returns {boolean} 是否支持该音频流
         */
        function isAudioStreamSupported(mediaSource, index, deviceProfile) {
            let mediaStream;
            const mediaStreams = mediaSource.MediaStreams;

            for (let i = 0, length = mediaStreams.length; i < length; i++) {
                if (mediaStreams[i].Type === 'Audio' && mediaStreams[i].Index === index) {
                    mediaStream = mediaStreams[i];
                    break;
                }
            }

            if (!mediaStream) {
                return false;
            }

            const container = mediaSource.Container.toLowerCase();
            const codec = (mediaStream.Codec || '').toLowerCase();

            if (!codec) {
                return false;
            }

            const profiles = deviceProfile.DirectPlayProfiles || [];

            return profiles.some(function (p) {
                return p.Type === 'Video'
                    && includesAny((p.Container || '').toLowerCase(), container)
                    && includesAny((p.AudioCodec || '').toLowerCase(), codec);
            });
        }

        /**
         * 设置音频流索引
         *
         * 根据播放方法和设备支持情况,选择直接切换或重新请求转码流
         *
         * @param {number} index - 音频流索引
         * @param {Object} player - 播放器实例
         */
        self.setAudioStreamIndex = function (index, player) {
            player = player || self._currentPlayer;
            if (player && !enableLocalPlaylistManagement(player)) {
                return player.setAudioStreamIndex(index);
            }

            if (self.playMethod(player) === 'Transcode' || !player.canSetAudioStreamIndex()) {
                changeStream(player, getCurrentTicks(player), { AudioStreamIndex: index });
                getPlayerData(player).audioStreamIndex = index;
            } else {
                // See if the player supports the track without transcoding
                player.getDeviceProfile(self.currentItem(player)).then(function (profile) {
                    if (isAudioStreamSupported(self.currentMediaSource(player), index, profile)) {
                        player.setAudioStreamIndex(index);
                        getPlayerData(player).audioStreamIndex = index;
                    } else {
                        changeStream(player, getCurrentTicks(player), { AudioStreamIndex: index });
                        getPlayerData(player).audioStreamIndex = index;
                    }
                });
            }
        };

        function getSavedMaxStreamingBitrate(apiClient, mediaType) {
            if (!apiClient) {
                // This should hopefully never happen
                apiClient = ServerConnections.currentApiClient();
            }

            const endpointInfo = apiClient.getSavedEndpointInfo() || {};

            return appSettings.maxStreamingBitrate(endpointInfo.IsInNetwork, mediaType);
        }

        self.getMaxStreamingBitrate = function (player) {
            player = player || self._currentPlayer;
            if (player?.getMaxStreamingBitrate) {
                return player.getMaxStreamingBitrate();
            }

            const playerData = getPlayerData(player);

            if (playerData.maxStreamingBitrate) {
                return playerData.maxStreamingBitrate;
            }

            const mediaType = playerData.streamInfo ? playerData.streamInfo.mediaType : null;
            const currentItem = self.currentItem(player);

            const apiClient = currentItem ? ServerConnections.getApiClient(currentItem.ServerId) : ServerConnections.currentApiClient();
            return getSavedMaxStreamingBitrate(apiClient, mediaType);
        };

        /**
         * 检查是否启用自动码率检测
         *
         * @param {Object} player - 播放器实例
         * @returns {boolean} 是否启用自动码率检测
         */
        self.enableAutomaticBitrateDetection = function (player) {
            player = player || self._currentPlayer;
            if (player?.enableAutomaticBitrateDetection) {
                return player.enableAutomaticBitrateDetection();
            }

            const playerData = getPlayerData(player);
            const mediaType = playerData.streamInfo ? playerData.streamInfo.mediaType : null;
            const currentItem = self.currentItem(player);

            const apiClient = currentItem ? ServerConnections.getApiClient(currentItem.ServerId) : ServerConnections.currentApiClient();
            const endpointInfo = apiClient.getSavedEndpointInfo() || {};

            return appSettings.enableAutomaticBitrateDetection(endpointInfo.IsInNetwork, mediaType);
        };

        /**
         * 设置最大流媒体码率
         *
         * 支持手动设置或自动检测码率,修改后会重新请求媒体流
         *
         * @param {Object} options - 选项对象
         * @param {boolean} options.enableAutomaticBitrateDetection - 是否启用自动码率检测
         * @param {number} options.maxBitrate - 手动设置的最大码率
         * @param {Object} player - 播放器实例
         */
        self.setMaxStreamingBitrate = function (options, player) {
            player = player || self._currentPlayer;
            if (player?.setMaxStreamingBitrate) {
                return player.setMaxStreamingBitrate(options);
            }

            const apiClient = ServerConnections.getApiClient(self.currentItem(player).ServerId);

            apiClient.getEndpointInfo().then(function (endpointInfo) {
                const playerData = getPlayerData(player);
                const mediaType = playerData.streamInfo ? playerData.streamInfo.mediaType : null;

                let promise;
                if (options.enableAutomaticBitrateDetection) {
                    appSettings.enableAutomaticBitrateDetection(endpointInfo.IsInNetwork, mediaType, true);
                    promise = apiClient.detectBitrate(true);
                } else {
                    appSettings.enableAutomaticBitrateDetection(endpointInfo.IsInNetwork, mediaType, false);
                    promise = Promise.resolve(options.maxBitrate);
                }

                promise.then(function (bitrate) {
                    appSettings.maxStreamingBitrate(endpointInfo.IsInNetwork, mediaType, bitrate);

                    changeStream(player, getCurrentTicks(player), {
                        MaxStreamingBitrate: bitrate
                    });
                });
            });
        };

        /**
         * 检查是否处于全屏模式
         *
         * @param {Object} player - 播放器实例
         * @returns {boolean} 是否全屏
         */
        self.isFullscreen = function (player) {
            player = player || self._currentPlayer;
            if (!player.isLocalPlayer || player.isFullscreen) {
                return player.isFullscreen();
            }

            if (!Screenfull.isEnabled) {
                // iOS Safari
                return document.webkitIsFullScreen;
            }

            return Screenfull.isFullscreen;
        };

        /**
         * 切换全屏模式
         *
         * 支持标准 Screenfull API 和 iOS Safari 的 webkit 全屏 API
         *
         * @param {Object} player - 播放器实例
         */
        self.toggleFullscreen = function (player) {
            player = player || self._currentPlayer;
            if (!player.isLocalPlayer || player.toggleFullscreen) {
                return player.toggleFullscreen();
            }

            if (Screenfull.isEnabled) {
                Screenfull.toggle();
            } else if (document.webkitIsFullScreen && document.webkitCancelFullscreen) {
                // iOS Safari
                document.webkitCancelFullscreen();
            } else {
                const elem = document.querySelector('video');
                if (elem?.webkitEnterFullscreen) {
                    elem.webkitEnterFullscreen();
                }
            }
        };

        /**
         * 切换画中画模式
         *
         * @param {Object} player - 播放器实例
         * @returns {*} 播放器返回值
         */
        self.togglePictureInPicture = function (player) {
            player = player || self._currentPlayer;
            return player.togglePictureInPicture();
        };

        /**
         * 切换 AirPlay
         *
         * @param {Object} player - 播放器实例
         * @returns {*} 播放器返回值
         */
        self.toggleAirPlay = function (player) {
            player = player || self._currentPlayer;
            return player.toggleAirPlay();
        };

        /**
         * 获取字幕流索引
         *
         * @param {Object} player - 播放器实例
         * @returns {number} 字幕流索引,-1 表示禁用字幕
         */
        self.getSubtitleStreamIndex = function (player) {
            player = player || self._currentPlayer;

            if (player && !enableLocalPlaylistManagement(player)) {
                return player.getSubtitleStreamIndex();
            }

            if (!player) {
                throw new Error('player cannot be null');
            }

            return getPlayerData(player).subtitleStreamIndex;
        };

        /**
         * 获取第二字幕流索引
         *
         * @param {Object} player - 播放器实例
         * @returns {number} 第二字幕流索引,-1 表示禁用
         */
        self.getSecondarySubtitleStreamIndex = function (player) {
            player = player || self._currentPlayer;

            if (!player) {
                throw new Error('player cannot be null');
            }

            try {
                if (!enableLocalPlaylistManagement(player)) {
                    return player.getSecondarySubtitleStreamIndex();
                }
            } catch (e) {
                console.error('[playbackmanager] Failed to get secondary stream index:', e);
            }

            return getPlayerData(player).secondarySubtitleStreamIndex;
        };

        /**
         * 获取字幕传送方式
         *
         * @param {Object} subtitleStream - 字幕流对象
         * @returns {string} 传送方式: External(外部)、Embed(嵌入)或 Encode(编码)
         */
        function getDeliveryMethod(subtitleStream) {
            // This will be null for internal subs for local items
            if (subtitleStream.DeliveryMethod) {
                return subtitleStream.DeliveryMethod;
            }

            return subtitleStream.IsExternal ? 'External' : 'Embed';
        }

        /**
         * 设置字幕流索引
         *
         * 根据字幕传送方式和播放方法,选择直接切换或重新请求转码流:
         * - External: 可以直接切换
         * - Embed + DirectPlay: 可以直接切换
         * - Encode 或 Embed + Transcode: 需要重新请求转码流
         *
         * @param {number} index - 字幕流索引,-1 表示禁用字幕
         * @param {Object} player - 播放器实例
         */
        self.setSubtitleStreamIndex = function (index, player) {
            player = player || self._currentPlayer;
            if (player && !enableLocalPlaylistManagement(player)) {
                return player.setSubtitleStreamIndex(index);
            }

            const currentStream = getCurrentSubtitleStream(player);

            const newStream = self.getSubtitleStream(player, index);

            if (!currentStream && !newStream) {
                return;
            }

            let selectedTrackElementIndex = -1;

            const currentPlayMethod = self.playMethod(player);

            if (currentStream && !newStream) {
                if (getDeliveryMethod(currentStream) === 'Encode' || (getDeliveryMethod(currentStream) === 'Embed' && currentPlayMethod === 'Transcode')) {
                    // Need to change the transcoded stream to remove subs
                    changeStream(player, getCurrentTicks(player), { SubtitleStreamIndex: -1 });
                }
            } else if (!currentStream && newStream) {
                if (getDeliveryMethod(newStream) === 'External') {
                    selectedTrackElementIndex = index;
                } else if (getDeliveryMethod(newStream) === 'Embed' && currentPlayMethod !== 'Transcode') {
                    selectedTrackElementIndex = index;
                } else {
                    // Need to change the transcoded stream to add subs
                    changeStream(player, getCurrentTicks(player), { SubtitleStreamIndex: index });
                }
            } else if (currentStream && newStream) {
                // Switching tracks
                // We can handle this clientside if the new track is external or the new track is embedded and we're not transcoding
                if (getDeliveryMethod(newStream) === 'External' || (getDeliveryMethod(newStream) === 'Embed' && currentPlayMethod !== 'Transcode')) {
                    selectedTrackElementIndex = index;

                    // But in order to handle this client side, if the previous track is being added via transcoding, we'll have to remove it
                    if (getDeliveryMethod(currentStream) !== 'External' && getDeliveryMethod(currentStream) !== 'Embed') {
                        changeStream(player, getCurrentTicks(player), { SubtitleStreamIndex: -1 });
                    }
                } else {
                    // Need to change the transcoded stream to add subs
                    changeStream(player, getCurrentTicks(player), { SubtitleStreamIndex: index });
                }
            }

            player.setSubtitleStreamIndex(selectedTrackElementIndex);

            // Also disable secondary subtitles when disabling the primary
            // subtitles, or if it doesn't support a secondary pair
            if (selectedTrackElementIndex === -1 || !self.trackHasSecondarySubtitleSupport(newStream)) {
                self.setSecondarySubtitleStreamIndex(-1);
            }

            getPlayerData(player).subtitleStreamIndex = index;
        };

        /**
         * 设置第二字幕流索引
         *
         * @param {number} index - 第二字幕流索引,-1 表示禁用
         * @param {Object} player - 播放器实例
         */
        self.setSecondarySubtitleStreamIndex = function (index, player) {
            player = player || self._currentPlayer;
            if (!self.playerHasSecondarySubtitleSupport(player)) return;
            if (player && !enableLocalPlaylistManagement(player)) {
                try {
                    return player.setSecondarySubtitleStreamIndex(index);
                } catch (e) {
                    console.error('[playbackmanager] AutoSet - Failed to set secondary track:', e);
                }
            }

            const currentStream = getCurrentSubtitleStream(player, true);

            const newStream = self.getSubtitleStream(player, index);

            if (!currentStream && !newStream) {
                return;
            }

            // Secondary subtitles are currently only handled client side
            // Changes to the server code are required before we can handle other delivery methods
            if (newStream && !self.trackHasSecondarySubtitleSupport(newStream, player)) {
                return;
            }

            try {
                player.setSecondarySubtitleStreamIndex(index);
                getPlayerData(player).secondarySubtitleStreamIndex = index;
            } catch (e) {
                console.error('[playbackmanager] AutoSet - Failed to set secondary track:', e);
            }
        };

        /**
         * 检查是否支持字幕偏移
         *
         * @param {Object} player - 播放器实例
         * @returns {boolean} 是否支持字幕偏移
         */
        self.supportSubtitleOffset = function (player) {
            player = player || self._currentPlayer;
            return player && 'setSubtitleOffset' in player;
        };

        /**
         * 启用字幕偏移显示
         *
         * @param {Object} player - 播放器实例
         */
        self.enableShowingSubtitleOffset = function (player) {
            player = player || self._currentPlayer;
            player.enableShowingSubtitleOffset();
        };

        /**
         * 禁用字幕偏移显示
         *
         * @param {Object} player - 播放器实例
         */
        self.disableShowingSubtitleOffset = function (player) {
            player = player || self._currentPlayer;
            if (player.disableShowingSubtitleOffset) {
                player.disableShowingSubtitleOffset();
            }
        };

        /**
         * 检查是否启用了字幕偏移显示
         *
         * @param {Object} player - 播放器实例
         * @returns {boolean} 是否显示字幕偏移
         */
        self.isShowingSubtitleOffsetEnabled = function (player) {
            player = player || self._currentPlayer;
            return player.isShowingSubtitleOffsetEnabled();
        };

        /**
         * 检查字幕流是否为外部字幕
         *
         * @param {number} index - 字幕流索引
         * @param {Object} player - 播放器实例
         * @returns {boolean} 是否为外部字幕
         */
        self.isSubtitleStreamExternal = function (index, player) {
            const stream = self.getSubtitleStream(player, index);
            return stream ? getDeliveryMethod(stream) === 'External' : false;
        };

        /**
         * 设置字幕偏移
         *
         * @param {number} value - 偏移值(毫秒)
         * @param {Object} player - 播放器实例
         */
        self.setSubtitleOffset = function (value, player) {
            player = player || self._currentPlayer;
            if (player.setSubtitleOffset) {
                player.setSubtitleOffset(value);
            }
        };

        /**
         * 获取播放器字幕偏移
         *
         * @param {Object} player - 播放器实例
         * @returns {number|undefined} 偏移值(毫秒)
         */
        self.getPlayerSubtitleOffset = function (player) {
            player = player || self._currentPlayer;
            if (player.getSubtitleOffset) {
                return player.getSubtitleOffset();
            }
        };

        /**
         * 检查当前字幕是否可以处理偏移
         *
         * 仅外部字幕支持偏移调整
         *
         * @param {Object} player - 播放器实例
         * @returns {boolean} 当前字幕是否可偏移
         */
        self.canHandleOffsetOnCurrentSubtitle = function (player) {
            const index = self.getSubtitleStreamIndex(player);
            return index !== -1 && self.isSubtitleStreamExternal(index, player);
        };

        /**
         * 跳转到指定位置
         *
         * @param {number} ticks - 目标位置(100 纳秒为单位,1 秒 = 10000000 ticks)
         * @param {Object} player - 播放器实例
         */
        self.seek = function (ticks, player) {
            ticks = Math.max(0, ticks);

            player = player || self._currentPlayer;
            if (player && !enableLocalPlaylistManagement(player)) {
                return player.seek(ticks);
            }

            changeStream(player, ticks);
        };

        /**
         * 相对跳转(快进/快退)
         *
         * @param {number} offsetTicks - 偏移量(ticks),正值为快进,负值为快退
         * @param {Object} player - 播放器实例
         */
        self.seekRelative = function (offsetTicks, player) {
            player = player || self._currentPlayer;
            if (player && !enableLocalPlaylistManagement(player) && player.seekRelative) {
                return player.seekRelative(ticks);
            }

            const ticks = getCurrentTicks(player) + offsetTicks;
            return this.seek(ticks, player);
        };

        /**
         * 检查播放器是否支持原生客户端跳转
         *
         * 如果是 HLS 流(.m3u8)或者播放器支持 seekable,则可以跳转
         * 转码流不支持跳转(需要重新请求流)
         *
         * @param {Object} player - 播放器实例
         * @returns {boolean} 是否支持原生跳转
         */
        // Returns true if the player can seek using native client-side seeking functions
        function canPlayerSeek(player) {
            if (!player) {
                throw new Error('player cannot be null');
            }

            const playerData = getPlayerData(player);

            const currentSrc = (playerData.streamInfo.url || '').toLowerCase();

            if (currentSrc.indexOf('.m3u8') !== -1) {
                return true;
            }

            if (player.seekable) {
                return player.seekable();
            }

            const isPlayMethodTranscode = self.playMethod(player) === 'Transcode';

            if (isPlayMethodTranscode) {
                return false;
            }

            return player.duration();
        }

        /**
         * 切换媒体流(用于跳转、切换音频/字幕轨、调整码率等)
         *
         * 根据参数决定是进行客户端跳转还是重新请求转码流:
         * - 如果支持原生跳转且无其他参数改变,直接调用 currentTime
         * - 否则重新请求媒体信息并切换流
         *
         * @param {Object} player - 播放器实例
         * @param {number} ticks - 目标位置(ticks)
         * @param {Object} params - 额外参数(如 AudioStreamIndex, SubtitleStreamIndex, MaxStreamingBitrate 等)
         */
        function changeStream(player, ticks, params) {
            if (canPlayerSeek(player) && params == null) {
                player.currentTime(parseInt(ticks / 10000, 10));
                return;
            }

            params = params || {};

            const liveStreamId = getPlayerData(player).streamInfo.liveStreamId;
            const lastMediaInfoQuery = getPlayerData(player).streamInfo.lastMediaInfoQuery;

            const playSessionId = self.playSessionId(player);

            const currentItem = self.currentItem(player);

            player.getDeviceProfile(currentItem, {
                isRetry: params.EnableDirectPlay === false
            }).then(function (deviceProfile) {
                const audioStreamIndex = params.AudioStreamIndex == null ? getPlayerData(player).audioStreamIndex : params.AudioStreamIndex;
                const subtitleStreamIndex = params.SubtitleStreamIndex == null ? getPlayerData(player).subtitleStreamIndex : params.SubtitleStreamIndex;
                const secondarySubtitleStreamIndex = params.SecondarySubtitleStreamIndex == null ? getPlayerData(player).secondarySubtitleStreamIndex : params.SecondarySubtitleStreamIndex;

                let currentMediaSource = self.currentMediaSource(player);
                const apiClient = ServerConnections.getApiClient(currentItem.ServerId);

                if (ticks) {
                    ticks = parseInt(ticks, 10);
                }

                const maxBitrate = params.MaxStreamingBitrate || self.getMaxStreamingBitrate(player);

                const currentPlayOptions = currentItem.playOptions || getDefaultPlayOptions();

                const options = {
                    maxBitrate,
                    startPosition: ticks,
                    isPlayback: true,
                    audioStreamIndex,
                    subtitleStreamIndex,
                    enableDirectPlay: params.EnableDirectPlay,
                    enableDirectStream: params.EnableDirectStream,
                    allowVideoStreamCopy: params.AllowVideoStreamCopy,
                    allowAudioStreamCopy: params.AllowAudioStreamCopy
                };

                getPlaybackInfo(player, apiClient, currentItem, deviceProfile, currentMediaSource.Id, liveStreamId, options).then(function (result) {
                    if (validatePlaybackInfoResult(self, result)) {
                        currentMediaSource = result.MediaSources[0];

                        const streamInfo = createStreamInfo(apiClient, currentItem.MediaType, currentItem, currentMediaSource, ticks, player);
                        streamInfo.fullscreen = currentPlayOptions.fullscreen;
                        streamInfo.lastMediaInfoQuery = lastMediaInfoQuery;
                        streamInfo.resetSubtitleOffset = false;

                        if (!streamInfo.url) {
                            cancelPlayback();
                            showPlaybackInfoErrorMessage(self, `PlaybackError.${MediaError.NO_MEDIA_ERROR}`);
                            return;
                        }

                        getPlayerData(player).subtitleStreamIndex = subtitleStreamIndex;
                        getPlayerData(player).secondarySubtitleStreamIndex = secondarySubtitleStreamIndex;
                        getPlayerData(player).audioStreamIndex = audioStreamIndex;
                        getPlayerData(player).maxStreamingBitrate = maxBitrate;

                        changeStreamToUrl(apiClient, player, playSessionId, streamInfo);
                    }
                });
            });
        }

        /**
         * 将流 URL 切换到播放器
         *
         * 先停止现有的编码会话,然后设置新的流 URL
         *
         * @param {Object} apiClient - API 客户端实例
         * @param {Object} player - 播放器实例
         * @param {string} playSessionId - 播放会话 ID
         * @param {Object} streamInfo - 流信息对象
         */
        function changeStreamToUrl(apiClient, player, playSessionId, streamInfo) {
            const playerData = getPlayerData(player);

            playerData.isChangingStream = true;

            if (playerData.streamInfo && playSessionId) {
                apiClient.stopActiveEncodings(playSessionId).then(function () {
                    // Stop the first transcoding afterwards because the player may still send requests to the original url
                    const afterSetSrc = function () {
                        apiClient.stopActiveEncodings(playSessionId);
                    };
                    setSrcIntoPlayer(apiClient, player, streamInfo).then(afterSetSrc, afterSetSrc);
                });
            } else {
                setSrcIntoPlayer(apiClient, player, streamInfo);
            }
        }

        /**
         * 将流信息设置到播放器并开始播放
         *
         * @param {Object} apiClient - API 客户端实例
         * @param {Object} player - 播放器实例
         * @param {Object} streamInfo - 流信息对象
         * @returns {Promise} 播放 Promise
         */
        function setSrcIntoPlayer(apiClient, player, streamInfo) {
            const playerData = getPlayerData(player);

            playerData.streamInfo = streamInfo;

            return player.play(streamInfo).then(function () {
                playerData.isChangingStream = false;
                streamInfo.started = true;
                streamInfo.ended = false;

                sendProgressUpdate(player, 'timeupdate');
            }, function (e) {
                playerData.isChangingStream = false;

                onPlaybackError.call(player, e, {
                    type: getMediaError(e),
                    streamInfo
                });
            });
        }

        /**
         * 将媒体项目转换为可播放的列表
         *
         * 根据项目类型(播放列表、系列、季度、艺术家等)进行不同处理:
         * - 播放列表: 获取列表内容
         * - 系列/季度: 获取剧集列表(支持继续观看)
         * - 艺术家/流派: 获取相关音频文件
         * - 文件夹: 获取内容列表
         *
         * @param {Array} items - 媒体项目数组
         * @param {Object} options - 播放选项
         * @returns {Promise<Array>} 转换后的项目数组
         */
        async function translateItemsForPlayback(items, options) {
            if (!items.length) return [];

            sortItemsIfNeeded(items, options);

            const firstItem = items[0];
            const serverId = firstItem.ServerId;
            const queryOptions = options.queryOptions || {};

            const promise = getPlaybackPromise(firstItem, serverId, options, queryOptions, items);

            if (promise) {
                const result = await promise;
                return result ? result.Items : items;
            } else {
                return items;
            }
        }

        /**
         * 根据需要对项目进行排序
         *
         * 按照原始请求的 ID 顺序排列项目
         *
         * @param {Array} items - 项目数组
         * @param {Object} options - 选项对象
         */
        function sortItemsIfNeeded(items, options) {
            if (items.length > 1 && options?.ids) {
                // Use the original request id array for sorting the result in the proper order
                items.sort(function (a, b) {
                    return options.ids.indexOf(a.Id) - options.ids.indexOf(b.Id);
                });
            }
        }

        /**
         * 根据项目类型获取相应的播放 Promise
         *
         * 支持的类型:
         * - Program: 直播节目(获取频道)
         * - Playlist: 播放列表
         * - MusicArtist/MusicGenre/Genre: 音乐或视频流派
         * - PhotoAlbum: 相册
         * - Series/Season: 电视剧系列/季度
         * - Episode: 单集
         *
         * @param {Object} firstItem - 第一个项目
         * @param {string} serverId - 服务器 ID
         * @param {Object} options - 选项对象
         * @param {Object} queryOptions - 查询选项
         * @param {Array} items - 项目数组
         * @returns {Promise|null} 播放 Promise 或 null
         */
        function getPlaybackPromise(firstItem, serverId, options, queryOptions, items) {
            switch (firstItem.Type) {
                case 'Program':
                    return getItemsForPlayback(serverId, {
                        Ids: firstItem.ChannelId
                    });
                case 'Playlist':
                    return getItemsForPlayback(serverId, {
                        ParentId: firstItem.Id,
                        SortBy: options.shuffle ? 'Random' : null
                    });
                case 'MusicArtist':
                    return getItemsForPlayback(serverId, mergePlaybackQueries({
                        ArtistIds: firstItem.Id,
                        Filters: 'IsNotFolder',
                        Recursive: true,
                        SortBy: options.shuffle ? 'Random' : 'SortName',
                        MediaTypes: 'Audio'
                    }, queryOptions));
                case 'PhotoAlbum':
                    return getItemsForPlayback(serverId, mergePlaybackQueries({
                        ParentId: firstItem.Id,
                        Filters: 'IsNotFolder',
                        // Setting this to true may cause some incorrect sorting
                        Recursive: false,
                        SortBy: options.shuffle ? 'Random' : 'SortName',
                        // Only include Photos because we do not handle mixed queues currently
                        MediaTypes: 'Photo',
                        Limit: UNLIMITED_ITEMS
                    }, queryOptions));
                case 'MusicGenre':
                    return getItemsForPlayback(serverId, mergePlaybackQueries({
                        GenreIds: firstItem.Id,
                        Filters: 'IsNotFolder',
                        Recursive: true,
                        SortBy: options.shuffle ? 'Random' : 'SortName',
                        MediaTypes: 'Audio'
                    }, queryOptions));
                case 'Genre':
                    return getItemsForPlayback(serverId, mergePlaybackQueries({
                        GenreIds: firstItem.Id,
                        ParentId: firstItem.ParentId,
                        Filters: 'IsNotFolder',
                        Recursive: true,
                        SortBy: options.shuffle ? 'Random' : 'SortName',
                        MediaTypes: 'Video'
                    }, queryOptions));
                case 'Series':
                case 'Season':
                    return getSeriesOrSeasonPlaybackPromise(firstItem, options, items);
                case 'Episode':
                    return getEpisodePlaybackPromise(firstItem, options, items);
            }

            return getNonItemTypePromise(firstItem, serverId, options, queryOptions);
        }

        /**
         * 获取非标准项目类型的播放 Promise
         *
         * 处理照片、家庭视频文件夹等特殊类型:
         * - Photo: 获取父文件夹的照片和视频
         * - 家庭视频文件夹: 获取照片递归列表
         * - 普通文件夹: 获取音频和视频列表
         *
         * @param {Object} firstItem - 第一个项目
         * @param {string} serverId - 服务器 ID
         * @param {Object} options - 选项对象
         * @param {Object} queryOptions - 查询选项
         * @returns {Promise|null} 播放 Promise 或 null
         */
        function getNonItemTypePromise(firstItem, serverId, options, queryOptions) {
            if (firstItem.MediaType === 'Photo') {
                return getItemsForPlayback(serverId, mergePlaybackQueries({
                    ParentId: firstItem.ParentId,
                    Filters: 'IsNotFolder',
                    // Setting this to true may cause some incorrect sorting
                    Recursive: false,
                    SortBy: options.shuffle ? 'Random' : 'SortName',
                    MediaTypes: 'Photo,Video',
                    Limit: UNLIMITED_ITEMS
                }, queryOptions)).then(function (result) {
                    const playbackItems = result.Items;

                    let index = playbackItems.map(function (i) {
                        return i.Id;
                    }).indexOf(firstItem.Id);

                    if (index === -1) {
                        index = 0;
                    }

                    options.startIndex = index;

                    return Promise.resolve(result);
                });
            } else if (firstItem.IsFolder && firstItem.CollectionType === 'homevideos') {
                return getItemsForPlayback(serverId, mergePlaybackQueries({
                    ParentId: firstItem.Id,
                    Filters: 'IsNotFolder',
                    Recursive: true,
                    SortBy: options.shuffle ? 'Random' : 'SortName',
                    // Only include Photos because we do not handle mixed queues currently
                    MediaTypes: 'Photo',
                    Limit: UNLIMITED_ITEMS
                }, queryOptions));
            } else if (firstItem.IsFolder) {
                let sortBy = null;
                if (options.shuffle) {
                    sortBy = 'Random';
                } else if (firstItem.Type !== 'BoxSet') {
                    sortBy = 'SortName';
                }

                return getItemsForPlayback(serverId, mergePlaybackQueries({
                    ParentId: firstItem.Id,
                    Filters: 'IsNotFolder',
                    Recursive: true,
                    // These are pre-sorted
                    SortBy: sortBy,
                    MediaTypes: 'Audio,Video'
                }, queryOptions));
            }

            return null;
        }

        /**
         * 获取电视剧或季度播放 Promise
         *
         * 处理逻辑:
         * - 如果不是随机播放且未指定季度,从第一个未观看的剧集开始
         * - 获取所有剧集列表(默认限制 100 集)
         * - 计算正确的起始索引
         *
         * @param {Object} firstItem - 第一个项目(Series 或 Season)
         * @param {Object} options - 选项对象
         * @param {Array} items - 项目数组
         * @returns {Promise} 剧集结果对象
         */
        async function getSeriesOrSeasonPlaybackPromise(firstItem, options, items) {
            const apiClient = ServerConnections.getApiClient(firstItem.ServerId);
            const startSeasonId = firstItem.Type === 'Season' ? items[options.startIndex || 0].Id : undefined;

            const seasonId = (startSeasonId && items.length === 1) ? startSeasonId : undefined;
            const seriesId = firstItem.SeriesId || firstItem.Id;
            const UserId = apiClient.getCurrentUserId();

            let startItemId;

            // Start from a specific (the next unwatched) episode if we want to watch in order and have not chosen a specific season
            if (!options.shuffle && !seasonId) {
                const initialUnplayedEpisode = await getItems(apiClient, UserId, {
                    SortBy: 'SeriesSortName,SortName',
                    SortOrder: 'Ascending',
                    IncludeItemTypes: 'Episode',
                    Recursive: true,
                    IsMissing: false,
                    ParentId: seriesId,
                    limit: 1,
                    Filters: 'IsUnplayed'
                });

                startItemId = initialUnplayedEpisode?.Items?.at(0)?.Id;
            }

            const episodesResult = await apiClient.getEpisodes(seriesId, {
                IsVirtualUnaired: false,
                IsMissing: false,
                SeasonId: seasonId,
                // default to first 100 episodes if no season was specified to avoid loading too large payloads
                limit: seasonId ? undefined : 100,
                SortBy: options.shuffle ? 'Random' : undefined,
                UserId,
                Fields: ['Chapters', 'Trickplay'],
                startItemId
            });

            if (options.shuffle) {
                episodesResult.StartIndex = 0;
            } else {
                episodesResult.StartIndex = undefined;
                let seasonStartIndex;
                for (const [index, e] of episodesResult.Items.entries()) {
                    if (startSeasonId && items.length != 1) {
                        if (e.SeasonId == startSeasonId) {
                            if (seasonStartIndex === undefined) {
                                seasonStartIndex = index;
                            }
                        } else {
                            continue;
                        }
                    }
                    if (!e.UserData.Played) {
                        episodesResult.StartIndex = index;
                        break;
                    }
                }
                episodesResult.StartIndex = episodesResult.StartIndex || seasonStartIndex || 0;
            }

            // TODO: fix calling code to read episodesResult.StartIndex instead when set.
            options.startIndex = episodesResult.StartIndex;

            episodesResult.TotalRecordCount = episodesResult.Items.length;

            return episodesResult;
        }

        /**
         * 获取单集播放 Promise
         *
         * 如果只有一个剧集且播放器支持进度,获取同系列的剧集列表
         *
         * @param {Object} firstItem - 剧集项目
         * @param {Object} options - 选项对象
         * @param {Array} items - 项目数组
         * @returns {Promise|null} 剧集 Promise 或 null
         */
        function getEpisodePlaybackPromise(firstItem, options, items) {
            if (items.length === 1 && getPlayer(firstItem, options).supportsProgress !== false) {
                return getEpisodes(firstItem, options);
            } else {
                return null;
            }
        }

        /**
         * 获取剧集列表
         *
         * 从指定剧集开始获取系列中的所有剧集(限制 100 集)
         *
         * @param {Object} firstItem - 起始剧集
         * @param {Object} options - 选项对象
         * @returns {Promise} 剧集结果 Promise
         */
        function getEpisodes(firstItem, options) {
            return new Promise(function (resolve, reject) {
                const apiClient = ServerConnections.getApiClient(firstItem.ServerId);

                const { SeriesId, Id } = firstItem;
                if (!SeriesId) {
                    resolve(null);
                    return;
                }

                apiClient.getEpisodes(SeriesId, {
                    IsVirtualUnaired: false,
                    IsMissing: false,
                    UserId: apiClient.getCurrentUserId(),
                    Fields: ['Chapters', 'Trickplay'],
                    // limit to loading 100 episodes to avoid loading too large payload
                    limit: 100,
                    startItemId: Id
                }).then(function (episodesResult) {
                    resolve(filterEpisodes(episodesResult, firstItem, options));
                }, reject);
            });
        }

        /**
         * 过滤剧集结果
         *
         * 找到起始剧集的索引并设置到结果中
         *
         * @param {Object} episodesResult - 剧集结果对象
         * @param {Object} firstItem - 起始剧集
         * @param {Object} options - 选项对象
         * @returns {Object} 处理后的剧集结果
         */
        function filterEpisodes(episodesResult, firstItem, options) {
            for (const [index, e] of episodesResult.Items.entries()) {
                if (e.Id === firstItem.Id) {
                    episodesResult.StartIndex = index;
                    break;
                }
            }

            // TODO: fix calling code to read episodesResult.StartIndex instead when set.
            options.startIndex = episodesResult.StartIndex;
            episodesResult.TotalRecordCount = episodesResult.Items.length;
            return episodesResult;
        }

        self.translateItemsForPlayback = translateItemsForPlayback;
        self.getItemsForPlayback = getItemsForPlayback;

        self.play = async function (options) {
            normalizePlayOptions(options);

            if (self._currentPlayer) {
                if (options.enableRemotePlayers === false && !self._currentPlayer.isLocalPlayer) {
                    throw new Error('Remote players are disabled');
                }

                if (!self._currentPlayer.isLocalPlayer) {
                    return self._currentPlayer.play(options);
                }
            }

            if (options.fullscreen) {
                loading.show();
            }

            let { items } = options;
            // If items were not passed directly, fetch them by ID
            if (!items) {
                if (!options.serverId) {
                    throw new Error('serverId required!');
                }

                items = (await getItemsForPlayback(options.serverId, {
                    Ids: options.ids.join(',')
                })).Items;
            }

            // Prepare the list of items
            items = await translateItemsForPlayback(items, options);
            // Add any additional parts for movies or episodes
            items = await getAdditionalParts(items);
            // Adjust the start index for additional parts added to the queue
            if (options.startIndex) {
                let adjustedStartIndex = 0;
                for (let i = 0; i < options.startIndex; i++) {
                    adjustedStartIndex += items[i].length;
                }

                options.startIndex = adjustedStartIndex;
            }
            // getAdditionalParts returns an array of arrays of items, so flatten it
            items = items.flat();

            return playWithIntros(items, options);
        };

        /**
         * 获取播放器数据
         *
         * 从 playerStates 映射中获取或创建播放器状态对象
         * 注意: 实际返回的是 player 对象而非 state(可能是历史遗留代码)
         *
         * @param {Object} player - 播放器实例
         * @returns {Object} 播放器对象
         * @throws {Error} 如果 player 或 player.name 为空
         */
        function getPlayerData(player) {
            if (!player) {
                throw new Error('player cannot be null');
            }
            if (!player.name) {
                throw new Error('player name cannot be null');
            }
            let state = playerStates[player.name];

            if (!state) {
                playerStates[player.name] = {};
                // eslint-disable-next-line sonarjs/no-dead-store
                state = playerStates[player.name];
            }

            return player;
        }

        self.getPlayerState = function (player, item, mediaSource) {
            player = player || self._currentPlayer;

            if (!player) {
                throw new Error('player cannot be null');
            }

            if (!enableLocalPlaylistManagement(player) && player.getPlayerState) {
                return player.getPlayerState();
            }

            item = item || self.currentItem(player);
            mediaSource = mediaSource || self.currentMediaSource(player);

            const state = {
                PlayState: {}
            };

            if (player) {
                state.PlayState.VolumeLevel = player.getVolume();
                state.PlayState.IsMuted = player.isMuted();
                state.PlayState.IsPaused = player.paused();
                state.PlayState.RepeatMode = self.getRepeatMode(player);
                state.PlayState.ShuffleMode = self.getQueueShuffleMode(player);
                state.PlayState.MaxStreamingBitrate = self.getMaxStreamingBitrate(player);

                state.PlayState.PositionTicks = getCurrentTicks(player);
                state.PlayState.PlaybackStartTimeTicks = self.playbackStartTime(player);
                state.PlayState.PlaybackRate = self.getPlaybackRate(player);

                state.PlayState.SubtitleStreamIndex = self.getSubtitleStreamIndex(player);
                state.PlayState.SecondarySubtitleStreamIndex = self.getSecondarySubtitleStreamIndex(player);
                state.PlayState.AudioStreamIndex = self.getAudioStreamIndex(player);
                state.PlayState.BufferedRanges = self.getBufferedRanges(player);

                state.PlayState.PlayMethod = self.playMethod(player);

                if (mediaSource) {
                    state.PlayState.LiveStreamId = mediaSource.LiveStreamId;
                }
                state.PlayState.PlaySessionId = self.playSessionId(player);
                state.PlayState.PlaylistItemId = self.getCurrentPlaylistItemId(player);
            }

            if (mediaSource) {
                state.PlayState.MediaSourceId = mediaSource.Id;

                state.NowPlayingItem = {
                    RunTimeTicks: mediaSource.RunTimeTicks
                };

                state.PlayState.CanSeek = (mediaSource.RunTimeTicks || 0) > 0 || canPlayerSeek(player);
            }

            if (item) {
                state.NowPlayingItem = getNowPlayingItemForReporting(player, item, mediaSource);
            }

            state.MediaSource = mediaSource;

            return state;
        };

        self.duration = function (player) {
            player = player || self._currentPlayer;

            if (player && !enableLocalPlaylistManagement(player) && !player.isLocalPlayer) {
                return player.duration();
            }

            if (!player) {
                throw new Error('player cannot be null');
            }

            const mediaSource = self.currentMediaSource(player);

            if (mediaSource?.RunTimeTicks) {
                return mediaSource.RunTimeTicks;
            }

            let playerDuration = player.duration();

            if (playerDuration) {
                playerDuration *= 10000;
            }

            return playerDuration;
        };

        function getCurrentTicks(player) {
            if (!player) {
                throw new Error('player cannot be null');
            }

            let playerTime = Math.floor(10000 * (player).currentTime());

            const streamInfo = getPlayerData(player).streamInfo;
            if (streamInfo) {
                playerTime += getPlayerData(player).streamInfo.transcodingOffsetTicks || 0;
            }

            return playerTime;
        }

        // Only used internally
        self.getCurrentTicks = getCurrentTicks;

        /**
         * 播放其他类型的媒体
         *
         * 用于播放照片、书籍等非视频/音频类型
         *
         * @param {Array} items - 媒体项目数组
         * @param {Object} options - 播放选项
         * @returns {Promise} 播放 Promise
         */
        function playOther(items, options) {
            const playStartIndex = options.startIndex || 0;
            const player = getPlayer(items[playStartIndex], options);

            loading.hide();

            options.items = items;

            return player.play(options);
        }

        /**
         * 获取额外的影片部分
         *
         * 对于多部分的电影或剧集(PartCount > 1),获取所有部分
         *
         * @param {Array} items - 项目数组
         * @returns {Promise<Array>} 包含所有部分的数组(每个元素本身是数组)
         */
        const getAdditionalParts = async (items) => {
            const getItemAndParts = async function (item) {
                if (
                    item.PartCount && item.PartCount > 1
                    && [ BaseItemKind.Episode, BaseItemKind.Movie ].includes(item.Type)
                ) {
                    const client = ServerConnections.getApiClient(item.ServerId);
                    const user = await client.getCurrentUser();
                    const additionalParts = await client.getAdditionalVideoParts(user.Id, item.Id);
                    if (additionalParts.Items.length) {
                        return [ item, ...additionalParts.Items ];
                    }
                }
                return [ item ];
            };

            return Promise.all(items.map(getItemAndParts));
        };

        /**
         * 播放媒体(包括片头)
         *
         * 如果启用了片头功能,会先获取片头并插入到播放列表前面
         *
         * @param {Array} items - 媒体项目数组
         * @param {Object} options - 播放选项
         * @returns {Promise} 播放 Promise
         */
        function playWithIntros(items, options) {
            let playStartIndex = options.startIndex || 0;
            let firstItem = items[playStartIndex];

            // If index was bad, reset it
            if (!firstItem) {
                playStartIndex = 0;
                firstItem = items[playStartIndex];
            }

            // If it's still null then there's nothing to play
            if (!firstItem) {
                showPlaybackInfoErrorMessage(self, `PlaybackError.${MediaError.NO_MEDIA_ERROR}`);
                return Promise.reject();
            }

            if (firstItem.MediaType === 'Photo' || firstItem.MediaType === 'Book') {
                return playOther(items, options);
            }

            const apiClient = ServerConnections.getApiClient(firstItem.ServerId);

            return getIntros(firstItem, apiClient, options).then(function (introsResult) {
                const introItems = introsResult.Items;
                let introPlayOptions;

                firstItem.playOptions = truncatePlayOptions(options);

                if (introItems.length) {
                    introPlayOptions = {
                        fullscreen: firstItem.playOptions.fullscreen
                    };
                } else {
                    introPlayOptions = firstItem.playOptions;
                }

                items = introItems.concat(items);

                // Needed by players that manage their own playlist
                introPlayOptions.items = items;
                introPlayOptions.startIndex = playStartIndex;

                return playInternal(items[playStartIndex], introPlayOptions, function () {
                    self._playQueueManager.setPlaylist(items);

                    setPlaylistState(items[playStartIndex].PlaylistItemId, playStartIndex);
                    loading.hide();
                });
            });
        }

        /**
         * 设置播放列表状态
         *
         * 更新播放队列管理器的当前播放项
         * 使用方法而非直接调用,允许派生播放器重写
         *
         * @param {string} playlistItemId - 播放列表项 ID
         * @param {number} index - 项目索引
         */
        function setPlaylistState(playlistItemId, index) {
            if (!isNaN(index)) {
                self._playQueueManager.setPlaylistState(playlistItemId, index);
            }
        }

        /**
         * 内部播放函数
         *
         * 执行实际的播放逻辑:
         * 1. 检查项目有效性
         * 2. 运行拦截器(PreplayIntercept 插件)
         * 3. 检测码率
         * 4. 获取媒体源并开始播放
         *
         * @param {Object} item - 媒体项目
         * @param {Object} playOptions - 播放选项
         * @param {Function} onPlaybackStartedFn - 播放开始时的回调
         * @param {Object} prevSource - 前一个媒体源(用于自动选择音轨/字幕)
         * @returns {Promise} 播放 Promise
         */
        function playInternal(item, playOptions, onPlaybackStartedFn, prevSource) {
            if (item.IsPlaceHolder) {
                loading.hide();
                showPlaybackInfoErrorMessage(self, 'PlaybackErrorPlaceHolder');
                return Promise.reject();
            }

            // Normalize defaults to simplfy checks throughout the process
            normalizePlayOptions(playOptions);

            if (playOptions.isFirstItem) {
                playOptions.isFirstItem = false;
            } else {
                playOptions.isFirstItem = true;
            }

            const apiClient = ServerConnections.getApiClient(item.ServerId);

            // TODO: This should be the media type requested, not the original media type
            const mediaType = item.MediaType;

            if (playOptions.fullscreen) {
                loading.show();
            }

            return runInterceptors(item, playOptions)
                .catch(onInterceptorRejection)
                .then(() => detectBitrate(apiClient, item, mediaType))
                .then((bitrate) => {
                    return playAfterBitrateDetect(bitrate, item, playOptions, onPlaybackStartedFn, prevSource)
                        .catch(onPlaybackRejection);
                })
                .catch(() => {
                    if (playOptions.fullscreen) {
                        loading.hide();
                    }
                });
        }

        /**
         * 取消播放
         *
         * 销毁当前播放器并触发取消事件
         */
        function cancelPlayback() {
            const player = self._currentPlayer;

            if (player) {
                destroyPlayer(player);
                removeCurrentPlayer(player);
            }

            Events.trigger(self, 'playbackcancelled');
        }

        /**
         * 拦截器拒绝处理
         *
         * 当 PreplayIntercept 插件拒绝播放时调用
         */
        function onInterceptorRejection() {
            cancelPlayback();

            return Promise.reject();
        }

        /**
         * 播放拒绝处理
         *
         * 处理播放启动失败,显示相应的错误消息
         *
         * @param {Error|Response} e - 错误对象
         */
        function onPlaybackRejection(e) {
            cancelPlayback();

            let displayErrorCode = 'ErrorDefault';

            if (e instanceof Response) {
                if (e.status >= 500) {
                    displayErrorCode = `PlaybackError.${MediaError.SERVER_ERROR}`;
                } else if (e.status >= 400) {
                    displayErrorCode = `PlaybackError.${MediaError.NO_MEDIA_ERROR}`;
                }
            }

            showPlaybackInfoErrorMessage(self, displayErrorCode);

            return Promise.reject();
        }

        /**
         * 销毁播放器
         *
         * 调用播放器的 destroy 方法释放资源
         *
         * @param {Object} player - 播放器实例
         */
        function destroyPlayer(player) {
            player.destroy();
        }

        /**
         * 运行播放前拦截器
         *
         * 按顺序执行所有 PreplayIntercept 插件
         * 允许插件在播放开始前进行干预(如显示警告、提示等)
         *
         * @param {Object} item - 媒体项目
         * @param {Object} playOptions - 播放选项
         * @returns {Promise} 拦截 Promise
         */
        function runInterceptors(item, playOptions) {
            return new Promise(function (resolve, reject) {
                const interceptors = pluginManager.ofType(PluginType.PreplayIntercept);

                interceptors.sort(function (a, b) {
                    return (a.order || 0) - (b.order || 0);
                });

                if (!interceptors.length) {
                    resolve();
                    return;
                }

                const options = Object.assign({}, playOptions);

                options.mediaType = item.MediaType;
                options.item = item;

                runNextPrePlay(interceptors, 0, options, resolve, reject);
            });
        }

        /**
         * 运行下一个播放前拦截器
         *
         * 递归执行拦截器链
         *
         * @param {Array} interceptors - 拦截器数组
         * @param {number} index - 当前索引
         * @param {Object} options - 选项对象
         * @param {Function} resolve - Promise resolve
         * @param {Function} reject - Promise reject
         */
        function runNextPrePlay(interceptors, index, options, resolve, reject) {
            if (index >= interceptors.length) {
                resolve();
                return;
            }

            const interceptor = interceptors[index];

            interceptor.intercept(options).then(function () {
                runNextPrePlay(interceptors, index + 1, options, resolve, reject);
            }, reject);
        }

        /**
         * 将播放列表发送到播放器
         *
         * 用于不支持本地播放列表管理的播放器(如远程播放器)
         *
         * @param {Object} player - 播放器实例
         * @param {Array} items - 项目数组
         * @param {Object} deviceProfile - 设备配置
         * @param {Object} apiClient - API 客户端
         * @param {string} mediaSourceId - 媒体源 ID
         * @param {Object} options - 选项对象
         * @returns {Promise} 播放 Promise
         */
        function sendPlaybackListToPlayer(player, items, deviceProfile, apiClient, mediaSourceId, options) {
            return setStreamUrls(items, deviceProfile, options.maxBitrate, apiClient, options.startPosition).then(function () {
                loading.hide();

                return player.play({
                    items,
                    startPositionTicks: options.startPosition || 0,
                    mediaSourceId,
                    audioStreamIndex: options.audioStreamIndex,
                    subtitleStreamIndex: options.subtitleStreamIndex,
                    startIndex: options.startIndex
                });
            });
        }

        /**
         * 为下一项评分音轨/字幕流
         *
         * 根据前一项的轨道选择,自动匹配新项目最合适的轨道:
         * - 编解码器相同: +1 分
         * - 相对位置相同: +1 分
         * - 显示标题相同: +2 分
         * - 语言相同(非 und): +2 分
         * - 阈值: 至少 3 分
         *
         * @param {number} prevIndex - 前一项的流索引
         * @param {Object} prevSource - 前一个媒体源
         * @param {Array} mediaStreams - 新项目的媒体流数组
         * @param {Object} trackOptions - 输出选项(DefaultAudioStreamIndex/DefaultSubtitleStreamIndex)
         * @param {string} streamType - 流类型('Audio' 或 'Subtitle')
         * @param {boolean} isSecondarySubtitle - 是否为辅助字幕
         */
        function rankStreamType(prevIndex, prevSource, mediaStreams, trackOptions, streamType, isSecondarySubtitle) {
            if (prevIndex == -1) {
                console.debug(`AutoSet ${streamType} - No Stream Set`);
                if (streamType == 'Subtitle') {
                    if (isSecondarySubtitle) {
                        trackOptions.DefaultSecondarySubtitleStreamIndex = -1;
                    } else {
                        trackOptions.DefaultSubtitleStreamIndex = -1;
                    }
                }
                return;
            }

            if (!prevSource.MediaStreams || !mediaStreams) {
                console.debug(`AutoSet ${streamType} - No MediaStreams`);
                return;
            }

            let bestStreamIndex = null;
            let bestStreamScore = 0;
            const prevStream = prevSource.MediaStreams[prevIndex];

            if (!prevStream) {
                console.debug(`AutoSet ${streamType} - No prevStream`);
                return;
            }

            console.debug(`AutoSet ${streamType} - Previous was ${prevStream.Index} - ${prevStream.DisplayTitle}`);

            let prevRelIndex = 0;
            for (const stream of prevSource.MediaStreams) {
                if (stream.Type != streamType) continue;

                if (stream.Index == prevIndex) break;

                prevRelIndex += 1;
            }

            let newRelIndex = 0;
            for (const stream of mediaStreams) {
                if (stream.Type != streamType) continue;

                let score = 0;

                if (prevStream.Codec == stream.Codec) score += 1;
                if (prevRelIndex == newRelIndex) score += 1;
                if (prevStream.DisplayTitle && prevStream.DisplayTitle == stream.DisplayTitle) score += 2;
                if (prevStream.Language && prevStream.Language != 'und' && prevStream.Language == stream.Language) score += 2;

                console.debug(`AutoSet ${streamType} - Score ${score} for ${stream.Index} - ${stream.DisplayTitle}`);
                if (score > bestStreamScore && score >= 3) {
                    bestStreamScore = score;
                    bestStreamIndex = stream.Index;
                }

                newRelIndex += 1;
            }

            if (bestStreamIndex != null) {
                console.debug(`AutoSet ${streamType} - Using ${bestStreamIndex} score ${bestStreamScore}.`);
                if (streamType == 'Subtitle') {
                    if (isSecondarySubtitle) {
                        trackOptions.DefaultSecondarySubtitleStreamIndex = bestStreamIndex;
                    } else {
                        trackOptions.DefaultSubtitleStreamIndex = bestStreamIndex;
                    }
                }
                if (streamType == 'Audio') {
                    trackOptions.DefaultAudioStreamIndex = bestStreamIndex;
                }
            } else {
                console.debug(`AutoSet ${streamType} - Threshold not met. Using default.`);
            }
        }

        /**
         * 自动设置下一项的轨道
         *
         * 根据用户设置和前一项的选择,自动匹配音轨和字幕轨
         *
         * @param {Object} prevSource - 前一个媒体源
         * @param {Array} mediaStreams - 当前项目的媒体流
         * @param {Object} trackOptions - 输出选项对象
         * @param {boolean} audio - 是否启用音轨记忆
         * @param {boolean} subtitle - 是否启用字幕记忆
         */
        function autoSetNextTracks(prevSource, mediaStreams, trackOptions, audio, subtitle) {
            try {
                if (!prevSource) return;

                if (!mediaStreams) {
                    console.warn('AutoSet - No mediaStreams');
                    return;
                }

                if (audio && typeof prevSource.DefaultAudioStreamIndex == 'number') {
                    rankStreamType(prevSource.DefaultAudioStreamIndex, prevSource, mediaStreams, trackOptions, 'Audio');
                }

                if (subtitle && typeof prevSource.DefaultSubtitleStreamIndex == 'number') {
                    rankStreamType(prevSource.DefaultSubtitleStreamIndex, prevSource, mediaStreams, trackOptions, 'Subtitle');
                }

                if (subtitle && typeof prevSource.DefaultSecondarySubtitleStreamIndex == 'number') {
                    rankStreamType(prevSource.DefaultSecondarySubtitleStreamIndex, prevSource, mediaStreams, trackOptions, 'Subtitle', true);
                }
            } catch (e) {
                console.error(`AutoSet - Caught unexpected error: ${e}`);
            }
        }

        /**
         * 检测网络码率
         *
         * 如果启用了自动码率检测,会测量当前网络速度
         * 否则返回保存的最大码率设置
         *
         * @param {Object} apiClient - API 客户端
         * @param {Object} item - 媒体项目
         * @param {string} mediaType - 媒体类型
         * @returns {Promise<number>} 码率 Promise
         */
        function detectBitrate(apiClient, item, mediaType) {
            // FIXME: This is gnarly, but don't want to change too much here in a bugfix
            return Promise.resolve()
                .then(() => {
                    if (!isServerItem(item) || itemHelper.isLocalItem(item)) {
                        return Promise.reject(new Error('skip bitrate detection'));
                    }

                    return apiClient.getEndpointInfo()
                        .then((endpointInfo) => {
                            if ((mediaType === 'Video' || mediaType === 'Audio') && appSettings.enableAutomaticBitrateDetection(endpointInfo.IsInNetwork, mediaType)) {
                                return apiClient.detectBitrate().then((bitrate) => {
                                    appSettings.maxStreamingBitrate(endpointInfo.IsInNetwork, mediaType, bitrate);
                                    return bitrate;
                                });
                            }

                            return Promise.reject(new Error('skip bitrate detection'));
                        });
                })
                .catch(() => getSavedMaxStreamingBitrate(apiClient, mediaType));
        }

        /**
         * 码率检测后播放
         *
         * 检测码率后执行实际播放:
         * 1. 处理播放器切换
         * 2. 获取设备配置和用户设置
         * 3. 自动选择音轨/字幕轨
         * 4. 获取媒体源并开始播放
         *
         * @param {number} maxBitrate - 最大码率
         * @param {Object} item - 媒体项目
         * @param {Object} playOptions - 播放选项
         * @param {Function} onPlaybackStartedFn - 播放开始回调
         * @param {Object} prevSource - 前一个媒体源
         * @returns {Promise} 播放 Promise
         */
        function playAfterBitrateDetect(maxBitrate, item, playOptions, onPlaybackStartedFn, prevSource) {
            const startPosition = playOptions.startPositionTicks;

            const player = getPlayer(item, playOptions);
            const activePlayer = self._currentPlayer;

            let promise;

            if (activePlayer) {
                // TODO: if changing players within the same playlist, this will cause nextItem to be null
                self._playNextAfterEnded = false;
                promise = onPlaybackChanging(activePlayer, player, item);
            } else {
                promise = Promise.resolve();
            }

            if (!player) {
                return promise.then(() => {
                    cancelPlayback();
                    loading.hide();
                    console.error(`No player found for the requested media: ${item.Url}`);
                    showPlaybackInfoErrorMessage(self, 'ErrorPlayerNotFound');
                });
            }

            if (!isServerItem(item) || item.MediaType === 'Book') {
                return promise.then(function () {
                    const streamInfo = createStreamInfoFromUrlItem(item);
                    streamInfo.fullscreen = playOptions.fullscreen;
                    getPlayerData(player).isChangingStream = false;
                    return player.play(streamInfo).then(() => {
                        loading.hide();
                        onPlaybackStartedFn();
                        onPlaybackStarted(player, playOptions, streamInfo);
                    }).catch((errorCode) => {
                        self.stop(player);
                        loading.hide();
                        showPlaybackInfoErrorMessage(self, errorCode || 'ErrorDefault');
                    });
                });
            }

            let mediaSourceId = playOptions.mediaSourceId;

            const apiClient = ServerConnections.getApiClient(item.ServerId);
            const isLiveTv = [BaseItemKind.TvChannel, BaseItemKind.LiveTvChannel].includes(item.Type);
            const getMediaStreams = isLiveTv ? Promise.resolve([]) : apiClient.getItem(apiClient.getCurrentUserId(), mediaSourceId || item.Id)
                .then(fullItem => {
                    return fullItem.MediaStreams;
                });

            return Promise.all([promise, player.getDeviceProfile(item), apiClient.getCurrentUser(), getMediaStreams]).then(function (responses) {
                const deviceProfile = responses[1];
                const user = responses[2];
                const mediaStreams = responses[3];

                const audioStreamIndex = playOptions.audioStreamIndex;
                const subtitleStreamIndex = playOptions.subtitleStreamIndex;
                const options = {
                    maxBitrate,
                    startPosition,
                    isPlayback: null,
                    audioStreamIndex,
                    subtitleStreamIndex,
                    startIndex: playOptions.startIndex,
                    enableDirectPlay: null,
                    enableDirectStream: null,
                    allowVideoStreamCopy: null,
                    allowAudioStreamCopy: null
                };

                if (player && !enableLocalPlaylistManagement(player)) {
                    return sendPlaybackListToPlayer(player, playOptions.items, deviceProfile, apiClient, mediaSourceId, options);
                }

                // this reference was only needed by sendPlaybackListToPlayer
                playOptions.items = null;

                const trackOptions = {};
                let isIdFallbackNeeded = false;

                autoSetNextTracks(prevSource, mediaStreams, trackOptions, user.Configuration.RememberAudioSelections, user.Configuration.RememberSubtitleSelections);
                if (trackOptions.DefaultAudioStreamIndex != null) {
                    options.audioStreamIndex = trackOptions.DefaultAudioStreamIndex;
                    isIdFallbackNeeded = true;
                }
                if (trackOptions.DefaultSubtitleStreamIndex != null) {
                    options.subtitleStreamIndex = trackOptions.DefaultSubtitleStreamIndex;
                    isIdFallbackNeeded = true;
                }

                if (isIdFallbackNeeded) {
                    mediaSourceId ||= item.Id;
                }

                return getPlaybackMediaSource(player, apiClient, deviceProfile, item, mediaSourceId, options).then(async (mediaSource) => {
                    if (trackOptions.DefaultSecondarySubtitleStreamIndex != null) {
                        mediaSource.DefaultSecondarySubtitleStreamIndex = trackOptions.DefaultSecondarySubtitleStreamIndex;
                    }

                    if (mediaSource.DefaultSubtitleStreamIndex == null || mediaSource.DefaultSubtitleStreamIndex < 0) {
                        if (mediaSource.DefaultSecondarySubtitleStreamIndex != null) {
                            mediaSource.DefaultSubtitleStreamIndex = mediaSource.DefaultSecondarySubtitleStreamIndex;
                        }
                        mediaSource.DefaultSecondarySubtitleStreamIndex = -1;
                    }

                    const subtitleTrack1 = mediaSource.MediaStreams[mediaSource.DefaultSubtitleStreamIndex];
                    const subtitleTrack2 = mediaSource.MediaStreams[mediaSource.DefaultSecondarySubtitleStreamIndex];

                    if (!self.trackHasSecondarySubtitleSupport(subtitleTrack1, player)
                        || !self.trackHasSecondarySubtitleSupport(subtitleTrack2, player)) {
                        mediaSource.DefaultSecondarySubtitleStreamIndex = -1;
                    }

                    const streamInfo = createStreamInfo(apiClient, item.MediaType, item, mediaSource, startPosition, player);

                    streamInfo.fullscreen = playOptions.fullscreen;

                    const playerData = getPlayerData(player);

                    playerData.isChangingStream = false;
                    playerData.maxStreamingBitrate = maxBitrate;
                    playerData.streamInfo = streamInfo;

                    return player.play(streamInfo).then(function () {
                        loading.hide();
                        onPlaybackStartedFn();
                        onPlaybackStarted(player, playOptions, streamInfo, mediaSource);
                    }, function (err) {
                        // TODO: Improve this because it will report playback start on a failure
                        onPlaybackStartedFn();
                        onPlaybackStarted(player, playOptions, streamInfo, mediaSource);
                        setTimeout(function () {
                            onPlaybackError.call(player, err, {
                                type: getMediaError(err),
                                streamInfo
                            });
                        }, 100);
                    });
                });
            });
        }

        self.getPlaybackInfo = function (item, options) {
            options = options || {};
            const startPosition = options.startPositionTicks || 0;
            const mediaType = options.mediaType || item.MediaType;
            const player = getPlayer(item, options);
            const apiClient = ServerConnections.getApiClient(item.ServerId);

            // Call this just to ensure the value is recorded, it is needed with getSavedMaxStreamingBitrate
            return apiClient.getEndpointInfo().then(function () {
                const maxBitrate = getSavedMaxStreamingBitrate(ServerConnections.getApiClient(item.ServerId), mediaType);

                return player.getDeviceProfile(item).then(function (deviceProfile) {
                    const mediaOptions = {
                        maxBitrate,
                        startPosition,
                        isPlayback: null,
                        audioStreamIndex: options.audioStreamIndex,
                        subtitleStreamIndex: options.subtitleStreamIndex,
                        startIndex: null,
                        enableDirectPlay: null,
                        enableDirectStream: null,
                        allowVideoStreamCopy: null,
                        allowAudioStreamCopy: null
                    };

                    return getPlaybackMediaSource(player, apiClient, deviceProfile, item, options.mediaSourceId, mediaOptions).then(function (mediaSource) {
                        return createStreamInfo(apiClient, item.MediaType, item, mediaSource, startPosition, player);
                    });
                });
            });
        };

        self.getPlaybackMediaSources = function (item, options) {
            options = options || {};
            const startPosition = options.startPositionTicks || 0;
            const mediaType = options.mediaType || item.MediaType;
            // TODO: Remove the true forceLocalPlayer hack
            const player = getPlayer(item, options, true);
            const apiClient = ServerConnections.getApiClient(item.ServerId);

            // Call this just to ensure the value is recorded, it is needed with getSavedMaxStreamingBitrate
            return apiClient.getEndpointInfo().then(function () {
                const maxBitrate = getSavedMaxStreamingBitrate(ServerConnections.getApiClient(item.ServerId), mediaType);

                return player.getDeviceProfile(item).then(function (deviceProfile) {
                    const mediaOptions = {
                        maxBitrate,
                        startPosition,
                        isPlayback: true,
                        audioStreamIndex: null,
                        subtitleStreamIndex: null,
                        enableDirectPlay: null,
                        enableDirectStream: null,
                        allowVideoStreamCopy: null,
                        allowAudioStreamCopy: null
                    };

                    return getPlaybackInfo(player, apiClient, item, deviceProfile, null, null, mediaOptions).then(function (playbackInfoResult) {
                        return playbackInfoResult.MediaSources;
                    });
                });
            });
        };

        /**
         * 创建流信息对象
         *
         * 根据媒体源生成流信息,包括:
         * - URL 和 MIME 类型
         * - 播放方法(DirectPlay/DirectStream/Transcode)
         * - 字幕轨道信息
         * - 转码偏移量
         *
         * @param {Object} apiClient - API 客户端
         * @param {string} type - 媒体类型
         * @param {Object} item - 媒体项目
         * @param {Object} mediaSource - 媒体源对象
         * @param {number} startPosition - 起始位置(ticks)
         * @param {Object} player - 播放器实例
         * @returns {Object} 流信息对象
         */
        function createStreamInfo(apiClient, type, item, mediaSource, startPosition, player) {
            let mediaUrl;
            let contentType;
            let transcodingOffsetTicks = 0;
            const playerStartPositionTicks = startPosition;
            const liveStreamId = mediaSource.LiveStreamId;

            let playMethod = 'Transcode';

            const mediaSourceContainer = (mediaSource.Container || '').toLowerCase();
            let directOptions;

            if (mediaSource.MediaStreams && player.useFullSubtitleUrls) {
                mediaSource.MediaStreams.forEach(stream => {
                    if (stream.DeliveryUrl?.startsWith('/')) {
                        stream.DeliveryUrl = apiClient.getUrl(stream.DeliveryUrl);
                    }
                });
            }

            if (type === 'Video' || type === 'Audio') {
                contentType = getMimeType(type.toLowerCase(), mediaSourceContainer);

                if (mediaSource.enableDirectPlay) {
                    mediaUrl = mediaSource.Path;

                    playMethod = 'DirectPlay';
                } else if (mediaSource.StreamUrl) {
                    // Only used for audio
                    mediaUrl = mediaSource.StreamUrl;
                    // Use the default playMethod value of Transcode
                } else if (mediaSource.SupportsDirectPlay || mediaSource.SupportsDirectStream) {
                    directOptions = {
                        Static: true,
                        mediaSourceId: mediaSource.Id,
                        deviceId: apiClient.deviceId(),
                        api_key: apiClient.accessToken()
                    };

                    if (mediaSource.ETag) {
                        directOptions.Tag = mediaSource.ETag;
                    }

                    if (mediaSource.LiveStreamId) {
                        directOptions.LiveStreamId = mediaSource.LiveStreamId;
                    }

                    const prefix = type === 'Video' ? 'Videos' : 'Audio';
                    mediaUrl = apiClient.getUrl(prefix + '/' + item.Id + '/stream.' + mediaSourceContainer, directOptions);

                    playMethod = mediaSource.SupportsDirectPlay ? 'DirectPlay' : 'DirectStream';
                } else if (mediaSource.SupportsTranscoding) {
                    mediaUrl = apiClient.getUrl(mediaSource.TranscodingUrl);

                    if (mediaSource.TranscodingSubProtocol === 'hls') {
                        contentType = 'application/x-mpegURL';
                    } else {
                        contentType = getMimeType(type.toLowerCase(), mediaSource.TranscodingContainer);

                        if (mediaUrl.toLowerCase().indexOf('copytimestamps=true') === -1) {
                            transcodingOffsetTicks = startPosition || 0;
                        }
                    }
                }
            } else {
                // All other media types
                mediaUrl = mediaSource.Path;
                playMethod = 'DirectPlay';
            }

            // Fallback (used for offline items)
            if (!mediaUrl && mediaSource.SupportsDirectPlay) {
                mediaUrl = mediaSource.Path;
                playMethod = 'DirectPlay';
            }

            const resultInfo = {
                url: mediaUrl,
                mimeType: contentType,
                transcodingOffsetTicks: transcodingOffsetTicks,
                playMethod: playMethod,
                playerStartPositionTicks: playerStartPositionTicks,
                item: item,
                mediaSource: mediaSource,
                textTracks: getTextTracks(apiClient, item, mediaSource),
                // TODO: Deprecate
                tracks: getTextTracks(apiClient, item, mediaSource),
                mediaType: type,
                liveStreamId: liveStreamId,
                playSessionId: getParam('playSessionId', mediaUrl),
                title: item.Name
            };

            const backdropUrl = getItemBackdropImageUrl(apiClient, item, {}, true);
            if (backdropUrl) {
                resultInfo.backdropUrl = backdropUrl;
            }

            return resultInfo;
        }

        /**
         * 获取文本轨道(外部字幕)
         *
         * 过滤出 DeliveryMethod 为 'External' 的字幕流
         * 这些字幕会以单独的文件加载
         *
         * @param {Object} apiClient - API 客户端
         * @param {Object} item - 媒体项目
         * @param {Object} mediaSource - 媒体源对象
         * @returns {Array} 字幕轨道数组
         */
        function getTextTracks(apiClient, item, mediaSource) {
            const subtitleStreams = mediaSource.MediaStreams.filter(function (s) {
                return s.Type === 'Subtitle';
            });

            const textStreams = subtitleStreams.filter(function (s) {
                return s.DeliveryMethod === 'External';
            });

            const tracks = [];

            for (let i = 0, length = textStreams.length; i < length; i++) {
                const textStream = textStreams[i];
                let textStreamUrl;

                if (itemHelper.isLocalItem(item)) {
                    textStreamUrl = textStream.Path;
                } else {
                    textStreamUrl = !textStream.IsExternalUrl ? apiClient.getUrl(textStream.DeliveryUrl) : textStream.DeliveryUrl;
                }

                tracks.push({
                    url: textStreamUrl,
                    language: (textStream.Language || 'und'),
                    isDefault: textStream.Index === mediaSource.DefaultSubtitleStreamIndex,
                    index: textStream.Index,
                    format: textStream.Codec
                });
            }

            return tracks;
        }

        /**
         * 获取播放媒体源
         *
         * 执行完整的媒体源获取流程:
         * 1. 获取播放信息
         * 2. 选择最优媒体源
         * 3. 如需要,打开直播流
         * 4. 检查是否支持直接播放
         *
         * @param {Object} player - 播放器实例
         * @param {Object} apiClient - API 客户端
         * @param {Object} deviceProfile - 设备配置
         * @param {Object} item - 媒体项目
         * @param {string} mediaSourceId - 媒体源 ID
         * @param {Object} options - 选项对象
         * @returns {Promise<Object>} 媒体源 Promise
         */
        function getPlaybackMediaSource(player, apiClient, deviceProfile, item, mediaSourceId, options) {
            options.isPlayback = true;

            return getPlaybackInfo(player, apiClient, item, deviceProfile, mediaSourceId, null, options).then(function (playbackInfoResult) {
                if (validatePlaybackInfoResult(self, playbackInfoResult)) {
                    return getOptimalMediaSource(apiClient, item, playbackInfoResult.MediaSources).then(function (mediaSource) {
                        if (mediaSource) {
                            if (mediaSource.RequiresOpening && !mediaSource.LiveStreamId) {
                                options.audioStreamIndex = null;
                                options.subtitleStreamIndex = null;

                                return getLiveStream(player, apiClient, item, playbackInfoResult.PlaySessionId, deviceProfile, mediaSource, options).then(function (openLiveStreamResult) {
                                    return supportsDirectPlay(apiClient, item, openLiveStreamResult.MediaSource).then(function (result) {
                                        openLiveStreamResult.MediaSource.enableDirectPlay = result;
                                        return openLiveStreamResult.MediaSource;
                                    });
                                });
                            } else {
                                if (item.AlbumId != null) {
                                    return apiClient.getItem(apiClient.getCurrentUserId(), item.AlbumId).then(function(result) {
                                        mediaSource.albumNormalizationGain = result.NormalizationGain;
                                        return mediaSource;
                                    });
                                }
                                return mediaSource;
                            }
                        } else {
                            showPlaybackInfoErrorMessage(self, `PlaybackError.${MediaError.NO_MEDIA_ERROR}`);
                            return Promise.reject();
                        }
                    });
                } else {
                    return Promise.reject();
                }
            });
        }

        /**
         * 获取适合的播放器
         *
         * 从自动播放器列表中选择第一个支持该项目的播放器
         *
         * @param {Object} item - 媒体项目
         * @param {Object} playOptions - 播放选项
         * @param {boolean} forceLocalPlayers - 强制使用本地播放器
         * @returns {Object} 播放器实例
         */
        function getPlayer(item, playOptions, forceLocalPlayers) {
            const serverItem = isServerItem(item);
            return getAutomaticPlayers(self, forceLocalPlayers).filter(function (p) {
                if (p.canPlayMediaType(item.MediaType)) {
                    if (serverItem) {
                        if (p.canPlayItem) {
                            return p.canPlayItem(item, playOptions);
                        }
                        return true;
                    } else if (item.Url && p.canPlayUrl) {
                        return p.canPlayUrl(item.Url);
                    }
                }

                return false;
            })[0];
        }

        self.getItemFromPlaylistItemId = function (playlistItemId) {
            let item;
            let itemIndex;
            const playlist = self._playQueueManager.getPlaylist();

            for (let i = 0, length = playlist.length; i < length; i++) {
                if (playlist[i].PlaylistItemId === playlistItemId) {
                    item = playlist[i];
                    itemIndex = i;
                    break;
                }
            }

            return {
                Item: item,
                Index: itemIndex
            };
        };

        self.setCurrentPlaylistItem = function (playlistItemId, player) {
            player = player || self._currentPlayer;
            if (player && !enableLocalPlaylistManagement(player)) {
                return player.setCurrentPlaylistItem(playlistItemId);
            }

            const newItem = self.getItemFromPlaylistItemId(playlistItemId);

            if (newItem.Item) {
                const newItemPlayOptions = newItem.Item.playOptions || getDefaultPlayOptions();

                playInternal(newItem.Item, newItemPlayOptions, function () {
                    setPlaylistState(newItem.Item.PlaylistItemId, newItem.Index);
                });
            }
        };

        self.removeFromPlaylist = function (playlistItemIds, player) {
            if (!playlistItemIds) {
                throw new Error('Invalid playlistItemIds');
            }

            player = player || self._currentPlayer;
            if (player && !enableLocalPlaylistManagement(player)) {
                return player.removeFromPlaylist(playlistItemIds);
            }

            const removeResult = self._playQueueManager.removeFromPlaylist(playlistItemIds);

            if (removeResult.result === 'empty') {
                return self.stop(player);
            }

            const isCurrentIndex = removeResult.isCurrentIndex;

            Events.trigger(player, 'playlistitemremove', [
                {
                    playlistItemIds: playlistItemIds
                }
            ]);

            if (isCurrentIndex) {
                return self.setCurrentPlaylistItem(self._playQueueManager.getPlaylist()[0].PlaylistItemId, player);
            }

            return Promise.resolve();
        };

        self.movePlaylistItem = function (playlistItemId, newIndex, player) {
            player = player || self._currentPlayer;
            if (player && !enableLocalPlaylistManagement(player)) {
                return player.movePlaylistItem(playlistItemId, newIndex);
            }

            const moveResult = self._playQueueManager.movePlaylistItem(playlistItemId, newIndex);

            if (moveResult.result === 'noop') {
                return;
            }

            Events.trigger(player, 'playlistitemmove', [
                {
                    playlistItemId: moveResult.playlistItemId,
                    newIndex: moveResult.newIndex
                }
            ]);
        };

        self.getCurrentPlaylistIndex = function (player) {
            player = player || self._currentPlayer;
            if (player && !enableLocalPlaylistManagement(player)) {
                return player.getCurrentPlaylistIndex();
            }

            return self._playQueueManager.getCurrentPlaylistIndex();
        };

        self.getCurrentPlaylistItemId = function (player) {
            player = player || self._currentPlayer;
            if (player && !enableLocalPlaylistManagement(player)) {
                return player.getCurrentPlaylistItemId();
            }

            return self._playQueueManager.getCurrentPlaylistItemId();
        };

        self.channelUp = function (player) {
            player = player || self._currentPlayer;
            return self.nextTrack(player);
        };

        self.channelDown = function (player) {
            player = player || self._currentPlayer;
            return self.previousTrack(player);
        };

        /**
         * 获取前一个媒体源
         *
         * 合并当前媒体源和播放器数据,用于自动选择下一项的轨道
         *
         * @param {Object} player - 播放器实例
         * @returns {Object} 包含默认轨道索引的媒体源对象
         */
        function getPreviousSource(player) {
            const prevSource = self.currentMediaSource(player);
            const prevPlayerData = getPlayerData(player);
            return {
                ...prevSource,
                DefaultAudioStreamIndex: prevPlayerData.audioStreamIndex,
                DefaultSubtitleStreamIndex: prevPlayerData.subtitleStreamIndex,
                DefaultSecondarySubtitleStreamIndex: prevPlayerData.secondarySubtitleStreamIndex
            };
        }

        self.nextTrack = function (player) {
            player = player || self._currentPlayer;
            if (player && !enableLocalPlaylistManagement(player)) {
                return player.nextTrack();
            }

            const newItemInfo = self._playQueueManager.getNextItemInfo();

            if (newItemInfo) {
                console.debug('playing next track');

                const newItemPlayOptions = newItemInfo.item.playOptions || getDefaultPlayOptions();

                playInternal(newItemInfo.item, newItemPlayOptions, function () {
                    setPlaylistState(newItemInfo.item.PlaylistItemId, newItemInfo.index);
                }, getPreviousSource(player));
            }
        };

        self.previousTrack = function (player) {
            player = player || self._currentPlayer;
            if (player && !enableLocalPlaylistManagement(player)) {
                return player.previousTrack();
            }

            const newIndex = self.getCurrentPlaylistIndex(player) - 1;
            if (newIndex >= 0) {
                const playlist = self._playQueueManager.getPlaylist();
                const newItem = playlist[newIndex];

                if (newItem) {
                    const newItemPlayOptions = newItem.playOptions || getDefaultPlayOptions();
                    newItemPlayOptions.startPositionTicks = 0;

                    playInternal(newItem, newItemPlayOptions, function () {
                        setPlaylistState(newItem.PlaylistItemId, newIndex);
                    }, getPreviousSource(player));
                }
            }
        };

        self.queue = function (options, player = this._currentPlayer) {
            return queue(options, '', player);
        };

        self.queueNext = function (options, player = this._currentPlayer) {
            return queue(options, 'next', player);
        };

        /**
         * 添加到播放队列
         *
         * @param {Object} options - 队列选项
         * @param {string} mode - 模式('' 或 'next')
         * @param {Object} player - 播放器实例
         * @returns {Promise} 队列 Promise
         */
        function queue(options, mode, player) {
            player = player || self._currentPlayer;

            if (!player) {
                return self.play(options);
            }

            if (options.items) {
                return translateItemsForPlayback(options.items, options).then(function (items) {
                    // TODO: Handle options.startIndex for photos
                    queueAll(items, mode, player);
                });
            } else {
                if (!options.serverId) {
                    throw new Error('serverId required!');
                }

                return getItemsForPlayback(options.serverId, {
                    Ids: options.ids.join(',')
                }).then(function (result) {
                    return translateItemsForPlayback(result.Items, options).then(function (items) {
                        // TODO: Handle options.startIndex for photos
                        queueAll(items, mode, player);
                    });
                });
            }
        }

        /**
         * 将所有项目添加到队列
         *
         * 根据播放器类型和模式选择不同的队列方式
         *
         * @param {Array} items - 项目数组
         * @param {string} mode - 模式('' 或 'next')
         * @param {Object} player - 播放器实例
         */
        function queueAll(items, mode, player) {
            if (!items.length) {
                return;
            }

            if (!player.isLocalPlayer) {
                if (mode === 'next') {
                    player.queueNext({
                        items: items
                    });
                } else {
                    player.queue({
                        items: items
                    });
                }
                return;
            }

            const queueDirectToPlayer = player && !enableLocalPlaylistManagement(player);

            if (queueDirectToPlayer) {
                const apiClient = ServerConnections.getApiClient(items[0].ServerId);

                player.getDeviceProfile(items[0]).then(function (profile) {
                    setStreamUrls(items, profile, self.getMaxStreamingBitrate(player), apiClient, 0).then(function () {
                        if (mode === 'next') {
                            player.queueNext(items);
                        } else {
                            player.queue(items);
                        }
                    });
                });

                return;
            }

            if (mode === 'next') {
                self._playQueueManager.queueNext(items);
            } else {
                self._playQueueManager.queue(items);
            }
            Events.trigger(player, 'playlistitemadd');
        }

        /**
         * 播放进度间隔处理
         *
         * 每 10 秒触发一次,发送进度更新到服务器
         */
        function onPlayerProgressInterval() {
            const player = this;
            sendProgressUpdate(player, 'timeupdate');
        }

        /**
         * 启动播放进度计时器
         *
         * @param {Object} player - 播放器实例
         */
        function startPlaybackProgressTimer(player) {
            stopPlaybackProgressTimer(player);

            player._progressInterval = setInterval(onPlayerProgressInterval.bind(player), 10000);
        }

        /**
         * 停止播放进度计时器
         *
         * @param {Object} player - 播放器实例
         */
        function stopPlaybackProgressTimer(player) {
            if (player._progressInterval) {
                clearInterval(player._progressInterval);
                player._progressInterval = null;
            }
        }

        /**
         * 播放开始处理
         *
         * 处理播放开始事件:
         * 1. 设置当前播放器
         * 2. 保存流信息和轨道选择
         * 3. 上报播放开始到服务器
         * 4. 触发 playbackstart 事件
         * 5. 启动进度计时器
         *
         * @param {Object} player - 播放器实例
         * @param {Object} playOptions - 播放选项
         * @param {Object} streamInfo - 流信息对象
         * @param {Object} mediaSource - 媒体源对象
         */
        function onPlaybackStarted(player, playOptions, streamInfo, mediaSource) {
            if (!player) {
                throw new Error('player cannot be null');
            }

            setCurrentPlayerInternal(player);

            const playerData = getPlayerData(player);

            playerData.streamInfo = streamInfo;

            streamInfo.playbackStartTimeTicks = new Date().getTime() * 10000;

            if (mediaSource) {
                playerData.audioStreamIndex = mediaSource.DefaultAudioStreamIndex;
                playerData.subtitleStreamIndex = mediaSource.DefaultSubtitleStreamIndex;
                playerData.secondarySubtitleStreamIndex = mediaSource.DefaultSecondarySubtitleStreamIndex;
            } else {
                playerData.audioStreamIndex = null;
                playerData.subtitleStreamIndex = null;
                playerData.secondarySubtitleStreamIndex = null;
            }

            self._playNextAfterEnded = true;
            const isFirstItem = playOptions.isFirstItem;
            const fullscreen = playOptions.fullscreen;

            const state = self.getPlayerState(player, streamInfo.item, streamInfo.mediaSource);

            reportPlayback(self, state, player, true, state.NowPlayingItem.ServerId, 'reportPlaybackStart');

            state.IsFirstItem = isFirstItem;
            state.IsFullscreen = fullscreen;
            Events.trigger(player, 'playbackstart', [state]);
            Events.trigger(self, 'playbackstart', [player, state]);

            // only used internally as a safeguard to avoid reporting other events to the server before playback start
            streamInfo.started = true;

            startPlaybackProgressTimer(player);
        }

        /**
         * 自管理播放器的播放开始处理
         *
         * 用于不支持本地播放列表管理的播放器(如远程播放器)
         *
         * @param {Event} e - 事件对象
         * @param {Object} item - 媒体项目
         * @param {Object} mediaSource - 媒体源
         */
        function onPlaybackStartedFromSelfManagingPlayer(e, item, mediaSource) {
            const player = this;
            setCurrentPlayerInternal(player);

            const playOptions = item.playOptions || getDefaultPlayOptions();
            const isFirstItem = playOptions.isFirstItem;
            const fullscreen = playOptions.fullscreen;

            playOptions.isFirstItem = false;

            const playerData = getPlayerData(player);
            playerData.streamInfo = {};

            const streamInfo = playerData.streamInfo;
            streamInfo.playbackStartTimeTicks = new Date().getTime() * 10000;

            const state = self.getPlayerState(player, item, mediaSource);

            reportPlayback(self, state, player, true, state.NowPlayingItem.ServerId, 'reportPlaybackStart');

            state.IsFirstItem = isFirstItem;
            state.IsFullscreen = fullscreen;
            Events.trigger(player, 'playbackstart', [state]);
            Events.trigger(self, 'playbackstart', [player, state]);

            // only used internally as a safeguard to avoid reporting other events to the server before playback start
            streamInfo.started = true;

            startPlaybackProgressTimer(player);
        }

        /**
         * 自管理播放器的播放停止处理
         *
         * @param {Event} e - 事件对象
         * @param {Object} playerStopInfo - 停止信息对象
         */
        function onPlaybackStoppedFromSelfManagingPlayer(e, playerStopInfo) {
            const player = this;

            stopPlaybackProgressTimer(player);
            const state = self.getPlayerState(player, playerStopInfo.item, playerStopInfo.mediaSource);

            const nextItem = playerStopInfo.nextItem;
            const nextMediaType = playerStopInfo.nextMediaType;

            const playbackStopInfo = {
                player: player,
                state: state,
                nextItem: (nextItem ? nextItem.item : null),
                nextMediaType: nextMediaType
            };

            state.NextMediaType = nextMediaType;

            const streamInfo = getPlayerData(player).streamInfo;

            // only used internally as a safeguard to avoid reporting other events to the server after playback stopped
            streamInfo.ended = true;

            if (isServerItem(playerStopInfo.item)) {
                state.PlayState.PositionTicks = (playerStopInfo.positionMs || 0) * 10000;

                reportPlayback(self, state, player, true, playerStopInfo.item.ServerId, 'reportPlaybackStopped');
            }

            state.NextItem = playbackStopInfo.nextItem;

            Events.trigger(player, 'playbackstop', [state]);
            Events.trigger(self, 'playbackstop', [playbackStopInfo]);

            const nextItemPlayOptions = nextItem ? (nextItem.item.playOptions || getDefaultPlayOptions()) : getDefaultPlayOptions();
            const newPlayer = nextItem ? getPlayer(nextItem.item, nextItemPlayOptions) : null;

            if (newPlayer !== player) {
                destroyPlayer(player);
                removeCurrentPlayer(player);
            }
        }

        /**
         * 检查是否应该重试转码
         *
         * 当播放出错时,判断是否可以通过强制转码来解决
         *
         * @param {object} streamInfo - 流信息
         * @param {MediaError} errorType - 错误类型
         * @param {boolean} currentlyPreventsVideoStreamCopy - 当前是否禁止视频流复制
         * @param {boolean} currentlyPreventsAudioStreamCopy - 当前是否禁止音频流复制
         * @returns {boolean} 是否应该重试转码
         */
        function enablePlaybackRetryWithTranscoding(streamInfo, errorType, currentlyPreventsVideoStreamCopy, currentlyPreventsAudioStreamCopy) {
            return streamInfo.mediaSource.SupportsTranscoding
                && (!currentlyPreventsVideoStreamCopy || !currentlyPreventsAudioStreamCopy);
        }

        /**
         * Playback error handler.
         * @param {Error} e
         * @param {object} error
         * @param {object} error.streamInfo
         * @param {MediaError} error.type
         */
        function onPlaybackError(e, error) {
            const player = this;
            error = error || {};

            const errorType = error.type;

            console.warn('[playbackmanager] onPlaybackError:', e, error);

            const streamInfo = error.streamInfo || getPlayerData(player).streamInfo;

            if (streamInfo?.url) {
                const isAlreadyFallbacking = streamInfo.url.toLowerCase().includes('transcodereasons');
                const currentlyPreventsVideoStreamCopy = streamInfo.url.toLowerCase().indexOf('allowvideostreamcopy=false') !== -1;
                const currentlyPreventsAudioStreamCopy = streamInfo.url.toLowerCase().indexOf('allowaudiostreamcopy=false') !== -1;

                // Auto switch to transcoding
                if (enablePlaybackRetryWithTranscoding(streamInfo, errorType, currentlyPreventsVideoStreamCopy, currentlyPreventsAudioStreamCopy)) {
                    const startTime = getCurrentTicks(player) || streamInfo.playerStartPositionTicks;
                    const isRemoteSource = streamInfo.item.LocationType === 'Remote';
                    // force transcoding and only allow remuxing for remote source like liveTV, but only for initial trial
                    const tryVideoStreamCopy = isRemoteSource && !isAlreadyFallbacking;

                    changeStream(player, startTime, {
                        EnableDirectPlay: false,
                        EnableDirectStream: tryVideoStreamCopy,
                        AllowVideoStreamCopy: tryVideoStreamCopy,
                        AllowAudioStreamCopy: currentlyPreventsAudioStreamCopy || currentlyPreventsVideoStreamCopy ? false : null
                    });

                    return;
                }
            }

            Events.trigger(self, 'playbackerror', [errorType]);

            onPlaybackStopped.call(player, e, `.${errorType}`);
        }

        /**
         * 播放停止处理
         *
         * 处理播放停止事件:
         * 1. 停止进度计时器
         * 2. 上报播放停止到服务器
         * 3. 触发 playbackstop 事件
         * 4. 处理下一项或错误显示
         *
         * @param {Event} e - 事件对象
         * @param {string} displayErrorCode - 错误代码(可选)
         */
        function onPlaybackStopped(e, displayErrorCode) {
            const player = this;

            if (getPlayerData(player).isChangingStream) {
                return;
            }

            stopPlaybackProgressTimer(player);

            // User clicked stop or content ended
            const state = self.getPlayerState(player);
            const data = getPlayerData(player);
            const streamInfo = data.streamInfo;

            const errorOccurred = displayErrorCode && typeof (displayErrorCode) === 'string';

            const nextItem = self._playNextAfterEnded && !errorOccurred ? self._playQueueManager.getNextItemInfo() : null;

            const nextMediaType = (nextItem ? nextItem.item.MediaType : null);

            const playbackStopInfo = {
                player: player,
                state: state,
                nextItem: (nextItem ? nextItem.item : null),
                nextMediaType: nextMediaType
            };

            state.NextMediaType = nextMediaType;

            if (streamInfo && isServerItem(streamInfo.item)) {
                if (player.supportsProgress === false && state.PlayState && !state.PlayState.PositionTicks) {
                    state.PlayState.PositionTicks = streamInfo.item.RunTimeTicks;
                }

                // only used internally as a safeguard to avoid reporting other events to the server after playback stopped
                streamInfo.ended = true;

                reportPlayback(self, state, player, true, streamInfo.item.ServerId, 'reportPlaybackStopped');
            }

            state.NextItem = playbackStopInfo.nextItem;

            if (!nextItem) {
                self._playQueueManager.reset();
            }

            Events.trigger(player, 'playbackstop', [state]);
            Events.trigger(self, 'playbackstop', [playbackStopInfo]);

            const nextItemPlayOptions = nextItem ? (nextItem.item.playOptions || getDefaultPlayOptions()) : getDefaultPlayOptions();
            const newPlayer = nextItem ? getPlayer(nextItem.item, nextItemPlayOptions) : null;

            if (newPlayer !== player) {
                data.streamInfo = null;
                destroyPlayer(player);
                removeCurrentPlayer(player);
            }

            if (errorOccurred) {
                showPlaybackInfoErrorMessage(self, 'PlaybackError' + displayErrorCode);
            } else if (nextItem) {
                const apiClient = ServerConnections.getApiClient(nextItem.item.ServerId);

                apiClient.getCurrentUser().then(function (user) {
                    if (user.Configuration.EnableNextEpisodeAutoPlay || nextMediaType !== MediaType.Video) {
                        self.nextTrack();
                    }
                });
            }
        }

        /**
         * 播放切换处理
         *
         * 在新项目开始播放时,处理当前播放器的清理工作
         *
         * @param {Object} activePlayer - 当前活跃播放器
         * @param {Object} newPlayer - 新播放器
         * @param {Object} newItem - 新项目
         * @returns {Promise} 切换 Promise
         */
        function onPlaybackChanging(activePlayer, newPlayer, newItem) {
            const state = self.getPlayerState(activePlayer);

            const serverId = self.currentItem(activePlayer).ServerId;

            // User started playing something new while existing content is playing
            let promise;

            stopPlaybackProgressTimer(activePlayer);
            unbindStopped(activePlayer);

            if (activePlayer === newPlayer) {
                // If we're staying with the same player, stop it
                promise = activePlayer.stop(false);
            } else {
                // If we're switching players, tear down the current one
                promise = activePlayer.stop(true);
            }

            return promise.then(function () {
                // Clear the data since we were not listening 'stopped'
                getPlayerData(activePlayer).streamInfo = null;

                bindStopped(activePlayer);

                if (enableLocalPlaylistManagement(activePlayer)) {
                    reportPlayback(self, state, activePlayer, true, serverId, 'reportPlaybackStopped');
                }

                Events.trigger(self, 'playbackstop', [{
                    player: activePlayer,
                    state: state,
                    nextItem: newItem,
                    nextMediaType: newItem.MediaType
                }]);
            });
        }

        /**
         * 绑定停止事件
         *
         * @param {Object} player - 播放器实例
         */
        function bindStopped(player) {
            if (enableLocalPlaylistManagement(player)) {
                Events.off(player, 'stopped', onPlaybackStopped);
                Events.on(player, 'stopped', onPlaybackStopped);
            }
        }

        /**
         * 播放时间更新事件处理
         */
        function onPlaybackTimeUpdate() {
            const player = this;
            sendProgressUpdate(player, 'timeupdate');
        }

        /**
         * 播放暂停事件处理
         */
        function onPlaybackPause() {
            const player = this;
            sendProgressUpdate(player, 'pause');
        }

        /**
         * 播放恢复事件处理
         */
        function onPlaybackUnpause() {
            const player = this;
            sendProgressUpdate(player, 'unpause');
        }

        /**
         * 音量变化事件处理
         */
        function onPlaybackVolumeChange() {
            const player = this;
            sendProgressUpdate(player, 'volumechange');
        }

        /**
         * 重复模式变化事件处理
         */
        function onRepeatModeChange() {
            const player = this;
            sendProgressUpdate(player, 'repeatmodechange');
        }

        /**
         * 随机队列模式变化事件处理
         */
        function onShuffleQueueModeChange() {
            const player = this;
            sendProgressUpdate(player, 'shufflequeuemodechange');
        }

        /**
         * 播放列表项移动事件处理
         */
        function onPlaylistItemMove() {
            const player = this;
            sendProgressUpdate(player, 'playlistitemmove', true);
        }

        /**
         * 播放列表项移除事件处理
         */
        function onPlaylistItemRemove() {
            const player = this;
            sendProgressUpdate(player, 'playlistitemremove', true);
        }

        /**
         * 播放列表项添加事件处理
         */
        function onPlaylistItemAdd() {
            const player = this;
            sendProgressUpdate(player, 'playlistitemadd', true);
        }

        /**
         * 解除绑定停止事件
         *
         * @param {Object} player - 播放器实例
         */
        function unbindStopped(player) {
            Events.off(player, 'stopped', onPlaybackStopped);
        }

        /**
         * 初始化传统音量方法
         *
         * 为老版本播放器添加 getVolume/setVolume 方法
         *
         * @param {Object} player - 播放器实例
         */
        function initLegacyVolumeMethods(player) {
            player.getVolume = function () {
                return player.volume();
            };
            player.setVolume = function (val) {
                return player.volume(val);
            };
        }

        /**
         * 初始化媒体播放器
         *
         * 注册新播放器并绑定必要的事件处理程序
         *
         * @param {Object} player - 播放器实例
         */
        function initMediaPlayer(player) {
            players.push(player);
            players.sort(function (a, b) {
                return (a.priority || 0) - (b.priority || 0);
            });

            if (player.isLocalPlayer !== false) {
                player.isLocalPlayer = true;
            }

            player.currentState = {};

            if (!player.getVolume || !player.setVolume) {
                initLegacyVolumeMethods(player);
            }

            if (enableLocalPlaylistManagement(player)) {
                Events.on(player, 'error', onPlaybackError);
                Events.on(player, 'timeupdate', onPlaybackTimeUpdate);
                Events.on(player, 'pause', onPlaybackPause);
                Events.on(player, 'unpause', onPlaybackUnpause);
                Events.on(player, 'volumechange', onPlaybackVolumeChange);
                Events.on(player, 'repeatmodechange', onRepeatModeChange);
                Events.on(player, 'shufflequeuemodechange', onShuffleQueueModeChange);
                Events.on(player, 'playlistitemmove', onPlaylistItemMove);
                Events.on(player, 'playlistitemremove', onPlaylistItemRemove);
                Events.on(player, 'playlistitemadd', onPlaylistItemAdd);
            } else if (player.isLocalPlayer) {
                Events.on(player, 'itemstarted', onPlaybackStartedFromSelfManagingPlayer);
                Events.on(player, 'itemstopped', onPlaybackStoppedFromSelfManagingPlayer);
                Events.on(player, 'timeupdate', onPlaybackTimeUpdate);
                Events.on(player, 'pause', onPlaybackPause);
                Events.on(player, 'unpause', onPlaybackUnpause);
                Events.on(player, 'volumechange', onPlaybackVolumeChange);
                Events.on(player, 'repeatmodechange', onRepeatModeChange);
                Events.on(player, 'shufflequeuemodechange', onShuffleQueueModeChange);
                Events.on(player, 'playlistitemmove', onPlaylistItemMove);
                Events.on(player, 'playlistitemremove', onPlaylistItemRemove);
                Events.on(player, 'playlistitemadd', onPlaylistItemAdd);
            }

            if (player.isLocalPlayer) {
                bindToFullscreenChange(player);
            }
            bindStopped(player);
        }

        Events.on(pluginManager, 'registered', function (e, plugin) {
            if (plugin.type === PluginType.MediaPlayer) {
                initMediaPlayer(plugin);
            }
        });

        pluginManager.ofType(PluginType.MediaPlayer).forEach(initMediaPlayer);

        /**
         * 发送进度更新
         *
         * 将当前播放状态上报到服务器
         *
         * @param {Object} player - 播放器实例
         * @param {string} progressEventName - 进度事件名称
         * @param {boolean} reportPlaylist - 是否上报播放列表
         */
        function sendProgressUpdate(player, progressEventName, reportPlaylist) {
            if (!player) {
                throw new Error('player cannot be null');
            }

            const state = self.getPlayerState(player);

            if (state.NowPlayingItem) {
                const serverId = state.NowPlayingItem.ServerId;

                const streamInfo = getPlayerData(player).streamInfo;

                if (streamInfo?.started && !streamInfo.ended) {
                    reportPlayback(self, state, player, reportPlaylist, serverId, 'reportPlaybackProgress', progressEventName);
                }

                if (streamInfo?.liveStreamId
                    && (new Date().getTime() - (streamInfo.lastMediaInfoQuery || 0) >= 600000)
                ) {
                    getLiveStreamMediaInfo(player, streamInfo, self.currentMediaSource(player), streamInfo.liveStreamId, serverId);
                }
            }
        }

        /**
         * 获取直播流媒体信息
         *
         * 每 10 分钟更新一次直播流的媒体信息(可能变化的音轨/字幕轨)
         *
         * @param {Object} player - 播放器实例
         * @param {Object} streamInfo - 流信息对象
         * @param {Object} mediaSource - 媒体源对象
         * @param {string} liveStreamId - 直播流 ID
         * @param {string} serverId - 服务器 ID
         */
        function getLiveStreamMediaInfo(player, streamInfo, mediaSource, liveStreamId, serverId) {
            console.debug('getLiveStreamMediaInfo');

            streamInfo.lastMediaInfoQuery = new Date().getTime();

            ServerConnections.getApiClient(serverId).getLiveStreamMediaInfo(liveStreamId).then(function (info) {
                mediaSource.MediaStreams = info.MediaStreams;
                Events.trigger(player, 'mediastreamschange');
            }, function () {
                // Swallow errors
            });
        }

        /**
         * 应用关闭处理
         *
         * 在应用关闭前尝试上报播放停止状态到服务器
         */
        self.onAppClose = function () {
            const player = this._currentPlayer;

            // Try to report playback stopped before the app closes
            if (player && this.isPlaying(player)) {
                this._playNextAfterEnded = false;
                onPlaybackStopped.call(player);
            }
        };

        /**
         * 获取播放开始时间
         *
         * 返回播放开始的时间戳(ticks)
         *
         * @param {Object} player - 播放器实例
         * @returns {number|null} 开始时间(ticks)或null
         */
        self.playbackStartTime = function (player = this._currentPlayer) {
            if (player && !enableLocalPlaylistManagement(player) && !player.isLocalPlayer) {
                return player.playbackStartTime();
            }

            const streamInfo = getPlayerData(player).streamInfo;
            return streamInfo ? streamInfo.playbackStartTimeTicks : null;
        };

        if (appHost.supports(AppFeature.RemoteControl)) {
            import('../../scripts/serverNotifications').then(({ default: serverNotifications }) => {
                Events.on(serverNotifications, 'ServerShuttingDown', self.setDefaultPlayerActive.bind(self));
                Events.on(serverNotifications, 'ServerRestarting', self.setDefaultPlayerActive.bind(self));
            });
        }

        bindMediaSegmentManager(self);
        this._skipSegment = bindSkipSegment(self);
    }

    /**
     * 获取当前播放器
     *
     * @returns {Object|null} 当前活动的播放器实例
     */
    getCurrentPlayer() {
        return this._currentPlayer;
    }

    /**
     * 获取当前播放时间
     *
     * 返回当前播放位置(毫秒)
     *
     * @param {Object} player - 播放器实例
     * @returns {number} 当前时间(毫秒)
     */
    currentTime(player = this._currentPlayer) {
        if (player && !enableLocalPlaylistManagement(player) && !player.isLocalPlayer) {
            return player.currentTime();
        }

        return this.getCurrentTicks(player) / 10000;
    }

    /**
     * 获取下一个播放项目信息
     *
     * @returns {Object|null} 包含 item、index 的对象
     */
    getNextItem() {
        return this._playQueueManager.getNextItemInfo();
    }

    /**
     * 获取下一个播放项目的完整信息
     *
     * 从服务器获取下一项的完整数据
     *
     * @param {Object} player - 播放器实例
     * @returns {Promise} 项目对象的 Promise
     */
    nextItem(player = this._currentPlayer) {
        if (player && !enableLocalPlaylistManagement(player)) {
            return player.nextItem();
        }

        const nextItem = this._playQueueManager.getNextItemInfo();

        if (!nextItem?.item) {
            return Promise.reject();
        }

        const apiClient = ServerConnections.getApiClient(nextItem.item.ServerId);
        return apiClient.getItem(apiClient.getCurrentUserId(), nextItem.item.Id);
    }

    /**
     * 检查项目是否可以添加到播放队列
     *
     * @param {Object} item - 媒体项目
     * @returns {boolean} 是否可以排队
     */
    canQueue(item) {
        if (item.Type === 'MusicAlbum' || item.Type === 'MusicArtist' || item.Type === 'MusicGenre') {
            return this.canQueueMediaType('Audio');
        }
        return this.canQueueMediaType(item.MediaType);
    }

    /**
     * 检查媒体类型是否可以排队
     *
     * @param {string} mediaType - 媒体类型(Audio/Video/Photo)
     * @returns {boolean} 当前播放器是否支持该类型
     */
    canQueueMediaType(mediaType) {
        if (this._currentPlayer) {
            return this._currentPlayer.canPlayMediaType(mediaType);
        }

        return false;
    }

    /**
     * 检查是否静音
     *
     * @param {Object} player - 播放器实例
     * @returns {boolean} 是否静音
     */
    isMuted(player = this._currentPlayer) {
        if (player) {
            return player.isMuted();
        }

        return false;
    }

    /**
     * 设置静音状态
     *
     * @param {boolean} mute - 是否静音
     * @param {Object} player - 播放器实例
     */
    setMute(mute, player = this._currentPlayer) {
        if (player) {
            player.setMute(mute);
        }
    }

    /**
     * 切换静音状态
     *
     * @param {boolean} mute - 静音状态(可选)
     * @param {Object} player - 播放器实例
     */
    toggleMute(mute, player = this._currentPlayer) {
        if (player) {
            if (player.toggleMute) {
                player.toggleMute();
            } else {
                player.setMute(!player.isMuted());
            }
        }
    }

    /**
     * 切换显示镜像状态
     */
    toggleDisplayMirroring() {
        this.enableDisplayMirroring(!this.enableDisplayMirroring());
    }

    /**
     * 启用/禁用显示镜像
     *
     * @param {boolean} enabled - 是否启用镜像,不传参数时返回当前状态
     * @returns {boolean|undefined} 当前状态或 undefined
     */
    enableDisplayMirroring(enabled) {
        if (enabled != null) {
            const val = enabled ? '1' : '0';
            appSettings.set('displaymirror', val);
            return;
        }

        return (appSettings.get('displaymirror') || '') !== '0';
    }

    /**
     * 播放下一章节
     *
     * 跳转到当前位置之后的下一章节,没有则播放下一曲目
     *
     * @param {Object} player - 播放器实例
     */
    nextChapter(player = this._currentPlayer) {
        const item = this.currentItem(player);

        const ticks = this.getCurrentTicks(player);

        const nextChapter = (item.Chapters || []).filter(function (i) {
            return i.StartPositionTicks > ticks;
        })[0];

        if (nextChapter) {
            this.seek(nextChapter.StartPositionTicks, player);
        } else {
            this.nextTrack(player);
        }
    }

    /**
     * 播放上一章节
     *
     * 跳转到当前位置之前的章节,没有则播放上一曲目
     * 在前 10 秒内跳转会回到前一章节
     *
     * @param {Object} player - 播放器实例
     */
    previousChapter(player = this._currentPlayer) {
        const item = this.currentItem(player);

        let ticks = this.getCurrentTicks(player);

        // Go back 10 seconds
        ticks -= 100000000;

        // If there's no previous track, then at least rewind to beginning
        if (this.getCurrentPlaylistIndex(player) === 0) {
            ticks = Math.max(ticks, 0);
        }

        const previousChapters = (item.Chapters || []).filter(function (i) {
            return i.StartPositionTicks <= ticks;
        });

        if (previousChapters.length) {
            this.seek(previousChapters[previousChapters.length - 1].StartPositionTicks, player);
        } else {
            this.previousTrack(player);
        }
    }

    /**
     * 快进
     *
     * 根据用户设置的快进长度跳转(默认 15 秒)
     *
     * @param {Object} player - 播放器实例
     */
    fastForward(player = this._currentPlayer) {
        if (player.fastForward != null) {
            player.fastForward(userSettings.skipForwardLength());
            return;
        }

        // Go back 15 seconds
        const offsetTicks = userSettings.skipForwardLength() * 10000;

        this.seekRelative(offsetTicks, player);
    }

    /**
     * 快退
     *
     * 根据用户设置的快退长度跳转(默认 15 秒)
     *
     * @param {Object} player - 播放器实例
     */
    rewind(player = this._currentPlayer) {
        if (player.rewind != null) {
            player.rewind(userSettings.skipBackLength());
            return;
        }

        // Go back 15 seconds
        const offsetTicks = 0 - (userSettings.skipBackLength() * 10000);

        this.seekRelative(offsetTicks, player);
    }

    /**
     * 按百分比跳转
     *
     * @param {number} percent - 目标位置百分比(0-100)
     * @param {Object} player - 播放器实例
     */
    seekPercent(percent, player = this._currentPlayer) {
        let ticks = this.duration(player) || 0;

        percent /= 100;
        ticks *= percent;
        this.seek(parseInt(ticks, 10), player);
    }

    /**
     * 按毫秒跳转
     *
     * @param {number} ms - 目标位置(毫秒)
     * @param {Object} player - 播放器实例
     */
    seekMs(ms, player = this._currentPlayer) {
        const ticks = ms * 10000;
        this.seek(ticks, player);
    }

    /**
     * 播放预告片
     *
     * 优先播放本地预告片,其次播放远程预告片 URL
     *
     * @param {Object} item - 媒体项目
     * @returns {Promise} 播放 Promise
     */
    async playTrailers(item) {
        const player = this._currentPlayer;

        if (player?.playTrailers) {
            return player.playTrailers(item);
        }

        const apiClient = ServerConnections.getApiClient(item.ServerId);

        let items;

        if (item.LocalTrailerCount) {
            items = await apiClient.getLocalTrailers(apiClient.getCurrentUserId(), item.Id);
        }

        if (!items?.length) {
            items = (item.RemoteTrailers || []).map((t) => {
                return {
                    Name: t.Name || (item.Name + ' Trailer'),
                    Url: t.Url,
                    MediaType: 'Video',
                    Type: 'Trailer',
                    ServerId: apiClient.serverId()
                };
            });
        }

        if (items.length) {
            return this.play({
                items
            });
        }

        return Promise.reject();
    }

    /**
     * 获取字幕URL
     *
     * 根据字幕流是否为外部URL返回相应的完整URL
     *
     * @param {Object} textStream - 字幕流对象
     * @param {string} serverId - 服务器ID
     * @returns {string} 字幕URL
     */
    getSubtitleUrl(textStream, serverId) {
        const apiClient = ServerConnections.getApiClient(serverId);

        return !textStream.IsExternalUrl ? apiClient.getUrl(textStream.DeliveryUrl) : textStream.DeliveryUrl;
    }

    /**
     * 停止播放
     *
     * 停止当前播放器并清理状态
     *
     * @param {Object} player - 播放器实例
     * @returns {Promise} 停止Promise
     */
    stop(player) {
        player = player || this._currentPlayer;
        if (player) {
            if (enableLocalPlaylistManagement(player)) {
                this._playNextAfterEnded = false;
            }

            // TODO: remove second param
            return player.stop(true, true);
        }

        return Promise.resolve();
    }

    /**
     * 获取缓冲范围
     *
     * 返回已缓冲的时间范围数组
     *
     * @param {Object} player - 播放器实例
     * @returns {Array} 缓冲范围数组
     */
    getBufferedRanges(player = this._currentPlayer) {
        if (player?.getBufferedRanges) {
            return player.getBufferedRanges();
        }

        return [];
    }

    /**
     * 切换播放/暂停状态
     *
     * 如果正在播放则暂停,如果已暂停则播放
     *
     * @param {Object} player - 播放器实例
     * @returns {Promise|undefined} 操作Promise
     */
    playPause(player = this._currentPlayer) {
        if (player) {
            if (player.playPause) {
                return player.playPause();
            }

            if (player.paused()) {
                return this.unpause(player);
            } else {
                return this.pause(player);
            }
        }
    }

    /**
     * 检查是否已暂停
     *
     * @param {Object} player - 播放器实例
     * @returns {boolean|undefined} 是否暂停
     */
    paused(player = this._currentPlayer) {
        if (player) {
            return player.paused();
        }
    }

    /**
     * 暂停播放
     *
     * @param {Object} player - 播放器实例
     */
    pause(player = this._currentPlayer) {
        if (player) {
            player.pause();
        }
    }

    /**
     * 恢复播放
     *
     * @param {Object} player - 播放器实例
     */
    unpause(player = this._currentPlayer) {
        if (player) {
            player.unpause();
        }
    }

    /**
     * 设置播放速率
     *
     * @param {number} value - 播放速率(0.25, 0.5, 1.0, 1.25, 1.5, 2.0 等)
     * @param {Object} player - 播放器实例
     */
    setPlaybackRate(value, player = this._currentPlayer) {
        if (player?.setPlaybackRate) {
            player.setPlaybackRate(value);

            // Save the new playback rate in the browser session, to restore when playing a new video.
            sessionStorage.setItem('playbackRateSpeed', value);
        }
    }

    /**
     * 获取播放速率
     *
     * @param {Object} player - 播放器实例
     * @returns {number|null} 播放速率
     */
    getPlaybackRate(player = this._currentPlayer) {
        if (player?.getPlaybackRate) {
            return player.getPlaybackRate();
        }

        return null;
    }

    /**
     * 创建即时混音播放列表
     *
     * 根据项目生成相似风格的播放列表(最多 200 首)
     *
     * @param {Object} item - 媒体项目
     * @param {Object} player - 播放器实例
     */
    instantMix(item, player = this._currentPlayer) {
        if (player?.instantMix) {
            return player.instantMix(item);
        }

        const apiClient = ServerConnections.getApiClient(item.ServerId);

        const options = {
            UserId: apiClient.getCurrentUserId(),
            Limit: 200
        };

        const instance = this;

        apiClient.getInstantMixFromItem(item.Id, options).then(function (result) {
            instance.play({
                items: result.Items
            });
        });
    }

    /**
     * 随机播放项目
     *
     * @param {Object} shuffleItem - 要随机播放的项目(如专辑、播放列表等)
     * @param {Object} player - 播放器实例
     * @returns {Promise} 播放 Promise
     */
    shuffle(shuffleItem, player = this._currentPlayer) {
        if (player?.shuffle) {
            return player.shuffle(shuffleItem);
        }

        return this.play({ items: [shuffleItem], shuffle: true });
    }

    /**
     * 获取音频轨道列表
     *
     * @param {Object} player - 播放器实例
     * @returns {Array} 音频流数组(按显示顺序排序)
     */
    audioTracks(player = this._currentPlayer) {
        if (player.audioTracks) {
            const result = player.audioTracks();
            if (result) {
                return result.sort(itemHelper.sortTracks);
            }
        }

        const mediaSource = this.currentMediaSource(player);

        const mediaStreams = mediaSource?.MediaStreams || [];
        return mediaStreams.filter(function (s) {
            return s.Type === 'Audio';
        }).sort(itemHelper.sortTracks);
    }

    /**
     * 获取字幕轨道列表
     *
     * @param {Object} player - 播放器实例
     * @returns {Array} 字幕流数组(按显示顺序排序)
     */
    subtitleTracks(player = this._currentPlayer) {
        if (player.subtitleTracks) {
            const result = player.subtitleTracks();
            if (result) {
                return result.sort(itemHelper.sortTracks);
            }
        }

        const mediaSource = this.currentMediaSource(player);

        const mediaStreams = mediaSource?.MediaStreams || [];
        return mediaStreams.filter(function (s) {
            return s.Type === 'Subtitle';
        }).sort(itemHelper.sortTracks);
    }

    /**
     * 获取播放器支持的命令列表
     *
     * 返回播放器支持的所有控制命令,如:
     * - 音量控制: VolumeUp, VolumeDown, SetVolume
     * - 播放控制: SetAudioStreamIndex, SetSubtitleStreamIndex
     * - 显示控制: ToggleFullscreen, SetBrightness
     * - 特殊功能: PictureInPicture, AirPlay
     *
     * @param {Object} player - 播放器实例
     * @returns {Array<string>} 支持的命令数组
     */
    getSupportedCommands(player) {
        player = player || this._currentPlayer || { isLocalPlayer: true };

        if (player.isLocalPlayer) {
            const list = [
                'GoHome',
                'GoToSettings',
                'VolumeUp',
                'VolumeDown',
                'Mute',
                'Unmute',
                'ToggleMute',
                'SetVolume',
                'SetAudioStreamIndex',
                'SetSubtitleStreamIndex',
                'SetMaxStreamingBitrate',
                'DisplayContent',
                'GoToSearch',
                'DisplayMessage',
                'SetRepeatMode',
                'SetShuffleQueue',
                'PlayMediaSource',
                'PlayTrailers'
            ];

            if (appHost.supports(AppFeature.Fullscreen)) {
                list.push('ToggleFullscreen');
            }

            if (player.supports) {
                if (player.supports('PictureInPicture')) {
                    list.push('PictureInPicture');
                }
                if (player.supports('AirPlay')) {
                    list.push('AirPlay');
                }
                if (player.supports('SetBrightness')) {
                    list.push('SetBrightness');
                }
                if (player.supports('SetAspectRatio')) {
                    list.push('SetAspectRatio');
                }
                if (player.supports('PlaybackRate')) {
                    list.push('PlaybackRate');
                }
            }

            return list;
        }

        const info = this.getPlayerInfo();
        return info ? info.supportedCommands : [];
    }

    /**
     * 设置重复播放模式
     *
     * @param {string} value - 重复模式: RepeatNone(不重复), RepeatAll(全部重复), RepeatOne(单曲循环)
     * @param {Object} player - 播放器实例
     */
    setRepeatMode(value, player = this._currentPlayer) {
        if (player && !enableLocalPlaylistManagement(player)) {
            return player.setRepeatMode(value);
        }

        this._playQueueManager.setRepeatMode(value);
        Events.trigger(player, 'repeatmodechange');
    }

    /**
     * 获取重复播放模式
     *
     * @param {Object} player - 播放器实例
     * @returns {string} 当前重复模式
     */
    getRepeatMode(player = this._currentPlayer) {
        if (player && !enableLocalPlaylistManagement(player)) {
            return player.getRepeatMode();
        }

        return this._playQueueManager.getRepeatMode();
    }

    /**
     * 设置随机播放模式
     *
     * @param {string} value - 随机模式: Shuffle(随机), Sorted(顺序)
     * @param {Object} player - 播放器实例
     */
    setQueueShuffleMode(value, player = this._currentPlayer) {
        if (player && !enableLocalPlaylistManagement(player)) {
            return player.setQueueShuffleMode(value);
        }

        this._playQueueManager.setShuffleMode(value);
        Events.trigger(player, 'shufflequeuemodechange');
    }

    /**
     * 获取随机播放模式
     *
     * @param {Object} player - 播放器实例
     * @returns {string} 当前随机模式
     */
    getQueueShuffleMode(player = this._currentPlayer) {
        if (player && !enableLocalPlaylistManagement(player)) {
            return player.getQueueShuffleMode();
        }

        return this._playQueueManager.getShuffleMode();
    }

    /**
     * 切换随机播放模式
     *
     * 在Shuffle(随机)和Sorted(顺序)之间切换
     *
     * @param {Object} player - 播放器实例
     */
    toggleQueueShuffleMode(player = this._currentPlayer) {
        let currentvalue;
        if (player && !enableLocalPlaylistManagement(player)) {
            currentvalue = player.getQueueShuffleMode();
            switch (currentvalue) {
                case 'Shuffle':
                    player.setQueueShuffleMode('Sorted');
                    break;
                case 'Sorted':
                    player.setQueueShuffleMode('Shuffle');
                    break;
                default:
                    throw new TypeError('current value for shufflequeue is invalid');
            }
        } else {
            this._playQueueManager.toggleShuffleMode();
        }
        Events.trigger(player, 'shufflequeuemodechange');
    }

    /**
     * 清空播放队列
     *
     * @param {boolean} clearCurrentItem - 是否清除当前播放项(默认false)
     * @param {Object} player - 播放器实例
     */
    clearQueue(clearCurrentItem = false, player = this._currentPlayer) {
        if (player && !enableLocalPlaylistManagement(player)) {
            return player.clearQueue(clearCurrentItem);
        }

        this._playQueueManager.clearPlaylist(clearCurrentItem);
        Events.trigger(player, 'playlistitemremove');
    }

    /**
     * 尝试根据设备名称设置活动播放器
     *
     * 规范化设备名称后查找匹配的目标并激活
     *
     * @param {string} name - 设备名称
     */
    trySetActiveDeviceName(name) {
        name = normalizeName(name);

        const instance = this;
        instance.getTargets().then(function (result) {
            const target = result.filter(function (p) {
                return normalizeName(p.name) === name;
            })[0];

            if (target) {
                instance.trySetActivePlayer(target.playerName, target);
            }
        });
    }

    /**
     * 在播放器上显示内容
     *
     * 用于远程控制向播放器发送显示内容的指令
     *
     * @param {Object} options - 显示选项
     * @param {Object} player - 播放器实例
     */
    displayContent(options, player = this._currentPlayer) {
        if (player?.displayContent) {
            player.displayContent(options);
        }
    }

    /**
     * 开始播放器更新
     *
     * 通知播放器开始批量更新(减少UI刷新)
     *
     * @param {Object} player - 播放器实例
     */
    beginPlayerUpdates(player) {
        if (player.beginPlayerUpdates) {
            player.beginPlayerUpdates();
        }
    }

    /**
     * 结束播放器更新
     *
     * 通知播放器结束批量更新,刷新UI
     *
     * @param {Object} player - 播放器实例
     */
    endPlayerUpdates(player) {
        if (player.endPlayerUpdates) {
            player.endPlayerUpdates();
        }
    }

    /**
     * 设置默认播放器为活动状态
     *
     * 将本地播放器(localplayer)设置为当前活动播放器
     */
    setDefaultPlayerActive() {
        this.setActivePlayer('localplayer');
    }

    /**
     * 移除活动播放器
     *
     * 如果当前活动播放器名称匹配,则切换回默认播放器
     *
     * @param {string} name - 播放器名称
     */
    removeActivePlayer(name) {
        const playerInfo = this.getPlayerInfo();
        if (playerInfo?.name === name) {
            this.setDefaultPlayerActive();
        }
    }

    /**
     * 移除活动目标
     *
     * 如果当前活动目标ID匹配,则切换回默认播放器
     *
     * @param {string} id - 目标ID
     */
    removeActiveTarget(id) {
        const playerInfo = this.getPlayerInfo();
        if (playerInfo?.id === id) {
            this.setDefaultPlayerActive();
        }
    }

    /**
     * 发送控制命令到播放器
     *
     * 处理远程控制命令,支持的命令包括:
     * - 播放模式: SetRepeatMode, SetShuffleQueue
     * - 音量控制: VolumeUp, VolumeDown, Mute, Unmute, ToggleMute, SetVolume
     * - 显示设置: SetAspectRatio, SetBrightness, ToggleFullscreen
     * - 流设置: SetAudioStreamIndex, SetSubtitleStreamIndex, SetMaxStreamingBitrate
     * - 播放速率: PlaybackRate
     *
     * @param {Object} cmd - 命令对象,包含Name和Arguments
     * @param {Object} player - 播放器实例
     */
    sendCommand(cmd, player) {
        console.debug('MediaController received command: ' + cmd.Name);
        switch (cmd.Name) {
            case 'SetRepeatMode':
                this.setRepeatMode(cmd.Arguments.RepeatMode, player);
                break;
            case 'SetShuffleQueue':
                this.setQueueShuffleMode(cmd.Arguments.ShuffleMode, player);
                break;
            case 'VolumeUp':
                this.volumeUp(player);
                break;
            case 'VolumeDown':
                this.volumeDown(player);
                break;
            case 'Mute':
                this.setMute(true, player);
                break;
            case 'Unmute':
                this.setMute(false, player);
                break;
            case 'ToggleMute':
                this.toggleMute(player);
                break;
            case 'SetVolume':
                this.setVolume(cmd.Arguments.Volume, player);
                break;
            case 'SetAspectRatio':
                this.setAspectRatio(cmd.Arguments.AspectRatio, player);
                break;
            case 'PlaybackRate':
                this.setPlaybackRate(cmd.Arguments.PlaybackRate, player);
                break;
            case 'SetBrightness':
                this.setBrightness(cmd.Arguments.Brightness, player);
                break;
            case 'SetAudioStreamIndex':
                this.setAudioStreamIndex(parseInt(cmd.Arguments.Index, 10), player);
                break;
            case 'SetSubtitleStreamIndex':
                this.setSubtitleStreamIndex(parseInt(cmd.Arguments.Index, 10), player);
                break;
            case 'SetMaxStreamingBitrate':
                this.setMaxStreamingBitrate(parseInt(cmd.Arguments.Bitrate, 10), player);
                break;
            case 'ToggleFullscreen':
                this.toggleFullscreen(player);
                break;
            default:
                if (player.sendCommand) {
                    player.sendCommand(cmd);
                }
                break;
        }
    }
}

/**
 * 播放管理器单例实例
 *
 * 全局唯一的播放管理器实例,用于控制所有媒体播放
 */
export const playbackManager = new PlaybackManager();

// 绑定媒体片段管理器(用于跳过片段功能)
bindMediaSegmentManager(playbackManager);

// 绑定媒体会话订阅器(用于系统媒体控制集成)
bindMediaSessionSubscriber(playbackManager);

/**
 * 页面卸载时的清理处理
 *
 * 在浏览器关闭或页面刷新前,尝试上报播放停止状态
 */
window.addEventListener('beforeunload', function () {
    try {
        playbackManager.onAppClose();
    } catch (err) {
        console.error('error in onAppClose: ' + err);
    }
});
