import React, { type FC } from 'react';
import { groupBy } from 'lodash-es';
import Box from '@mui/material/Box';
import { getIndex } from './listHelper';
import ListGroupHeaderWrapper from './ListGroupHeaderWrapper';
import List from './List';

import type { ItemDto } from 'types/base/models/item-dto';
import type { ListOptions } from 'types/listOptions';
import '../listview.scss';

/**
 * Lists 组件的属性接口
 */
interface ListsProps {
    items: ItemDto[]; // 要显示的项目列表
    listOptions?: ListOptions; // 列表显示选项
}

/**
 * Lists 组件 - 用于渲染分组的列表视图
 * 根据索引将项目分组，并显示分组标题和列表项
 */
const Lists: FC<ListsProps> = ({ items = [], listOptions = {} }) => {
    // 根据索引对项目进行分组
    const groupedData = groupBy(items, (item) => {
        if (listOptions.showIndex) {
            return getIndex(item, listOptions);
        }
        return '';
    });

    /**
     * 渲染单个列表项
     * @param item - 要渲染的项目数据
     * @param index - 项目索引
     */
    const renderListItem = (item: ItemDto, index: number) => {
        return (
            <List
                key={`${item.Id}-${index}`}
                index={index}
                item={item}
                listOptions={listOptions}
            />
        );
    };

    return (
        <>
            {Object.entries(groupedData).map(
                ([itemGroupTitle, getItems], index) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <Box key={index}>
                        {/* 如果有分组标题，则渲染分组标题 */}
                        {itemGroupTitle && (
                            <ListGroupHeaderWrapper index={index}>
                                {itemGroupTitle}
                            </ListGroupHeaderWrapper>
                        )}
                        {/* 渲染分组中的所有列表项 */}
                        {getItems.map((item) => renderListItem(item, index))}
                    </Box>
                )
            )}
        </>
    );
};

export default Lists;
