/**
 * 歌词上传器模块
 * 用于处理歌词文件的上传功能，支持 .lrc 和 .txt 格式
 */
import escapeHtml from 'escape-html';

import { getLyricsApi } from '@jellyfin/sdk/lib/utils/api/lyrics-api';
import { toApi } from 'utils/jellyfin-apiclient/compat';
import dialogHelper from '../../components/dialogHelper/dialogHelper';
import dom from '../../scripts/dom';
import loading from '../../components/loading/loading';
import scrollHelper from '../../scripts/scrollHelper';
import layoutManager from '../layoutManager';
import globalize from 'lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import template from './lyricsuploader.template.html';
import toast from '../toast/toast';
import '../../elements/emby-button/emby-button';
import '../../elements/emby-select/emby-select';
import '../formdialog.scss';
import './lyricsuploader.scss';
import { readFileAsText } from 'utils/file';

// 当前正在处理的媒体项 ID
let currentItemId;
// 当前服务器 ID
let currentServerId;
// 当前选中的文件对象
let currentFile;
// 标记是否有更改发生
let hasChanges = false;

/**
 * 处理文件读取错误
 * @param {Event} evt - 错误事件对象
 */
function onFileReaderError(evt) {
    loading.hide();

    const error = evt.target.error;
    // 如果不是用户主动取消操作，则显示错误提示
    if (error.code !== error.ABORT_ERR) {
        toast(globalize.translate('MessageFileReadError'));
    }
}

/**
 * 验证文件是否为有效的歌词文件
 * @param {File} file - 要验证的文件对象
 * @returns {boolean} 文件是否为 .lrc 或 .txt 格式
 */
function isValidLyricsFile(file) {
    return file && ['.lrc', '.txt']
        .some(function(ext) {
            return file.name.endsWith(ext);
        });
}

/**
 * 设置要上传的文件
 * @param {HTMLElement} page - 对话框页面元素
 * @param {FileList} files - 用户选择的文件列表
 */
function setFiles(page, files) {
    const file = files[0];

    // 如果文件格式无效，重置界面状态
    if (!isValidLyricsFile(file)) {
        page.querySelector('#lyricsOutput').innerHTML = '';
        page.querySelector('#fldUpload').classList.add('hide');
        page.querySelector('#labelDropLyrics').classList.remove('hide');
        currentFile = null;
        return;
    }

    currentFile = file;

    // 创建文件读取器
    const reader = new FileReader();

    // 设置错误处理器
    reader.onerror = onFileReaderError;
    // 开始读取时隐藏上传区域
    reader.onloadstart = function () {
        page.querySelector('#fldUpload').classList.add('hide');
    };
    // 读取被取消时的处理
    reader.onabort = function () {
        loading.hide();
        console.debug('File read cancelled');
    };

    // 使用闭包捕获文件信息，读取成功后更新 UI
    reader.onload = (function (theFile) {
        return function () {
            // 渲染文件信息到界面，显示歌词图标和文件名
            const html = `<div><span class="material-icons lyrics" aria-hidden="true" style="transform: translateY(25%);"></span><span>${escapeHtml(theFile.name)}</span></div>`;

            page.querySelector('#lyricsOutput').innerHTML = html;
            page.querySelector('#fldUpload').classList.remove('hide');
            page.querySelector('#labelDropLyrics').classList.add('hide');
        };
    })(file);

    // 将歌词文件读取为 Data URL
    reader.readAsDataURL(file);
}

/**
 * 处理表单提交，上传歌词文件
 * @param {Event} e - 提交事件对象
 */
async function onSubmit(e) {
    e.preventDefault();
    const file = currentFile;

    // 再次验证文件格式
    if (!isValidLyricsFile(file)) {
        toast(globalize.translate('MessageLyricsFileTypeAllowed'));
        return;
    }

    loading.show();
    const dlg = dom.parentWithClass(this, 'dialog');

    // 获取 API 客户端和歌词 API
    const api = toApi(ServerConnections.getApiClient(currentServerId));
    const lyricsApi = getLyricsApi(api);
    // 读取文件内容为文本
    const data = await readFileAsText(file);

    // 上传歌词到服务器
    lyricsApi.uploadLyrics({
        itemId: currentItemId, fileName: file.name, body: data
    }).then(function () {
        // 上传成功后清空输入，标记有更改，关闭对话框
        dlg.querySelector('#uploadLyrics').value = '';
        loading.hide();
        hasChanges = true;
        dialogHelper.close(dlg);
    });
}

/**
 * 初始化编辑器，绑定事件监听器
 * @param {HTMLElement} page - 对话框页面元素
 */
function initEditor(page) {
    // 监听表单提交事件
    page.querySelector('.uploadLyricsForm').addEventListener('submit', onSubmit);
    // 监听文件选择变化事件
    page.querySelector('#uploadLyrics').addEventListener('change', function () {
        setFiles(page, this.files);
    });
    // 点击浏览按钮时触发文件选择
    page.querySelector('.btnBrowse').addEventListener('click', function () {
        page.querySelector('#uploadLyrics').click();
    });
}

/**
 * 显示歌词上传编辑器对话框
 * @param {Object} options - 选项配置
 * @param {string} options.itemId - 媒体项 ID
 * @param {string} options.serverId - 服务器 ID
 * @param {Function} resolve - Promise 解析函数
 */
function showEditor(options, resolve) {
    options = options || {};
    currentItemId = options.itemId;
    currentServerId = options.serverId;

    // 配置对话框选项
    const dialogOptions = {
        removeOnClose: true,
        scrollY: false
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
    dlg.classList.add('lyricsUploaderDialog');

    // 使用模板和本地化字符串填充对话框内容
    dlg.innerHTML = globalize.translateHtml(template, 'core');

    // TV 模式下启用居中焦点
    if (layoutManager.tv) {
        scrollHelper.centerFocus.on(dlg, false);
    }

    // 监听对话框关闭事件（需要在 .open() 之后设置 z-index）
    dlg.addEventListener('close', function () {
        if (layoutManager.tv) {
            scrollHelper.centerFocus.off(dlg, false);
        }
        loading.hide();
        // 解析 Promise，返回是否有更改
        resolve(hasChanges);
    });

    // 打开对话框
    dialogHelper.open(dlg);

    // 初始化编辑器事件
    initEditor(dlg);

    // 绑定取消按钮事件
    dlg.querySelector('.btnCancel').addEventListener('click', function () {
        dialogHelper.close(dlg);
    });
}

/**
 * 显示歌词上传器对话框
 * @param {Object} options - 选项配置
 * @param {string} options.itemId - 媒体项 ID
 * @param {string} options.serverId - 服务器 ID
 * @returns {Promise<boolean>} 返回是否有更改的 Promise
 */
export function show(options) {
    return new Promise(function (resolve) {
        hasChanges = false;
        showEditor(options, resolve);
    });
}

// 默认导出
export default {
    show
};
