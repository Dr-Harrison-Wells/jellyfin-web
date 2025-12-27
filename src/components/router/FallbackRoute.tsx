import React, { useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import Page from 'components/Page';
import globalize from 'lib/globalize';
import LinkButton from 'elements/emby-button/LinkButton';

/**
 * 后备路由组件
 * 用于处理无效或已废弃的 URL 路径
 * - 重定向旧的 HTML 格式路径到新的路由格式
 * - 显示 404 页面未找到错误
 */
const FallbackRoute = () => {
    // 获取当前路由位置信息
    const location = useLocation();

    // 检查请求的路径是否需要被重定向
    const to = useMemo(() => {
        // 构建基础重定向对象，保留搜索参数和哈希值
        const _to = {
            search: location.search,
            hash: location.hash
        };

        // 重定向旧的向导页面路径（如 /wizardstart.html）
        // 将其转换为新格式（如 /wizard/start）
        if (RegExp(/^\/wizard[a-z]+\.html/i).test(location.pathname)) {
            return { ..._to, pathname: `/wizard/${location.pathname.slice(7, -5)}` };
        }

        // 如果路径以 ".html" 结尾，重定向到移除 .html 后的路径
        // 例如：/home.html -> /home
        if (location.pathname.endsWith('.html')) {
            return { ..._to, pathname: location.pathname.slice(0, -5) };
        }
    }, [ location ]);

    // 如果存在重定向目标，执行重定向
    if (to) {
        // 警告：使用了已废弃的 URL 格式
        console.warn('[FallbackRoute] You are using a deprecated URL format. This will stop working in a future Jellyfin update.');

        return (
            <Navigate
                replace
                to={to}
            />
        );
    }

    // 显示 404 页面未找到错误页面
    return (
        <Page
            id='fallbackPage'
            title={globalize.translate('HeaderPageNotFound')}
            className='mainAnimatedPage libraryPage'
        >
            <div className='padded-left padded-right'>
                <h1>{globalize.translate('HeaderPageNotFound')}</h1>
                <p>{globalize.translate('PageNotFound')}</p>
                <LinkButton
                    className='button-link'
                    href='#/home'
                >
                    {globalize.translate('GoHome')}
                </LinkButton>
            </div>
        </Page>
    );
};

export default FallbackRoute;
