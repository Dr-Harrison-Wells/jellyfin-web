// 导入所需的依赖模块和样式
import dialogHelper from '../dialogHelper/dialogHelper'; // 对话框辅助工具
import layoutManager from '../layoutManager'; // 布局管理器，判断设备类型
import globalize from '../../lib/globalize'; // 国际化工具
import * as userSettings from '../../scripts/settings/userSettings'; // 用户设置相关方法
import '../../elements/emby-select/emby-select'; // 下拉选择组件
import '../../elements/emby-button/paper-icon-button-light'; // 轻量图标按钮组件
import 'material-design-icons-iconfont'; // 图标字体
import '../formdialog.scss'; // 对话框样式
import '../../elements/emby-button/emby-button'; // 按钮组件
import '../../styles/flexstyles.scss'; // 弹性布局样式
import template from './sortmenu.template.html'; // 排序菜单模板

// 表单提交事件处理，阻止默认提交行为
function onSubmit(e) {
    e.preventDefault();
    return false;
}

// 初始化排序编辑器，将设置值填充到表单
function initEditor(context, settings) {
    context.querySelector('form').addEventListener('submit', onSubmit);
    // 设置排序方式和排序字段的初始值
    context.querySelector('.selectSortOrder').value = settings.sortOrder;
    context.querySelector('.selectSortBy').value = settings.sortBy;
}

// 使元素在滚动区域居中显示，适用于电视等设备
function centerFocus(elem, horiz, on) {
    import('../../scripts/scrollHelper').then((scrollHelper) => {
        const fn = on ? 'on' : 'off';
        scrollHelper.centerFocus[fn](elem, horiz);
    });
}

// 填充排序字段下拉框
function fillSortBy(context, options) {
    const selectSortBy = context.querySelector('.selectSortBy');
    // 根据 options 生成下拉选项
    selectSortBy.innerHTML = options.map(function (o) {
        return '<option value="' + o.value + '">' + o.name + '</option>';
    }).join('');
}

// 保存排序设置到用户设置
function saveValues(context, settingsKey) {
    userSettings.setFilter(settingsKey + '-sortorder', context.querySelector('.selectSortOrder').value);
    userSettings.setFilter(settingsKey + '-sortby', context.querySelector('.selectSortBy').value);
}

// 排序菜单类，负责显示排序设置对话框
class SortMenu {
    /**
     * 显示排序菜单对话框
     * @param {Object} options - 包含排序选项和设置
     * @returns {Promise} - 用户操作完成后 resolve 或 reject
     */
    show(options) {
        return new Promise(function (resolve, reject) {
            // 对话框参数
            const dialogOptions = {
                removeOnClose: true, // 关闭后移除
                scrollY: false // 禁止垂直滚动
            };

            // 根据设备类型设置对话框大小
            if (layoutManager.tv) {
                dialogOptions.size = 'fullscreen';
            } else {
                dialogOptions.size = 'small';
            }

            // 创建对话框
            const dlg = dialogHelper.createDialog(dialogOptions);
            dlg.classList.add('formDialog');

            let html = '';
            // 构建对话框头部
            html += '<div class="formDialogHeader">';
            html += `<button is="paper-icon-button-light" class="btnCancel hide-mouse-idle-tv" tabindex="-1" title="${globalize.translate('ButtonBack')}"><span class="material-icons arrow_back" aria-hidden="true"></span></button>`;
            html += '<h3 class="formDialogHeaderTitle">${Sort}</h3>';
            html += '</div>';

            // 添加排序菜单内容模板
            html += template;

            // 国际化处理
            dlg.innerHTML = globalize.translateHtml(html, 'core');

            // 填充排序字段和初始化表单
            fillSortBy(dlg, options.sortOptions);
            initEditor(dlg, options.settings);

            // 取消按钮事件，关闭对话框
            dlg.querySelector('.btnCancel').addEventListener('click', function () {
                dialogHelper.close(dlg);
            });

            // 电视设备居中显示内容
            if (layoutManager.tv) {
                centerFocus(dlg.querySelector('.formDialogContent'), false, true);
            }

            let submitted;

            // 表单内容变更时标记已提交
            dlg.querySelector('form').addEventListener('change', function () {
                submitted = true;
            }, true);

            // 打开对话框，处理用户操作
            dialogHelper.open(dlg).then(function () {
                if (layoutManager.tv) {
                    centerFocus(dlg.querySelector('.formDialogContent'), false, false);
                }

                if (submitted) {
                    // 保存设置
                    saveValues(dlg, options.settingsKey);
                    resolve();
                    return;
                }

                // 未提交则 reject
                reject();
            });
        });
    }
}

// 导出排序菜单类
export default SortMenu;
