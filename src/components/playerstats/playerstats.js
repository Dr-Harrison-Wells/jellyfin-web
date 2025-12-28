// 导入国际化工具
import globalize from 'lib/globalize';
// 导入服务器连接管理
import { ServerConnections } from 'lib/jellyfin-apiclient';
// 导入插件类型
import { PluginType } from 'types/plugin';
// 导入事件工具
import Events from 'utils/events';
// 导入文件大小格式化工具
import { getReadableSize } from 'utils/file';

// 导入布局管理器
import layoutManager from '../layoutManager';
// 导入播放管理器
import { playbackManager } from '../playback/playbackmanager';
// 导入播放方法辅助工具
import playMethodHelper from '../playback/playmethodhelper';
// 导入插件管理器
import { pluginManager } from '../pluginManager';

// 导入按钮组件
import 'elements/emby-button/paper-icon-button-light';

// 导入样式
import './playerstats.scss';

/**
 * 初始化播放器统计信息界面
 * @param {Object} instance - PlayerStats实例
 */
function init(instance) {
    const parent = document.createElement('div');

    parent.classList.add('playerStats');

    if (layoutManager.tv) {
        parent.classList.add('playerStats-tv');
    }

    parent.classList.add('hide');

    let button;

    if (layoutManager.tv) {
        button = '';
    } else {
        button = '<button type="button" is="paper-icon-button-light" class="playerStats-closeButton"><span class="material-icons close" aria-hidden="true"></span></button>';
    }

    const contentClass = layoutManager.tv ? 'playerStats-content playerStats-content-tv' : 'playerStats-content';

    parent.innerHTML = '<div class="' + contentClass + '">' + button + '<div class="playerStats-stats"></div></div>';

    button = parent.querySelector('.playerStats-closeButton');

    if (button) {
        button.addEventListener('click', onCloseButtonClick.bind(instance));
    }

    document.body.appendChild(parent);

    instance.element = parent;
}

/**
 * 关闭按钮点击事件处理函数
 */
function onCloseButtonClick() {
    this.enabled(false);
}

/**
 * 渲染统计信息到DOM元素
 * @param {HTMLElement} elem - 目标DOM元素
 * @param {Array} categories - 统计信息分类数组
 */
function renderStats(elem, categories) {
    elem.querySelector('.playerStats-stats').innerHTML = categories.map(function (category) {
        let categoryHtml = '';

        const stats = category.stats;

        if (stats.length && category.name) {
            categoryHtml += '<div class="playerStats-stat playerStats-stat-header">';

            categoryHtml += '<div class="playerStats-stat-label">';
            categoryHtml += category.name;
            categoryHtml += '</div>';

            categoryHtml += '<div class="playerStats-stat-value">';
            categoryHtml += category.subText || '';
            categoryHtml += '</div>';

            categoryHtml += '</div>';
        }

        for (let i = 0, length = stats.length; i < length; i++) {
            categoryHtml += '<div class="playerStats-stat">';

            const stat = stats[i];

            categoryHtml += '<div class="playerStats-stat-label">';
            categoryHtml += stat.label;
            categoryHtml += '</div>';

            categoryHtml += '<div class="playerStats-stat-value">';
            categoryHtml += stat.value;
            categoryHtml += '</div>';

            categoryHtml += '</div>';
        }

        return categoryHtml;
    }).join('');
}

/**
 * 获取当前播放会话信息
 * @param {Object} instance - PlayerStats实例
 * @param {Object} player - 播放器对象
 * @returns {Promise} 返回会话信息的Promise
 */
function getSession(instance, player) {
    const now = new Date().getTime();

    if ((now - (instance.lastSessionTime || 0)) < 10000) {
        return Promise.resolve(instance.lastSession);
    }

    const apiClient = ServerConnections.getApiClient(playbackManager.currentItem(player).ServerId);

    return apiClient.getSessions({
        deviceId: apiClient.deviceId()
    }).then(function (sessions) {
        instance.lastSession = sessions[0] || {};
        instance.lastSessionTime = new Date().getTime();

        return Promise.resolve(instance.lastSession);
    }, function () {
        return Promise.resolve({});
    });
}

/**
 * 翻译转码原因
 * @param {string} reason - 转码原因代码
 * @returns {string} 翻译后的转码原因
 */
function translateReason(reason) {
    return globalize.translate('' + reason);
}

/**
 * 获取转码统计信息
 * @param {Object} session - 播放会话对象
 * @param {Object} player - 播放器对象
 * @param {string} displayPlayMethod - 播放方法显示名称
 * @returns {Array} 转码统计信息数组
 */
function getTranscodingStats(session, player, displayPlayMethod) {
    const sessionStats = [];

    let videoCodec;
    let audioCodec;
    let totalBitrate;
    let audioChannels;

    if (session.TranscodingInfo) {
        videoCodec = session.TranscodingInfo.VideoCodec;
        audioCodec = session.TranscodingInfo.AudioCodec;
        totalBitrate = session.TranscodingInfo.Bitrate;
        audioChannels = session.TranscodingInfo.AudioChannels;
    }

    if (videoCodec) {
        sessionStats.push({
            label: globalize.translate('LabelVideoCodec'),
            value: session.TranscodingInfo.IsVideoDirect ? (videoCodec.toUpperCase() + ' (direct)') : videoCodec.toUpperCase()
        });
    }

    if (audioCodec) {
        sessionStats.push({
            label: globalize.translate('LabelAudioCodec'),
            value: session.TranscodingInfo.IsAudioDirect ? (audioCodec.toUpperCase() + ' (direct)') : audioCodec.toUpperCase()
        });
    }

    if (displayPlayMethod === 'Transcode') {
        if (audioChannels) {
            sessionStats.push({
                label: globalize.translate('LabelAudioChannels'),
                value: audioChannels
            });
        }
        if (totalBitrate) {
            sessionStats.push({
                label: globalize.translate('LabelBitrate'),
                value: getDisplayBitrate(totalBitrate)
            });
        }
        // 转码进度百分比
        if (session.TranscodingInfo.CompletionPercentage) {
            sessionStats.push({
                label: globalize.translate('LabelTranscodingProgress'),
                value: session.TranscodingInfo.CompletionPercentage.toFixed(1) + '%'
            });
        }
        if (session.TranscodingInfo.Framerate) {
            sessionStats.push({
                label: globalize.translate('LabelTranscodingFramerate'),
                value: getDisplayTranscodeFps(session, player)
            });
        }
        if (session.TranscodingInfo.TranscodeReasons?.length) {
            sessionStats.push({
                label: globalize.translate('LabelReasonForTranscoding'),
                value: session.TranscodingInfo.TranscodeReasons.map(translateReason).join('<br/>')
            });
        }
        // 暂时隐藏硬件加速信息，因为当前状态下不够实用。
        // 这里仅反映了仪表板中的配置，但实际的解码器/编码器选择更复杂。
        // 因此，即使配置了硬件加速，硬件编码器也可能未被使用，
        // 这会使硬件加速的显示产生误导。
        // if (session.TranscodingInfo.HardwareAccelerationType) {
        //     sessionStats.push({
        //         label: globalize.translate('LabelHardwareEncoding'),
        //         value: session.TranscodingInfo.HardwareAccelerationType
        //     });
        // }
    }

    return sessionStats;
}

/**
 * 将比特率转换为可读格式
 * @param {number} bitrate - 比特率（bps）
 * @returns {string} 格式化的比特率字符串（Mbps或kbps）
 */
function getDisplayBitrate(bitrate) {
    if (bitrate > 1000000) {
        return (bitrate / 1000000).toFixed(1) + ' Mbps';
    } else {
        return Math.floor(bitrate / 1000) + ' kbps';
    }
}

/**
 * 获取转码帧率显示信息
 * @param {Object} session - 播放会话对象
 * @param {Object} player - 播放器对象
 * @returns {string} 格式化的帧率字符串
 */
function getDisplayTranscodeFps(session, player) {
    const mediaSource = playbackManager.currentMediaSource(player) || {};
    const videoStream = (mediaSource.MediaStreams || []).find((s) => s.Type === 'Video') || {};

    const originalFramerate = videoStream.ReferenceFrameRate || videoStream.RealFrameRate;
    const transcodeFramerate = session.TranscodingInfo.Framerate;

    if (!originalFramerate) {
        return `${transcodeFramerate} fps`;
    }

    return `${transcodeFramerate} fps (${(transcodeFramerate / originalFramerate).toFixed(2)}x)`;
}

/**
 * 获取媒体源统计信息
 * @param {Object} session - 播放会话对象
 * @param {Object} player - 播放器对象
 * @returns {Array} 媒体源统计信息数组
 */
function getMediaSourceStats(session, player) {
    const sessionStats = [];

    const mediaSource = playbackManager.currentMediaSource(player) || {};
    const totalBitrate = mediaSource.Bitrate;
    const mediaFileSize = mediaSource.Size;

    if (mediaSource.Container) {
        sessionStats.push({
            label: globalize.translate('LabelProfileContainer'),
            value: mediaSource.Container
        });
    }

    if (mediaFileSize) {
        sessionStats.push({
            label: globalize.translate('LabelSize'),
            value: getReadableSize(mediaFileSize)
        });
    }

    if (totalBitrate) {
        sessionStats.push({
            label: globalize.translate('LabelBitrate'),
            value: getDisplayBitrate(totalBitrate)
        });
    }

    // 获取媒体流信息
    const mediaStreams = mediaSource.MediaStreams || [];
    // 获取视频流
    const videoStream = mediaStreams.filter(function (s) {
        return s.Type === 'Video';
    })[0] || {};

    const videoCodec = videoStream.Codec;

    // 获取当前音频流索引
    const audioStreamIndex = playbackManager.getAudioStreamIndex(player);
    const audioStream = playbackManager.audioTracks(player).filter(function (s) {
        return s.Type === 'Audio' && s.Index === audioStreamIndex;
    })[0] || {};

    const audioCodec = audioStream.Codec;
    const audioChannels = audioStream.Channels;

    // 收集视频信息
    const videoInfos = [];

    if (videoCodec) {
        videoInfos.push(videoCodec.toUpperCase());
    }

    if (videoStream.Profile) {
        videoInfos.push(videoStream.Profile);
    }

    if (videoInfos.length) {
        sessionStats.push({
            label: globalize.translate('LabelVideoCodec'),
            value: videoInfos.join(' ')
        });
    }

    if (videoStream.BitRate) {
        sessionStats.push({
            label: globalize.translate('LabelVideoBitrate'),
            value: getDisplayBitrate(videoStream.BitRate)
        });
    }

    if (videoStream.VideoRangeType) {
        sessionStats.push({
            label: globalize.translate('LabelVideoRangeType'),
            value: videoStream.VideoDoViTitle || videoStream.VideoRangeType
        });
    }

    // 收集音频信息
    const audioInfos = [];

    if (audioCodec) {
        audioInfos.push(audioCodec.toUpperCase());
    }

    if (audioStream.Profile) {
        audioInfos.push(audioStream.Profile);
    }

    if (audioInfos.length) {
        sessionStats.push({
            label: globalize.translate('LabelAudioCodec'),
            value: audioInfos.join(' ')
        });
    }

    if (audioStream.BitRate) {
        sessionStats.push({
            label: globalize.translate('LabelAudioBitrate'),
            value: getDisplayBitrate(audioStream.BitRate)
        });
    }

    if (audioChannels) {
        sessionStats.push({
            label: globalize.translate('LabelAudioChannels'),
            value: audioChannels
        });
    }

    if (audioStream.SampleRate) {
        sessionStats.push({
            label: globalize.translate('LabelAudioSampleRate'),
            value: audioStream.SampleRate + ' Hz'
        });
    }

    if (audioStream.BitDepth) {
        sessionStats.push({
            label: globalize.translate('LabelAudioBitDepth'),
            value: audioStream.BitDepth
        });
    }

    return sessionStats;
}

/**
 * 获取同步播放统计信息
 * @returns {Array} 同步播放统计信息数组
 */
function getSyncPlayStats() {
    const SyncPlay = pluginManager.firstOfType(PluginType.SyncPlay)?.instance;

    if (!SyncPlay?.Manager.isSyncPlayEnabled()) {
        return [];
    }

    const syncStats = [];
    const stats = SyncPlay.Manager.getStats();

    // 时间同步设备
    syncStats.push({
        label: globalize.translate('LabelSyncPlayTimeSyncDevice'),
        value: stats.TimeSyncDevice
    });

    // 时间同步偏移
    syncStats.push({
        // TODO: 从翻译中清理旧字符串 'LabelSyncPlayTimeOffset'
        label: globalize.translate('LabelSyncPlayTimeSyncOffset'),
        value: stats.TimeSyncOffset + ' ' + globalize.translate('MillisecondsUnit')
    });

    // 播放差异
    syncStats.push({
        label: globalize.translate('LabelSyncPlayPlaybackDiff'),
        value: stats.PlaybackDiff + ' ' + globalize.translate('MillisecondsUnit')
    });

    // 同步方法
    syncStats.push({
        label: globalize.translate('LabelSyncPlaySyncMethod'),
        value: stats.SyncMethod
    });

    return syncStats;
}

/**
 * 获取所有播放器统计信息
 * @param {Object} instance - PlayerStats实例
 * @param {Object} player - 播放器对象
 * @returns {Promise} 返回包含所有统计信息分类的Promise
 */
function getStats(instance, player) {
    const statsPromise = player.getStats ? player.getStats() : Promise.resolve({});
    const sessionPromise = getSession(instance, player);

    return Promise.all([statsPromise, sessionPromise]).then(function (responses) {
        const playerStatsResult = responses[0];
        const playerStats = playerStatsResult.categories || [];
        const session = responses[1];

        const displayPlayMethod = playMethodHelper.getDisplayPlayMethod(session);
        let localizedDisplayMethod = displayPlayMethod;

        // 将播放方法本地化
        if (displayPlayMethod === 'DirectPlay') {
            localizedDisplayMethod = globalize.translate('DirectPlaying');
        } else if (displayPlayMethod === 'Remux') {
            localizedDisplayMethod = globalize.translate('Remuxing');
        } else if (displayPlayMethod === 'DirectStream') {
            localizedDisplayMethod = globalize.translate('DirectStreaming');
        } else if (displayPlayMethod === 'Transcode') {
            localizedDisplayMethod = globalize.translate('Transcoding');
        }

        // 创建基础信息分类
        const baseCategory = {
            stats: [],
            name: globalize.translate('LabelPlaybackInfo')
        };

        // 添加播放方法
        baseCategory.stats.unshift({
            label: globalize.translate('LabelPlayMethod'),
            value: localizedDisplayMethod
        });

        // 添加播放器名称
        baseCategory.stats.unshift({
            label: globalize.translate('LabelPlayer'),
            value: player.name
        });

        const categories = [];

        categories.push(baseCategory);

        // 添加播放器提供的统计信息分类
        for (let i = 0, length = playerStats.length; i < length; i++) {
            const category = playerStats[i];
            if (category.type === 'audio') {
                category.name = globalize.translate('LabelAudioInfo');
            } else if (category.type === 'video') {
                category.name = globalize.translate('LabelVideoInfo');
            }
            categories.push(category);
        }

        // 根据播放方法本地化转码信息标题
        let localizedTranscodingInfo = globalize.translate('LabelTranscodingInfo');
        if (displayPlayMethod === 'Remux') {
            localizedTranscodingInfo = globalize.translate('LabelRemuxingInfo');
        } else if (displayPlayMethod === 'DirectStream') {
            localizedTranscodingInfo = globalize.translate('LabelDirectStreamingInfo');
        }

        // 添加转码信息分类
        if (session.TranscodingInfo) {
            categories.push({
                stats: getTranscodingStats(session, player, displayPlayMethod),
                name: localizedTranscodingInfo
            });
        }

        // 添加原始媒体信息分类
        categories.push({
            stats: getMediaSourceStats(session, player),
            name: globalize.translate('LabelOriginalMediaInfo')
        });

        // 获取同步播放统计信息
        const syncPlayStats = getSyncPlayStats();
        if (syncPlayStats.length > 0) {
            categories.push({
                stats: syncPlayStats,
                name: globalize.translate('LabelSyncPlayInfo')
            });
        }

        return Promise.resolve(categories);
    });
}

/**
 * 渲染播放器统计信息（带节流）
 * @param {Object} instance - PlayerStats实例
 * @param {Object} player - 播放器对象
 */
function renderPlayerStats(instance, player) {
    const now = new Date().getTime();

    // 节流：限制渲染频率为700ms
    if ((now - (instance.lastRender || 0)) < 700) {
        return;
    }

    instance.lastRender = now;

    getStats(instance, player).then(function (stats) {
        const elem = instance.element;
        if (!elem) {
            return;
        }

        renderStats(elem, stats);
    });
}

/**
 * 绑定播放器事件
 * @param {Object} instance - PlayerStats实例
 * @param {Object} player - 播放器对象
 */
function bindEvents(instance, player) {
    const localOnTimeUpdate = function () {
        renderPlayerStats(instance, player);
    };

    instance.onTimeUpdate = localOnTimeUpdate;
    Events.on(player, 'timeupdate', localOnTimeUpdate);
}

/**
 * 解绑播放器事件
 * @param {Object} instance - PlayerStats实例
 * @param {Object} player - 播放器对象
 */
function unbindEvents(instance, player) {
    const localOnTimeUpdate = instance.onTimeUpdate;

    if (localOnTimeUpdate) {
        Events.off(player, 'timeupdate', localOnTimeUpdate);
    }
}

/**
 * 播放器统计信息类
 * 用于显示和管理播放器的各种统计信息
 */
class PlayerStats {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {Object} options.player - 播放器对象
     */
    constructor(options) {
        this.options = options;

        init(this);

        this.enabled(true);
    }

    /**
     * 启用或禁用统计信息显示
     * @param {boolean} enabled - 是否启用（不传参数则返回当前状态）
     * @returns {boolean|undefined} 当前启用状态或undefined
     */
    enabled(enabled) {
        if (enabled == null) {
            return this._enabled;
        }

        const options = this.options;

        if (!options) {
            return;
        }

        this._enabled = enabled;
        if (enabled) {
            this.element.classList.remove('hide');
            bindEvents(this, options.player);
        } else {
            this.element.classList.add('hide');
            unbindEvents(this, options.player);
        }
    }

    /**
     * 切换统计信息显示状态
     */
    toggle() {
        this.enabled(!this.enabled());
    }

    /**
     * 销毁统计信息组件，清理资源
     */
    destroy() {
        const options = this.options;

        if (options) {
            this.options = null;
            unbindEvents(this, options.player);
        }

        const elem = this.element;
        if (elem) {
            elem.parentNode.removeChild(elem);
            this.element = null;
        }
    }
}

export default PlayerStats;
