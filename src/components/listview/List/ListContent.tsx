// 导入 Jellyfin SDK 中的基础项目类型
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import React, { type FC } from 'react';
// 导入 Material-UI 的拖拽图标
import DragHandleIcon from '@mui/icons-material/DragHandle';
import Box from '@mui/material/Box';

// 导入自定义指示器钩子
import useIndicator from 'components/indicators/useIndicator';
// 导入媒体信息相关组件
import PrimaryMediaInfo from '../../mediainfo/PrimaryMediaInfo';
import ListContentWrapper from './ListContentWrapper';
import ListItemBody from './ListItemBody';
import ListImageContainer from './ListImageContainer';
import ListViewUserDataButtons from './ListViewUserDataButtons';

// 导入类型定义
import type { ItemDto } from 'types/base/models/item-dto';
import type { ListOptions } from 'types/listOptions';

/**
 * 列表内容组件的属性接口
 */
interface ListContentProps {
    /** 媒体项目数据 */
    item: ItemDto;
    /** 列表选项配置 */
    listOptions: ListOptions;
    /** 是否启用内容包装器 */
    enableContentWrapper?: boolean;
    /** 是否启用概览显示 */
    enableOverview?: boolean;
    /** 是否启用侧边媒体信息 */
    enableSideMediaInfo?: boolean;
    /** 是否点击整个项目 */
    clickEntireItem?: boolean;
    /** 操作类型 */
    action?: string;
    /** 是否使用大型样式 */
    isLargeStyle: boolean;
    /** 下载宽度 */
    downloadWidth?: number;
}

/**
 * 列表内容组件
 * 用于渲染列表项的内容，包括图片、媒体信息、用户数据按钮等
 */
const ListContent: FC<ListContentProps> = ({
    item,
    listOptions,
    enableContentWrapper,
    enableOverview,
    enableSideMediaInfo,
    clickEntireItem,
    action,
    isLargeStyle,
    downloadWidth
}) => {
    // 获取项目的指示器（如缺失、录制等状态）
    const indicator = useIndicator(item);
    return (
        <ListContentWrapper
            itemOverview={item.Overview}
            enableContentWrapper={enableContentWrapper}
            enableOverview={enableOverview}
        >
            {/* 如果不是点击整个项目且启用了拖拽功能，显示拖拽手柄 */}
            {!clickEntireItem && listOptions.dragHandle && (
                <DragHandleIcon className='listViewDragHandle listItemIcon listItemIcon-transparent' />
            )}

            {/* 如果未禁用图片显示，渲染图片容器 */}
            {listOptions.image !== false && (
                <ListImageContainer
                    item={item}
                    listOptions={listOptions}
                    action={action}
                    isLargeStyle={isLargeStyle}
                    clickEntireItem={clickEntireItem}
                    downloadWidth={downloadWidth}
                />
            )}

            {/* 如果启用了左侧索引号显示，渲染索引号 */}
            {listOptions.showIndexNumberLeft && (
                <Box className='listItem-indexnumberleft'>
                    {item.IndexNumber ?? <span>&nbsp;</span>}
                </Box>
            )}

            {/* 列表项主体内容 */}
            <ListItemBody
                item={item}
                listOptions={listOptions}
                action={action}
                enableContentWrapper={enableContentWrapper}
                enableOverview={enableOverview}
                enableSideMediaInfo={enableSideMediaInfo}
                getMissingIndicator={indicator.getMissingIndicator}
            />

            {/* 如果启用了媒体信息显示和侧边媒体信息，渲染主要媒体信息 */}
            {listOptions.showMediaInfo !== false && enableSideMediaInfo && (
                <PrimaryMediaInfo
                    className='secondary listItemMediaInfo'
                    infoclass='mediaInfoText'
                    item={item}
                    showRuntimeInfo
                    showOfficialRatingInfo
                    showOriginalAirDateInfo
                    showStarRatingInfo
                    showCaptionIndicatorInfo
                    getMissingIndicator={indicator.getMissingIndicator}
                />
            )}

            {/* 如果启用了录制按钮且项目类型是计时器或节目，显示计时器指示器 */}
            {listOptions.recordButton
                && (item.Type === 'Timer' || item.Type === BaseItemKind.Program) && (
                indicator.getTimerIndicator('listItemAside')
            )}

            {/* 如果不是点击整个项目，显示用户数据按钮（如播放、喜欢等） */}
            {!clickEntireItem && (
                <ListViewUserDataButtons
                    item={item}
                    listOptions={listOptions}
                />
            )}
        </ListContentWrapper>
    );
};

export default ListContent;
