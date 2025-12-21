// 导入 MUI 的 Box 组件，用于布局容器
import Box from '@mui/material/Box/Box';
// 导入 DOMPurify 库，用于清理和净化 HTML 内容，防止 XSS 攻击
import DOMPurify from 'dompurify';
// 导入 markdown-it 库，用于将 Markdown 文本转换为 HTML
import markdownIt from 'markdown-it';
// 导入 React 和函数组件类型
import React, { type FC } from 'react';

/**
 * MarkdownBox 组件的属性接口
 */
interface MarkdownBoxProps {
    /** Markdown 格式的字符串内容，可选 */
    markdown?: string | null
    /** 当 markdown 为空时显示的备用文本 */
    fallback?: string
}

/**
 * Markdown 渲染组件
 *
 * 在 MUI Box 组件中渲染 Markdown 内容。
 * 使用 markdown-it 将 Markdown 转换为 HTML，并使用 DOMPurify 进行安全清理。
 */
const MarkdownBox: FC<MarkdownBoxProps> = ({
    markdown,
    fallback
}) => (
    <Box
        // 使用 dangerouslySetInnerHTML 插入经过清理的 HTML 内容
        dangerouslySetInnerHTML={
            markdown ?

                // 将 Markdown 转换为 HTML（允许内嵌 HTML），然后使用 DOMPurify 清理
                { __html: DOMPurify.sanitize(markdownIt({ html: true }).render(markdown)) } :
                undefined
        }
        sx={{
            // 移除第一个子元素的顶部边距和内边距，确保内容紧贴容器顶部
            '> :first-child /* emotion-disable-server-rendering-unsafe-selector-warning-please-do-not-use-this-the-warning-exists-for-a-reason */': {
                marginTop: 0,
                paddingTop: 0
            },
            // 移除最后一个子元素的底部边距和内边距，确保内容紧贴容器底部
            '> :last-child': {
                marginBottom: 0,
                paddingBottom: 0
            }
        }}
    >
        {/* 如果没有 markdown 内容，则显示备用文本 */}
        {markdown ? undefined : fallback}
    </Box>
);

export default MarkdownBox;
