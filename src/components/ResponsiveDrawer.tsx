// 导入 Material-UI 相关组件和类型
import type { Theme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import SwipeableDrawer from '@mui/material/SwipeableDrawer';
import useMediaQuery from '@mui/material/useMediaQuery';
import React, { type FC, type PropsWithChildren } from 'react';

// 导入浏览器工具模块
import browser from 'scripts/browser';

// 抽屉菜单的宽度常量（单位：像素）
export const DRAWER_WIDTH = 240;

/**
 * 响应式抽屉组件的属性接口
 */
export interface ResponsiveDrawerProps {
    open: boolean // 抽屉是否打开（仅在移动端使用）
    onClose: () => void // 关闭抽屉的回调函数
    onOpen: () => void // 打开抽屉的回调函数
}

/**
 * 响应式抽屉组件
 *
 * 根据屏幕尺寸自动切换显示方式：
 * - 桌面端（中等及以上屏幕）：显示为永久固定的侧边栏
 * - 移动端（小屏幕）：显示为可滑动的临时抽屉
 */
const ResponsiveDrawer: FC<PropsWithChildren<ResponsiveDrawerProps>> = ({
    children,
    open = false,
    onClose,
    onOpen
}) => {
    // 检测是否为中等或更大的屏幕尺寸（桌面端）
    const isMediumScreen = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'));

    return ( isMediumScreen ? (
        /* 桌面端抽屉 - 永久固定显示 */
        <Drawer
            sx={{
                width: DRAWER_WIDTH,
                flexShrink: 0,
                '& .MuiDrawer-paper': {
                    width: DRAWER_WIDTH,
                    paddingBottom: '4.2rem', // 为正在播放栏预留底部间距
                    boxSizing: 'border-box'
                }
            }}
            variant='permanent' // 永久显示模式
            anchor='left' // 从左侧滑出
        >
            {children}
        </Drawer>
    ) : (
        /* 移动端抽屉 - 可滑动的临时抽屉 */
        <SwipeableDrawer
            anchor='left' // 从左侧滑出
            open={open} // 控制打开状态
            onClose={onClose} // 关闭时的回调
            onOpen={onOpen} // 打开时的回调
            // 在 iOS 上禁用滑动打开功能，因为它会干扰返回导航手势
            disableDiscovery={browser.iOS}
            ModalProps={{
                keepMounted: true // 保持挂载以提升移动端打开性能
            }}
        >
            <Box
                role='presentation'
                // 点击内容时关闭抽屉
                onClick={onClose}
                onKeyDown={onClose} // 按键时也关闭抽屉
            >
                {children}
            </Box>
        </SwipeableDrawer>
    ));
};

export default ResponsiveDrawer;
