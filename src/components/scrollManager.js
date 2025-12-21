/**
 * 用于控制滚动行为的模块。
 * Module for controlling scroll behavior.
 * @module components/scrollManager
 */

import dom from '../scripts/dom';
import appSettings from 'scripts/settings/appSettings';
import layoutManager from './layoutManager';

/**
     * 滚动时间（毫秒）。
     * Scroll time in ms.
     */
const ScrollTime = 270;

/**
     * 用于比较值的精度常量。
     * Epsilon for comparing values.
     */
const Epsilon = 1e-6;

// 待修复: 需要滚动到页面顶部以完全显示顶部菜单。这可以通过某些最顶部元素或其容器的标记来解决
// FIXME: Need to scroll to top of page to fully show the top menu. This can be solved by some marker of top most elements or their containers
/**
     * 返回最小垂直滚动值。
     * 小于此值的滚动将被归零。
     * Returns minimum vertical scroll.
     * Scroll less than that value will be zeroed.
     *
     * @return {number} Minimum vertical scroll.
     */
function minimumScrollY() {
    const topMenu = document.querySelector('.headerTop');
    if (topMenu) {
        return topMenu.clientHeight;
    }
    return 0;
}

const supportsSmoothScroll = 'scrollBehavior' in document.documentElement.style;

let supportsScrollToOptions = false;
try {
    const elem = document.createElement('div');

    const opts = Object.defineProperty({}, 'behavior', {
        get: function () {
            supportsScrollToOptions = true;
            return null;
        }
    });

    elem.scrollTo(opts);
} catch {
    // no scroll to options support
}

/**
     * 返回限制在范围 [min, max] 内的值。
     * Returns value clamped by range [min, max].
     *
     * @param {number} value - Clamped value. 要限制的值
     * @param {number} min - Begining of range. 范围的最小值
     * @param {number} max - Ending of range. 范围的最大值
     * @return {number} Clamped value. 限制后的值
     */
function clamp(value, min, max) {
    if (value <= min) {
        return min;
    } else if (value >= max) {
        return max;
    }
    return value;
}

/**
     * 返回将范围1适配到范围2所需的偏移量。
     * 如果范围1大于范围2，则返回适配最超出范围部分的偏移量。
     * Returns the required delta to fit range 1 into range 2.
     * In case of range 1 is bigger than range 2 returns delta to fit most out of range part.
     *
     * @param {number} begin1 - Begining of range 1. 范围1的起始值
     * @param {number} end1 - Ending of range 1. 范围1的结束值
     * @param {number} begin2 - Begining of range 2. 范围2的起始值
     * @param {number} end2 - Ending of range 2. 范围2的结束值
     * @return {number} Delta: <0 move range1 to the left, >0 - to the right. 偏移量：<0 向左移动范围1，>0 向右移动
     */
function fitRange(begin1, end1, begin2, end2) {
    const delta1 = begin1 - begin2;
    const delta2 = end2 - end1;
    if (delta1 < 0 && delta1 < delta2) {
        return -delta1;
    } else if (delta2 < 0) {
        return delta2;
    }
    return 0;
}

/**
     * 缓动函数。
     * Ease value.
     *
     * @param {number} t - Value in range [0, 1]. 范围 [0, 1] 内的值
     * @return {number} Eased value in range [0, 1]. 缓动后的值，范围 [0, 1]
     */
function ease(t) {
    return t * (2 - t); // easeOutQuad === ease-out 二次缓出
}

/**
     * 矩形对象类型定义。
     * @typedef {Object} Rect
     * @property {number} left - X coordinate of top-left corner. 左上角的X坐标
     * @property {number} top - Y coordinate of top-left corner. 左上角的Y坐标
     * @property {number} width - Width. 宽度
     * @property {number} height - Height. 高度
     */

/**
     * 文档滚动包装器，用于统一滚动行为并修复某些浏览器的问题。
     * Document scroll wrapper helps to unify scrolling and fix issues of some browsers.
     *
     * webOS 2 Browser: 滚动 documentElement（和 window），但 body 有滚动大小
     * webOS 2 Browser: scrolls documentElement (and window), but body has a scroll size
     *
     * webOS 3 Browser: 滚动 body（和 window）
     * webOS 3 Browser: scrolls body (and window)
     *
     * webOS 4 Native: 滚动 body（和 window）；有 document.scrollingElement
     * webOS 4 Native: scrolls body (and window); has a document.scrollingElement
     *
     * Tizen 4 Browser/Native: 滚动 body（和 window）；有 document.scrollingElement
     * Tizen 4 Browser/Native: scrolls body (and window); has a document.scrollingElement
     *
     * Tizen 5 Browser/Native: 滚动 documentElement（和 window）；有 document.scrollingElement
     * Tizen 5 Browser/Native: scrolls documentElement (and window); has a document.scrollingElement
     */
class DocumentScroller {
    /**
         * 水平滚动位置。
         * Horizontal scroll position.
         * @type {number}
         */
    get scrollLeft() {
        return window.pageXOffset;
    }

    set scrollLeft(val) {
        window.scroll(val, window.pageYOffset);
    }

    /**
         * 垂直滚动位置。
         * Vertical scroll position.
         * @type {number}
         */
    get scrollTop() {
        return window.pageYOffset;
    }

    set scrollTop(val) {
        window.scroll(window.pageXOffset, val);
    }

    /**
         * 水平滚动尺寸（滚动宽度）。
         * Horizontal scroll size (scroll width).
         * @type {number}
         */
    get scrollWidth() {
        return Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    }

    /**
         * 垂直滚动尺寸（滚动高度）。
         * Vertical scroll size (scroll height).
         * @type {number}
         */
    get scrollHeight() {
        return Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    }

    /**
         * 水平客户端尺寸（客户端宽度）。
         * Horizontal client size (client width).
         * @type {number}
         */
    get clientWidth() {
        return Math.min(document.documentElement.clientWidth, document.body.clientWidth);
    }

    /**
         * 垂直客户端尺寸（客户端高度）。
         * Vertical client size (client height).
         * @type {number}
         */
    get clientHeight() {
        return Math.min(document.documentElement.clientHeight, document.body.clientHeight);
    }

    /**
         * 返回属性值。
         * Returns attribute value.
         * @param {string} attributeName - Attibute name. 属性名称
         * @return {string} Attibute value. 属性值
         */
    getAttribute(attributeName) {
        return document.body.getAttribute(attributeName);
    }

    /**
         * 返回边界客户端矩形。
         * Returns bounding client rect.
         * @return {Rect} Bounding client rect. 边界客户端矩形
         */
    getBoundingClientRect() {
        // 生成有效的视口坐标：documentElement.getBoundingClientRect 返回整个文档相对于视口的矩形
        // Make valid viewport coordinates: documentElement.getBoundingClientRect returns rect of entire document relative to viewport
        return {
            left: 0,
            top: 0,
            width: this.clientWidth,
            height: this.clientHeight
        };
    }

    /**
         * 滚动窗口。
         * Scrolls window.
         * @param {...mixed} args See window.scrollTo. 参见 window.scrollTo
         */
    scrollTo() {
        window.scrollTo.apply(window, arguments);
    }
}

/**
     * 默认（文档）滚动器。
     * Default (document) scroller.
     */
const documentScroller = new DocumentScroller();

const scrollerHints = {
    x: {
        nameScroll: 'scrollWidth',
        nameClient: 'clientWidth',
        nameStyle: 'overflowX',
        nameScrollMode: 'data-scroll-mode-x'
    },
    y: {
        nameScroll: 'scrollHeight',
        nameClient: 'clientHeight',
        nameStyle: 'overflowY',
        nameScrollMode: 'data-scroll-mode-y'
    }
};

/**
     * 返回可以滚动的父元素。如果没有，则返回文档滚动器。
     * Returns parent element that can be scrolled. If no such, returns document scroller.
     *
     * @param {HTMLElement} element - Element for which parent is being searched. 正在搜索其父元素的元素
     * @param {boolean} vertical - Search for vertical scrollable parent. 搜索垂直可滚动的父元素
     * @param {HTMLElement|DocumentScroller} Parent element that can be scrolled or document scroller. 可以滚动的父元素或文档滚动器
     */
function getScrollableParent(element, vertical) {
    if (element) {
        const scrollerHint = vertical ? scrollerHints.y : scrollerHints.x;

        let parent = element.parentElement;

        while (parent && parent !== document.body) {
            const scrollMode = parent.getAttribute(scrollerHint.nameScrollMode);

            // 在自定义滚动容器处停止
            // Stop on self-scrolled containers
            if (scrollMode === 'custom') {
                return parent;
            }

            const styles = window.getComputedStyle(parent);

            // 在固定定位的父元素处停止
            // Stop on fixed parent
            if (styles.position === 'fixed') {
                return parent;
            }

            const overflow = styles[scrollerHint.nameStyle];

            if (overflow === 'scroll' || overflow === 'auto' && parent[scrollerHint.nameScroll] > parent[scrollerHint.nameClient]) {
                return parent;
            }

            parent = parent.parentElement;
        }
    }

    return documentScroller;
}

/**
     * 滚动器数据对象类型定义。
     * @typedef {Object} ScrollerData
     * @property {number} scrollPos - Current scroll position. 当前滚动位置
     * @property {number} scrollSize - Scroll size. 滚动大小
     * @property {number} clientSize - Client size. 客户端大小
     * @property {string} mode - Scrolling mode. 滚动模式
     * @property {boolean} custom - Custom scrolling mode. 自定义滚动模式
     */

/**
     * 返回指定方向的滚动器数据。
     * Returns scroller data for specified orientation.
     *
     * @param {HTMLElement} scroller - Scroller. 滚动器
     * @param {boolean} vertical - Vertical scroller data. 垂直滚动器数据
     * @return {ScrollerData} Scroller data. 滚动器数据
     */
function getScrollerData(scroller, vertical) {
    const data = {};

    if (!vertical) {
        data.scrollPos = scroller.scrollLeft;
        data.scrollSize = scroller.scrollWidth;
        data.clientSize = scroller.clientWidth;
        data.mode = scroller.getAttribute(scrollerHints.x.nameScrollMode);
    } else {
        data.scrollPos = scroller.scrollTop;
        data.scrollSize = scroller.scrollHeight;
        data.clientSize = scroller.clientHeight;
        data.mode = scroller.getAttribute(scrollerHints.y.nameScrollMode);
    }

    data.custom = data.mode === 'custom';

    return data;
}

/**
     * 返回指定方向上滚动器子元素的位置。
     * Returns position of child of scroller for specified orientation.
     *
     * @param {HTMLElement} scroller - Scroller. 滚动器
     * @param {HTMLElement} element - Child of scroller. 滚动器的子元素
     * @param {boolean} vertical - Vertical scroll. 垂直滚动
     * @return {number} Child position. 子元素位置
     */
function getScrollerChildPos(scroller, element, vertical) {
    const elementRect = element.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();

    if (!vertical) {
        return scroller.scrollLeft + elementRect.left - scrollerRect.left;
    } else {
        return scroller.scrollTop + elementRect.top - scrollerRect.top;
    }
}

/**
     * 返回元素的滚动位置。
     * Returns scroll position for element.
     *
     * @param {ScrollerData} scrollerData - Scroller data. 滚动器数据
     * @param {number} elementPos - Child element position. 子元素位置
     * @param {number} elementSize - Child element size. 子元素大小
     * @param {boolean} centered - Scroll to center. 滚动到中心
     * @return {number} Scroll position. 滚动位置
     */
function calcScroll(scrollerData, elementPos, elementSize, centered) {
    const maxScroll = scrollerData.scrollSize - scrollerData.clientSize;

    let scroll;

    if (centered) {
        scroll = elementPos + (elementSize - scrollerData.clientSize) / 2;
    } else {
        const delta = fitRange(elementPos, elementPos + elementSize - 1, scrollerData.scrollPos, scrollerData.scrollPos + scrollerData.clientSize - 1);
        scroll = scrollerData.scrollPos - delta;
    }

    return clamp(Math.round(scroll), 0, maxScroll);
}

/**
     * 以正确的方式调用 scrollTo 函数。
     * Calls scrollTo function in proper way.
     *
     * @param {HTMLElement} scroller - Scroller. 滚动器
     * @param {ScrollToOptions} options - Scroll options. 滚动选项
     */
function scrollToHelper(scroller, options) {
    if ('scrollTo' in scroller) {
        if (!supportsScrollToOptions) {
            const scrollX = (options.left !== undefined ? options.left : scroller.scrollLeft);
            const scrollY = (options.top !== undefined ? options.top : scroller.scrollTop);
            scroller.scrollTo(scrollX, scrollY);
        } else {
            scroller.scrollTo(options);
        }
    } else if ('scrollLeft' in scroller) {
        if (options.left !== undefined) {
            scroller.scrollLeft = options.left;
        }
        if (options.top !== undefined) {
            scroller.scrollTop = options.top;
        }
    }
}

/**
     * 执行内置滚动。
     * Performs built-in scroll.
     *
     * @param {HTMLElement} xScroller - Horizontal scroller. 水平滚动器
     * @param {number} scrollX - Horizontal coordinate. 水平坐标
     * @param {HTMLElement} yScroller - Vertical scroller. 垂直滚动器
     * @param {number} scrollY - Vertical coordinate. 垂直坐标
     * @param {boolean} smooth - Smooth scrolling. 平滑滚动
     */
function builtinScroll(xScroller, scrollX, yScroller, scrollY, smooth) {
    const scrollBehavior = smooth ? 'smooth' : 'instant';

    if (xScroller !== yScroller) {
        if (xScroller) {
            scrollToHelper(xScroller, { left: scrollX, behavior: scrollBehavior });
        }
        if (yScroller) {
            scrollToHelper(yScroller, { top: scrollY, behavior: scrollBehavior });
        }
    } else if (xScroller) {
        scrollToHelper(xScroller, { left: scrollX, top: scrollY, behavior: scrollBehavior });
    }
}

/**
     * 用于动画滚动的请求帧。
     * Requested frame for animated scroll.
     */
let scrollTimer;

/**
     * 重置滚动计时器以停止滚动。
     * Resets scroll timer to stop scrolling.
     */
function resetScrollTimer() {
    cancelAnimationFrame(scrollTimer);
    scrollTimer = undefined;
}

/**
     * 执行动画滚动。
     * Performs animated scroll.
     *
     * @param {HTMLElement} xScroller - Horizontal scroller. 水平滚动器
     * @param {number} scrollX - Horizontal coordinate. 水平坐标
     * @param {HTMLElement} yScroller - Vertical scroller. 垂直滚动器
     * @param {number} scrollY - Vertical coordinate. 垂直坐标
     */
function animateScroll(xScroller, scrollX, yScroller, scrollY) {
    const ox = xScroller ? xScroller.scrollLeft : scrollX;
    const oy = yScroller ? yScroller.scrollTop : scrollY;
    const dx = scrollX - ox;
    const dy = scrollY - oy;

    if (Math.abs(dx) < Epsilon && Math.abs(dy) < Epsilon) {
        return;
    }

    let start;

    function scrollAnim(currentTimestamp) {
        start = start || currentTimestamp;

        let k = Math.min(1, (currentTimestamp - start) / ScrollTime);

        if (k === 1) {
            resetScrollTimer();
            builtinScroll(xScroller, scrollX, yScroller, scrollY, false);
            return;
        }

        k = ease(k);

        const x = ox + dx * k;
        const y = oy + dy * k;

        builtinScroll(xScroller, x, yScroller, y, false);

        scrollTimer = requestAnimationFrame(scrollAnim);
    }

    scrollTimer = requestAnimationFrame(scrollAnim);
}

/**
     * 执行滚动。
     * Performs scroll.
     *
     * @param {HTMLElement} xScroller - Horizontal scroller. 水平滚动器
     * @param {number} scrollX - Horizontal coordinate. 水平坐标
     * @param {HTMLElement} yScroller - Vertical scroller. 垂直滚动器
     * @param {number} scrollY - Vertical coordinate. 垂直坐标
     * @param {boolean} smooth - Smooth scrolling. 平滑滚动
     */
function doScroll(xScroller, scrollX, yScroller, scrollY, smooth) {
    resetScrollTimer();

    if (smooth && useAnimatedScroll()) {
        animateScroll(xScroller, scrollX, yScroller, scrollY);
    } else {
        builtinScroll(xScroller, scrollX, yScroller, scrollY, smooth);
    }
}

/**
     * 如果必须使用平滑滚动，则返回 true。
     * Returns true if smooth scroll must be used.
     */
function useSmoothScroll() {
    return appSettings.enableSmoothScroll();
}

/**
     * 如果必须使用平滑滚动的动画实现，则返回 true。
     * Returns true if animated implementation of smooth scroll must be used.
     */
function useAnimatedScroll() {
    // 添加代码块以强制使用（或不使用）动画实现
    // Add block to force using (or not) of animated implementation

    return !supportsSmoothScroll;
}

/**
     * 如果滚动管理器已启用，则返回 true。
     * Returns true if scroll manager is enabled.
     */
export function isEnabled() {
    return layoutManager.tv;
}

/**
     * 将文档滚动到给定位置。
     * Scrolls the document to a given position.
     *
     * @param {number} scrollX - Horizontal coordinate. 水平坐标
     * @param {number} scrollY - Vertical coordinate. 垂直坐标
     * @param {boolean} [smooth=false] - Smooth scrolling. 平滑滚动
     */
export function scrollTo(scrollX, scrollY, smooth) {
    smooth = !!smooth;

    // 默认滚动器是文档本身
    // Scroller is document itself by default
    const scroller = getScrollableParent(null, false);

    const xScrollerData = getScrollerData(scroller, false);
    const yScrollerData = getScrollerData(scroller, true);

    scrollX = clamp(Math.round(scrollX), 0, xScrollerData.scrollSize - xScrollerData.clientSize);
    scrollY = clamp(Math.round(scrollY), 0, yScrollerData.scrollSize - yScrollerData.clientSize);

    doScroll(scroller, scrollX, scroller, scrollY, smooth);
}

/**
     * 将文档滚动到给定元素。
     * Scrolls the document to a given element.
     *
     * @param {HTMLElement} element - Target element of scroll task. 滚动任务的目标元素
     * @param {boolean} [smooth=false] - Smooth scrolling. 平滑滚动
     */
export function scrollToElement(element, smooth) {
    smooth = !!smooth;

    let scrollCenterX = true;
    let scrollCenterY = true;

    const offsetParent = element.offsetParent;

    // 在 Firefox 中 offsetParent.offsetParent 是 BODY
    // In Firefox offsetParent.offsetParent is BODY
    const isFixed = offsetParent && (!offsetParent.offsetParent || window.getComputedStyle(offsetParent).position === 'fixed');

    // 将固定定位的元素滚动到最近的边缘（或根本不滚动）
    // Scroll fixed elements to nearest edge (or do not scroll at all)
    if (isFixed) {
        scrollCenterX = scrollCenterY = false;
    }

    let xScroller = getScrollableParent(element, false);
    let yScroller = getScrollableParent(element, true);

    const xScrollerData = getScrollerData(xScroller, false);
    const yScrollerData = getScrollerData(yScroller, true);

    // 退出，因为我们无法控制此容器中的滚动
    // Exit, since we have no control over scrolling in this container
    if (xScroller === yScroller && (xScrollerData.custom || yScrollerData.custom)) {
        return;
    }

    // 退出，因为我们无法控制这些容器中的滚动
    // Exit, since we have no control over scrolling in these containers
    if (xScrollerData.custom && yScrollerData.custom) {
        return;
    }

    const elementRect = element.getBoundingClientRect();

    let scrollX = 0;
    let scrollY = 0;

    if (!xScrollerData.custom) {
        const xPos = getScrollerChildPos(xScroller, element, false);
        scrollX = calcScroll(xScrollerData, xPos, elementRect.width, scrollCenterX);
    } else {
        xScroller = null;
    }

    if (!yScrollerData.custom) {
        const yPos = getScrollerChildPos(yScroller, element, true);
        scrollY = calcScroll(yScrollerData, yPos, elementRect.height, scrollCenterY);

        // 临时方案：因为顶部菜单被隐藏，所以滚动到顶部
        // HACK: Scroll to top for top menu because it is hidden
        // 待修复：需要一个标记来滚动到顶部/底部
        // FIXME: Need a marker to scroll top/bottom
        if (isFixed && elementRect.bottom < 0) {
            scrollY = 0;
        }

        // 临时方案：确保我们在顶部
        // HACK: Ensure we are at the top
        // 待修复：需要一个标记来滚动到顶部/底部
        // FIXME: Need a marker to scroll top/bottom
        if (scrollY < minimumScrollY() && yScroller === documentScroller) {
            scrollY = 0;
        }
    } else {
        yScroller = null;
    }

    doScroll(xScroller, scrollX, yScroller, scrollY, smooth);
}

if (isEnabled()) {
    dom.addEventListener(window, 'focusin', function(e) {
        setTimeout(function() {
            scrollToElement(e.target, useSmoothScroll());
        }, 0);
    }, { capture: true });
}

export default {
    isEnabled: isEnabled,
    scrollTo: scrollTo,
    scrollToElement: scrollToElement
};
