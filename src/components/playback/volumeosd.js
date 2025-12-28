
import { playbackManager } from './playbackmanager';
import dom from '../../scripts/dom';
import browser from '../../scripts/browser';
import Events from '../../utils/events.ts';

import './iconosd.scss';
import 'material-design-icons-iconfont';

let currentPlayer;
let osdElement;
let iconElement;
let progressElement;

let enableAnimation;

function getOsdElementHtml() {
    // 生成 OSD（屏幕提示）DOM 结构：图标 + 进度条
    let html = '';

    html += '<span class="material-icons iconOsdIcon volume_up" aria-hidden="true"></span>';

    html += '<div class="iconOsdProgressOuter"><div class="iconOsdProgressInner"></div></div>';

    return html;
}

function ensureOsdElement() {
    // 确保 OSD 容器存在（单例）：首次需要时创建并挂到 body
    let elem = osdElement;
    if (!elem) {
        // 根据浏览器能力决定是否走 CSS 动画隐藏/显示（无动画则直接切换 hide）
        enableAnimation = browser.supportsCssAnimation();

        elem = document.createElement('div');
        elem.classList.add('hide');
        elem.classList.add('iconOsd');
        elem.classList.add('iconOsd-hidden');
        elem.classList.add('volumeOsd');
        elem.innerHTML = getOsdElementHtml();

        iconElement = elem.querySelector('.material-icons');
        progressElement = elem.querySelector('.iconOsdProgressInner');

        document.body.appendChild(elem);
        osdElement = elem;
    }
}

function onHideComplete() {
    // 隐藏过渡结束后，真正把元素从布局中隐藏（配合 CSS）
    this.classList.add('hide');
}

let hideTimeout;
function showOsd() {
    // 显示 OSD，并在一段时间后自动隐藏
    clearHideTimeout();

    const elem = osdElement;

    dom.removeEventListener(elem, dom.whichTransitionEvent(), onHideComplete, {
        once: true
    });

    elem.classList.remove('hide');

    // 触发一次 reflow（强制浏览器计算布局），确保后续 class 切换能正确触发过渡
    void elem.offsetWidth;

    requestAnimationFrame(function () {
        // 下一帧再移除 hidden class，让 CSS transition 有机会生效
        elem.classList.remove('iconOsd-hidden');

        // 3 秒后自动隐藏（再次 show 时会被 clear）
        hideTimeout = setTimeout(hideOsd, 3000);
    });
}

function clearHideTimeout() {
    // 清理自动隐藏计时器，避免快速重复触发 show/hide 时出现竞争
    if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
    }
}

function hideOsd() {
    // 隐藏 OSD：优先走 CSS 动画；若不支持动画则直接隐藏
    clearHideTimeout();

    const elem = osdElement;
    if (elem) {
        if (enableAnimation) {
            // 触发一次 reflow，确保添加 hidden class 能触发过渡
            void elem.offsetWidth;

            requestAnimationFrame(function () {
                // 通过 class 触发 CSS 过渡隐藏
                elem.classList.add('iconOsd-hidden');

                // 监听过渡结束后再加上 hide（避免瞬间消失/闪烁）
                dom.addEventListener(elem, dom.whichTransitionEvent(), onHideComplete, {
                    once: true
                });
            });
        } else {
            // 不支持动画：直接视为“过渡完成”
            onHideComplete.call(elem);
        }
    }
}

function updatePlayerVolumeState(isMuted, volume) {
    // 根据播放器状态更新图标（静音/有声）和音量百分比进度条
    if (iconElement) {
        iconElement.classList.remove('volume_off', 'volume_up');
        iconElement.classList.add(isMuted ? 'volume_off' : 'volume_up');
    }
    if (progressElement) {
        progressElement.style.width = (volume || 0) + '%';
    }
}

function releaseCurrentPlayer() {
    // 解绑旧播放器事件，避免内存泄漏/重复响应
    const player = currentPlayer;

    if (player) {
        Events.off(player, 'volumechange', onVolumeChanged);
        Events.off(player, 'playbackstop', hideOsd);
        currentPlayer = null;
    }
}

function onVolumeChanged() {
    // 播放器音量变化时：确保 OSD 存在 -> 更新显示 -> 弹出提示
    const player = this;

    ensureOsdElement();

    updatePlayerVolumeState(player.isMuted(), player.getVolume());

    showOsd();
}

function bindToPlayer(player) {
    // 切换到新的播放器实例：先释放旧监听，再绑定新监听
    if (player === currentPlayer) {
        return;
    }

    releaseCurrentPlayer();

    currentPlayer = player;

    if (!player) {
        return;
    }

    // 绑定新播放器前先隐藏旧 OSD 状态（避免残留）
    hideOsd();
    Events.on(player, 'volumechange', onVolumeChanged);
    Events.on(player, 'playbackstop', hideOsd);
}

Events.on(playbackManager, 'playerchange', function () {
    // playbackManager 切换当前播放器时，同步重新绑定事件
    bindToPlayer(playbackManager.getCurrentPlayer());
});

// 初始化：绑定到当前播放器（如果存在）
bindToPlayer(playbackManager.getCurrentPlayer());
