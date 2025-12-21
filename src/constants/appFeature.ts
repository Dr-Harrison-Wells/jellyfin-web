/**
 * 应用功能特性标志
 *
 * 此枚举定义了应用程序可能支持的各种功能特性。
 * 用于在运行时检测和启用/禁用特定功能。
 */
export enum AppFeature {
    /** 应用支持在投屏菜单打开时更改 URL 哈希 */
    CastMenuHashChange = 'castmenuhashchange',
    /** 应用支持 Chromecast 投屏功能 */
    Chromecast = 'chromecast',
    /** 应用支持通过菜单项显示客户端设置 */
    ClientSettings = 'clientsettings',
    /** 应用支持配置显示语言 */
    DisplayLanguage = 'displaylanguage',
    /** 应用支持配置显示模式（电视、桌面等） */
    DisplayMode = 'displaymode',
    /** 应用支持通过菜单项显示下载管理界面 */
    DownloadManagement = 'downloadmanagement',
    /** 应用支持通过返回导航退出 */
    Exit = 'exit',
    /** 应用支持通过菜单项退出 */
    ExitMenu = 'exitmenu',
    /** 应用支持打开外部 URL 链接 */
    ExternalLinks = 'externallinks',
    /** 应用支持启用外部播放器 */
    ExternalPlayerIntent = 'externalplayerintent',
    /** 应用支持文件下载功能 */
    FileDownload = 'filedownload',
    /** 应用支持文件输入元素 */
    FileInput = 'fileinput',
    /** 应用支持启用全屏媒体播放 */
    Fullscreen = 'fullscreenchange',
    /** 应用支持音频元素自动播放 */
    HtmlAudioAutoplay = 'htmlaudioautoplay',
    /** 应用支持视频元素自动播放 */
    HtmlVideoAutoplay = 'htmlvideoautoplay',
    /** 应用支持切换多个服务器 */
    MultiServer = 'multiserver',
    /** 应用支持原生播放蓝光文件夹 */
    NativeBluRayPlayback = 'nativeblurayplayback',
    /** 应用支持原生播放 DVD 文件夹 */
    NativeDvdPlayback = 'nativedvdplayback',
    /** 应用支持原生播放 ISO 镜像文件 */
    NativeIsoPlayback = 'nativeisoplayback',
    /** 应用支持物理音量按钮控制 */
    PhysicalVolumeControl = 'physicalvolumecontrol',
    /** 应用支持播放远程音频 */
    RemoteAudio = 'remoteaudio',
    /** 应用支持远程控制（投屏）功能 */
    RemoteControl = 'remotecontrol',
    /** 应用支持播放远程视频 */
    RemoteVideo = 'remotevideo',
    /** 应用支持显示屏幕保护程序 */
    Screensaver = 'screensaver',
    /** 应用支持内容分享功能 */
    Sharing = 'sharing',
    /** 应用支持配置字幕外观样式 */
    SubtitleAppearance = 'subtitleappearancesettings',
    /** 应用支持配置字幕烧录设置 */
    SubtitleBurnIn = 'subtitleburnsettings',
    /** 应用支持在新页面中打开 URL */
    TargetBlank = 'targetblank'
}
