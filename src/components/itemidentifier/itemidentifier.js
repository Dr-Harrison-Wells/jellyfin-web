
/**
 * 媒体项识别器模块
 * 用于识别和匹配媒体库中的媒体项（电影、电视剧、音乐等）与外部数据源
 * Module for itemidentifier media item.
 * @module components/itemidentifier/itemidentifier
 */

import escapeHtml from 'escape-html';
import dialogHelper from '../dialogHelper/dialogHelper';
import loading from '../loading/loading';
import globalize from '../../lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import scrollHelper from '../../scripts/scrollHelper';
import layoutManager from '../layoutManager';
import focusManager from '../focusManager';
import browser from '../../scripts/browser';
import '../../elements/emby-input/emby-input';
import '../../elements/emby-checkbox/emby-checkbox';
import '../../elements/emby-button/paper-icon-button-light';
import '../formdialog.scss';
import 'material-design-icons-iconfont';
import '../cardbuilder/card.scss';
import toast from '../toast/toast';
import template from './itemidentifier.template.html';
import datetime from '../../scripts/datetime';

// 是否启用焦点变换效果（在慢速浏览器和 Edge 上禁用）
const enableFocusTransform = !browser.slow && !browser.edge;

// 当前正在识别的媒体项
let currentItem;
// 当前媒体项类型（电影、电视剧、音乐等）
let currentItemType;
// 当前服务器 ID
let currentServerId;
// Promise resolve 函数
let currentResolve;
// Promise reject 函数
let currentReject;
// 是否有变更标志
let hasChanges = false;
// 当前选中的搜索结果
let currentSearchResult;

/**
 * 获取 API 客户端实例
 * @returns {Object} API 客户端对象
 */
function getApiClient() {
    return ServerConnections.getApiClient(currentServerId);
}

/**
 * 搜索识别结果
 * 从表单中收集识别信息并向服务器发起搜索请求
 * @param {HTMLElement} page - 页面 DOM 元素
 */
function searchForIdentificationResults(page) {
    // 初始化查找信息对象
    let lookupInfo = {
        ProviderIds: {}
    };

    let i;
    let length;
    // 获取所有识别字段
    const identifyField = page.querySelectorAll('.identifyField');
    let value;
    // 遍历识别字段，收集用户输入的信息
    for (i = 0, length = identifyField.length; i < length; i++) {
        value = identifyField[i].value;

        if (value) {
            // 如果是数字类型，转换为整数
            if (identifyField[i].type === 'number') {
                value = parseInt(value, 10);
            }

            lookupInfo[identifyField[i].getAttribute('data-lookup')] = value;
        }
    }

    let hasId = false;

    // 收集外部提供商 ID（如 TMDB、IMDB 等）
    const txtLookupId = page.querySelectorAll('.txtLookupId');
    for (i = 0, length = txtLookupId.length; i < length; i++) {
        value = txtLookupId[i].value;

        if (value) {
            hasId = true;
        }
        lookupInfo.ProviderIds[txtLookupId[i].getAttribute('data-providerkey')] = value;
    }

    // 验证：必须提供名称或 ID
    if (!hasId && !lookupInfo.Name) {
        toast(globalize.translate('PleaseEnterNameOrId'));
        return;
    }

    // 构建搜索请求对象
    lookupInfo = {
        SearchInfo: lookupInfo
    };

    // 如果是编辑现有项目，添加项目 ID
    if (currentItem?.Id) {
        lookupInfo.ItemId = currentItem.Id;
    } else {
        // 如果是新项目，包含被禁用的提供商
        lookupInfo.IncludeDisabledProviders = true;
    }

    loading.show();

    const apiClient = getApiClient();

    // 向服务器发起远程搜索请求
    apiClient.ajax({
        type: 'POST',
        url: apiClient.getUrl(`Items/RemoteSearch/${currentItemType}`),
        data: JSON.stringify(lookupInfo),
        contentType: 'application/json',
        dataType: 'json'

    }).then(results => {
        loading.hide();
        // 显示搜索结果
        showIdentificationSearchResults(page, results);
    });
}

/**
 * 显示识别搜索结果
 * @param {HTMLElement} page - 页面 DOM 元素
 * @param {Array} results - 搜索结果数组
 */
function showIdentificationSearchResults(page, results) {
    const identificationSearchResults = page.querySelector('.identificationSearchResults');

    // 切换显示状态：隐藏搜索表单，显示结果列表
    page.querySelector('.popupIdentifyForm').classList.add('hide');
    identificationSearchResults.classList.remove('hide');
    page.querySelector('.identifyOptionsForm').classList.add('hide');
    page.querySelector('.dialogContentInner').classList.remove('dialog-content-centered');

    // 构建搜索结果 HTML
    let html = '';
    let i;
    let length;
    for (i = 0, length = results.length; i < length; i++) {
        const result = results[i];
        html += getSearchResultHtml(result, i);
    }

    const elem = page.querySelector('.identificationSearchResultList');
    elem.innerHTML = html;

    // 点击搜索结果卡片的事件处理
    function onSearchImageClick() {
        const index = parseInt(this.getAttribute('data-index'), 10);

        const currentResult = results[index];

        // 根据是编辑现有项目还是创建新项目，执行不同操作
        if (currentItem != null) {
            // 编辑现有项目：显示识别选项
            showIdentifyOptions(page, currentResult);
        } else {
            // 创建新项目：完成查找新项目对话框
            finishFindNewDialog(page, currentResult);
        }
    }

    // 为所有搜索结果卡片添加点击事件监听器
    const searchImages = elem.querySelectorAll('.card');
    for (i = 0, length = searchImages.length; i < length; i++) {
        searchImages[i].addEventListener('click', onSearchImageClick);
    }

    // 在电视模式下自动聚焦到搜索结果
    if (layoutManager.tv) {
        focusManager.autoFocus(identificationSearchResults);
    }
}

/**
 * 完成查找新项目对话框
 * @param {HTMLElement} dlg - 对话框元素
 * @param {Object} identifyResult - 识别结果对象
 */
function finishFindNewDialog(dlg, identifyResult) {
    currentSearchResult = identifyResult;
    hasChanges = true;
    loading.hide();

    dialogHelper.close(dlg);
}

/**
 * 显示识别选项表单
 * 用户选择搜索结果后，显示可配置的识别选项（如是否替换图片）
 * @param {HTMLElement} page - 页面 DOM 元素
 * @param {Object} identifyResult - 识别结果对象
 */
function showIdentifyOptions(page, identifyResult) {
    const identifyOptionsForm = page.querySelector('.identifyOptionsForm');

    // 切换显示状态：隐藏搜索表单和结果，显示选项表单
    page.querySelector('.popupIdentifyForm').classList.add('hide');
    page.querySelector('.identificationSearchResults').classList.add('hide');
    identifyOptionsForm.classList.remove('hide');
    // 默认勾选“替换所有图片”选项
    page.querySelector('#chkIdentifyReplaceImages').checked = true;
    page.querySelector('.dialogContentInner').classList.add('dialog-content-centered');

    currentSearchResult = identifyResult;

    // 构建选中结果的显示信息
    const lines = [];
    lines.push(escapeHtml(identifyResult.Name));

    // 如果有制作年份，添加到显示信息中
    if (identifyResult.ProductionYear) {
        lines.push(datetime.toLocaleString(identifyResult.ProductionYear, { useGrouping: false }));
    }

    let resultHtml = lines.join('<br/>');

    // 如果有图片 URL，将图片和信息并排显示
    if (identifyResult.ImageUrl) {
        resultHtml = `<div style="display:flex;align-items:center;"><img src="${identifyResult.ImageUrl}" style="max-height:240px;" /><div style="margin-left:1em;">${resultHtml}</div>`;
    }

    page.querySelector('.selectedSearchResult').innerHTML = resultHtml;

    // 将焦点设置到提交按钮
    focusManager.focus(identifyOptionsForm.querySelector('.btnSubmit'));
}

/**
 * 生成搜索结果卡片的 HTML
 * @param {Object} result - 搜索结果对象
 * @param {number} index - 结果索引
 * @returns {string} HTML 字符串
 */
function getSearchResultHtml(result, index) {
    // TODO 将卡片创建代码移动到 Card 组件

    let html = '';
    let cssClass = 'card scalableCard';
    let cardBoxCssClass = 'cardBox';
    let padderClass;

    // 根据媒体类型设置不同的卡片样式
    if (currentItemType === 'Episode') {
        // 剧集：使用背景卡片样式
        cssClass += ' backdropCard backdropCard-scalable';
        padderClass = 'cardPadder-backdrop';
    } else if (currentItemType === 'MusicAlbum' || currentItemType === 'MusicArtist') {
        // 音乐专辑/艺术家：使用方形卡片样式
        cssClass += ' squareCard squareCard-scalable';
        padderClass = 'cardPadder-square';
    } else {
        // 其他（电影、电视剧等）：使用纵向卡片样式
        cssClass += ' portraitCard portraitCard-scalable';
        padderClass = 'cardPadder-portrait';
    }

    // 在电视模式下添加焦点和动画样式
    if (layoutManager.tv) {
        cssClass += ' show-focus';

        if (enableFocusTransform) {
            cssClass += ' show-animation';
        }
    }

    cardBoxCssClass += ' cardBox-bottompadded';

    // 构建卡片按钮和容器结构
    html += `<button type="button" class="${cssClass}" data-index="${index}">`;
    html += `<div class="${cardBoxCssClass}">`;
    html += '<div class="cardScalable">';
    html += `<div class="${padderClass}"></div>`;

    html += '<div class="cardContent searchImage">';

    // 如果有图片 URL，显示图片；否则显示默认背景和名称
    if (result.ImageUrl) {
        html += `<div class="cardImageContainer coveredImage" style="background-image:url('${result.ImageUrl}');"></div>`;
    } else {
        html += `<div class="cardImageContainer coveredImage defaultCardBackground defaultCardBackground1"><div class="cardText cardCenteredText">${escapeHtml(result.Name)}</div></div>`;
    }
    html += '</div>';
    html += '</div>';

    // 设置卡片文本行数（音乐专辑多一行）
    let numLines = 3;
    if (currentItemType === 'MusicAlbum') {
        numLines++;
    }

    // 构建卡片文本信息行
    const lines = [result.Name];

    // 添加搜索提供商名称
    lines.push(result.SearchProviderName);

    // 如果是音乐专辑，添加艺术家名称
    if (result.AlbumArtist) {
        lines.push(result.AlbumArtist.Name);
    }
    // 添加制作年份
    if (result.ProductionYear) {
        lines.push(result.ProductionYear);
    }

    // 渲染文本行（第一行为主要文本，其余为次要文本）
    for (let i = 0; i < numLines; i++) {
        if (i === 0) {
            html += '<div class="cardText cardText-first cardTextCentered">';
        } else {
            html += '<div class="cardText cardText-secondary cardTextCentered">';
        }
        html += escapeHtml(lines[i] || '') || '&nbsp;';
        html += '</div>';
    }

    html += '</div>';
    html += '</button>';
    return html;
}

/**
 * 提交识别结果
 * 将用户选择的识别结果应用到媒体项
 * @param {HTMLElement} page - 页面 DOM 元素
 */
function submitIdentficationResult(page) {
    loading.show();

    // 收集用户选择的选项
    const options = {
        ReplaceAllImages: page.querySelector('#chkIdentifyReplaceImages').checked
    };

    const apiClient = getApiClient();

    // 发送应用识别结果的请求
    apiClient.ajax({
        type: 'POST',
        url: apiClient.getUrl(`Items/RemoteSearch/Apply/${currentItem.Id}`, options),
        data: JSON.stringify(currentSearchResult),
        contentType: 'application/json'

    }).then(() => {
        // 成功：标记有变更并关闭对话框
        hasChanges = true;
        loading.hide();

        dialogHelper.close(page);
    }, () => {
        // 失败：也关闭对话框
        loading.hide();

        dialogHelper.close(page);
    });
}

/**
 * 显示识别表单
 * 加载并显示外部 ID 输入字段（如 TMDB ID、IMDB ID 等）
 * @param {HTMLElement} page - 页面 DOM 元素
 * @param {Object} item - 媒体项对象
 */
function showIdentificationForm(page, item) {
    const apiClient = getApiClient();

    // 获取该媒体项支持的外部 ID 列表
    apiClient.getJSON(apiClient.getUrl(`Items/${item.Id}/ExternalIdInfos`)).then(idList => {
        let html = '';

        // 为每个外部 ID 创建输入字段
        for (let i = 0, length = idList.length; i < length; i++) {
            const idInfo = idList[i];

            const id = `txtLookup${idInfo.Key}`;

            html += '<div class="inputContainer">';

            // 构建完整的 ID 名称（包含类型）
            let fullName = idInfo.Name;
            if (idInfo.Type) {
                fullName = `${idInfo.Name} ${globalize.translate(idInfo.Type)}`;
            }

            const idLabel = globalize.translate('LabelDynamicExternalId', escapeHtml(fullName));

            html += `<input is="emby-input" class="txtLookupId" data-providerkey="${idInfo.Key}" id="${id}" label="${idLabel}"/>`;

            html += '</div>';
        }

        // 清空名称输入框
        page.querySelector('#txtLookupName').value = '';

        // 人物和合集类型不需要显示年份字段
        if (item.Type === 'Person' || item.Type === 'BoxSet') {
            page.querySelector('.fldLookupYear').classList.add('hide');
            page.querySelector('#txtLookupYear').value = '';
        } else {
            page.querySelector('.fldLookupYear').classList.remove('hide');
            page.querySelector('#txtLookupYear').value = '';
        }

        // 插入外部 ID 输入字段
        page.querySelector('.identifyProviderIds').innerHTML = html;

        // 设置对话框标题
        page.querySelector('.formDialogHeaderTitle').innerHTML = globalize.translate('Identify');
    });
}

/**
 * 显示编辑器对话框
 * 用于编辑现有媒体项的识别信息
 * @param {string} itemId - 媒体项 ID
 */
function showEditor(itemId) {
    loading.show();

    const apiClient = getApiClient();

    // 获取媒体项信息
    apiClient.getItem(apiClient.getCurrentUserId(), itemId).then(item => {
        currentItem = item;
        currentItemType = currentItem.Type;

        // 配置对话框选项
        const dialogOptions = {
            size: 'small',
            removeOnClose: true,
            scrollY: false
        };

        // 在电视模式下使用全屏对话框
        if (layoutManager.tv) {
            dialogOptions.size = 'fullscreen';
        }

        // 创建对话框
        const dlg = dialogHelper.createDialog(dialogOptions);

        dlg.classList.add('formDialog');
        dlg.classList.add('recordingDialog');

        // 加载并翻译模板
        let html = '';
        html += globalize.translateHtml(template, 'core');

        dlg.innerHTML = html;

        // 注意：z-index 必须在 .open() 调用后设置
        dlg.addEventListener('close', onDialogClosed);

        // 在电视模式下启用居中焦点滚动
        if (layoutManager.tv) {
            scrollHelper.centerFocus.on(dlg.querySelector('.formDialogContent'), false);
        }

        // 根据媒体项是否有路径决定是否显示路径字段
        if (item.Path) {
            dlg.querySelector('.fldPath').classList.remove('hide');
        } else {
            dlg.querySelector('.fldPath').classList.add('hide');
        }

        dlg.querySelector('.txtPath').innerText = item.Path || '';

        dialogHelper.open(dlg);

        // 绑定搜索表单提交事件
        dlg.querySelector('.popupIdentifyForm').addEventListener('submit', e => {
            e.preventDefault();
            searchForIdentificationResults(dlg);
            return false;
        });

        // 绑定识别选项表单提交事件
        dlg.querySelector('.identifyOptionsForm').addEventListener('submit', e => {
            e.preventDefault();
            submitIdentficationResult(dlg);
            return false;
        });

        // 绑定取消按钮事件
        dlg.querySelector('.btnCancel').addEventListener('click', () => {
            dialogHelper.close(dlg);
        });

        dlg.classList.add('identifyDialog');

        // 显示识别表单
        showIdentificationForm(dlg, item);
        loading.hide();
    });
}

/**
 * 对话框关闭事件处理
 * 根据是否有变更来决定 resolve 或 reject Promise
 */
function onDialogClosed() {
    loading.hide();
    if (hasChanges) {
        currentResolve();
    } else {
        currentReject();
    }
}

/**
 * 显示查找新项目的编辑器
 * 用于为媒体库添加新的媒体项
 * @param {string} itemName - 项目名称
 * @param {number} itemYear - 制作年份
 * @param {string} itemType - 项目类型
 * @param {Function} resolveFunc - 完成时调用的回调函数
 */
// TODO 调查此函数的使用位置
function showEditorFindNew(itemName, itemYear, itemType, resolveFunc) {
    currentItem = null;
    currentItemType = itemType;

    // 配置对话框选项
    const dialogOptions = {
        size: 'small',
        removeOnClose: true,
        scrollY: false
    };

    // 在电视模式下使用全屏对话框
    if (layoutManager.tv) {
        dialogOptions.size = 'fullscreen';
    }

    // 创建对话框
    const dlg = dialogHelper.createDialog(dialogOptions);

    dlg.classList.add('formDialog');
    dlg.classList.add('recordingDialog');

    // 加载并翻译模板
    let html = '';
    html += globalize.translateHtml(template, 'core');

    dlg.innerHTML = html;

    // 在电视模式下启用居中焦点滚动
    if (layoutManager.tv) {
        scrollHelper.centerFocus.on(dlg.querySelector('.formDialogContent'), false);
    }

    dialogHelper.open(dlg);

    // 绑定取消按钮事件
    dlg.querySelector('.btnCancel').addEventListener('click', () => {
        dialogHelper.close(dlg);
    });

    // 绑定搜索表单提交事件
    dlg.querySelector('.popupIdentifyForm').addEventListener('submit', e => {
        e.preventDefault();
        searchForIdentificationResults(dlg);
        return false;
    });

    // 绑定对话框关闭事件
    dlg.addEventListener('close', () => {
        loading.hide();
        // 如果有变更，返回搜索结果；否则返回 null
        const foundItem = hasChanges ? currentSearchResult : null;

        resolveFunc(foundItem);
    });

    dlg.classList.add('identifyDialog');

    // 显示查找新项目的识别表单
    showIdentificationFormFindNew(dlg, itemName, itemYear, itemType);
}

/**
 * 显示查找新项目的识别表单
 * 预填充项目名称和年份
 * @param {HTMLElement} dlg - 对话框元素
 * @param {string} itemName - 项目名称
 * @param {number} itemYear - 制作年份
 * @param {string} itemType - 项目类型
 */
function showIdentificationFormFindNew(dlg, itemName, itemYear, itemType) {
    // 预填充项目名称
    dlg.querySelector('#txtLookupName').value = itemName;

    // 人物和合集类型不需要显示年份字段
    if (itemType === 'Person' || itemType === 'BoxSet') {
        dlg.querySelector('.fldLookupYear').classList.add('hide');
        dlg.querySelector('#txtLookupYear').value = '';
    } else {
        dlg.querySelector('.fldLookupYear').classList.remove('hide');
        dlg.querySelector('#txtLookupYear').value = itemYear;
    }

    // 设置对话框标题为“搜索”
    dlg.querySelector('.formDialogHeaderTitle').innerHTML = globalize.translate('Search');
}

/**
 * 显示媒体项识别对话框（编辑现有项目）
 * @param {string} itemId - 媒体项 ID
 * @param {string} serverId - 服务器 ID
 * @returns {Promise} 当用户完成识别或取消时 resolve/reject
 */
export function show(itemId, serverId) {
    return new Promise((resolve, reject) => {
        currentResolve = resolve;
        currentReject = reject;
        currentServerId = serverId;
        hasChanges = false;

        showEditor(itemId);
    });
}

/**
 * 显示查找新媒体项对话框（添加新项目）
 * @param {string} itemName - 项目名称
 * @param {number} itemYear - 制作年份
 * @param {string} itemType - 项目类型
 * @param {string} serverId - 服务器 ID
 * @returns {Promise} 返回找到的媒体项信息或 null
 */
export function showFindNew(itemName, itemYear, itemType, serverId) {
    return new Promise((resolve) => {
        currentServerId = serverId;

        hasChanges = false;
        showEditorFindNew(itemName, itemYear, itemType, resolve);
    });
}

// 默认导出对象，包含 show 和 showFindNew 方法
export default {
    show: show,
    showFindNew: showFindNew
};
