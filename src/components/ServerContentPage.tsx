// React 核心 hooks
import { FunctionComponent, useEffect } from 'react';
// React Router 用于获取当前路由位置信息
import { useLocation } from 'react-router-dom';

// 视图管理器，负责动态加载和管理页面视图
import viewManager from './viewManager/viewManager';
// 全球化工具，用于翻译 HTML 内容
import globalize from 'lib/globalize';
// 服务器连接管理器
import { ServerConnections } from 'lib/jellyfin-apiclient';
// 视图恢复失败响应的类型定义
import type { RestoreViewFailResponse } from 'types/viewManager';

// 服务器内容页面的属性接口
interface ServerContentPageProps {
    view: string // 视图路径，用于从服务器获取页面内容
}

/**
 * 服务器内容页面组件
 *
 * 该组件负责从服务器请求获取 HTML 内容并渲染。
 * 使用 ViewManager 动态加载和执行页面的 JavaScript 代码。
 *
 * Page component that renders html content from a server request.
 * Uses the ViewManager to dynamically load and execute the page JS.
 */
const ServerContentPage: FunctionComponent<ServerContentPageProps> = ({ view }) => {
    // 获取当前路由位置信息（路径、搜索参数、状态等）
    const location = useLocation();

    useEffect(() => {
        // 加载页面的核心函数
        const loadPage = () => {
            // 构建视图选项配置
            const viewOptions = {
                url: location.pathname + location.search, // 完整的 URL 路径（包含查询参数）
                state: location.state, // 路由状态
                autoFocus: false, // 禁用自动聚焦
                options: {
                    supportsThemeMedia: false, // 不支持主题媒体
                    enableMediaControl: true // 启用媒体控制
                }
            };

            // 尝试恢复之前的视图（如果存在）
            viewManager.tryRestoreView(viewOptions)
                .catch(async (result?: RestoreViewFailResponse) => {
                    // 如果恢复失败且未被取消，则从服务器获取新视图
                    if (!result?.cancelled) {
                        // 获取当前的 API 客户端连接
                        const apiClient = ServerConnections.currentApiClient();

                        // 从服务器获取视图 HTML 并翻译
                        // Fetch the view html from the server and translate it
                        const viewHtml = await apiClient?.get(apiClient.getUrl(view + location.search))
                            .then((html: string) => globalize.translateHtml(html));

                        // 加载新视图（包含翻译后的 HTML 内容）
                        viewManager.loadView({
                            ...viewOptions,
                            view: viewHtml
                        });
                    }
                });
        };

        loadPage();
    },
    // 注意：location.state 未包含在依赖项中
    // 因为对话框会更新状态，但当前视图保持不变
    // location.state is NOT included as a dependency here since dialogs will update state while the current view stays the same
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ // useEffect 的依赖项数组
        view, // 视图路径
        location.pathname, // URL 路径名
        location.search // URL 查询参数
    ]);

    // 此组件不渲染任何 DOM 元素，视图由 viewManager 动态管理
    return null;
};

export default ServerContentPage;
