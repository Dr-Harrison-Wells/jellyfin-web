
/**
 * 图片上传器模块
 * Module for imageUploader.
 * @module components/imageUploader/imageUploader
 */

import dialogHelper from '../dialogHelper/dialogHelper';
import dom from '../../scripts/dom';
import loading from '../loading/loading';
import scrollHelper from '../../scripts/scrollHelper';
import layoutManager from '../layoutManager';
import globalize from '../../lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';

import '../../elements/emby-button/emby-button';
import '../../elements/emby-select/emby-select';
import '../formdialog.scss';
import './style.scss';
import toast from '../toast/toast';
import template from './imageUploader.template.html';

// 当前项目 ID
let currentItemId;
// 当前服务器 ID
let currentServerId;
// 当前选择的文件
let currentFile;
// 是否有更改
let hasChanges = false;

/**
 * 处理文件读取错误
 * @param {Event} evt - 错误事件
 */
function onFileReaderError(evt) {
    loading.hide();

    switch (evt.target.error.code) {
        case evt.target.error.NOT_FOUND_ERR:
            // 文件未找到错误
            toast(globalize.translate('MessageFileReadError'));
            break;
        case evt.target.error.ABORT_ERR:
            // 文件读取中止，无需处理
            break; // noop
        default:
            // 其他文件读取错误
            toast(globalize.translate('MessageFileReadError'));
            break;
    }
}

/**
 * 设置要上传的文件
 * @param {HTMLElement} page - 页面元素
 * @param {FileList} files - 文件列表
 */
function setFiles(page, files) {
    const file = files[0];

    // 检查文件是否为图片类型
    if (!file?.type.match('image.*')) {
        // 清空图片输出区域
        page.querySelector('#imageOutput').innerHTML = '';
        // 隐藏上传字段
        page.querySelector('#fldUpload').classList.add('hide');
        currentFile = null;
        return;
    }

    currentFile = file;

    // 创建文件读取器
    const reader = new FileReader();

    // 文件读取错误处理
    reader.onerror = onFileReaderError;
    // 文件读取开始时隐藏上传字段
    reader.onloadstart = () => {
        page.querySelector('#fldUpload').classList.add('hide');
    };
    // 文件读取中止时隐藏加载状态
    reader.onabort = () => {
        loading.hide();
        console.debug('File read cancelled');
    };

    // 使用闭包捕获文件信息
    reader.onload = (theFile => {
        return e => {
            // 渲染缩略图
            const html = ['<img style="max-width:100%;max-height:100%;" src="', e.target.result, '" title="', escape(theFile.name), '"/>'].join('');

            // 显示图片预览
            page.querySelector('#imageOutput').innerHTML = html;
            // 隐藏拖放提示文本
            page.querySelector('#dropImageText').classList.add('hide');
            // 显示上传字段
            page.querySelector('#fldUpload').classList.remove('hide');
        };
    })(file);

    // 将图片文件读取为 Data URL
    reader.readAsDataURL(file);
}

/**
 * 处理表单提交
 * @param {Event} e - 提交事件
 * @returns {boolean} - 返回 false 阻止默认提交行为
 */
// eslint-disable-next-line sonarjs/no-invariant-returns
function onSubmit(e) {
    const file = currentFile;

    // 检查是否选择了文件
    if (!file) {
        return false;
    }

    // 验证文件类型是否为图片
    if (!file.type.startsWith('image/')) {
        // 提示仅允许图片文件
        toast(globalize.translate('MessageImageFileTypeAllowed'));
        e.preventDefault();
        return false;
    }

    // 显示加载状态
    loading.show();

    // 获取对话框元素
    const dlg = dom.parentWithClass(this, 'dialog');

    // 获取选择的图片类型
    const imageType = dlg.querySelector('#selectImageType').value;
    if (imageType === 'None') {
        // 提示需要选择图片类型
        toast(globalize.translate('MessageImageTypeNotSelected'));
        e.preventDefault();
        return false;
    }

    // 调用 API 上传图片
    ServerConnections.getApiClient(currentServerId).uploadItemImage(currentItemId, imageType, file).then(() => {
        // 清空文件选择器
        dlg.querySelector('#uploadImage').value = '';

        // 隐藏加载状态
        loading.hide();
        // 标记有更改
        hasChanges = true;
        // 关闭对话框
        dialogHelper.close(dlg);
    });

    // 阻止表单默认提交行为
    e.preventDefault();
    return false;
}

/**
 * 初始化编辑器
 * @param {HTMLElement} page - 页面元素
 */
function initEditor(page) {
    // 绑定表单提交事件
    page.querySelector('form').addEventListener('submit', onSubmit);

    // 绑定文件选择变化事件
    page.querySelector('#uploadImage').addEventListener('change', function () {
        setFiles(page, this.files);
    });

    // 绑定浏览按钮点击事件
    page.querySelector('.btnBrowse').addEventListener('click', () => {
        page.querySelector('#uploadImage').click();
    });
}

/**
 * 显示图片上传编辑器
 * @param {Object} options - 选项配置
 * @param {Function} resolve - Promise 的 resolve 回调
 */
function showEditor(options, resolve) {
    options = options || {};

    // 设置当前项目和服务器信息
    currentItemId = options.itemId;
    currentServerId = options.serverId;

    // 配置对话框选项
    const dialogOptions = {
        removeOnClose: true
    };

    // 根据设备类型设置对话框大小
    if (layoutManager.tv) {
        // 电视模式使用全屏
        dialogOptions.size = 'fullscreen';
    } else {
        // 其他设备使用小尺寸
        dialogOptions.size = 'small';
    }

    // 创建对话框
    const dlg = dialogHelper.createDialog(dialogOptions);

    // 添加表单对话框样式
    dlg.classList.add('formDialog');

    // 设置对话框内容并翻译
    dlg.innerHTML = globalize.translateHtml(template, 'core');

    // 电视模式下启用居中聚焦
    if (layoutManager.tv) {
        scrollHelper.centerFocus.on(dlg, false);
    }

    // 注意: z-index 必须在调用 .open() 后设置
    dlg.addEventListener('close', () => {
        // 电视模式下关闭居中聚焦
        if (layoutManager.tv) {
            scrollHelper.centerFocus.off(dlg, false);
        }

        // 隐藏加载状态
        loading.hide();
        // 返回是否有更改
        resolve(hasChanges);
    });

    // 打开对话框
    dialogHelper.open(dlg);

    // 初始化编辑器
    initEditor(dlg);

    // 设置默认图片类型
    dlg.querySelector('#selectImageType').value = options.imageType || 'Primary';

    // 绑定取消按钮事件
    dlg.querySelector('.btnCancel').addEventListener('click', () => {
        dialogHelper.close(dlg);
    });
}

/**
 * 显示图片上传器对话框
 * @param {Object} options - 配置选项
 * @param {string} options.itemId - 项目 ID
 * @param {string} options.serverId - 服务器 ID
 * @param {string} [options.imageType] - 图片类型，默认为 'Primary'
 * @returns {Promise<boolean>} - 返回是否有更改
 */
export function show(options) {
    return new Promise(resolve => {
        // 重置更改标志
        hasChanges = false;

        // 显示编辑器
        showEditor(options, resolve);
    });
}

// 默认导出
export default {
    show: show
};
