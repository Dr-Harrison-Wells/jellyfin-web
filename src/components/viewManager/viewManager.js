// 视图容器与焦点/布局管理器的依赖
import viewContainer from '../viewContainer';
import focusManager from '../focusManager';
import layoutManager from '../layoutManager';

// 当前显示的视图元素（DOM 节点）
let currentView;

// 是否同时触发页面级别事件（例如 'pageshow'）
let dispatchPageEvents;

// 注册一个在视图切换之前调用的回调。
// 主要职责：在新视图被加载并准备显示之前，触发相关的 "before" 事件，
// 并初始化控制器（如果提供了 controllerFactory）。
viewContainer.setOnBeforeChange((newView, isRestored, options) => {
    const lastView = currentView;

    // 如果存在上一个视图，在切换前尝试触发它的 'viewbeforehide' 事件，
    // 允许监听者通过阻止该事件来取消切换（目前逻辑有个 todo: cancel 但未实现）。
    if (lastView) {
        const beforeHideResult = dispatchViewEvent(lastView, null, 'viewbeforehide', true);

        if (!beforeHideResult) {
            // todo: cancel - 如果事件被取消，这里应阻止视图切换（目前未实现）
        }
    }

    // 准备传递给事件的详细信息（包括路由参数、状态、是否恢复等）
    const eventDetail = getViewEventDetail(newView, options, isRestored);

    // 首次初始化视图时，创建控制器实例并触发 'viewinit' 事件。
    if (!newView.initComplete) {
        newView.initComplete = true;

        // 支持两种 controllerFactory 的写法：直接为函数或包含 default 导出的模块。
        if (typeof options.controllerFactory === 'function') {
            // eslint-disable-next-line new-cap
            new options.controllerFactory(newView, eventDetail.detail.params);
        } else if (options.controllerFactory && typeof options.controllerFactory.default === 'function') {
            new options.controllerFactory.default(newView, eventDetail.detail.params);
        }

        // 如果没有 controllerFactory 或者开启了页面事件分发，则触发 viewinit
        if (!options.controllerFactory || dispatchPageEvents) {
            dispatchViewEvent(newView, eventDetail, 'viewinit');
        }
    }

    // 在新视图真正显示前，派发 'viewbeforeshow' 事件，监听者可在此做准备工作
    dispatchViewEvent(newView, eventDetail, 'viewbeforeshow');
});

function onViewChange(view, options, isRestore) {
    const lastView = currentView;
    if (lastView) {
        dispatchViewEvent(lastView, null, 'viewhide');
    }
    // 更新全局当前视图引用
    currentView = view;

    // 构造事件详情对象（包括路由参数等）
    const eventDetail = getViewEventDetail(view, options, isRestore);

    // 焦点管理：如果不是恢复视图（restore），根据 options.autoFocus 自动设置焦点；
    // 如果是恢复且非移动设备（desktop），尝试恢复上次记录的 activeElement
    if (!isRestore) {
        if (options.autoFocus !== false) {
            focusManager.autoFocus(view);
        }
    } else if (!layoutManager.mobile) {
        if (view.activeElement && document.body.contains(view.activeElement) && focusManager.isCurrentlyFocusable(view.activeElement)) {
            // 恢复之前记录的焦点元素（若仍在文档中且可聚焦）
            focusManager.focus(view.activeElement);
        } else {
            focusManager.autoFocus(view);
        }
    }

    // 触发视图已显示事件；监听者可以在此处理视图相关的显示逻辑
    view.dispatchEvent(new CustomEvent('viewshow', eventDetail));

    // 如果开启页面级事件同步，也触发对应的 page 事件（例如 pageshow）
    if (dispatchPageEvents) {
        view.dispatchEvent(new CustomEvent('pageshow', eventDetail));
    }
}

function getProperties(view) {
    const props = view.getAttribute('data-properties');
    // 从 DOM 属性 data-properties 中解析逗号分隔的属性列表，若无则返回空数组
    if (props) {
        return props.split(',');
    }

    return [];
}

function dispatchViewEvent(view, eventInfo, eventName, isCancellable) {
    if (!eventInfo) {
        eventInfo = {
            detail: {
                type: view.getAttribute('data-type'),
                properties: getProperties(view)
            },
            bubbles: true,
            cancelable: isCancellable
        };
    }
    // 明确设置 cancelable 标志（默认 false）
    eventInfo.cancelable = isCancellable || false;

    // 派发视图级事件（例如 'viewshow'/'viewhide'）并记录返回值（是否被阻止）
    const eventResult = view.dispatchEvent(new CustomEvent(eventName, eventInfo));

    // 如需同步派发页面级事件，创建对应的 page 事件（非可取消）
    if (dispatchPageEvents) {
        eventInfo.cancelable = false;
        view.dispatchEvent(new CustomEvent(eventName.replace('view', 'page'), eventInfo));
    }

    return eventResult;
}

function getViewEventDetail(view, { state, url, options = {} }, isRestored) {
    const index = url.indexOf('?');
    // eslint-disable-next-line compat/compat
    const searchParams = new URLSearchParams(url.substring(index + 1));
    const params = {};
    // 将 URL 查询参数转换为对象，便于在事件中使用
    searchParams.forEach((value, key) => {
        params[key] = value;
    });

    return {
        detail: {
            // 视图类型（由 data-type 属性提供）
            type: view.getAttribute('data-type'),
            properties: getProperties(view),
            params,
            isRestored,
            state,
            // 路由选项（例如 controllerFactory、autoFocus 等）
            options
        },
        bubbles: true,
        cancelable: false
    };
}

function resetCachedViews() {
    // 皮肤（skin）改变时，重置所有缓存的视图以避免不一致
    viewContainer.reset();
}

document.addEventListener('skinunload', resetCachedViews);

class ViewManager {
    loadView(options) {
        const lastView = currentView;
        // 记录切换前哪个元素拥有焦点，以便在需要时恢复
        if (lastView) {
            lastView.activeElement = document.activeElement;
        }

        if (options.cancel) {
            return;
        }

        // 异步加载视图（由 viewContainer 管理），加载完成后调用 onViewChange
        viewContainer.loadView(options).then((view) => {
            onViewChange(view, options);
        });
    }

    hideView() {
        if (currentView) {
            // 主动隐藏当前视图：触发 beforehide/hide 事件并将元素添加 hide class
            dispatchViewEvent(currentView, null, 'viewbeforehide');
            dispatchViewEvent(currentView, null, 'viewhide');
            currentView.classList.add('hide');
            currentView = null;
        }
    }

    tryRestoreView(options, onViewChanging) {
        if (options.cancel) {
            const err = new Error('cancelled');
            err.cancelled = true;
            return Promise.reject(err);
        }
        // 记录当前聚焦元素，便于恢复
        if (currentView) {
            currentView.activeElement = document.activeElement;
        }

        // 尝试恢复已缓存的视图（如果有），恢复成功后调用 onViewChange 并传入 isRestore 标志
        return viewContainer.tryRestoreView(options).then((view) => {
            if (onViewChanging) onViewChanging();
            onViewChange(view, options, true);
        });
    }

    currentView() {
        return currentView;
    }

    dispatchPageEvents(value) {
        dispatchPageEvents = value;
    }
}

const viewManager = new ViewManager();
viewManager.dispatchPageEvents(true);

export default viewManager;
