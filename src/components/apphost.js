/**
 * AppHost 模块
 *
 * 此模块提供应用程序主机功能，负责管理设备信息、浏览器功能检测、
 * 应用程序生命周期事件以及平台特定的操作。
 */

import appSettings from '../scripts/settings/appSettings';
import browser from '../scripts/browser';
import Events from '../utils/events.ts';
import * as htmlMediaHelper from '../components/htmlMediaHelper';
import * as webSettings from '../scripts/settings/webSettings';
import globalize from '../lib/globalize';
import profileBuilder from '../scripts/browserDeviceProfile';
import { AppFeature } from 'constants/appFeature';

// 应用程序名称
const appName = 'Jellyfin Web';

/**
 * 浏览器名称映射表
 * 将浏览器类型映射为用户友好的显示名称
 */
const BrowserName = {
    tizen: 'Samsung Smart TV',
    web0s: 'LG Smart TV',
    operaTv: 'Opera TV',
    xboxOne: 'Xbox One',
    ps4: 'Sony PS4',
    chrome: 'Chrome',
    edgeChromium: 'Edge Chromium',
    edge: 'Edge',
    firefox: 'Firefox',
    opera: 'Opera',
    safari: 'Safari'
};

/**
 * 获取基础配置选项
 *
 * @param {Object} item - 媒体项目对象
 * @returns {Object} 包含 enableMkvProgressive 和 disableHlsVideoAudioCodecs 的配置对象
 */
function getBaseProfileOptions(item) {
    const disableHlsVideoAudioCodecs = [];

    // 如果启用了 HLS.js 播放器，根据浏览器类型禁用特定的音频编解码器
    if (item && htmlMediaHelper.enableHlsJsPlayer(item.RunTimeTicks, item.MediaType)) {
        // Edge 浏览器不支持 HLS 中的 mp3
        if (browser.edge) {
            disableHlsVideoAudioCodecs.push('mp3');
        }
        // 非 Edge Chromium 浏览器不支持 ac3 和 eac3
        if (!browser.edgeChromium) {
            disableHlsVideoAudioCodecs.push('ac3');
            disableHlsVideoAudioCodecs.push('eac3');
        }
        // 非 Chrome、Edge Chromium 和 Firefox 浏览器不支持 opus
        if (!(browser.chrome || browser.edgeChromium || browser.firefox)) {
            disableHlsVideoAudioCodecs.push('opus');
        }
    }

    return {
        enableMkvProgressive: false,
        disableHlsVideoAudioCodecs: disableHlsVideoAudioCodecs
    };
}

/**
 * 获取设备配置文件
 *
 * 根据当前设备和浏览器特性构建播放配置文件，包括支持的编解码器、
 * 转码配置和视频分辨率限制。
 *
 * @param {Object} item - 媒体项目对象
 * @returns {Promise<Object>} 返回设备配置文件的 Promise
 */
function getDeviceProfile(item) {
    return new Promise(function (resolve) {
        let profile;

        // 如果存在原生壳层，使用其提供的设备配置文件
        if (window.NativeShell) {
            profile = window.NativeShell.AppHost.getDeviceProfile(profileBuilder, __PACKAGE_JSON_VERSION__);
        } else {
            // 否则使用浏览器配置构建器
            const builderOpts = getBaseProfileOptions(item);
            profile = profileBuilder(builderOpts);
        }

        // 获取最大视频宽度设置
        const maxVideoWidth = appSettings.maxVideoWidth();
        const maxTranscodingVideoWidth = maxVideoWidth < 0 ? appHost.screen()?.maxAllowedWidth : maxVideoWidth;

        if (maxTranscodingVideoWidth) {
            // 定义视频宽度条件
            const conditionWidth = {
                Condition: 'LessThanEqual',
                Property: 'Width',
                Value: maxTranscodingVideoWidth.toString(),
                IsRequired: false
            };

            // 如果限制支持的视频分辨率，添加到编解码器配置
            if (appSettings.limitSupportedVideoResolution()) {
                profile.CodecProfiles.push({
                    Type: 'Video',
                    Conditions: [conditionWidth]
                });
            }

            // 为所有视频转码配置添加宽度限制
            profile.TranscodingProfiles.forEach((transcodingProfile) => {
                if (transcodingProfile.Type === 'Video') {
                    transcodingProfile.Conditions = (transcodingProfile.Conditions || []).filter((condition) => {
                        return condition.Property !== 'Width';
                    });

                    transcodingProfile.Conditions.push(conditionWidth);
                }
            });
        }

        // 设置首选的视频转码编解码器
        const preferredTranscodeVideoCodec = appSettings.preferredTranscodeVideoCodec();
        if (preferredTranscodeVideoCodec) {
            profile.TranscodingProfiles.forEach((transcodingProfile) => {
                if (transcodingProfile.Type === 'Video') {
                    const videoCodecs = transcodingProfile.VideoCodec.split(',');
                    const index = videoCodecs.indexOf(preferredTranscodeVideoCodec);
                    if (index !== -1) {
                        // 将首选编解码器移到列表开头
                        videoCodecs.splice(index, 1);
                        videoCodecs.unshift(preferredTranscodeVideoCodec);
                        transcodingProfile.VideoCodec = videoCodecs.join(',');
                    }
                }
            });
        }

        // 设置首选的音频转码编解码器
        const preferredTranscodeVideoAudioCodec = appSettings.preferredTranscodeVideoAudioCodec();
        if (preferredTranscodeVideoAudioCodec) {
            profile.TranscodingProfiles.forEach((transcodingProfile) => {
                if (transcodingProfile.Type === 'Video') {
                    const audioCodecs = transcodingProfile.AudioCodec.split(',');
                    const index = audioCodecs.indexOf(preferredTranscodeVideoAudioCodec);
                    if (index !== -1) {
                        // 将首选编解码器移到列表开头
                        audioCodecs.splice(index, 1);
                        audioCodecs.unshift(preferredTranscodeVideoAudioCodec);
                        transcodingProfile.AudioCodec = audioCodecs.join(',');
                    }
                }
            });
        }

        resolve(profile);
    });
}

/**
 * 生成设备 ID
 *
 * 使用用户代理和当前时间戳生成唯一的设备标识符。
 *
 * @returns {string|number} Base64 编码的设备 ID 或时间戳
 */
function generateDeviceId() {
    const keys = [];

    keys.push(navigator.userAgent);
    keys.push(new Date().getTime());
    if (window.btoa) {
        return btoa(keys.join('|')).replaceAll('=', '1');
    }

    return new Date().getTime();
}

/**
 * 获取设备 ID
 *
 * 从应用设置中获取或生成新的设备 ID。
 *
 * @returns {string} 设备唯一标识符
 */
function getDeviceId() {
    if (!deviceId) {
        const key = '_deviceId2';

        deviceId = appSettings.get(key);

        if (!deviceId) {
            deviceId = generateDeviceId();
            appSettings.set(key, deviceId);
        }
    }

    return deviceId;
}

/**
 * 获取设备名称
 *
 * 根据浏览器类型和平台生成用户友好的设备名称。
 *
 * @returns {string} 设备名称（如 "Chrome Android"）
 */
function getDeviceName() {
    if (deviceName) {
        return deviceName;
    }

    deviceName = 'Web Browser'; // 默认设备名称

    // 根据浏览器类型设置设备名称
    for (const key in BrowserName) {
        if (browser[key]) {
            deviceName = BrowserName[key];
            break;
        }
    }

    // 添加平台后缀
    if (browser.ipad) {
        deviceName += ' iPad';
    } else if (browser.iphone) {
        deviceName += ' iPhone';
    } else if (browser.android) {
        deviceName += ' Android';
    }
    return deviceName;
}

/**
 * 检查是否支持全屏功能
 *
 * @returns {boolean} 如果设备支持全屏则返回 true
 */
function supportsFullscreen() {
    // 电视设备不支持全屏
    if (browser.tv) {
        return false;
    }

    const element = document.documentElement;
    return !!(element.requestFullscreen || element.mozRequestFullScreen || element.webkitRequestFullscreen || element.msRequestFullscreen || document.createElement('video').webkitEnterFullscreen);
}

/**
 * 获取默认布局类型
 *
 * @returns {string} 返回 'desktop'
 */
function getDefaultLayout() {
    return 'desktop';
}

/**
 * 检查是否支持 HTML 媒体自动播放
 *
 * @returns {boolean} 如果支持自动播放则返回 true
 */
function supportsHtmlMediaAutoplay() {
    // 智能电视和游戏机平台通常支持自动播放
    if (browser.edgeUwp || browser.tizen || browser.web0s || browser.orsay || browser.operaTv || browser.ps4 || browser.xboxOne) {
        return true;
    }

    // 桌面浏览器支持，移动设备不支持
    return !browser.mobile;
}

/**
 * 检测浏览器是否支持 CSS ::cue 伪元素
 *
 * 用于判断是否可以自定义字幕样式。
 *
 * @returns {boolean} 如果支持 ::cue 则返回 true
 */
function supportsCue() {
    try {
        const video = document.createElement('video');
        const style = document.createElement('style');

        style.textContent = 'video::cue {background: inherit}';
        document.body.appendChild(style);
        document.body.appendChild(video);

        const cue = window.getComputedStyle(video, '::cue').background;
        document.body.removeChild(style);
        document.body.removeChild(video);

        return !!cue.length;
    } catch (err) {
        console.error('error detecting cue support: ' + err);
        return false;
    }
}

/**
 * 当应用变为可见时触发
 *
 * 触发 'resume' 事件通知应用恢复运行。
 */
function onAppVisible() {
    if (isHidden) {
        isHidden = false;
        Events.trigger(appHost, 'resume');
    }
}

/**
 * 当应用变为隐藏时触发
 *
 * 更新应用隐藏状态。
 */
function onAppHidden() {
    if (!isHidden) {
        isHidden = true;
    }
}

/**
 * 支持的功能列表
 *
 * 根据浏览器和平台能力检测并返回支持的应用功能列表。
 * 这是一个立即执行函数表达式 (IIFE)。
 */
const supportedFeatures = function () {
    const features = [];

    // 分享功能（如果浏览器支持 Navigator.share API）
    if (navigator.share) {
        features.push(AppFeature.Sharing);
    }

    // 文件下载功能（智能电视和游戏机除外）
    if (!browser.edgeUwp && !browser.tv && !browser.xboxOne && !browser.ps4) {
        features.push(AppFeature.FileDownload);
    }

    // 退出功能（智能电视平台）
    if (browser.operaTv || browser.tizen || browser.orsay || browser.web0s) {
        features.push(AppFeature.Exit);
    }

    // 外部链接功能（智能电视和 PS4 除外）
    if (!browser.operaTv && !browser.tizen && !browser.orsay && !browser.web0s && !browser.ps4) {
        features.push(AppFeature.ExternalLinks);
    }

    // HTML 媒体自动播放功能
    if (supportsHtmlMediaAutoplay()) {
        features.push(AppFeature.HtmlAudioAutoplay);
        features.push(AppFeature.HtmlVideoAutoplay);
    }

    // 全屏功能
    if (supportsFullscreen()) {
        features.push(AppFeature.Fullscreen);
    }

    // 物理音量控制（电视、游戏机和移动设备）
    if (browser.tv || browser.xboxOne || browser.ps4 || browser.mobile || browser.ipad) {
        features.push(AppFeature.PhysicalVolumeControl);
    }

    // 远程控制功能（桌面浏览器）
    if (!browser.tv && !browser.xboxOne && !browser.ps4) {
        features.push(AppFeature.RemoteControl);
    }

    // 远程视频播放功能
    if (!browser.operaTv && !browser.tizen && !browser.orsay && !browser.web0s && !browser.edgeUwp) {
        features.push(AppFeature.RemoteVideo);
    }

    // 通用功能
    features.push(AppFeature.DisplayLanguage);
    features.push(AppFeature.DisplayMode);
    features.push(AppFeature.TargetBlank);
    features.push(AppFeature.Screensaver);

    // 多服务器功能（异步检查）
    webSettings.getMultiServer().then(enabled => {
        if (enabled) features.push(AppFeature.MultiServer);
    });

    // 字幕外观自定义功能
    if (!browser.orsay && (browser.firefox || browser.ps4 || browser.edge || supportsCue())) {
        features.push(AppFeature.SubtitleAppearance);
    }

    // 字幕烧录功能
    if (!browser.orsay) {
        features.push(AppFeature.SubtitleBurnIn);
    }

    // 文件输入功能
    if (!browser.tv && !browser.ps4 && !browser.xboxOne) {
        features.push(AppFeature.FileInput);
    }

    // Chromecast 投屏功能
    if (browser.chrome || browser.edgeChromium) {
        features.push(AppFeature.Chromecast);
    }

    return features;
}();

/**
 * 执行退出操作
 *
 * 根据平台调用相应的退出方法。
 */
function doExit() {
    try {
        if (window.NativeShell?.AppHost?.exit) {
            window.NativeShell.AppHost.exit();
        } else if (browser.tizen) {
            // Tizen 平台（三星智能电视）
            tizen.application.getCurrentApplication().exit();
        } else if (browser.web0s) {
            // webOS 平台（LG 智能电视）
            webOS.platformBack();
        } else {
            // 默认浏览器退出
            window.close();
        }
    } catch (err) {
        console.error('error closing application: ' + err);
    }
}

let exitPromise;

/**
 * 请求用户确认退出
 *
 * 显示确认对话框，让用户选择是否退出应用。
 */
function askForExit() {
    if (exitPromise) {
        return;
    }

    import('../components/actionSheet/actionSheet').then((actionsheet) => {
        exitPromise = actionsheet.show({
            title: globalize.translate('MessageConfirmAppExit'),
            items: [
                { id: 'yes', name: globalize.translate('Yes') },
                { id: 'no', name: globalize.translate('No') }
            ]
        }).then(function (value) {
            if (value === 'yes') {
                doExit();
            }
        }).finally(function () {
            exitPromise = null;
        });
    });
}

// 设备 ID 和设备名称的缓存变量
let deviceId;
let deviceName;

/**
 * AppHost 对象
 *
 * 提供应用主机功能的主要接口，包括设备信息、功能检测、
 * 应用生命周期管理等。
 */
export const appHost = {
    /**
     * 获取窗口状态
     * @returns {string} 窗口状态（默认为 'Normal'）
     */
    getWindowState: function () {
        return document.windowState || 'Normal';
    },
    /**
     * 设置窗口状态（不支持）
     */
    setWindowState: function () {
        alert('setWindowState is not supported and should not be called');
    },
    /**
     * 退出应用
     */
    exit: function () {
        if (!!window.appMode && browser.tizen) {
            askForExit();
        } else {
            doExit();
        }
    },
    /**
     * 检查是否支持特定功能
     * @param {string} command - 功能命令
     * @returns {boolean} 是否支持该功能
     */
    supports: function (command) {
        if (window.NativeShell) {
            return window.NativeShell.AppHost.supports(command);
        }

        return supportedFeatures.indexOf(command.toLowerCase()) !== -1;
    },
    // 是否优先使用视觉卡片布局
    preferVisualCards: browser.android || browser.chrome,
    /**
     * 获取默认布局类型
     * @returns {string} 布局类型
     */
    getDefaultLayout: function () {
        if (window.NativeShell) {
            return window.NativeShell.AppHost.getDefaultLayout();
        }

        return getDefaultLayout();
    },
    getDeviceProfile: getDeviceProfile,
    /**
     * 初始化应用主机
     * @returns {Object} 包含设备 ID 和设备名称的对象
     */
    init: function () {
        if (window.NativeShell) {
            return window.NativeShell.AppHost.init();
        }

        return {
            deviceId: getDeviceId(),
            deviceName: getDeviceName()
        };
    },
    /**
     * 获取设备名称
     * @returns {string} 设备名称
     */
    deviceName: function () {
        return window.NativeShell?.AppHost?.deviceName ?
            window.NativeShell.AppHost.deviceName() : getDeviceName();
    },
    /**
     * 获取设备 ID
     * @returns {string} 设备唯一标识符
     */
    deviceId: function () {
        return window.NativeShell?.AppHost?.deviceId ?
            window.NativeShell.AppHost.deviceId() : getDeviceId();
    },
    /**
     * 获取应用名称
     * @returns {string} 应用名称
     */
    appName: function () {
        return window.NativeShell?.AppHost?.appName ?
            window.NativeShell.AppHost.appName() : appName;
    },
    /**
     * 获取应用版本
     * @returns {string} 应用版本号
     */
    appVersion: function () {
        return window.NativeShell?.AppHost?.appVersion ?
            window.NativeShell.AppHost.appVersion() : __PACKAGE_JSON_VERSION__;
    },
    /**
     * 获取推送令牌信息
     * @returns {Object} 空对象（Web 端不支持推送）
     */
    getPushTokenInfo: function () {
        return {};
    },
    /**
     * 设置用户缩放选项
     * @param {boolean} scalable - 是否允许用户缩放
     */
    setUserScalable: function (scalable) {
        if (!browser.tv) {
            const att = scalable ? 'width=device-width, initial-scale=1, minimum-scale=1, user-scalable=yes' : 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no';
            document.querySelector('meta[name=viewport]').setAttribute('content', att);
        }
    },
    /**
     * 获取屏幕信息
     * @returns {Object|null} 包含屏幕宽度、高度和最大允许宽度的对象
     */
    screen: () => {
        let hostScreen = null;

        const appHostImpl = window.NativeShell?.AppHost;

        if (appHostImpl?.screen) {
            hostScreen = appHostImpl.screen();
        } else if (window.screen && !browser.tv) {
            hostScreen = {
                width: Math.floor(window.screen.width * window.devicePixelRatio),
                height: Math.floor(window.screen.height * window.devicePixelRatio)
            };
        }

        if (hostScreen) {
            // 使用较大的尺寸以适应屏幕方向变化
            hostScreen.maxAllowedWidth = Math.max(hostScreen.width, hostScreen.height);
        }

        return hostScreen;
    }
};

// 应用隐藏状态标志
let isHidden = false;
let hidden;
let visibilityChange;

// 检测浏览器的可见性 API
if (typeof document.hidden !== 'undefined') {
    hidden = 'hidden';
    visibilityChange = 'visibilitychange';
} else if (typeof document.webkitHidden !== 'undefined') {
    hidden = 'webkitHidden';
    visibilityChange = 'webkitvisibilitychange';
}

// 监听页面可见性变化
document.addEventListener(visibilityChange, function () {
    if (document[hidden]) {
        onAppHidden();
    } else {
        onAppVisible();
    }
}, false);

// 监听窗口焦点事件
if (window.addEventListener) {
    window.addEventListener('focus', onAppVisible);
    window.addEventListener('blur', onAppHidden);
}

// 模块加载时初始化 app host
appHost.init();
