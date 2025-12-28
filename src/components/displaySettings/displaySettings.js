import escapeHtml from 'escape-html';

import { AppFeature } from 'constants/appFeature';
import browser from '../../scripts/browser';
import layoutManager from '../layoutManager';
import { pluginManager } from '../pluginManager';
import { appHost } from '../apphost';
import focusManager from '../focusManager';
import datetime from '../../scripts/datetime';
import globalize from '../../lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import loading from '../loading/loading';
import skinManager from '../../scripts/themeManager';
import { PluginType } from '../../types/plugin.ts';
import Events from '../../utils/events.ts';
import '../../elements/emby-select/emby-select';
import '../../elements/emby-checkbox/emby-checkbox';
import '../../elements/emby-button/emby-button';
import '../../elements/emby-textarea/emby-textarea';
import toast from '../toast/toast';
import template from './displaySettings.template.html';

// 填充主题下拉框：从主题管理器获取所有主题并写入 <option>，最后选中用户已保存主题（否则使用默认主题）。
function fillThemes(select, selectedTheme) {
    skinManager.getThemes().then(themes => {
        select.innerHTML = themes.map(t => {
            return `<option value="${t.id}">${escapeHtml(t.name)}</option>`;
        }).join('');

        // get default theme
        const defaultTheme = themes.find(theme => theme.default);

        // set the current theme
        select.value = selectedTheme || defaultTheme.id;
    });
}

// 加载屏保插件列表：从插件系统读取 Screensaver 类型插件，并追加“无”选项。
function loadScreensavers(context, userSettings) {
    const selectScreensaver = context.querySelector('.selectScreensaver');
    const options = pluginManager.ofType(PluginType.Screensaver).map(plugin => {
        return {
            name: globalize.translate(plugin.name),
            value: plugin.id
        };
    });

    options.unshift({
        name: globalize.translate('None'),
        value: 'none'
    });

    selectScreensaver.innerHTML = options.map(o => {
        return `<option value="${o.value}">${escapeHtml(o.name)}</option>`;
    }).join('');

    selectScreensaver.value = userSettings.screensaver();

    if (!selectScreensaver.value) {
        // TODO: set the default instead of none
        selectScreensaver.value = 'none';
    }
}

// 根据平台能力显示/隐藏“显示缺失剧集”字段（某些电视端不支持/不适用）。
function showOrHideMissingEpisodesField(context) {
    if (browser.tizen || browser.web0s) {
        context.querySelector('.fldDisplayMissingEpisodes').classList.add('hide');
        return;
    }

    context.querySelector('.fldDisplayMissingEpisodes').classList.remove('hide');
}

// 将用户设置与当前用户信息渲染到表单控件上，并按宿主能力决定哪些字段可见。
function loadForm(context, user, userSettings) {
    if (appHost.supports(AppFeature.DisplayLanguage)) {
        context.querySelector('.languageSection').classList.remove('hide');
    } else {
        context.querySelector('.languageSection').classList.add('hide');
    }

    if (appHost.supports(AppFeature.DisplayMode)) {
        context.querySelector('.fldDisplayMode').classList.remove('hide');
    } else {
        context.querySelector('.fldDisplayMode').classList.add('hide');
    }

    if (appHost.supports(AppFeature.ExternalLinks)) {
        context.querySelector('.learnHowToContributeContainer').classList.remove('hide');
    } else {
        context.querySelector('.learnHowToContributeContainer').classList.add('hide');
    }

    context.querySelector('.selectDashboardThemeContainer').classList.toggle('hide', !user.Policy.IsAdministrator);

    if (appHost.supports(AppFeature.Screensaver)) {
        context.querySelector('.selectScreensaverContainer').classList.remove('hide');
        context.querySelector('.txtBackdropScreensaverIntervalContainer').classList.remove('hide');
        context.querySelector('.txtScreensaverTimeContainer').classList.remove('hide');
    } else {
        context.querySelector('.selectScreensaverContainer').classList.add('hide');
        context.querySelector('.txtBackdropScreensaverIntervalContainer').classList.add('hide');
        context.querySelector('.txtScreensaverTimeContainer').classList.add('hide');
    }

    if (datetime.supportsLocalization()) {
        context.querySelector('.fldDateTimeLocale').classList.remove('hide');
    } else {
        context.querySelector('.fldDateTimeLocale').classList.add('hide');
    }

    fillThemes(context.querySelector('#selectTheme'), userSettings.theme());
    fillThemes(context.querySelector('#selectDashboardTheme'), userSettings.dashboardTheme());

    loadScreensavers(context, userSettings);

    context.querySelector('#txtBackdropScreensaverInterval').value = userSettings.backdropScreensaverInterval();
    context.querySelector('#txtScreensaverTime').value = userSettings.screensaverTime();

    context.querySelector('.chkDisplayMissingEpisodes').checked = user.Configuration.DisplayMissingEpisodes || false;

    context.querySelector('#chkThemeSong').checked = userSettings.enableThemeSongs();
    context.querySelector('#chkThemeVideo').checked = userSettings.enableThemeVideos();
    context.querySelector('#chkFadein').checked = userSettings.enableFastFadein();
    context.querySelector('#chkBlurhash').checked = userSettings.enableBlurhash();
    context.querySelector('#chkBackdrops').checked = userSettings.enableBackdrops();
    context.querySelector('#chkDetailsBanner').checked = userSettings.detailsBanner();

    context.querySelector('#chkDisableCustomCss').checked = userSettings.disableCustomCss();
    context.querySelector('#txtLocalCustomCss').value = userSettings.customCss();

    context.querySelector('#selectLanguage').value = userSettings.language() || '';
    context.querySelector('.selectDateTimeLocale').value = userSettings.dateTimeLocale() || '';

    context.querySelector('#txtLibraryPageSize').value = userSettings.libraryPageSize();

    context.querySelector('#txtMaxDaysForNextUp').value = userSettings.maxDaysForNextUp();
    context.querySelector('#chkRewatchingNextUp').checked = userSettings.enableRewatchingInNextUp();
    context.querySelector('#chkUseEpisodeImagesInNextUp').checked = userSettings.useEpisodeImagesInNextUpAndResume();

    context.querySelector('.selectLayout').value = layoutManager.getSavedLayout() || '';

    showOrHideMissingEpisodesField(context);

    loading.hide();
}

// 将表单中的值写回 user.Configuration 与 userSettings，并提交到服务器。
// 注意：当前用户切换主题需要立即调用 skinManager.setTheme 以便即时生效。
function saveUser(context, user, userSettingsInstance, apiClient) {
    user.Configuration.DisplayMissingEpisodes = context.querySelector('.chkDisplayMissingEpisodes').checked;

    if (appHost.supports(AppFeature.DisplayLanguage)) {
        userSettingsInstance.language(context.querySelector('#selectLanguage').value);
    }

    userSettingsInstance.dateTimeLocale(context.querySelector('.selectDateTimeLocale').value);

    userSettingsInstance.enableThemeSongs(context.querySelector('#chkThemeSong').checked);
    userSettingsInstance.enableThemeVideos(context.querySelector('#chkThemeVideo').checked);
    userSettingsInstance.theme(context.querySelector('#selectTheme').value);
    userSettingsInstance.dashboardTheme(context.querySelector('#selectDashboardTheme').value);
    userSettingsInstance.screensaver(context.querySelector('.selectScreensaver').value);
    userSettingsInstance.backdropScreensaverInterval(context.querySelector('#txtBackdropScreensaverInterval').value);
    userSettingsInstance.screensaverTime(context.querySelector('#txtScreensaverTime').value);

    userSettingsInstance.libraryPageSize(context.querySelector('#txtLibraryPageSize').value);

    userSettingsInstance.maxDaysForNextUp(context.querySelector('#txtMaxDaysForNextUp').value);
    userSettingsInstance.enableRewatchingInNextUp(context.querySelector('#chkRewatchingNextUp').checked);
    userSettingsInstance.useEpisodeImagesInNextUpAndResume(context.querySelector('#chkUseEpisodeImagesInNextUp').checked);

    userSettingsInstance.enableFastFadein(context.querySelector('#chkFadein').checked);
    userSettingsInstance.enableBlurhash(context.querySelector('#chkBlurhash').checked);
    userSettingsInstance.enableBackdrops(context.querySelector('#chkBackdrops').checked);
    userSettingsInstance.detailsBanner(context.querySelector('#chkDetailsBanner').checked);

    userSettingsInstance.disableCustomCss(context.querySelector('#chkDisableCustomCss').checked);
    userSettingsInstance.customCss(context.querySelector('#txtLocalCustomCss').value);

    if (user.Id === apiClient.getCurrentUserId()) {
        skinManager.setTheme(userSettingsInstance.theme());
    }

    layoutManager.setLayout(context.querySelector('.selectLayout').value);
    return apiClient.updateUserConfiguration(user.Id, user.Configuration);
}

// 保存入口：拉取最新用户对象 -> 写回配置/设置 -> 更新服务器；必要时弹出“已保存”提示并触发 saved 事件。
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

// 表单提交处理：准备 apiClient/userId/userSettings，确保 userSettings 绑定到当前用户后再保存。
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

// 将模板注入容器并绑定事件，然后触发首次加载。
function embed(options, self) {
    options.element.innerHTML = globalize.translateHtml(template, 'core');
    options.element.querySelector('form').addEventListener('submit', onSubmit.bind(self));
    if (options.enableSaveButton) {
        options.element.querySelector('.btnSave').classList.remove('hide');
    }
    self.loadData(options.autoFocus);
}

class DisplaySettings {
    constructor(options) {
        this.options = options;
        embed(options, this);
    }

    // 读取用户信息与用户设置，然后填充表单；autoFocus=true 时自动聚焦到第一个可交互控件。
    loadData(autoFocus) {
        const self = this;
        const context = self.options.element;

        loading.show();

        const userId = self.options.userId;
        const apiClient = ServerConnections.getApiClient(self.options.serverId);
        const userSettings = self.options.userSettings;

        return apiClient.getUser(userId).then(user => {
            return userSettings.setUserInfo(userId, apiClient).then(() => {
                self.dataLoaded = true;
                loadForm(context, user, userSettings);
                if (autoFocus) {
                    focusManager.autoFocus(context);
                }
            });
        });
    }

    // 供外部触发保存（等价于提交表单）。
    submit() {
        onSubmit.call(this);
    }

    // 清理引用，避免组件销毁后继续持有 options。
    destroy() {
        this.options = null;
    }
}

export default DisplaySettings;
