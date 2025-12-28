/**
 * 主要媒体信息 Hook
 * 用于根据不同的媒体项类型和配置选项，生成并返回相应的媒体信息数组
 */

import * as userSettings from 'scripts/settings/userSettings';
import datetime from 'scripts/datetime';
import globalize from 'lib/globalize';
import itemHelper from '../itemHelper';

import { ItemKind } from 'types/base/models/item-kind';
import { ItemMediaKind } from 'types/base/models/item-media-kind';
import { ItemStatus } from 'types/base/models/item-status';
import type {
    NullableNumber,
    NullableString
} from 'types/base/common/shared/types';
import type { ItemDto } from 'types/base/models/item-dto';
import type { MiscInfo } from 'types/mediaInfoItem';
import { PrimaryInfoOpts } from './type';

/**
 * 判断是否应该显示文件夹运行时信息
 * @param showFolderRuntimeInfo - 是否显示文件夹运行时信息的配置
 * @param itemType - 媒体项类型
 * @param itemMediaType - 媒体类型
 * @returns 是否显示文件夹运行时信息
 */
function shouldShowFolderRuntime(
    showFolderRuntimeInfo: boolean,
    itemType: ItemKind,
    itemMediaType: ItemMediaKind
): boolean {
    return (
        showFolderRuntimeInfo
        && (itemType === ItemKind.MusicAlbum
            || itemMediaType === ItemMediaKind.MusicArtist
            || itemType === ItemKind.Playlist
            || itemMediaType === ItemMediaKind.Playlist
            || itemMediaType === ItemMediaKind.MusicGenre)
    );
}

/**
 * 添加曲目数量或项目数量信息
 * @param isFolderRuntimeEnabled - 是否启用文件夹运行时
 * @param showItemCountInfo - 是否显示项目数量信息
 * @param itemSongCount - 歌曲数量
 * @param itemChildCount - 子项数量
 * @param itemRunTimeTicks - 运行时间刻度
 * @param itemType - 媒体项类型
 * @param addMiscInfo - 添加杂项信息的回调函数
 */
function addTrackCountOrItemCount(
    isFolderRuntimeEnabled: boolean,
    showItemCountInfo: boolean,
    itemSongCount: NullableNumber,
    itemChildCount: NullableNumber,
    itemRunTimeTicks: NullableNumber,
    itemType: ItemKind,
    addMiscInfo: (val: MiscInfo) => void
): void {
    if (isFolderRuntimeEnabled) {
        const count = itemSongCount || itemChildCount;
        if (count) {
            addMiscInfo({ text: globalize.translate('TrackCount', count) });
        }

        if (itemRunTimeTicks) {
            addMiscInfo({
                text: datetime.getDisplayDuration(itemRunTimeTicks)
            });
        }
    } else if (
        showItemCountInfo
        && (itemType === ItemKind.PhotoAlbum || itemType === ItemKind.BoxSet)
    ) {
        const count = itemChildCount;
        if (count) {
            addMiscInfo({ text: globalize.translate('ItemCount', count) });
        }
    }
}

/**
 * 添加原始播出日期信息
 * @param showOriginalAirDateInfo - 是否显示原始播出日期
 * @param itemType - 媒体项类型
 * @param itemMediaType - 媒体类型
 * @param itemPremiereDate - 首映日期
 * @param addMiscInfo - 添加杂项信息的回调函数
 */
function addOriginalAirDateInfo(
    showOriginalAirDateInfo: boolean,
    itemType: ItemKind,
    itemMediaType: ItemMediaKind,
    itemPremiereDate: NullableString,
    addMiscInfo: (val: MiscInfo) => void
): void {
    if (
        showOriginalAirDateInfo
        && (itemType === ItemKind.Episode
            || itemMediaType === ItemMediaKind.Photo)
        && itemPremiereDate
    ) {
        try {
            // 如果是剧集，不要修改日期为本地格式。只有日期（非时间）会被存储，或可在编辑元数据对话框中编辑
            const date = datetime.parseISO8601Date(
                itemPremiereDate,
                itemType !== ItemKind.Episode
            );
            addMiscInfo({ text: datetime.toLocaleDateString(date) });
        } catch {
            console.error('error parsing date:', itemPremiereDate);
        }
    }
}

/**
 * 添加系列定时器信息
 * @param showSeriesTimerInfo - 是否显示系列定时器信息
 * @param itemType - 媒体项类型
 * @param itemRecordAnyTime - 是否任何时间录制
 * @param itemStartDate - 开始日期
 * @param itemRecordAnyChannel - 是否任何频道录制
 * @param itemChannelName - 频道名称
 * @param addMiscInfo - 添加杂项信息的回调函数
 */
function addSeriesTimerInfo(
    showSeriesTimerInfo: boolean,
    itemType: ItemKind,
    itemRecordAnyTime: boolean | undefined,
    itemStartDate: NullableString,
    itemRecordAnyChannel: boolean | undefined,
    itemChannelName: NullableString,
    addMiscInfo: (val: MiscInfo) => void
): void {
    if (showSeriesTimerInfo && itemType === ItemKind.SeriesTimer) {
        if (itemRecordAnyTime) {
            addMiscInfo({ text: globalize.translate('Anytime') });
        } else {
            addMiscInfo({ text: datetime.getDisplayTime(itemStartDate) });
        }

        if (itemRecordAnyChannel) {
            addMiscInfo({ text: globalize.translate('AllChannels') });
        } else {
            addMiscInfo({
                text: itemChannelName || globalize.translate('OneChannel')
            });
        }
    }
}

/**
 * 添加节目指示器信息（直播、首映、新节目、重播）
 * @param program - 节目项
 * @param addMiscInfo - 添加杂项信息的回调函数
 */
function addProgramIndicatorInfo(
    program: ItemDto | undefined,
    addMiscInfo: (val: MiscInfo) => void
): void {
    if (
        program?.IsLive
        && userSettings.get('guide-indicator-live') === 'true'
    ) {
        addMiscInfo({
            text: globalize.translate('Live'),
            cssClass: 'mediaInfoProgramAttribute liveTvProgram'
        });
    } else if (
        program?.IsPremiere
        && userSettings.get('guide-indicator-premiere') === 'true'
    ) {
        addMiscInfo({
            text: globalize.translate('Premiere'),
            cssClass: 'mediaInfoProgramAttribute premiereTvProgram'
        });
    } else if (
        program?.IsSeries
        && !program?.IsRepeat
        && userSettings.get('guide-indicator-new') === 'true'
    ) {
        addMiscInfo({
            text: globalize.translate('New'),
            cssClass: 'mediaInfoProgramAttribute newTvProgram'
        });
    } else if (
        program?.IsSeries
        && program?.IsRepeat
        && userSettings.get('guide-indicator-repeat') === 'true'
    ) {
        addMiscInfo({
            text: globalize.translate('Repeat'),
            cssClass: 'mediaInfoProgramAttribute repeatTvProgram'
        });
    }
}

/**
 * 添加节目指示器
 * @param showYearInfo - 是否显示年份信息
 * @param showEpisodeTitleInfo - 是否显示剧集标题信息
 * @param showOriginalAirDateInfo - 是否显示原始播出日期信息
 * @param showProgramIndicatorInfo - 是否显示节目指示器信息
 * @param includeEpisodeTitleIndexNumber - 是否包含剧集标题索引号
 * @param item - 媒体项
 * @param addMiscInfo - 添加杂项信息的回调函数
 */
function addProgramIndicators(
    showYearInfo: boolean,
    showEpisodeTitleInfo: boolean,
    showOriginalAirDateInfo: boolean,
    showProgramIndicatorInfo: boolean,
    includeEpisodeTitleIndexNumber: boolean,
    item: ItemDto,
    addMiscInfo: (val: MiscInfo) => void
): void {
    if (item.Type === ItemKind.Program || item.Type === ItemKind.Timer) {
        let program = item;
        if (item.Type === ItemKind.Timer && item.ProgramInfo) {
            program = item.ProgramInfo;
        }

        if (showProgramIndicatorInfo) {
            addProgramIndicatorInfo(program, addMiscInfo);
        }

        addProgramTextInfo(
            showEpisodeTitleInfo,
            includeEpisodeTitleIndexNumber,
            showOriginalAirDateInfo,
            showYearInfo,
            program,
            addMiscInfo
        );
    }
}

/**
 * 添加节目文本信息
 * @param showEpisodeTitleInfo - 是否显示剧集标题信息
 * @param includeEpisodeTitleIndexNumber - 是否包含剧集标题索引号
 * @param showOriginalAirDateInfo - 是否显示原始播出日期信息
 * @param showYearInfo - 是否显示年份信息
 * @param program - 节目项
 * @param addMiscInfo - 添加杂项信息的回调函数
 */
function addProgramTextInfo(
    showEpisodeTitleInfo: boolean,
    includeEpisodeTitleIndexNumber: boolean,
    showOriginalAirDateInfo: boolean,
    showYearInfo: boolean,
    program: ItemDto,
    addMiscInfo: (val: MiscInfo) => void
): void {
    if (showEpisodeTitleInfo && (program.IsSeries || program.EpisodeTitle)) {
        const text = itemHelper.getDisplayName(program, {
            includeIndexNumber: includeEpisodeTitleIndexNumber
        });

        if (text) {
            addMiscInfo({ text: text });
        }
    } else if (
        ((showOriginalAirDateInfo && program.IsMovie) || showYearInfo)
        && program.ProductionYear
    ) {
        addMiscInfo({ text: program.ProductionYear });
    } else if (showOriginalAirDateInfo && program.PremiereDate) {
        try {
            const date = datetime.parseISO8601Date(program.PremiereDate);
            const text = globalize.translate(
                'OriginalAirDateValue',
                datetime.toLocaleDateString(date)
            );
            addMiscInfo({ text: text });
        } catch {
            console.error('error parsing date:', program.PremiereDate);
        }
    }
}

/**
 * 添加开始日期信息
 * @param showStartDateInfo - 是否显示开始日期信息
 * @param itemStartDate - 开始日期
 * @param itemType - 媒体项类型
 * @param addMiscInfo - 添加杂项信息的回调函数
 */
function addStartDateInfo(
    showStartDateInfo: boolean,
    itemStartDate: NullableString,
    itemType: ItemKind,
    addMiscInfo: (val: MiscInfo) => void
): void {
    if (
        showStartDateInfo
        && itemStartDate
        && itemType !== ItemKind.Program
        && itemType !== ItemKind.SeriesTimer
        && itemType !== ItemKind.Timer
    ) {
        try {
            const date = datetime.parseISO8601Date(itemStartDate);
            addMiscInfo({ text: datetime.toLocaleDateString(date) });

            if (itemType !== ItemKind.Recording) {
                addMiscInfo({ text: datetime.getDisplayTime(date) });
            }
        } catch {
            console.error('error parsing date:', itemStartDate);
        }
    }
}

/**
 * 添加系列制作年份信息
 * @param showYearInfo - 是否显示年份信息
 * @param itemProductionYear - 制作年份
 * @param itemType - 媒体项类型
 * @param itemStatus - 媒体项状态
 * @param itemEndDate - 结束日期
 * @param addMiscInfo - 添加杂项信息的回调函数
 */
function addSeriesProductionYearInfo(
    showYearInfo: boolean,
    itemProductionYear: NullableNumber,
    itemType: ItemKind,
    itemStatus: ItemStatus,
    itemEndDate: NullableString,
    addMiscInfo: (val: MiscInfo) => void
): void {
    if (showYearInfo && itemProductionYear && itemType === ItemKind.Series) {
        if (itemStatus === ItemStatus.Continuing) {
            addMiscInfo({
                text: globalize.translate(
                    'SeriesYearToPresent',
                    datetime.toLocaleString(itemProductionYear, {
                        useGrouping: false
                    })
                )
            });
        } else {
            addproductionYearWithEndDate(
                itemProductionYear,
                itemEndDate,
                addMiscInfo
            );
        }
    }
}

/**
 * 添加包含结束日期的制作年份
 * @param itemProductionYear - 制作年份
 * @param itemEndDate - 结束日期
 * @param addMiscInfo - 添加杂项信息的回调函数
 */
function addproductionYearWithEndDate(
    itemProductionYear: number,
    itemEndDate: NullableString,
    addMiscInfo: (val: MiscInfo) => void
): void {
    let productionYear = datetime.toLocaleString(itemProductionYear, {
        useGrouping: false
    });

    if (itemEndDate) {
        try {
            const endYear = datetime.toLocaleString(
                datetime.parseISO8601Date(itemEndDate).getFullYear(),
                { useGrouping: false }
            );
            /* 此时文本仅包含开始年份 */
            if (endYear !== itemProductionYear) {
                productionYear += `-${endYear}`;
            }
        } catch {
            console.error('error parsing date:', itemEndDate);
        }
    }
    addMiscInfo({ text: productionYear });
}

/**
 * 添加年份信息
 * @param showYearInfo - 是否显示年份信息
 * @param itemType - 媒体项类型
 * @param itemMediaType - 媒体类型
 * @param itemProductionYear - 制作年份
 * @param itemPremiereDate - 首映日期
 * @param addMiscInfo - 添加杂项信息的回调函数
 */
function addYearInfo(
    showYearInfo: boolean,
    itemType: ItemKind,
    itemMediaType: ItemMediaKind,
    itemProductionYear: NullableNumber,
    itemPremiereDate: NullableString,
    addMiscInfo: (val: MiscInfo) => void
): void {
    if (
        showYearInfo
        && itemType !== ItemKind.Series
        && itemType !== ItemKind.Episode
        && itemType !== ItemKind.Person
        && itemMediaType !== ItemMediaKind.Photo
        && itemType !== ItemKind.Program
        && itemType !== ItemKind.Season
    ) {
        if (itemProductionYear) {
            addMiscInfo({ text: itemProductionYear });
        } else if (itemPremiereDate) {
            try {
                const text = datetime.toLocaleString(
                    datetime.parseISO8601Date(itemPremiereDate).getFullYear(),
                    { useGrouping: false }
                );
                addMiscInfo({ text: text });
            } catch {
                console.error('error parsing date:', itemPremiereDate);
            }
        }
    }
}

/**
 * 添加视频3D格式信息
 * @param showVideo3DFormatInfo - 是否显示视频3D格式信息
 * @param itemVideo3DFormat - 视频3D格式
 * @param addMiscInfo - 添加杂项信息的回调函数
 */
function addVideo3DFormat(
    showVideo3DFormatInfo: boolean,
    itemVideo3DFormat: NullableString,
    addMiscInfo: (val: MiscInfo) => void
): void {
    if (showVideo3DFormatInfo && itemVideo3DFormat) {
        addMiscInfo({ text: '3D' });
    }
}

/**
 * 添加运行时间信息
 * @param isFolderRuntimeEnabled - 是否启用文件夹运行时
 * @param showRuntimeInfo - 是否显示运行时间信息
 * @param itemRunTimeTicks - 运行时间刻度
 * @param itemType - 媒体项类型
 * @param addMiscInfo - 添加杂项信息的回调函数
 */
function addRunTimeInfo(
    isFolderRuntimeEnabled: boolean,
    showRuntimeInfo: boolean,
    itemRunTimeTicks: NullableNumber,
    itemType: ItemKind,
    addMiscInfo: (val: MiscInfo) => void
): void {
    if (
        !isFolderRuntimeEnabled
        && showRuntimeInfo
        && itemRunTimeTicks
        && itemType !== ItemKind.Series
        && itemType !== ItemKind.Program
        && itemType !== ItemKind.Timer
        && itemType !== ItemKind.Book
    ) {
        if (itemType === ItemKind.Audio) {
            addMiscInfo({
                text: datetime.getDisplayRunningTime(itemRunTimeTicks)
            });
        } else {
            addMiscInfo({
                text: datetime.getDisplayDuration(itemRunTimeTicks)
            });
        }
    }
}

/**
 * 添加官方评级信息
 * @param showOfficialRatingInfo - 是否显示官方评级信息
 * @param itemOfficialRating - 官方评级
 * @param itemType - 媒体项类型
 * @param addMiscInfo - 添加杂项信息的回调函数
 */
function addOfficialRatingInfo(
    showOfficialRatingInfo: boolean,
    itemOfficialRating: NullableString,
    itemType: ItemKind,
    addMiscInfo: (val: MiscInfo) => void
): void {
    if (
        showOfficialRatingInfo
        && itemOfficialRating
        && itemType !== ItemKind.Season
        && itemType !== ItemKind.Episode
    ) {
        addMiscInfo({
            text: itemOfficialRating,
            cssClass: 'mediaInfoText mediaInfoOfficialRating'
        });
    }
}

/**
 * 添加音频容器信息
 * @param showAudioContainerInfo - 是否显示音频容器信息
 * @param itemContainer - 容器格式
 * @param itemType - 媒体项类型
 * @param addMiscInfo - 添加杂项信息的回调函数
 */
function addAudioContainer(
    showAudioContainerInfo: boolean,
    itemContainer: NullableString,
    itemType: ItemKind,
    addMiscInfo: (val: MiscInfo) => void
): void {
    if (
        showAudioContainerInfo
        && itemContainer
        && itemType === ItemKind.Audio
    ) {
        addMiscInfo({ text: itemContainer });
    }
}

/**
 * 添加照片尺寸信息
 * @param showPhotoSizeInfo - 是否显示照片尺寸信息
 * @param itemMediaType - 媒体类型
 * @param itemWidth - 宽度
 * @param itemHeight - 高度
 * @param addMiscInfo - 添加杂项信息的回调函数
 */
function addPhotoSize(
    showPhotoSizeInfo: boolean,
    itemMediaType: ItemMediaKind,
    itemWidth: NullableNumber,
    itemHeight: NullableNumber,
    addMiscInfo: (val: MiscInfo) => void
): void {
    if (
        showPhotoSizeInfo
        && itemMediaType === ItemMediaKind.Photo
        && itemWidth
        && itemHeight
    ) {
        const size = `${itemWidth}x${itemHeight}`;

        addMiscInfo({ text: size });
    }
}

/**
 * 主要媒体信息Hook的属性接口
 */
interface UsePrimaryMediaInfoProps extends PrimaryInfoOpts {
    item: ItemDto;
}

/**
 * 主要媒体信息Hook
 * 根据配置选项处理媒体项并返回相应的信息数组
 * @param props - Hook属性
 * @returns 媒体杂项信息数组
 */
function usePrimaryMediaInfo({
    item,
    showYearInfo = false,
    showAudioContainerInfo = false,
    showEpisodeTitleInfo = false,
    showOriginalAirDateInfo = false,
    showFolderRuntimeInfo = false,
    showRuntimeInfo = false,
    showItemCountInfo = false,
    showSeriesTimerInfo = false,
    showStartDateInfo = false,
    showProgramIndicatorInfo = false,
    includeEpisodeTitleIndexNumber = false,
    showOfficialRatingInfo = false,
    showVideo3DFormatInfo = false,
    showPhotoSizeInfo = false
}: UsePrimaryMediaInfoProps) {
    const {
        EndDate,
        Status,
        StartDate,
        ProductionYear,
        Video3DFormat,
        Type,
        Width,
        Height,
        MediaType,
        SongCount,
        RecordAnyTime,
        RecordAnyChannel,
        ChannelName,
        ChildCount,
        RunTimeTicks,
        PremiereDate,
        OfficialRating,
        Container
    } = item;

    // 存储所有杂项信息的数组
    const miscInfo: MiscInfo[] = [];

    // 添加杂项信息的辅助函数
    const addMiscInfo = (val: MiscInfo) => {
        if (val) {
            miscInfo.push(val);
        }
    };

    // 判断是否启用文件夹运行时
    const isFolderRuntimeEnabled = shouldShowFolderRuntime(
        showFolderRuntimeInfo,
        Type,
        MediaType
    );

    // 添加曲目数量或项目数量
    addTrackCountOrItemCount(
        isFolderRuntimeEnabled,
        showItemCountInfo,
        SongCount,
        ChildCount,
        RunTimeTicks,
        Type,
        addMiscInfo
    );

    // 添加原始播出日期信息
    addOriginalAirDateInfo(
        showOriginalAirDateInfo,
        Type,
        MediaType,
        PremiereDate,
        addMiscInfo
    );

    // 添加系列定时器信息
    addSeriesTimerInfo(
        showSeriesTimerInfo,
        Type,
        RecordAnyTime,
        StartDate,
        RecordAnyChannel,
        ChannelName,
        addMiscInfo
    );

    // 添加开始日期信息
    addStartDateInfo(showStartDateInfo, StartDate, Type, addMiscInfo);

    // 添加系列制作年份信息
    addSeriesProductionYearInfo(
        showYearInfo,
        ProductionYear,
        Type,
        Status,
        EndDate,
        addMiscInfo
    );

    // 添加节目指示器
    addProgramIndicators(
        showProgramIndicatorInfo,
        showEpisodeTitleInfo,
        includeEpisodeTitleIndexNumber,
        showOriginalAirDateInfo,
        showYearInfo,
        item,
        addMiscInfo
    );

    // 添加年份信息
    addYearInfo(
        showYearInfo,
        Type,
        MediaType,
        ProductionYear,
        PremiereDate,
        addMiscInfo
    );

    // 添加运行时间信息
    addRunTimeInfo(
        isFolderRuntimeEnabled,
        showRuntimeInfo,
        RunTimeTicks,
        Type,
        addMiscInfo
    );

    // 添加官方评级信息
    addOfficialRatingInfo(
        showOfficialRatingInfo,
        OfficialRating,
        Type,
        addMiscInfo
    );

    // 添加视频3D格式信息
    addVideo3DFormat(showVideo3DFormatInfo, Video3DFormat, addMiscInfo);

    // 添加照片尺寸信息
    addPhotoSize(showPhotoSizeInfo, MediaType, Width, Height, addMiscInfo);

    // 添加音频容器信息
    addAudioContainer(showAudioContainerInfo, Container, Type, addMiscInfo);

    return miscInfo;
}

export default usePrimaryMediaInfo;
