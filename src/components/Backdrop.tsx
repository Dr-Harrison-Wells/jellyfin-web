import React, { useEffect } from 'react';

/**
 * 背景组件
 * 用于显示应用程序的背景图像和遮罩层
 */
const Backdrop = () => {
    useEffect(() => {
        // 首次渲染后初始化 UI 组件
        // Initialize the UI components after first render
        void import('../scripts/autoBackdrops');
    }, []);

    return (
        <>
            {/* 背景遮罩容器 */}
            <div className='backdropContainer' />
            {/* 背景图像容器 */}
            <div className='backgroundContainer' />
        </>
    );
};

export default Backdrop;
