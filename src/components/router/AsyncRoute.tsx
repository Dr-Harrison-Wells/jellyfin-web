import type { RouteObject } from 'react-router-dom';

import { AppType } from 'constants/appType';

/**
 * 异步路由配置接口
 * 定义了应用中异步加载路由的配置结构
 */
export interface AsyncRoute {
    /**
     * 路由的 URL 路径
     * The URL path for this route.
     */
    path: string
    /**
     * 相对于 routes 目录的页面组件路径
     * 如果未指定，将回退使用 `path` 值
     * The relative path to the page component in the routes directory.
     * Will fallback to using the `path` value if not specified.
     */
    page?: string
    /**
     * 该页面所属的应用类型
     * The app that this page is part of.
     */
    type?: AppType
}

/**
 * 根据应用类型动态导入路由组件
 * @param page - 页面组件的路径
 * @param type - 应用类型 (Dashboard/Experimental/Stable)
 * @returns 动态导入的 Promise
 */
const importRoute = (page: string, type: AppType) => {
    switch (type) {
        case AppType.Dashboard:
            // 导入仪表板应用的路由
            return import(/* webpackChunkName: "[request]" */ `../../apps/dashboard/routes/${page}`);
        case AppType.Experimental:
            // 导入实验性应用的路由
            return import(/* webpackChunkName: "[request]" */ `../../apps/experimental/routes/${page}`);
        case AppType.Stable:
            // 导入稳定版应用的路由
            return import(/* webpackChunkName: "[request]" */ `../../apps/stable/routes/${page}`);
    }
};

/**
 * 将异步路由配置转换为 React Router 的路由对象
 * 使用懒加载方式按需加载页面组件，提升应用性能
 *
 * @param route - 异步路由配置对象
 * @returns React Router 的路由对象，包含懒加载配置
 */
export const toAsyncPageRoute = ({
    path,
    page,
    type = AppType.Stable
}: AsyncRoute): RouteObject => {
    return {
        path,
        // 懒加载函数，在路由匹配时才加载对应组件
        lazy: async () => {
            const {
                // 如果存在默认导出，为了兼容性将其作为组件使用
                // If there is a default export, use it as the Component for compatibility
                default: Component,
                ...route
            } = await importRoute(page ?? path, type);

            return {
                Component,
                ...route
            };
        }
    };
};
