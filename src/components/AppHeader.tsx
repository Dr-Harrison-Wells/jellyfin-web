import React, { FC, useEffect } from 'react';

/**
 * AppHeader 组件的参数接口
 */
interface AppHeaderParams {
    /** 是否隐藏头部组件 */
    isHidden?: boolean
}

/**
 * 应用头部组件
 * 用于渲染应用的主要导航和抽屉菜单元素
 *
 * @param isHidden - 控制组件是否隐藏，默认为 false
 */
const AppHeader: FC<AppHeaderParams> = ({
    isHidden = false
}) => {
    useEffect(() => {
        // 在首次渲染后初始化 UI 组件，动态导入库菜单脚本
        void import('../scripts/libraryMenu');
    }, []);

    return (
        /**
         * 注意：这些组件在新布局中不使用，但旧版视图会直接与这些元素交互，
         * 因此它们需要存在于 DOM 中。我们使用 display: none 来隐藏它们以防止错误。
         */
        <div style={isHidden ? { display: 'none' } : undefined}>
            {/* 主抽屉容器，默认隐藏 */}
            <div className='mainDrawer hide'>
                {/* 主抽屉滚动容器，支持垂直焦点导航 */}
                <div className='mainDrawer-scrollContainer scrollContainer focuscontainer-y' />
            </div>
            {/* 皮肤头部容器，支持水平焦点导航 */}
            <div className='skinHeader focuscontainer-x' />
            {/* 主抽屉拖动手柄 */}
            <div className='mainDrawerHandle' />
        </div>
    );
};

export default AppHeader;
