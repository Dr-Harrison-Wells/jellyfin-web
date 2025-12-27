import useScrollTrigger from '@mui/material/useScrollTrigger';
import React, { ReactElement } from 'react';

/**
 * Component that changes the elevation of a child component when scrolled.
 * 滚动时更改子组件海拔高度（阴影）的组件。
 */
const ElevationScroll = ({ children, elevate = false }: { children: ReactElement, elevate?: boolean }) => {
    // 使用 useScrollTrigger 钩子来检测滚动事件
    const trigger = useScrollTrigger({
        disableHysteresis: true, // 禁用迟滞，使触发更灵敏
        threshold: 0 // 滚动阈值为 0，即一开始滚动就触发
    });

    // 如果 elevate 属性为 true 或者触发了滚动，则认为需要提升高度
    const isElevated = elevate || trigger;

    // 克隆子元素并根据是否提升高度来设置颜色和阴影
    return React.cloneElement(children, {
        color: isElevated ? 'default' : 'transparent',
        elevation: isElevated ? 4 : 0
    });
};

export default ElevationScroll;
