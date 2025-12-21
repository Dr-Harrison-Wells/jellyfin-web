/**
 * 主题媒体播放器模块
 * 负责在浏览不同页面时自动播放和停止主题音乐/视频
 * 根据用户设置决定是否启用主题媒体播放
 */

import { ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models/item-sort-by';
import { MediaType } from '@jellyfin/sdk/lib/generated-client/models/media-type';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';

import { getItemQuery } from 'hooks/useItem';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { currentSettings as userSettings } from 'scripts/settings/userSettings';
import { ItemKind } from 'types/base/models/item-kind';
import Events from 'utils/events.ts';
import { toApi } from 'utils/jellyfin-apiclient/compat';
import { queryClient } from 'utils/query/queryClient';

import { playbackManager } from './playback/playbackmanager';

// 当前正在播放主题媒体的项目所有者 ID
let currentOwnerId;
// 当前正在播放的主题媒体项目 ID 列表
let currentThemeIds = [];

/**
 * 播放主题媒体（音乐或视频）
 * @param {Array} items - 主题媒体项目列表
 * @param {string} ownerId - 媒体所有者的 ID
 */
function playThemeMedia(items, ownerId) {
    // 根据用户设置过滤启用的主题媒体类型
    const currentThemeItems = items.filter(function (i) {
        return enabled(i.MediaType);
    });

    if (currentThemeItems.length) {
        // 如果当前没有播放主题媒体但正在播放其他内容（如用户手动播放的电影），则不打断
        if (!currentOwnerId && playbackManager.isPlaying()) {
            return;
        }

        // 记录当前主题媒体的 ID 列表
        currentThemeIds = currentThemeItems.map(function (i) {
            return i.Id;
        });

        // 为每个主题媒体项目设置播放选项
        currentThemeItems.forEach((i) => {
            i.playOptions = {
                fullscreen: false, // 不全屏播放
                enableRemotePlayers: false // 不启用远程播放器
            };
        });

        // 开始播放主题媒体
        playbackManager.play({
            items: currentThemeItems,
            fullscreen: false,
            enableRemotePlayers: false
        }).then(function () {
            currentOwnerId = ownerId;
        });
    } else {
        // 如果没有可用的主题媒体，停止当前播放
        stopIfPlaying();
    }
}

/**
 * 如果正在播放主题媒体，则停止播放
 */
function stopIfPlaying() {
    if (currentOwnerId) {
        playbackManager.stop();
    }

    currentOwnerId = null;
}

/**
 * 检查指定媒体类型是否在用户设置中启用
 * @param {string} mediaType - 媒体类型（视频或音频）
 * @returns {boolean} 是否启用该类型的主题媒体
 */
function enabled(mediaType) {
    if (mediaType === MediaType.Video) {
        return userSettings.enableThemeVideos();
    }

    return userSettings.enableThemeSongs();
}

// 不支持主题媒体的项目类型列表
const excludeTypes = [
    ItemKind.CollectionFolder, // 媒体库文件夹
    ItemKind.UserView, // 用户视图
    ItemKind.Person, // 人物
    ItemKind.Program, // 节目
    ItemKind.TvChannel, // 电视频道
    ItemKind.Channel, // 频道
    ItemKind.SeriesTimer // 系列定时器
];

/**
 * 加载并播放指定项目的主题媒体
 * @param {string} serverId - 服务器 ID
 * @param {string} itemId - 项目 ID
 */
async function loadThemeMedia(serverId, itemId) {
    const apiClient = ServerConnections.getApiClient(serverId);
    const api = toApi(apiClient);
    const userId = apiClient.getCurrentUserId();

    try {
        // 获取项目详细信息
        const item = await queryClient.fetchQuery(getItemQuery(
            api,
            itemId,
            userId
        ));

        // 如果是媒体库集合类型，停止播放
        if (item.CollectionType) {
            stopIfPlaying();
            return;
        }

        // 如果项目类型在排除列表中，停止播放
        if (excludeTypes.includes(item.Type)) {
            stopIfPlaying();
            return;
        }

        // 从服务器获取主题媒体（包括继承自父项目的）
        const { data: themeMedia } = await getLibraryApi(api).getThemeMedia({
            userId,
            itemId: item.Id,
            inheritFromParent: true, // 如果当前项目没有主题媒体，从父项目继承
            sortBy: [ItemSortBy.Random] // 随机排序
        });

        // 优先选择主题视频（如果启用且存在），否则使用主题音乐
        const result = userSettings.enableThemeVideos() && themeMedia.ThemeVideosResult?.Items?.length ? themeMedia.ThemeVideosResult : themeMedia.ThemeSongsResult;

        // 如果所有者不同，播放新的主题媒体
        if (result.OwnerId !== currentOwnerId) {
            playThemeMedia(result.Items, result.OwnerId);
        }
    } catch (err) {
        console.error('[ThemeMediaPlayer] failed to load theme media', err);
    }
}

/**
 * 监听页面显示事件
 * 当切换到新页面时，根据页面类型和参数决定是否加载主题媒体
 */
document.addEventListener('viewshow', e => {
    const { serverId, id } = e.detail?.params || {};
    // 如果有服务器 ID 和项目 ID，加载该项目的主题媒体
    if (serverId && id) {
        void loadThemeMedia(serverId, id);
        return;
    }

    const viewOptions = e.detail.options || {};

    if (viewOptions.supportsThemeMedia) {
        // 页面支持主题媒体，保持当前播放状态
    } else {
        // 页面不支持主题媒体，停止播放
        playThemeMedia([], null);
    }
}, true);

/**
 * 监听播放开始事件
 * 检测用户是否手动播放了非主题媒体内容
 * 如果是，则清除当前主题媒体所有者 ID，避免后续误操作
 */
Events.on(playbackManager, 'playbackstart', (_e, player) => {
    const item = playbackManager.currentItem(player);
    // 如果用户手动播放了其他内容（不在主题媒体列表中）
    if (currentThemeIds.indexOf(item.Id) == -1) {
        currentOwnerId = null;
    }
});
