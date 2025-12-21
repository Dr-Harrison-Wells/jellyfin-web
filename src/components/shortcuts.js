/**
 * Module shortcuts.
 * @module components/shortcuts
 */
import { getPlaylistsApi } from '@jellyfin/sdk/lib/utils/api/playlists-api';

import { playbackManager } from './playback/playbackmanager';
import inputManager from '../scripts/inputManager';
import { appRouter } from './router/appRouter';
import globalize from '../lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import dom from '../scripts/dom';
import recordingHelper from './recordingcreator/recordinghelper';
import toast from './toast/toast';
import * as userSettings from '../scripts/settings/userSettings';
import { toApi } from 'utils/jellyfin-apiclient/compat';

/**
 * 从当前卡片位置开始播放或加入队列
 * @param {HTMLElement} card - 当前卡片元素
 * @param {string} serverId - 服务器ID
 * @param {boolean} queue - 是否加入队列（true）或直接播放（false）
 * @returns {Promise} 播放或加入队列的Promise
 */
function playAllFromHere(card, serverId, queue) {
    // 获取父节点和相同类名的所有卡片
    const parent = card.parentNode;
    const className = card.classList.length ? (`.${card.classList[0]}`) : '';
    const cards = parent.querySelectorAll(`${className}[data-id]`);

    const ids = [];

    let foundCard = false;
    let startIndex;

    // 遍历所有卡片，从当前卡片开始收集ID
    for (let i = 0, length = cards.length; i < length; i++) {
        if (cards[i] === card) {
            foundCard = true; // 找到当前卡片
            startIndex = i;
        }
        // 如果已找到当前卡片或不是队列模式，则收集ID
        if (foundCard || !queue) {
            ids.push(cards[i].getAttribute('data-id'));
        }
    }

    // 如果容器支持动态获取数据，则使用容器的fetchData方法
    const itemsContainer = dom.parentWithClass(card, 'itemsContainer');
    if (itemsContainer?.fetchData) {
        const queryOptions = queue ? { StartIndex: startIndex } : {};

        return itemsContainer.fetchData(queryOptions).then(result => {
            if (queue) {
                // 加入播放队列
                return playbackManager.queue({
                    items: result.Items
                });
            } else {
                // 直接播放
                return playbackManager.play({
                    items: result.Items,
                    startIndex: startIndex
                });
            }
        });
    }

    if (!ids.length) {
        return;
    }

    if (queue) {
        return playbackManager.queue({
            ids: ids,
            serverId: serverId
        });
    } else {
        return playbackManager.play({
            ids: ids,
            serverId: serverId,
            startIndex: startIndex
        });
    }
}

/**
 * 显示节目录制对话框
 * @param {Object} item - 节目项目对象
 */
function showProgramDialog(item) {
    // 动态导入录制创建器组件
    import('./recordingcreator/recordingcreator').then(({ default:recordingCreator }) => {
        recordingCreator.show(item.Id, item.ServerId);
    });
}

/**
 * 根据按钮元素获取对应的项目信息
 * @param {HTMLElement} button - 按钮元素
 * @returns {Promise} 返回项目数据的Promise
 */
function getItem(button) {
    // 查找包含data-id属性的父元素
    button = dom.parentWithAttribute(button, 'data-id');
    const serverId = button.getAttribute('data-serverid');
    const id = button.getAttribute('data-id');
    const type = button.getAttribute('data-type');

    const apiClient = ServerConnections.getApiClient(serverId);

    // 根据不同类型调用不同的API
    if (type === 'Timer') {
        return apiClient.getLiveTvTimer(id);
    }
    if (type === 'SeriesTimer') {
        return apiClient.getLiveTvSeriesTimer(id);
    }
    return apiClient.getItem(apiClient.getCurrentUserId(), id);
}

/**
 * 通知容器需要刷新
 * @param {HTMLElement} childElement - 子元素
 * @param {HTMLElement} itemsContainer - 项目容器（可选）
 */
function notifyRefreshNeeded(childElement, itemsContainer) {
    // 如果未提供容器，则查找最近的emby-itemscontainer
    itemsContainer = itemsContainer || dom.parentWithAttribute(childElement, 'is', 'emby-itemscontainer');

    if (itemsContainer) {
        itemsContainer.notifyRefreshNeeded(true);
    }
}

/**
 * 显示项目的上下文菜单
 * @param {HTMLElement} card - 卡片元素
 * @param {Object} options - 菜单选项配置
 */
function showContextMenu(card, options = {}) {
    getItem(card).then(item => {
        // 获取播放列表ID和收藏ID
        const playlistId = card.getAttribute('data-playlistid');
        const collectionId = card.getAttribute('data-collectionid');

        // 如果是播放列表项，设置播放列表相关信息
        if (playlistId) {
            const elem = dom.parentWithAttribute(card, 'data-playlistitemid');
            item.PlaylistItemId = elem ? elem.getAttribute('data-playlistitemid') : null;

            const itemsContainer = dom.parentWithAttribute(card, 'is', 'emby-itemscontainer');
            if (itemsContainer) {
                // 计算项目在播放列表中的索引和总数
                let index = 0;
                for (const listItem of itemsContainer.querySelectorAll('.listItem')) {
                    const playlistItemId = listItem.getAttribute('data-playlistitemid');
                    if (playlistItemId == item.PlaylistItemId) {
                        item.PlaylistIndex = index;
                    }
                    index++;
                }
                item.PlaylistItemCount = index;
            }
        }

        const apiClient = ServerConnections.getApiClient(item.ServerId);
        const api = toApi(apiClient);

        // 并行获取菜单组件、用户信息和播放列表权限
        Promise.all([
            // 导入项目菜单组件
            import('./itemContextMenu'),
            // 获取当前用户
            apiClient.getCurrentUser(),
            // 如果项目是播放列表的一部分，获取播放列表权限
            playlistId ?
                getPlaylistsApi(api)
                    .getPlaylistUser({
                        playlistId,
                        userId: apiClient.getCurrentUserId()
                    })
                    .then(({ data }) => data)
                    .catch(err => {
                        // If a user doesn't have access, then the request will 404 and throw
                        console.info('[Shortcuts] Failed to fetch playlist permissions', err);
                        return { CanEdit: false };
                    }) :
                // Not a playlist item
                Promise.resolve({ CanEdit: false })
        ])
            .then(([
                itemContextMenu,
                user,
                playlistPerms
            ]) => {
                return itemContextMenu.show({
                    item,
                    play: true,
                    queue: true,
                    playAllFromHere: item.Type === 'Season' || !item.IsFolder,
                    queueAllFromHere: !item.IsFolder,
                    playlistId,
                    canEditPlaylist: !!playlistPerms.CanEdit,
                    collectionId,
                    user,
                    ...options
                });
            })
            .then(result => {
                if (result.command === 'playallfromhere' || result.command === 'queueallfromhere') {
                    executeAction(card, options.positionTo, result.command);
                } else if (result.updated || result.deleted) {
                    notifyRefreshNeeded(card, options.itemsContainer);
                }
            })
            .catch(() => { /* no-op */ });
    });
}

/**
 * 从卡片元素中提取项目信息
 * @param {HTMLElement} card - 卡片元素
 * @returns {Object} 项目信息对象
 */
function getItemInfoFromCard(card) {
    return {
        Type: card.getAttribute('data-type'), // 项目类型
        Id: card.getAttribute('data-id'), // 项目ID
        TimerId: card.getAttribute('data-timerid'), // 定时器ID
        CollectionType: card.getAttribute('data-collectiontype'), // 收藏类型
        ChannelId: card.getAttribute('data-channelid'), // 频道ID
        SeriesId: card.getAttribute('data-seriesid'), // 系列ID
        ServerId: card.getAttribute('data-serverid'), // 服务器ID
        MediaType: card.getAttribute('data-mediatype'), // 媒体类型
        Path: card.getAttribute('data-path'), // 路径
        IsFolder: card.getAttribute('data-isfolder') === 'true', // 是否为文件夹
        StartDate: card.getAttribute('data-startdate'), // 开始日期
        EndDate: card.getAttribute('data-enddate'), // 结束日期
        UserData: {
            PlaybackPositionTicks: parseInt(card.getAttribute('data-positionticks') || '0', 10) // 播放位置
        }
    };
}

/**
 * 显示播放菜单
 * @param {HTMLElement} card - 卡片元素
 * @param {HTMLElement} target - 目标元素（菜单定位位置）
 */
function showPlayMenu(card, target) {
    const item = getItemInfoFromCard(card);

    // 动态导入播放菜单组件
    import('./playmenu').then((playMenu) => {
        playMenu.show({

            item: item,
            positionTo: target // 菜单显示位置
        });
    });
}

/**
 * 执行卡片的操作命令
 * @param {HTMLElement} card - 卡片元素
 * @param {HTMLElement} target - 目标元素
 * @param {string} action - 操作类型（play, queue, menu等）
 */
function executeAction(card, target, action) {
    target = target || card;

    let id = card.getAttribute('data-id');

    // 如果当前元素没有data-id，则查找父元素
    if (!id) {
        card = dom.parentWithAttribute(card, 'data-id');
        id = card.getAttribute('data-id');
    }

    const item = getItemInfoFromCard(card);

    const itemsContainer = dom.parentWithClass(card, 'itemsContainer');

    // 构建排序父ID用于保存排序设置
    const sortParentId = 'items-' + (item.IsFolder ? item.Id : itemsContainer?.getAttribute('data-parentid')) + '-Folder';

    const serverId = item.ServerId;
    const type = item.Type;

    // 对于节目类型，使用频道ID作为可播放项ID
    const playableItemId = type === 'Program' ? item.ChannelId : item.Id;

    // 照片类型的link操作转换为play操作
    if (item.MediaType === 'Photo' && action === 'link') {
        action = 'play';
    }

    // 根据不同的action类型执行相应操作
    if (action === 'link') {
        // 导航到项目详情页
        appRouter.showItem(item, {
            context: card.getAttribute('data-context'),
            parentId: card.getAttribute('data-parentid')
        });
    } else if (action === 'programdialog') {
        // 显示节目录制对话框
        showProgramDialog(item);
    } else if (action === 'instantmix') {
        // 播放即时混音
        playbackManager.instantMix({
            Id: playableItemId,
            ServerId: serverId
        });
    } else if (action === 'play' || action === 'resume') {
        // 播放或继续播放
        const startPositionTicks = parseInt(card.getAttribute('data-positionticks') || '0', 10);
        const sortValues = userSettings.getSortValuesLegacy(sortParentId, 'SortName');

        if (playbackManager.canPlay(item)) {
            playbackManager.play({
                ids: [playableItemId],
                startPositionTicks: startPositionTicks, // 从上次位置开始播放
                serverId: serverId,
                queryOptions: {
                    SortBy: sortValues.sortBy,
                    SortOrder: sortValues.sortOrder
                }
            });
        } else {
            console.warn('Unable to play item', item);
        }
    } else if (action === 'queue') {
        // 加入播放队列
        if (playbackManager.isPlaying()) {
            playbackManager.queue({
                ids: [playableItemId],
                serverId: serverId
            });
            // 显示提示消息
            toast(globalize.translate('MediaQueued'));
        } else {
            playbackManager.queue({
                ids: [playableItemId],
                serverId: serverId
            });
        }
    } else if (action === 'playallfromhere') {
        // 从此处开始播放所有
        playAllFromHere(card, serverId);
    } else if (action === 'queueallfromhere') {
        // 从此处开始加入队列
        playAllFromHere(card, serverId, true);
    } else if (action === 'setplaylistindex') {
        // 设置播放列表索引
        playbackManager.setCurrentPlaylistItem(card.getAttribute('data-playlistitemid'));
    } else if (action === 'record') {
        // 录制节目
        onRecordCommand(serverId, id, type, card.getAttribute('data-timerid'), card.getAttribute('data-seriestimerid'));
    } else if (action === 'menu') {
        // 显示上下文菜单
        const options = target.getAttribute('data-playoptions') === 'false' ?
            {
                shuffle: false,
                instantMix: false,
                play: false,
                playAllFromHere: false,
                queue: false,
                queueAllFromHere: false
            } :
            {};

        options.positionTo = target;

        showContextMenu(card, options);
    } else if (action === 'playmenu') {
        // 显示播放菜单
        showPlayMenu(card, target);
    } else if (action === 'edit') {
        // 编辑项目
        getItem(target).then(itemToEdit => {
            editItem(itemToEdit, serverId);
        });
    } else if (action === 'playtrailer') {
        // 播放预告片
        getItem(target).then(playTrailer);
    } else if (action === 'addtoplaylist') {
        // 添加到播放列表
        getItem(target).then(addToPlaylist);
    } else if (action === 'custom') {
        const customAction = target.getAttribute('data-customaction');

        card.dispatchEvent(new CustomEvent(`action-${customAction}`, {
            detail: {
                playlistItemId: card.getAttribute('data-playlistitemid')
            },
            cancelable: false,
            bubbles: true
        }));
    }
}

/**
 * 将项目添加到播放列表
 * @param {Object} item - 项目对象
 */
function addToPlaylist(item) {
    // 动态导入播放列表编辑器
    import('./playlisteditor/playlisteditor').then(({ default: PlaylistEditor }) => {
        const playlistEditor = new PlaylistEditor();
        playlistEditor.show({
            items: [item.Id],
            serverId: item.ServerId
        }).catch(() => {
            // 对话框关闭
        });
    }).catch(err => {
        console.error('[addToPlaylist] failed to load playlist editor', err);
    });
}

/**
 * 播放项目的预告片
 * @param {Object} item - 项目对象
 */
function playTrailer(item) {
    const apiClient = ServerConnections.getApiClient(item.ServerId);

    // 获取本地预告片并播放
    apiClient.getLocalTrailers(apiClient.getCurrentUserId(), item.Id).then(trailers => {
        playbackManager.play({ items: trailers });
    });
}

/**
 * 编辑项目
 * @param {Object} item - 要编辑的项目对象
 * @param {string} serverId - 服务器ID
 * @returns {Promise} 编辑操作的Promise
 */
function editItem(item, serverId) {
    const apiClient = ServerConnections.getApiClient(serverId);

    return new Promise((resolve, reject) => {
        const currentServerId = apiClient.serverInfo().Id;

        // 根据项目类型选择不同的编辑器
        if (item.Type === 'Timer') {
            // 定时器类型
            if (item.ProgramId) {
                // 有节目ID则显示录制创建器
                import('./recordingcreator/recordingcreator').then(({ default: recordingCreator }) => {
                    recordingCreator.show(item.ProgramId, currentServerId).then(resolve, reject);
                });
            } else {
                // 否则显示录制编辑器
                import('./recordingcreator/recordingeditor').then(({ default: recordingEditor }) => {
                    recordingEditor.show(item.Id, currentServerId).then(resolve, reject);
                });
            }
        } else {
            // 其他类型使用元数据编辑器
            import('./metadataEditor/metadataEditor').then(({ default: metadataEditor }) => {
                metadataEditor.show(item.Id, currentServerId).then(resolve, reject);
            });
        }
    });
}

/**
 * 处理录制命令
 * @param {string} serverId - 服务器ID
 * @param {string} id - 项目ID
 * @param {string} type - 项目类型
 * @param {string} timerId - 定时器ID
 * @param {string} seriesTimerId - 系列定时器ID
 */
function onRecordCommand(serverId, id, type, timerId, seriesTimerId) {
    if (type === 'Program' || timerId || seriesTimerId) {
        const programId = type === 'Program' ? id : null;
        // 切换录制状态
        recordingHelper.toggleRecording(serverId, programId, timerId, seriesTimerId);
    }
}

/**
 * 处理点击事件
 * @param {Event} e - 点击事件对象
 * @returns {boolean|undefined} 如果处理了事件则返回false
 */
export function onClick(e) {
    // 查找包含itemAction类的父元素
    const card = dom.parentWithClass(e.target, 'itemAction');

    if (card) {
        let actionElement = card;
        let action = actionElement.getAttribute('data-action');

        // 如果当前元素没有action，查找父元素
        if (!action) {
            actionElement = dom.parentWithAttribute(actionElement, 'data-action');
            if (actionElement) {
                action = actionElement.getAttribute('data-action');
            }
        }

        if (action) {
            // 执行对应的操作
            executeAction(card, actionElement, action);

            // 阻止默认行为和事件冒泡
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }
}

/**
 * 处理命令事件（通常来自输入管理器）
 * @param {Event} e - 命令事件对象
 */
function onCommand(e) {
    const cmd = e.detail.command;

    // 处理支持的命令类型
    if (cmd === 'play' || cmd === 'resume' || cmd === 'record' || cmd === 'menu' || cmd === 'info') {
        const target = e.target;
        const card = dom.parentWithClass(target, 'itemAction') || dom.parentWithAttribute(target, 'data-id');

        if (card) {
            e.preventDefault();
            e.stopPropagation();
            executeAction(card, card, cmd);
        }
    }
}

/**
 * 在指定上下文中启用快捷操作事件监听
 * @param {HTMLElement} context - 上下文元素
 * @param {Object} options - 选项配置
 * @param {boolean} options.click - 是否监听点击事件（默认true）
 * @param {boolean} options.command - 是否监听命令事件（默认true）
 */
export function on(context, options) {
    options = options || {};

    if (options.click !== false) {
        context.addEventListener('click', onClick);
    }

    if (options.command !== false) {
        inputManager.on(context, onCommand);
    }
}

/**
 * 在指定上下文中移除快捷操作事件监听
 * @param {HTMLElement} context - 上下文元素
 * @param {Object} options - 选项配置
 * @param {boolean} options.command - 是否移除命令事件监听（默认true）
 */
export function off(context, options) {
    options = options || {};

    context.removeEventListener('click', onClick);

    if (options.command !== false) {
        inputManager.off(context, onCommand);
    }
}

/**
 * 生成快捷操作所需的HTML属性字符串
 * @param {Object} item - 项目对象
 * @param {string} serverId - 服务器ID（可选）
 * @returns {string} HTML属性字符串
 */
export function getShortcutAttributesHtml(item, serverId) {
    // 构建基础属性
    let html = `data-id="${item.Id}" data-serverid="${serverId || item.ServerId}" data-type="${item.Type}" data-mediatype="${item.MediaType}" data-channelid="${item.ChannelId}" data-isfolder="${item.IsFolder}"`;

    // 添加收藏类型属性（如果存在）
    const collectionType = item.CollectionType;
    if (collectionType) {
        html += ` data-collectiontype="${collectionType}"`;
    }

    return html;
}

export default {
    on,
    off,
    onClick,
    getShortcutAttributesHtml
};
