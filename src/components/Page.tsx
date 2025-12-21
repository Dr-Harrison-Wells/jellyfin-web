// 导入 React 核心类型和 Hooks
import React, { type FC, type PropsWithChildren, type HTMLAttributes, useEffect, useRef, StrictMode } from 'react';

// 导入自动聚焦工具
import autoFocuser from 'components/autoFocuser';
// 导入视图管理器
import viewManager from 'components/viewManager/viewManager';

// 自定义页面属性类型定义
type CustomPageProps = {
    id: string, // 页面唯一标识符，libraryMenu 需要此属性
    title?: string, // 页面标题（可选）
    isBackButtonEnabled?: boolean, // 是否启用返回按钮（可选）
    isMenuButtonEnabled?: boolean, // 是否启用菜单按钮（可选）
    isNowPlayingBarEnabled?: boolean, // 是否启用正在播放栏（可选）
    isThemeMediaSupported?: boolean, // 是否支持主题媒体（可选）
    shouldAutoFocus?: boolean, // 是否应该自动聚焦（可选）
    backDropType?: string, // 背景类型（可选）
};

// 页面组件的完整属性类型，继承自定义属性和 HTML div 属性
export type PageProps = CustomPageProps & HTMLAttributes<HTMLDivElement>;

/**
 * Page 页面组件
 *
 * 功能说明：
 * - 隐藏活动的非 React 视图
 * - 触发导航所需的事件和 appRouter 状态更新
 * - 设置正确的 CSS 类和数据属性
 */
const Page: FC<PropsWithChildren<PageProps>> = ({
    children,
    id,
    className = '',
    title,
    isBackButtonEnabled = true, // 默认启用返回按钮
    isMenuButtonEnabled = false, // 默认禁用菜单按钮
    isNowPlayingBarEnabled = true, // 默认启用正在播放栏
    isThemeMediaSupported = false, // 默认不支持主题媒体
    shouldAutoFocus = false, // 默认不自动聚焦
    backDropType
}) => {
    // 创建 div 元素的引用
    const element = useRef<HTMLDivElement>(null);

    // 组件挂载时执行一次
    useEffect(() => {
        // 隐藏活动的非 React 视图
        viewManager.hideView();
    }, []);

    // 当元素引用、正在播放栏状态或主题媒体支持状态改变时执行
    useEffect(() => {
        // 创建自定义事件的配置对象
        const event = {
            bubbles: true, // 事件冒泡
            cancelable: false, // 不可取消
            detail: {
                isRestored: false, // 是否为恢复状态
                options: {
                    enableMediaControl: isNowPlayingBarEnabled, // 启用媒体控制
                    supportsThemeMedia: isThemeMediaSupported // 支持主题媒体
                }
            }
        };
        // viewbeforeshow - 在管理仪表板和标准主题之间切换
        element.current?.dispatchEvent(new CustomEvent('viewbeforeshow', event));
        // pagebeforeshow - 在 libraryMenu 中隐藏表格页面上的标签
        element.current?.dispatchEvent(new CustomEvent('pagebeforeshow', event));
        // viewshow - 更新 appRouter 的状态
        element.current?.dispatchEvent(new CustomEvent('viewshow', event));
        // pageshow - 更新 libraryMenu 中的标题/导航
        element.current?.dispatchEvent(new CustomEvent('pageshow', event));
    }, [ element, isNowPlayingBarEnabled, isThemeMediaSupported ]);

    // 当自动聚焦状态改变时执行
    useEffect(() => {
        if (shouldAutoFocus) {
            // 自动聚焦到当前元素
            autoFocuser.autoFocus(element.current);
        }
    }, [ shouldAutoFocus ]);

    // 返回页面 JSX 结构
    return (
        <StrictMode>
            <div
                ref={element}
                id={id}
                data-role='page'
                className={`page ${className}`}
                data-title={title}
                data-backbutton={isBackButtonEnabled}
                data-menubutton={isMenuButtonEnabled}
                data-backdroptype={backDropType}
            >
                {children}
            </div>
        </StrictMode>
    );
};

// 导出 Page 组件为默认导出
export default Page;
