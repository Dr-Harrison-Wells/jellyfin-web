// 导入 Material-UI 图标组件
import AccountCircle from '@mui/icons-material/AccountCircle'; // 账户圆圈图标
import AppSettingsAlt from '@mui/icons-material/AppSettingsAlt'; // 应用设置图标
import Close from '@mui/icons-material/Close'; // 关闭图标
import DashboardIcon from '@mui/icons-material/Dashboard'; // 仪表板图标
import Download from '@mui/icons-material/Download'; // 下载图标
import Edit from '@mui/icons-material/Edit'; // 编辑图标
import Logout from '@mui/icons-material/Logout'; // 登出图标
import PhonelinkLock from '@mui/icons-material/PhonelinkLock'; // 手机锁定图标
import Settings from '@mui/icons-material/Settings'; // 设置图标
import Storage from '@mui/icons-material/Storage'; // 存储图标
// 导入 Material-UI 组件
import Divider from '@mui/material/Divider'; // 分隔线组件
import ListItemIcon from '@mui/material/ListItemIcon'; // 列表项图标组件
import ListItemText from '@mui/material/ListItemText'; // 列表项文本组件
import Menu, { MenuProps } from '@mui/material/Menu'; // 菜单组件及其属性类型
import MenuItem from '@mui/material/MenuItem'; // 菜单项组件
import React, { FC, useCallback } from 'react';
import { Link } from 'react-router-dom'; // React Router 链接组件

// 导入应用程序模块
import { appHost } from 'components/apphost'; // 应用宿主功能
import { AppFeature } from 'constants/appFeature'; // 应用功能常量
import { useApi } from 'hooks/useApi'; // API 钩子
import { useQuickConnectEnabled } from 'hooks/useQuickConnect'; // 快速连接钩子
import globalize from 'lib/globalize'; // 国际化工具
import shell from 'scripts/shell'; // Shell 脚本工具
import Dashboard from 'utils/dashboard'; // 仪表板工具

// 用户菜单的唯一标识符
export const ID = 'app-user-menu';

/**
 * 应用用户菜单组件的属性接口
 */
interface AppUserMenuProps extends MenuProps {
    /** 菜单关闭时的回调函数 */
    onMenuClose: () => void
}

/**
 * 应用用户菜单组件
 * 显示用户相关的操作菜单，包括个人资料、设置、管理功能、登出等
 */
const AppUserMenu: FC<AppUserMenuProps> = ({
    anchorEl, // 菜单锚点元素
    open, // 菜单是否打开
    onMenuClose // 关闭菜单的回调函数
}) => {
    // 获取当前用户信息
    const { user } = useApi();
    // 获取快速连接是否启用的状态
    const { data: isQuickConnectEnabled } = useQuickConnectEnabled();

    // 下载管理器点击处理函数
    const onDownloadManagerClick = useCallback(() => {
        shell.openDownloadManager();
        onMenuClose();
    }, [ onMenuClose ]);

    // 客户端设置点击处理函数
    const onClientSettingsClick = useCallback(() => {
        shell.openClientSettings();
        onMenuClose();
    }, [ onMenuClose ]);

    // 退出应用点击处理函数
    const onExitAppClick = useCallback(() => {
        appHost.exit();
        onMenuClose();
    }, [ onMenuClose ]);

    // 登出点击处理函数
    const onLogoutClick = useCallback(() => {
        Dashboard.logout();
        onMenuClose();
    }, [ onMenuClose ]);

    // 选择服务器点击处理函数
    const onSelectServerClick = useCallback(() => {
        Dashboard.selectServer();
        onMenuClose();
    }, [ onMenuClose ]);

    return (
        <Menu
            anchorEl={anchorEl}
            anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'right'
            }}
            transformOrigin={{
                vertical: 'top',
                horizontal: 'right'
            }}
            id={ID}
            keepMounted
            open={open}
            onClose={onMenuClose}
        >
            {/* 用户个人资料菜单项 */}
            <MenuItem
                component={Link}
                to={`/userprofile?userId=${user?.Id}`}
                onClick={onMenuClose}
            >
                <ListItemIcon>
                    <AccountCircle />
                </ListItemIcon>
                <ListItemText>
                    {globalize.translate('Profile')}
                </ListItemText>
            </MenuItem>
            {/* 用户设置菜单项 */}
            <MenuItem
                component={Link}
                to='/mypreferencesmenu'
                onClick={onMenuClose}
            >
                <ListItemIcon>
                    <Settings />
                </ListItemIcon>
                <ListItemText>
                    {globalize.translate('Settings')}
                </ListItemText>
            </MenuItem>

            {/* 如果支持下载管理或客户端设置，显示分隔线 */}
            {(appHost.supports(AppFeature.DownloadManagement) || appHost.supports(AppFeature.ClientSettings)) && (
                <Divider />
            )}

            {/* 下载管理器菜单项（仅在支持时显示） */}
            {appHost.supports(AppFeature.DownloadManagement) && (
                <MenuItem
                    onClick={onDownloadManagerClick}
                >
                    <ListItemIcon>
                        <Download />
                    </ListItemIcon>
                    <ListItemText>
                        {globalize.translate('DownloadManager')}
                    </ListItemText>
                </MenuItem>
            )}

            {/* 客户端设置菜单项（仅在支持时显示） */}
            {appHost.supports(AppFeature.ClientSettings) && (
                <MenuItem
                    onClick={onClientSettingsClick}
                >
                    <ListItemIcon>
                        <AppSettingsAlt />
                    </ListItemIcon>
                    <ListItemText>
                        {globalize.translate('ClientSettings')}
                    </ListItemText>
                </MenuItem>
            )}

            {/* 管理员链接 - 仅在用户是管理员时显示 */}
            {user?.Policy?.IsAdministrator && ([
                <Divider key='admin-links-divider' />,
                {/* 管理员仪表板菜单项 */}
                <MenuItem
                    key='admin-dashboard-link'
                    component={Link}
                    to='/dashboard'
                    onClick={onMenuClose}
                >

                    <ListItemIcon>
                        <DashboardIcon />
                    </ListItemIcon>
                    <ListItemText primary={globalize.translate('TabDashboard')} />
                </MenuItem>,
                {/* 元数据管理器菜单项 */}
                <MenuItem
                    key='admin-metadata-link'
                    component={Link}
                    to='/metadata'
                    onClick={onMenuClose}
                >
                    <ListItemIcon>
                        <Edit />
                    </ListItemIcon>
                    <ListItemText primary={globalize.translate('MetadataManager')} />
                </MenuItem>
            ])}

            <Divider />
            {/* 快速连接菜单项（仅在启用时显示） */}
            {isQuickConnectEnabled && (
                <MenuItem
                    component={Link}
                    to='/quickconnect'
                    onClick={onMenuClose}
                >
                    <ListItemIcon>
                        <PhonelinkLock />
                    </ListItemIcon>
                    <ListItemText>
                        {globalize.translate('QuickConnect')}
                    </ListItemText>
                </MenuItem>
            )}

            {/* 选择服务器菜单项（仅在支持多服务器时显示） */}
            {appHost.supports(AppFeature.MultiServer) && (
                <MenuItem
                    onClick={onSelectServerClick}
                >
                    <ListItemIcon>
                        <Storage />
                    </ListItemIcon>
                    <ListItemText>
                        {globalize.translate('SelectServer')}
                    </ListItemText>
                </MenuItem>
            )}

            {/* 登出菜单项 */}
            <MenuItem
                onClick={onLogoutClick}
            >
                <ListItemIcon>
                    <Logout />
                </ListItemIcon>
                <ListItemText>
                    {globalize.translate('ButtonSignOut')}
                </ListItemText>
            </MenuItem>

            {/* 退出应用菜单项（仅在支持退出菜单时显示） */}
            {appHost.supports(AppFeature.ExitMenu) && ([
                <Divider key='exit-menu-divider' />,
                <MenuItem
                    key='exit-menu-button'
                    onClick={onExitAppClick}
                >
                    <ListItemIcon>
                        <Close />
                    </ListItemIcon>
                    <ListItemText>
                        {globalize.translate('ButtonExitApp')}
                    </ListItemText>
                </MenuItem>
            ])}
        </Menu>
    );
};

export default AppUserMenu;
