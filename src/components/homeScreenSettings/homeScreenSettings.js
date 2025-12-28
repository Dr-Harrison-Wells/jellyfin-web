
import escapeHtml from 'escape-html';

import { getUserViewsQuery } from 'hooks/useUserViews';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { toApi } from 'utils/jellyfin-apiclient/compat';
import { queryClient } from 'utils/query/queryClient';

import layoutManager from '../layoutManager';
import focusManager from '../focusManager';
import globalize from '../../lib/globalize';
import loading from '../loading/loading';
import Events from '../../utils/events.ts';
import homeSections from '../homesections/homesections';
import dom from '../../scripts/dom';
import '../listview/listview.scss';
import '../../elements/emby-select/emby-select';
import '../../elements/emby-checkbox/emby-checkbox';
import toast from '../toast/toast';
import template from './homeScreenSettings.template.html';
import { LibraryTab } from '../../types/libraryTab.ts';

// 可配置的首页区块数量（对应模板中的 10 个 section 下拉框）
const numConfigurableSections = 10;

// 渲染“文件夹分组”列表（GroupedFolders）：从后端返回的可分组视图中生成复选框
function renderViews(page, user, result) {
    let folderHtml = '';

    folderHtml += '<div class="checkboxList">';
    folderHtml += result.map(i => {
        let currentHtml = '';

        const id = `chkGroupFolder${i.Id}`;

        const isChecked = user.Configuration.GroupedFolders.includes(i.Id);

        const checkedHtml = isChecked ? ' checked="checked"' : '';

        currentHtml += '<label>';
        currentHtml += `<input type="checkbox" is="emby-checkbox" class="chkGroupFolder" data-folderid="${i.Id}" id="${id}"${checkedHtml}/>`;
        currentHtml += `<span>${escapeHtml(i.Name)}</span>`;
        currentHtml += '</label>';

        return currentHtml;
    }).join('');

    folderHtml += '</div>';

    page.querySelector('.folderGroupList').innerHTML = folderHtml;
}

// 根据媒体库类型生成“默认进入页面(landing screen)”的可选项
// 说明：不同 CollectionType 支持的 Tab 不同；默认项用 isDefault 标记
function getLandingScreenOptions(type) {
    const list = [];

    if (type === 'movies') {
        list.push({
            name: globalize.translate('Movies'),
            value: LibraryTab.Movies,
            isDefault: true
        });
        list.push({
            name: globalize.translate('Suggestions'),
            value: LibraryTab.Suggestions
        });
        list.push({
            name: globalize.translate('Favorites'),
            value: LibraryTab.Favorites
        });
        list.push({
            name: globalize.translate('Collections'),
            value: LibraryTab.Collections
        });
        list.push({
            name: globalize.translate('Genres'),
            value: LibraryTab.Genres
        });
    } else if (type === 'tvshows') {
        list.push({
            name: globalize.translate('Shows'),
            value: LibraryTab.Series,
            isDefault: true
        });
        list.push({
            name: globalize.translate('Suggestions'),
            value: LibraryTab.Suggestions
        });
        list.push({
            name: globalize.translate('TabUpcoming'),
            value: LibraryTab.Upcoming
        });
        list.push({
            name: globalize.translate('Genres'),
            value: LibraryTab.Genres
        });
        list.push({
            name: globalize.translate('TabNetworks'),
            value: LibraryTab.Networks
        });
        list.push({
            name: globalize.translate('Episodes'),
            value: LibraryTab.Episodes
        });
    } else if (type === 'music') {
        list.push({
            name: globalize.translate('Albums'),
            value: LibraryTab.Albums,
            isDefault: true
        });
        list.push({
            name: globalize.translate('Suggestions'),
            value: LibraryTab.Suggestions
        });
        list.push({
            name: globalize.translate('HeaderAlbumArtists'),
            value: LibraryTab.AlbumArtists
        });
        list.push({
            name: globalize.translate('Artists'),
            value: LibraryTab.Artists
        });
        list.push({
            name: globalize.translate('Playlists'),
            value: LibraryTab.Playlists
        });
        list.push({
            name: globalize.translate('Songs'),
            value: LibraryTab.Songs
        });
        list.push({
            name: globalize.translate('Genres'),
            value: LibraryTab.Genres
        });
    } else if (type === 'livetv') {
        list.push({
            name: globalize.translate('Programs'),
            value: LibraryTab.Programs,
            isDefault: true
        });
        list.push({
            name: globalize.translate('Guide'),
            value: LibraryTab.Guide
        });
        list.push({
            name: globalize.translate('Channels'),
            value: LibraryTab.Channels
        });
        list.push({
            name: globalize.translate('Recordings'),
            value: LibraryTab.Recordings
        });
        list.push({
            name: globalize.translate('Schedule'),
            value: LibraryTab.Schedule
        });
        list.push({
            name: globalize.translate('Series'),
            value: LibraryTab.SeriesTimers
        });
    }

    return list;
}

// 将 landing screen 可选项转为 <option> 列表
// userValue 为空时选择默认项；默认项的 value 为空字符串（与保存逻辑保持一致）
function getLandingScreenOptionsHtml(type, userValue) {
    return getLandingScreenOptions(type).map(o => {
        const selected = userValue === o.value || (o.isDefault && !userValue);
        const selectedHtml = selected ? ' selected' : '';
        const optionValue = o.isDefault ? '' : o.value;

        return `<option value="${optionValue}"${selectedHtml}>${escapeHtml(o.name)}</option>`;
    }).join('');
}

// 渲染“我的媒体”顶部视图排序（OrderedViews）：生成可上下移动的列表项
function renderViewOrder(context, user, result) {
    let html = '';

    html += result.Items.map((view) => {
        let currentHtml = '';

        currentHtml += `<div class="listItem viewItem" data-viewid="${view.Id}">`;

        currentHtml += '<span class="material-icons listItemIcon folder_open" aria-hidden="true"></span>';

        currentHtml += '<div class="listItemBody">';

        currentHtml += '<div>';
        currentHtml += escapeHtml(view.Name);
        currentHtml += '</div>';

        currentHtml += '</div>';

        currentHtml += `<button type="button" is="paper-icon-button-light" class="btnViewItemUp btnViewItemMove autoSize" title="${globalize.translate('Up')}"><span class="material-icons keyboard_arrow_up" aria-hidden="true"></span></button>`;
        currentHtml += `<button type="button" is="paper-icon-button-light" class="btnViewItemDown btnViewItemMove autoSize" title="${globalize.translate('Down')}"><span class="material-icons keyboard_arrow_down" aria-hidden="true"></span></button>`;

        currentHtml += '</div>';

        return currentHtml;
    }).join('');

    context.querySelector('.viewOrderList').innerHTML = html;
}

// 将用户的首页区块配置写回到 UI（10 个 section 下拉框 + TV 首页入口下拉框）
// 约定：当用户值与默认值一致时，下拉框显示为空字符串（代表“使用默认”）
function updateHomeSectionValues(context, userSettings) {
    for (let i = 1; i <= numConfigurableSections; i++) {
        const select = context.querySelector(`#selectHomeSection${i}`);
        const defaultValue = homeSections.getDefaultSection(i - 1);

        const option = select.querySelector(`option[value="${defaultValue}"]`) || select.querySelector('option[value=""]');

        const userValue = userSettings.get(`homesection${i - 1}`);

        if (option) option.value = '';

        if (userValue === defaultValue || !userValue) {
            select.value = '';
        } else {
            select.value = userValue;
        }
    }

    context.querySelector('.selectTVHomeScreen').value = userSettings.get('tvhome') || '';
}

// 生成“按媒体库单独设置”的 HTML
// - DisplayInMyMedia：是否在“我的媒体”显示
// - DisplayInOtherHomeScreenSections：是否参与“最新/继续观看”等首页区块
// - LabelDefaultScreen：该库点击进入时默认打开哪个 Tab（Movies/Shows/Albums/...）
function getPerLibrarySettingsHtml(item, user, userSettings) {
    let html = '';

    let isChecked;

    if (item.Type === 'Channel' || item.CollectionType === 'boxsets' || item.CollectionType === 'playlists') {
        isChecked = !(user.Configuration.MyMediaExcludes || []).includes(item.Id);
        html += '<div>';
        html += '<label>';
        html += `<input type="checkbox" is="emby-checkbox" class="chkIncludeInMyMedia" data-folderid="${item.Id}"${isChecked ? ' checked="checked"' : ''}/>`;
        html += `<span>${globalize.translate('DisplayInMyMedia')}</span>`;
        html += '</label>';
        html += '</div>';
    }

    const excludeFromLatest = ['playlists', 'livetv', 'boxsets', 'channels'];
    if (!excludeFromLatest.includes(item.CollectionType || '')) {
        isChecked = !user.Configuration.LatestItemsExcludes.includes(item.Id);
        html += '<label class="fldIncludeInLatest">';
        html += `<input type="checkbox" is="emby-checkbox" class="chkIncludeInLatest" data-folderid="${item.Id}"${isChecked ? ' checked="checked"' : ''}/>`;
        html += `<span>${globalize.translate('DisplayInOtherHomeScreenSections')}</span>`;
        html += '</label>';
    }

    if (html) {
        html = `<div class="checkboxListContainer">${html}</div>`;
    }

    if (item.CollectionType === 'movies' || item.CollectionType === 'tvshows' || item.CollectionType === 'music' || item.CollectionType === 'livetv') {
        const idForLanding = item.CollectionType === 'livetv' ? item.CollectionType : item.Id;
        html += '<div class="selectContainer">';
        html += `<select is="emby-select" class="selectLanding" data-folderid="${idForLanding}" label="${globalize.translate('LabelDefaultScreen')}">`;

        const userValue = userSettings.get(`landing-${idForLanding}`);

        html += getLandingScreenOptionsHtml(item.CollectionType, userValue);

        html += '</select>';
        html += '</div>';
    }

    if (html) {
        let prefix = '';
        prefix += '<div class="verticalSection">';

        prefix += '<h2 class="sectionTitle">';
        prefix += escapeHtml(item.Name);
        prefix += '</h2>';

        html = prefix + html;
        html += '</div>';
    }

    return html;
}

// 渲染“按媒体库单独设置”区域（循环每个视图/库生成一段配置 UI）
function renderPerLibrarySettings(context, user, userViews, userSettings) {
    const elem = context.querySelector('.perLibrarySettings');
    let html = '';

    for (let i = 0, length = userViews.length; i < length; i++) {
        html += getPerLibrarySettingsHtml(userViews[i], user, userSettings);
    }

    elem.innerHTML = html;
}

// 拉取数据并回填表单：
// - 用户配置（HidePlayedInLatest / 排除列表 / 分组文件夹等）
// - 用户可见视图列表（用于排序 & 每库设置）
// - 分组选项（GroupingOptions，用于“分组文件夹”复选框）
function loadForm(context, user, userSettings, apiClient) {
    context.querySelector('.chkHidePlayedFromLatest').checked = user.Configuration.HidePlayedInLatest || false;

    updateHomeSectionValues(context, userSettings);

    const promise1 = queryClient
        .fetchQuery(getUserViewsQuery(
            toApi(apiClient),
            user.Id,
            { includeHidden: true }
        ));
    const promise2 = apiClient.getJSON(apiClient.getUrl(`Users/${user.Id}/GroupingOptions`));

    Promise.all([promise1, promise2]).then(responses => {
        renderViewOrder(context, user, responses[0]);

        renderPerLibrarySettings(context, user, responses[0].Items, userSettings);

        renderViews(context, user, responses[1]);

        loading.hide();
    });
}

// 处理“视图排序”列表中的上下移动按钮
function onSectionOrderListClick(e) {
    const target = dom.parentWithClass(e.target, 'btnViewItemMove');

    if (target) {
        const viewItem = dom.parentWithClass(target, 'viewItem');

        if (viewItem) {
            if (target.classList.contains('btnViewItemDown')) {
                const next = viewItem.nextSibling;

                if (next) {
                    viewItem.parentNode.removeChild(viewItem);
                    next.parentNode.insertBefore(viewItem, next.nextSibling);
                    focusManager.focus(e.target);
                }
            } else {
                const prev = viewItem.previousSibling;

                if (prev) {
                    viewItem.parentNode.removeChild(viewItem);
                    prev.parentNode.insertBefore(viewItem, prev);
                    focusManager.focus(e.target);
                }
            }
        }
    }
}

// 收集某一组 checkbox 中 checked 状态与 isChecked 相符的项
// 用于将 UI 勾选结果转换为后端所需的 ID 数组
function getCheckboxItems(selector, context, isChecked) {
    const inputs = context.querySelectorAll(selector);
    const list = [];

    for (let i = 0, length = inputs.length; i < length; i++) {
        if (inputs[i].checked === isChecked) {
            list.push(inputs[i]);
        }
    }

    return list;
}

// 将 UI 中的设置写入 user.Configuration / userSettings，并提交到服务端
// 注意：
// - LatestItemsExcludes / MyMediaExcludes 保存“未勾选”的库 ID
// - GroupedFolders 保存“已勾选”的库 ID
// - OrderedViews 保存排序后的 viewId 列表
function saveUser(context, user, userSettingsInstance, apiClient) {
    user.Configuration.HidePlayedInLatest = context.querySelector('.chkHidePlayedFromLatest').checked;

    user.Configuration.LatestItemsExcludes = getCheckboxItems('.chkIncludeInLatest', context, false).map(i => {
        return i.getAttribute('data-folderid');
    });

    user.Configuration.MyMediaExcludes = getCheckboxItems('.chkIncludeInMyMedia', context, false).map(i => {
        return i.getAttribute('data-folderid');
    });

    user.Configuration.GroupedFolders = getCheckboxItems('.chkGroupFolder', context, true).map(i => {
        return i.getAttribute('data-folderid');
    });

    const viewItems = context.querySelectorAll('.viewItem');
    const orderedViews = [];
    let i;
    let length;
    for (i = 0, length = viewItems.length; i < length; i++) {
        orderedViews.push(viewItems[i].getAttribute('data-viewid'));
    }

    user.Configuration.OrderedViews = orderedViews;

    userSettingsInstance.set('tvhome', context.querySelector('.selectTVHomeScreen').value);

    userSettingsInstance.set('homesection0', context.querySelector('#selectHomeSection1').value);
    userSettingsInstance.set('homesection1', context.querySelector('#selectHomeSection2').value);
    userSettingsInstance.set('homesection2', context.querySelector('#selectHomeSection3').value);
    userSettingsInstance.set('homesection3', context.querySelector('#selectHomeSection4').value);
    userSettingsInstance.set('homesection4', context.querySelector('#selectHomeSection5').value);
    userSettingsInstance.set('homesection5', context.querySelector('#selectHomeSection6').value);
    userSettingsInstance.set('homesection6', context.querySelector('#selectHomeSection7').value);
    userSettingsInstance.set('homesection7', context.querySelector('#selectHomeSection8').value);
    userSettingsInstance.set('homesection8', context.querySelector('#selectHomeSection9').value);
    userSettingsInstance.set('homesection9', context.querySelector('#selectHomeSection10').value);

    const selectLandings = context.querySelectorAll('.selectLanding');
    for (i = 0, length = selectLandings.length; i < length; i++) {
        const selectLanding = selectLandings[i];
        userSettingsInstance.set(`landing-${selectLanding.getAttribute('data-folderid')}`, selectLanding.value);
    }

    return apiClient.updateUserConfiguration(user.Id, user.Configuration);
}

// 保存入口：拉取最新 user 对象后合并并提交，成功后触发 saved 事件
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

// 表单 submit 处理：先确保 userSettings 绑定了 user + apiClient，再执行保存
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

// 当“显示在我的媒体”切换时，联动显示/隐藏“参与首页其他区块”的选项
// 目的：如果该库不显示在“我的媒体”，则不允许/不展示“最新/推荐”等区块相关勾选
function onChange(e) {
    const chkIncludeInMyMedia = dom.parentWithClass(e.target, 'chkIncludeInMyMedia');
    if (!chkIncludeInMyMedia) {
        return;
    }

    const section = dom.parentWithClass(chkIncludeInMyMedia, 'verticalSection');
    const fldIncludeInLatest = section.querySelector('.fldIncludeInLatest');
    if (fldIncludeInLatest) {
        if (chkIncludeInMyMedia.checked) {
            fldIncludeInLatest.classList.remove('hide');
        } else {
            fldIncludeInLatest.classList.add('hide');
        }
    }
}

// 将模板注入 DOM，并绑定事件
function embed(options, self) {
    let workingTemplate = template;
    for (let i = 1; i <= numConfigurableSections; i++) {
        workingTemplate = workingTemplate.replace(`{section${i}label}`, globalize.translate('LabelHomeScreenSectionValue', i));
    }

    options.element.innerHTML = globalize.translateHtml(workingTemplate, 'core');

    options.element.querySelector('.viewOrderList').addEventListener('click', onSectionOrderListClick);
    options.element.querySelector('form').addEventListener('submit', onSubmit.bind(self));
    options.element.addEventListener('change', onChange);

    if (options.enableSaveButton) {
        options.element.querySelector('.btnSave').classList.remove('hide');
    }

    if (layoutManager.tv) {
        options.element.querySelector('.selectTVHomeScreenContainer').classList.remove('hide');
    } else {
        options.element.querySelector('.selectTVHomeScreenContainer').classList.add('hide');
    }

    self.loadData(options.autoFocus);
}

class HomeScreenSettings {
    constructor(options) {
        this.options = options;
        embed(options, this);
    }

    // 拉取用户数据并渲染表单；autoFocus 用于 TV/遥控场景的默认聚焦
    loadData(autoFocus) {
        const self = this;
        const context = self.options.element;

        loading.show();

        const userId = self.options.userId;
        const apiClient = ServerConnections.getApiClient(self.options.serverId);
        const userSettings = self.options.userSettings;

        apiClient.getUser(userId).then(user => {
            userSettings.setUserInfo(userId, apiClient).then(() => {
                self.dataLoaded = true;

                loadForm(context, user, userSettings, apiClient);

                if (autoFocus) {
                    focusManager.autoFocus(context);
                }
            });
        });
    }

    // 对外暴露的提交方法（与表单 submit 逻辑一致）
    submit() {
        onSubmit.call(this);
    }

    // 销毁：释放引用，便于 GC
    destroy() {
        this.options = null;
    }
}

export default HomeScreenSettings;
