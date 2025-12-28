import React, { type FC } from 'react';
import classNames from 'classnames';
import Box from '@mui/material/Box';

/**
 * 评论家评分媒体信息组件的属性接口
 */
interface CriticRatingMediaInfoProps {
    /** 自定义样式类名 */
    className?: string;
    /** 评论家评分（0-100） */
    criticRating: number;
}

/**
 * 评论家评分媒体信息组件
 * 显示媒体的评论家评分，根据评分高低显示不同的样式
 * 评分 >= 60 显示为"新鲜"样式，< 60 显示为"腐烂"样式
 */
const CriticRatingMediaInfo: FC<CriticRatingMediaInfoProps> = ({
    className,
    criticRating
}) => {
    // 根据评分动态生成 CSS 类名
    // 评分 >= 60 使用"新鲜"样式，否则使用"腐烂"样式
    const cssClass = classNames(
        'mediaInfoCriticRating',
        'mediaInfoItem',
        criticRating >= 60 ?
            'mediaInfoCriticRatingFresh' :
            'mediaInfoCriticRatingRotten',
        className
    );
    return <Box className={cssClass}>{criticRating}</Box>;
};

export default CriticRatingMediaInfo;
