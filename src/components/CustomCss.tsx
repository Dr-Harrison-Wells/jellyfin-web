import React, { type FC } from 'react';

import { useUserSettings } from 'hooks/useUserSettings';
import { useBrandingOptions } from 'apps/dashboard/features/branding/api/useBrandingOptions';

/**
 * CustomCss 组件
 * 用于在页面中注入自定义 CSS 样式。
 * 包括服务器端的品牌自定义 CSS 和用户个人的自定义 CSS。
 */
const CustomCss: FC = () => {
    // 获取品牌配置选项，其中包含服务器端的自定义 CSS
    const { data: brandingOptions } = useBrandingOptions();
    // 获取用户设置，其中包含用户自定义 CSS 和是否禁用自定义 CSS 的选项
    const { customCss: userCustomCss, disableCustomCss } = useUserSettings();

    return (
        <>
            {/* 如果未禁用自定义 CSS 且存在服务器端品牌自定义 CSS，则注入样式 */}
            {!disableCustomCss && brandingOptions?.CustomCss && (
                <style>
                    {brandingOptions.CustomCss}
                </style>
            )}
            {/* 如果存在用户自定义 CSS，则注入样式 */}
            {userCustomCss && (
                <style>
                    {userCustomCss}
                </style>
            )}
        </>
    );
};

export default CustomCss;
