import React, { type FC } from 'react';
import classNames from 'classnames';
import Box from '@mui/material/Box';

import TextLines from 'components/common/textLines/TextLines';
import PrimaryMediaInfo from '../../mediainfo/PrimaryMediaInfo';

import type { ItemDto } from 'types/base/models/item-dto';
import type { ListOptions } from 'types/listOptions';

/**
 * 列表项主体组件的属性接口
 */
interface ListItemBodyProps {
    /** 项目数据对象 */
    item: ItemDto;
    /** 列表选项配置 */
    listOptions: ListOptions;
    /** 操作类型 */
    action?: string | null;
    /** 是否使用大样式 */
    isLargeStyle?: boolean;
    /** 是否点击整个项目 */
    clickEntireItem?: boolean;
    /** 是否启用内容包装器 */
    enableContentWrapper?: boolean;
    /** 是否启用概述 */
    enableOverview?: boolean;
    /** 是否启用侧边媒体信息 */
    enableSideMediaInfo?: boolean;
    /** 获取缺失指示器的函数 */
    getMissingIndicator: () => React.JSX.Element | null
}

/**
 * 列表项主体组件
 * 用于渲染列表项的主要内容区域，包括文本信息、媒体信息和概述
 */
const ListItemBody: FC<ListItemBodyProps> = ({
    item = {},
    listOptions = {},
    action,
    isLargeStyle,
    clickEntireItem,
    enableContentWrapper,
    enableOverview,
    enableSideMediaInfo,
    getMissingIndicator
}) => {
    // 构建CSS类名：基础类名 + 条件类名
    const cssClass = classNames(
        'listItemBody',
        { 'itemAction': !clickEntireItem }, // 如果不是点击整个项目则添加itemAction类
        { 'listItemBody-noleftpadding': listOptions.image === false } // 如果没有图片则移除左边距
    );

    return (
        <Box data-action={action} className={cssClass}>

            {/* 文本行组件：显示标题、副标题等文本信息 */}
            <TextLines
                item={item}
                textClassName='listItemBodyText'
                textLineOpts={{
                    showProgramDateTime: listOptions.showProgramDateTime,
                    showProgramTime: listOptions.showProgramTime,
                    showChannel: listOptions.showChannel,
                    showParentTitle: listOptions.showParentTitle,
                    showIndexNumber: listOptions.showIndexNumber,
                    parentTitleWithTitle: listOptions.parentTitleWithTitle,
                    showArtist: listOptions.showArtist,
                    includeParentInfoInTitle: listOptions.includeParentInfoInTitle,
                    includeIndexNumber: listOptions.includeIndexNumber,
                    showCurrentProgram: listOptions.showCurrentProgram
                }}
                isLargeStyle={isLargeStyle}
            />

            {/* 主要媒体信息：如果启用且未使用侧边显示，则渲染媒体信息 */}
            {listOptions.showMediaInfo !== false && !enableSideMediaInfo && (
                <PrimaryMediaInfo
                    className='secondary listItemMediaInfo listItemBodyText'
                    infoclass='mediaInfoText'
                    item={item}
                    showEpisodeTitleInfo
                    showOriginalAirDateInfo
                    showCaptionIndicatorInfo
                    getMissingIndicator={getMissingIndicator}
                />
            )}

            {/* 概述内容：如果启用概述且未使用内容包装器，则显示项目概述 */}
            {!enableContentWrapper && enableOverview && item.Overview && (
                <Box className='secondary listItem-overview listItemBodyText'>
                    <bdi>{item.Overview}</bdi>
                </Box>
            )}
        </Box>
    );
};

export default ListItemBody;
