// React Router 相关导入
import { Navigate, RouteObject } from 'react-router-dom';
import React from 'react';

// 组件导入
import ConnectionRequired from 'components/ConnectionRequired'; // 连接权限验证组件
import { toAsyncPageRoute } from 'components/router/AsyncRoute'; // 异步路由转换工具
import { toViewManagerPageRoute } from 'components/router/LegacyRoute'; // 旧版视图管理器路由转换工具
import ErrorBoundary from 'components/router/ErrorBoundary'; // 错误边界组件
import FallbackRoute from 'components/router/FallbackRoute'; // 后备路由组件（404页面）

// 应用布局
import AppLayout from '../AppLayout';

// 路由配置导入
import { ASYNC_PUBLIC_ROUTES, ASYNC_USER_ROUTES } from './asyncRoutes'; // 异步公共和用户路由
import { LEGACY_PUBLIC_ROUTES, LEGACY_USER_ROUTES } from './legacyRoutes'; // 旧版公共和用户路由

/**
 * 稳定版应用路由配置
 * 定义了稳定版应用的完整路由结构，包括用户路由、公共路由和后备路由
 */
export const STABLE_APP_ROUTES: RouteObject[] = [
    {
        // 根路径，匹配所有路由
        path: '/*',
        Component: AppLayout, // 使用应用布局组件
        children: [
            // 默认重定向：将根路径重定向到主页
            { index: true, element: <Navigate replace to='/home' /> },

            {
                /* 用户路由：需要用户登录才能访问 */
                Component: ConnectionRequired, // 默认级别为'user'，要求用户登录
                children: [
                    // 将异步用户路由转换为路由对象
                    ...ASYNC_USER_ROUTES.map(toAsyncPageRoute),
                    // 将旧版用户路由转换为视图管理器路由对象
                    ...LEGACY_USER_ROUTES.map(toViewManagerPageRoute)
                ],
                ErrorBoundary // 错误边界，捕获并处理子路由中的错误
            },

            {
                /* 公共路由：无需登录即可访问（如登录页、选择服务器页等） */
                element: <ConnectionRequired level='public' />,
                children: [
                    // 将异步公共路由转换为路由对象
                    ...ASYNC_PUBLIC_ROUTES.map(toAsyncPageRoute),
                    // 将旧版公共路由转换为视图管理器路由对象
                    ...LEGACY_PUBLIC_ROUTES.map(toViewManagerPageRoute),
                    /* 后备路由：处理无效路径，显示404页面 */
                    {
                        path: '*',
                        Component: FallbackRoute
                    }
                ]
            }

        ]
    }
];
