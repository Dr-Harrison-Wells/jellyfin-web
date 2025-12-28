import React, { type FC } from 'react';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import classNames from 'classnames';
import type { MiscInfo } from 'types/mediaInfoItem';

/**
 * 媒体信息项组件的属性接口
 */
interface MediaInfoItemProps {
    /** 自定义样式类名 */
    className?: string;
    /** 媒体信息数据对象 */
    miscInfo: MiscInfo ;

}

/**
 * 媒体信息项组件
 * 用于显示单个媒体信息项，支持普通文本或可点击的链接形式
 */
const MediaInfoItem: FC<MediaInfoItemProps> = ({ className, miscInfo }) => {
    const { text, textAction, cssClass, type } = miscInfo;

    // 渲染文本内容
    // 如果存在 textAction，渲染为可点击的链接；否则渲染为普通文本
    // eslint-disable-next-line sonarjs/function-return-type
    const renderText = () => {
        if (textAction) {
            return (
                <Link
                    className={classNames(textAction.cssClass, className)}
                    href={textAction.url}
                    title={textAction.title}
                    color='inherit'
                >
                    {textAction.title}
                </Link>
            );
        } else {
            return text;
        }
    };

    return (
        <Box className={classNames('mediaInfoItem', cssClass, type, className)}>
            {renderText()}
        </Box>
    );
};

export default MediaInfoItem;
