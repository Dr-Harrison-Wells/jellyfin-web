/**
 * 用于执行自动聚焦的模块。
 * @module components/autoFocuser
 */

import focusManager from './focusManager';
import layoutManager from './layoutManager';

/**
     * 之前选中的元素。
     */
let activeElement;

/**
     * 如果启用了自动聚焦，则返回 _true_。
     */
export function isEnabled() {
    return layoutManager.tv;
}

/**
     * 启动自动聚焦。
     */
export function enable() {
    if (!isEnabled()) {
        return;
    }

    // 监听 focusin 事件以记录当前活动的元素
    window.addEventListener('focusin', function (e) {
        activeElement = e.target;
    });

    console.debug('AutoFocuser enabled');
}

/**
     * 在合适的元素上设置焦点，同时考虑到之前选中的元素。
     * @param {HTMLElement | null} [container] - 限制范围的元素。
     * @returns {HTMLElement} 聚焦的元素。
     */
export function autoFocus(container) {
    if (!isEnabled()) {
        return null;
    }

    container = container || document.body;

    let candidates = [];

    if (activeElement) {
        // 这些元素会被重新创建
        if (activeElement.classList.contains('btnPreviousPage')) {
            candidates.push(container.querySelector('.btnPreviousPage'));
            candidates.push(container.querySelector('.btnNextPage'));
        } else if (activeElement.classList.contains('btnNextPage')) {
            candidates.push(container.querySelector('.btnNextPage'));
            candidates.push(container.querySelector('.btnPreviousPage'));
        } else if (activeElement.classList.contains('btnSelectView')) {
            candidates.push(container.querySelector('.btnSelectView'));
        }

        candidates.push(activeElement);
    }

    // 添加播放按钮作为候选
    candidates = candidates.concat(Array.from(container.querySelectorAll('.btnPlay')));

    let focusedElement;

    // 尝试聚焦候选列表中的第一个可聚焦元素
    candidates.every(function (element) {
        if (focusManager.isCurrentlyFocusable(element)) {
            focusManager.focus(element);
            focusedElement = element;
            return false;
        }

        return true;
    });

    if (!focusedElement) {
        // FIXME: 多个 itemsContainers
        const itemsContainer = container.querySelector('.itemsContainer');

        if (itemsContainer) {
            focusedElement = focusManager.autoFocus(itemsContainer);
        }
    }

    if (!focusedElement) {
        focusedElement = focusManager.autoFocus(container);
    }

    return focusedElement;
}

export default {
    isEnabled: isEnabled,
    enable: enable,
    autoFocus: autoFocus
};
