// React 核心库和路由相关导入
import React from 'react';
import { RouteObject } from 'react-router-dom';

// 组件导入
import ConnectionRequired from 'components/ConnectionRequired'; // 连接权限验证组件
import { ASYNC_ADMIN_ROUTES } from './_asyncRoutes'; // 异步管理员路由配置
import { toAsyncPageRoute } from 'components/router/AsyncRoute'; // 异步路由转换工具
import { toViewManagerPageRoute } from 'components/router/LegacyRoute'; // 旧版视图管理器路由转换工具
import { LEGACY_ADMIN_ROUTES } from './_legacyRoutes'; // 旧版管理员路由配置
import ServerContentPage from 'components/ServerContentPage'; // 服务器内容页面组件
import ErrorBoundary from 'components/router/ErrorBoundary'; // 错误边界组件

/**
 * 仪表板应用路径常量
 * 定义了仪表板应用中各个功能模块的路径
 */
export const DASHBOARD_APP_PATHS = {
    Dashboard: 'dashboard', // 主仪表板路径
    MetadataManager: 'metadata', // 元数据管理器路径
    PluginConfig: 'configurationpage' // 插件配置页面路径
};

/**
 * 仪表板应用路由配置
 * 定义了仪表板应用的完整路由结构，包括权限验证、布局和各个子路由
 */
export const DASHBOARD_APP_ROUTES: RouteObject[] = [
    {
        // 最外层：要求管理员级别的连接权限
        element: <ConnectionRequired level='admin' />,
        children: [
            {
                // 懒加载应用布局组件，提升性能
                lazy: () => import('../AppLayout'),
                children: [
                    {
                        // 主仪表板路由
                        path: DASHBOARD_APP_PATHS.Dashboard,
                        children: [
                            // 将异步管理员路由转换为路由对象
                            ...ASYNC_ADMIN_ROUTES.map(toAsyncPageRoute),
                            // 将旧版管理员路由转换为视图管理器路由对象
                            ...LEGACY_ADMIN_ROUTES.map(toViewManagerPageRoute)
                        ],
                        // 错误边界：捕获并处理子路由中的错误
                        errorElement: <ErrorBoundary pageClasses={[ 'type-interior' ]} />
                    },

                    /* 注意: 元数据编辑器将来可能需要一个专用的应用 */
                    // 元数据管理器路由：用于编辑项目元数据
                    toViewManagerPageRoute({
                        path: DASHBOARD_APP_PATHS.MetadataManager,
                        pageProps: {
                            controller: 'edititemmetadata', // 使用旧版元数据编辑控制器
                            view: 'edititemmetadata.html' // 旧版 HTML 视图文件
                        }
                    }),

                    {
                        // 插件配置路由：显示插件配置页面
                        path: DASHBOARD_APP_PATHS.PluginConfig,
                        // 使用服务器内容页面组件加载配置页面
                        element: <ServerContentPage view='/web/configurationpage' />
                    }
                ]
            }
        ]
    }
];
