// 视图容器模块
// 负责在单页应用中管理“页面”视图的创建、切换、缓存与销毁。
// 本模块使用一个固定大小的页面容器缓存（`pageContainerCount`），通过
// 轮换索引来复用 DOM 节点，避免频繁重建根容器。
// 主要导出函数：`loadView(options)`, `tryRestoreView(options)`, `reset()`, `setOnBeforeChange(fn)`。
// `options` 常用字段：`url`, `view`(html 字符串或 DOM), `type`, `fullscreen`, `cancel`, `controllerFactory`。
import { importModule } from '@uupaa/dynamic-import-polyfill';
import './viewManager/viewContainer.scss';
import Dashboard from '../utils/dashboard';

// 返回主动画页面容器元素（使用类名 `.mainAnimatedPages`）
/**
 * 获取主动画页面容器元素
 *
 * @returns {HTMLElement|null} - 返回具有类名 `mainAnimatedPages` 的 DOM 元素，找不到时返回 `null`。
 */
const getMainAnimatedPages = () => {
    return document.querySelector('.mainAnimatedPages');
};

// 如果视图声明了 data-controller，则动态加载对应的控制器模块并
// 将其赋值到 `options.controllerFactory`。调用者可随后使用该工厂创建控制器。
// 如果已经提供了 `options.controllerFactory` 或视图没有 data-controller，则直接返回已解析的 Promise。
/**
 * 为视图动态设置控制器类工厂
 *
 * 该函数会检测视图元素的 `data-controller` 属性，若存在则动态加载对应的控制器模块并
 * 将其赋值给 `options.controllerFactory`。如果 `options.controllerFactory` 已存在或视图
 * 未声明控制器，则直接返回已解析的 Promise。
 *
 * @param {HTMLElement} view - 包含 `data-controller` 的视图元素
 * @param {Object} options - 加载视图时传入的选项对象（会被写入 `controllerFactory`）
 * @returns {Promise<void>} - 当控制器 factory 准备好或无需加载时解析
 */
function setControllerClass(view, options) {
    if (options.controllerFactory) {
        return Promise.resolve();
    }

    let controllerUrl = view.getAttribute('data-controller');

    if (controllerUrl) {
        if (controllerUrl.startsWith('__plugin/')) {
            controllerUrl = controllerUrl.substring('__plugin/'.length);
        }

        controllerUrl = Dashboard.getPluginUrl(controllerUrl);
        const apiUrl = ApiClient.getUrl('/web/' + controllerUrl);
        return importModule(apiUrl).then((ControllerFactory) => {
            options.controllerFactory = ControllerFactory;
        });
    }

    return Promise.resolve();
}

// 加载并显示一个新的视图（页面），返回一个 Promise，resolve 时返回该视图元素。
// 主要步骤：
// 1. 选择一个缓存槽位（轮换使用 `pageContainerCount` 个槽位），并销毁当前占位视图的控制器（触发 viewdestroy）。
// 2. 将新的视图 HTML/元素插入主容器，复用或替换 DOM 节点以保留脚本初始化能力（有 jQuery 时使用 appendTo）。
// 3. 根据 options 设置属性（data-type、data-properties）。
// 4. 调用 `setControllerClass` 动态加载控制器（如果有），并执行 onBeforeChange、动画前/后逻辑。
// 注意：`options.cancel` 可用于中断加载流程。
/**
 * 加载并显示一个新的视图（页面）
 *
 * 主要会在可复用的页面容器槽位中插入或替换视图 DOM，并根据 `options` 设置属性与行为，
 * 也会触发相应的生命周期回调（如 `onBeforeChange`）。函数在完成后返回当前显示的视图元素。
 *
 * @param {Object} options - 视图加载选项
 * @param {string} options.url - 视图对应的 URL，用于缓存和恢复匹配
 * @param {string|HTMLElement} options.view - HTML 字符串或已构建的 DOM 元素
 * @param {string} [options.type] - 可选的视图类型，会写入 `data-type` 属性
 * @param {boolean} [options.fullscreen] - 是否以全屏方式显示，会写入 `data-properties`
 * @param {boolean} [options.cancel] - 若为 true 则中止加载流程
 * @param {Function} [options.controllerFactory] - 预先提供的控制器工厂，若提供则不再动态加载
 * @returns {Promise<HTMLElement>|undefined} - 返回一个 Promise，在视图加载并完成动画前设置后 resolve 为该视图元素；
 *                                              如果 `options.cancel` 为 true，则不做任何操作并返回 `undefined`。
 */
export function loadView(options) {
    if (!options.cancel) {
        const selected = selectedPageIndex;
        const previousAnimatable = selected === -1 ? null : allPages[selected];
        let pageIndex = selected + 1;

        // 轮换索引以复用 page 容器
        if (pageIndex >= pageContainerCount) {
            pageIndex = 0;
        }

        const isPluginpage = options.url.includes('configurationpage');
        const newViewInfo = normalizeNewView(options, isPluginpage);
        const newView = newViewInfo.elem;

        const currentPage = allPages[pageIndex];

        // 触发销毁当前缓存页的自定义事件，以便释放资源
        if (currentPage) {
            triggerDestroy(currentPage);
        }

        let view = newView;

        // 如果传入的是字符串，创建一个容器并解析成 DOM
        if (typeof view == 'string') {
            view = document.createElement('div');
            view.innerHTML = newView;
        }

        view.classList.add('mainAnimatedPage');

        const mainAnimatedPages = getMainAnimatedPages();

        if (!mainAnimatedPages) {
            console.warn('[viewContainer] main animated pages element is not present');
            return;
        }

        // 如果有现有页面，则尝试用新页面替换，考虑到 script 标签需要 jQuery 的 appendTo 才能执行
        if (currentPage) {
            if (newViewInfo.hasScript && window.$) {
                mainAnimatedPages.removeChild(currentPage);
                view = $(view).appendTo(mainAnimatedPages)[0];
            } else {
                mainAnimatedPages.replaceChild(view, currentPage);
            }
        } else if (newViewInfo.hasScript && window.$) {
            view = $(view).appendTo(mainAnimatedPages)[0];
        } else {
            mainAnimatedPages.appendChild(view);
        }

        if (options.type) {
            view.setAttribute('data-type', options.type);
        }

        const properties = [];

        if (options.fullscreen) {
            properties.push('fullscreen');
        }

        if (properties.length) {
            view.setAttribute('data-properties', properties.join(','));
        }

        allPages[pageIndex] = view;

        return setControllerClass(view, options)
        // Timeout for polyfilled CustomElements (webOS 1.2)
            .then(() => new Promise((resolve) => setTimeout(resolve, 0)))
            .then(() => {
                if (onBeforeChange) {
                    onBeforeChange(view, false, options);
                }

                beforeAnimate(allPages, pageIndex, selected);
                selectedPageIndex = pageIndex;
                currentUrls[pageIndex] = options.url;

                if (!options.cancel && previousAnimatable) {
                    afterAnimate(allPages, pageIndex);
                }

                if (window.$) {
                    $.mobile = $.mobile || {};
                    $.mobile.activePage = view;
                }

                return view;
            });
    }
}

/**
 * 从给定的 HTML 字符串中解析出 data-role="page" 的页面元素
 *
 * @param {string} html - 包含页面 HTML 的字符串
 * @param {boolean} hasScript - 是否包含被注释掉的 script（需要先还原）
 * @returns {HTMLElement|null} - 返回解析出的 `div[data-role="page"]` 元素，找不到时返回 `null`
 */
function parseHtml(html, hasScript) {
    if (hasScript) {
        html = html
            .replaceAll('\x3c!--<script', '<script')
            .replaceAll('</script>--\x3e', '</script>');
    }

    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    return wrapper.querySelector('div[data-role="page"]');
}
/**
 * 规范化传入的新视图内容，判断是否为页面并提取相关元信息
 *
 * @param {Object} options - 视图选项，包含 `view` 字段
 * @param {boolean} isPluginpage - 指示该视图是否来自插件页（用于检测 jQuery 用法）
 * @returns {{elem: HTMLElement|null, hasScript: boolean, hasjQuerySelect: boolean, hasjQueryChecked: boolean, hasjQuery: boolean}|string}
 *          如果 `options.view` 不包含 `data-role="page"`，会直接返回原始 `view` 字符串，
 *          否则返回一个包含解析后元素和标记的对象。
 */
function normalizeNewView(options, isPluginpage) {
    const viewHtml = options.view;

    if (viewHtml.indexOf('data-role="page"') === -1) {
        return viewHtml;
    }

    let hasScript = viewHtml.indexOf('<script') !== -1;
    const elem = parseHtml(viewHtml, hasScript);

    if (hasScript) {
        hasScript = elem.querySelector('script') != null;
    }

    let hasjQuery = false;
    let hasjQuerySelect = false;
    let hasjQueryChecked = false;

    if (isPluginpage) {
        hasjQuery = viewHtml.indexOf('jQuery') != -1 || viewHtml.indexOf('$(') != -1 || viewHtml.indexOf('$.') != -1;
        hasjQueryChecked = viewHtml.indexOf('.checked(') != -1;
        hasjQuerySelect = viewHtml.indexOf('.selectmenu(') != -1;
    }

    return {
        elem: elem,
        hasScript: hasScript,
        hasjQuerySelect: hasjQuerySelect,
        hasjQueryChecked: hasjQueryChecked,
        hasjQuery: hasjQuery
    };
}

/**
 * 在视图切换前对页面集合进行预处理，隐藏不相关页
 *
 * @param {HTMLElement[]} allPages - 所有缓存的页面容器数组
 * @param {number} newPageIndex - 即将显示的页面索引
 * @param {number} oldPageIndex - 当前选中页面的索引（可能为 -1）
 * @returns {void}
 */
function beforeAnimate(allPages, newPageIndex, oldPageIndex) {
    for (let index = 0, length = allPages.length; index < length; index++) {
        if (newPageIndex !== index && oldPageIndex !== index) {
            allPages[index].classList.add('hide');
        }
    }
}

/**
 * 在视图切换后对页面集合进行处理，确保仅保留新页面显示
 *
 * @param {HTMLElement[]} allPages - 所有缓存的页面容器数组
 * @param {number} newPageIndex - 当前已显示的页面索引
 * @returns {void}
 */
function afterAnimate(allPages, newPageIndex) {
    for (let index = 0, length = allPages.length; index < length; index++) {
        if (newPageIndex !== index) {
            allPages[index].classList.add('hide');
        }
    }
}

/**
 * 设置视图切换前的钩子函数
 *
 * @param {(view: HTMLElement, isRestore: boolean, options: Object) => void} fn - 切换前调用的回调，
 *        参数为当前视图元素、是否为恢复操作和原始选项对象。
 * @returns {void}
 */
export function setOnBeforeChange(fn) {
    onBeforeChange = fn;
}

/**
 * 尝试从缓存中恢复某个已存在的视图
 *
 * @param {Object} options - 恢复选项，需包含 `url` 字段用于匹配缓存
 * @param {boolean} [options.cancel] - 若为 true 则中止恢复流程
 * @returns {Promise<HTMLElement>|undefined|Promise<never>} - 如果找到并成功恢复，返回一个在恢复完成后 resolve 为视图元素的 Promise；
 *          若未找到则返回一个 rejected Promise；若 `options.cancel` 为 true 则直接返回 `undefined`。
 */
export function tryRestoreView(options) {
    console.debug('[viewContainer] tryRestoreView', options);
    const url = options.url;
    const index = currentUrls.indexOf(url);

    if (index !== -1) {
        const animatable = allPages[index];
        const view = animatable;

        if (view) {
            if (options.cancel) {
                return;
            }

            const selected = selectedPageIndex;
            const previousAnimatable = selected === -1 ? null : allPages[selected];
            return setControllerClass(view, options).then(() => {
                if (onBeforeChange) {
                    onBeforeChange(view, true, options);
                }

                beforeAnimate(allPages, index, selected);
                animatable.classList.remove('hide');
                selectedPageIndex = index;

                if (!options.cancel && previousAnimatable) {
                    afterAnimate(allPages, index);
                }

                if (window.$) {
                    $.mobile = $.mobile || {};
                    $.mobile.activePage = view;
                }

                return view;
            });
        }
    }

    return Promise.reject();
}

/**
 * 触发视图销毁事件
 *
 * @param {HTMLElement} view - 要触发销毁事件的视图元素
 * @returns {void}
 */
function triggerDestroy(view) {
    view.dispatchEvent(new CustomEvent('viewdestroy', {}));
}
/**
 * 重置视图缓存与内部状态
 *
 * 清空页面容器缓存、当前 URL 列表，并清空主容器 DOM 内容，重置选中索引。
 *
 * @returns {void}
 */
export function reset() {
    console.debug('[viewContainer] resetting view cache');
    allPages = [];
    currentUrls = [];
    const mainAnimatedPages = getMainAnimatedPages();
    if (mainAnimatedPages) mainAnimatedPages.innerHTML = '';
    selectedPageIndex = -1;
}

let onBeforeChange;
let allPages = [];
let currentUrls = [];
const pageContainerCount = 3;
let selectedPageIndex = -1;
reset();
getMainAnimatedPages()?.classList.remove('hide');

export default {
    loadView,
    tryRestoreView,
    reset,
    setOnBeforeChange
};
