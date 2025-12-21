// HTML 媒体播放器辅助函数模块
// 提供音量管理、HLS播放器支持、错误处理等媒体播放相关功能

import appSettings from '../scripts/settings/appSettings' ;
import browser from '../scripts/browser';
import Events from '../utils/events.ts';
import { MediaError } from 'types/mediaError';

/**
 * 获取保存的音量值
 * @returns {number} 音量值，范围0-1，默认为1
 */
export function getSavedVolume() {
    return appSettings.get('volume') || 1;
}

/**
 * 保存音量值到设置中
 * @param {number} value - 要保存的音量值
 */
export function saveVolume(value) {
    if (value) {
        appSettings.set('volume', value);
    }
}

/**
 * 获取媒体元素的跨域属性值
 * @param {Object} mediaSource - 媒体源对象
 * @returns {string|null} 如果是远程资源返回null，否则返回'anonymous'
 */
export function getCrossOriginValue(mediaSource) {
    if (mediaSource.IsRemote) {
        return null;
    }

    return 'anonymous';
}

/**
 * 检测浏览器是否原生支持HLS播放
 * @returns {boolean} 如果支持返回true
 */
function canPlayNativeHls() {
    const media = document.createElement('video');

    return !!(media.canPlayType('application/x-mpegURL').replace(/no/, '')
            || media.canPlayType('application/vnd.apple.mpegURL').replace(/no/, ''));
}

/**
 * 根据编解码器判断是否启用HLS.js播放器
 * @param {Object} mediaSource - 媒体源对象
 * @param {string} mediaType - 媒体类型
 * @returns {boolean} 是否启用HLS.js播放器
 */
export function enableHlsJsPlayerForCodecs(mediaSource, mediaType) {
    // 桌面版Safari的VP9 HLS支持的变通方案
    // 强制使用HLS.js，因为桌面版Safari的原生HLS播放器不支持VP9编码的HLS流
    // browser.osx在iPad上也会返回true，所以不能使用
    if (!browser.iOS && browser.safari && mediaSource.MediaStreams.some(x => x.Codec === 'vp9')) {
        return true;
    }
    return enableHlsJsPlayer(mediaSource.RunTimeTicks, mediaType);
}

/**
 * 判断是否启用HLS.js播放器
 * @param {number} runTimeTicks - 媒体运行时长（以ticks为单位）
 * @param {string} mediaType - 媒体类型
 * @returns {boolean} 是否启用HLS.js播放器
 */
export function enableHlsJsPlayer(runTimeTicks, mediaType) {
    if (window.MediaSource == null) {
        return false;
    }

    // hls.js仍处于测试阶段，需要更多测试
    if (browser.iOS) {
        return false;
    }

    // 这些设备的原生播放器支持直播流的跳转，不需要使用hls.js
    if (browser.tizen || browser.web0s) {
        return false;
    }

    if (canPlayNativeHls()) {
        // Android Webview的原生HLS存在性能和兼容性问题
        if (browser.android && (mediaType === 'Audio' || mediaType === 'Video')) {
            return true;
        }

        // 简单播放应该使用原生支持
        if (runTimeTicks) {
            return false;
        }
    }

    return true;
}

// 记录解码错误恢复的时间戳
let recoverDecodingErrorDate;
// 记录音频编解码器切换恢复的时间戳
let recoverSwapAudioCodecDate;

/**
 * 处理HLS.js媒体错误
 * 尝试通过多种方式恢复播放错误
 * @param {Object} instance - 播放器实例
 * @param {Function} reject - 错误回调函数
 */
export function handleHlsJsMediaError(instance, reject) {
    const hlsPlayer = instance._hlsPlayer;

    if (!hlsPlayer) {
        return;
    }

    let now = Date.now();

    if (window.performance?.now) {
        now = performance.now();
    }

    // 尝试恢复解码错误（每3秒最多尝试一次）
    if (!recoverDecodingErrorDate || (now - recoverDecodingErrorDate) > 3000) {
        recoverDecodingErrorDate = now;
        console.debug('尝试恢复媒体错误...');
        hlsPlayer.recoverMediaError();
    } else if (!recoverSwapAudioCodecDate || (now - recoverSwapAudioCodecDate) > 3000) {
        // 尝试切换音频编解码器并恢复
        recoverSwapAudioCodecDate = now;
        console.debug('尝试切换音频编解码器并恢复媒体错误...');
        hlsPlayer.swapAudioCodec();
        hlsPlayer.recoverMediaError();
    } else {
        console.error('无法恢复，上次媒体错误恢复失败...');

        if (reject) {
            reject();
        } else {
            onErrorInternal(instance, MediaError.FATAL_HLS_ERROR);
        }
    }
}

/**
 * 内部错误处理函数
 * @param {Object} instance - 播放器实例
 * @param {string} type - 错误类型
 */
export function onErrorInternal(instance, type) {
    // 视频播放需要销毁自定义轨道
    if (instance.destroyCustomTrack) {
        instance.destroyCustomTrack(instance._mediaElement);
    }

    Events.trigger(instance, 'error', [{ type }]);
}

/**
 * 验证媒体时长是否有效
 * @param {number} duration - 时长值
 * @returns {boolean} 时长是否有效
 */
export function isValidDuration(duration) {
    return duration
            && !isNaN(duration)
            && duration !== Number.POSITIVE_INFINITY
            && duration !== Number.NEGATIVE_INFINITY;
}

/**
 * 如果需要则设置当前播放时间
 * @param {HTMLMediaElement} element - 媒体元素
 * @param {number} seconds - 目标时间（秒）
 */
function setCurrentTimeIfNeeded(element, seconds) {
    // 如果时间差大于等于1秒，才值得跳转
    if (Math.abs((element.currentTime || 0) - seconds) >= 1) {
        element.currentTime = seconds;
    }
}

/**
 * 在播放开始时定位到指定位置
 * @param {Object} instance - 播放器实例
 * @param {HTMLMediaElement} element - 媒体元素
 * @param {number} ticks - 开始位置（以ticks为单位）
 * @param {Function} onMediaReady - 媒体准备就绪的回调函数
 */
export function seekOnPlaybackStart(instance, element, ticks, onMediaReady) {
    const seconds = (ticks || 0) / 10000000;

    if (seconds) {
        // 在查询字符串中添加#t=xxx对HLS不起作用
        // 对于普通视频文件，也不是所有浏览器都支持

        if (element.duration >= seconds) {
            // 媒体已准备好，立即定位
            setCurrentTimeIfNeeded(element, seconds);
            if (onMediaReady) onMediaReady();
        } else {
            // 当媒体准备好可以定位时更新播放器位置
            const events = ['durationchange', 'loadeddata', 'play', 'loadedmetadata'];
            const onMediaChange = function(e) {
                if (element.currentTime === 0 && element.duration >= seconds) {
                    // 仅在视频位置恰好为零时才定位，
                    // 因为这仅在视频尚未开始或用户倒回到最开始时为true
                    // （但倒回不可能作为第一个非空时长媒体的事件发生）
                    console.debug(`在${e.type}事件上定位到${seconds}秒`);
                    setCurrentTimeIfNeeded(element, seconds);
                    events.forEach(name => {
                        element.removeEventListener(name, onMediaChange);
                    });
                    if (onMediaReady) onMediaReady();
                }
            };
            events.forEach(name => {
                element.addEventListener(name, onMediaChange);
            });
        }
    }
}

/**
 * 应用媒体源到元素
 * @param {HTMLMediaElement} elem - 媒体元素
 * @param {string} src - 媒体源URL
 * @param {Object} options - 选项对象
 * @returns {Promise} Promise对象
 */
export function applySrc(elem, src, options) {
    // Windows平台本地文件的特殊处理
    if (window.Windows && options.mediaSource?.IsLocal) {
        return Windows.Storage.StorageFile.getFileFromPathAsync(options.url).then(function (file) {
            const playlist = new Windows.Media.Playback.MediaPlaybackList();

            const source1 = Windows.Media.Core.MediaSource.createFromStorageFile(file);
            const startTime = (options.playerStartPositionTicks || 0) / 10000;
            playlist.items.append(new Windows.Media.Playback.MediaPlaybackItem(source1, startTime));
            elem.src = URL.createObjectURL(playlist, { oneTimeOnly: true });
            return Promise.resolve();
        });
    } else {
        elem.src = src;
    }

    return Promise.resolve();
}

/**
 * 重置媒体元素的源
 * @param {HTMLMediaElement} elem - 媒体元素
 */
export function resetSrc(elem) {
    elem.src = '';
    elem.innerHTML = '';
    elem.removeAttribute('src');
}

/**
 * 播放成功时的处理函数
 * @param {HTMLMediaElement} elem - 媒体元素
 * @param {Function} onErrorFn - 错误处理函数
 */
function onSuccessfulPlay(elem, onErrorFn) {
    elem.addEventListener('error', onErrorFn);
}

/**
 * 使用Promise方式播放媒体
 * @param {HTMLMediaElement} elem - 媒体元素
 * @param {Function} onErrorFn - 错误处理函数
 * @returns {Promise} 播放Promise
 */
export function playWithPromise(elem, onErrorFn) {
    try {
        return elem.play()
            .catch((e) => {
                const errorName = (e.name || '').toLowerCase();
                // Safari使用aborterror
                if (errorName === 'notallowederror'
                        || errorName === 'aborterror') {
                    // 忽略此错误，因为用户仍然可以点击视频元素上的播放按钮
                    return Promise.resolve();
                }
                return Promise.reject(e);
            })
            .then(() => {
                onSuccessfulPlay(elem, onErrorFn);
                return Promise.resolve();
            });
    } catch (err) {
        console.error('调用video.play时出错: ' + err);
        return Promise.reject();
    }
}

/**
 * 销毁Cast播放器
 * @param {Object} instance - 播放器实例
 */
export function destroyCastPlayer(instance) {
    const player = instance._castPlayer;
    if (player) {
        try {
            player.unload();
        } catch (err) {
            console.error(err);
        }

        instance._castPlayer = null;
    }
}

/**
 * 销毁HLS播放器
 * @param {Object} instance - 播放器实例
 */
export function destroyHlsPlayer(instance) {
    const player = instance._hlsPlayer;
    if (player) {
        try {
            player.destroy();
        } catch (err) {
            console.error(err);
        }

        instance._hlsPlayer = null;
    }
}

/**
 * 销毁FLV播放器
 * @param {Object} instance - 播放器实例
 */
export function destroyFlvPlayer(instance) {
    const player = instance._flvPlayer;
    if (player) {
        try {
            player.unload();
            player.detachMediaElement();
            player.destroy();
        } catch (err) {
            console.error(err);
        }

        instance._flvPlayer = null;
    }
}

/**
 * 绑定HLS播放器事件
 * @param {Object} instance - 播放器实例
 * @param {Object} hls - HLS.js实例
 * @param {HTMLMediaElement} elem - 媒体元素
 * @param {Function} onErrorFn - 错误处理函数
 * @param {Function} resolve - Promise resolve函数
 * @param {Function} reject - Promise reject函数
 */
export function bindEventsToHlsPlayer(instance, hls, elem, onErrorFn, resolve, reject) {
    // 当HLS清单解析完成时触发
    hls.on(Hls.Events.MANIFEST_PARSED, function () {
        playWithPromise(elem, onErrorFn).then(resolve, function () {
            if (reject) {
                reject();
                reject = null;
            }
        });
    });

    // HLS错误事件处理
    hls.on(Hls.Events.ERROR, function (event, data) {
        console.error('HLS错误: 类型: ' + data.type + ' 详情: ' + (data.details || '') + ' 致命: ' + (data.fatal || false));

        // 尝试恢复网络错误
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR
                && data.response?.code && data.response.code >= 400
        ) {
            console.debug('hls.js响应错误代码: ' + data.response.code);

            // 根据是在播放开始之前还是之后，以不同方式触发失败
            hls.destroy();

            if (reject) {
                reject(MediaError.SERVER_ERROR);
                reject = null;
            } else {
                onErrorInternal(instance, MediaError.SERVER_ERROR);
            }

            return;
        }

        // 处理致命错误
        if (data.fatal) {
            switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:

                    if (data.response && data.response.code === 0) {
                        // 这可能是与访问控制响应头相关的CORS错误

                        console.debug('hls.js响应错误代码: ' + data.response.code);

                        // 根据是在播放开始之前还是之后，以不同方式触发失败
                        hls.destroy();

                        if (reject) {
                            reject(MediaError.NETWORK_ERROR);
                            reject = null;
                        } else {
                            onErrorInternal(instance, MediaError.NETWORK_ERROR);
                        }
                    } else {
                        console.debug('遇到致命网络错误，尝试恢复');
                        hls.startLoad();
                    }

                    break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                    console.debug('遇到致命媒体错误，尝试恢复');
                    handleHlsJsMediaError(instance, reject);
                    reject = null;
                    break;
                default:

                    console.debug('无法从HLS错误中恢复 - 销毁并触发错误');
                    // 无法恢复
                    // 根据是在播放开始之前还是之后，以不同方式触发失败
                    hls.destroy();

                    if (reject) {
                        reject();
                        reject = null;
                    } else {
                        onErrorInternal(instance, MediaError.FATAL_HLS_ERROR);
                    }
                    break;
            }
        }
    });
}

/**
 * 播放结束时的内部处理函数
 * @param {Object} instance - 播放器实例
 * @param {HTMLMediaElement} elem - 媒体元素
 * @param {Function} onErrorFn - 错误处理函数
 */
export function onEndedInternal(instance, elem, onErrorFn) {
    elem.removeEventListener('error', onErrorFn);

    resetSrc(elem);

    destroyHlsPlayer(instance);
    destroyFlvPlayer(instance);
    destroyCastPlayer(instance);

    const stopInfo = {
        src: instance._currentSrc
    };

    Events.trigger(instance, 'stopped', [stopInfo]);

    instance._currentTime = null;
    instance._currentSrc = null;
    instance._currentPlayOptions = null;
}

/**
 * 获取已缓冲的时间范围
 * @param {Object} instance - 播放器实例
 * @param {HTMLMediaElement} elem - 媒体元素
 * @returns {Array} 缓冲范围数组
 */
export function getBufferedRanges(instance, elem) {
    const ranges = [];
    const seekable = elem.buffered || [];

    let offset;
    const currentPlayOptions = instance._currentPlayOptions;
    if (currentPlayOptions) {
        offset = currentPlayOptions.transcodingOffsetTicks;
    }

    offset = offset || 0;

    for (let i = 0, length = seekable.length; i < length; i++) {
        let start = seekable.start(i);
        let end = seekable.end(i);

        if (!isValidDuration(start)) {
            start = 0;
        }
        if (!isValidDuration(end)) {
            // eslint-disable-next-line sonarjs/no-dead-store
            end = 0;
            continue;
        }

        ranges.push({
            start: (start * 10000000) + offset,
            end: (end * 10000000) + offset
        });
    }

    return ranges;
}
