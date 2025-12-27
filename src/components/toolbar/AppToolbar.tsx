// 导入 Material-UI 图标
import ArrowBack from '@mui/icons-material/ArrowBack';
import MenuIcon from '@mui/icons-material/Menu';
// 导入 Material-UI 组件
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
// 导入 React 相关类型
import React, { type FC, type PropsWithChildren, ReactNode } from 'react';

// 导入应用路由器
import { appRouter } from 'components/router/appRouter';
// 导入 API 钩子
import { useApi } from 'hooks/useApi';
// 导入国际化工具
import globalize from 'lib/globalize';

// 导入用户菜单按钮组件
import UserMenuButton from './UserMenuButton';

/**
 * AppToolbar 组件的属性接口
 */
interface AppToolbarProps {
    /** 工具栏右侧的自定义按钮 */
    buttons?: ReactNode
    /** 侧边抽屉是否可用 */
    isDrawerAvailable: boolean
    /** 侧边抽屉是否打开 */
    isDrawerOpen: boolean
    /** 抽屉按钮点击事件处理器 */
    onDrawerButtonClick?: (event: React.MouseEvent<HTMLElement>) => void
    /** 返回按钮是否可用 */
    isBackButtonAvailable?: boolean
    /** 用户菜单是否可用 */
    isUserMenuAvailable?: boolean
}

/**
 * 返回按钮点击事件处理器
 * 调用应用路由器的返回方法，返回上一页
 */
const onBackButtonClick = () => {
    appRouter.back()
        .catch(err => {
            console.error('[AppToolbar] error calling appRouter.back', err);
        });
};

/**
 * 应用工具栏组件
 * 提供菜单切换、返回导航、自定义按钮和用户菜单等功能
 */
const AppToolbar: FC<PropsWithChildren<AppToolbarProps>> = ({
    buttons,
    children,
    isDrawerAvailable,
    isDrawerOpen,
    onDrawerButtonClick = () => { /* no-op */ },
    isBackButtonAvailable = false,
    isUserMenuAvailable = true
}) => {
    // 获取当前登录用户信息
    const { user } = useApi();
    // 判断用户是否已登录
    const isUserLoggedIn = Boolean(user);

    return (
        <Toolbar
            variant='dense'
            sx={{
                flexWrap: 'wrap',
                // 左侧内边距，兼容移动设备的安全区域
                pl: {
                    xs: 'max(16px, env(safe-area-inset-left))',
                    sm: 'max(24px, env(safe-area-inset-left))'
                },
                // 右侧内边距，兼容移动设备的安全区域
                pr: {
                    xs: 'max(16px, env(safe-area-inset-left))',
                    sm: 'max(24px, env(safe-area-inset-left))'
                }
            }}
        >
            {/* 菜单按钮：仅在用户已登录且抽屉可用时显示 */}
            {isUserLoggedIn && isDrawerAvailable && (
                <Tooltip title={globalize.translate(isDrawerOpen ? 'MenuClose' : 'MenuOpen')}>
                    <IconButton
                        size='large'
                        edge='start'
                        color='inherit'
                        aria-label={globalize.translate(isDrawerOpen ? 'MenuClose' : 'MenuOpen')}
                        onClick={onDrawerButtonClick}
                    >
                        <MenuIcon />
                    </IconButton>
                </Tooltip>
            )}

            {/* 返回按钮：仅在需要时显示 */}
            {isBackButtonAvailable && (
                <Tooltip title={globalize.translate('ButtonBack')}>
                    <IconButton
                        size='large'
                        // 如果抽屉按钮未显示，则将返回按钮设置为起始边缘
                        edge={!(isUserLoggedIn && isDrawerAvailable) ? 'start' : undefined}
                        color='inherit'
                        aria-label={globalize.translate('ButtonBack')}
                        onClick={onBackButtonClick}
                    >
                        <ArrowBack />
                    </IconButton>
                </Tooltip>
            )}

            {/* 子组件内容区域 */}
            {children}

            {/* 自定义按钮区域，使用弹性布局靠右对齐 */}
            <Box sx={{ display: 'flex', flexGrow: 1, justifyContent: 'flex-end' }}>
                {buttons}
            </Box>

            {/* 用户菜单按钮：仅在用户已登录且菜单可用时显示 */}
            {isUserLoggedIn && isUserMenuAvailable && (
                <Box sx={{ flexGrow: 0 }}>
                    <UserMenuButton />
                </Box>
            )}
        </Toolbar>
    );
};

export default AppToolbar;
