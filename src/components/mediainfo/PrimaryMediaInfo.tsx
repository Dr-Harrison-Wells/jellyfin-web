// React 核心库和类型
import React, { type FC } from 'react';
// 用于组合多个 CSS 类名的工具
import classNames from 'classnames';
// Material-UI 的 Box 容器组件
import Box from '@mui/material/Box';
// 自定义 Hook，用于获取主要媒体信息
import usePrimaryMediaInfo from './usePrimaryMediaInfo';

// 媒体信息项组件
import MediaInfoItem from './MediaInfoItem';
// 星级评分图标组件
import StarIcons from './StarIcons';
// 字幕标识组件
import CaptionMediaInfo from './CaptionMediaInfo';
// 影评人评分信息组件
import CriticRatingMediaInfo from './CriticRatingMediaInfo';
// 结束时间组件
import EndsAt from './EndsAt';

// 媒体项类型枚举
import { ItemMediaKind } from 'types/base/models/item-media-kind';
// 媒体项数据传输对象类型
import type { ItemDto } from 'types/base/models/item-dto';
// 杂项信息类型
import type { MiscInfo } from 'types/mediaInfoItem';
// 主要信息配置选项类型
import type { PrimaryInfoOpts } from './type';

/**
 * 主要媒体信息组件的属性接口
 * 继承 PrimaryInfoOpts，添加额外的显示控制选项
 */
interface PrimaryMediaInfoProps extends PrimaryInfoOpts {
    /** 外层容器的 CSS 类名 */
    className?: string;
    /** 信息项的 CSS 类名 */
    infoclass?: string;
    /** 媒体项数据对象 */
    item: ItemDto;
    /** 是否显示星级评分信息 */
    showStarRatingInfo?: boolean;
    /** 是否显示字幕标识信息 */
    showCaptionIndicatorInfo?: boolean;
    /** 是否显示影评人评分信息 */
    showCriticRatingInfo?: boolean;
    /** 是否显示结束时间信息 */
    showEndsAtInfo?: boolean;
    /** 获取缺失标识的函数 */
    getMissingIndicator?: () => React.JSX.Element | null;
}

/**
 * 主要媒体信息组件
 * 用于显示媒体项的各种信息，包括年份、时长、评分、字幕等
 * 根据传入的配置选项灵活控制显示内容
 */
const PrimaryMediaInfo: FC<PrimaryMediaInfoProps> = ({
    className,
    infoclass,
    item,
    showYearInfo,
    showAudioContainerInfo,
    showEpisodeTitleInfo,
    showOriginalAirDateInfo,
    showFolderRuntimeInfo,
    showRuntimeInfo,
    showItemCountInfo,
    showSeriesTimerInfo,
    showStartDateInfo,
    showProgramIndicatorInfo,
    includeEpisodeTitleIndexNumber,
    showOfficialRatingInfo,
    showVideo3DFormatInfo,
    showPhotoSizeInfo,
    showStarRatingInfo = false,
    showCaptionIndicatorInfo = false,
    showCriticRatingInfo = false,
    showEndsAtInfo = false,
    getMissingIndicator
}) => {
    // 使用自定义 Hook 获取根据配置生成的媒体信息数组
    const miscInfo = usePrimaryMediaInfo({
        item,
        showYearInfo,
        showAudioContainerInfo,
        showEpisodeTitleInfo,
        showOriginalAirDateInfo,
        showFolderRuntimeInfo,
        showRuntimeInfo,
        showItemCountInfo,
        showSeriesTimerInfo,
        showStartDateInfo,
        showProgramIndicatorInfo,
        includeEpisodeTitleIndexNumber,
        showOfficialRatingInfo,
        showVideo3DFormatInfo,
        showPhotoSizeInfo
    });
    // 从媒体项中解构需要的字段
    const {
        StartDate,        // 开始日期
        HasSubtitles,     // 是否有字幕
        MediaType,        // 媒体类型
        RunTimeTicks,     // 运行时间（以 tick 为单位）
        CommunityRating,  // 社区评分
        CriticRating      // 影评人评分
    } = item;

    // 组合 CSS 类名
    const cssClass = classNames(className);

    // 渲染单个媒体信息项
    const renderMediaInfo = (info: MiscInfo, index: number) => (
        <MediaInfoItem key={index} className={infoclass} miscInfo={info} />
    );

    return (
        <Box className={cssClass}>
            {/* 渲染基本的媒体信息列表 */}
            {miscInfo.map((info, index) => renderMediaInfo(info, index))}

            {/* 如果启用且有社区评分，显示星级评分 */}
            {showStarRatingInfo && CommunityRating && (
                <StarIcons
                    className={infoclass}
                    communityRating={CommunityRating}
                />
            )}

            {/* 如果启用且有字幕，显示字幕标识 */}
            {showCaptionIndicatorInfo && HasSubtitles && (
                <CaptionMediaInfo className={infoclass} />
            )}

            {/* 如果启用且有影评人评分，显示影评人评分 */}
            {showCriticRatingInfo && CriticRating && (
                <CriticRatingMediaInfo
                    className={infoclass}
                    criticRating={CriticRating}
                />
            )}

            {/* 如果启用且满足条件（视频类型、有时长、无开始日期），显示结束时间 */}
            {showEndsAtInfo
                && MediaType === ItemMediaKind.Video
                && RunTimeTicks
                && !StartDate && (
                <EndsAt className={infoclass} runTimeTicks={RunTimeTicks} />
            )}

            {/* 如果提供了获取缺失标识的函数，调用并渲染结果 */}
            {getMissingIndicator?.()}
        </Box>
    );
}
};

export default PrimaryMediaInfo;
