// 导入媒体片段类型枚举
import { MediaSegmentType } from '@jellyfin/sdk/lib/generated-client/models/media-segment-type';
// 导入 HTML 转义工具
import escapeHTML from 'escape-html';

// 导入媒体片段操作常量
import { MediaSegmentAction } from 'apps/stable/features/playback/constants/mediaSegmentAction';
// 导入媒体片段设置相关工具函数
import { getId, getMediaSegmentAction } from 'apps/stable/features/playback/utils/mediaSegmentSettings';
// 导入应用功能常量
import { AppFeature } from 'constants/appFeature';
// 导入服务器连接管理器
import { ServerConnections } from 'lib/jellyfin-apiclient';

// 导入应用设置管理器
import appSettings from '../../scripts/settings/appSettings';
// 导入应用主机工具
import { appHost } from '../apphost';
// 导入浏览器检测工具
import browser from '../../scripts/browser';
// 导入焦点管理器
import focusManager from '../focusManager';
// 导入质量选项工具
import qualityoptions from '../qualityOptions';
// 导入国际化工具
import globalize from '../../lib/globalize';
// 导入加载状态管理器
import loading from '../loading/loading';
// 导入事件工具
import Events from '../../utils/events.ts';
// 导入提示消息组件
import toast from '../toast/toast';
// 导入播放设置模板
import template from './playbackSettings.template.html';

// 导入下拉选择框组件
import '../../elements/emby-select/emby-select';
// 导入复选框组件
import '../../elements/emby-checkbox/emby-checkbox';

/**
 * 播放设置页（Playback Settings）表单逻辑：
 * - 负责把用户/设备/系统信息映射到表单控件
 * - 负责从表单读取并保存到 user.Configuration / appSettings / userSettings
 * - 该文件不负责路由或页面布局，仅负责表单数据绑定与保存
 */

/**
 * 填充"快进/快退时长"下拉框（单位：秒，内部存毫秒）
 * @param {HTMLSelectElement} select - 下拉选择框元素
 */
function fillSkipLengths(select) {
    // 可选的跳过时长选项（秒）
    const options = [5, 10, 15, 20, 25, 30];

    // 将秒转换为毫秒，并生成下拉选项
    select.innerHTML = options.map(option => {
        return {
            name: globalize.translate('ValueSeconds', option),
            value: option * 1000 // 转换为毫秒
        };
    }).map(o => {
        return `<option value="${o.value}">${o.name}</option>`;
    }).join('');
}

/**
 * 填充语言下拉框；空值表示"任意语言"
 * @param {HTMLSelectElement} select - 下拉选择框元素
 * @param {Array} languages - 可用的语言文化列表
 */
function populateLanguages(select, languages) {
    let html = '';

    // 添加"任意语言"选项（空值）
    html += `<option value=''>${globalize.translate('AnyLanguage')}</option>`;

    // 遍历所有语言并生成选项
    for (let i = 0, length = languages.length; i < length; i++) {
        const culture = languages[i];

        html += `<option value='${culture.ThreeLetterISOLanguageName}'>${culture.DisplayName}</option>`;
    }

    select.innerHTML = html;
}

/**
 * 渲染"媒体片段（片头/回顾/广告等）"的动作选择（跳过/询问/不处理等）
 * userSettings 中会以 segmentType 作为 key 存储每种类型的动作
 * @param {HTMLElement} container - 容器元素
 * @param {Object} userSettings - 用户设置对象
 */
function populateMediaSegments(container, userSettings) {
    const selectedValues = {};
    // 生成所有可用的操作选项（如：跳过、询问、不处理等）
    const actionOptions = Object.values(MediaSegmentAction)
        .map(action => {
            const actionLabel = globalize.translate(`MediaSegmentAction.${action}`);
            return `<option value='${action}'>${actionLabel}</option>`;
        })
        .join('');

    // 按逻辑顺序列出媒体片段类型（排除"未知"类型）
    // 包括：片头(Intro)、预览(Preview)、回顾(Recap)、广告(Commercial)、片尾(Outro)
    const segmentSettings = [
        // List the types in a logical order (and exclude "Unknown" type)
        MediaSegmentType.Intro,
        MediaSegmentType.Preview,
        MediaSegmentType.Recap,
        MediaSegmentType.Commercial,
        MediaSegmentType.Outro
    ].map(segmentType => {
        const segmentTypeLabel = globalize.translate('LabelMediaSegmentsType', globalize.translate(`MediaSegmentType.${segmentType}`));
        const id = getId(segmentType);
        // 获取当前片段类型的操作设置
        selectedValues[id] = getMediaSegmentAction(userSettings, segmentType);
        return `<div class="selectContainer">
<select is="emby-select" id="${id}" class="segmentTypeAction" label="${segmentTypeLabel}">
    ${actionOptions}
</select>
</div>`;
    }).join('');

    container.innerHTML = segmentSettings;

    // 将保存的选中值设置到对应的下拉框
    Object.entries(selectedValues)
        .forEach(([id, value]) => {
            const field = container.querySelector(`#${id}`);
            if (field) field.value = value;
        });
}

/**
 * 填充码率/清晰度选项
 * - Audio 使用音频质量选项
 * - Video 使用视频质量选项，并可受 maxVideoWidth 限制
 * @param {HTMLSelectElement} select - 下拉选择框元素
 * @param {boolean} isInNetwork - 是否在本地网络
 * @param {string} mediatype - 媒体类型（'Audio' 或 'Video'）
 * @param {number} maxVideoWidth - 最大视频宽度
 */
function fillQuality(select, isInNetwork, mediatype, maxVideoWidth) {
    const options = mediatype === 'Audio' ? qualityoptions.getAudioQualityOptions({

        currentMaxBitrate: appSettings.maxStreamingBitrate(isInNetwork, mediatype),
        isAutomaticBitrateEnabled: appSettings.enableAutomaticBitrateDetection(isInNetwork, mediatype),
        enableAuto: true

    }) : qualityoptions.getVideoQualityOptions({

        currentMaxBitrate: appSettings.maxStreamingBitrate(isInNetwork, mediatype),
        isAutomaticBitrateEnabled: appSettings.enableAutomaticBitrateDetection(isInNetwork, mediatype),
        enableAuto: true,
        maxVideoWidth

    });

    // 为自动选项渲染空字符串而不是 0
    select.innerHTML = options.map(i => {
        // render empty string instead of 0 for the auto option
        return `<option value="${i.bitrate || ''}">${i.name}</option>`;
    }).join('');
}

/**
 * 根据当前设置，把最大码率写入下拉框
 * 自动码率检测启用时，使用空值代表"自动"
 * @param {HTMLSelectElement} select - 下拉选择框元素
 * @param {boolean} isInNetwork - 是否在本地网络
 * @param {string} mediatype - 媒体类型
 */
function setMaxBitrateIntoField(select, isInNetwork, mediatype) {
    fillQuality(select, isInNetwork, mediatype);

    // 如果启用自动码率检测，设置为空值；否则使用保存的最大码率
    if (appSettings.enableAutomaticBitrateDetection(isInNetwork, mediatype)) {
        select.value = '';
    } else {
        select.value = appSettings.maxStreamingBitrate(isInNetwork, mediatype);
    }
}

/**
 * 填充 Chromecast 播放清晰度选项
 * @param {HTMLSelectElement} select - 下拉选择框元素
 * @param {number} maxVideoWidth - 最大视频宽度
 */
function fillChromecastQuality(select, maxVideoWidth) {
    const options = qualityoptions.getVideoQualityOptions({

        currentMaxBitrate: appSettings.maxChromecastBitrate(),
        isAutomaticBitrateEnabled: !appSettings.maxChromecastBitrate(),
        enableAuto: true,
        maxVideoWidth
    });

    // 为自动选项渲染空字符串而不是 0
    select.innerHTML = options.map(i => {
        // render empty string instead of 0 for the auto option
        return `<option value="${i.bitrate || ''}">${i.name}</option>`;
    }).join('');

    // 设置当前选中的 Chromecast 码率值
    select.value = appSettings.maxChromecastBitrate() || '';
}

/**
 * 从下拉框读取最大码率并写回设置
 * 选择空值表示开启"自动码率检测"
 * @param {HTMLSelectElement} select - 下拉选择框元素
 * @param {boolean} isInNetwork - 是否在本地网络
 * @param {string} mediatype - 媒体类型
 */
function setMaxBitrateFromField(select, isInNetwork, mediatype) {
    if (select.value) {
        // 如果选择了具体码率值，保存该值并禁用自动检测
        appSettings.maxStreamingBitrate(isInNetwork, mediatype, select.value);
        appSettings.enableAutomaticBitrateDetection(isInNetwork, mediatype, false);
    } else {
        // 如果选择空值（自动），启用自动码率检测
        appSettings.enableAutomaticBitrateDetection(isInNetwork, mediatype, true);
    }
}

/**
 * 根据用户权限/是否同一用户/是否在内网等条件，显示或隐藏不同的质量设置区域
 * @param {HTMLElement} context - 上下文元素
 * @param {Object} user - 用户对象
 * @param {Object} apiClient - API 客户端
 */
function showHideQualityFields(context, user, apiClient) {
    // 如果用户有视频转码权限，显示视频质量设置
    if (user.Policy.EnableVideoPlaybackTranscoding) {
        context.querySelector('.videoQualitySection').classList.remove('hide');
    } else {
        context.querySelector('.videoQualitySection').classList.add('hide');
    }

    // 如果支持多服务器，同时显示内网和互联网质量选项
    if (appHost.supports(AppFeature.MultiServer)) {
        context.querySelector('.fldVideoInNetworkQuality').classList.remove('hide');
        context.querySelector('.fldVideoInternetQuality').classList.remove('hide');

        // 根据音频转码权限显示音乐质量设置
        if (user.Policy.EnableAudioPlaybackTranscoding) {
            context.querySelector('.musicQualitySection').classList.remove('hide');
        } else {
            context.querySelector('.musicQualitySection').classList.add('hide');
        }

        return;
    }

    // 获取终端信息以确定当前是否在本地网络
    apiClient.getEndpointInfo().then(endpointInfo => {
        if (endpointInfo.IsInNetwork) {
            // 在本地网络时，只显示内网质量选项
            context.querySelector('.fldVideoInNetworkQuality').classList.remove('hide');

            context.querySelector('.fldVideoInternetQuality').classList.add('hide');
            context.querySelector('.musicQualitySection').classList.add('hide');
        } else {
            // 在互联网时，显示互联网质量选项
            context.querySelector('.fldVideoInNetworkQuality').classList.add('hide');

            context.querySelector('.fldVideoInternetQuality').classList.remove('hide');

            // 根据音频转码权限显示音乐质量设置
            if (user.Policy.EnableAudioPlaybackTranscoding) {
                context.querySelector('.musicQualitySection').classList.remove('hide');
            } else {
                context.querySelector('.musicQualitySection').classList.add('hide');
            }
        }
    });
}

/**
 * 把服务器返回的 user / systemInfo / userSettings 加载到表单控件中
 * @param {HTMLElement} context - 上下文元素
 * @param {Object} user - 用户对象
 * @param {Object} userSettings - 用户设置对象
 * @param {Object} systemInfo - 系统信息
 * @param {Object} apiClient - API 客户端
 */
function loadForm(context, user, userSettings, systemInfo, apiClient) {
    const loggedInUserId = apiClient.getCurrentUserId();
    const userId = user.Id;

    // 根据用户权限和网络状态显示相应的质量设置
    showHideQualityFields(context, user, apiClient);

    // Safari 浏览器显示 Hi10p 设置（10 位色深视频支持）
    if (browser.safari) {
        context.querySelector('.fldEnableHi10p').classList.remove('hide');
    }

    // 仅 webOS 显示 HLS 分片长度限制：该设置只用于规避该平台的特定问题
    if (browser.web0s) {
        context.querySelector('.fldLimitSegmentLength').classList.remove('hide');
    }

    // 设置允许的音频声道数
    context.querySelector('#selectAllowedAudioChannels').value = userSettings.allowedAudioChannels();

    // 获取所有可用语言并填充到音频语言选择框
    apiClient.getCultures().then(allCultures => {
        populateLanguages(context.querySelector('#selectAudioLanguage'), allCultures);

        // 设置用户的音频语言偏好
        context.querySelector('#selectAudioLanguage', context).value = user.Configuration.AudioLanguagePreference || '';
        // 设置是否自动播放下一集
        context.querySelector('.chkEpisodeAutoPlay').checked = user.Configuration.EnableNextEpisodeAutoPlay || false;
    });

    // 如果支持外部播放器意图且是当前登录用户，显示外部播放器选项
    if (appHost.supports(AppFeature.ExternalPlayerIntent) && userId === loggedInUserId) {
        context.querySelector('.fldExternalPlayer').classList.remove('hide');
    } else {
        context.querySelector('.fldExternalPlayer').classList.add('hide');
    }

    // 如果是当前登录用户且有转码权限，显示质量设置区域
    if (userId === loggedInUserId && (user.Policy.EnableVideoPlaybackTranscoding || user.Policy.EnableAudioPlaybackTranscoding)) {
        context.querySelector('.qualitySections').classList.remove('hide');

        // 如果支持 Chromecast 且有视频转码权限，显示 Chromecast 质量设置
        if (appHost.supports(AppFeature.Chromecast) && user.Policy.EnableVideoPlaybackTranscoding) {
            context.querySelector('.fldChromecastQuality').classList.remove('hide');
        } else {
            context.querySelector('.fldChromecastQuality').classList.add('hide');
        }
    } else {
        context.querySelector('.qualitySections').classList.add('hide');
        context.querySelector('.fldChromecastQuality').classList.add('hide');
    }

    // 设置各种播放选项的复选框状态
    context.querySelector('.chkPlayDefaultAudioTrack').checked = user.Configuration.PlayDefaultAudioTrack || false; // 播放默认音轨
    context.querySelector('.chkPreferFmp4HlsContainer').checked = userSettings.preferFmp4HlsContainer(); // 首选 fMP4 HLS 容器
    context.querySelector('.chkLimitSegmentLength').checked = userSettings.limitSegmentLength(); // 限制片段长度
    context.querySelector('.chkEnableDts').checked = appSettings.enableDts(); // 启用 DTS 音频
    context.querySelector('.chkEnableTrueHd').checked = appSettings.enableTrueHd(); // 启用 TrueHD 音频
    context.querySelector('.chkEnableHi10p').checked = appSettings.enableHi10p(); // 启用 Hi10p（10 位色深）视频
    context.querySelector('.chkEnableCinemaMode').checked = userSettings.enableCinemaMode(); // 启用影院模式
    context.querySelector('#selectAudioNormalization').value = userSettings.selectAudioNormalization(); // 音频标准化设置
    context.querySelector('.chkEnableNextVideoOverlay').checked = userSettings.enableNextVideoInfoOverlay(); // 启用下个视频信息叠加层
    context.querySelector('.chkRememberAudioSelections').checked = user.Configuration.RememberAudioSelections || false; // 记住音频选择
    context.querySelector('.chkRememberSubtitleSelections').checked = user.Configuration.RememberSubtitleSelections || false; // 记住字幕选择
    context.querySelector('.chkExternalVideoPlayer').checked = appSettings.enableSystemExternalPlayers(); // 启用外部视频播放器
    context.querySelector('.chkLimitSupportedVideoResolution').checked = appSettings.limitSupportedVideoResolution(); // 限制支持的视频分辨率
    context.querySelector('#selectPreferredTranscodeVideoCodec').value = appSettings.preferredTranscodeVideoCodec(); // 首选转码视频编解码器
    context.querySelector('#selectPreferredTranscodeVideoAudioCodec').value = appSettings.preferredTranscodeVideoAudioCodec(); // 首选转码音频编解码器
    context.querySelector('.chkDisableVbrAudioEncoding').checked = appSettings.disableVbrAudio(); // 禁用 VBR（可变比特率）音频编码
    context.querySelector('.chkAlwaysRemuxFlac').checked = appSettings.alwaysRemuxFlac(); // 始终重新封装 FLAC
    context.querySelector('.chkAlwaysRemuxMp3').checked = appSettings.alwaysRemuxMp3(); // 始终重新封装 MP3

    // 设置视频和音频的质量/码率选项
    setMaxBitrateIntoField(context.querySelector('.selectVideoInNetworkQuality'), true, 'Video'); // 内网视频质量
    setMaxBitrateIntoField(context.querySelector('.selectVideoInternetQuality'), false, 'Video'); // 互联网视频质量
    setMaxBitrateIntoField(context.querySelector('.selectMusicInternetQuality'), false, 'Audio'); // 互联网音乐质量

    // 填充 Chromecast 质量选项
    fillChromecastQuality(context.querySelector('.selectChromecastVideoQuality'));

    // 填充 Chromecast 版本/应用选择器
    const selectChromecastVersion = context.querySelector('.selectChromecastVersion');
    let ccAppsHtml = '';
    for (const app of systemInfo.CastReceiverApplications) {
        ccAppsHtml += `<option value='${escapeHTML(app.Id)}'>${escapeHTML(app.Name)}</option>`;
    }
    selectChromecastVersion.innerHTML = ccAppsHtml;
    selectChromecastVersion.value = user.Configuration.CastReceiverId;

    // 设置最大视频宽度
    const selectMaxVideoWidth = context.querySelector('.selectMaxVideoWidth');
    selectMaxVideoWidth.value = appSettings.maxVideoWidth();

    // 设置快进时长选项
    const selectSkipForwardLength = context.querySelector('.selectSkipForwardLength');
    fillSkipLengths(selectSkipForwardLength);
    selectSkipForwardLength.value = userSettings.skipForwardLength();

    // 设置快退时长选项
    const selectSkipBackLength = context.querySelector('.selectSkipBackLength');
    fillSkipLengths(selectSkipBackLength);
    selectSkipBackLength.value = userSettings.skipBackLength();

    // 填充媒体片段操作设置（片头、广告等的处理方式）
    const mediaSegmentContainer = context.querySelector('.mediaSegmentActionContainer');
    populateMediaSegments(mediaSegmentContainer, userSettings);

    // 隐藏加载指示器
    loading.hide();
}

/**
 * 把表单中的设置写回到：
 * - appSettings（设备/浏览器本地偏好）
 * - user.Configuration（服务端用户配置）
 * - userSettingsInstance（播放相关的用户偏好扩展项）
 * @param {HTMLElement} context - 上下文元素
 * @param {Object} user - 用户对象
 * @param {Object} userSettingsInstance - 用户设置实例
 * @param {Object} apiClient - API 客户端
 * @returns {Promise} 返回更新用户配置的 Promise
 */
function saveUser(context, user, userSettingsInstance, apiClient) {
    appSettings.enableSystemExternalPlayers(context.querySelector('.chkExternalVideoPlayer').checked);

    appSettings.maxChromecastBitrate(context.querySelector('.selectChromecastVideoQuality').value);
    appSettings.maxVideoWidth(context.querySelector('.selectMaxVideoWidth').value);
    appSettings.limitSupportedVideoResolution(context.querySelector('.chkLimitSupportedVideoResolution').checked);
    appSettings.preferredTranscodeVideoCodec(context.querySelector('#selectPreferredTranscodeVideoCodec').value);
    appSettings.preferredTranscodeVideoAudioCodec(context.querySelector('#selectPreferredTranscodeVideoAudioCodec').value);

    appSettings.enableDts(context.querySelector('.chkEnableDts').checked);
    appSettings.enableTrueHd(context.querySelector('.chkEnableTrueHd').checked);

    appSettings.enableHi10p(context.querySelector('.chkEnableHi10p').checked);
    appSettings.disableVbrAudio(context.querySelector('.chkDisableVbrAudioEncoding').checked);
    appSettings.alwaysRemuxFlac(context.querySelector('.chkAlwaysRemuxFlac').checked);
    appSettings.alwaysRemuxMp3(context.querySelector('.chkAlwaysRemuxMp3').checked);

    setMaxBitrateFromField(context.querySelector('.selectVideoInNetworkQuality'), true, 'Video');
    setMaxBitrateFromField(context.querySelector('.selectVideoInternetQuality'), false, 'Video');
    setMaxBitrateFromField(context.querySelector('.selectMusicInternetQuality'), false, 'Audio');

    userSettingsInstance.allowedAudioChannels(context.querySelector('#selectAllowedAudioChannels').value);
    user.Configuration.AudioLanguagePreference = context.querySelector('#selectAudioLanguage').value;
    user.Configuration.PlayDefaultAudioTrack = context.querySelector('.chkPlayDefaultAudioTrack').checked;
    user.Configuration.EnableNextEpisodeAutoPlay = context.querySelector('.chkEpisodeAutoPlay').checked;
    userSettingsInstance.preferFmp4HlsContainer(context.querySelector('.chkPreferFmp4HlsContainer').checked);
    userSettingsInstance.limitSegmentLength(context.querySelector('.chkLimitSegmentLength').checked);
    userSettingsInstance.enableCinemaMode(context.querySelector('.chkEnableCinemaMode').checked);
    userSettingsInstance.selectAudioNormalization(context.querySelector('#selectAudioNormalization').value);
    userSettingsInstance.enableNextVideoInfoOverlay(context.querySelector('.chkEnableNextVideoOverlay').checked);
    user.Configuration.RememberAudioSelections = context.querySelector('.chkRememberAudioSelections').checked;
    user.Configuration.RememberSubtitleSelections = context.querySelector('.chkRememberSubtitleSelections').checked;
    user.Configuration.CastReceiverId = context.querySelector('.selectChromecastVersion').value;
    userSettingsInstance.skipForwardLength(context.querySelector('.selectSkipForwardLength').value);
    userSettingsInstance.skipBackLength(context.querySelector('.selectSkipBackLength').value);

    const segmentTypeActions = context.querySelectorAll('.segmentTypeAction') || [];
    Array.prototype.forEach.call(segmentTypeActions, actionEl => {
        userSettingsInstance.set(actionEl.id, actionEl.value, false);
    });

    return apiClient.updateUserConfiguration(user.Id, user.Configuration);
}

// 保存入口：获取最新 user 后提交更新，并根据需要弹出“已保存”提示
function save(instance, context, userId, userSettings, apiClient, enableSaveConfirmation) {
    loading.show();

    apiClient.getUser(userId).then(user => {
        saveUser(context, user, userSettings, apiClient).then(() => {
            loading.hide();
            if (enableSaveConfirmation) {
                toast(globalize.translate('SettingsSaved'));
            }

            Events.trigger(instance, 'saved');
        }, () => {
            loading.hide();
        });
    });
}

// 表单提交处理：先确保 userSettings 绑定到正确的 userId/apiClient，再执行保存
function onSubmit(e) {
    const self = this;
    const apiClient = ServerConnections.getApiClient(self.options.serverId);
    const userId = self.options.userId;
    const userSettings = self.options.userSettings;

    userSettings.setUserInfo(userId, apiClient).then(() => {
        const enableSaveConfirmation = self.options.enableSaveConfirmation;
        save(self, self.options.element, userId, userSettings, apiClient, enableSaveConfirmation);
    });

    // Disable default form submission
    if (e) {
        e.preventDefault();
    }
    return false;
}

// 将模板渲染到容器并绑定事件，然后触发首次数据加载
function embed(options, self) {
    options.element.innerHTML = globalize.translateHtml(template, 'core');

    options.element.querySelector('form').addEventListener('submit', onSubmit.bind(self));

    if (options.enableSaveButton) {
        options.element.querySelector('.btnSave').classList.remove('hide');
    }

    self.loadData();

    if (options.autoFocus) {
        focusManager.autoFocus(options.element);
    }
}

class PlaybackSettings {
    constructor(options) {
        this.options = options;
        embed(options, this);
    }

    // 加载 user + systemInfo + userSettings，并将其填充到表单
    loadData() {
        const self = this;
        const context = self.options.element;

        loading.show();

        const userId = self.options.userId;
        const apiClient = ServerConnections.getApiClient(self.options.serverId);
        const userSettings = self.options.userSettings;

        apiClient.getUser(userId).then(user => {
            apiClient.getSystemInfo().then(systemInfo => {
                userSettings.setUserInfo(userId, apiClient).then(() => {
                    self.dataLoaded = true;

                    loadForm(context, user, userSettings, systemInfo, apiClient);
                });
            });
        });
    }

    submit() {
        onSubmit.call(this);
    }

    // 释放引用，方便 GC
    destroy() {
        this.options = null;
    }
}

export default PlaybackSettings;
