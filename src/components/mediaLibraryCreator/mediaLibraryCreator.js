
/**
 * Module for media library creator.
 * @module components/mediaLibraryCreator/mediaLibraryCreator
 */

// 媒体库创建弹窗：负责让用户选择内容类型、添加文件夹路径，并最终调用 API 创建“虚拟文件夹/媒体库”。

import escapeHtml from 'escape-html';
import loading from '../loading/loading';
import dialogHelper from '../dialogHelper/dialogHelper';
import dom from '../../scripts/dom';
import libraryoptionseditor from '../libraryoptionseditor/libraryoptionseditor';
import globalize from '../../lib/globalize';
import '../../elements/emby-button/emby-button';
import '../../elements/emby-button/paper-icon-button-light';
import '../../elements/emby-input/emby-input';
import '../../elements/emby-select/emby-select';
import '../../elements/emby-toggle/emby-toggle';
import '../listview/listview.scss';
import '../formdialog.scss';
import '../../styles/flexstyles.scss';
import './style.scss';
import toast from '../toast/toast';
import alert from '../alert';
import template from './mediaLibraryCreator.template.html';

// 提交“创建媒体库”表单
function onAddLibrary(e) {
    e.preventDefault();

    // 避免重复提交
    if (isCreating) {
        return false;
    }

    // 至少需要添加一个文件夹路径
    if (pathInfos.length == 0) {
        alert({
            text: globalize.translate('PleaseAddAtLeastOneFolder'),
            type: 'error'
        });

        return false;
    }

    isCreating = true;
    loading.show();
    const dlg = dom.parentWithClass(this, 'dlg-librarycreator');
    const name = dlg.querySelector('#txtValue').value.trim();
    let type = dlg.querySelector('#selectCollectionType').value;

    // 媒体库名称不能为空
    if (name.length === 0) {
        alert({
            text: globalize.translate('LibraryNameInvalid'),
            type: 'error'
        });

        isCreating = false;
        loading.hide();

        return false;
    }

    if (type == 'mixed') {
        type = null;
    }

    // 从子组件读取“媒体库选项”，并补充 PathInfos（用户添加的路径列表）
    const libraryOptions = libraryoptionseditor.getLibraryOptions(dlg.querySelector('.libraryOptions'));
    libraryOptions.PathInfos = pathInfos;

    // 调用后端创建虚拟文件夹（媒体库）
    ApiClient.addVirtualFolder(name, type, currentOptions.refresh, libraryOptions).then(() => {
        hasChanges = true;
        isCreating = false;
        loading.hide();
        dialogHelper.close(dlg);
    }, () => {
        toast(globalize.translate('ErrorAddingMediaPathToVirtualFolder'));

        isCreating = false;
        loading.hide();
    });
}

// 将内容类型选项渲染为 <select> 的 <option>
function getCollectionTypeOptionsHtml(collectionTypeOptions) {
    return collectionTypeOptions.map(i => {
        return `<option value="${i.value}">${i.name}</option>`;
    }).join('');
}

// 初始化弹窗内的交互（内容类型选择、添加/删除路径、提交表单）
function initEditor(page, collectionTypeOptions) {
    const selectCollectionType = page.querySelector('#selectCollectionType');
    selectCollectionType.innerHTML = getCollectionTypeOptionsHtml(collectionTypeOptions);
    selectCollectionType.value = '';
    selectCollectionType.addEventListener('change', function () {
        const value = this.value;
        const dlg = dom.parentWithClass(this, 'dialog');

        // 根据内容类型切换 libraryOptions 的可见性与配置
        libraryoptionseditor.setContentType(dlg.querySelector('.libraryOptions'), value);

        if (value) {
            dlg.querySelector('.libraryOptions').classList.remove('hide');
        } else {
            dlg.querySelector('.libraryOptions').classList.add('hide');
        }

        if (value != 'mixed') {
            const index = this.selectedIndex;

            if (index != -1) {
                const name = this.options[index].innerHTML
                    .replaceAll('*', '')
                    .replaceAll('&amp;', '&');
                dlg.querySelector('#txtValue').value = name;
            }
        }

        // 展示该内容类型的说明（如果后端/配置提供）
        const folderOption = collectionTypeOptions.find(i => i.value === value);
        dlg.querySelector('.collectionTypeFieldDescription').innerHTML = folderOption?.message || '';
    });
    page.querySelector('.btnAddFolder').addEventListener('click', onAddButtonClick);
    page.querySelector('.addLibraryForm').addEventListener('submit', onAddLibrary);
    page.querySelector('.folderList').addEventListener('click', onRemoveClick);
}

// 打开目录选择器，选择要添加到媒体库的路径
function onAddButtonClick() {
    const page = dom.parentWithClass(this, 'dlg-librarycreator');

    // 目录浏览器按需加载，减少首屏体积
    import('../directorybrowser/directorybrowser').then(({ default: DirectoryBrowser }) => {
        const picker = new DirectoryBrowser();
        picker.show({
            callback: function (path, networkSharePath) {
                if (path) {
                    addMediaLocation(page, path, networkSharePath);
                }

                picker.close();
            }
        });
    });
}

// 单个路径条目的 HTML（用于列表渲染）
function getFolderHtml(pathInfo, index) {
    let html = '';
    html += '<div class="listItem listItem-border lnkPath">';
    html += `<div class="${pathInfo.NetworkPath ? 'listItemBody two-line' : 'listItemBody'}">`;
    html += `<div class="listItemBodyText" dir="ltr">${escapeHtml(pathInfo.Path)}</div>`;

    if (pathInfo.NetworkPath) {
        html += `<div class="listItemBodyText secondary" dir="ltr">${escapeHtml(pathInfo.NetworkPath)}</div>`;
    }

    html += '</div>';
    html += `<button type="button" is="paper-icon-button-light"" class="listItemButton btnRemovePath" data-index="${index}"><span class="material-icons remove_circle" aria-hidden="true"></span></button>`;
    html += '</div>';
    return html;
}

// 重新渲染路径列表
function renderPaths(page) {
    const foldersHtml = pathInfos.map(getFolderHtml).join('');
    const folderList = page.querySelector('.folderList');
    folderList.innerHTML = foldersHtml;

    if (foldersHtml) {
        folderList.classList.remove('hide');
    } else {
        folderList.classList.add('hide');
    }
}

// 添加一个媒体路径（会做“忽略大小写”的去重）
function addMediaLocation(page, path, networkSharePath) {
    const pathLower = path.toLowerCase();
    const pathFilter = pathInfos.filter(p => {
        return p.Path.toLowerCase() == pathLower;
    });

    // 已存在则不重复添加
    if (!pathFilter.length) {
        const pathInfo = {
            Path: path
        };

        if (networkSharePath) {
            pathInfo.NetworkPath = networkSharePath;
        }

        pathInfos.push(pathInfo);
        renderPaths(page);
    }
}

// 点击删除按钮：从 pathInfos 移除对应路径并刷新列表
function onRemoveClick(e) {
    const button = dom.parentWithClass(e.target, 'btnRemovePath');
    const index = parseInt(button.getAttribute('data-index'), 10);
    const location = pathInfos[index].Path;
    const locationLower = location.toLowerCase();
    pathInfos = pathInfos.filter(p => {
        return p.Path.toLowerCase() != locationLower;
    });
    renderPaths(dom.parentWithClass(button, 'dlg-librarycreator'));
}

// 弹窗关闭时，将是否有变更返回给调用方
function onDialogClosed() {
    currentResolve(hasChanges);
}

// 初始化“媒体库选项”编辑器，并触发一次 change 来应用默认内容类型
function initLibraryOptions(dlg) {
    libraryoptionseditor.embed(dlg.querySelector('.libraryOptions')).then(() => {
        dlg.querySelector('#selectCollectionType').dispatchEvent(new Event('change'));
    });
}

export class MediaLibraryCreator {
    constructor(options) {
        return new Promise((resolve) => {
            currentOptions = options;
            currentResolve = resolve;
            hasChanges = false;

            // 创建并打开弹窗
            const dlg = dialogHelper.createDialog({
                size: 'small',
                modal: false,
                removeOnClose: true,
                scrollY: false
            });
            dlg.classList.add('ui-body-a');
            dlg.classList.add('background-theme-a');
            dlg.classList.add('dlg-librarycreator');
            dlg.classList.add('formDialog');
            dlg.innerHTML = globalize.translateHtml(template);
            initEditor(dlg, options.collectionTypeOptions);
            dlg.addEventListener('close', onDialogClosed);
            dialogHelper.open(dlg);
            dlg.querySelector('.btnCancel').addEventListener('click', () => {
                dialogHelper.close(dlg);
            });

            // 路径列表状态（每次打开弹窗都从空开始）
            pathInfos = [];
            renderPaths(dlg);
            initLibraryOptions(dlg);
        });
    }
}

// 当前弹窗内的状态（模块级变量：同一时刻通常只会打开一个创建弹窗）
let pathInfos = [];
let currentResolve;
let currentOptions;
let hasChanges = false;
let isCreating = false;

export default MediaLibraryCreator;
