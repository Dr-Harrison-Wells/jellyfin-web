// React 核心库和类型
import React, { type FC } from 'react';
// 用于动态组合 CSS 类名的工具库
import classNames from 'classnames';
// Material-UI 的盒子容器组件
import Box from '@mui/material/Box';
// 自定义 Hook：获取次要媒体信息
import useSecondaryMediaInfo from './useSecondaryMediaInfo';
// 自定义 Hook：获取指示器信息
import useIndicator from 'components/indicators/useIndicator';
// 媒体信息项组件
import MediaInfoItem from './MediaInfoItem';
// 媒体项数据类型定义
import type { ItemDto } from 'types/base/models/item-dto';
// 杂项信息类型定义
import { MiscInfo } from 'types/mediaInfoItem';
// 次要信息配置选项类型
import type { SecondaryInfoOpts } from './type';

/**
 * 次要媒体信息组件的属性接口
 * 继承自 SecondaryInfoOpts，包含显示各种媒体信息的配置项
 */
interface SecondaryMediaInfoProps extends SecondaryInfoOpts {
    /** 外层容器的 CSS 类名 */
    className?: string;
    /** 信息项的 CSS 类名 */
    infoclass?: string;
    /** 媒体项数据对象 */
    item: ItemDto;
    /** 是否显示定时器指示器信息 */
    showTimerIndicatorInfo?: boolean;
}

/**
 * 次要媒体信息组件
 * 用于显示媒体项的次要信息，如节目时间、开始日期、频道号、频道信息等
 * 并可选择性显示定时器指示器
 */
const SecondaryMediaInfo: FC<SecondaryMediaInfoProps> = ({
    className,
    infoclass,
    item,
    showProgramTimeInfo,
    showStartDateInfo,
    showChannelNumberInfo,
    showChannelInfo,
    channelInteractive,
    showTimerIndicatorInfo = false
}) => {
    // 获取次要媒体信息数组
    const miscInfo = useSecondaryMediaInfo({
        item,
        showProgramTimeInfo,
        showStartDateInfo,
        showChannelNumberInfo,
        showChannelInfo,
        channelInteractive
    });

    // 获取媒体项的指示器（如录制状态等）
    const indicator = useIndicator(item);

    // 组合 CSS 类名
    const cssClass = classNames(className);

    /**
     * 渲染单个媒体信息项
     * @param info - 杂项信息对象
     * @param index - 数组索引，用作 key
     */
    const renderMediaInfo = (info: MiscInfo, index: number) => (
        <MediaInfoItem key={index} className={infoclass} miscInfo={info} />
    );

    return (
        <Box className={cssClass}>
            {/* 渲染所有次要媒体信息项 */}
            {miscInfo.map((info, index) => renderMediaInfo(info, index))}

            {/* 如果启用，渲染定时器指示器 */}
            {showTimerIndicatorInfo !== false && indicator.getTimerIndicator()}
        </Box>
    );
};

export default SecondaryMediaInfo;
