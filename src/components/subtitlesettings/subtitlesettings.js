// 导入应用特性常量
import { AppFeature } from 'constants/appFeature';
// 导入国际化工具
import globalize from '../../lib/globalize';
// 导入服务器连接相关API
import { ServerConnections } from 'lib/jellyfin-apiclient';
// 导入应用主机相关方法
import { appHost } from '../apphost';
// 导入应用设置
import appSettings from '../../scripts/settings/appSettings';
// 导入焦点管理器
import focusManager from '../focusManager';
// 导入布局管理器
import layoutManager from '../layoutManager';
// 导入加载动画相关方法
import loading from '../loading/loading';
// 导入字幕外观辅助工具
import subtitleAppearanceHelper from './subtitleappearancehelper';
// 导入设置辅助工具
import settingsHelper from '../settingshelper';
// 导入DOM操作工具
import dom from '../../scripts/dom';
// 导入事件工具
import Events from '../../utils/events.ts';

// 导入样式和自定义元素
import '../listview/listview.scss';
import '../../elements/emby-select/emby-select';
import '../../elements/emby-slider/emby-slider';
import '../../elements/emby-input/emby-input';
import '../../elements/emby-checkbox/emby-checkbox';
import '../../styles/flexstyles.scss';
import './subtitlesettings.scss';
// 导入消息提示工具
import toast from '../toast/toast';
// 导入字幕设置页面模板
import template from './subtitlesettings.template.html';

/**
 * 字幕设置模块。
 * @module components/subtitleSettings/subtitleSettings
 */

/**
 * 获取字幕外观设置对象。
 * @param {HTMLElement} context - 表单容器。
 * @returns {Object} 字幕外观设置。
 */
function getSubtitleAppearanceObject(context) {
    return {
        subtitleStyling: context.querySelector('#selectSubtitleStyling').value, // 字幕样式
        textSize: context.querySelector('#selectTextSize').value, // 字体大小
        textWeight: context.querySelector('#selectTextWeight').value, // 字体粗细
        dropShadow: context.querySelector('#selectDropShadow').value, // 阴影效果
        font: context.querySelector('#selectFont').value, // 字体类型
        textBackground: context.querySelector('#inputTextBackground').value, // 字体背景色
        textColor: layoutManager.tv ? context.querySelector('#selectTextColor').value : context.querySelector('#inputTextColor').value, // 字体颜色
        verticalPosition: context.querySelector('#sliderVerticalPosition').value // 垂直位置
    };
}

/**
 * 加载表单数据并初始化界面。
 * @param {HTMLElement} context - 表单容器。
 * @param {Object} user - 用户信息。
 * @param {Object} userSettings - 用户设置实例。
 * @param {Object} appearanceSettings - 字幕外观设置。
 * @param {Object} apiClient - API客户端。
 */
function loadForm(context, user, userSettings, appearanceSettings, apiClient) {
    apiClient.getCultures().then(function (allCultures) {
        // 如果支持字幕烧录且允许转码，显示相关选项
        if (appHost.supports(AppFeature.SubtitleBurnIn) && user.Policy.EnableVideoPlaybackTranscoding) {
            context.querySelector('.fldBurnIn').classList.remove('hide');
        }

        const selectSubtitleLanguage = context.querySelector('#selectSubtitleLanguage');

        // 填充语言选项
        settingsHelper.populateLanguages(selectSubtitleLanguage, allCultures);

        // 设置默认值
        selectSubtitleLanguage.value = user.Configuration.SubtitleLanguagePreference || '';
        context.querySelector('#selectSubtitlePlaybackMode').value = user.Configuration.SubtitleMode || '';

        // 触发模式变更事件
        context.querySelector('#selectSubtitlePlaybackMode').dispatchEvent(new CustomEvent('change', {}));

        // 设置外观相关字段
        context.querySelector('#selectSubtitleStyling').value = appearanceSettings.subtitleStyling || 'Auto';
        context.querySelector('#selectSubtitleStyling').dispatchEvent(new CustomEvent('change', {}));
        context.querySelector('#selectTextSize').value = appearanceSettings.textSize || '';
        context.querySelector('#selectTextWeight').value = appearanceSettings.textWeight || 'normal';
        context.querySelector('#selectDropShadow').value = appearanceSettings.dropShadow || '';
        context.querySelector('#inputTextBackground').value = appearanceSettings.textBackground || 'transparent';
        context.querySelector('#selectTextColor').value = appearanceSettings.textColor || '#ffffff';
        context.querySelector('#inputTextColor').value = appearanceSettings.textColor || '#ffffff';
        context.querySelector('#selectFont').value = appearanceSettings.font || '';
        context.querySelector('#sliderVerticalPosition').value = appearanceSettings.verticalPosition;

        // 设置烧录相关字段
        context.querySelector('#selectSubtitleBurnIn').value = appSettings.get('subtitleburnin') || '';
        context.querySelector('#chkSubtitleRenderPgs').checked = appSettings.get('subtitlerenderpgs') === 'true';

        context.querySelector('#selectSubtitleBurnIn').dispatchEvent(new CustomEvent('change', {}));
        context.querySelector('#chkAlwaysBurnInSubtitleWhenTranscoding').checked = appSettings.alwaysBurnInSubtitleWhenTranscoding();

        // 初始化外观预览
        onAppearanceFieldChange({
            target: context.querySelector('#selectTextSize')
        });

        loading.hide();
    });
}

/**
 * 保存用户字幕相关设置。
 * @param {HTMLElement} context - 表单容器。
 * @param {Object} user - 用户信息。
 * @param {Object} userSettingsInstance - 用户设置实例。
 * @param {string} appearanceKey - 外观设置键。
 * @param {Object} apiClient - API客户端。
 * @returns {Promise}
 */
function saveUser(context, user, userSettingsInstance, appearanceKey, apiClient) {
    let appearanceSettings = userSettingsInstance.getSubtitleAppearanceSettings(appearanceKey);
    // 合并表单数据到外观设置
    appearanceSettings = Object.assign(appearanceSettings, getSubtitleAppearanceObject(context));

    userSettingsInstance.setSubtitleAppearanceSettings(appearanceSettings, appearanceKey);

    // 保存语言和模式
    user.Configuration.SubtitleLanguagePreference = context.querySelector('#selectSubtitleLanguage').value;
    user.Configuration.SubtitleMode = context.querySelector('#selectSubtitlePlaybackMode').value;

    return apiClient.updateUserConfiguration(user.Id, user.Configuration);
}

/**
 * 保存所有设置并显示保存结果。
 * @param {Object} instance - 当前实例。
 * @param {HTMLElement} context - 表单容器。
 * @param {string} userId - 用户ID。
 * @param {Object} userSettings - 用户设置实例。
 * @param {Object} apiClient - API客户端。
 * @param {boolean} enableSaveConfirmation - 是否显示保存提示。
 */
function save(instance, context, userId, userSettings, apiClient, enableSaveConfirmation) {
    loading.show();

    // 保存烧录相关设置
    appSettings.set('subtitleburnin', context.querySelector('#selectSubtitleBurnIn').value);
    appSettings.set('subtitlerenderpgs', context.querySelector('#chkSubtitleRenderPgs').checked);
    appSettings.alwaysBurnInSubtitleWhenTranscoding(context.querySelector('#chkAlwaysBurnInSubtitleWhenTranscoding').checked);

    // 获取用户并保存用户设置
    apiClient.getUser(userId).then(function (user) {
        saveUser(context, user, userSettings, instance.appearanceKey, apiClient).then(function () {
            loading.hide();
            if (enableSaveConfirmation) {
                toast(globalize.translate('SettingsSaved'));
            }

            Events.trigger(instance, 'saved');
        }, function () {
            loading.hide();
        });
    });
}

/**
 * 字幕模式变更事件处理。
 * @param {Event} e - 事件对象。
 */
function onSubtitleModeChange(e) {
    const view = dom.parentWithClass(e.target, 'subtitlesettings');

    // 隐藏所有帮助信息
    const subtitlesHelp = view.querySelectorAll('.subtitlesHelp');
    for (let i = 0, length = subtitlesHelp.length; i < length; i++) {
        subtitlesHelp[i].classList.add('hide');
    }
    // 显示当前模式对应的帮助信息
    view.querySelector('.subtitles' + this.value + 'Help').classList.remove('hide');
}

/**
 * 字幕样式变更事件处理。
 * @param {Event} e - 事件对象。
 */
function onSubtitleStyleChange(e) {
    const view = dom.parentWithClass(e.target, 'subtitlesettings');

    // 隐藏所有样式帮助信息
    const subtitleStylingHelperElements = view.querySelectorAll('.subtitleStylingHelp');
    subtitleStylingHelperElements.forEach((elem)=>{
        elem.classList.add('hide');
    });
    // 显示当前样式对应的帮助信息
    view.querySelector(`.subtitleStyling${this.value}Help`).classList.remove('hide');
}

/**
 * 字幕烧录选项变更事件处理。
 * @param {Event} e - 事件对象。
 */
function onSubtitleBurnInChange(e) {
    const view = dom.parentWithClass(e.target, 'subtitlesettings');
    const fieldRenderPgs = view.querySelector('.fldRenderPgs');

    // 仅当烧录模式为自动（空字符串）时显示PGS选项
    fieldRenderPgs.classList.toggle('hide', !!this.value);
}

/**
 * 字幕外观字段变更事件处理。
 * @param {Event} e - 事件对象。
 */
function onAppearanceFieldChange(e) {
    const view = dom.parentWithClass(e.target, 'subtitlesettings');

    // 获取最新外观设置
    const appearanceSettings = getSubtitleAppearanceObject(view);

    // 应用到预览窗口
    const elements = {
        window: view.querySelector('.subtitleappearance-preview-window'),
        text: view.querySelector('.subtitleappearance-preview-text'),
        preview: true
    };

    subtitleAppearanceHelper.applyStyles(elements, appearanceSettings);

    // 应用到完整预览
    subtitleAppearanceHelper.applyStyles({
        window: view.querySelector('.subtitleappearance-fullpreview-window'),
        text: view.querySelector('.subtitleappearance-fullpreview-text')
    }, appearanceSettings);
}

// 字幕预览延迟时间（毫秒）
const subtitlePreviewDelay = 1000;
// 字幕预览定时器
let subtitlePreviewTimer;

/**
 * 显示字幕完整预览。
 * @param {boolean} persistent - 是否保持预览。
 */
function showSubtitlePreview(persistent) {
    clearTimeout(subtitlePreviewTimer);

    this._fullPreview.classList.remove('subtitleappearance-fullpreview-hide');

    if (persistent) {
        this._refFullPreview++;
    }

    if (this._refFullPreview === 0) {
        subtitlePreviewTimer = setTimeout(hideSubtitlePreview.bind(this), subtitlePreviewDelay);
    }
}

/**
 * 隐藏字幕完整预览。
 * @param {boolean} persistent - 是否保持预览。
 */
function hideSubtitlePreview(persistent) {
    clearTimeout(subtitlePreviewTimer);

    if (persistent) {
        this._refFullPreview--;
    }

    if (this._refFullPreview === 0) {
        this._fullPreview.classList.add('subtitleappearance-fullpreview-hide');
    }
}

/**
 * 页面嵌入与事件绑定。
 * @param {Object} options - 配置项。
 * @param {Object} self - 当前实例。
 */
function embed(options, self) {
    options.element.classList.add('subtitlesettings');
    options.element.innerHTML = globalize.translateHtml(template, 'core');

    // 绑定表单提交事件
    options.element.querySelector('form').addEventListener('submit', self.onSubmit.bind(self));

    // 绑定各类字段变更事件
    options.element.querySelector('#selectSubtitlePlaybackMode').addEventListener('change', onSubtitleModeChange);
    options.element.querySelector('#selectSubtitleStyling').addEventListener('change', onSubtitleStyleChange);
    options.element.querySelector('#selectSubtitleBurnIn').addEventListener('change', onSubtitleBurnInChange);
    options.element.querySelector('#selectTextSize').addEventListener('change', onAppearanceFieldChange);
    options.element.querySelector('#selectTextWeight').addEventListener('change', onAppearanceFieldChange);
    options.element.querySelector('#selectDropShadow').addEventListener('change', onAppearanceFieldChange);
    options.element.querySelector('#selectFont').addEventListener('change', onAppearanceFieldChange);
    options.element.querySelector('#selectTextColor').addEventListener('change', onAppearanceFieldChange);
    options.element.querySelector('#inputTextColor').addEventListener('change', onAppearanceFieldChange);
    options.element.querySelector('#inputTextBackground').addEventListener('change', onAppearanceFieldChange);

    // 显示保存按钮
    if (options.enableSaveButton) {
        options.element.querySelector('.btnSave').classList.remove('hide');
    }

    // 如果支持字幕外观自定义，显示相关区域并绑定预览事件
    if (appHost.supports(AppFeature.SubtitleAppearance)) {
        options.element.querySelector('.subtitleAppearanceSection').classList.remove('hide');

        self._fullPreview = options.element.querySelector('.subtitleappearance-fullpreview');
        self._refFullPreview = 0;

        const sliderVerticalPosition = options.element.querySelector('#sliderVerticalPosition');
        sliderVerticalPosition.addEventListener('input', onAppearanceFieldChange);
        sliderVerticalPosition.addEventListener('input', () => showSubtitlePreview.call(self));

        const eventPrefix = window.PointerEvent ? 'pointer' : 'mouse';
        sliderVerticalPosition.addEventListener(`${eventPrefix}enter`, () => showSubtitlePreview.call(self, true));
        sliderVerticalPosition.addEventListener(`${eventPrefix}leave`, () => hideSubtitlePreview.call(self, true));

        if (layoutManager.tv) {
            sliderVerticalPosition.addEventListener('focus', () => showSubtitlePreview.call(self, true));
            sliderVerticalPosition.addEventListener('blur', () => hideSubtitlePreview.call(self, true));

            // 等待自定义元素挂载
            setTimeout(() => {
                sliderVerticalPosition.classList.add('focusable');
                sliderVerticalPosition.enableKeyboardDragging();
            }, 0);

            // 替换颜色选择器
            dom.parentWithTag(options.element.querySelector('#inputTextColor'), 'DIV').classList.add('hide');
            dom.parentWithTag(options.element.querySelector('#selectTextColor'), 'DIV').classList.remove('hide');
        }

        // 绑定预览开关事件
        options.element.querySelector('.chkPreview').addEventListener('change', (e) => {
            if (e.target.checked) {
                showSubtitlePreview.call(self, true);
            } else {
                hideSubtitlePreview.call(self, true);
            }
        });
    }

    // 加载数据
    self.loadData();

    // 自动聚焦
    if (options.autoFocus) {
        focusManager.autoFocus(options.element);
    }
}


/**
 * 字幕设置主类。
 */
export class SubtitleSettings {
    /**
     * 构造函数。
     * @param {Object} options - 配置项。
     */
    constructor(options) {
        this.options = options;
        embed(options, this);
    }

    /**
     * 加载数据并初始化表单。
     */
    loadData() {
        const self = this;
        const context = self.options.element;

        loading.show();

        const userId = self.options.userId;
        const apiClient = ServerConnections.getApiClient(self.options.serverId);
        const userSettings = self.options.userSettings;

        apiClient.getUser(userId).then(function (user) {
            userSettings.setUserInfo(userId, apiClient).then(function () {
                self.dataLoaded = true;

                const appearanceSettings = userSettings.getSubtitleAppearanceSettings(self.options.appearanceKey);

                loadForm(context, user, userSettings, appearanceSettings, apiClient);
            });
        });
    }

    /**
     * 提交表单。
     */
    submit() {
        this.onSubmit(null);
    }

    /**
     * 销毁实例。
     */
    destroy() {
        this.options = null;
    }

    /**
     * 表单提交事件处理。
     * @param {Event} e - 事件对象。
     * @returns {boolean}
     */
    onSubmit(e) {
        const self = this;
        const apiClient = ServerConnections.getApiClient(self.options.serverId);
        const userId = self.options.userId;
        const userSettings = self.options.userSettings;

        userSettings.setUserInfo(userId, apiClient).then(function () {
            const enableSaveConfirmation = self.options.enableSaveConfirmation;
            save(self, self.options.element, userId, userSettings, apiClient, enableSaveConfirmation);
        });

        // 禁止默认表单提交
        if (e) {
            e.preventDefault();
        }
        return false;
    }
}

// 默认导出字幕设置类
export default SubtitleSettings;
