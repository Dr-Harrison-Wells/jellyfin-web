// 导入 React 相关库
import React, { type FC } from 'react';
import classNames from 'classnames';
import Box from '@mui/material/Box';

// 导入自定义 hooks 和工具函数
import { useApi } from 'hooks/useApi';
import useIndicator from '../../indicators/useIndicator';
import layoutManager from '../../layoutManager';
import { getDefaultBackgroundClass } from '../../cardbuilder/cardBuilderUtils';
import {
    canResume,
    getChannelImageUrl,
    getImageUrl
} from './listHelper';

// 导入组件
import Media from 'components/common/Media';
import PlayArrowIconButton from 'components/common/PlayArrowIconButton';

// 导入类型定义
import type { ItemDto } from 'types/base/models/item-dto';
import type { ListOptions } from 'types/listOptions';

/**
 * 列表图片容器组件的属性接口
 */
interface ListImageContainerProps {
    /** 媒体项数据对象 */
    item: ItemDto;
    /** 列表选项配置 */
    listOptions: ListOptions;
    /** 操作类型（可选） */
    action?: string | null;
    /** 是否使用大尺寸样式 */
    isLargeStyle: boolean;
    /** 是否可点击整个项目 */
    clickEntireItem?: boolean;
    /** 下载图片的宽度（可选） */
    downloadWidth?: number;
}

/**
 * 列表图片容器组件
 * 用于在列表视图中显示媒体项的图片、指示器和播放按钮
 */
const ListImageContainer: FC<ListImageContainerProps> = ({
    item = {},
    listOptions,
    action,
    isLargeStyle,
    clickEntireItem,
    downloadWidth
}) => {
    // 获取 API 实例
    const { api } = useApi();

    // 获取各种指示器组件（媒体源、进度条、已播放标记）
    const { getMediaSourceIndicator, getProgressBar, getPlayedIndicator } = useIndicator(item);

    // 根据图片来源获取图片信息（频道图片或媒体项图片）
    const imgInfo = listOptions.imageSource === 'channel' ?
        getChannelImageUrl(item, api, downloadWidth) :
        getImageUrl(item, api, downloadWidth);

    // 获取配置选项
    const defaultCardImageIcon = listOptions.defaultCardImageIcon; // 默认卡片图标
    const disableIndicators = listOptions.disableIndicators; // 是否禁用指示器
    const imgUrl = imgInfo?.imgUrl; // 图片 URL
    const blurhash = imgInfo.blurhash; // 模糊哈希（用于图片占位）

    // 动态构建图片容器的 CSS 类名
    const imageClass = classNames(
        'listItemImage', // 基础类名
        { 'listItemImage-large': isLargeStyle }, // 大尺寸样式
        { 'listItemImage-channel': listOptions.imageSource === 'channel' }, // 频道图片样式
        { 'listItemImage-large-tv': isLargeStyle && layoutManager.tv }, // TV 大尺寸样式
        { itemAction: !clickEntireItem }, // 可操作项样式
        { [getDefaultBackgroundClass(item.Name)]: !imgUrl } // 无图片时的默认背景
    );

    // 判断是否在图片点击时播放（需要开启图片播放按钮且非 TV 模式）
    const playOnImageClick = listOptions.imagePlayButton && !layoutManager.tv;

    // 确定图片的操作类型
    const imageAction = playOnImageClick ? 'link' : action;

    // 播放按钮的 CSS 类名
    const btnCssClass =
        'paper-icon-button-light listItemImageButton itemAction';

    // 获取各种指示器和进度信息
    const mediaSourceIndicator = getMediaSourceIndicator(); // 媒体源指示器
    const playedIndicator = getPlayedIndicator(); // 已播放指示器
    const progressBar = getProgressBar(); // 播放进度条
    const playbackPositionTicks = item?.UserData?.PlaybackPositionTicks; // 播放位置（时间刻度）

    return (
        <Box
            data-action={imageAction}
            className={imageClass}
        >
            {/* 媒体图片组件 */}
            <Media item={item} imgUrl={imgUrl} blurhash={blurhash} defaultCardImageIcon={defaultCardImageIcon} />

            {/* 媒体源指示器（如果未禁用指示器） */}
            {disableIndicators !== true && mediaSourceIndicator}

            {/* 已播放指示器 */}
            {playedIndicator && (
                <Box className='indicators listItemIndicators'>
                    {playedIndicator}
                </Box>
            )}

            {/* 播放按钮（仅在启用图片播放按钮时显示） */}
            {playOnImageClick && (
                <PlayArrowIconButton
                    className={btnCssClass}
                    action={
                        canResume(playbackPositionTicks) ? 'resume' : 'play' // 根据播放位置决定是继续播放还是开始播放
                    }
                    title={
                        canResume(playbackPositionTicks) ?
                            'ButtonResume' : // 继续播放按钮
                            'Play' // 播放按钮
                    }
                />
            )}

            {/* 播放进度条 */}
            {progressBar}
        </Box>
    );
};

// 导出组件
export default ListImageContainer;
