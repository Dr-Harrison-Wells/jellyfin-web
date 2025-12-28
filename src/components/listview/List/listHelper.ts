/**
 * 列表视图辅助函数模块
 * 提供列表项的索引计算、图像URL获取等功能
 */

import { Api } from '@jellyfin/sdk';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ImageType } from '@jellyfin/sdk/lib/generated-client/models/image-type';
import { getImageApi } from '@jellyfin/sdk/lib/utils/api/image-api';

import globalize from 'lib/globalize';
import type { ItemDto } from 'types/base/models/item-dto';
import type { ListOptions } from 'types/listOptions';

/**
 * 根据排序名称获取索引
 * @param item - 媒体项
 * @returns 索引字符（A-Z 或 #）
 */
const sortBySortName = (item: ItemDto): string => {
    // 剧集类型返回空字符串
    if (item.Type === BaseItemKind.Episode) {
        return '';
    }

    // 获取排序名称的首字母并转为大写
    const name = (item.SortName ?? item.Name ?? '?')[0].toUpperCase();

    // 检查字符代码，如果不是 A-Z（65-90），则返回 '#'
    const code = name.charCodeAt(0);
    if (code < 65 || code > 90) {
        return '#';
    }

    return name.toUpperCase();
};

/**
 * 根据官方评级获取索引
 * @param item - 媒体项
 * @returns 官方评级或 "未评级"
 */
const sortByOfficialrating = (item: ItemDto): string => {
    return item.OfficialRating ?? globalize.translate('Unrated');
};

/**
 * 根据社区评分获取索引
 * @param item - 媒体项
 * @returns 评分的整数部分或 "未评级"
 */
const sortByCommunityRating = (item: ItemDto): string => {
    if (item.CommunityRating == null) {
        return globalize.translate('Unrated');
    }

    // 返回评分的整数部分
    return String(Math.floor(item.CommunityRating));
};

/**
 * 根据影评人评分获取索引
 * @param item - 媒体项
 * @returns 评分的整数部分或 "未评级"
 */
const sortByCriticRating = (item: ItemDto): string => {
    if (item.CriticRating == null) {
        return globalize.translate('Unrated');
    }

    // 返回评分的整数部分
    return String(Math.floor(item.CriticRating));
};

/**
 * 根据专辑艺术家名称获取索引
 * @param item - 媒体项
 * @returns 索引字符（A-Z 或 #）
 */
const sortByAlbumArtist = (item: ItemDto): string => {
    // 如果没有专辑艺术家，返回空字符串
    if (!item.AlbumArtist) {
        return '';
    }

    // 获取艺术家名称的首字母并转为大写
    const name = item.AlbumArtist[0].toUpperCase();

    // 检查字符代码，如果不是 A-Z（65-90），则返回 '#'
    const code = name.charCodeAt(0);
    if (code < 65 || code > 90) {
        return '#';
    }

    return name.toUpperCase();
};

/**
 * 根据列表选项获取媒体项的索引
 * @param item - 媒体项数据
 * @param listOptions - 列表选项配置
 * @returns 索引字符串
 */
export function getIndex(item: ItemDto, listOptions: ListOptions): string {
    // 如果按光盘索引，返回光盘编号
    if (listOptions.index === 'disc') {
        return item.ParentIndexNumber == null ?
            '' :
            globalize.translate('ValueDiscNumber', item.ParentIndexNumber);
    }

    // 获取排序方式并转为小写
    const sortBy = (listOptions.sortBy ?? '').toLowerCase();

    // 根据不同的排序方式返回相应的索引
    if (sortBy.startsWith('sortname')) {
        return sortBySortName(item);
    }
    if (sortBy.startsWith('officialrating')) {
        return sortByOfficialrating(item);
    }
    if (sortBy.startsWith('communityrating')) {
        return sortByCommunityRating(item);
    }
    if (sortBy.startsWith('criticrating')) {
        return sortByCriticRating(item);
    }
    if (sortBy.startsWith('albumartist')) {
        return sortByAlbumArtist(item);
    }
    return '';
}

/**
 * 获取媒体项的主图片URL
 * 按优先级尝试获取：项目主图 > 专辑图 > 系列图 > 父级图
 * @param item - 媒体项数据
 * @param api - Jellyfin API 实例
 * @param size - 图片尺寸（宽度和高度）
 * @returns 包含图片URL和模糊哈希的对象
 */
export function getImageUrl(
    item: ItemDto,
    api: Api | undefined,
    size: number | undefined
) {
    let imgTag;
    let itemId;
    const fillWidth = size;
    const fillHeight = size;
    const imgType = ImageType.Primary;

    // 按优先级查找可用的图片标签和ID
    if (item.ImageTags?.Primary) {
        // 优先使用项目自己的主图
        imgTag = item.ImageTags.Primary;
        itemId = item.Id;
    } else if (item.AlbumId && item.AlbumPrimaryImageTag) {
        // 其次使用专辑图
        imgTag = item.AlbumPrimaryImageTag;
        itemId = item.AlbumId;
    } else if (item.SeriesId && item.SeriesPrimaryImageTag) {
        // 再次使用系列图
        imgTag = item.SeriesPrimaryImageTag;
        itemId = item.SeriesId;
    } else if (item.ParentPrimaryImageTag) {
        // 最后使用父级图
        imgTag = item.ParentPrimaryImageTag;
        itemId = item.ParentPrimaryImageItemId;
    }

    // 如果所有必要参数都存在，构建图片URL
    if (api && imgTag && imgType && itemId) {
        const response = getImageApi(api).getItemImageUrlById(itemId, imgType, {
            fillWidth: fillWidth,
            fillHeight: fillHeight,
            tag: imgTag
        });

        return {
            imgUrl: response,
            blurhash: item.ImageBlurHashes?.[imgType]?.[imgTag] // 用于模糊占位符
        };
    }

    // 没有可用图片时返回 undefined
    return {
        imgUrl: undefined,
        blurhash: undefined
    };
}

/**
 * 获取频道的图片URL
 * @param item - 媒体项数据
 * @param api - Jellyfin API 实例
 * @param size - 图片尺寸（宽度和高度）
 * @returns 包含图片URL和模糊哈希的对象
 */
export function getChannelImageUrl(
    item: ItemDto,
    api: Api | undefined,
    size: number | undefined
) {
    let imgTag;
    let itemId;
    const fillWidth = size;
    const fillHeight = size;

    // 获取频道的图片标签和ID
    if (item.ChannelId && item.ChannelPrimaryImageTag) {
        imgTag = item.ChannelPrimaryImageTag;
        itemId = item.ChannelId;
    }

    // 如果所有必要参数都存在，构建频道图片URL
    if (api && imgTag && itemId) {
        const response = getImageApi(api)
            .getItemImageUrlById(itemId, ImageType.Primary, {
                fillWidth,
                fillHeight,
                tag: imgTag
            });

        return {
            imgUrl: response,
            blurhash: item.ImageBlurHashes?.[ImageType.Primary]?.[imgTag] // 用于模糊占位符
        };
    }

    // 没有可用图片时返回 undefined
    return {
        imgUrl: undefined,
        blurhash: undefined
    };
}

/**
 * 判断媒体项是否可以继续播放
 * @param PlaybackPositionTicks - 播放位置（以 ticks 为单位）
 * @returns 如果有有效的播放位置则返回 true
 */
export function canResume(PlaybackPositionTicks: number | undefined): boolean {
    return Boolean(
        PlaybackPositionTicks
            && PlaybackPositionTicks > 0
    );
}
