import dialogHelper from '../dialogHelper/dialogHelper';
import globalize from '../../lib/globalize';
import * as userSettings from '../../scripts/settings/userSettings';
import layoutManager from '../layoutManager';
import scrollHelper from '../../scripts/scrollHelper';
import '../../elements/emby-checkbox/emby-checkbox';
import '../../elements/emby-radio/emby-radio';
import '../formdialog.scss';
import 'material-design-icons-iconfont';
import template from './guide-settings.template.html';

// 将“节目指南分类”复选框的选择结果写回到 options
// 注意：这里把“未选择任何项”与“全选”做了区分（通过额外塞入 'all' 标记）。
function saveCategories(context, options) {
    const categories = [];

    const chkCategorys = context.querySelectorAll('.chkCategory');
    for (const chkCategory of chkCategorys) {
        const type = chkCategory.getAttribute('data-type');

        if (chkCategory.checked) {
            categories.push(type);
        }
    }

    if (categories.length >= 4) {
        categories.push('series');
    }

    // 区分“未选择任何分类”与“全部分类”（后续逻辑会用到）
    categories.push('all');
    options.categories = categories;
}

// 根据 options.categories 恢复“节目指南分类”复选框状态
// 如果 options.categories 为空，表示默认全选。
function loadCategories(context, options) {
    const selectedCategories = options.categories || [];

    const chkCategorys = context.querySelectorAll('.chkCategory');
    for (const chkCategory of chkCategorys) {
        const type = chkCategory.getAttribute('data-type');

        chkCategory.checked = !selectedCategories.length || selectedCategories.indexOf(type) !== -1;
    }
}

// 保存对话框内的设置到用户设置（userSettings）
// 这里保存的是：节目单指示器、彩色背景、收藏频道置顶、频道排序规则。
function save(context) {
    const chkIndicators = context.querySelectorAll('.chkIndicator');

    for (const chkIndicator of chkIndicators) {
        const type = chkIndicator.getAttribute('data-type');
        userSettings.set('guide-indicator-' + type, chkIndicator.checked);
    }

    userSettings.set('guide-colorcodedbackgrounds', context.querySelector('.chkColorCodedBackgrounds').checked);
    userSettings.set('livetv-favoritechannelsattop', context.querySelector('.chkFavoriteChannelsAtTop').checked);

    const sortBys = context.querySelectorAll('.chkSortOrder');
    for (const sortBy of sortBys) {
        if (sortBy.checked) {
            userSettings.set('livetv-channelorder', sortBy.value);
            break;
        }
    }
}

// 从用户设置（userSettings）读取并回填到对话框控件
function load(context) {
    const chkIndicators = context.querySelectorAll('.chkIndicator');

    for (const chkIndicator of chkIndicators) {
        const type = chkIndicator.getAttribute('data-type');

        // 部分指示器默认是开启的：
        // - data-default=true：只要存储值不是 'false' 就视为开启
        // - 否则：只有存储值是 'true' 才视为开启
        if (chkIndicator.getAttribute('data-default') === 'true') {
            chkIndicator.checked = userSettings.get('guide-indicator-' + type) !== 'false';
        } else {
            chkIndicator.checked = userSettings.get('guide-indicator-' + type) === 'true';
        }
    }

    context.querySelector('.chkColorCodedBackgrounds').checked = userSettings.get('guide-colorcodedbackgrounds') === 'true';
    context.querySelector('.chkFavoriteChannelsAtTop').checked = userSettings.get('livetv-favoritechannelsattop') !== 'false';

    const sortByValue = userSettings.get('livetv-channelorder') || 'Number';

    const sortBys = context.querySelectorAll('.chkSortOrder');
    for (const sortBy of sortBys) {
        sortBy.checked = sortBy.value === sortByValue;
    }
}

// 弹出“节目指南设置”对话框
// - resolve：用户修改过设置并关闭
// - reject：用户未修改设置就关闭（用于避免无意义的刷新）
function showEditor(options) {
    return new Promise(function (resolve, reject) {
        let settingsChanged = false;

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

        html += globalize.translateHtml(template, 'core');

        dlg.innerHTML = html;

        dlg.addEventListener('change', function () {
            // 任意控件发生变更即可认为“设置已修改”
            settingsChanged = true;
        });

        dlg.addEventListener('close', function () {
            if (layoutManager.tv) {
                scrollHelper.centerFocus.off(dlg.querySelector('.formDialogContent'), false);
            }

            // 对话框关闭时落盘保存
            save(dlg);
            saveCategories(dlg, options);

            if (settingsChanged) {
                resolve();
            } else {
                reject();
            }
        });

        dlg.querySelector('.btnCancel').addEventListener('click', function () {
            dialogHelper.close(dlg);
        });

        if (layoutManager.tv) {
            scrollHelper.centerFocus.on(dlg.querySelector('.formDialogContent'), false);
        }

        // 打开前先回填当前设置
        load(dlg);
        loadCategories(dlg, options);
        dialogHelper.open(dlg);
    });
}

export default {
    show: showEditor
};
