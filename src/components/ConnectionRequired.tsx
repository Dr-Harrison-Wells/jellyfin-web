// React 核心库和 Hooks
import React, { FunctionComponent, useCallback, useEffect, useState } from 'react';
// React Router 用于路由导航
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
// Jellyfin API 客户端类型定义
import type { ApiClient, ConnectResponse } from 'jellyfin-apiclient';

// Jellyfin API 客户端连接状态和服务端连接管理
import { ConnectionState, ServerConnections } from 'lib/jellyfin-apiclient';

// 连接错误页面组件
import ConnectionErrorPage from './ConnectionErrorPage';
// 加载中组件
import Loading from './loading/LoadingComponent';

/**
 * 访问级别枚举
 * 定义了不同页面所需的访问权限级别
 */
enum AccessLevel {
    /** 需要管理员权限的用户 */
    Admin = 'admin',
    /** 无访问限制，公开访问 */
    Public = 'public',
    /** 需要有效的用户会话 */
    User = 'user',
    /** 需要启动向导未完成 */
    Wizard = 'wizard'
};

// 访问级别值的字符串类型
type AccessLevelValue = `${AccessLevel}`;

/**
 * 跳转路由枚举
 * 定义了各种重定向场景下的目标路由路径
 */
enum BounceRoutes {
    /** 主页路由 */
    Home = '/home',
    /** 登录页路由 */
    Login = '/login',
    /** 选择服务器页路由 */
    SelectServer = '/selectserver',
    /** 启动向导页路由 */
    StartWizard = '/wizard/start'
}

/**
 * ConnectionRequired 组件的属性类型
 */
type ConnectionRequiredProps = {
    /** 访问级别，默认为 'user' */
    level?: AccessLevelValue
};

/**
 * 获取公开的系统信息
 * @param apiClient - API 客户端实例
 * @returns 返回系统公开信息的 Promise
 * @throws 当请求失败时抛出错误
 */
const fetchPublicSystemInfo = async (apiClient: ApiClient) => {
    const infoResponse = await fetch(
        `${apiClient.serverAddress()}/System/Info/Public`,
        { cache: 'no-cache' }
    );

    if (!infoResponse.ok) {
        throw new Error('Public system info request failed');
    }

    return infoResponse.json();
};

/**
 * 连接验证组件
 * 确保与服务端的连接已建立。
 * 额外的参数用于验证用户或管理员是否已认证。
 * 如果验证条件失败，此组件将导航到相应的页面。
 */
const ConnectionRequired: FunctionComponent<ConnectionRequiredProps> = ({
    level = 'user'
}) => {
    const navigate = useNavigate();
    const location = useLocation();

    const [ errorState, setErrorState ] = useState<ConnectionState>();
    const [ isLoading, setIsLoading ] = useState(true);

    /**
     * 条件导航函数
     * 如果目标路由不是当前路由，则进行导航；否则停止加载状态
     * @param route - 目标路由
     */
    const navigateIfNotThere = useCallback((route: BounceRoutes) => {
        // 如果尝试导航到当前路由，只需设置 isLoading = false
        if (location.pathname === route) setIsLoading(false);
        // 否则导航到目标路由
        else navigate(route);
    }, [ location.pathname, navigate ]);

    /**
     * 根据连接响应状态跳转到相应页面
     * @param connectionResponse - 连接响应对象
     */
    const bounce = useCallback(async (connectionResponse: ConnectResponse) => {
        switch (connectionResponse.State) {
            case ConnectionState.SignedIn:
                // 已经登录，跳转到主页
                console.debug('[ConnectionRequired] already logged in, redirecting to home');
                navigate(BounceRoutes.Home);
                return;
            case ConnectionState.ServerSignIn:
                // 跳转到登录页面
                if (location.pathname === BounceRoutes.Login) {
                    setIsLoading(false);
                } else {
                    console.debug('[ConnectionRequired] not logged in, redirecting to login page', location);
                    // 编码当前 URL，以便登录后可以返回
                    const url = encodeURIComponent(location.pathname + location.search);
                    navigate(`${BounceRoutes.Login}?serverid=${connectionResponse.ApiClient.serverId()}&url=${url}`);
                }
                return;
            case ConnectionState.ServerSelection:
                // 跳转到选择服务器页面
                console.debug('[ConnectionRequired] redirecting to select server page');
                navigateIfNotThere(BounceRoutes.SelectServer);
                return;
        }

        // 未处理的连接状态
        console.warn('[ConnectionRequired] unhandled connection state', connectionResponse.State);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ navigateIfNotThere, location.pathname, navigate ]);

    /**
     * 处理启动向导流程
     * 检查向导是否已完成，如果已完成则跳转到主页
     * @param firstConnection - 首次连接响应对象（可能为 null）
     */
    const handleWizard = useCallback(async (firstConnection: ConnectResponse | null) => {
        const apiClient = firstConnection?.ApiClient || ServerConnections.currentApiClient();
        if (!apiClient) {
            throw new Error('No ApiClient available');
        }

        const systemInfo = await fetchPublicSystemInfo(apiClient);
        if (systemInfo?.StartupWizardCompleted) {
            // 启动向导已完成，重定向到主页
            console.info('[ConnectionRequired] startup wizard is complete, redirecting home');
            navigate(BounceRoutes.Home);
            return;
        }

        // 更新当前的 ApiClient
        ServerConnections.setLocalApiClient(apiClient);
        setIsLoading(false);
    }, [ navigate ]);

    /**
     * 处理未完成的启动向导
     * 检查向导状态，如果未完成则跳转到向导页面，否则执行正常的跳转流程
     * @param firstConnection - 首次连接响应对象
     */
    const handleIncompleteWizard = useCallback(async (firstConnection: ConnectResponse) => {
        if (firstConnection.State === ConnectionState.ServerSignIn) {
            // 验证向导是否完成
            try {
                const systemInfo = await fetchPublicSystemInfo(firstConnection.ApiClient);
                if (!systemInfo?.StartupWizardCompleted) {
                    // 更新当前的 ApiClient
                    // TODO: 是否有更好的地方来处理这个？
                    ServerConnections.setLocalApiClient(firstConnection.ApiClient);
                    // 跳转到向导页面
                    console.info('[ConnectionRequired] startup wizard is not complete, redirecting there');
                    navigate(BounceRoutes.StartWizard);
                    return;
                }
            } catch (ex) {
                console.error('[ConnectionRequired] checking wizard status failed', ex);
                return;
            }
        }

        // 跳转到登录流程中的正确页面
        bounce(firstConnection)
            .catch(err => {
                console.error('[ConnectionRequired] failed to bounce', err);
            });
    }, [bounce, navigate]);

    /**
     * 验证用户访问权限
     * 根据路由的访问级别要求，检查用户是否已登录以及是否具有所需权限
     */
    const validateUserAccess = useCallback(async () => {
        const client = ServerConnections.currentApiClient();

        // 如果这是用户路由，确保用户已登录
        if ((level === AccessLevel.Admin || level === AccessLevel.User) && !client?.isLoggedIn()) {
            try {
                console.warn('[ConnectionRequired] unauthenticated user attempted to access user route');
                bounce(await ServerConnections.connect())
                    .catch(err => {
                        console.error('[ConnectionRequired] failed to bounce', err);
                    });
            } catch (ex) {
                console.warn('[ConnectionRequired] error bouncing from user route', ex);
            }
            return;
        }

        // 如果这是管理员路由，确保用户具有管理员权限
        if (level === AccessLevel.Admin) {
            try {
                const user = await client?.getCurrentUser();
                if (!user?.Policy?.IsAdministrator) {
                    console.warn('[ConnectionRequired] normal user attempted to access admin route');
                    bounce(await ServerConnections.connect())
                        .catch(err => {
                            console.error('[ConnectionRequired] failed to bounce', err);
                        });
                    return;
                }
            } catch (ex) {
                console.warn('[ConnectionRequired] error bouncing from admin route', ex);
                return;
            }
        }

        setIsLoading(false);
    }, [bounce, level]);

    /**
     * 组件挂载时检查连接状态
     * 根据连接状态和访问级别要求，执行相应的验证和跳转逻辑
     */
    useEffect(() => {
        // 在页面初始加载时检查连接状态
        const apiClient = ServerConnections.currentApiClient();
        const connection = Promise.resolve(ServerConnections.firstConnection ? null : ServerConnections.connect());
        connection.then(firstConnection => {
            console.debug('[ConnectionRequired] connection state', firstConnection?.State);
            ServerConnections.firstConnection = true;

            // 检查是否需要服务器更新或服务器不可用
            if ([ ConnectionState.ServerUpdateNeeded, ConnectionState.Unavailable ].includes(firstConnection?.State)) {
                setErrorState(firstConnection.State);
            } else if (level === AccessLevel.Wizard) {
                // 处理向导访问级别
                handleWizard(firstConnection)
                    .catch(err => {
                        console.error('[ConnectionRequired] could not validate wizard status', err);
                    });
            } else if (
                firstConnection && firstConnection.State !== ConnectionState.SignedIn && !apiClient?.isLoggedIn()
            ) {
                // 处理未完成登录的情况
                handleIncompleteWizard(firstConnection)
                    .catch(err => {
                        console.error('[ConnectionRequired] could not start wizard', err);
                    });
            } else {
                // 验证用户访问权限
                validateUserAccess()
                    .catch(err => {
                        console.error('[ConnectionRequired] could not validate user access', err);
                    });
            }
        }).catch(err => {
            console.error('[ConnectionRequired] failed to connect', err);
        });
    }, [handleIncompleteWizard, handleWizard, level, validateUserAccess]);

    // 如果存在错误状态，显示错误页面
    if (errorState) {
        return <ConnectionErrorPage state={errorState} />;
    }

    // 如果正在加载，显示加载组件
    if (isLoading) {
        return <Loading />;
    }

    // 验证通过，渲染子路由
    return <Outlet />;
};

export default ConnectionRequired;
