import serverNotifications from '../../scripts/serverNotifications';
import { playbackManager } from '../playback/playbackmanager';
import Events from '../../utils/events.ts';
import globalize from '../../lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { getItems } from '../../utils/jellyfin-apiclient/getItems.ts';

import NotificationIcon from './notificationicon.png';

function onOneDocumentClick() {
    // 仅在用户与页面发生一次交互后请求通知权限（多数浏览器要求“用户手势”才能弹权限框）
    document.removeEventListener('click', onOneDocumentClick);
    document.removeEventListener('keydown', onOneDocumentClick);

    // don't request notification permissions if they're already granted or denied
    if (window.Notification && window.Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function registerOneDocumentClickHandler() {
    // 用户登录后再注册一次性事件：用于触发通知权限请求
    Events.off(ServerConnections, 'localusersignedin', registerOneDocumentClickHandler);

    document.addEventListener('click', onOneDocumentClick);
    document.addEventListener('keydown', onOneDocumentClick);
}

function initPermissionRequest() {
    // 若当前已有 apiClient，则先确认已获取到用户信息；否则等待本地用户登录事件
    const apiClient = ServerConnections.currentApiClient();
    if (apiClient) {
        apiClient.getCurrentUser()
            .then(() => registerOneDocumentClickHandler())
            .catch(() => {
                Events.on(ServerConnections, 'localusersignedin', registerOneDocumentClickHandler);
            });
    } else {
        registerOneDocumentClickHandler();
    }
}

initPermissionRequest();

let serviceWorkerRegistration;

function closeAfter(notification, timeoutMs) {
    // 指定时间后关闭非持久化通知（不同浏览器的 API 名称可能不同：close/cancel）
    setTimeout(function () {
        if (notification.close) {
            notification.close();
        } else if (notification.cancel) {
            notification.cancel();
        }
    }, timeoutMs);
}

function resetRegistration() {
    // 尝试获取 Service Worker 注册对象：存在时可以用“持久化通知”（Notification via SW）
    /* eslint-disable-next-line compat/compat */
    const serviceWorker = navigator.serviceWorker;
    if (serviceWorker) {
        serviceWorker.ready.then(function (registration) {
            serviceWorkerRegistration = registration;
        });
    }
}

resetRegistration();

function showPersistentNotification(title, options) {
    // 通过 Service Worker 显示持久化通知（更可靠，且可与 SW click 事件配合）
    serviceWorkerRegistration.showNotification(title, options);
}

function showNonPersistentNotification(title, options, timeoutMs) {
    // 直接使用浏览器 Notification API 显示通知（非持久化；在某些场景下可能不稳定）
    try {
        const notif = new Notification(title, options); /* eslint-disable-line compat/compat */

        if (notif.show) {
            notif.show();
        }

        if (timeoutMs) {
            closeAfter(notif, timeoutMs);
        }
    } catch (err) {
        // 某些浏览器/平台不支持 actions；失败时移除 actions 后重试
        if (options.actions) {
            options.actions = [];
            showNonPersistentNotification(title, options, timeoutMs);
        } else {
            throw err;
        }
    }
}

function showNotification(options, timeoutMs, apiClient) {
    // 统一通知入口：补齐 data/icon/badge，并优先走 SW 持久化通知，否则降级为普通通知
    const title = options.title;

    options.data = options.data || {};
    options.data.serverId = apiClient.serverInfo().Id;
    options.icon = options.icon || NotificationIcon;
    options.badge = options.badge || NotificationIcon;

    resetRegistration();

    if (serviceWorkerRegistration) {
        showPersistentNotification(title, options);
        return;
    }

    showNonPersistentNotification(title, options, timeoutMs);
}

function showNewItemNotification(item, apiClient) {
    // 本地正在播放视频时避免打扰（尤其是电视端/浏览器全屏）
    if (playbackManager.isPlayingLocally(['Video'])) {
        return;
    }

    let body = item.Name;

    if (item.SeriesName) {
        body = item.SeriesName + ' - ' + body;
    }

    const notification = {
        title: 'New ' + item.Type,
        body: body,
        vibrate: true,
        tag: 'newItem' + item.Id,
        data: {}
    };

    const imageTags = item.ImageTags || {};

    if (imageTags.Primary) {
        notification.icon = apiClient.getScaledImageUrl(item.Id, {
            width: 80,
            tag: imageTags.Primary,
            type: 'Primary'
        });
    }

    showNotification(notification, 15000, apiClient);
}

function onLibraryChanged(data, apiClient) {
    // 处理服务器推送的“库发生变化”事件：拉取新增媒体并逐条弹出通知
    const newItems = data.ItemsAdded;

    if (!newItems.length) {
        return;
    }

    // Don't put a massive number of Id's onto the query string
    if (newItems.length > 12) {
        newItems.length = 12;
    }

    getItems(apiClient, apiClient.getCurrentUserId(), {

        Recursive: true,
        Limit: 3,
        Filters: 'IsNotFolder',
        SortBy: 'DateCreated',
        SortOrder: 'Descending',
        Ids: newItems.join(','),
        MediaTypes: 'Audio,Video',
        EnableTotalRecordCount: false

    }).then(function (result) {
        const items = result.Items;

        for (const item of items) {
            showNewItemNotification(item, apiClient);
        }
    });
}

function showPackageInstallNotification(apiClient, installation, status) {
    // 插件/包安装状态通知：仅管理员可见
    apiClient.getCurrentUser().then(function (user) {
        if (!user.Policy.IsAdministrator) {
            return;
        }

        const notification = {
            tag: 'install' + installation.Id,
            data: {}
        };

        if (status === 'completed') {
            notification.title = globalize.translate('PackageInstallCompleted', installation.Name, installation.Version);
            notification.vibrate = true;
        } else if (status === 'cancelled') {
            notification.title = globalize.translate('PackageInstallCancelled', installation.Name, installation.Version);
        } else if (status === 'failed') {
            notification.title = globalize.translate('PackageInstallFailed', installation.Name, installation.Version);
            notification.vibrate = true;
        } else if (status === 'progress') {
            notification.title = globalize.translate('InstallingPackage', installation.Name, installation.Version);

            notification.actions =
                [
                    {
                        action: 'cancel-install',
                        title: globalize.translate('ButtonCancel'),
                        icon: NotificationIcon
                    }
                ];

            notification.data.id = installation.id;
        }

        if (status === 'progress') {
            const percentComplete = Math.round(installation.PercentComplete || 0);

            notification.body = percentComplete + '% complete.';
        }

        const timeout = status === 'cancelled' ? 5000 : 0;

        showNotification(notification, timeout, apiClient);
    });
}

Events.on(serverNotifications, 'LibraryChanged', function (e, apiClient, data) {
    // 新增媒体：从新增 Id 列表回查详情并发通知
    onLibraryChanged(data, apiClient);
});

Events.on(serverNotifications, 'PackageInstallationCompleted', function (e, apiClient, data) {
    // 安装完成
    showPackageInstallNotification(apiClient, data, 'completed');
});

Events.on(serverNotifications, 'PackageInstallationFailed', function (e, apiClient, data) {
    // 安装失败
    showPackageInstallNotification(apiClient, data, 'failed');
});

Events.on(serverNotifications, 'PackageInstallationCancelled', function (e, apiClient, data) {
    // 安装取消
    showPackageInstallNotification(apiClient, data, 'cancelled');
});

Events.on(serverNotifications, 'PackageInstalling', function (e, apiClient, data) {
    // 安装中（带取消动作）
    showPackageInstallNotification(apiClient, data, 'progress');
});

Events.on(serverNotifications, 'ServerShuttingDown', function (e, apiClient) {
    // 服务器即将关机
    const serverId = apiClient.serverInfo().Id;
    const notification = {
        tag: 'restart' + serverId,
        title: globalize.translate('ServerNameIsShuttingDown', apiClient.serverInfo().Name)
    };
    showNotification(notification, 0, apiClient);
});

Events.on(serverNotifications, 'ServerRestarting', function (e, apiClient) {
    // 服务器正在重启
    const serverId = apiClient.serverInfo().Id;
    const notification = {
        tag: 'restart' + serverId,
        title: globalize.translate('ServerNameIsRestarting', apiClient.serverInfo().Name)
    };
    showNotification(notification, 0, apiClient);
});

Events.on(serverNotifications, 'RestartRequired', function (e, apiClient) {
    // 服务器需要重启：展示带“重启”动作的通知（由 SW/通知点击处理具体 action）
    const serverId = apiClient.serverInfo().Id;
    const notification = {
        tag: 'restart' + serverId,
        title: globalize.translate('PleaseRestartServerName', apiClient.serverInfo().Name)
    };

    notification.actions =
        [
            {
                action: 'restart',
                title: globalize.translate('Restart'),
                icon: NotificationIcon
            }
        ];

    showNotification(notification, 0, apiClient);
});

