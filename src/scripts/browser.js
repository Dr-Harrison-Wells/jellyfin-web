/**
 * 浏览器检测模块
 *
 * 此模块负责检测和识别浏览器类型、平台、版本以及设备特性。
 * 支持检测各种智能电视、移动设备、游戏机和桌面浏览器。
 */

/**
 * 检测是否为智能电视设备
 *
 * @returns {boolean} 如果是智能电视返回 true
 */
function isTv() {
    // 检测智能电视比较困难，需要多种方式综合判断
    const userAgent = navigator.userAgent.toLowerCase();

    // Oculus 浏览器的 UserAgent 也包含 samsungbrowser，但它不是电视
    if (userAgent.indexOf('oculusbrowser') !== -1) {
        return false;
    }

    // UserAgent 中包含 'tv' 关键字
    if (userAgent.indexOf('tv') !== -1) {
        return true;
    }

    // 三星浏览器（智能电视）
    if (userAgent.indexOf('samsungbrowser') !== -1) {
        return true;
    }

    // 松下 Viera 智能电视
    if (userAgent.indexOf('viera') !== -1) {
        return true;
    }

    // 检测 LG webOS 电视
    return isWeb0s();
}

/**
 * 检测是否为 LG webOS 电视
 *
 * @returns {boolean} 如果是 webOS 设备返回 true
 */
function isWeb0s() {
    const userAgent = navigator.userAgent.toLowerCase();

    // NetCast 是 LG 旧版智能电视平台，webOS 是新版平台
    return userAgent.indexOf('netcast') !== -1
        || userAgent.indexOf('web0s') !== -1;
}

/**
 * 检测是否为移动设备
 *
 * @param {string} userAgent - 用户代理字符串
 * @returns {boolean} 如果是移动设备返回 true
 */
function isMobile(userAgent) {
    // 移动设备关键字列表
    const terms = [
        'mobi', // 通用移动设备标识
        'ipad', // iPad
        'iphone', // iPhone
        'ipod', // iPod
        'silk', // Amazon Silk 浏览器
        'gt-p1000', // 三星 Galaxy Tab
        'nexus 7', // Google Nexus 7
        'kindle fire', // Amazon Kindle Fire
        'opera mini' // Opera Mini 浏览器
    ];

    const lower = userAgent.toLowerCase();

    for (let i = 0, length = terms.length; i < length; i++) {
        if (lower.indexOf(terms[i]) !== -1) {
            return true;
        }
    }

    return false;
}

/**
 * 检测设备是否具有键盘输入能力
 *
 * @param {Object} browser - 浏览器检测对象
 * @returns {boolean} 如果设备有键盘返回 true
 */
function hasKeyboard(browser) {
    // 触摸设备通常有虚拟键盘
    if (browser.touch) {
        return true;
    }

    // Xbox One 有键盘支持
    if (browser.xboxOne) {
        return true;
    }

    // PlayStation 4 有键盘支持
    if (browser.ps4) {
        return true;
    }

    if (browser.edgeUwp) {
        // 目前这样处理是可以的，但并非总是正确
        // 是否应该使用这个方法？
        // https://gist.github.com/wagonli/40d8a31bd0d6f0dd7a5d
        return true;
    }

    // 智能电视通常有遥控器或虚拟键盘
    return !!browser.tv;
}

/**
 * 获取 iOS 设备的版本号
 *
 * @returns {Array<number>} iOS 版本号数组 [主版本, 次版本, 补丁版本]，如果不是 iOS 设备则返回空数组
 */
function iOSversion() {
    // MacIntel: Apple iPad Pro 11 iOS 13.1
    // iOS 13+ 的 iPad 可能报告为 MacIntel 平台
    if (/iP(hone|od|ad)|MacIntel/.test(navigator.platform)) {
        const tests = [
            // iOS 2.0+ 中获取完整 iOS 版本号的原始测试
            /OS (\d+)_(\d+)_?(\d+)?/,
            // iOS 13+ iPad 的测试，只能获取主要版本号
            /Version\/(\d+)/
        ];
        for (const test of tests) {
            const matches = RegExp(test).exec(navigator.appVersion);
            if (matches) {
                return [
                    parseInt(matches[1], 10),
                    parseInt(matches[2] || 0, 10),
                    parseInt(matches[3] || 0, 10)
                ];
            }
        }
    }
    return [];
}

/**
 * 检测 LG webOS 电视的版本号
 *
 * 通过 Web 引擎版本推断 webOS 版本。
 *
 * @param {Object} browser - 浏览器检测对象
 * @returns {number|undefined} webOS 版本号，无法检测时返回 undefined
 */
function web0sVersion(browser) {
    // 通过 Web 引擎版本检测 webOS 版本

    if (browser.chrome) {
        const userAgent = navigator.userAgent.toLowerCase();

        if (userAgent.indexOf('netcast') !== -1) {
            // 内置浏览器（NetCast）的版本可能与实际 Web 引擎不对应
            // 由于没有可靠的方法检测 webOS 版本，返回 undefined

            console.warn('Unable to detect webOS version - NetCast');

            return undefined;
        }

        // 以下仅对应用程序有效

        // Chrome 版本号与 webOS 版本的对应关系
        if (browser.versionMajor >= 94) {
            return 23; // webOS 23
        } else if (browser.versionMajor >= 87) {
            return 22; // webOS 22
        } else if (browser.versionMajor >= 79) {
            return 6; // webOS 6
        } else if (browser.versionMajor >= 68) {
            return 5; // webOS 5
        } else if (browser.versionMajor >= 53) {
            return 4; // webOS 4
        } else if (browser.versionMajor >= 38) {
            return 3; // webOS 3
        } else if (browser.versionMajor >= 34) {
            return 2; // webOS 2 浏览器
        } else if (browser.versionMajor >= 26) {
            return 1; // webOS 1 浏览器
        }
    } else if (browser.versionMajor >= 538) {
        return 2; // webOS 2 应用
    } else if (browser.versionMajor >= 537) {
        return 1; // webOS 1 应用
    }

    console.error('Unable to detect webOS version');

    return undefined;
}

// CSS 动画支持检测的缓存变量
let _supportsCssAnimation;
let _supportsCssAnimationWithPrefix;

/**
 * 检测浏览器是否支持 CSS 动画
 *
 * @param {boolean} allowPrefix - 是否允许带前缀的 CSS 属性
 * @returns {boolean} 如果支持 CSS 动画返回 true
 */
function supportsCssAnimation(allowPrefix) {
    // TODO: 评估是否仍然需要此检测，因为我们的目标浏览器应该都原生支持 CSS 动画
    if (allowPrefix && (_supportsCssAnimationWithPrefix === true || _supportsCssAnimationWithPrefix === false)) {
        return _supportsCssAnimationWithPrefix;
    }
    if (_supportsCssAnimation === true || _supportsCssAnimation === false) {
        return _supportsCssAnimation;
    }

    let animation = false;
    // 浏览器前缀列表（Webkit、Opera、Mozilla）
    const domPrefixes = ['Webkit', 'O', 'Moz'];
    const elm = document.createElement('div');

    // 检测是否支持标准的 animationName 属性
    // eslint-disable-next-line sonarjs/different-types-comparison
    if (elm.style.animationName !== undefined) {
        animation = true;
    }

    // 如果不支持标准属性且允许前缀，则检测带前缀的属性
    if (animation === false && allowPrefix) {
        for (const domPrefix of domPrefixes) {
            if (elm.style[domPrefix + 'AnimationName'] !== undefined) {
                animation = true;
                break;
            }
        }
    }

    if (allowPrefix) {
        _supportsCssAnimationWithPrefix = animation;
        return _supportsCssAnimationWithPrefix;
    } else {
        _supportsCssAnimation = animation;
        return _supportsCssAnimation;
    }
}

/**
 * 解析 UserAgent 字符串以识别浏览器和平台
 *
 * @param {string} ua - UserAgent 字符串
 * @returns {Object} 包含浏览器类型、版本和平台信息的对象
 */
const uaMatch = function (ua) {
    ua = ua.toLowerCase();

    // 移除 Motorola Edge 手机标识，避免与 Edge 浏览器混淆
    ua = ua.replace(/(motorola edge)/, '').trim();

    // 按优先级匹配浏览器类型和版本
    const match = /(edg)[ /]([\w.]+)/.exec(ua) // Edge Chromium (桌面)
        || /(edga)[ /]([\w.]+)/.exec(ua) // Edge (Android)
        || /(edgios)[ /]([\w.]+)/.exec(ua) // Edge (iOS)
        || /(edge)[ /]([\w.]+)/.exec(ua) // Edge (旧版)
        || /(opera)[ /]([\w.]+)/.exec(ua) // Opera
        || /(opr)[ /]([\w.]+)/.exec(ua) // Opera (新版标识)
        || /(chrome)[ /]([\w.]+)/.exec(ua) // Chrome
        || /(safari)[ /]([\w.]+)/.exec(ua) // Safari
        || /(firefox)[ /]([\w.]+)/.exec(ua) // Firefox
        || ua.indexOf('compatible') < 0 && /(mozilla)(?:.*? rv:([\w.]+)|)/.exec(ua) // Mozilla
        || [];

    // 匹配版本号（某些浏览器使用独立的 Version 字段）
    const versionMatch = /(version)[ /]([\w.]+)/.exec(ua);

    // 匹配平台类型
    let platformMatch = /(ipad)/.exec(ua) // iPad
        || /(iphone)/.exec(ua) // iPhone
        || /(windows)/.exec(ua) // Windows
        || /(android)/.exec(ua) // Android
        || [];

    let browser = match[1] || '';

    // Edge 浏览器清除平台匹配
    if (browser === 'edge') {
        platformMatch = [''];
    }

    // 将 'opr' 标识统一为 'opera'
    if (browser === 'opr') {
        browser = 'opera';
    }

    let version;
    if (versionMatch && versionMatch.length > 2) {
        version = versionMatch[2];
    }

    version = version || match[2] || '0';

    let versionMajor = parseInt(version.split('.')[0], 10);

    if (isNaN(versionMajor)) {
        versionMajor = 0;
    }

    return {
        browser: browser,
        version: version,
        platform: platformMatch[0] || '',
        versionMajor: versionMajor
    };
};

// 获取浏览器的 UserAgent 字符串
const userAgent = navigator.userAgent;

// 解析 UserAgent
const matched = uaMatch(userAgent);
// 浏览器检测结果对象
const browser = {};

// 设置浏览器类型和版本信息
if (matched.browser) {
    browser[matched.browser] = true;
    browser.version = matched.version;
    browser.versionMajor = matched.versionMajor;
}

// 设置平台信息
if (matched.platform) {
    browser[matched.platform] = true;
}

// 检测 Edge Chromium 浏览器（各平台）
browser.edgeChromium = browser.edg || browser.edga || browser.edgios;

// 如果是 WebKit 内核但不是已知的其他浏览器，则判定为 Safari
if (!browser.chrome && !browser.edgeChromium && !browser.edge && !browser.opera && userAgent.toLowerCase().indexOf('webkit') !== -1) {
    browser.safari = true;
}

// 检测 macOS 系统
browser.osx = userAgent.toLowerCase().indexOf('mac os x') !== -1;

// 这是一个变通方法，用于检测 iOS 13+ 的 iPad（报告为桌面 Safari）
// 如果苹果将来发布触摸屏 Mac，此方法可能失效
// https://forums.developer.apple.com/thread/119186
if (browser.osx && !browser.iphone && !browser.ipod && !browser.ipad && navigator.maxTouchPoints > 1) {
    browser.ipad = true;
}

// 检测 PlayStation 4
if (userAgent.toLowerCase().indexOf('playstation 4') !== -1) {
    browser.ps4 = true;
    browser.tv = true;
}

// 检测移动设备
if (isMobile(userAgent)) {
    browser.mobile = true;
}

// 检测 Xbox One
if (userAgent.toLowerCase().indexOf('xbox') !== -1) {
    browser.xboxOne = true;
    browser.tv = true;
}

// 检测是否支持 Web Animations API
browser.animate = typeof document !== 'undefined' && document.documentElement.animate != null;
// 检测海信智能电视
browser.hisense = userAgent.toLowerCase().includes('hisense');
// 检测三星 Tizen 电视
browser.tizen = userAgent.toLowerCase().indexOf('tizen') !== -1 || window.tizen != null;
// 检测海信 VIDAA 电视
browser.vidaa = userAgent.toLowerCase().includes('vidaa');
// 检测 LG webOS 电视
browser.web0s = isWeb0s();
// 检测 Edge UWP 应用（Windows 通用应用平台）
browser.edgeUwp = browser.edge && (userAgent.toLowerCase().indexOf('msapphost') !== -1 || userAgent.toLowerCase().indexOf('webview') !== -1);

if (browser.web0s) {
    // 获取 webOS 版本号
    browser.web0sVersion = web0sVersion(browser);

    // UserAgent 字符串包含 'Chrome' 和 'Safari'，但我们只需要 'web0s' 为 true
    delete browser.chrome;
    delete browser.safari;
} else if (browser.tizen) {
    // 解析 Tizen 版本号（例如：Tizen 5.5）
    const v = RegExp(/Tizen (\d+).(\d+)/).exec(userAgent);
    browser.tizenVersion = parseInt(v[1], 10) + parseInt(v[2], 10) / 10;

    // UserAgent 字符串包含 'Chrome' 和 'Safari'，但我们只需要 'tizen' 为 true
    delete browser.chrome;
    delete browser.safari;
} else {
    // 检测三星 Orsay 电视（旧版智能电视平台）
    browser.orsay = userAgent.toLowerCase().indexOf('smarthub') !== -1;
}

// Edge UWP 也标记为 Edge
if (browser.edgeUwp) {
    browser.edge = true;
}

// 最终确定是否为智能电视
browser.tv = isTv();
// 检测 Opera TV 浏览器
browser.operaTv = browser.tv && userAgent.toLowerCase().indexOf('opr/') !== -1;

// 移动设备和智能电视通常性能较低，标记为 slow
if (browser.mobile || browser.tv) {
    browser.slow = true;
}

// 检测触摸屏支持
if (typeof document !== 'undefined' && ('ontouchstart' in window) || (navigator.maxTouchPoints > 0)) {
    browser.touch = true;
}

// 设置键盘支持
browser.keyboard = hasKeyboard(browser);
// 设置 CSS 动画支持检测函数
browser.supportsCssAnimation = supportsCssAnimation;

// 检测是否为 iOS 设备
browser.iOS = browser.ipad || browser.iphone || browser.ipod;

// 获取 iOS 版本号
if (browser.iOS) {
    browser.iOSVersion = iOSversion();

    // 将版本号数组转换为浮点数（例如：[13, 1] -> 13.1）
    if (browser.iOSVersion && browser.iOSVersion.length >= 2) {
        browser.iOSVersion = browser.iOSVersion[0] + (browser.iOSVersion[1] / 10);
    }
}

// 导出浏览器检测对象
export default browser;
