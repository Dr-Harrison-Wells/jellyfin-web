// React 和路由相关导入
import React from 'react';
import { Navigate, RouteObject } from 'react-router-dom';

// 组件和常量导入
import AppLayout from 'apps/stable/AppLayout'; // 复用稳定版的应用布局
import { AppType } from 'constants/appType'; // 应用类型常量
import ConnectionRequired from 'components/ConnectionRequired'; // 连接权限验证组件
import ErrorBoundary from 'components/router/ErrorBoundary'; // 错误边界组件
import { type LegacyRoute, toViewManagerPageRoute } from 'components/router/LegacyRoute'; // 旧版路由类型和转换工具

/**
 * 向导步骤路由配置
 * 定义了服务器初始设置向导的所有步骤页面
 * 每个步骤都使用旧版视图管理器加载对应的 HTML 视图
 */
const ROUTES: LegacyRoute[] = [
    {
        // 远程访问配置
        path: 'remoteaccess',
        pageProps: {
            appType: AppType.Wizard,
            controller: 'remote/index',
            view: 'remote/index.html'
        }
    },
    {
        // 完成向导
        path: 'finish',
        pageProps: {
            appType: AppType.Wizard,
            controller: 'finish/index',
            view: 'finish/index.html'
        }
    },
    {
        // 媒体库设置
        path: 'library',
        pageProps: {
            appType: AppType.Wizard,
            controller: 'library',
            view: 'library.html'
        }
    },
    {
        // 服务器设置
        path: 'settings',
        pageProps: {
            appType: AppType.Wizard,
            controller: 'settings/index',
            view: 'settings/index.html'
        }
    },
    {
        // 开始向导
        path: 'start',
        pageProps: {
            appType: AppType.Wizard,
            controller: 'start/index',
            view: 'start/index.html'
        }
    },
    {
        // 用户账户创建
        path: 'user',
        pageProps: {
            appType: AppType.Wizard,
            controller: 'user/index',
            view: 'user/index.html'
        }
    }
];

/**
 * 向导应用路由配置
 * 用于首次安装 Jellyfin 服务器时的初始设置向导
 * 只有在向导模式下才能访问这些路由
 */
export const WIZARD_APP_ROUTES: RouteObject[] = [
    {
        // 最外层：要求向导级别的连接权限
        element: <ConnectionRequired level='wizard' />,
        children: [
            {
                Component: AppLayout, // 使用应用布局组件
                path: 'wizard', // 向导基础路径
                children: [
                    // 默认重定向到开始页面
                    { index: true, element: <Navigate replace to='start' /> },
                    // 将所有向导步骤路由转换为视图管理器路由对象
                    ...ROUTES.map(toViewManagerPageRoute)
                ],
                ErrorBoundary // 错误边界，捕获并处理子路由中的错误
            }
        ]
    }
];
