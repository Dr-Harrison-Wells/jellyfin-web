// 导入 HTML 转义工具
import escapeHtml from 'escape-html';

// 导入 Jellyfin SDK 和 API 相关模块
import { getLyricsApi } from '@jellyfin/sdk/lib/utils/api/lyrics-api';
import { toApi } from 'utils/jellyfin-apiclient/compat';
import dialogHelper from '../dialogHelper/dialogHelper';
import layoutManager from '../layoutManager';
import globalize from 'lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import loading from '../loading/loading';
import focusManager from '../focusManager';
import dom from '../../scripts/dom';

// 导入样式和组件
import '../../elements/emby-select/emby-select';
import '../listview/listview.scss';
import '../../elements/emby-button/paper-icon-button-light';
import '../formdialog.scss';
import 'material-design-icons-iconfont';
import './lyricseditor.scss';
import '../../elements/emby-button/emby-button';
import '../../styles/flexstyles.scss';
import toast from '../toast/toast';
import template from './lyricseditor.template.html';
import templatePreview from './lyricspreview.template.html';
import { deleteLyrics } from '../../scripts/deleteHelper';

// 当前正在编辑的媒体项
let currentItem;
// 标记是否有未保存的更改
let hasChanges;

/**
 * 从远程下载歌词
 * @param {HTMLElement} context - 上下文元素
 * @param {string} id - 歌词ID
 */
function downloadRemoteLyrics(context, id) {
    const api = toApi(ServerConnections.getApiClient(currentItem.ServerId));
    const lyricsApi = getLyricsApi(api);
    lyricsApi.downloadRemoteLyrics({
        itemId: currentItem.Id,
        lyricId: id
    }).then(function () {
        // 标记有更改
        hasChanges = true;

        // 显示下载已加入队列的提示
        toast(globalize.translate('MessageDownloadQueued'));

        // 自动聚焦到上下文元素
        focusManager.autoFocus(context);
    });
}

/**
 * 将歌词对象转换为格式化的HTML文本
 * @param {Array} lyricsObject - 歌词对象数组
 * @returns {string} - 格式化的HTML歌词文本
 */
function getLyricsText(lyricsObject) {
    return lyricsObject.reduce((htmlAccumulator, lyric) => {
        // 如果有时间戳，格式化为 [mm:ss.xx] 格式
        if (lyric.Start || lyric.Start === 0) {
            const minutes = Math.floor(lyric.Start / 600000000);
            const seconds = Math.floor((lyric.Start % 600000000) / 10000000);
            const hundredths = Math.floor((lyric.Start % 10000000) / 100000);
            htmlAccumulator += '[' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0') + '.' + String(hundredths).padStart(2, '0') + '] ';
        }
        // 添加歌词文本并转义HTML字符
        htmlAccumulator += escapeHtml(lyric.Text) + '<br/>';
        return htmlAccumulator;
    }, '');
}

/**
 * 渲染歌词搜索结果
 * @param {HTMLElement} context - 上下文元素
 * @param {Array} results - 搜索结果数组
 */
function renderSearchResults(context, results) {
    let lastProvider = '';
    let html = '';

    // 如果没有搜索结果，显示无结果提示
    if (!results.length) {
        context.querySelector('.noSearchResults').classList.remove('hide');
        context.querySelector('.lyricsResults').innerHTML = '';
        loading.hide();
        return;
    }

    // 隐藏无结果提示
    context.querySelector('.noSearchResults').classList.add('hide');

    // 遍历所有搜索结果
    for (let i = 0, length = results.length; i < length; i++) {
        const result = results[i];

        const provider = result.ProviderName;
        const metadata = result.Lyrics.Metadata;
        const lyrics = getLyricsText(result.Lyrics.Lyrics);
        // 如果是新的提供商，添加提供商标题
        if (provider !== lastProvider) {
            if (i > 0) {
                html += '</div>';
            }
            html += '<h2>' + provider + '</h2>';
            html += '<div>';
            lastProvider = provider;
        }

        // 根据是否为TV模式选择不同的标签和样式
        const tagName = layoutManager.tv ? 'button' : 'div';
        let className = layoutManager.tv ? 'listItem listItem-border btnOptions' : 'listItem listItem-border';
        if (layoutManager.tv) {
            className += ' listItem-focusscale listItem-button';
        }

        html += '<' + tagName + ' class="' + className + '" data-lyricsid="' + result.Id + '">';

        // 添加歌词图标
        html += '<span class="listItemIcon material-icons lyrics" aria-hidden="true"></span>';

        html += '<div class="listItemBody three-line">';

        // 显示艺术家、专辑和标题信息
        html += '<div>' + escapeHtml(metadata.Artist + ' - ' + metadata.Album + ' - ' + metadata.Title) + '</div>';

        // 计算歌词时长（分钟和秒）
        const minutes = Math.floor(metadata.Length / 600000000);
        const seconds = Math.floor((metadata.Length % 600000000) / 10000000);

        // 显示时长信息
        html += '<div class="secondary listItemBodyText" style="white-space:pre-line;">' + globalize.translate('LabelDuration') + ': ' + minutes + ':' + String(seconds).padStart(2, '0') + '</div>';

        // 显示是否同步信息
        html += '<div class="secondary listItemBodyText" style="white-space:pre-line;">' + globalize.translate('LabelIsSynced') + ': ' + escapeHtml(metadata.IsSynced ? 'True' : 'False') + '</div>';

        html += '</div>';

        // 非TV模式下添加预览和下载按钮
        if (!layoutManager.tv) {
            html += '<button type="button" is="paper-icon-button-light" data-lyricsid="' + result.Id + '" class="btnPreview listItemButton"><span class="material-icons preview" aria-hidden="true"></span></button>';
            html += '<button type="button" is="paper-icon-button-light" data-lyricsid="' + result.Id + '" class="btnDownload listItemButton"><span class="material-icons file_download" aria-hidden="true"></span></button>';
        }
        // 添加隐藏的歌词内容（用于预览）
        html += '<div class="hide hiddenLyrics">';
        html += '<h2>' + globalize.translate('Lyrics') + '</h2>';
        html += '<div>' + lyrics + '</div>';
        html += '</div>';
        html += '</' + tagName + '>';
    }

    if (results.length) {
        html += '</div>';
    }

    // 将生成的HTML插入到结果容器中
    const elem = context.querySelector('.lyricsResults');
    elem.innerHTML = html;

    // 隐藏加载指示器
    loading.hide();
}

/**
 * 搜索远程歌词
 * @param {HTMLElement} context - 上下文元素
 */
function searchForLyrics(context) {
    // 显示加载指示器
    loading.show();

    const api = toApi(ServerConnections.getApiClient(currentItem.ServerId));
    const lyricsApi = getLyricsApi(api);
    // 执行远程歌词搜索
    lyricsApi.searchRemoteLyrics({
        itemId: currentItem.Id
    }).then(function (results) {
        // 渲染搜索结果
        renderSearchResults(context, results.data);
    });
}

/**
 * 重新加载媒体项和歌词信息
 * @param {HTMLElement} context - 上下文元素
 * @param {Object} apiClient - API客户端
 * @param {string} itemId - 媒体项ID
 */
function reload(context, apiClient, itemId) {
    context.querySelector('.noSearchResults').classList.add('hide');

    function onGetItem(item) {
        currentItem = item;

        // 填充当前歌词
        fillCurrentLyrics(context, apiClient, item);
        // 获取文件名
        let file = item.Path || '';
        const index = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'));
        if (index > -1) {
            file = file.substring(index + 1);
        }

        // 如果有文件名，显示原始文件信息
        if (file) {
            context.querySelector('.pathValue').innerText = file;
            context.querySelector('.originalFile').classList.remove('hide');
        } else {
            context.querySelector('.pathValue').innerHTML = '';
            context.querySelector('.originalFile').classList.add('hide');
        }

        loading.hide();
    }

    // 根据itemId类型获取媒体项
    if (typeof itemId === 'string') {
        apiClient.getItem(apiClient.getCurrentUserId(), itemId).then(onGetItem);
    } else {
        onGetItem(itemId);
    }
}

/**
 * 处理搜索表单提交事件
 * @param {Event} e - 事件对象
 */
function onSearchSubmit(e) {
    const form = this;

    // 执行歌词搜索
    searchForLyrics(dom.parentWithClass(form, 'formDialogContent'));

    // 阻止表单默认提交行为
    e.preventDefault();
    return false;
}

/**
 * 处理歌词搜索结果点击事件
 * @param {Event} e - 事件对象
 */
function onLyricsResultsClick(e) {
    let lyricsId;
    let context;
    let lyrics;

    // 处理选项按钮点击（TV模式）
    const btnOptions = dom.parentWithClass(e.target, 'btnOptions');
    if (btnOptions) {
        lyricsId = btnOptions.getAttribute('data-lyricsid');
        lyrics = btnOptions.querySelector('.hiddenLyrics');
        context = dom.parentWithClass(btnOptions, 'lyricsEditorDialog');
        showOptions(btnOptions, context, lyricsId, lyrics.innerHTML);
    }

    // 处理预览按钮点击
    const btnPreview = dom.parentWithClass(e.target, 'btnPreview');
    if (btnPreview) {
        lyrics = btnPreview.parentNode.querySelector('.hiddenLyrics');
        showLyricsPreview(lyrics.innerHTML);
    }

    // 处理下载按钮点击
    const btnDownload = dom.parentWithClass(e.target, 'btnDownload');
    if (btnDownload) {
        lyricsId = btnDownload.getAttribute('data-lyricsid');
        context = dom.parentWithClass(btnDownload, 'lyricsEditorDialog');
        downloadRemoteLyrics(context, lyricsId);
    }
}

/**
 * 显示歌词预览对话框
 * @param {string} lyrics - 歌词HTML内容
 */
function showLyricsPreview(lyrics) {
    const dialogOptions = {
        removeOnClose: true,
        scrollY: false
    };

    // 根据TV模式设置对话框大小
    if (layoutManager.tv) {
        dialogOptions.size = 'fullscreen';
    } else {
        dialogOptions.size = 'small';
    }

    // 创建预览对话框
    const dlg = dialogHelper.createDialog(dialogOptions);

    dlg.classList.add('formDialog');
    dlg.classList.add('lyricsEditorDialog');

    // 加载模板并翻译
    dlg.innerHTML = globalize.translateHtml(templatePreview, 'core');

    // 填充歌词内容
    dlg.querySelector('.lyricsPreview').innerHTML = lyrics;

    // 绑定取消按钮事件
    dlg.querySelector('.btnCancel').addEventListener('click', function () {
        dialogHelper.close(dlg);
    });

    // 打开对话框
    dialogHelper.open(dlg);
}

/**
 * 显示操作选项菜单
 * @param {HTMLElement} button - 触发按钮
 * @param {HTMLElement} context - 上下文元素
 * @param {string} lyricsId - 歌词ID
 * @param {string} lyrics - 歌词内容
 */
function showOptions(button, context, lyricsId, lyrics) {
    const items = [];

    // 添加预览和下载选项
    items.push({
        name: globalize.translate('PreviewLyrics'),
        id: 'preview'
    }
    , {
        name: globalize.translate('Download'),
        id: 'download'
    });

    // 动态导入并显示操作菜单
    import('../actionSheet/actionSheet').then((actionsheet) => {
        actionsheet.show({
            items: items,
            positionTo: button

        }).then(function (id) {
            // 根据选择的操作执行相应功能
            if (id === 'download') {
                downloadRemoteLyrics(context, lyricsId);
            }
            if (id === 'preview') {
                showLyricsPreview(lyrics);
            }
        });
    });
}

/**
 * 设置元素的居中聚焦行为
 * @param {HTMLElement} elem - 目标元素
 * @param {boolean} horiz - 是否水平居中
 * @param {boolean} on - 开启或关闭
 */
function centerFocus(elem, horiz, on) {
    import('../../scripts/scrollHelper').then(({ default: scrollHelper }) => {
        const fn = on ? 'on' : 'off';
        scrollHelper.centerFocus[fn](elem, horiz);
    });
}

/**
 * 处理打开上传菜单事件
 * @param {Event} e - 事件对象
 */
function onOpenUploadMenu(e) {
    const dialog = dom.parentWithClass(e.target, 'lyricsEditorDialog');
    const apiClient = ServerConnections.getApiClient(currentItem.ServerId);

    // 动态导入并显示歌词上传器
    import('../lyricsuploader/lyricsuploader').then(({ default: lyricsUploader }) => {
        lyricsUploader.show({
            itemId: currentItem.Id,
            serverId: currentItem.ServerId
        }).then(function (hasChanged) {
            // 如果有更改，重新加载
            if (hasChanged) {
                hasChanges = true;
                reload(dialog, apiClient, currentItem.Id);
            }
        });
    });
}

/**
 * 处理删除歌词事件
 * @param {Event} e - 事件对象
 */
function onDeleteLyrics(e) {
    deleteLyrics(currentItem).then(() => {
        hasChanges = true;
        const context = dom.parentWithClass(e.target, 'formDialogContent');
        const apiClient = ServerConnections.getApiClient(currentItem.ServerId);
        // 重新加载以反映删除结果
        reload(context, apiClient, currentItem.Id);
    }).catch(() => {
        // 删除对话框被关闭，不做处理
    });
}

/**
 * 填充当前媒体项的歌词
 * @param {HTMLElement} context - 上下文元素
 * @param {Object} apiClient - API客户端
 * @param {Object} item - 媒体项
 */
function fillCurrentLyrics(context, apiClient, item) {
    const api = toApi(apiClient);
    const lyricsApi = getLyricsApi(api);
    // 获取媒体项的歌词
    lyricsApi.getLyrics({
        itemId: item.Id
    }).then((response) => {
        // 如果没有歌词，清空显示区域
        if (!response.data.Lyrics) {
            context.querySelector('.currentLyrics').innerHTML = '';
        } else {
            // 格式化并显示歌词
            let html = '';
            html += '<h2>' + globalize.translate('Lyrics') + '</h2>';
            html += '<div>';
            html += getLyricsText(response.data.Lyrics);
            html += '</div>';
            context.querySelector('.currentLyrics').innerHTML = html;
        }
    }).catch(() =>{
        // 获取失败时清空显示区域
        context.querySelector('.currentLyrics').innerHTML = '';
    });
}

/**
 * 内部函数：显示歌词编辑器对话框
 * @param {string} itemId - 媒体项ID
 * @param {string} serverId - 服务器ID
 * @returns {Promise} - 返回Promise对象
 */
function showEditorInternal(itemId, serverId) {
    // 重置更改标记
    hasChanges = false;
    const apiClient = ServerConnections.getApiClient(serverId);
    return apiClient.getItem(apiClient.getCurrentUserId(), itemId).then(function (item) {
        // 配置对话框选项
        const dialogOptions = {
            removeOnClose: true,
            scrollY: false
        };

        // 根据TV模式设置对话框大小
        if (layoutManager.tv) {
            dialogOptions.size = 'fullscreen';
        } else {
            dialogOptions.size = 'small';
        }

        // 创建编辑器对话框
        const dlg = dialogHelper.createDialog(dialogOptions);

        dlg.classList.add('formDialog');
        dlg.classList.add('lyricsEditorDialog');

        // 加载并翻译模板
        dlg.innerHTML = globalize.translateHtml(template, 'core');

        // 设置文件标签文本
        dlg.querySelector('.originalLyricsFileLabel').innerHTML = globalize.translate('File');

        // 绑定事件监听器
        dlg.querySelector('.lyricsSearchForm').addEventListener('submit', onSearchSubmit);

        dlg.querySelector('.btnOpenUploadMenu').addEventListener('click', onOpenUploadMenu);

        dlg.querySelector('.btnDeleteLyrics').addEventListener('click', onDeleteLyrics);

        const btnSubmit = dlg.querySelector('.btnSubmit');

        // 根据TV模式配置界面
        if (layoutManager.tv) {
            centerFocus(dlg.querySelector('.formDialogContent'), false, true);
            dlg.querySelector('.btnSearchLyrics').classList.add('hide');
        } else {
            btnSubmit.classList.add('hide');
        }
        const editorContent = dlg.querySelector('.formDialogContent');

        // 绑定结果点击事件
        dlg.querySelector('.lyricsResults').addEventListener('click', onLyricsResultsClick);

        // 绑定取消按钮事件
        dlg.querySelector('.btnCancel').addEventListener('click', function () {
            dialogHelper.close(dlg);
        });

        // 返回Promise以处理对话框关闭结果
        return new Promise(function (resolve, reject) {
            dlg.addEventListener('close', function () {
                // TV模式下关闭居中聚焦
                if (layoutManager.tv) {
                    centerFocus(dlg.querySelector('.formDialogContent'), false, false);
                }

                // 根据是否有更改决定resolve或reject
                if (hasChanges) {
                    resolve();
                } else {
                    reject();
                }
            });

            // 打开对话框
            dialogHelper.open(dlg);

            // 加载媒体项数据
            reload(editorContent, apiClient, item);
        });
    });
}

/**
 * 显示歌词编辑器
 * @param {string} itemId - 媒体项ID
 * @param {string} serverId - 服务器ID
 * @returns {Promise} - 返回Promise对象
 */
function showEditor(itemId, serverId) {
    // 显示加载指示器
    loading.show();

    return showEditorInternal(itemId, serverId);
}

// 导出歌词编辑器模块
export default {
    show: showEditor
};
