import escapeHtml from 'escape-html';
import dom from '../../scripts/dom';
import focusManager from '../focusManager';
import dialogHelper from '../dialogHelper/dialogHelper';
import inputManager from '../../scripts/inputManager';
import layoutManager from '../layoutManager';
import globalize from '../../lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import * as userSettings from '../../scripts/settings/userSettings';
import '../../elements/emby-checkbox/emby-checkbox';
import '../../elements/emby-input/emby-input';
import '../../elements/emby-button/emby-button';
import '../../elements/emby-button/paper-icon-button-light';
import '../../elements/emby-select/emby-select';
import 'material-design-icons-iconfont';
import '../formdialog.scss';
import '../../styles/flexstyles.scss';
import template from './filtermenu.template.html';

// 阻止表单默认提交：该对话框通过监听 change 来判断是否“提交”（即内容是否有变更）
function onSubmit(e) {
    e.preventDefault();
    return false;
}

// 将一组筛选项（items）渲染为 checkbox 列表，并根据 isCheckedFn 决定默认选中状态
function renderOptions(context, selector, cssClass, items, isCheckedFn) {
    const elem = context.querySelector(selector);

    if (items.length) {
        elem.classList.remove('hide');
    } else {
        elem.classList.add('hide');
    }

    let html = '';

    html += items.map(function (filter) {
        let itemHtml = '';

        const checkedHtml = isCheckedFn(filter) ? ' checked' : '';
        itemHtml += '<label>';
        itemHtml += '<input is="emby-checkbox" type="checkbox"' + checkedHtml + ' data-filter="' + filter.Id + '" class="' + cssClass + '"/>';
        itemHtml += '<span>' + escapeHtml(filter.Name) + '</span>';
        itemHtml += '</label>';

        return itemHtml;
    }).join('');

    elem.querySelector('.filterOptions').innerHTML = html;
}

// 渲染需要从服务器动态获取的筛选项（目前包含 Genres）
function renderDynamicFilters(context, result, options) {
    renderOptions(context, '.genreFilters', 'chkGenreFilter', result.Genres, function (i) {
        // 兼容旧版本设置：历史上 GenreIds 可能用 "|" 分隔，后来改为 ","。
        // 这里通过检测当前字符串是否包含 "|" 来决定用哪个分隔符做包含判断。
        const delimeter = (options.settings.GenreIds || '').indexOf('|') === -1 ? ',' : '|';
        return (delimeter + (options.settings.GenreIds || '') + delimeter).indexOf(delimeter + i.Id + delimeter) !== -1;
    });
}

// 保存基础开关类筛选（simpleFilter）：统一存到 userSettings 的 filter 中
function setBasicFilter(context, key, elem) {
    let value = elem.checked;
    value = value || null;
    userSettings.setFilter(key, value);
}

// TV/键盘模式下，在垂直排列的 checkbox 列表里按左右移动焦点
function moveCheckboxFocus(elem, offset) {
    const parent = dom.parentWithClass(elem, 'checkboxList-verticalwrap');
    const elems = focusManager.getFocusableElements(parent);

    let index = -1;
    for (let i = 0, length = elems.length; i < length; i++) {
        if (elems[i] === elem) {
            index = i;
            break;
        }
    }

    index += offset;

    index = Math.min(elems.length - 1, index);
    index = Math.max(0, index);

    const newElem = elems[index];
    if (newElem) {
        focusManager.focus(newElem);
    }
}

// 在 TV 布局中打开/关闭“自动将焦点滚动到可视区域中心”的行为
function centerFocus(elem, horiz, on) {
    import('../../scripts/scrollHelper').then((scrollHelper) => {
        const fn = on ? 'on' : 'off';
        scrollHelper.centerFocus[fn](elem, horiz);
    });
}

// 处理输入命令（TV 遥控/键盘）：仅处理左右切换焦点
function onInputCommand(e) {
    switch (e.detail.command) {
        case 'left':
            moveCheckboxFocus(e.target, -1);
            e.preventDefault();
            break;
        case 'right':
            moveCheckboxFocus(e.target, 1);
            e.preventDefault();
            break;
        default:
            break;
    }
}

// 将当前 UI 勾选状态写回 userSettings（按 settingsKey 做命名空间隔离）
function saveValues(context, settings, settingsKey) {
    context.querySelectorAll('.simpleFilter').forEach(elem => {
        if (elem.tagName === 'INPUT') {
            setBasicFilter(context, settingsKey + '-filter-' + elem.getAttribute('data-settingname'), elem);
        } else {
            setBasicFilter(context, settingsKey + '-filter-' + elem.getAttribute('data-settingname'), elem.querySelector('input'));
        }
    });

    // Video type
    const videoTypes = [];
    context.querySelectorAll('.chkVideoTypeFilter').forEach(elem => {
        if (elem.checked) {
            videoTypes.push(elem.getAttribute('data-filter'));
        }
    });

    userSettings.setFilter(settingsKey + '-filter-VideoTypes', videoTypes.join(','));

    // Series status
    const seriesStatuses = [];
    context.querySelectorAll('.chkSeriesStatus').forEach(elem => {
        if (elem.checked) {
            seriesStatuses.push(elem.getAttribute('data-filter'));
        }
    });

    userSettings.setFilter(`${settingsKey}-filter-SeriesStatus`, seriesStatuses.join(','));

    // Genres
    const genres = [];
    context.querySelectorAll('.chkGenreFilter').forEach(elem => {
        if (elem.checked) {
            genres.push(elem.getAttribute('data-filter'));
        }
    });

    userSettings.setFilter(settingsKey + '-filter-GenreIds', genres.join(','));
}

// 给 checkbox 列表绑定/解绑 inputManager，以支持 TV 遥控左右键移动
function bindCheckboxInput(context, on) {
    const elems = context.querySelectorAll('.checkboxList-verticalwrap');
    for (let i = 0, length = elems.length; i < length; i++) {
        if (on) {
            inputManager.on(elems[i], onInputCommand);
        } else {
            inputManager.off(elems[i], onInputCommand);
        }
    }
}

// 初始化对话框：根据 settings 回填所有筛选项的选中状态，并决定是否隐藏空的分组
function initEditor(context, settings) {
    context.querySelector('form').addEventListener('submit', onSubmit);

    let elems = context.querySelectorAll('.simpleFilter');
    let i;
    let length;

    for (i = 0, length = elems.length; i < length; i++) {
        if (elems[i].tagName === 'INPUT') {
            elems[i].checked = settings[elems[i].getAttribute('data-settingname')] || false;
        } else {
            elems[i].querySelector('input').checked = settings[elems[i].getAttribute('data-settingname')] || false;
        }
    }

    const videoTypes = settings.VideoTypes ? settings.VideoTypes.split(',') : [];
    elems = context.querySelectorAll('.chkVideoTypeFilter');

    for (i = 0, length = elems.length; i < length; i++) {
        elems[i].checked = videoTypes.indexOf(elems[i].getAttribute('data-filter')) !== -1;
    }

    const seriesStatuses = settings.SeriesStatus ? settings.SeriesStatus.split(',') : [];
    elems = context.querySelectorAll('.chkSeriesStatus');

    for (i = 0, length = elems.length; i < length; i++) {
        elems[i].checked = seriesStatuses.indexOf(elems[i].getAttribute('data-filter')) !== -1;
    }

    if (context.querySelector('.basicFilterSection .viewSetting:not(.hide)')) {
        context.querySelector('.basicFilterSection').classList.remove('hide');
    } else {
        context.querySelector('.basicFilterSection').classList.add('hide');
    }

    if (context.querySelector('.featureSection .viewSetting:not(.hide)')) {
        context.querySelector('.featureSection').classList.remove('hide');
    } else {
        context.querySelector('.featureSection').classList.add('hide');
    }
}

// 从服务器获取动态筛选项（例如 Genres），并渲染到对话框
function loadDynamicFilters(context, options) {
    const apiClient = ServerConnections.getApiClient(options.serverId);

    const filterMenuOptions = Object.assign(options.filterMenuOptions, {

        UserId: apiClient.getCurrentUserId(),
        ParentId: options.parentId,
        IncludeItemTypes: options.itemTypes.join(',')
    });

    apiClient.getFilters(filterMenuOptions).then((result) => {
        renderDynamicFilters(context, result, options);
    });
}

// 筛选菜单：以对话框形式展示，用户修改后关闭时写回设置
class FilterMenu {
    show(options) {
        return new Promise( (resolve) => {
            const dialogOptions = {
                removeOnClose: true,
                scrollY: false
            };
            if (layoutManager.tv) {
                dialogOptions.size = 'fullscreen';
            } else {
                dialogOptions.size = 'small';
            }

            const dlg = dialogHelper.createDialog(dialogOptions);

            dlg.classList.add('formDialog');

            let html = '';

            html += '<div class="formDialogHeader">';
            html += `<button is="paper-icon-button-light" class="btnCancel hide-mouse-idle-tv" tabindex="-1" title="${globalize.translate('ButtonBack')}"><span class="material-icons arrow_back" aria-hidden="true"></span></button>`;
            html += '<h3 class="formDialogHeaderTitle">${Filters}</h3>';

            html += '</div>';

            html += template;

            dlg.innerHTML = globalize.translateHtml(html, 'core');

            const settingElements = dlg.querySelectorAll('.viewSetting');
            for (let i = 0, length = settingElements.length; i < length; i++) {
                if (options.visibleSettings.indexOf(settingElements[i].getAttribute('data-settingname')) === -1) {
                    settingElements[i].classList.add('hide');
                } else {
                    settingElements[i].classList.remove('hide');
                }
            }

            initEditor(dlg, options.settings);
            loadDynamicFilters(dlg, options);

            bindCheckboxInput(dlg, true);
            dlg.querySelector('.btnCancel').addEventListener('click', function () {
                dialogHelper.close(dlg);
            });

            if (layoutManager.tv) {
                centerFocus(dlg.querySelector('.formDialogContent'), false, true);
            }

            let submitted;

            // 只要表单内容发生变化，就认为“有提交”；关闭对话框时据此决定是否保存
            dlg.querySelector('form').addEventListener('change', function () {
                submitted = true;
            }, true);

            dialogHelper.open(dlg).then( function() {
                bindCheckboxInput(dlg, false);

                if (layoutManager.tv) {
                    centerFocus(dlg.querySelector('.formDialogContent'), false, false);
                }

                if (submitted) {
                    saveValues(dlg, options.settings, options.settingsKey);
                    return resolve();
                }
                return resolve();
            });
        });
    }
}

export default FilterMenu;
