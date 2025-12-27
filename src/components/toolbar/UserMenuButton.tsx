// 导入Material-UI组件
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
// 导入React核心功能
import React, { useCallback, useState } from 'react';

// 导入自定义组件和hooks
import UserAvatar from 'components/UserAvatar';
import { useApi } from 'hooks/useApi';
import globalize from 'lib/globalize';

// 导入用户菜单组件
import AppUserMenu, { ID } from './AppUserMenu';

/**
 * 用户菜单按钮组件
 * 显示用户头像，点击后弹出用户菜单
 */
const UserMenuButton = () => {
    // 获取当前登录的用户信息
    const { user } = useApi();

    // 用户菜单锚点元素状态，用于定位菜单弹出位置
    const [ userMenuAnchorEl, setUserMenuAnchorEl ] = useState<null | HTMLElement>(null);
    // 判断用户菜单是否打开
    const isUserMenuOpen = Boolean(userMenuAnchorEl);

    // 处理用户按钮点击事件
    const onUserButtonClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
        // 设置菜单锚点为当前点击的元素
        setUserMenuAnchorEl(event.currentTarget);
    }, [ setUserMenuAnchorEl ]);

    // 处理用户菜单关闭事件
    const onUserMenuClose = useCallback(() => {
        // 清除菜单锚点，关闭菜单
        setUserMenuAnchorEl(null);
    }, [ setUserMenuAnchorEl ]);

    return (
        <>
            {/* 带提示文字的工具提示包裹器 */}
            <Tooltip title={globalize.translate('UserMenu')}>
                <IconButton
                    size='large'
                    aria-label={globalize.translate('UserMenu')}
                    aria-controls={ID}
                    aria-haspopup='true'
                    onClick={onUserButtonClick}
                    color='inherit'
                    sx={{ padding: 0 }}
                >
                    {/* 显示用户头像 */}
                    <UserAvatar user={user} />
                </IconButton>
            </Tooltip>

            {/* 用户菜单弹出层 */}
            <AppUserMenu
                open={isUserMenuOpen}
                anchorEl={userMenuAnchorEl}
                onMenuClose={onUserMenuClose}
            />
        </>
    );
};

export default UserMenuButton;
