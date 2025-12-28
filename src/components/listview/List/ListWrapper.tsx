// 引入样式管理库
import classNames from 'classnames';
// 引入React核心库和类型定义
import React, { type FC, type PropsWithChildren } from 'react';
// 引入Material-UI组件
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
// 引入布局管理器
import layoutManager from '../../layoutManager';
// 引入数据属性类型定义
import type { DataAttributes } from 'types/dataAttributes';

/**
 * 列表包装器组件的属性接口
 */
interface ListWrapperProps {
    index: number | undefined; // 列表项索引
    title?: string | null; // 列表项标题，用于无障碍访问
    action?: string | null; // 列表项操作类型
    dataAttributes?: DataAttributes; // 自定义数据属性
    className?: string; // 自定义CSS类名
}

/**
 * 列表包装器组件
 *
 * 该组件根据当前设备类型（电视或其他设备）渲染不同的列表项容器。
 * - 在电视设备上：使用Button组件，提供更好的焦点控制和交互体验
 * - 在非电视设备上：使用Box组件，提供更轻量级的容器
 *
 * @param index - 列表项的索引位置
 * @param action - 列表项关联的操作类型
 * @param title - 列表项的标题文本，用于无障碍访问的aria-label
 * @param className - 应用到容器的CSS类名
 * @param dataAttributes - 附加到容器的自定义数据属性
 * @param children - 子组件内容
 */
const ListWrapper: FC<PropsWithChildren<ListWrapperProps>> = ({
    index,
    action,
    title,
    className,
    dataAttributes,
    children
}) => {
    // 判断是否为电视设备
    if (layoutManager.tv) {
        // 电视模式下使用Button组件，支持焦点缩放效果
        return (
            <Button
                data-index={index}
                className={classNames(
                    className,
                    'itemAction listItem-button listItem-focusscale'
                )}
                data-action={action}
                aria-label={title || ''}
                {...dataAttributes}
            >
                {children}
            </Button>
        );
    } else {
        // 非电视模式下使用Box组件作为简单容器
        return (
            <Box data-index={index} className={className} {...dataAttributes}>
                {children}
            </Box>
        );
    }
};

export default ListWrapper;
