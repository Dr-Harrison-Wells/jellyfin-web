import React, { useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

/**
 * BangRedirect 组件
 * 用于处理旧版 URL 格式的重定向（以感叹号 ! 开头的路径）
 * 这是一个向后兼容组件，将在未来版本中被移除
 */
const BangRedirect = () => {
    // 获取当前路由位置信息
    const location = useLocation();

    // 使用 useMemo 计算重定向目标，避免不必要的重新计算
    const to = useMemo(() => {
        // 保留查询参数和哈希值
        const _to = {
            search: location.search,
            hash: location.hash
        };

        // 处理 '/!/' 开头的路径，移除前两个字符
        if (location.pathname.startsWith('/!/')) {
            return { ..._to, pathname: location.pathname.substring(2) };
        } else if (location.pathname.startsWith('/!')) {
            // 处理 '/!' 开头的路径，将其替换为 '/'
            return { ..._to, pathname: location.pathname.replace(/^\/!/, '/') };
        } else if (location.pathname.startsWith('!')) {
            // 处理 '!' 开头的路径，移除第一个字符
            return { ..._to, pathname: location.pathname.substring(1) };
        }
    }, [ location ]);

    // 如果路径不需要重定向，返回 null
    if (!to) return null;

    // 警告用户正在使用已废弃的 URL 格式
    console.warn('[BangRedirect] You are using a deprecated URL format. This will stop working in a future Jellyfin update.');

    // 使用 Navigate 组件进行重定向
    // replace 属性确保不会在历史记录中创建新条目
    return (
        <Navigate
            replace
            to={to}
        />
    );
};

export default BangRedirect;
