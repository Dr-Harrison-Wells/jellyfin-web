// 导入 React 的函数组件和副作用 Hook
import { FunctionComponent, useEffect } from 'react';

// 导入 loading 工具模块
import loading from './loading';

/**
 * Loading 组件
 * 用于显示加载状态的功能组件
 * 该组件在挂载时显示加载指示器，卸载时隐藏加载指示器
 */
const Loading: FunctionComponent = () => {
    // 使用 useEffect Hook 处理组件的加载状态
    useEffect(() => {
        // 组件挂载时显示加载指示器
        loading.show();

        // 返回清理函数，在组件卸载时隐藏加载指示器
        return () => {
            loading.hide();
        };
    }, []); // 空依赖数组表示只在组件挂载和卸载时执行

    // 不渲染任何 UI 元素，仅用于控制加载状态
    return null;
};

export default Loading;
