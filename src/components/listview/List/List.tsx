import React, { type FC } from 'react';
import useList from './useList';
import ListContent from './ListContent';
import ListWrapper from './ListWrapper';
import type { ItemDto } from 'types/base/models/item-dto';
import type { ListOptions } from 'types/listOptions';
import '../../mediainfo/mediainfo.scss';
import '../../guide/programs.scss';

/**
 * 列表项属性接口
 */
interface ListProps {
    /** 列表项索引 */
    index: number;
    /** 列表项数据对象 */
    item: ItemDto;
    /** 可选的列表配置选项 */
    listOptions?: ListOptions;
}

/**
 * 列表项组件
 * 用于渲染单个列表项，包含包装器和内容
 */
const List: FC<ListProps> = ({ index, item, listOptions = {} }) => {
    // 使用自定义 hook 获取列表相关属性
    const { getListdWrapperProps, getListContentProps } = useList({ item, listOptions } );
    const listWrapperProps = getListdWrapperProps();
    const listContentProps = getListContentProps();

    return (
        <ListWrapper
            key={index}
            index={index}
            {...listWrapperProps}
        >
            <ListContent {...listContentProps} />
        </ListWrapper>
    );
};

export default List;
