// 导入 Jellyfin 透明图标
import icon from '@jellyfin/ux-web/icon-transparent.png';
// 导入 Material-UI 按钮组件
import Button from '@mui/material/Button/Button';
import React, { FC } from 'react';
// 导入 React Router 的 Link 组件用于路由跳转
import { Link } from 'react-router-dom';

// 导入获取系统信息的自定义 Hook
import { useSystemInfo } from 'hooks/useSystemInfo';

/**
 * 服务器按钮组件
 * 显示服务器名称和图标，点击后导航到首页
 */
const ServerButton: FC = () => {
    // 获取系统信息和加载状态
    const {
        data: systemInfo, // 系统信息数据
        isPending // 数据加载中状态
    } = useSystemInfo();

    return (
        <Button
            variant='text' // 文本样式的按钮
            size='large' // 大尺寸按钮
            color='inherit' // 继承父组件的颜色
            startIcon={
                // 按钮左侧的图标
                <img
                    src={icon}
                    alt=''
                    aria-hidden // 对屏幕阅读器隐藏（仅装饰性图标）
                    style={{
                        maxHeight: '1.25em',
                        maxWidth: '1.25em'
                    }}
                />
            }
            component={Link} // 使用 Link 组件作为按钮的底层组件
            to='/' // 点击后跳转到首页
        >
            {/* 显示服务器名称，加载中时显示空字符串，否则显示服务器名称或默认 'Jellyfin' */}
            {isPending ? '' : (systemInfo?.ServerName || 'Jellyfin')}
        </Button>
    );
};

export default ServerButton;
