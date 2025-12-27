import React from 'react';

import ViewManagerPage, { ViewManagerPageProps } from '../viewManager/ViewManagerPage';

/**
 * 遗留路由接口
 * 用于定义旧版路由的结构
 */
export interface LegacyRoute {
    /** 路由路径 */
    path: string,
    /** 视图管理器页面的属性配置 */
    pageProps: ViewManagerPageProps
}

/**
 * 将遗留路由转换为视图管理器页面路由
 * @param route - 遗留路由对象
 * @returns 包含路径和元素的路由对象
 */
export function toViewManagerPageRoute(route: LegacyRoute) {
    return {
        path: route.path,
        element: <ViewManagerPage {...route.pageProps} />
    };
}
