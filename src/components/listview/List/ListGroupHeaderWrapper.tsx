import React, { type FC, type PropsWithChildren } from 'react';
import Typography from '@mui/material/Typography';

/**
 * 列表组头部包装器属性接口
 */
interface ListGroupHeaderWrapperProps {
    /** 索引位置，用于判断是否为第一个头部 */
    index?: number;
}

/**
 * 列表组头部包装器组件
 * 用于渲染列表组的标题头部，根据索引位置应用不同的样式类
 * 第一个头部会添加特殊的 'listGroupHeader-first' 样式类
 */
const ListGroupHeaderWrapper: FC<PropsWithChildren<ListGroupHeaderWrapperProps>> = ({
    index,
    children
}) => {
    // 如果是第一个头部（索引为0），添加特殊的 first 样式类
    if (index === 0) {
        return (
            <Typography
                className='listGroupHeader listGroupHeader-first'
                variant='h2'
            >
                {children}
            </Typography>
        );
    } else {
        // 其他头部只使用基本的 listGroupHeader 样式类
        return (
            <Typography className='listGroupHeader' variant='h2'>
                {children}
            </Typography>
        );
    }
};

export default ListGroupHeaderWrapper;
