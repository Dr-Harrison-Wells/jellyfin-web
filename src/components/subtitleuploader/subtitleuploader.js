/**
 * 字幕上传器组件
 * 用于上传外部字幕文件到 Jellyfin 媒体项
 */

// HTML 转义工具,防止 XSS 攻击
import escapeHtml from 'escape-html';

// Jellyfin SDK API 相关导入
import { getSubtitleApi } from '@jellyfin/sdk/lib/utils/api/subtitle-api';
import { toApi } from 'utils/jellyfin-apiclient/compat';
// 对话框辅助工具
import dialogHelper from '../../components/dialogHelper/dialogHelper';
// DOM 操作工具
import dom from '../../scripts/dom';
// 加载动画组件
import loading from '../../components/loading/loading';
// 滚动辅助工具
import scrollHelper from '../../scripts/scrollHelper';
// 布局管理器
import layoutManager from '../layoutManager';
// 国际化工具
import globalize from '../../lib/globalize';
// 服务器连接管理
import { ServerConnections } from 'lib/jellyfin-apiclient';
// 模板 HTML
import template from './subtitleuploader.template.html';
// 提示消息组件
import toast from '../toast/toast';

// UI 组件和样式导入
import '../../elements/emby-button/emby-button';
import '../../elements/emby-select/emby-select';
import '../formdialog.scss';
import './style.scss';
// 文件读取工具
import { readFileAsBase64 } from 'utils/file';

// 当前媒体项 ID
let currentItemId;
// 当前服务器 ID
let currentServerId;
// 当前选中的字幕文件
let currentFile;
// 是否有变更标志
let hasChanges = false;

/**
 * 文件读取错误处理函数
 * @param {Event} evt - 错误事件对象
 */
function onFileReaderError(evt) {
    // 隐藏加载动画
    loading.hide();

    const error = evt.target.error;
    // 如果不是用户主动取消操作,则显示错误提示
    if (error.code !== error.ABORT_ERR) {
        toast(globalize.translate('MessageFileReadError'));
    }
}

/**
 * 验证是否为有效的字幕文件
 * @param {File} file - 要验证的文件对象
 * @returns {boolean} 如果文件扩展名是支持的字幕格式则返回 true
 */
function isValidSubtitleFile(file) {
    // 支持的字幕格式: .sub, .srt, .vtt, .ass, .ssa, .mks
    return file && ['.sub', '.srt', '.vtt', '.ass', '.ssa', '.mks']
        .some(function(ext) {
            return file.name.endsWith(ext);
        });
}

/**
 * 设置选中的字幕文件并更新 UI
 * @param {HTMLElement} page - 页面元素
 * @param {FileList} files - 选中的文件列表
 */
function setFiles(page, files) {
    const file = files[0];

    // 验证文件格式
    if (!isValidSubtitleFile(file)) {
        // 清空输出区域
        page.querySelector('#subtitleOutput').innerHTML = '';
        // 隐藏上传按钮区域
        page.querySelector('#fldUpload').classList.add('hide');
        // 显示拖放提示标签
        page.querySelector('#labelDropSubtitle').classList.remove('hide');
        currentFile = null;
        return;
    }

    // 保存当前文件
    currentFile = file;

    // 创建文件读取器
    const reader = new FileReader();

    // 绑定错误处理
    reader.onerror = onFileReaderError;
    // 开始读取时隐藏上传区域
    reader.onloadstart = function () {
        page.querySelector('#fldUpload').classList.add('hide');
    };
    // 读取中止时的处理
    reader.onabort = function () {
        loading.hide();
        console.debug('File read cancelled');
    };

    // 使用闭包捕获文件信息
    reader.onload = (function (theFile) {
        return function () {
            // 渲染文件信息到页面
            const html = `<div><span class="material-icons subtitles" aria-hidden="true" style="transform: translateY(25%);"></span><span>${escapeHtml(theFile.name)}</span></div>`;

            // 更新输出区域内容
            page.querySelector('#subtitleOutput').innerHTML = html;
            // 显示上传按钮区域
            page.querySelector('#fldUpload').classList.remove('hide');
            // 隐藏拖放提示标签
            page.querySelector('#labelDropSubtitle').classList.add('hide');
        };
    })(file);

    // 以 Data URL 格式读取字幕文件
    reader.readAsDataURL(file);
}

/**
 * 表单提交处理函数 - 上传字幕到服务器
 * @param {Event} e - 提交事件对象
 */
async function onSubmit(e) {
    const file = currentFile;

    // 再次验证文件格式
    if (!isValidSubtitleFile(file)) {
        toast(globalize.translate('MessageSubtitleFileTypeAllowed'));
        e.preventDefault();
        return;
    }

    // 显示加载动画
    loading.show();

    // 获取对话框元素
    const dlg = dom.parentWithClass(this, 'dialog');
    // 获取用户选择的语言
    const language = dlg.querySelector('#selectLanguage').value;
    // 是否为强制字幕
    const isForced = dlg.querySelector('#chkIsForced').checked;
    // 是否为听障字幕
    const isHearingImpaired = dlg.querySelector('#chkIsHearingImpaired').checked;

    // 获取字幕 API 实例
    const subtitleApi = getSubtitleApi(toApi(ServerConnections.getApiClient(currentServerId)));

    // 将文件读取为 Base64 格式
    const data = await readFileAsBase64(file);
    // 提取文件扩展名作为字幕格式
    const format = file.name.substring(file.name.lastIndexOf('.') + 1).toLowerCase();

    // 上传字幕到服务器
    subtitleApi.uploadSubtitle({
        itemId: currentItemId,
        uploadSubtitleDto: { Data: data, Language: language, IsForced: isForced, Format: format, IsHearingImpaired: isHearingImpaired }
    }).then(function () {
        // 清空文件输入框
        dlg.querySelector('#uploadSubtitle').value = '';
        // 隐藏加载动画
        loading.hide();
        // 标记有变更
        hasChanges = true;
        // 关闭对话框
        dialogHelper.close(dlg);
    });

    // 阻止表单默认提交行为
    e.preventDefault();
}

/**
 * 初始化编辑器,绑定事件监听
 * @param {HTMLElement} page - 页面元素
 */
function initEditor(page) {
    // 绑定表单提交事件
    page.querySelector('.uploadSubtitleForm').addEventListener('submit', onSubmit);
    // 绑定文件选择变化事件
    page.querySelector('#uploadSubtitle').addEventListener('change', function () {
        setFiles(page, this.files);
    });
    // 绑定浏览按钮点击事件,触发文件选择
    page.querySelector('.btnBrowse').addEventListener('click', function () {
        page.querySelector('#uploadSubtitle').click();
    });
}

/**
 * 显示字幕上传对话框
 * @param {Object} options - 配置选项
 * @param {string} options.itemId - 媒体项 ID
 * @param {string} options.serverId - 服务器 ID
 * @param {Object} options.languages - 语言选项
 * @param {Function} resolve - Promise 解决函数
 */
function showEditor(options, resolve) {
    options = options || {};
    // 保存当前媒体项和服务器信息
    currentItemId = options.itemId;
    currentServerId = options.serverId;

    // 配置对话框选项
    const dialogOptions = {
        removeOnClose: true,  // 关闭时移除 DOM 元素
        scrollY: false        // 禁用垂直滚动
    };

    // 根据设备类型设置对话框大小
    if (layoutManager.tv) {
        dialogOptions.size = 'fullscreen';  // TV 模式使用全屏
    } else {
        dialogOptions.size = 'small';       // 其他设备使用小尺寸
    }

    // 创建对话框实例
    const dlg = dialogHelper.createDialog(dialogOptions);

    // 添加 CSS 类
    dlg.classList.add('formDialog');
    dlg.classList.add('subtitleUploaderDialog');

    // 设置对话框 HTML 内容并国际化
    dlg.innerHTML = globalize.translateHtml(template, 'core');

    // TV 模式下启用居中焦点
    if (layoutManager.tv) {
        scrollHelper.centerFocus.on(dlg, false);
    }

    // 对话框关闭事件监听
    // 注意: z-index 必须在调用 .open() 后设置
    dlg.addEventListener('close', function () {
        // TV 模式下禁用居中焦点
        if (layoutManager.tv) {
            scrollHelper.centerFocus.off(dlg, false);
        }
        // 隐藏加载动画
        loading.hide();
        // 返回是否有变更
        resolve(hasChanges);
    });

    // 打开对话框
    dialogHelper.open(dlg);

    // 初始化编辑器事件
    initEditor(dlg);

    // 获取语言选择下拉框
    const selectLanguage = dlg.querySelector('#selectLanguage');

    // 如果提供了语言选项,设置下拉框
    if (options.languages) {
        selectLanguage.innerHTML = options.languages.list || null;
        selectLanguage.value = options.languages.value || null;
    }

    // 绑定取消按钮事件
    dlg.querySelector('.btnCancel').addEventListener('click', function () {
        dialogHelper.close(dlg);
    });
}
}

/**
 * 显示字幕上传对话框(公共接口)
 * @param {Object} options - 配置选项
 * @param {string} options.itemId - 媒体项 ID
 * @param {string} options.serverId - 服务器 ID
 * @param {Object} options.languages - 语言选项
 * @returns {Promise<boolean>} 返回 Promise,解决值为是否有变更
 */
export function show(options) {
    return new Promise(function (resolve) {
        // 重置变更标志
        hasChanges = false;
        // 显示编辑器
        showEditor(options, resolve);
    });
}

// 默认导出
export default {
    show: show
};
