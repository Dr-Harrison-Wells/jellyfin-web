import Button from '@mui/material/Button/Button';
import Dialog, { type DialogProps } from '@mui/material/Dialog/Dialog';
import DialogActions from '@mui/material/DialogActions/DialogActions';
import DialogContent from '@mui/material/DialogContent/DialogContent';
import DialogContentText from '@mui/material/DialogContentText/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle/DialogTitle';
import React, { type FC } from 'react';

import globalize from 'lib/globalize';

interface ConfirmDialogProps extends DialogProps {
    /** 确认按钮的颜色 */
    confirmButtonColor?: 'inherit' | 'primary' | 'secondary' | 'success' | 'error' | 'info' | 'warning'
    /** 确认按钮的文本 */
    confirmButtonText?: string
    /** 对话框标题 */
    title: string
    /** 对话框内容文本 */
    text: string
    /** 取消操作的回调函数 */
    onCancel: () => void
    /** 确认操作的回调函数 */
    onConfirm: () => void
}

/**
 * Convenience wrapper for a simple MUI Dialog component for displaying a prompt that needs confirmation.
 * 一个简单的 MUI Dialog 组件封装，用于显示需要确认的提示。
 */
const ConfirmDialog: FC<ConfirmDialogProps> = ({
    confirmButtonColor = 'primary',
    confirmButtonText,
    title,
    text,
    onCancel,
    onConfirm,
    ...dialogProps
}) => (
    <Dialog onClose={onCancel} {...dialogProps}>
        <DialogTitle>
            {title}
        </DialogTitle>
        <DialogContent>
            <DialogContentText>
                {text}
            </DialogContentText>
        </DialogContent>
        <DialogActions>
            {/* 取消按钮 */}
            <Button
                variant='text'
                onClick={onCancel}
            >
                {globalize.translate('ButtonCancel')}
            </Button>
            {/* 确认按钮 */}
            <Button
                color={confirmButtonColor}
                onClick={onConfirm}
            >
                {confirmButtonText || globalize.translate('ButtonOk')}
            </Button>
        </DialogActions>
    </Dialog>
);

export default ConfirmDialog;
