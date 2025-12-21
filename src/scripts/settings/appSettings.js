// 导入浏览器工具模块
import browser from 'scripts/browser';
// 导入事件处理工具
import Events from '../../utils/events.ts';
// 导入字符串转布尔值工具函数
import { toBoolean } from '../../utils/string.ts';

/**
 * 应用设置管理类
 * 负责管理和持久化应用程序的各种设置选项
 * 使用 localStorage 存储用户偏好设置
 */
class AppSettings {
    /**
     * 获取存储键名（私有方法）
     * @private
     * @param {string} name - 设置项名称
     * @param {string} userId - 用户ID（可选）
     * @return {string} 如果提供了 userId，返回带用户ID前缀的键名，否则返回原始键名
     */
    #getKey(name, userId) {
        if (userId) {
            name = userId + '-' + name;
        }

        return name;
    }

    /**
     * 获取或设置自动登录状态
     * @param {boolean|undefined} val - 是否启用自动登录，未定义时为获取操作
     * @return {boolean} 自动登录状态，默认为 true
     */
    enableAutoLogin(val) {
        if (val !== undefined) {
            this.set('enableAutoLogin', val.toString());
        }

        return toBoolean(this.get('enableAutoLogin'), true);
    }

    /**
     * 获取或设置游戏手柄启用状态
     * @param {boolean|undefined} val - 是否启用游戏手柄，未定义时为获取操作
     * @return {boolean} 游戏手柄启用状态，默认为 false
     */
    enableGamepad(val) {
        if (val !== undefined) {
            return this.set('enableGamepad', val.toString());
        }

        return toBoolean(this.get('enableGamepad'), false);
    }

    /**
     * 获取或设置平滑滚动启用状态
     * @param {boolean|undefined} val - 是否启用平滑滚动，未定义时为获取操作
     * @return {boolean} 平滑滚动启用状态，Tizen 设备默认启用，其他设备默认禁用
     */
    enableSmoothScroll(val) {
        if (val !== undefined) {
            return this.set('enableSmoothScroll', val.toString());
        }

        return toBoolean(this.get('enableSmoothScroll'), !!browser.tizen);
    }

    /**
     * 获取或设置是否启用系统外部播放器
     * @param {boolean|undefined} val - 是否启用系统外部播放器，未定义时为获取操作
     * @return {boolean} 系统外部播放器启用状态，默认为 false
     */
    enableSystemExternalPlayers(val) {
        if (val !== undefined) {
            this.set('enableSystemExternalPlayers', val.toString());
        }

        return toBoolean(this.get('enableSystemExternalPlayers'), false);
    }

    /**
     * 获取或设置自动比特率检测功能
     * @param {boolean} isInNetwork - 是否在内网环境
     * @param {string} mediaType - 媒体类型（如 'Audio' 或 'Video'）
     * @param {boolean|undefined} val - 是否启用自动比特率检测，未定义时为获取操作
     * @return {boolean} 自动比特率检测状态，对于内网音频始终返回 true，其他情况默认为 true
     */
    enableAutomaticBitrateDetection(isInNetwork, mediaType, val) {
        const key = 'enableautobitratebitrate-' + mediaType + '-' + isInNetwork;
        if (val !== undefined) {
            if (isInNetwork && mediaType === 'Audio') {
                val = true;
            }

            this.set(key, val.toString());
        }

        if (isInNetwork && mediaType === 'Audio') {
            return true;
        } else {
            return toBoolean(this.get(key), true);
        }
    }

    /**
     * 获取或设置最大流媒体比特率
     * @param {boolean} isInNetwork - 是否在内网环境
     * @param {string} mediaType - 媒体类型（如 'Audio' 或 'Video'）
     * @param {number|undefined} val - 最大比特率值，未定义时为获取操作
     * @return {number} 最大比特率值，内网音频返回 150000000，其他情况默认为 1500000
     */
    maxStreamingBitrate(isInNetwork, mediaType, val) {
        const key = 'maxbitrate-' + mediaType + '-' + isInNetwork;
        if (val !== undefined) {
            if (isInNetwork && mediaType === 'Audio') {
                // 无需操作，这始终是最大值
            } else {
                this.set(key, val);
            }
        }

        if (isInNetwork && mediaType === 'Audio') {
            // 返回一个很大的数值以确保始终直接播放
            return 150000000;
        } else {
            return parseInt(this.get(key) || '0', 10) || 1500000;
        }
    }

    /**
     * 获取或设置静态音乐最大比特率
     * @param {number|undefined} val - 最大比特率值，未定义时为获取操作
     * @return {number} 最大静态音乐比特率，默认为 320000
     */
    maxStaticMusicBitrate(val) {
        if (val !== undefined) {
            this.set('maxStaticMusicBitrate', val);
        }

        const defaultValue = 320000;
        return parseInt(this.get('maxStaticMusicBitrate') || defaultValue.toString(), 10) || defaultValue;
    }

    /**
     * 获取或设置 Chromecast 最大比特率
     * @param {number|undefined} val - 最大比特率值，未定义时为获取操作
     * @return {number|null} Chromecast 最大比特率，如果未设置则返回 null
     */
    maxChromecastBitrate(val) {
        if (val !== undefined) {
            this.set('chromecastBitrate1', val);
        }

        val = this.get('chromecastBitrate1');
        return val ? parseInt(val, 10) : null;
    }

    /**
     * 获取或设置视频最大宽度
     * @param {number|undefined} val - 视频最大宽度，未定义时为获取操作
     * @return {number} 视频最大宽度，默认为 0（不限制）
     */
    maxVideoWidth(val) {
        if (val !== undefined) {
            return this.set('maxVideoWidth', val.toString());
        }

        return parseInt(this.get('maxVideoWidth') || '0', 10) || 0;
    }

    /**
     * 获取或设置是否限制最大支持的视频分辨率
     * @param {boolean|undefined} val - 是否限制最大视频分辨率，未定义时为获取操作
     * @return {boolean} 限制最大视频分辨率状态，默认为 false
     */
    limitSupportedVideoResolution(val) {
        if (val !== undefined) {
            return this.set('limitSupportedVideoResolution', val.toString());
        }

        return toBoolean(this.get('limitSupportedVideoResolution'), false);
    }

    /**
     * 获取或设置首选转码视频编解码器
     * @param {string|undefined} val - 首选的视频转码编解码器，未定义时为获取操作
     * @return {string} 首选转码视频编解码器，默认为空字符串
     */
    preferredTranscodeVideoCodec(val) {
        if (val !== undefined) {
            return this.set('preferredTranscodeVideoCodec', val);
        }
        return this.get('preferredTranscodeVideoCodec') || '';
    }

    /**
     * 获取或设置视频播放时首选的转码音频编解码器
     * @param {string|undefined} val - 首选的音频转码编解码器，未定义时为获取操作
     * @return {string} 首选转码音频编解码器，默认为空字符串
     */
    preferredTranscodeVideoAudioCodec(val) {
        if (val !== undefined) {
            return this.set('preferredTranscodeVideoAudioCodec', val);
        }
        return this.get('preferredTranscodeVideoAudioCodec') || '';
    }

    /**
     * 获取或设置转码时是否始终烧录字幕
     * @param {boolean|undefined} val - 是否始终烧录字幕，未定义时为获取操作
     * @return {boolean} 转码时始终烧录字幕状态，默认为 false
     */
    alwaysBurnInSubtitleWhenTranscoding(val) {
        if (val !== undefined) {
            return this.set('alwaysBurnInSubtitleWhenTranscoding', val.toString());
        }

        return toBoolean(this.get('alwaysBurnInSubtitleWhenTranscoding'), false);
    }

    /**
     * 获取或设置 DTS 音频编码启用状态
     * @param {boolean|undefined} val - 是否启用 DTS 音频，未定义时为获取操作
     * @return {boolean} DTS 音频启用状态，默认为 false
     */
    enableDts(val) {
        if (val !== undefined) {
            return this.set('enableDts', val.toString());
        }

        return toBoolean(this.get('enableDts'), false);
    }

    /**
     * 获取或设置 TrueHD 音频编码启用状态
     * @param {boolean|undefined} val - 是否启用 TrueHD 音频，未定义时为获取操作
     * @return {boolean} TrueHD 音频启用状态，默认为 false
     */
    enableTrueHd(val) {
        if (val !== undefined) {
            return this.set('enableTrueHd', val.toString());
        }

        return toBoolean(this.get('enableTrueHd'), false);
    }

    /**
     * 获取或设置 H.264 High 10 Profile 启用状态
     * @param {boolean|undefined} val - 是否启用 H.264 10位色深支持，未定义时为获取操作
     * @return {boolean} H.264 High 10 Profile 启用状态，默认为 false
     */
    enableHi10p(val) {
        if (val !== undefined) {
            return this.set('enableHi10p', val.toString());
        }

        return toBoolean(this.get('enableHi10p'), false);
    }

    /**
     * 获取或设置是否禁用 VBR 音频编码
     * @param {boolean|undefined} val - 是否禁用可变比特率音频编码，未定义时为获取操作
     * @return {boolean} 禁用 VBR 音频编码状态，默认为 false
     */
    disableVbrAudio(val) {
        if (val !== undefined) {
            return this.set('disableVbrAudio', val.toString());
        }

        return toBoolean(this.get('disableVbrAudio'), false);
    }

    /**
     * 获取或设置是否始终重新封装 FLAC 音频文件
     * @param {boolean|undefined} val - 是否始终重新封装 FLAC 文件，未定义时为获取操作
     * @return {boolean} 始终重新封装 FLAC 音频文件状态，默认为 false
     */
    alwaysRemuxFlac(val) {
        if (val !== undefined) {
            return this.set('alwaysRemuxFlac', val.toString());
        }

        return toBoolean(this.get('alwaysRemuxFlac'), false);
    }

    /**
     * 获取或设置是否始终重新封装 MP3 音频文件
     * @param {boolean|undefined} val - 是否始终重新封装 MP3 文件，未定义时为获取操作
     * @return {boolean} 始终重新封装 MP3 音频文件状态，默认为 false
     */
    alwaysRemuxMp3(val) {
        if (val !== undefined) {
            return this.set('alwaysRemuxMp3', val.toString());
        }

        return toBoolean(this.get('alwaysRemuxMp3'), false);
    }

    /**
     * 获取或设置首选视频宽高比
     * @param {string|undefined} val - 视频宽高比，未定义时为获取操作
     * @returns {string} 保存的视频宽高比设置，默认为空字符串
     */
    aspectRatio(val) {
        if (val !== undefined) {
            return this.set('aspectRatio', val);
        }

        return this.get('aspectRatio') || '';
    }

    /**
     * 设置配置项并触发变更事件
     * @param {string} name - 配置项名称
     * @param {string} value - 配置项值
     * @param {string} userId - 用户ID（可选）
     */
    set(name, value, userId) {
        const currentValue = this.get(name, userId);
        localStorage.setItem(this.#getKey(name, userId), value);

        if (currentValue !== value) {
            Events.trigger(this, 'change', [name]);
        }
    }

    /**
     * 获取配置项的值
     * @param {string} name - 配置项名称
     * @param {string} userId - 用户ID（可选）
     * @return {string|null} 配置项的值，如果不存在则返回 null
     */
    get(name, userId) {
        return localStorage.getItem(this.#getKey(name, userId));
    }
}

// 导出 AppSettings 类的单例实例
export default new AppSettings();
