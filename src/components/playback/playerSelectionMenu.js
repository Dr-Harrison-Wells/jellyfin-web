import { AppFeature } from 'constants/appFeature';
import Events from '../../utils/events.ts';
import browser from '../../scripts/browser';
import loading from '../loading/loading';
import { playbackManager } from '../playback/playbackmanager';
import { pluginManager } from '../pluginManager';
import { appRouter } from '../router/appRouter';
import globalize from '../../lib/globalize';
import { appHost } from '../apphost';
import { enable, isEnabled } from '../../scripts/autocast';
import '../../elements/emby-checkbox/emby-checkbox';
import '../../elements/emby-button/emby-button';
import dialog from '../dialog/dialog';
import dialogHelper from '../dialogHelper/dialogHelper';

// 播放器选择菜单：
// - 本地播放器时：列出可用播放目标（本机/远端播放器/投屏）供用户选择
// - 当前已连接远端播放器时：展示“活动播放器”菜单（镜像/自动投屏/遥控/断开连接）

function getTargetSecondaryText(target) {
    // 次要信息（第二行小字），优先显示该目标所属用户（如果有）
    if (target.user) {
        return target.user.Name;
    }

    return null;
}

function getIcon(target) {
    // 根据目标设备类型返回对应图标名；若是本地播放器则按当前浏览器环境推断设备类型
    let deviceType = target.deviceType;

    if (!deviceType && target.isLocalPlayer) {
        // 本地播放器：用 user-agent 信息推断设备类型
        if (browser.tv) {
            deviceType = 'tv';
        } else if (browser.mobile) {
            deviceType = 'smartphone';
        } else {
            deviceType = 'desktop';
        }
    }

    if (!deviceType) {
        deviceType = 'tv';
    }

    switch (deviceType) {
        case 'smartphone':
            return 'smartphone';
        case 'tablet':
            return 'tablet';
        case 'tv':
            return 'tv';
        case 'cast':
            return 'cast';
        case 'desktop':
            return 'computer';
        default:
            return 'tv';
    }
}

export function show(button) {
    // 弹出“播放到/投放到”菜单。
    // 如果当前已处于远端播放（非本地播放器），则显示活动播放器菜单而不是目标列表。
    const currentPlayerInfo = playbackManager.getPlayerInfo();

    if (currentPlayerInfo && !currentPlayerInfo.isLocalPlayer) {
        showActivePlayerMenu(currentPlayerInfo);
        return;
    }

    const currentPlayerId = currentPlayerInfo ? currentPlayerInfo.id : null;

    loading.show();

    playbackManager.getTargets().then(function (targets) {
        // 将播放目标映射为 ActionSheet 的 items
        const menuItems = targets.map(function (t) {
            let name = t.name;

            if (t.appName && t.appName !== t.name) {
                name += ' - ' + t.appName;
            }

            return {
                name: name,
                id: t.id,
                selected: currentPlayerId === t.id,
                secondaryText: getTargetSecondaryText(t),
                icon: getIcon(t)
            };
        });

        import('../actionSheet/actionSheet').then((actionsheet) => {
            loading.hide();

            const menuOptions = {
                title: globalize.translate('HeaderPlayOn'),
                items: menuItems,
                positionTo: button,

                resolveOnClick: true,
                border: true
            };

            // Unfortunately we can't allow the url to change or chromecast will throw a security error
            // Might be able to solve this in the future by moving the dialogs to hashbangs
            // 中文说明：Chromecast 对 URL 变化很敏感，弹出菜单期间若触发 history 改变可能导致安全错误。
            // 因此在不支持“投屏菜单 hash 变更”的环境下，禁用对话框引起的 history 变更。
            if (!(!browser.chrome && !browser.edgeChromium || appHost.supports(AppFeature.CastMenuHashChange))) {
                menuOptions.enableHistory = false;
            }

            // Add message when Google Cast is not supported
            const isChromecastPluginLoaded = !!pluginManager.plugins.find(plugin => plugin.id === 'chromecast');
            // TODO: Add other checks for support (Android app, secure context, etc)
            if (!isChromecastPluginLoaded) {
                // 未加载 chromecast 插件时，给用户一个明确提示（但仍展示菜单，以免影响其他目标）
                menuOptions.text = `(${globalize.translate('GoogleCastUnsupported')})`;
            }

            actionsheet.show(menuOptions).then(function (id) {
                // resolveOnClick=true：点击 item 后直接 resolve 对应的 id
                const target = targets.filter(function (t) {
                    return t.id === id;
                })[0];

                // 将该目标设置为活动播放器（后续播放会切换到此目标）
                playbackManager.trySetActivePlayer(target.playerName, target);
            }).catch(() => {
                // action sheet closed
            });
        }).catch(err => {
            console.error('[playerSelectionMenu] failed to import action sheet', err);
        });
    }).catch(err => {
        console.error('[playerSelectionMenu] failed to get playback targets', err);
    });
}

function showActivePlayerMenu(playerInfo) {
    // 当前存在“活动播放器”（远端播放器）时的菜单入口
    showActivePlayerMenuInternal(playerInfo);
}

function disconnectFromPlayer(currentDeviceName) {
    // 从当前远端播放器断开。
    // 若播放器支持 EndSession，则提示用户是否结束远端会话；否则直接切回默认播放器。
    if (playbackManager.getSupportedCommands().indexOf('EndSession') !== -1) {
        const menuItems = [];

        menuItems.push({
            name: globalize.translate('Yes'),
            id: 'yes'
        });
        menuItems.push({
            name: globalize.translate('No'),
            id: 'no'
        });

        dialog.show({
            buttons: menuItems,
            text: globalize.translate('ConfirmEndPlayerSession', currentDeviceName)

        }).then(function (id) {
            switch (id) {
                case 'yes':
                    // 用户确认：结束远端会话，并切回默认播放器
                    playbackManager.getCurrentPlayer().endSession();
                    playbackManager.setDefaultPlayerActive();
                    break;
                case 'no':
                    // 用户取消结束会话：仍切回默认播放器（相当于本机不再控制该远端播放器）
                    playbackManager.setDefaultPlayerActive();
                    break;
                default:
                    break;
            }
        }).catch(() => {
            // dialog closed
        });
    } else {
        // 不支持结束会话：只能本地切回默认播放器
        playbackManager.setDefaultPlayerActive();
    }
}

function showActivePlayerMenuInternal(playerInfo) {
    // 构造并打开“活动播放器”对话框（非 modal），提供：
    // - 显示镜像（若支持 DisplayContent）
    // - 自动投屏（AutoCast）
    // - 进入遥控/正在播放界面
    // - 断开连接
    let html = '';

    const dialogOptions = {
        removeOnClose: true
    };

    dialogOptions.modal = false;
    dialogOptions.entryAnimationDuration = 160;
    dialogOptions.exitAnimationDuration = 160;
    dialogOptions.autoFocus = false;

    const dlg = dialogHelper.createDialog(dialogOptions);

    dlg.classList.add('promptDialog');

    const currentDeviceName = (playerInfo.deviceName || playerInfo.name);

    html += '<div class="promptDialogContent" style="padding:1.5em;">';
    html += '<h2 style="margin-top:.5em;">';
    html += currentDeviceName;
    html += '</h2>';

    html += '<div>';

    if (playerInfo.supportedCommands.indexOf('DisplayContent') !== -1) {
        // 仅当播放器声明支持 DisplayContent 时才显示“启用显示镜像”开关
        html += '<label class="checkboxContainer">';
        const checkedHtml = playbackManager.enableDisplayMirroring() ? ' checked' : '';
        html += '<input type="checkbox" is="emby-checkbox" class="chkMirror"' + checkedHtml + '/>';
        html += '<span>' + globalize.translate('EnableDisplayMirroring') + '</span>';
        html += '</label>';
    }

    html += '</div>';

    html += '<div><label class="checkboxContainer">';
    const checkedHtmlAC = isEnabled() ? ' checked' : '';
    html += '<input type="checkbox" is="emby-checkbox" class="chkAutoCast"' + checkedHtmlAC + '/>';
    html += '<span>' + globalize.translate('EnableAutoCast') + '</span>';
    html += '</label></div>';

    html += '<div style="margin-top:1em;display:flex;justify-content: flex-end;">';

    html += '<button is="emby-button" type="button" class="button-flat btnRemoteControl promptDialogButton">' + globalize.translate('HeaderRemoteControl') + '</button>';
    html += '<button is="emby-button" type="button" class="button-flat btnDisconnect promptDialogButton ">' + globalize.translate('Disconnect') + '</button>';
    html += '<button is="emby-button" type="button" class="button-flat btnCancel promptDialogButton">' + globalize.translate('ButtonCancel') + '</button>';
    html += '</div>';

    html += '</div>';
    dlg.innerHTML = html;

    const chkMirror = dlg.querySelector('.chkMirror');

    if (chkMirror) {
        // 同步“显示镜像”开关到 playbackManager
        chkMirror.addEventListener('change', onMirrorChange);
    }

    const chkAutoCast = dlg.querySelector('.chkAutoCast');

    if (chkAutoCast) {
        // 同步“自动投屏”开关到 autocast 模块
        chkAutoCast.addEventListener('change', onAutoCastChange);
    }

    let destination = '';
    // 对话框关闭后通过 destination 决定后续动作（避免在对话框仍打开时进行路由跳转/状态切换）

    const btnRemoteControl = dlg.querySelector('.btnRemoteControl');
    if (btnRemoteControl) {
        btnRemoteControl.addEventListener('click', function () {
            destination = 'nowplaying';
            dialogHelper.close(dlg);
        });
    }

    dlg.querySelector('.btnDisconnect').addEventListener('click', function () {
        destination = 'disconnectFromPlayer';
        dialogHelper.close(dlg);
    });

    dlg.querySelector('.btnCancel').addEventListener('click', function () {
        dialogHelper.close(dlg);
    });

    dialogHelper.open(dlg).then(function () {
        // 对话框关闭后再执行导航/断开，避免 UI 状态竞争
        if (destination === 'nowplaying') {
            return appRouter.showNowPlaying();
        } else if (destination === 'disconnectFromPlayer') {
            disconnectFromPlayer(currentDeviceName);
        }
    }).catch(() => {
        // dialog closed
    });
}

function onMirrorChange() {
    // 镜像开关：根据勾选状态启用/禁用显示镜像
    playbackManager.enableDisplayMirroring(this.checked);
}

function onAutoCastChange() {
    // 自动投屏开关：根据勾选状态启用/禁用 AutoCast
    enable(this.checked);
}

Events.on(playbackManager, 'pairing', function () {
    loading.show();
});

Events.on(playbackManager, 'paired', function () {
    loading.hide();
});

Events.on(playbackManager, 'pairerror', function () {
    loading.hide();
});

export default {
    show: show
};
