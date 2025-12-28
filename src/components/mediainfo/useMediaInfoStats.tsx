/**
 * 媒体信息统计 Hook
 * 用于获取和格式化媒体项的各种信息（分辨率、编解码器、音频通道等）
 */

import { MediaStreamType } from '@jellyfin/sdk/lib/generated-client/models/media-stream-type';
import { VideoType } from '@jellyfin/sdk/lib/generated-client/models/video-type';
import type { MediaStream } from '@jellyfin/sdk/lib/generated-client/models/media-stream';
import itemHelper from 'components/itemHelper';
import datetime from 'scripts/datetime';
import globalize from 'lib/globalize';

import type { ItemDto } from 'types/base/models/item-dto';
import type { MiscInfo } from 'types/mediaInfoItem';
import type { NullableString } from 'types/base/common/shared/types';
import type { MediaInfoStatsOpts } from './type';

/**
 * 获取分辨率标签
 * @param label - 分辨率标签（如 '1080p'）
 * @param isInterlaced - 是否为隔行扫描
 * @returns 格式化的分辨率标签（隔行扫描时添加 'i' 后缀）
 */
const getResolution = (label: string, isInterlaced?: boolean) =>
    isInterlaced ? `${label}i` : label;

/**
 * 根据视频流的宽度和高度获取分辨率文本
 * @param showResolutionInfo - 是否显示分辨率信息
 * @param stream - 媒体流对象
 * @returns 分辨率文本（如 '4K'、'1080p'、'720p' 等）或 null
 */
const getResolutionText = (
    showResolutionInfo: boolean,
    stream: MediaStream
) => {
    const { Width, Height, IsInterlaced } = stream;

    if (showResolutionInfo && Width && Height) {
        switch (true) {
            case Width >= 3800 || Height >= 2000:
                return '4K';
            case Width >= 2500 || Height >= 1400:
                return getResolution('1440p', IsInterlaced);
            case Width >= 1800 || Height >= 1000:
                return getResolution('1080p', IsInterlaced);
            case Width >= 1200 || Height >= 700:
                return getResolution('720p', IsInterlaced);
            case Width >= 700 || Height >= 400:
                return getResolution('480p', IsInterlaced);
            default:
                return null;
        }
    }

    return null;
};

/**
 * 根据音频通道数获取音频通道文本
 * @param showAudoChannelInfo - 是否显示音频通道信息
 * @param stream - 媒体流对象
 * @returns 音频通道文本（如 '7.1'、'5.1'、'2.0' 等）或 null
 */
const getAudoChannelText = (
    showAudoChannelInfo: boolean,
    stream: MediaStream
) => {
    const { Channels } = stream;

    if (showAudoChannelInfo && Channels) {
        switch (true) {
            case Channels === 8:
                return '7.1';
            case Channels === 7:
                return '6.1';
            case Channels === 6:
                return '5.1';
            case Channels === 2:
                return '2.0';
            default:
                return null;
        }
    }

    return null;
};

/**
 * 获取用于显示的音频流
 * 返回默认音频流或第一个音频流
 * @param item - 媒体项对象
 * @returns 音频流对象
 */
function getAudioStreamForDisplay(item: ItemDto) {
    const mediaSource = (item.MediaSources || [])[0] || {};

    return (
        (mediaSource.MediaStreams || []).filter((i) => {
            return (
                i.Type === MediaStreamType.Audio
                && (i.Index === mediaSource.DefaultAudioStreamIndex
                    || mediaSource.DefaultAudioStreamIndex == null)
            );
        })[0] || {}
    );
}

/**
 * 获取用于显示的视频流
 * 返回第一个视频流
 * @param item - 媒体项对象
 * @returns 视频流对象
 */
function getVideoStreamForDisplay(item: ItemDto) {
    const mediaSource = (item.MediaSources || [])[0] || {};

    return (
        (mediaSource.MediaStreams || []).filter((i) => {
            return i.Type === MediaStreamType.Video;
        })[0] || {}
    );
}

/**
 * 添加视频类型信息（如 DVD、蓝光）
 * @param showVideoTypeInfo - 是否显示视频类型信息
 * @param itemVideoType - 视频类型
 * @param addMiscInfo - 添加杂项信息的回调函数
 */
function addVideoType(
    showVideoTypeInfo: boolean,
    itemVideoType: VideoType | undefined,
    addMiscInfo: (val: MiscInfo) => void
): void {
    if (showVideoTypeInfo) {
        if (itemVideoType === VideoType.Dvd) {
            addMiscInfo({ type: 'mediainfo', text: 'Dvd' });
        }

        if (itemVideoType === VideoType.BluRay) {
            addMiscInfo({ type: 'mediainfo', text: 'BluRay' });
        }
    }
}

/**
 * 添加分辨率信息
 * @param showResolutionInfo - 是否显示分辨率信息
 * @param videoStream - 视频流对象
 * @param addMiscInfo - 添加杂项信息的回调函数
 */
function addResolution(
    showResolutionInfo: boolean,
    videoStream: MediaStream,
    addMiscInfo: (val: MiscInfo) => void
): void {
    const resolutionText = getResolutionText(showResolutionInfo, videoStream);

    if (resolutionText) {
        addMiscInfo({ type: 'mediainfo', text: resolutionText });
    }
}

/**
 * 添加视频编解码器信息
 * @param showVideoCodecInfo - 是否显示视频编解码器信息
 * @param videoStreamCodec - 视频流编解码器
 * @param addMiscInfo - 添加杂项信息的回调函数
 */
function addVideoStreamCodec(
    showVideoCodecInfo: boolean,
    videoStreamCodec: NullableString,
    addMiscInfo: (val: MiscInfo) => void
): void {
    if (showVideoCodecInfo && videoStreamCodec) {
        addMiscInfo({ type: 'mediainfo', text: videoStreamCodec });
    }
}

/**
 * 添加音频通道信息
 * @param showAudoChannelInfo - 是否显示音频通道信息
 * @param audioStream - 音频流对象
 * @param addMiscInfo - 添加杂项信息的回调函数
 */
function addAudoChannel(
    showAudoChannelInfo: boolean,
    audioStream: MediaStream,
    addMiscInfo: (val: MiscInfo) => void
): void {
    const audioChannelText = getAudoChannelText(
        showAudoChannelInfo,
        audioStream
    );

    if (audioChannelText) {
        addMiscInfo({ type: 'mediainfo', text: audioChannelText });
    }
}

/**
 * 添加音频编解码器信息
 * 对于 DCA/DTS 编解码器，优先显示配置文件（Profile）
 * @param showAudioStreamCodecInfo - 是否显示音频编解码器信息
 * @param audioStream - 音频流对象
 * @param addMiscInfo - 添加杂项信息的回调函数
 */
function addAudioStreamCodec(
    showAudioStreamCodecInfo: boolean,
    audioStream: MediaStream,
    addMiscInfo: (val: MiscInfo) => void
): void {
    const audioCodec = (audioStream.Codec || '').toLowerCase();

    if (showAudioStreamCodecInfo) {
        if (
            (audioCodec === 'dca' || audioCodec === 'dts')
            && audioStream?.Profile
        ) {
            addMiscInfo({ type: 'mediainfo', text: audioStream.Profile });
        } else if (audioStream?.Codec) {
            addMiscInfo({ type: 'mediainfo', text: audioStream.Codec });
        }
    }
}

/**
 * 添加添加日期信息
 * 显示项目添加到媒体库的日期和时间
 * @param showDateAddedInfo - 是否显示添加日期信息
 * @param item - 媒体项对象
 * @param addMiscInfo - 添加杂项信息的回调函数
 */
function addDateAdded(
    showDateAddedInfo: boolean,
    item: ItemDto,
    addMiscInfo: (val: MiscInfo) => void
): void {
    if (
        showDateAddedInfo
        && item.DateCreated
        && itemHelper.enableDateAddedDisplay(item)
    ) {
        const dateCreated = datetime.parseISO8601Date(item.DateCreated);
        addMiscInfo({
            type: 'added',
            text: globalize.translate(
                'AddedOnValue',
                `${datetime.toLocaleDateString(
                    dateCreated
                )} ${datetime.getDisplayTime(dateCreated)}`
            )
        });
    }
}

/**
 * useMediaInfoStats Hook 的属性接口
 */
interface UseMediaInfoStatsProps extends MediaInfoStatsOpts {
    /** 媒体项对象 */
    item: ItemDto;
}

/**
 * 媒体信息统计 Hook
 * 收集并返回媒体项的各种信息（分辨率、编解码器、音频通道、添加日期等）
 * @param props - Hook 属性
 * @returns 杂项信息数组
 */
function useMediaInfoStats({
    item,
    showVideoTypeInfo = false,
    showResolutionInfo = false,
    showVideoStreamCodecInfo = false,
    showAudoChannelInfo = false,
    showAudioStreamCodecInfo = false,
    showDateAddedInfo = false
}: UseMediaInfoStatsProps) {
    // 存储所有杂项信息的数组
    const miscInfo: MiscInfo[] = [];

    // 添加杂项信息的辅助函数
    const addMiscInfo = (val: MiscInfo) => {
        if (val) {
            miscInfo.push(val);
        }
    };

    // 获取用于显示的视频流
    const videoStream = getVideoStreamForDisplay(item);

    // 获取用于显示的音频流
    const audioStream = getAudioStreamForDisplay(item);

    // 添加视频类型信息（DVD、蓝光等）
    addVideoType(showVideoTypeInfo, item.VideoType, addMiscInfo);

    // 添加分辨率信息
    addResolution(showResolutionInfo, videoStream, addMiscInfo);

    // 添加视频编解码器信息
    addVideoStreamCodec(
        showVideoStreamCodecInfo,
        videoStream.Codec,
        addMiscInfo
    );

    // 添加音频通道信息
    addAudoChannel(showAudoChannelInfo, audioStream, addMiscInfo);

    // 添加音频编解码器信息
    addAudioStreamCodec(showAudioStreamCodecInfo, audioStream, addMiscInfo);

    // 添加添加日期信息
    addDateAdded(showDateAddedInfo, item, addMiscInfo);

    return miscInfo;
}

export default useMediaInfoStats;
