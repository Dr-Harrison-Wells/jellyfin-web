/**
 * 媒体主要信息显示选项
 * 控制在媒体详情中显示哪些主要信息
 */
export interface PrimaryInfoOpts {
    /** 是否显示年份信息 */
    showYearInfo?: boolean;
    /** 是否显示音频容器信息 */
    showAudioContainerInfo?: boolean;
    /** 是否显示剧集标题信息 */
    showEpisodeTitleInfo?: boolean;
    /** 是否在剧集标题中包含索引号 */
    includeEpisodeTitleIndexNumber?: boolean;
    /** 是否显示原始播出日期信息 */
    showOriginalAirDateInfo?: boolean;
    /** 是否显示文件夹运行时长信息 */
    showFolderRuntimeInfo?: boolean;
    /** 是否显示运行时长信息 */
    showRuntimeInfo?: boolean;
    /** 是否显示项目数量信息 */
    showItemCountInfo?: boolean;
    /** 是否显示系列定时器信息 */
    showSeriesTimerInfo?: boolean;
    /** 是否显示开始日期信息 */
    showStartDateInfo?: boolean;
    /** 是否显示节目指示器信息 */
    showProgramIndicatorInfo?: boolean;
    /** 是否显示官方分级信息 */
    showOfficialRatingInfo?: boolean;
    /** 是否显示 3D 视频格式信息 */
    showVideo3DFormatInfo?: boolean;
    /** 是否显示照片尺寸信息 */
    showPhotoSizeInfo?: boolean;
}

/**
 * 媒体次要信息显示选项
 * 控制在媒体详情中显示哪些次要信息
 */
export interface SecondaryInfoOpts {
    /** 是否显示节目时间信息 */
    showProgramTimeInfo?: boolean;
    /** 是否显示开始日期信息 */
    showStartDateInfo?: boolean;
    /** 是否显示结束日期信息 */
    showEndDateInfo?: boolean;
    /** 是否显示频道号信息 */
    showChannelNumberInfo?: boolean;
    /** 是否显示频道信息 */
    showChannelInfo?: boolean;
    /** 频道是否可交互 */
    channelInteractive?: boolean;
}

/**
 * 媒体统计信息显示选项
 * 控制在媒体详情中显示哪些技术统计信息
 */
export interface MediaInfoStatsOpts {
    /** 是否显示视频类型信息 */
    showVideoTypeInfo?: boolean;
    /** 是否显示分辨率信息 */
    showResolutionInfo?: boolean;
    /** 是否显示视频流编解码器信息 */
    showVideoStreamCodecInfo?: boolean;
    /** 是否显示音频声道信息 */
    showAudoChannelInfo?: boolean;
    /** 是否显示音频流编解码器信息 */
    showAudioStreamCodecInfo?: boolean;
    /** 是否显示添加日期信息 */
    showDateAddedInfo?: boolean;
}
