import React, { type FC } from 'react';
import classNames from 'classnames';
import ClosedCaptionIcon from '@mui/icons-material/ClosedCaption';
import Box from '@mui/material/Box';

interface CaptionMediaInfoProps {
    /**
     * 额外的 CSS 类名。
     *
     * 该组件会将其与内置的媒体信息样式类合并，
     * 以便在不同布局/容器中复用同一图标渲染。
     */
    className?: string;
}

/**
 * 字幕（Closed Caption）媒体信息项。
 *
 * 当前仅负责展示一个“字幕/CC”图标，并通过既有的 class 体系参与布局与样式。
 */
const CaptionMediaInfo: FC<CaptionMediaInfoProps> = ({ className }) => {
    // 合并通用媒体信息类名、字幕特有类名以及外部传入的附加类名。
    const cssClass = classNames(
        'mediaInfoItem',
        'closedCaptionMediaInfoText',
        className
    );

    return (
        // 使用 MUI 的 Box 作为容器，便于在现有布局系统中对齐/间距控制。
        <Box className={cssClass}>
            {/* 字幕（Closed Caption）图标 */}
            <ClosedCaptionIcon />
        </Box>
    );
};

export default CaptionMediaInfo;
