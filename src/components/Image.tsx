// 导入 Material-UI 图标类型和组件
import type { SvgIconComponent } from '@mui/icons-material';
import ImageNotSupported from '@mui/icons-material/ImageNotSupported';
import Box from '@mui/material/Box/Box';
import Paper from '@mui/material/Paper/Paper';
import Skeleton from '@mui/material/Skeleton/Skeleton';
import React, { type FC } from 'react';

/**
 * Image 组件的属性接口
 */
interface ImageProps {
    /** 是否处于加载状态 */
    isLoading: boolean
    /** 图片的替代文本 */
    alt?: string
    /** 图片的 URL 地址 */
    url?: string
    /** 图片的宽高比，默认为 16:9 */
    aspectRatio?: number
    /** 当图片不可用时显示的备用图标组件 */
    FallbackIcon?: SvgIconComponent
}

/**
 * Image 图片显示组件
 *
 * 这是一个通用的图片显示组件，具有以下特性：
 * - 支持加载状态的骨架屏显示
 * - 在图片不可用时显示备用图标
 * - 可自定义宽高比
 * - 响应式设计，自适应容器宽度
 *
 * @param props - 组件属性
 * @returns React 函数组件
 */
const Image: FC<ImageProps> = ({
    isLoading,
    alt,
    url,
    aspectRatio = 16 / 9, // 默认宽高比为 16:9
    FallbackIcon = ImageNotSupported // 默认使用不支持图片的图标
}) => (
    <Paper
        sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            aspectRatio,
            overflow: 'hidden'
        }}
    >
        {/* 加载状态时显示骨架屏 */}
        {/* 加载状态时显示骨架屏 */}
        {isLoading && (
            <Skeleton
                variant='rectangular'
                width='100%'
                height='100%'
            />
        )}
        {/* 如果有图片 URL，则显示图片；否则显示备用图标 */}
        {/* 如果有图片 URL，则显示图片；否则显示备用图标 */}
        {url ? (
            <img
                src={url}
                alt={alt}
                width='100%'
            />
        ) : (
            <Box
                sx={{
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
            >
                {/* 显示备用图标 */}
                <FallbackIcon
                    sx={{
                        height: '25%',
                        width: 'auto'
                    }}
                />
            </Box>
        )}
    </Paper>
);

export default Image;
