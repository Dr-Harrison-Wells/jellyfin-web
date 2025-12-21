// 导入浏览器相关功能
import browser from '../scripts/browser';
// 导入剪贴板复制功能
import { copy } from '../scripts/clipboard';
// 导入DOM操作工具
import dom from '../scripts/dom';
// 导入国际化/本地化工具
import globalize from '../lib/globalize';
// 导入服务器连接管理器
import { ServerConnections } from 'lib/jellyfin-apiclient';
// 导入操作表单组件
import actionsheet from './actionSheet/actionSheet';
// 导入应用宿主环境
import { appHost } from './apphost';
// 导入应用路由
import { appRouter } from './router/appRouter';
// 导入媒体项目辅助函数
import itemHelper, { canEditPlaylist } from './itemHelper';
// 导入播放管理器
import { playbackManager } from './playback/playbackmanager';
// 导入消息提示组件
import toast from './toast/toast';
// 导入用户设置
import * as userSettings from '../scripts/settings/userSettings';
// 导入媒体项目类型枚举
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
// 导入应用特性枚举
import { AppFeature } from 'constants/appFeature';

/**
 * 根据媒体项目类型获取删除按钮的标签文本
 * @param {string} type - 媒体项目类型
 * @returns {string} 本地化的删除标签文本
 */
function getDeleteLabel(type) {
    switch (type) {
        case BaseItemKind.Series:
            // 系列剧
            return globalize.translate('DeleteSeries');

        case BaseItemKind.Episode:
            // 单集
            return globalize.translate('DeleteEpisode');

        case BaseItemKind.Playlist:
        case BaseItemKind.BoxSet:
            // 播放列表或合集
            return globalize.translate('Delete');

        default:
            // 其他媒体类型
            return globalize.translate('DeleteMedia');
    }
}

/**
 * 根据媒体项目和用户权限获取可用的上下文菜单命令列表
 * @param {Object} options - 选项对象
 * @param {Object} options.item - 媒体项目对象
 * @param {Object} options.user - 用户对象
 * @returns {Promise<Array>} 命令对象数组
 */
export async function getCommands(options) {
    const item = options.item;
    const user = options.user;

    // 检查是否可以播放该项目
    const canPlay = playbackManager.canPlay(item);

    // 初始化命令数组
    const commands = [];

    // 如果可以播放且不是照片类型
    if (canPlay && item.MediaType !== 'Photo') {
        // 添加播放命令
        if (options.play !== false) {
            commands.push({
                name: globalize.translate('Play'),
                id: 'resume',
                icon: 'play_arrow'
            });
        }

        // 添加"从这里播放全部"命令（不适用于节目和电视频道）
        if (options.playAllFromHere && item.Type !== 'Program' && item.Type !== 'TvChannel') {
            commands.push({
                name: globalize.translate('PlayAllFromHere'),
                id: 'playallfromhere',
                icon: 'play_arrow'
            });
        }
    }

    // 如果当前有播放器在运行
    if (playbackManager.getCurrentPlayer() !== null) {
        // 添加停止播放命令
        if (options.stopPlayback) {
            commands.push({
                name: globalize.translate('StopPlayback'),
                id: 'stopPlayback',
                icon: 'stop'
            });
        }
        // 添加清空播放队列命令
        if (options.clearQueue) {
            commands.push({
                name: globalize.translate('ClearQueue'),
                id: 'clearQueue',
                icon: 'clear_all'
            });
        }
    }

    // 如果该项目可以加入播放队列
    if (playbackManager.canQueue(item)) {
        // 添加到播放队列命令
        if (options.queue !== false) {
            commands.push({
                name: globalize.translate('AddToPlayQueue'),
                id: 'queue',
                icon: 'playlist_add'
            });
        }

        // 下一个播放命令
        if (options.queue !== false) {
            commands.push({
                name: globalize.translate('PlayNext'),
                id: 'queuenext',
                icon: 'playlist_add'
            });
        }
    }

    // 为文件夹、音乐艺术家或音乐流派添加随机播放命令（不适用于电视直播）
    if ((item.IsFolder || item.Type === 'MusicArtist' || item.Type === 'MusicGenre')
            && item.CollectionType !== 'livetv'
            && options.shuffle !== false
    ) {
        commands.push({
            name: globalize.translate('Shuffle'),
            id: 'shuffle',
            icon: 'shuffle'
        });
    }

    // 为音频和音乐相关类型添加即时混音命令（不适用于本地项目）
    if ((item.MediaType === 'Audio' || item.Type === 'MusicAlbum' || item.Type === 'MusicArtist' || item.Type === 'MusicGenre')
            && options.instantMix !== false && !itemHelper.isLocalItem(item)
    ) {
        commands.push({
            name: globalize.translate('InstantMix'),
            id: 'instantmix',
            icon: 'explore'
        });
    }

    // 如果已有命令，添加分隔线
    if (commands.length) {
        commands.push({
            divider: true
        });
    }

    // 在非电视模式下
    if (!browser.tv) {
        // 多选功能目前仅在长按卡片组件时运行
        // 这会禁用非卡片来源的上下文菜单上的选择功能，例如歌曲
        if (options.positionTo && (dom.parentWithClass(options.positionTo, 'card') !== null)) {
            commands.push({
                name:  globalize.translate('Select'),
                id: 'multiSelect',
                icon: 'library_add_check'
            });
        }

        // 如果项目支持添加到合集且用户有权限
        if (itemHelper.supportsAddingToCollection(item) && (user.Policy.IsAdministrator || user.Policy.EnableCollectionManagement)) {
            commands.push({
                name: globalize.translate('AddToCollection'),
                id: 'addtocollection',
                icon: 'playlist_add'
            });
        }

        // 如果项目支持添加到播放列表
        if (itemHelper.supportsAddingToPlaylist(item) && options.playlist !== false) {
            commands.push({
                name: globalize.translate('AddToPlaylist'),
                id: 'addtoplaylist',
                icon: 'playlist_add'
            });
        }
    }

    // 为定时器添加取消录制命令
    if ((item.Type === 'Timer') && user.Policy.EnableLiveTvManagement && options.cancelTimer !== false) {
        commands.push({
            name: globalize.translate('CancelRecording'),
            id: 'canceltimer',
            icon: 'cancel'
        });
    }

    // 为进行中的录制添加取消命令
    if ((item.Type === 'Recording' && item.Status === 'InProgress') && user.Policy.EnableLiveTvManagement && options.cancelTimer !== false) {
        commands.push({
            name: globalize.translate('CancelRecording'),
            id: 'canceltimer',
            icon: 'cancel'
        });
    }

    // 为系列定时器添加取消命令
    if ((item.Type === 'SeriesTimer') && user.Policy.EnableLiveTvManagement && options.cancelTimer !== false) {
        commands.push({
            name: globalize.translate('CancelSeries'),
            id: 'cancelseriestimer',
            icon: 'cancel'
        });
    }

    // 如果宿主环境支持文件下载
    if (appHost.supports(AppFeature.FileDownload)) {
        // CanDownload 可能需要更新以对这些项目返回 true？
        // 为季度和系列添加下载全部命令
        if (user.Policy.EnableContentDownloading && (item.Type === 'Season' || item.Type == 'Series')) {
            commands.push({
                name: globalize.translate('DownloadAll'),
                id: 'downloadall',
                icon: 'file_download'
            });
        }

        // 书籍已提升到主要下载按钮，因此在上下文菜单中排除
        if (item.CanDownload && item.Type !== 'Book') {
            commands.push({
                name: globalize.translate('Download'),
                id: 'download',
                icon: 'file_download'
            });

            commands.push({
                name: globalize.translate('CopyStreamURL'),
                id: 'copy-stream',
                icon: 'content_copy'
            });
        }
    }

    // 如果可以删除该项目
    if (item.CanDelete && options.deleteItem !== false) {
        commands.push({
            name: getDeleteLabel(item.Type),
            id: 'delete',
            icon: 'delete'
        });
    }

    // 如果已有命令，添加分隔线
    if (commands.length) {
        commands.push({
            divider: true
        });
    }

    // 为播放列表添加编辑命令
    if (item.Type === BaseItemKind.Playlist) {
        const _canEditPlaylist = await canEditPlaylist(user, item);
        if (_canEditPlaylist) {
            commands.push({
                name: globalize.translate('Edit'),
                id: 'editplaylist',
                icon: 'edit'
            });
        }
    }

    // 检查是否可以编辑该项目
    const canEdit = itemHelper.canEdit(user, item);
    if (canEdit && options.edit !== false && item.Type !== 'SeriesTimer') {
        // 定时器显示"编辑"，其他显示"编辑元数据"
        const text = (item.Type === 'Timer' || item.Type === 'SeriesTimer') ? globalize.translate('Edit') : globalize.translate('EditMetadata');
        commands.push({
            name: text,
            id: 'edit',
            icon: 'edit'
        });
    }

    // 如果可以编辑图片
    if (itemHelper.canEditImages(user, item) && options.editImages !== false) {
        commands.push({
            name: globalize.translate('EditImages'),
            id: 'editimages',
            icon: 'image'
        });
    }

    // 如果可以编辑字幕
    if (itemHelper.canEditSubtitles(user, item) && options.editSubtitles !== false) {
        commands.push({
            name: globalize.translate('EditSubtitles'),
            id: 'editsubtitles',
            icon: 'closed_caption'
        });
    }

    // 如果可以编辑歌词
    if (itemHelper.canEditLyrics(user, item)) {
        commands.push({
            name: globalize.translate('EditLyrics'),
            id: 'editlyrics',
            icon: 'lyrics'
        });
    }

    // 如果可以识别该项目（元数据匹配）
    if (options.identify !== false && itemHelper.canIdentify(user, item)) {
        commands.push({
            name: globalize.translate('Identify'),
            id: 'identify',
            icon: 'edit'
        });
    }

    // 如果有媒体源，添加查看更多媒体信息命令
    if (item.MediaSources && options.moremediainfo !== false) {
        commands.push({
            name: globalize.translate('MoreMediaInfo'),
            id: 'moremediainfo',
            icon: 'info'
        });
    }

    // 为电视节目添加录制命令
    if (item.Type === 'Program' && options.record !== false) {
        if (item.TimerId) {
            // 已有定时器，显示管理录制
            commands.push({
                name: globalize.translate('ManageRecording'),
                id: 'record',
                icon: 'fiber_manual_record'
            });
        } else {
            // 没有定时器，显示录制
            commands.push({
                name: globalize.translate('Record'),
                id: 'record',
                icon: 'fiber_manual_record'
            });
        }
    }

    // 如果可以刷新元数据
    if (itemHelper.canRefreshMetadata(item, user)) {
        commands.push({
            name: globalize.translate('RefreshMetadata'),
            id: 'refresh',
            icon: 'refresh'
        });
    }

    // 如果是播放列表中的项目且可编辑，添加从播放列表中移除命令
    // 如果是播放列表中的项目且可编辑，添加从播放列表中移除命令
    if (item.PlaylistItemId && options.playlistId && options.canEditPlaylist) {
        commands.push({
            name: globalize.translate('RemoveFromPlaylist'),
            id: 'removefromplaylist',
            icon: 'playlist_remove'
        });
    }

    // 如果不是第一个项目，添加移动到顶部命令
    if (item.PlaylistItemId && options.playlistId && item.PlaylistIndex > 0) {
        commands.push({
            name: globalize.translate('MoveToTop'),
            id: 'movetotop',
            icon: 'vertical_align_top'
        });
    }

    // 如果不是最后一个项目，添加移动到底部命令
    if (item.PlaylistItemId && options.playlistId && item.PlaylistIndex < (item.PlaylistItemCount - 1)) {
        commands.push({
            name: globalize.translate('MoveToBottom'),
            id: 'movetobottom',
            icon: 'vertical_align_bottom'
        });
    }

    // 如果属于某个合集，添加从合集中移除命令
    if (options.collectionId) {
        commands.push({
            name: globalize.translate('RemoveFromCollection'),
            id: 'removefromcollection',
            icon: 'playlist_remove'
        });
    }

    // 在非电视模式下，如果项目可以分享，添加分享命令
    if (!browser.tv && options.share === true && itemHelper.canShare(item, user)) {
        commands.push({
            name: globalize.translate('Share'),
            id: 'share',
            icon: 'share'
        });
    }

    // 如果有专辑ID且不是照片，添加查看专辑命令
    if (options.openAlbum !== false && item.AlbumId && item.MediaType !== 'Photo') {
        commands.push({
            name: globalize.translate('ViewAlbum'),
            id: 'album',
            icon: 'album'
        });
    }
    // 默认显示专辑艺术家，因为一首歌可以有多个艺术家，这个选项会指向哪一个？
    // 虽然有些专辑可以有多个艺术家，但这不像歌曲那么常见。
    if (options.openArtist !== false && item.AlbumArtists?.length) {
        commands.push({
            name: globalize.translate('ViewAlbumArtist'),
            id: 'artist',
            icon: 'person'
        });
    }

    // 如果有歌词，添加查看歌词命令
    if (item.HasLyrics) {
        commands.push({
            name: globalize.translate('ViewLyrics'),
            id: 'lyrics',
            icon: 'lyrics'
        });
    }

    return commands;
}

/**
 * 获取Promise的resolve函数，用于命令执行完成后返回结果
 * @param {Function} resolve - Promise的resolve函数
 * @param {string} commandId - 命令ID
 * @param {boolean} changed - 项目是否已更改
 * @param {boolean} deleted - 项目是否已删除
 * @param {string} itemId - 项目ID
 * @returns {Function} 返回的函数
 */
function getResolveFunction(resolve, commandId, changed, deleted, itemId) {
    return function () {
        resolve({
            command: commandId,
            updated: changed,
            deleted: deleted,
            itemId: itemId
        });
    };
}

/**
 * 执行上下文菜单命令
 * @param {Object} item - 媒体项目对象
 * @param {string} id - 命令ID
 * @param {Object} options - 选项对象
 * @returns {Promise} 返回Promise对象
 */
function executeCommand(item, id, options) {
    const itemId = item.Id;
    const serverId = item.ServerId;
    const apiClient = ServerConnections.getApiClient(serverId);

    return new Promise(function (resolve, reject) {
        // eslint-disable-next-line sonarjs/max-switch-cases
        switch (id) {
            case 'addtocollection':
                // 添加到合集
                import('./collectionEditor/collectionEditor').then(({ default: CollectionEditor }) => {
                    const collectionEditor = new CollectionEditor();
                    collectionEditor.show({
                        items: [itemId],
                        serverId: serverId
                    }).then(getResolveFunction(resolve, id, true), getResolveFunction(resolve, id));
                });
                break;
            case 'addtoplaylist':
                // 添加到播放列表
                import('./playlisteditor/playlisteditor').then(({ default: PlaylistEditor }) => {
                    const playlistEditor = new PlaylistEditor();
                    playlistEditor.show({
                        items: [itemId],
                        serverId: serverId
                    }).then(getResolveFunction(resolve, id, true), getResolveFunction(resolve, id));
                });
                break;
            case 'download':
                // 下载单个文件
                import('../scripts/fileDownloader').then((fileDownloader) => {
                    const downloadHref = apiClient.getItemDownloadUrl(itemId);
                    fileDownloader.download([{
                        url: downloadHref,
                        item,
                        itemId,
                        serverId,
                        title: item.Name,
                        filename: item.Path.replace(/^.*[\\/]/, '')
                    }]);
                    getResolveFunction(getResolveFunction(resolve, id), id)();
                });
                break;
            case 'downloadall': {
                // 下载所有剧集或季度
                // 下载剧集的函数
                const downloadEpisodes = episodes => {
                    import('../scripts/fileDownloader').then((fileDownloader) => {
                        const downloads = episodes.map(episode => {
                            const downloadHref = apiClient.getItemDownloadUrl(episode.Id);
                            return {
                                url: downloadHref,
                                item: episode,
                                itemId: episode.Id,
                                serverId: serverId,
                                title: episode.Name,
                                filename: episode.Path.replace(/^.*[\\/]/, '')
                            };
                        });

                        fileDownloader.download(downloads);
                    });
                };
                // 下载季度的函数
                const downloadSeasons = seasons => {
                    Promise.all(seasons.map(seasonItem => {
                        return apiClient.getEpisodes(seasonItem.SeriesId, {
                            seasonId: seasonItem.Id,
                            userId: options.user.Id,
                            Fields: 'CanDownload,Path'
                        });
                    }
                    )).then(seasonData => {
                        downloadEpisodes(seasonData.map(season => season.Items).flat());
                    });
                };

                if (item.Type === 'Season') {
                    downloadSeasons([item]);
                } else if (item.Type === 'Series') {
                    apiClient.getSeasons(item.Id, {
                        userId: options.user.Id,
                        Fields: 'ItemCounts'
                    }).then(seasons => downloadSeasons(seasons.Items));
                }

                getResolveFunction(getResolveFunction(resolve, id), id)();
                break;
            }
            case 'copy-stream': {
                // 复制流URL到剪贴板
                const downloadHref = apiClient.getItemDownloadUrl(itemId);
                copy(downloadHref).then(() => {
                    toast(globalize.translate('CopyStreamURLSuccess'));
                }).catch(() => {
                    prompt(globalize.translate('CopyStreamURL'), downloadHref);
                });
                getResolveFunction(resolve, id)();
                break;
            }
            case 'editsubtitles':
                // 编辑字幕
                import('./subtitleeditor/subtitleeditor').then(({ default: subtitleEditor }) => {
                    subtitleEditor.show(itemId, serverId).then(getResolveFunction(resolve, id, true), getResolveFunction(resolve, id));
                });
                break;
            case 'editlyrics':
                // 编辑歌词
                import('./lyricseditor/lyricseditor').then(({ default: lyricseditor }) => {
                    lyricseditor.show(itemId, serverId).then(getResolveFunction(resolve, id, true), getResolveFunction(resolve, id));
                });
                break;
            case 'edit':
                // 编辑元数据
                editItem(apiClient, item).then(getResolveFunction(resolve, id, true), getResolveFunction(resolve, id));
                break;
            case 'editplaylist':
                // 编辑播放列表
                import('./playlisteditor/playlisteditor').then(({ default: PlaylistEditor }) => {
                    const playlistEditor = new PlaylistEditor();
                    playlistEditor.show({
                        id: itemId,
                        serverId
                    }).then(getResolveFunction(resolve, id, true), getResolveFunction(resolve, id));
                });
                break;
            case 'editimages':
                // 编辑图片
                import('./imageeditor/imageeditor').then((imageEditor) => {
                    imageEditor.show({
                        itemId: itemId,
                        serverId: serverId
                    }).then(getResolveFunction(resolve, id, true), getResolveFunction(resolve, id));
                });
                break;
            case 'identify':
                // 识别元数据（匹配）
                import('./itemidentifier/itemidentifier').then((itemIdentifier) => {
                    itemIdentifier.show(itemId, serverId).then(getResolveFunction(resolve, id, true), getResolveFunction(resolve, id));
                });
                break;
            case 'moremediainfo':
                // 查看更多媒体信息
                import('./itemMediaInfo/itemMediaInfo').then((itemMediaInfo) => {
                    itemMediaInfo.show(itemId, serverId).then(getResolveFunction(resolve, id), getResolveFunction(resolve, id));
                });
                break;
            case 'multiSelect':
                // 启动多选模式
                import('./multiSelect/multiSelect').then(({ startMultiSelect }) => {
                    const card = dom.parentWithClass(options.positionTo, 'card');
                    startMultiSelect(card);
                });
                break;
            case 'refresh':
                // 刷新元数据
                refresh(apiClient, item);
                getResolveFunction(resolve, id)();
                break;
            case 'open':
                // 打开项目详情页
                appRouter.showItem(item);
                getResolveFunction(resolve, id)();
                break;
            case 'play':
                // 播放
                play(item, false);
                getResolveFunction(resolve, id)();
                break;
            case 'resume':
                // 继续播放
                play(item, true);
                getResolveFunction(resolve, id)();
                break;
            case 'queue':
                // 加入播放队列
                play(item, false, true);
                getResolveFunction(resolve, id)();
                break;
            case 'queuenext':
                // 下一个播放
                play(item, false, true, true);
                getResolveFunction(resolve, id)();
                break;
            case 'stopPlayback':
                // 停止播放
                playbackManager.stop();
                break;
            case 'clearQueue':
                // 清空播放队列
                playbackManager.clearQueue();
                break;
            case 'record':
                // 录制电视节目
                import('./recordingcreator/recordingcreator').then(({ default: recordingCreator }) => {
                    recordingCreator.show(itemId, serverId).then(getResolveFunction(resolve, id, true), getResolveFunction(resolve, id));
                });
                break;
            case 'shuffle':
                // 随机播放
                playbackManager.shuffle(item);
                getResolveFunction(resolve, id)();
                break;
            case 'instantmix':
                // 即时混音
                playbackManager.instantMix(item);
                getResolveFunction(resolve, id)();
                break;
            case 'delete':
                // 删除项目
                deleteItem(apiClient, item).then(getResolveFunction(resolve, id, true, true, itemId), getResolveFunction(resolve, id));
                break;
            case 'share':
                // 分享项目
                navigator.share({
                    title: item.Name,
                    text: item.Overview,
                    url: `${apiClient.serverAddress()}/web/${appRouter.getRouteUrl(item)}`
                });
                break;
            case 'album':
                // 查看专辑
                appRouter.showItem(item.AlbumId, item.ServerId);
                getResolveFunction(resolve, id)();
                break;
            case 'artist':
                // 查看艺术家
                appRouter.showItem(item.AlbumArtists[0].Id, item.ServerId);
                getResolveFunction(resolve, id)();
                break;
            case 'lyrics': {
                // 查看歌词
                if (options.isMobile) {
                    appRouter.show('lyrics');
                } else {
                    appRouter.showItem(item.Id, item.ServerId);
                }
                getResolveFunction(resolve, id)();
                break;
            }
            case 'playallfromhere':
                // 从这里播放全部
                getResolveFunction(resolve, id)();
                break;
            case 'queueallfromhere':
                // 从这里全部加入队列
                getResolveFunction(resolve, id)();
                break;
            case 'removefromplaylist':
                // 从播放列表中移除
                apiClient.ajax({
                    url: apiClient.getUrl('Playlists/' + options.playlistId + '/Items', {
                        EntryIds: [item.PlaylistItemId].join(',')
                    }),
                    type: 'DELETE'
                }).then(function () {
                    getResolveFunction(resolve, id, true)();
                });
                break;
            case 'movetotop':
                // 移动到顶部
                apiClient.ajax({
                    url: apiClient.getUrl('Playlists/' + options.playlistId + '/Items/' + item.PlaylistItemId + '/Move/0'),
                    type: 'POST'
                }).then(function () {
                    getResolveFunction(resolve, id, true)();
                });
                break;
            case 'movetobottom':
                // 移动到底部
                apiClient.ajax({
                    url: apiClient.getUrl('Playlists/' + options.playlistId + '/Items/' + item.PlaylistItemId + '/Move/' + (item.PlaylistItemCount - 1)),
                    type: 'POST'
                }).then(function () {
                    getResolveFunction(resolve, id, true)();
                });
                break;
            case 'removefromcollection':
                // 从合集中移除
                apiClient.ajax({
                    type: 'DELETE',
                    url: apiClient.getUrl('Collections/' + options.collectionId + '/Items', {

                        Ids: [item.Id].join(',')
                    })
                }).then(function () {
                    getResolveFunction(resolve, id, true)();
                });
                break;
            case 'canceltimer':
                // 取消定时器
                deleteTimer(apiClient, item, resolve, id);
                break;
            case 'cancelseriestimer':
                // 取消系列定时器
                deleteSeriesTimer(apiClient, item, resolve, id);
                break;
            default:
                reject();
                break;
        }
    });
}

/**
 * 删除定时器
 * @param {Object} apiClient - API客户端
 * @param {Object} item - 媒体项目对象
 * @param {Function} resolve - Promise的resolve函数
 * @param {string} command - 命令ID
 */
function deleteTimer(apiClient, item, resolve, command) {
    import('./recordingcreator/recordinghelper').then(({ default: recordingHelper }) => {
        const timerId = item.TimerId || item.Id;
        recordingHelper.cancelTimerWithConfirmation(timerId, item.ServerId).then(function () {
            getResolveFunction(resolve, command, true)();
        });
    });
}

/**
 * 删除系列定时器
 * @param {Object} apiClient - API客户端
 * @param {Object} item - 媒体项目对象
 * @param {Function} resolve - Promise的resolve函数
 * @param {string} command - 命令ID
 */
function deleteSeriesTimer(apiClient, item, resolve, command) {
    import('./recordingcreator/recordinghelper').then(({ default: recordingHelper }) => {
        recordingHelper.cancelSeriesTimerWithConfirmation(item.Id, item.ServerId).then(function () {
            getResolveFunction(resolve, command, true)();
        });
    });
}

/**
 * 播放媒体项目
 * @param {Object} item - 媒体项目对象
 * @param {boolean} resume - 是否继续播放
 * @param {boolean} queue - 是否加入队列
 * @param {boolean} queueNext - 是否下一个播放
 */
function play(item, resume, queue, queueNext) {
    let method = 'play';
    if (queue) {
        if (queueNext) {
            method = 'queueNext';
        } else {
            method = 'queue';
        }
    }

    let startPosition = 0;
    // 如果需要继续播放且有播放进度
    if (resume && item.UserData?.PlaybackPositionTicks) {
        startPosition = item.UserData.PlaybackPositionTicks;
    }

    // 如果是电视节目，播放对应的频道
    if (item.Type === 'Program') {
        playbackManager[method]({
            ids: [item.ChannelId],
            startPositionTicks: startPosition,
            serverId: item.ServerId
        });
    } else {
        // 其他类型的媒体，按照排序设置播放
        const sortParentId = 'items-' + (item.IsFolder ? item.Id : item.ParentId) + '-Folder';
        const sortValues = userSettings.getSortValuesLegacy(sortParentId);

        playbackManager[method]({
            items: [item],
            startPositionTicks: startPosition,
            queryOptions: {
                SortBy: sortValues.sortBy,
                SortOrder: sortValues.sortOrder
            }
        });
    }
}

/**
 * 编辑媒体项目
 * @param {Object} apiClient - API客户端
 * @param {Object} item - 媒体项目对象
 * @returns {Promise} 返回Promise对象
 */
function editItem(apiClient, item) {
    return new Promise(function (resolve, reject) {
        const serverId = apiClient.serverInfo().Id;

        // 根据项目类型打开不同的编辑器
        if (item.Type === 'Timer') {
            // 录制定时器编辑器
            import('./recordingcreator/recordingeditor').then(({ default: recordingEditor }) => {
                recordingEditor.show(item.Id, serverId).then(resolve, reject);
            });
        } else if (item.Type === 'SeriesTimer') {
            // 系列录制定时器编辑器
            import('./recordingcreator/seriesrecordingeditor').then(({ default: recordingEditor }) => {
                recordingEditor.show(item.Id, serverId).then(resolve, reject);
            });
        } else {
            // 元数据编辑器
            import('./metadataEditor/metadataEditor').then(({ default: metadataEditor }) => {
                metadataEditor.show(item.Id, serverId).then(resolve, reject);
            });
        }
    });
}

/**
 * 删除媒体项目
 * @param {Object} apiClient - API客户端
 * @param {Object} item - 媒体项目对象
 * @returns {Promise} 返回Promise对象
 */
function deleteItem(apiClient, item) {
    return new Promise(function (resolve, reject) {
        import('../scripts/deleteHelper').then((deleteHelper) => {
            deleteHelper.deleteItem({
                item: item,
                navigate: false
            }).then(function () {
                resolve(true);
            }, reject);
        });
    });
}

/**
 * 刷新媒体项目的元数据
 * @param {Object} apiClient - API客户端
 * @param {Object} item - 媒体项目对象
 */
function refresh(apiClient, item) {
    import('./refreshdialog/refreshdialog').then(({ default: RefreshDialog }) => {
        new RefreshDialog({
            itemIds: [item.Id],
            serverId: apiClient.serverInfo().Id,
            mode: item.Type === 'CollectionFolder' ? 'scan' : null
        }).show();
    });
}

/**
 * 显示上下文菜单并执行用户选择的命令
 * @param {Object} options - 选项对象
 * @returns {Promise} 返回命令执行结果的Promise
 */
export async function show(options) {
    // 获取可用的命令列表
    const commands = await getCommands(options);
    if (!commands.length) {
        throw new Error('No item commands present');
    }

    // 显示操作表单并等待用户选择
    const id = await actionsheet.show({
        items: commands,
        positionTo: options.positionTo,
        resolveOnClick: ['share']
    });

    // 执行用户选择的命令
    return executeCommand(options.item, id, options);
}

// 导出默认对象
export default {
    getCommands,
    show
};
