/**
 * 主标签页管理器
 * 负责管理和控制应用程序顶部标签栏的显示和行为
 */

import dom from '../scripts/dom';
import browser from '../scripts/browser';
import Events from '../utils/events.ts';
import '../elements/emby-tabs/emby-tabs';
import '../elements/emby-button/emby-button';

// 当前拥有标签的视图
let tabOwnerView;
// 查询范围，指向页面头部区域
const queryScope = document.querySelector('.skinHeader');
// 头部标签容器元素
let headerTabsContainer;
// 标签页元素
let tabsElem;

/**
 * 确保DOM元素已初始化
 * 如果头部标签容器不存在，则从页面中查找并缓存
 */
function ensureElements() {
    if (!headerTabsContainer) {
        headerTabsContainer = queryScope.querySelector('.headerTabs');
    }
}

/**
 * 标签页准备就绪时的回调函数
 * 设置之前保存的选中索引
 */
function onViewTabsReady() {
    this.selectedIndex(this.readySelectedIndex);
    this.readySelectedIndex = null;
}

/**
 * 检查目标元素是否允许滑动手势
 * @param {Element} target - 需要检查的目标元素
 * @returns {boolean} 如果允许滑动返回true，否则返回false
 */
function allowSwipe(target) {
    /**
     * 检查单个元素是否允许滑动
     * @param {Element} elem - 要检查的元素
     * @returns {boolean} 是否允许滑动
     */
    function allowSwipeOn(elem) {
        // 如果是输入框，不允许滑动
        if (dom.parentWithTag(elem, 'input')) {
            return false;
        }

        const classList = elem.classList;
        if (classList) {
            // 如果元素包含横向滚动类名，不允许滑动
            return !classList.contains('scrollX') && !classList.contains('animatedScrollX');
        }

        return true;
    }

    // 向上遍历DOM树，检查所有父元素
    let parent = target;
    while (parent != null) {
        if (!allowSwipeOn(parent)) {
            return false;
        }
        parent = parent.parentNode;
    }

    return true;
}

/**
 * 为标签页配置滑动手势支持
 * @param {Element} view - 视图元素
 * @param {Element} currentElement - 当前标签元素
 */
function configureSwipeTabs(view, currentElement) {
    // 非触摸设备不需要滑动功能
    if (!browser.touch) {
        return;
    }

    // 左滑事件处理 - 切换到下一个标签
    const onSwipeLeft = function (e, target) {
        if (allowSwipe(target) && view.contains(target)) {
            currentElement.selectNext();
        }
    };

    // 右滑事件处理 - 切换到上一个标签
    const onSwipeRight = function (e, target) {
        if (allowSwipe(target) && view.contains(target)) {
            currentElement.selectPrevious();
        }
    };

    // 动态导入触摸助手并配置滑动事件
    import('../scripts/touchHelper').then(({ default: TouchHelper }) => {
        const touchHelper = new TouchHelper(view.parentNode.parentNode);

        Events.on(touchHelper, 'swipeleft', onSwipeLeft);
        Events.on(touchHelper, 'swiperight', onSwipeRight);

        // 视图销毁时清理触摸助手
        view.addEventListener('viewdestroy', function () {
            touchHelper.destroy();
        });
    });
}

/**
 * 设置和管理标签页
 * @param {Element} view - 视图元素
 * @param {number} selectedIndex - 选中的标签索引
 * @param {Function} getTabsFn - 获取标签配置的函数
 * @param {Function} getTabContainersFn - 获取标签容器的函数
 * @param {Function} onBeforeTabChange - 标签切换前的回调
 * @param {Function} onTabChange - 标签切换后的回调
 * @param {boolean} setSelectedIndex - 是否设置选中索引
 * @returns {Object} 包含标签容器和替换状态的对象
 */
export function setTabs(view, selectedIndex, getTabsFn, getTabContainersFn, onBeforeTabChange, onTabChange, setSelectedIndex) {
    ensureElements();

    // 如果没有视图，清理现有标签
    if (!view) {
        if (tabOwnerView) {
            document.body.classList.remove('withSectionTabs');

            headerTabsContainer.innerHTML = '';
            headerTabsContainer.classList.add('hide');

            tabOwnerView = null;
        }
        return {
            tabsContainer: headerTabsContainer,
            replaced: false
        };
    }

    const tabsContainerElem = headerTabsContainer;

    // 如果之前没有标签视图，显示标签容器
    if (!tabOwnerView) {
        tabsContainerElem.classList.remove('hide');
    }

    // 如果是新视图，需要重新构建标签
    if (tabOwnerView !== view) {
        let index = 0;

        // 构建索引属性
        const indexAttribute = selectedIndex == null ? '' : (' data-index="' + selectedIndex + '"');
        // 构建标签HTML
        const tabsHtml = '<div is="emby-tabs"' + indexAttribute + ' class="tabs-viewmenubar"><div class="emby-tabs-slider" style="white-space:nowrap;">' + getTabsFn().map(function (t) {
            let tabClass = 'emby-tab-button';

            // 如果标签被禁用，添加隐藏类
            if (t.enabled === false) {
                tabClass += ' hide';
            }

            let tabHtml;

            // 添加自定义CSS类
            if (t.cssClass) {
                tabClass += ' ' + t.cssClass;
            }

            // 根据是否有链接生成不同的HTML
            if (t.href) {
                // 带链接的标签（使用锚点元素）
                tabHtml = '<a href="' + t.href + '" is="emby-linkbutton" class="' + tabClass + '" data-index="' + index + '"><div class="emby-button-foreground">' + t.name + '</div></a>';
            } else {
                // 普通按钮标签
                tabHtml = '<button type="button" is="emby-button" class="' + tabClass + '" data-index="' + index + '"><div class="emby-button-foreground">' + t.name + '</div></button>';
            }

            index++;
            return tabHtml;
        }).join('') + '</div></div>';

        // 将生成的HTML插入到容器中
        tabsContainerElem.innerHTML = tabsHtml;
        // 升级自定义元素
        window.CustomElements.upgradeSubtree(tabsContainerElem);

        // 添加标签页样式类
        document.body.classList.add('withSectionTabs');
        tabOwnerView = view;

        // 获取标签元素引用
        tabsElem = tabsContainerElem.querySelector('[is="emby-tabs"]');

        // 配置滑动手势
        configureSwipeTabs(view, tabsElem);

        // 如果提供了获取标签容器的函数，设置标签切换前的事件处理
        if (getTabContainersFn) {
            tabsElem.addEventListener('beforetabchange', function (e) {
                const tabContainers = getTabContainersFn();
                // 移除之前活动面板的激活状态
                if (e.detail.previousIndex != null) {
                    const previousPanel = tabContainers[e.detail.previousIndex];
                    if (previousPanel) {
                        previousPanel.classList.remove('is-active');
                    }
                }

                // 激活新选中的面板
                const newPanel = tabContainers[e.detail.selectedTabIndex];

                if (newPanel) {
                    newPanel.classList.add('is-active');
                }
            });
        }

        // 添加标签切换前的自定义回调
        if (onBeforeTabChange) {
            tabsElem.addEventListener('beforetabchange', onBeforeTabChange);
        }
        // 添加标签切换后的自定义回调
        if (onTabChange) {
            tabsElem.addEventListener('tabchange', onTabChange);
        }

        // 设置选中的标签索引
        if (setSelectedIndex !== false) {
            if (tabsElem.selectedIndex) {
                // 如果selectedIndex方法已存在，直接设置
                tabsElem.selectedIndex(selectedIndex);
            } else {
                // 否则保存索引，等待元素准备就绪后设置
                tabsElem.readySelectedIndex = selectedIndex;
                tabsElem.addEventListener('ready', onViewTabsReady);
            }
        }

        return {
            tabsContainer: tabsContainerElem,
            tabs: tabsElem,
            replaced: true // 标签已被替换
        };
    }

    // 视图相同，只更新选中索引
    tabsElem.selectedIndex(selectedIndex);

    return {
        tabsContainer: tabsContainerElem,
        tabs: tabsElem,
        replaced: false // 标签未被替换
    };
}

/**
 * 设置或触发选中的标签索引
 * @param {number} index - 要选中的标签索引，如果为null则触发标签变更
 */
export function selectedTabIndex(index) {
    if (index != null) {
        tabsElem.selectedIndex(index);
    } else {
        // 触发标签变更事件
        tabsElem.triggerTabChange();
    }
}

/**
 * 获取标签页元素
 * @returns {Element} 标签页元素
 */
export function getTabsElement() {
    return document.querySelector('.tabs-viewmenubar');
}
