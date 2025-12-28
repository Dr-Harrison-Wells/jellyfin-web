import React, { type FC } from 'react';
import classNames from 'classnames';
import Box from '@mui/material/Box';
import datetime from 'scripts/datetime';
import globalize from 'lib/globalize';

/**
 * 结束时间媒体信息组件的属性接口
 */
interface EndsAtProps {
    /** 自定义样式类名 */
    className?: string;
    /** 运行时长（以 ticks 为单位，1 tick = 100 纳秒） */
    runTimeTicks: number
}

/**
 * 结束时间媒体信息组件
 * 根据媒体的运行时长计算并显示媒体播放结束的时间
 */
const EndsAt: FC<EndsAtProps> = ({ runTimeTicks, className }) => {
    // 生成 CSS 类名
    const cssClass = classNames(
        'mediaInfoItem',
        'endsAt',
        className
    );

    // 计算结束时间：当前时间 + 运行时长（转换为毫秒）
    const endTime = new Date().getTime() + (runTimeTicks / 10000);
    const endDate = new Date(endTime);
    // 格式化显示时间
    const displayTime = datetime.getDisplayTime(endDate);

    return (
        <Box className={cssClass}>
            {globalize.translate('EndsAtValue', displayTime)}
        </Box>
    );
};

export default EndsAt;
