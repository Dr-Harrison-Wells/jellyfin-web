import React, { type FC, useEffect, useState } from 'react';

import { useUserTheme } from 'hooks/useUserTheme';
import { getDefaultTheme } from 'scripts/settings/webSettings';

/**
 * 主题 CSS 组件属性接口
 */
interface ThemeCssProps {
    /** 是否为仪表板主题 */
    dashboard?: boolean
}

/**
 * 根据主题 ID 获取主题 CSS 文件的 URL
 * @param id 主题 ID
 * @returns 主题 CSS 文件的路径
 */
const getThemeUrl = (id: string) => `themes/${id}/theme.css`;;

/** 默认主题 URL */
const DEFAULT_THEME_URL = getThemeUrl(getDefaultTheme().id);

/**
 * 主题 CSS 组件
 * 用于动态加载和切换应用主题样式
 * @param dashboard - 是否使用仪表板主题（默认为 false）
 */
const ThemeCss: FC<ThemeCssProps> = ({
    dashboard = false
}) => {
    // 获取用户的主题设置
    const { theme, dashboardTheme } = useUserTheme();
    // 当前主题 URL 状态
    const [ themeUrl, setThemeUrl ] = useState(DEFAULT_THEME_URL);

    // 根据主题设置更新主题 URL
    useEffect(() => {
        // 根据是否为仪表板选择对应的主题 ID
        const id = dashboard ? dashboardTheme : theme;
        // 如果主题 ID 存在，更新主题 URL
        if (id) setThemeUrl(getThemeUrl(id));
    }, [dashboard, dashboardTheme, theme]);

    // 渲染主题样式链接标签
    return (
        <link
            rel='stylesheet'
            type='text/css'
            href={themeUrl}
        />
    );
};

export default ThemeCss;
