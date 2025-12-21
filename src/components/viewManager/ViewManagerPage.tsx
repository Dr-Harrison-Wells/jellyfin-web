import { Action } from 'history';
import { FunctionComponent, useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

import globalize from 'lib/globalize';
import type { RestoreViewFailResponse } from 'types/viewManager';

import viewManager from './viewManager';
import { AppType } from 'constants/appType';

/*
 * ViewManagerPage
 * 说明：
 * 这是一个桥接组件，用于在 React 路由中加载传统的（legacy）HTML 视图和对应的控制器模块。
 * 关键点：
 * - 动态 `import` 控制器 JS 模块与视图 HTML（作为字符串）
 * - 在加载后将两者传递给 `viewManager`，由 `viewContainer` 将 HTML 转为 DOM 并插入页面
 * - `viewManager` 会在视图初始化时调用控制器的导出（函数或构造器），并把插入后的 `view` DOM 传入
 *
 * 目录关系：
 * - 控制器路径示例：`apps/wizard/controllers/start/index.js`（导出默认函数）
 * - 视图路径示例：`apps/wizard/controllers/start/index.html`（导入后为字符串）
 */

export interface ViewManagerPageProps {
    appType?: AppType
    controller: string
    view: string
    type?: string
    isFullscreen?: boolean
    isNowPlayingBarEnabled?: boolean
    isThemeMediaSupported?: boolean
    transition?: string
}

interface ViewOptions {
    url: string
    type?: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    state: any
    autoFocus: boolean
    fullscreen?: boolean
    transition?: string
    options: {
        supportsThemeMedia?: boolean
        enableMediaControl?: boolean
    }
}

const importController = (
    appType: AppType,
    controller: string,
    view: string
) => {
    // 根据不同的 appType 去不同目录下查找控制器与视图
    // 返回一个 Promise，resolved 值为 [ControllerFactory, viewHtmlString]
    switch (appType) {
        case AppType.Dashboard:
            return Promise.all([
                import(/* webpackChunkName: "[request]" */ `../../apps/dashboard/controllers/${controller}`),
                import(/* webpackChunkName: "[request]" */ `../../apps/dashboard/controllers/${view}`)
                    // 导入 HTML 模块后先做本地化替换再返回
                    .then(html => globalize.translateHtml(html))
            ]);
        case AppType.Wizard:
            return Promise.all([
                import(/* webpackChunkName: "[request]" */ `../../apps/wizard/controllers/${controller}`),
                import(/* webpackChunkName: "[request]" */ `../../apps/wizard/controllers/${view}`)
                    .then(html => globalize.translateHtml(html))
            ]);
        default:
            return Promise.all([
                import(/* webpackChunkName: "[request]" */ `../../controllers/${controller}`),
                import(/* webpackChunkName: "[request]" */ `../../controllers/${view}`)
                    .then(html => globalize.translateHtml(html))
            ]);
    }
};

const loadView = async (
    appType: AppType,
    controller: string,
    view: string,
    viewOptions: ViewOptions
) => {
    // 从磁盘/包中动态加载控制器模块和视图 HTML（已本地化）
    const [ controllerFactory, viewHtml ] = await importController(appType, controller, view);

    // 将 controllerFactory 与 HTML 字符串传给 viewManager。后续由 viewContainer 负责将 HTML 转为 DOM 并插入，
    // 再由 viewManager 在视图生命周期内调用 controllerFactory（例如导出默认函数）以完成绑定。
    viewManager.loadView({
        ...viewOptions,
        controllerFactory,
        view: viewHtml
    });
};

/**
 * Page component that renders legacy views via the ViewManager.
 *
 * 作用：在 React 路由中充当桥接层，根据参数动态加载旧版视图（HTML）和对应的控制器（JS），
 * 并把它们交给 `viewManager` 来进行实际的 DOM 插入与控制器挂载。
 *
 * 注意：新页面建议使用通用的 Page 组件；本组件仅用于兼容/加载 legacy 视图。
 */
const ViewManagerPage: FunctionComponent<ViewManagerPageProps> = ({
    appType = AppType.Stable,
    controller,
    view,
    type,
    isFullscreen = false,
    isNowPlayingBarEnabled = true,
    isThemeMediaSupported = false,
    transition
}) => {
    const location = useLocation();
    const navigationType = useNavigationType();

    useEffect(() => {
        const loadPage = () => {
            const viewOptions = {
                url: location.pathname + location.search,
                type,
                state: location.state,
                autoFocus: false,
                fullscreen: isFullscreen,
                transition,
                options: {
                    supportsThemeMedia: isThemeMediaSupported,
                    enableMediaControl: isNowPlayingBarEnabled
                }
            };

            // 如果 navigationType 不是浏览器后退（Action.Pop），则按正常流程加载视图
            if (navigationType !== Action.Pop) {
                console.debug('[ViewManagerPage] loading view [%s]', view);
                return loadView(appType, controller, view, viewOptions);
            }

            // 否则尝试恢复已缓存的视图（如果存在），恢复失败则退回到正常加载流程
            console.debug('[ViewManagerPage] restoring view [%s]', view);
            return viewManager.tryRestoreView(viewOptions)
                .catch(async (result?: RestoreViewFailResponse) => {
                    if (!result?.cancelled) {
                        console.debug('[ViewManagerPage] restore failed; loading view [%s]', view);
                        return loadView(appType, controller, view, viewOptions);
                    }
                });
        };

        loadPage();
    },
    // location.state and navigationType are NOT included as dependencies here since dialogs will update state while the current view stays the same
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
        controller,
        view,
        type,
        isFullscreen,
        isNowPlayingBarEnabled,
        isThemeMediaSupported,
        transition,
        location.pathname,
        location.search
    ]);

    return null;
};

export default ViewManagerPage;
