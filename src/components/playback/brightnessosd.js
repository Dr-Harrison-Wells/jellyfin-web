import { playbackManager } from './playbackmanager';
import dom from '../../scripts/dom';
import browser from '../../scripts/browser';
import Events from '../../utils/events.ts';

import './iconosd.scss';
import 'material-design-icons-iconfont';

// 当前正在绑定事件的播放器实例
let currentPlayer;

// OSD（屏幕提示）根节点与子节点引用（懒创建）
let osdElement;
let iconElement;
let progressElement;

// 是否启用 CSS 动画（由浏览器能力决定）
let enableAnimation;

function getOsdElementHtml() {
    let html = '';

    // 亮度图标（Material Icons）
    html += '<span class="material-icons iconOsdIcon brightness_high" aria-hidden="true"></span>';

    // 亮度进度条（通过设置 inner 的 width 来体现百分比）
    html += '<div class="iconOsdProgressOuter"><div class="iconOsdProgressInner brightnessOsdProgressInner"></div></div>';

    return html;
}

function ensureOsdElement() {
    let elem = osdElement;
    if (!elem) {
        // 仅在首次创建时做能力检测与 DOM 创建
        enableAnimation = browser.supportsCssAnimation();

        elem = document.createElement('div');
        elem.classList.add('hide');
        elem.classList.add('iconOsd');
        elem.classList.add('iconOsd-hidden');
        elem.classList.add('brightnessOsd');
        elem.innerHTML = getOsdElementHtml();

        iconElement = elem.querySelector('.material-icons');
        progressElement = elem.querySelector('.iconOsdProgressInner');

        document.body.appendChild(elem);
        osdElement = elem;
    }
}

function onHideComplete() {
    // 隐藏过渡结束后，彻底用 display:none（hide）移除占位
    this.classList.add('hide');
}

let hideTimeout;
function showOsd() {
    clearHideTimeout();

    const elem = osdElement;

    dom.removeEventListener(elem, dom.whichTransitionEvent(), onHideComplete, {
        once: true
    });

    elem.classList.remove('hide');

    // 触发 reflow，确保后续 class 切换能触发 transition
    void elem.offsetWidth;

    requestAnimationFrame(function () {
        elem.classList.remove('iconOsd-hidden');

        // 自动隐藏：3 秒无操作后淡出
        hideTimeout = setTimeout(hideOsd, 3000);
    });
}

function clearHideTimeout() {
    // 防止重复计时器导致闪烁/提前隐藏
    if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
    }
}

function hideOsd() {
    clearHideTimeout();

    const elem = osdElement;
    if (elem) {
        if (enableAnimation) {
            // 触发 reflow，确保隐藏动画生效
            void elem.offsetWidth;

            requestAnimationFrame(function () {
                elem.classList.add('iconOsd-hidden');

                // 等 transition 结束后再加 hide，避免突然消失
                dom.addEventListener(elem, dom.whichTransitionEvent(), onHideComplete, {
                    once: true
                });
            });
        } else {
            // 不支持动画时，直接隐藏
            onHideComplete.call(elem);
        }
    }
}

function setIcon(iconHtmlElement, icon) {
    // 先清理再设置，避免多个亮度等级 class 同时存在
    iconHtmlElement.classList.remove('brightness_high', 'brightness_medium', 'brightness_low');
    iconHtmlElement.classList.add(icon);
}

function updateElementsFromPlayer(brightness) {
    if (iconElement) {
        // 亮度阈值：>=80 高，>=20 中，否则低
        if (brightness >= 80) {
            setIcon(iconElement, 'brightness_high');
        } else if (brightness >= 20) {
            setIcon(iconElement, 'brightness_medium');
        } else {
            setIcon(iconElement, 'brightness_low');
        }
    }
    if (progressElement) {
        // 进度条宽度用百分比表示；brightness 可能为 undefined/null
        progressElement.style.width = (brightness || 0) + '%';
    }
}

function releaseCurrentPlayer() {
    const player = currentPlayer;

    if (player) {
        // 解除旧播放器事件，避免内存泄漏/重复触发
        Events.off(player, 'brightnesschange', onBrightnessChanged);
        Events.off(player, 'playbackstop', hideOsd);
        currentPlayer = null;
    }
}

function onBrightnessChanged() {
    const player = this;

    // 亮度变化时：确保 OSD 存在 -> 更新 UI -> 显示并延时隐藏
    ensureOsdElement();

    updateElementsFromPlayer(playbackManager.getBrightness(player));

    showOsd();
}

function bindToPlayer(player) {
    if (player === currentPlayer) {
        // 同一实例无需重复绑定
        return;
    }

    releaseCurrentPlayer();

    currentPlayer = player;

    if (!player) {
        // 没有可用播放器时，只清理绑定即可
        return;
    }

    // 切换播放器时先隐藏旧 OSD（避免残留）
    hideOsd();
    Events.on(player, 'brightnesschange', onBrightnessChanged);
    Events.on(player, 'playbackstop', hideOsd);
}

Events.on(playbackManager, 'playerchange', function () {
    // 播放器切换时，重新绑定事件到当前播放器
    bindToPlayer(playbackManager.getCurrentPlayer());
});

// 初始化：首次加载时绑定当前播放器
bindToPlayer(playbackManager.getCurrentPlayer());
