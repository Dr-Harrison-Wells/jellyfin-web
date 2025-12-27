// 导入 Material-UI 组件
import Alert from '@mui/material/Alert/Alert';
import AlertTitle from '@mui/material/AlertTitle/AlertTitle';
import Box from '@mui/material/Box/Box';
import Paper from '@mui/material/Paper/Paper';
import Typography from '@mui/material/Typography/Typography';
import classNames from 'classnames';
import React, { type FC, useEffect } from 'react';
import { useRouteError } from 'react-router-dom';

// 导入本地组件
import loading from 'components/loading/loading';
import Page from 'components/Page';

/**
 * 错误边界组件参数接口
 */
interface ErrorBoundaryParams {
    /** 页面样式类名数组，可选 */
    pageClasses?: string[]
}

/**
 * 错误边界组件
 * 用于捕获和显示路由中发生的错误信息
 * @param pageClasses - 页面样式类名数组，默认为 ['libraryPage']
 */
const ErrorBoundary: FC<ErrorBoundaryParams> = ({
    pageClasses = [ 'libraryPage' ]
}) => {
    // 获取路由错误对象
    // 获取路由错误对象
    const error = useRouteError() as Error;

    // 组件挂载后隐藏加载动画
    useEffect(() => {
        loading.hide();
    }, []);

    return (
        <Page
            id='errorBoundary'
            className={classNames('mainAnimatedPage', pageClasses)}
        >
            <Box className='content-primary'>
                {/* 错误警告框 */}
                <Alert severity='error'>
                    {/* 错误标题：显示错误名称 */}
                    <AlertTitle>
                        {error.name}
                    </AlertTitle>

                    {/* 错误消息：显示错误描述 */}
                    <Typography>
                        {error.message}
                    </Typography>

                    {/* 如果存在错误堆栈，显示详细堆栈信息 */}
                    {error.stack && (
                        <Paper
                            variant='outlined'
                            sx={{
                                marginTop: 1,
                                backgroundColor: 'transparent'
                            }}
                        >
                            <Box
                                component='pre'
                                sx={{
                                    overflow: 'auto',
                                    margin: 2,
                                    maxHeight: '25rem' // 最大高度约为 20 行
                                }}
                            >
                                {error.stack}
                            </Box>
                        </Paper>
                    )}
                </Alert>
            </Box>
        </Page>
    );
};

export default ErrorBoundary;
