/**
 * 列表视图用户数据按钮组件
 * 用于在列表视图中显示各种用户交互按钮（播放状态、收藏、添加到播放列表等）
 */
import React, { type FC } from 'react';
import Box from '@mui/material/Box';

import itemHelper from '../../itemHelper';
import PlayedButton from 'elements/emby-playstatebutton/PlayedButton';
import FavoriteButton from 'elements/emby-ratingbutton/FavoriteButton';
import PlaylistAddIconButton from '../../common/PlaylistAddIconButton';
import InfoIconButton from '../../common/InfoIconButton';
import RightIconButtons from '../../common/RightIconButtons';
import MoreVertIconButton from '../../common/MoreVertIconButton';

import type { ItemDto } from 'types/base/models/item-dto';
import type { ListOptions } from 'types/listOptions';

/**
 * 列表视图用户数据按钮组件的属性接口
 */
interface ListViewUserDataButtonsProps {
    /** 项目数据对象 */
    item: ItemDto;
    /** 列表选项配置 */
    listOptions: ListOptions;
}

/**
 * 列表视图用户数据按钮组件
 * 根据配置选项显示不同的操作按钮（添加到播放列表、信息、自定义按钮、已播放、收藏、更多等）
 * @param {ItemDto} item - 项目数据对象
 * @param {ListOptions} listOptions - 列表选项配置
 */
const ListViewUserDataButtons: FC<ListViewUserDataButtonsProps> = ({
    item = {},
    listOptions
}) => {
    // 从用户数据中获取收藏和播放状态
    const { IsFavorite, Played } = item.UserData ?? {};

    /**
     * 渲染右侧自定义按钮
     * @returns 自定义按钮组件数组
     */
    const renderRightButtons = () => {
        return listOptions.rightButtons?.map((button, index) => (
            <RightIconButtons
                // eslint-disable-next-line react/no-array-index-key
                key={index}
                className='listItemButton itemAction'
                id={button.id}
                title={button.title}
                icon={button.icon}
            />
        ));
    };

    return (
        <Box className='listViewUserDataButtons'>
            {/* 添加到播放列表按钮 */}
            {listOptions.addToListButton && (
                <PlaylistAddIconButton
                    className='paper-icon-button-light listItemButton itemAction'
                />

            )}
            {/* 信息按钮 */}
            {listOptions.infoButton && (
                <InfoIconButton
                    className='paper-icon-button-light listItemButton itemAction'
                />

            ) }

            {/* 渲染自定义右侧按钮 */}
            {listOptions.rightButtons && renderRightButtons()}

            {/* 用户数据按钮组（已播放、收藏） */}
            {listOptions.enableUserDataButtons !== false && (
                <>
                    {/* 已播放按钮 - 仅对可标记为已播放的项目显示 */}
                    {itemHelper.canMarkPlayed(item)
                        && listOptions.enablePlayedButton !== false && (
                        <PlayedButton
                            className='listItemButton'
                            isPlayed={Played}
                            itemId={item.Id}
                            itemType={item.Type}
                        />
                    )}

                    {/* 收藏按钮 - 仅对可评分的项目显示 */}
                    {itemHelper.canRate(item)
                        && listOptions.enableRatingButton !== false && (
                        <FavoriteButton
                            className='listItemButton'
                            isFavorite={IsFavorite}
                            itemId={item.Id}
                        />
                    )}
                </>
            )}

            {/* 更多操作按钮 */}
            {listOptions.moreButton !== false && (
                <MoreVertIconButton
                    className='paper-icon-button-light listItemButton itemAction'
                />
            )}
        </Box>
    );
};

export default ListViewUserDataButtons;
