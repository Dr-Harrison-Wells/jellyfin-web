import React, { type FC } from 'react';
import classNames from 'classnames';
import StarIcon from '@mui/icons-material/Star';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';

/**
 * 星级图标组件的属性接口
 */
interface StarIconsProps {
    /** 可选的自定义 CSS 类名 */
    className?: string;
    /** 社区评分数值 */
    communityRating: number;
}

/**
 * 星级图标组件
 * 用于显示媒体内容的社区评分，包含一个星形图标和格式化的评分数值
 *
 * @param className - 可选的自定义 CSS 类名
 * @param communityRating - 社区评分数值
 * @returns 渲染的星级评分组件
 */
const StarIcons: FC<StarIconsProps> = ({ className, communityRating }) => {
    // 获取当前主题
    const theme = useTheme();

    // 组合 CSS 类名
    const cssClass = classNames(
        'mediaInfoItem',
        'starRatingContainer',
        className
    );

    return (
        <Box className={cssClass}>
            {/* 星形图标 */}
            <StarIcon
                fontSize={'small'}
                sx={{
                    color: theme.palette.starIcon.main
                }}
            />
            {/* 显示保留一位小数的评分 */}
            {communityRating.toFixed(1)}
        </Box>
    );
};

export default StarIcons;
