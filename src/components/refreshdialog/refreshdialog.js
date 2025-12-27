// 导入 DOM 操作工具
import dom from '../../scripts/dom';
// 导入对话框辅助工具
import dialogHelper from '../dialogHelper/dialogHelper';
// 导入加载状态组件
import loading from '../loading/loading';
// 导入布局管理器
import layoutManager from '../layoutManager';
// 导入国际化工具
import globalize from '../../lib/globalize';
// 导入服务器连接管理
import { ServerConnections } from 'lib/jellyfin-apiclient';

// 导入 Emby 自定义元素组件
import '../../elements/emby-input/emby-input';
import '../../elements/emby-button/emby-button';
import '../../elements/emby-button/paper-icon-button-light';
import '../../elements/emby-checkbox/emby-checkbox';
import '../../elements/emby-select/emby-select';
// 导入 Material Design 图标字体
import 'material-design-icons-iconfont';
// 导入表单对话框样式
import '../formdialog.scss';
// 导入提示消息组件
import toast from '../toast/toast';

/**
 * 生成刷新对话框的 HTML 内容
 * @returns {string} 对话框的 HTML 字符串
 */
function getEditorHtml() {
    let html = '';

    // 对话框内容容器
    html += '<div class="formDialogContent smoothScrollY" style="padding-top:2em;">';
    html += '<div class="dialogContentInner dialog-content-centered">';
    html += '<form style="margin:auto;">';

    // 元数据刷新模式选择器
    html += '<div class="fldSelectPlaylist selectContainer">';
    html += '<select is="emby-select" id="selectMetadataRefreshMode" label="' + globalize.translate('LabelRefreshMode') + '">';
    html += '<option value="scan" selected>' + globalize.translate('ScanForNewAndUpdatedFiles') + '</option>'; // 扫描新文件和更新的文件
    html += '<option value="missing">' + globalize.translate('SearchForMissingMetadata') + '</option>'; // 搜索缺失的元数据
    html += '<option value="all">' + globalize.translate('ReplaceAllMetadata') + '</option>'; // 替换所有元数据
    html += '</select>';
    html += '</div>';

    // 替换现有图片选项（默认隐藏）
    html += '<label class="checkboxContainer hide fldReplaceExistingImages">';
    html += '<input type="checkbox" is="emby-checkbox" class="chkReplaceImages" />';
    html += '<span>' + globalize.translate('ReplaceExistingImages') + '</span>';
    html += '</label>';

    // 替换 Trickplay 图片选项（默认隐藏）
    html += '<label class="checkboxContainer hide fldReplaceTrickplayImages">';
    html += '<input type="checkbox" is="emby-checkbox" class="chkReplaceTrickplayImages" />';
    html += '<span>' + globalize.translate('ReplaceTrickplayImages') + '</span>';
    html += '</label>';

    // 帮助说明文本
    html += '<div class="fieldDescription">';
    html += globalize.translate('RefreshDialogHelp');
    html += '</div>';

    // 隐藏字段：存储选中的项目 ID
    html += '<input type="hidden" class="fldSelectedItemIds" />';

    html += '<br />';
    // 对话框底部按钮区域
    html += '<div class="formDialogFooter">';
    html += '<button is="emby-button" type="submit" class="raised btnSubmit block formDialogFooterItem button-submit">' + globalize.translate('Refresh') + '</button>';
    html += '</div>';

    html += '</form>';
    html += '</div>';
    html += '</div>';

    return html;
}

/**
 * 将焦点居中到指定元素
 * @param {HTMLElement} elem - 要聚焦的元素
 * @param {boolean} horiz - 是否水平居中
 * @param {boolean} on - 是否启用居中聚焦
 */
function centerFocus(elem, horiz, on) {
    import('../../scripts/scrollHelper').then((scrollHelper) => {
        const fn = on ? 'on' : 'off';
        scrollHelper.centerFocus[fn](elem, horiz);
    });
}

/**
 * 处理表单提交事件
 * @param {Event} e - 表单提交事件
 */
function onSubmit(e) {
    // 显示加载动画
    loading.show();

    const instance = this;
    const dlg = dom.parentWithClass(e.target, 'dialog');
    const options = instance.options;

    // 获取对应服务器的 API 客户端
    const apiClient = ServerConnections.getApiClient(options.serverId);

    // 判断是否替换所有元数据
    const replaceAllMetadata = dlg.querySelector('#selectMetadataRefreshMode').value === 'all';

    // 根据选择的模式确定刷新类型：默认模式或完全刷新
    const mode = dlg.querySelector('#selectMetadataRefreshMode').value === 'scan' ? 'Default' : 'FullRefresh';
    // 是否替换所有图片（仅在完全刷新模式下有效）
    const replaceAllImages = mode === 'FullRefresh' && dlg.querySelector('.chkReplaceImages').checked;
    // 是否重新生成 Trickplay 图片（仅在完全刷新模式下有效）
    const replaceTrickplayImages = mode === 'FullRefresh' && dlg.querySelector('.chkReplaceTrickplayImages').checked;

    // 遍历所有选中的项目 ID，逐一发起刷新请求
    options.itemIds.forEach(function (itemId) {
        apiClient.refreshItem(itemId, {
            Recursive: true, // 递归刷新子项目
            ImageRefreshMode: mode, // 图片刷新模式
            MetadataRefreshMode: mode, // 元数据刷新模式
            ReplaceAllImages: replaceAllImages, // 是否替换所有图片
            RegenerateTrickplay: replaceTrickplayImages, // 是否重新生成 Trickplay 图片
            ReplaceAllMetadata: replaceAllMetadata // 是否替换所有元数据
        });
    });

    // 关闭对话框
    dialogHelper.close(dlg);

    // 显示提示消息：刷新已加入队列
    toast(globalize.translate('RefreshQueued'));

    // 隐藏加载动画
    loading.hide();

    // 阻止表单默认提交行为
    e.preventDefault();
    return false;
}

/**
 * 刷新元数据对话框类
 * 用于显示和处理媒体项目的元数据刷新操作
 */
class RefreshDialog {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {string} options.serverId - 服务器 ID
     * @param {Array<string>} options.itemIds - 要刷新的项目 ID 列表
     * @param {string} [options.mode] - 初始刷新模式
     */
    constructor(options) {
        this.options = options;
    }

    /**
     * 显示刷新对话框
     * @returns {Promise} 对话框关闭时 resolve 的 Promise
     */
    show() {
        // 对话框配置选项
        const dialogOptions = {
            removeOnClose: true, // 关闭时移除对话框元素
            scrollY: false // 禁用垂直滚动
        };

        // 根据设备类型调整对话框大小
        if (layoutManager.tv) {
            dialogOptions.size = 'fullscreen'; // TV 模式使用全屏
        } else {
            dialogOptions.size = 'small'; // 其他设备使用小尺寸
        }

        // 创建对话框元素
        const dlg = dialogHelper.createDialog(dialogOptions);

        // 添加表单对话框样式类
        dlg.classList.add('formDialog');

        let html = '';
        // 对话框标题
        const title = globalize.translate('RefreshMetadata');

        // 对话框头部
        html += '<div class="formDialogHeader">';
        // 返回按钮
        html += `<button is="paper-icon-button-light" class="btnCancel autoSize" tabindex="-1" title="${globalize.translate('ButtonBack')}"><span class="material-icons arrow_back" aria-hidden="true"></span></button>`;
        html += '<h3 class="formDialogHeaderTitle">';
        html += title;
        html += '</h3>';

        html += '</div>';

        // 添加编辑器 HTML 内容
        html += getEditorHtml();

        // 设置对话框内容
        dlg.innerHTML = html;

        // 绑定表单提交事件
        dlg.querySelector('form').addEventListener('submit', onSubmit.bind(this));

        // 监听刷新模式选择变化
        dlg.querySelector('#selectMetadataRefreshMode').addEventListener('change', function () {
            if (this.value === 'scan') {
                // 扫描模式：隐藏图片替换选项
                dlg.querySelector('.fldReplaceExistingImages').classList.add('hide');
                dlg.querySelector('.fldReplaceTrickplayImages').classList.add('hide');
            } else {
                // 其他模式：显示图片替换选项
                dlg.querySelector('.fldReplaceExistingImages').classList.remove('hide');
                dlg.querySelector('.fldReplaceTrickplayImages').classList.remove('hide');
            }
        });

        // 如果提供了初始模式，设置选择器的值
        if (this.options.mode) {
            dlg.querySelector('#selectMetadataRefreshMode').value = this.options.mode;
        }

        // 触发 change 事件，更新界面状态
        dlg.querySelector('#selectMetadataRefreshMode').dispatchEvent(new CustomEvent('change'));

        // 绑定取消按钮点击事件
        dlg.querySelector('.btnCancel').addEventListener('click', function () {
            dialogHelper.close(dlg);
        });

        // TV 模式：启用焦点居中
        if (layoutManager.tv) {
            centerFocus(dlg.querySelector('.formDialogContent'), false, true);
        }

        // 返回 Promise，对话框关闭时 resolve
        return new Promise(function (resolve) {
            // TV 模式：禁用焦点居中
            if (layoutManager.tv) {
                centerFocus(dlg.querySelector('.formDialogContent'), false, false);
            }

            // 监听对话框关闭事件
            dlg.addEventListener('close', resolve);
            // 打开对话框
            dialogHelper.open(dlg);
        });
    }
}

export default RefreshDialog;
