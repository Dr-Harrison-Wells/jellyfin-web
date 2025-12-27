import React, { FC, useEffect, useState } from 'react';

import { appHost } from 'components/apphost';
import Page from 'components/Page';
import { AppFeature } from 'constants/appFeature';
import LinkButton from 'elements/emby-button/LinkButton';
import globalize from 'lib/globalize';
import { ConnectionState } from 'lib/jellyfin-apiclient';

// 连接错误页面组件的属性接口
interface ConnectionErrorPageProps {
    state: ConnectionState
}

// 连接错误页面组件
// 用于在服务器连接状态异常（如需要更新或不可用）时显示错误信息
const ConnectionErrorPage: FC<ConnectionErrorPageProps> = ({
    state
}) => {
    // 页面标题
    const [ title, setTitle ] = useState<string>();
    // 包含 HTML 的错误消息
    const [ htmlMessage, setHtmlMessage ] = useState<string>();
    // 普通文本错误消息
    const [ message, setMessage ] = useState<string>();

    // 根据连接状态更新页面显示内容
    useEffect(() => {
        switch (state) {
            case ConnectionState.ServerUpdateNeeded:
                // 服务器需要更新
                setTitle(globalize.translate('HeaderUpdateRequired'));
                setHtmlMessage(globalize.translate(
                    'ServerUpdateNeeded',
                    '<a href="https://jellyfin.org/downloads/server/">jellyfin.org/downloads/server</a>'
                ));
                setMessage(undefined);
                return;
            case ConnectionState.Unavailable:
                // 服务器不可用
                setTitle(globalize.translate('HeaderServerUnavailable'));
                setHtmlMessage(undefined);
                setMessage(globalize.translate('MessageUnableToConnectToServer'));
        }
    }, [ state ]);

    // 如果没有标题，说明状态未处理或无效，不渲染任何内容
    if (!title) return;

    return (
        <Page
            id='connectionErrorPage'
            className='mainAnimatedPage standalonePage'
            isBackButtonEnabled={false}
        >
            <div className='padded-left padded-right'>
                <h1>{title}</h1>
                {/* 显示 HTML 格式的消息 */}
                {htmlMessage && (
                    <p dangerouslySetInnerHTML={{ __html: htmlMessage }} />
                )}
                {/* 显示普通文本消息 */}
                {message && (
                    <p>{message}</p>
                )}
                {/* 如果支持多服务器特性，显示切换服务器按钮 */}
                {appHost.supports(AppFeature.MultiServer) && (
                    <LinkButton
                        className='raised'
                        href='/selectserver'
                    >
                        {globalize.translate('ButtonChangeServer')}
                    </LinkButton>
                )}
            </div>
        </Page>
    );
};

export default ConnectionErrorPage;
