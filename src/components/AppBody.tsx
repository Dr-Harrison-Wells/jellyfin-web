// 导入 React 核心库和相关类型
import React, { type FC, type PropsWithChildren, useEffect } from 'react';
// 导入视图容器管理器
import viewContainer from './viewContainer';

/**
 * 应用主体组件
 *
 * 一个简单的组件，包含了正确的结构，使得 ViewManager 页面能够与标准 React 页面共存。
 * 该组件提供了必要的容器结构，用于容纳不同类型的页面内容。
 *
 * A simple component that includes the correct structure for ViewManager pages
 * to exist alongside standard React pages.
 */
const AppBody: FC<PropsWithChildren<unknown>> = ({ children }) => {
    // 使用 useEffect 钩子在组件卸载时执行清理操作
    useEffect(() => () => {
        // 在组件卸载时重置视图容器状态，防止状态泄漏
        // Reset view container state on unload
        viewContainer.reset();
    }, []); // 空依赖数组确保只在组件卸载时执行

    return (
        <>
            {/* 主要动画页面容器，用于 ViewManager 管理的页面 */}
            <div className='mainAnimatedPages skinBody' />
            {/* 皮肤主体容器，用于渲染子组件（React 页面） */}
            <div className='skinBody'>
                {children}
            </div>
        </>
    );
};

export default AppBody;
