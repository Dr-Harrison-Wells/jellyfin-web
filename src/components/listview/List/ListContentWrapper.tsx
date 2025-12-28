import React, { type FC, type PropsWithChildren } from 'react';
import Box from '@mui/material/Box';

/**
 * 列表内容包装器组件的属性接口
 */
interface ListContentWrapperProps {
    /** 项目概览文本 */
    itemOverview: string | null | undefined;
    /** 是否启用内容包装器 */
    enableContentWrapper?: boolean;
    /** 是否启用概览显示 */
    enableOverview?: boolean;
}

/**
 * 列表内容包装器组件
 * 根据配置决定是否为列表项添加内容包装和概览信息
 * @param itemOverview - 项目概览文本
 * @param enableContentWrapper - 是否启用内容包装器
 * @param enableOverview - 是否启用概览显示
 * @param children - 子组件
 */
const ListContentWrapper: FC<PropsWithChildren<ListContentWrapperProps>> = ({
    itemOverview,
    enableContentWrapper,
    enableOverview,
    children
}) => {
    // 如果启用了内容包装器，则使用 Box 组件包装子元素
    if (enableContentWrapper) {
        return (
            <>
                {/* 列表项内容容器 */}
                <Box className='listItem-content'>{children}</Box>

                {/* 如果启用概览且存在概览文本，则显示概览信息 */}
                {enableOverview && itemOverview && (
                    <Box className='listItem-bottomoverview secondary'>
                        {/* 使用 bdi 标签确保文本方向隔离，支持双向文本显示 */}
                        <bdi>{itemOverview}</bdi>
                    </Box>
                )}
            </>
        );
    } else {
        // 如果未启用内容包装器，直接返回子元素
        // eslint-disable-next-line react/jsx-no-useless-fragment
        return <>{children}</>;
    }
};

export default ListContentWrapper;
