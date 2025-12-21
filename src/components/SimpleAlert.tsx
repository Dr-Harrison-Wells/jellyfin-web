/**
 * SimpleAlert 组件
 * 
 * 简单的警告对话框组件，用于显示信息提示给用户
 * 基于 Material-UI Dialog 组件实现
 */

import Button from '@mui/material/Button';
import Dialog, { type DialogProps } from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import globalize from 'lib/globalize';
import React from 'react';

/**
 * SimpleAlertDialog 接口
 * 
 * @interface SimpleAlertDialog
 * @extends {DialogProps} Material-UI Dialog 组件的属性
 * 
 * @property {string} [title] - 对话框标题（可选）
 * @property {string} text - 对话框内容文本（必填）
 * @property {() => void} onClose - 关闭对话框的回调函数
 */
interface SimpleAlertDialog extends DialogProps {
    title?: string;
    text: string;
    onClose: () => void
};

/**
 * SimpleAlert 组件
 * 
 * 渲染一个简单的警告对话框，用于向用户显示信息提示
 * 
 * @param {SimpleAlertDialog} props - 组件属性
 * @param {boolean} props.open - 控制对话框是否显示
 * @param {string} [props.title] - 对话框标题，如果未提供则不显示标题栏
 * @param {string} props.text - 对话框的主要文本内容
 * @param {() => void} props.onClose - 当用户点击按钮或关闭对话框时触发的回调
 * 
 * @returns {JSX.Element} 渲染的对话框组件
 * 
 * @example
 * <SimpleAlert
 *   open={true}
 *   title="提示"
 *   text="操作已完成"
 *   onClose={() => console.log('closed')}
 * />
 */
const SimpleAlert = ({ open, title, text, onClose }: SimpleAlertDialog) => {
    return (
        <Dialog open={open} onClose={onClose}>
            {/* 如果提供了标题，则显示标题栏 */}
            {title && (
                <DialogTitle>
                    {title}
                </DialogTitle>
            )}
            {/* 对话框主要内容区域 */}
            <DialogContent>
                <DialogContentText>
                    {text}
                </DialogContentText>
            </DialogContent>
            {/* 对话框底部操作按钮区域 */}
            <DialogActions>
                <Button onClick={onClose}>
                    {/* 显示本地化的"知道了"按钮文本 */}
                    {globalize.translate('ButtonGotIt')}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default SimpleAlert;
