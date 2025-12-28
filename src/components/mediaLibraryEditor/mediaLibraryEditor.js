
/**
 * Module for media library editor.
 * @module components/mediaLibraryEditor/mediaLibraryEditor
 */

import escapeHtml from 'escape-html';
import 'jquery';
import loading from '../loading/loading';
import dialogHelper from '../dialogHelper/dialogHelper';
import dom from '../../scripts/dom';
import libraryoptionseditor from '../libraryoptionseditor/libraryoptionseditor';
import globalize from '../../lib/globalize';
import '../../elements/emby-button/emby-button';
import '../listview/listview.scss';
import '../../elements/emby-button/paper-icon-button-light';
import '../formdialog.scss';
import '../../elements/emby-toggle/emby-toggle';
import '../../styles/flexstyles.scss';
import './style.scss';
import alert from '../alert';
import toast from '../toast/toast';
import confirm from '../confirm/confirm';
import template from './mediaLibraryEditor.template.html';

// eslint-disable-next-line sonarjs/no-invariant-returns
function onEditLibrary() {
    // 防重复提交：保存过程中禁止再次触发“保存/提交”
    if (isCreating) {
        return false;
    }

    isCreating = true;
    loading.show();
    const dlg = dom.parentWithClass(this, 'dlg-libraryeditor');
    // when the library has moved or symlinked, the ItemId is not correct anymore
    // this can lead to a forever spinning value on edit the library parameters
    // 中文说明：当媒体库目录移动/软链接变化后，服务端返回的 ItemId 可能失效；
    // 如果继续更新参数，可能导致一直转圈的加载状态，所以这里先做兜底提示并关闭对话框。
    if (!currentOptions.library.ItemId) {
        loading.hide();
        dialogHelper.close(dlg);
        alert({
            text: globalize.translate('LibraryInvalidItemIdError')
        });
        return false;
    }
    // 读取对话框中“库选项”表单，合并到当前库的 LibraryOptions 上
    let libraryOptions = libraryoptionseditor.getLibraryOptions(dlg.querySelector('.libraryOptions'));
    libraryOptions = Object.assign(currentOptions.library.LibraryOptions || {}, libraryOptions);
    // 调用 API 更新虚拟文件夹（媒体库）的参数
    ApiClient.updateVirtualFolderOptions(currentOptions.library.ItemId, libraryOptions).then(() => {
        hasChanges = true;
        isCreating = false;
        loading.hide();
        dialogHelper.close(dlg);
    }, () => {
        isCreating = false;
        loading.hide();
    });
    return false;
}

function addMediaLocation(page, path, networkSharePath) {
    // 新增媒体路径：path 为本地路径，networkSharePath 为可选的网络共享路径
    const virtualFolder = currentOptions.library;
    const refreshAfterChange = currentOptions.refresh;
    ApiClient.addMediaPath(virtualFolder.Name, path, networkSharePath, refreshAfterChange).then(() => {
        hasChanges = true;
        refreshLibraryFromServer(page);
    }, () => {
        toast(globalize.translate('ErrorAddingMediaPathToVirtualFolder'));
    });
}

function updateMediaLocation(page, path, networkSharePath) {
    // 更新已有媒体路径（以 Path 作为定位键）
    const virtualFolder = currentOptions.library;
    ApiClient.updateMediaPath(virtualFolder.Name, {
        Path: path,
        NetworkPath: networkSharePath
    }).then(() => {
        hasChanges = true;
        refreshLibraryFromServer(page);
    }, () => {
        toast(globalize.translate('ErrorAddingMediaPathToVirtualFolder'));
    });
}

function onRemoveClick(btnRemovePath, location) {
    // 删除路径前先二次确认
    const button = btnRemovePath;
    const virtualFolder = currentOptions.library;

    confirm({
        title: globalize.translate('HeaderRemoveMediaLocation'),
        text: globalize.translate('MessageConfirmRemoveMediaLocation'),
        confirmText: globalize.translate('Delete'),
        primary: 'delete'
    }).then(() => {
        const refreshAfterChange = currentOptions.refresh;
        ApiClient.removeMediaPath(virtualFolder.Name, location, refreshAfterChange).then(() => {
            hasChanges = true;
            refreshLibraryFromServer(dom.parentWithClass(button, 'dlg-libraryeditor'));
        }, () => {
            toast(globalize.translate('ErrorDefault'));
        });
    });
}

function onListItemClick(e) {
    // 列表点击：
    // - 点击删除按钮：删除该路径
    // - 点击其它区域：打开目录选择器用于编辑该路径
    const listItem = dom.parentWithClass(e.target, 'listItem');

    if (listItem) {
        const index = parseInt(listItem.getAttribute('data-index'), 10);
        const pathInfos = currentOptions.library.LibraryOptions?.PathInfos || [];
        const pathInfo = index == null ? {} : pathInfos[index] || {};
        const originalPath = pathInfo.Path || (index == null ? null : currentOptions.library.Locations[index]);
        const btnRemovePath = dom.parentWithClass(e.target, 'btnRemovePath');

        if (btnRemovePath) {
            onRemoveClick(btnRemovePath, originalPath);
            return;
        }

        showDirectoryBrowser(dom.parentWithClass(listItem, 'dlg-libraryeditor'), originalPath, pathInfo.NetworkPath);
    }
}

function getFolderHtml(pathInfo, index) {
    // 渲染单条路径的列表项（支持显示 NetworkPath 第二行）
    let html = '';
    html += `<div class="listItem listItem-border lnkPath" data-index="${index}">`;
    html += `<div class="${pathInfo.NetworkPath ? 'listItemBody two-line' : 'listItemBody'}">`;
    html += '<h3 class="listItemBodyText">';
    html += escapeHtml(pathInfo.Path);
    html += '</h3>';

    if (pathInfo.NetworkPath) {
        html += `<div class="listItemBodyText secondary">${escapeHtml(pathInfo.NetworkPath)}</div>`;
    }

    html += '</div>';
    html += `<button type="button" is="paper-icon-button-light" class="listItemButton btnRemovePath" data-index="${index}"><span class="material-icons remove_circle" aria-hidden="true"></span></button>`;
    html += '</div>';
    return html;
}

function refreshLibraryFromServer(page) {
    // 从服务端刷新当前库信息（以 Name 匹配），然后重新渲染列表
    ApiClient.getVirtualFolders().then(result => {
        const library = result.filter(f => {
            return f.Name === currentOptions.library.Name;
        })[0];

        if (library) {
            currentOptions.library = library;
            renderLibrary(page, currentOptions);
        }
    });
}

function renderLibrary(page, options) {
    // 兼容旧数据结构：
    // - 新结构优先读 LibraryOptions.PathInfos
    // - 否则回退到 Locations 只展示 Path
    let pathInfos = options.library.LibraryOptions?.PathInfos || [];

    if (!pathInfos.length) {
        pathInfos = options.library.Locations.map(p => {
            return {
                Path: p
            };
        });
    }

    if (options.library.CollectionType === 'boxsets') {
        // 合集（boxsets）类型不允许配置文件夹路径：隐藏文件夹区域
        page.querySelector('.folders').classList.add('hide');
    } else {
        page.querySelector('.folders').classList.remove('hide');
    }

    page.querySelector('.folderList').innerHTML = pathInfos.map(getFolderHtml).join('');
}

function onAddButtonClick() {
    // 新增路径：打开目录选择器（originalPath 为空表示新增）
    showDirectoryBrowser(dom.parentWithClass(this, 'dlg-libraryeditor'));
}

function showDirectoryBrowser(context, originalPath, networkPath) {
    // 懒加载目录选择器，避免编辑器初次打开时加载过多模块
    import('../directorybrowser/directorybrowser').then(({ default: DirectoryBrowser }) => {
        const picker = new DirectoryBrowser();
        picker.show({
            // 编辑已有路径时，Path 不允许改（只允许改 NetworkSharePath）
            pathReadOnly: originalPath != null,
            path: originalPath,
            networkSharePath: networkPath,
            callback: function (path, networkSharePath) {
                // 选择完成：根据是否存在 originalPath 决定新增还是更新
                if (path) {
                    if (originalPath) {
                        updateMediaLocation(context, originalPath, networkSharePath);
                    } else {
                        addMediaLocation(context, path, networkSharePath);
                    }
                }

                picker.close();
            }
        });
    });
}

function initEditor(dlg, options) {
    // 初始化：渲染列表 + 绑定事件 + 嵌入“库选项”子编辑器
    renderLibrary(dlg, options);
    dlg.querySelector('.btnAddFolder').addEventListener('click', onAddButtonClick);
    dlg.querySelector('.folderList').addEventListener('click', onListItemClick);
    dlg.querySelector('.btnSubmit').addEventListener('click', onEditLibrary);
    libraryoptionseditor.embed(dlg.querySelector('.libraryOptions'), options.library.CollectionType, options.library.LibraryOptions);
}

function onDialogClosed() {
    // 对话框关闭时：把“是否发生过变更”作为 promise 的结果返回给调用方
    currentDeferred.resolveWith(null, [hasChanges]);
}

export class MediaLibraryEditor {
    constructor(options) {
        // 以 Deferred 的形式对外暴露：调用方可通过 promise 获取“是否有变更”
        const deferred = jQuery.Deferred();
        currentOptions = options;
        currentDeferred = deferred;
        hasChanges = false;

        // 创建对话框并填充模板
        const dlg = dialogHelper.createDialog({
            size: 'small',
            modal: false,
            removeOnClose: true,
            scrollY: false
        });
        dlg.classList.add('dlg-libraryeditor');
        dlg.classList.add('ui-body-a');
        dlg.classList.add('background-theme-a');
        dlg.classList.add('formDialog');
        dlg.innerHTML = globalize.translateHtml(template);

        // 标题显示当前库名
        dlg.querySelector('.formDialogHeaderTitle').innerText = options.library.Name;
        initEditor(dlg, options);
        dlg.addEventListener('close', onDialogClosed);
        dialogHelper.open(dlg);

        // 取消按钮：仅关闭对话框，不提交
        dlg.querySelector('.btnCancel').addEventListener('click', () => {
            dialogHelper.close(dlg);
        });

        // 打开后主动从服务端刷新一次，保证 PathInfos / Locations 为最新
        refreshLibraryFromServer(dlg);
        return deferred.promise();
    }
}

let currentDeferred;
let currentOptions;
let hasChanges = false;
let isCreating = false;

export default MediaLibraryEditor;
