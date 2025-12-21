/**
 * 媒体项目辅助工具模块
 * 提供媒体项目的显示名称、权限检查、支持功能判断等辅助功能
 */

import { CollectionType } from '@jellyfin/sdk/lib/generated-client/models/collection-type';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { LocationType } from '@jellyfin/sdk/lib/generated-client/models/location-type';
import { RecordingStatus } from '@jellyfin/sdk/lib/generated-client/models/recording-status';
import { MediaType } from '@jellyfin/sdk/lib/generated-client/models/media-type';
import { getPlaylistsApi } from '@jellyfin/sdk/lib/utils/api/playlists-api';

import { appHost } from './apphost';
import { AppFeature } from 'constants/appFeature';
import globalize from 'lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { toApi } from 'utils/jellyfin-apiclient/compat';

/**
 * 获取媒体项目的显示名称
 * @param {Object} item - 媒体项目对象
 * @param {Object} options - 选项配置
 * @param {boolean} options.includeIndexNumber - 是否包含索引号
 * @param {boolean} options.includeParentInfo - 是否包含父级信息
 * @returns {string} 格式化后的显示名称
 */
export function getDisplayName(item, options = {}) {
    if (!item) {
        throw new Error('null item passed into getDisplayName');
    }

    // 如果是定时器，使用其节目信息
    if (item.Type === 'Timer') {
        item = item.ProgramInfo || item;
    }

    // 获取基础名称：对于节目和录制，优先使用剧集标题
    let name = ((item.Type === 'Program' || item.Type === 'Recording') && (item.IsSeries || item.EpisodeTitle) ? item.EpisodeTitle : item.Name) || '';

    // 电视频道显示频道号
    if (item.Type === 'TvChannel') {
        if (item.ChannelNumber) {
            return item.ChannelNumber + ' ' + name;
        }
        return name;
    }
    // 特别剧集显示特殊标记
    if (item.Type === 'Episode' && item.ParentIndexNumber === 0) {
        name = globalize.translate('ValueSpecialEpisodeName', name);
    } else if ((item.Type === 'Episode' || item.Type === 'Program' || item.Type === 'Recording') && item.IndexNumber != null && item.ParentIndexNumber != null && options.includeIndexNumber !== false) {
        // 处理剧集编号显示
        let displayIndexNumber = item.IndexNumber;

        let number = displayIndexNumber;
        let nameSeparator = ' - ';

        // 包含父级信息时显示为 S1:E1 格式
        if (options.includeParentInfo !== false) {
            number = 'S' + item.ParentIndexNumber + ':E' + number;
        } else {
            nameSeparator = '. ';
        }

        if (item.IndexNumberEnd) {
            displayIndexNumber = item.IndexNumberEnd;
            number += '-' + displayIndexNumber;
        }

        if (number) {
            name = name ? (number + nameSeparator + name) : number;
        }
    }

    return name;
}

/**
 * 检查项目是否支持添加到收藏集
 * @param {Object} item - 媒体项目对象
 * @returns {boolean} 是否支持添加到收藏集
 */
export function supportsAddingToCollection(item) {
    // 不支持添加到收藏集的类型
    const invalidTypes = ['Genre', 'MusicGenre', 'Studio', 'UserView', 'CollectionFolder', 'Audio', 'Program', 'Timer', 'SeriesTimer'];

    // 未完成的录制不支持
    if (item.Type === 'Recording' && item.Status !== 'Completed') {
        return false;
    }

    return !item.CollectionType && invalidTypes.indexOf(item.Type) === -1 && item.MediaType !== 'Photo' && !isLocalItem(item);
}

/**
 * 检查项目是否支持添加到播放列表
 * @param {Object} item - 媒体项目对象
 * @returns {boolean} 是否支持添加到播放列表
 */
export function supportsAddingToPlaylist(item) {
    // 节目不支持
    if (item.Type === 'Program') {
        return false;
    }
    // 电视频道不支持
    if (item.Type === 'TvChannel') {
        return false;
    }
    // 定时器不支持
    if (item.Type === 'Timer') {
        return false;
    }
    // 系列定时器不支持
    if (item.Type === 'SeriesTimer') {
        return false;
    }
    // 照片不支持
    if (item.MediaType === 'Photo') {
        return false;
    }

    // 未完成的录制不支持
    if (item.Type === 'Recording' && item.Status !== 'Completed') {
        return false;
    }

    // 本地项目不支持
    if (isLocalItem(item)) {
        return false;
    }
    // 直播电视不支持
    if (item.CollectionType === CollectionType.Livetv) {
        return false;
    }

    return item.MediaType || item.IsFolder || item.Type === 'Genre' || item.Type === 'MusicGenre' || item.Type === 'MusicArtist';
}

/**
 * 检查用户是否可以编辑该项目
 * @param {Object} user - 用户对象
 * @param {Object} item - 媒体项目对象
 * @returns {boolean} 是否可以编辑
 */
export function canEdit(user, item) {
    const itemType = item.Type;

    // 用户根文件夹和用户视图不可编辑
    if (itemType === 'UserRootFolder' || itemType === 'UserView') {
        return false;
    }

    // 节目不可编辑
    if (itemType === 'Program') {
        return false;
    }

    // 定时器不可编辑
    if (itemType === 'Timer') {
        return false;
    }

    // 系列定时器不可编辑
    if (itemType === 'SeriesTimer') {
        return false;
    }

    // 未完成的录制不可编辑
    if (item.Type === 'Recording' && item.Status !== 'Completed') {
        return false;
    }

    // 本地项目不可编辑
    if (isLocalItem(item)) {
        return false;
    }

    // 只有管理员可以编辑
    return user.Policy.IsAdministrator;
}

/**
 * 检查项目是否为本地项目
 * @param {Object} item - 媒体项目对象
 * @returns {boolean} 是否为本地项目
 */
export function isLocalItem(item) {
    return item?.Id && typeof item.Id === 'string' && item.Id.indexOf('local') === 0;
}

/**
 * 检查用户是否可以识别该项目（用于元数据匹配）
 * @param {Object} user - 用户对象
 * @param {Object} item - 媒体项目对象
 * @returns {boolean} 是否可以识别
 */
export function canIdentify (user, item) {
    const itemType = item.Type;

    // 只有特定类型的媒体支持识别，且需要管理员权限
    return (itemType === 'Movie'
        || itemType === 'Trailer'
        || itemType === 'Series'
        || itemType === 'BoxSet'
        || itemType === 'Person'
        || itemType === 'Book'
        || itemType === 'MusicAlbum'
        || itemType === 'MusicArtist'
        || itemType === 'MusicVideo')
        && user.Policy.IsAdministrator
        && !isLocalItem(item);
}

/**
 * 检查用户是否可以编辑项目的图片
 * @param {Object} user - 用户对象
 * @param {Object} item - 媒体项目对象
 * @returns {boolean} 是否可以编辑图片
 */
export function canEditImages (user, item) {
    const itemType = item.Type;

    // 照片本身不能编辑图片
    if (item.MediaType === 'Photo') {
        return false;
    }

    // 用户视图需要管理员权限
    if (itemType === 'UserView') {
        return !!user.Policy.IsAdministrator;
    }

    // 未完成的录制不能编辑图片
    if (item.Type === 'Recording' && item.Status !== 'Completed') {
        return false;
    }

    return itemType !== 'Timer' && itemType !== 'SeriesTimer' && canEdit(user, item) && !isLocalItem(item);
}

/**
 * 检查用户是否可以编辑播放列表
 * @param {Object} user - 用户对象
 * @param {Object} item - 播放列表项目对象
 * @returns {Promise<boolean>} 是否可以编辑播放列表
 */
export async function canEditPlaylist(user, item) {
    const apiClient = ServerConnections.getApiClient(item.ServerId);
    const api = toApi(apiClient);

    try {
        // 获取播放列表的用户权限
        const { data: permissions } = await getPlaylistsApi(api)
            .getPlaylistUser({
                userId: user.Id,
                playlistId: item.Id
            });

        return !!permissions.CanEdit;
    } catch (err) {
        console.error('Failed to get playlist permissions', err);
    }

    return false;
}

/**
 * 检查用户是否可以编辑字幕
 * @param {Object} user - 用户对象
 * @param {Object} item - 媒体项目对象
 * @returns {boolean} 是否可以编辑字幕
 */
export function canEditSubtitles (user, item) {
    // 只有视频类型才有字幕
    if (item.MediaType !== MediaType.Video) {
        return false;
    }
    const itemType = item.Type;
    // 未完成的录制不能编辑字幕
    if (itemType === BaseItemKind.Recording && item.Status !== RecordingStatus.Completed) {
        return false;
    }
    // 某些类型不支持字幕编辑
    if (itemType === BaseItemKind.TvChannel
        || itemType === BaseItemKind.Program
        || itemType === 'Timer'
        || itemType === 'SeriesTimer'
        || itemType === BaseItemKind.UserRootFolder
        || itemType === BaseItemKind.UserView
    ) {
        return false;
    }
    // 本地项目不支持
    if (isLocalItem(item)) {
        return false;
    }
    // 虚拟项目不支持
    if (item.LocationType === LocationType.Virtual) {
        return false;
    }
    // 需要字幕管理权限或管理员权限
    return user.Policy.EnableSubtitleManagement
           || user.Policy.IsAdministrator;
}

/**
 * 检查用户是否可以编辑歌词
 * @param {Object} user - 用户对象
 * @param {Object} item - 媒体项目对象
 * @returns {boolean} 是否可以编辑歌词
 */
export function canEditLyrics (user, item) {
    // 只有音频类型才有歌词
    if (item.MediaType !== MediaType.Audio) {
        return false;
    }
    // 本地项目不支持
    if (isLocalItem(item)) {
        return false;
    }
    // 需要管理员权限
    return user.Policy.IsAdministrator;
}

/**
 * 检查项目是否可以分享
 * @param {Object} item - 媒体项目对象
 * @param {Object} user - 用户对象
 * @returns {boolean} 是否可以分享
 */
export function canShare (item, user) {
    // 节目不能分享
    if (item.Type === 'Program') {
        return false;
    }
    // 电视频道不能分享
    if (item.Type === 'TvChannel') {
        return false;
    }
    // 定时器不能分享
    if (item.Type === 'Timer') {
        return false;
    }
    // 系列定时器不能分享
    if (item.Type === 'SeriesTimer') {
        return false;
    }
    // 未完成的录制不能分享
    if (item.Type === 'Recording' && item.Status !== 'Completed') {
        return false;
    }
    // 本地项目不能分享
    if (isLocalItem(item)) {
        return false;
    }
    // 需要用户有公开分享权限，且应用支持分享功能
    return user.Policy.EnablePublicSharing && appHost.supports(AppFeature.Sharing);
}

/**
 * 检查是否启用添加日期显示
 * @param {Object} item - 媒体项目对象
 * @returns {boolean} 是否显示添加日期
 */
export function enableDateAddedDisplay (item) {
    return !item.IsFolder && item.MediaType && item.Type !== 'Program' && item.Type !== 'TvChannel' && item.Type !== 'Trailer';
}

/**
 * 检查项目是否可以标记为已播放
 * @param {Object} item - 媒体项目对象
 * @returns {boolean} 是否可以标记为已播放
 */
export function canMarkPlayed (item) {
    // 节目不能标记
    if (item.Type === 'Program') {
        return false;
    }

    // 视频类型（除电视频道外）可以标记
    if (item.MediaType === 'Video') {
        if (item.Type !== 'TvChannel') {
            return true;
        }
    } else if (item.MediaType === 'Audio') {
        // 音频播客和有声书可以标记
        if (item.Type === 'AudioPodcast') {
            return true;
        }
        if (item.Type === 'AudioBook') {
            return true;
        }
    }

    // 其他支持的类型
    return item.Type === 'Series'
        || item.Type === 'Season'
        || item.Type === 'BoxSet'
        || item.MediaType === 'Book'
        || item.MediaType === 'Recording';
}

/**
 * 检查项目是否可以评分
 * @param {Object} item - 媒体项目对象
 * @returns {boolean} 是否可以评分
 */
export function canRate (item) {
    // 排除不支持评分的类型，且必须有用户数据
    return item.Type !== 'Program'
        && item.Type !== 'Timer'
        && item.Type !== 'SeriesTimer'
        && item.Type !== 'CollectionFolder'
        && item.Type !== 'UserView'
        && item.Type !== 'Channel'
        && item.UserData;
}

/**
 * 检查项目是否可以转换格式
 * @param {Object} item - 媒体项目对象
 * @param {Object} user - 用户对象
 * @returns {boolean} 是否可以转换
 */
export function canConvert (item, user) {
    // 用户需要有媒体转换权限
    if (!user.Policy.EnableMediaConversion) {
        return false;
    }

    // 本地项目不支持
    if (isLocalItem(item)) {
        return false;
    }

    // 书籍、照片和音频不支持转换
    const mediaType = item.MediaType;
    if (mediaType === 'Book' || mediaType === 'Photo' || mediaType === 'Audio') {
        return false;
    }

    // 直播电视不支持
    const collectionType = item.CollectionType;
    if (collectionType === CollectionType.Livetv) {
        return false;
    }

    // 某些类型不支持转换
    const type = item.Type;
    if (type === 'Channel' || type === 'Person' || type === 'Year' || type === 'Program' || type === 'Timer' || type === 'SeriesTimer') {
        return false;
    }

    // 虚拟的非文件夹项目不支持
    if (item.LocationType === 'Virtual' && !item.IsFolder) {
        return false;
    }

    // 占位符不支持
    return !item.IsPlaceHolder;
}

/**
 * 检查是否可以刷新元数据
 * @param {Object} item - 媒体项目对象
 * @param {Object} user - 用户对象
 * @returns {boolean} 是否可以刷新元数据
 */
export function canRefreshMetadata (item, user) {
    // 只有管理员可以刷新元数据
    if (user.Policy.IsAdministrator) {
        const collectionType = item.CollectionType;
        // 直播电视不支持
        if (collectionType === CollectionType.Livetv) {
            return false;
        }

        // 排除不支持的类型
        return item.Type !== 'Timer' && item.Type !== 'SeriesTimer' && item.Type !== 'Program'
            && item.Type !== 'TvChannel'
            && !(item.Type === 'Recording' && item.Status !== 'Completed')
            && !isLocalItem(item);
    }

    return false;
}

/**
 * 检查项目是否支持媒体源选择
 * @param {Object} item - 媒体项目对象
 * @returns {boolean} 是否支持媒体源选择
 */
export function supportsMediaSourceSelection (item) {
    // 只有视频类型支持
    if (item.MediaType !== 'Video') {
        return false;
    }
    // 电视频道不支持
    if (item.Type === 'TvChannel') {
        return false;
    }
    // 必须有有效的媒体源
    if (!item.MediaSources || (item.MediaSources.length === 1 && item.MediaSources[0].Type === 'Placeholder')) {
        return false;
    }

    // 检查是否显式配置了媒体源显示
    if (item.EnableMediaSourceDisplay != null) {
        return !!item.EnableMediaSourceDisplay;
    }

    // 只有库类型的媒体源支持选择
    return !item.SourceType || item.SourceType === 'Library';
}

/**
 * 对音轨或字幕轨进行排序
 * 排序优先级：内部轨优先 > 强制轨优先 > 默认轨优先 > 索引号升序
 * @param {Object} trackA - 轨道A
 * @param {Object} trackB - 轨道B
 * @returns {number} 排序结果
 */
export function sortTracks (trackA, trackB) {
    // 内部轨道优先于外部轨道
    let cmp = trackA.IsExternal - trackB.IsExternal;
    if (cmp != 0) return cmp;
    // 强制轨道优先
    cmp = trackB.IsForced - trackA.IsForced;
    if (cmp != 0) return cmp;
    // 默认轨道优先
    cmp = trackB.IsDefault - trackA.IsDefault;
    if (cmp != 0) return cmp;

    // 按索引号升序排列
    return trackA.Index - trackB.Index;
}

/**
 * 默认导出所有辅助函数
 */
export default {
    getDisplayName: getDisplayName,
    supportsAddingToCollection: supportsAddingToCollection,
    supportsAddingToPlaylist: supportsAddingToPlaylist,
    isLocalItem: isLocalItem,
    canIdentify: canIdentify,
    canEdit: canEdit,
    canEditImages: canEditImages,
    canEditSubtitles,
    canEditLyrics,
    canShare: canShare,
    enableDateAddedDisplay: enableDateAddedDisplay,
    canMarkPlayed: canMarkPlayed,
    canRate: canRate,
    canConvert: canConvert,
    canRefreshMetadata: canRefreshMetadata,
    supportsMediaSourceSelection: supportsMediaSourceSelection,
    sortTracks: sortTracks
};
