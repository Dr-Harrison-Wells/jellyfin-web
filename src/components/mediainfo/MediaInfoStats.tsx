/**
 * 媒体信息统计组件
 * 用于显示媒体项目的各种技术信息（分辨率、编解码器、音频通道等）
 */
import React, { type FC } from 'react';
import classNames from 'classnames';
import Box from '@mui/material/Box';
import useMediaInfoStats from './useMediaInfoStats';

import MediaInfoItem from './MediaInfoItem';
import type { ItemDto } from 'types/base/models/item-dto';
import type { MiscInfo } from 'types/mediaInfoItem';
import type { MediaInfoStatsOpts } from './type';

/**
 * MediaInfoStats 组件的属性接口
 */
interface MediaInfoStatsProps extends MediaInfoStatsOpts {
    className?: string; // 容器的 CSS 类名
    infoclass?: string; // 信息项的 CSS 类名
    item: ItemDto; // 媒体项目数据对象
}

/**
 * 媒体信息统计组件
 * 用于显示媒体的技术信息，如分辨率、视频/音频编解码器、音频通道数、添加日期等
 */
const MediaInfoStats: FC<MediaInfoStatsProps> = ({
    className,
    infoclass,
    item,
    showResolutionInfo, // 是否显示分辨率信息
    showVideoStreamCodecInfo, // 是否显示视频编解码器信息
    showAudoChannelInfo, // 是否显示音频通道信息
    showAudioStreamCodecInfo, // 是否显示音频编解码器信息
    showDateAddedInfo // 是否显示添加日期信息
}) => {
    // 使用自定义 Hook 获取媒体信息统计数据
    const mediaInfoStats = useMediaInfoStats({
        item,
        showResolutionInfo,
        showVideoStreamCodecInfo,
        showAudoChannelInfo,
        showAudioStreamCodecInfo,
        showDateAddedInfo
    });

    // 生成容器的 CSS 类名
    const cssClass = classNames(className);

    // 渲染单个媒体信息项
    const renderMediaInfo = (info: MiscInfo, index: number) => (
        <MediaInfoItem key={index} className={infoclass} miscInfo={info} />
    );

    // 返回包含所有媒体信息项的容器
    return (
        <Box className={cssClass}>
            {mediaInfoStats.map((info, index) => renderMediaInfo(info, index))}
        </Box>
    );
};

export default MediaInfoStats;
