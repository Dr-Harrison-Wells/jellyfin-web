import { AppFeature } from 'constants/appFeature';
import dom from '../../scripts/dom';
import loading from '../loading/loading';
import { appHost } from '../apphost';
import dialogHelper from '../dialogHelper/dialogHelper';
import imageLoader from '../images/imageLoader';
import browser from '../../scripts/browser';
import layoutManager from '../layoutManager';
import scrollHelper from '../../scripts/scrollHelper';
import globalize from '../../lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import '../../elements/emby-checkbox/emby-checkbox';
import '../../elements/emby-button/paper-icon-button-light';
import '../../elements/emby-button/emby-button';
import '../formdialog.scss';
import '../cardbuilder/card.scss';
import template from './imageDownloader.template.html';

// 电视端遥控焦点高亮时，是否启用缩放/动画效果。
// 低性能浏览器或 Edge 下禁用，避免卡顿或渲染问题。
const enableFocusTransform = !browser.slow && !browser.edge;

// 当前正在编辑/下载封面的条目上下文（由 show(...) 初始化）。
let currentItemId;
let currentItemType;
let currentResolve;
let currentReject;
let hasChanges = false;

// 远程图片可能很大：Safari 上曾出现内存问题，因此按设备性能控制分页大小。
const browsableImagePageSize = browser.slow ? 6 : 30;

// 远程图片浏览器的分页/筛选状态（会在同一个对话框生命周期内变化）。
let browsableImageStartIndex = 0;
let browsableImageType = 'Primary';
let selectedProvider;
let browsableParentId;

function getBaseRemoteOptions(page, forceCurrentItemId = false) {
    const options = {};

    // “显示父级图片”勾选且存在 parentId 时，用父级作为查询对象；否则用当前条目。
    if (!forceCurrentItemId && page.querySelector('#chkShowParentImages').checked && browsableParentId) {
        options.itemId = browsableParentId;
    } else {
        options.itemId = currentItemId;
    }

    return options;
}

function reloadBrowsableImages(page, apiClient) {
    loading.show();

    const options = getBaseRemoteOptions(page);

    // 后端接口参数：图片类型/分页/语言过滤/可选的提供方。
    options.type = browsableImageType;
    options.startIndex = browsableImageStartIndex;
    options.limit = browsableImagePageSize;
    options.IncludeAllLanguages = page.querySelector('#chkAllLanguages').checked;

    const provider = selectedProvider || '';

    if (provider) {
        options.ProviderName = provider;
    }

    // 拉取可用的远程图片列表（含 Providers、总数等信息）。
    apiClient.getAvailableRemoteImages(options).then(function (result) {
        renderRemoteImages(page, apiClient, result, browsableImageType, options.startIndex, options.limit);

        page.querySelector('#selectBrowsableImageType').value = browsableImageType;

        const providersHtml = result.Providers.map(function (p) {
            return '<option value="' + p + '">' + p + '</option>';
        });

        const selectImageProvider = page.querySelector('#selectImageProvider');
        selectImageProvider.innerHTML = '<option value="">' + globalize.translate('All') + '</option>' + providersHtml;
        selectImageProvider.value = provider;

        loading.hide();
    });
}

function renderRemoteImages(page, apiClient, imagesResult, imageType, startIndex, limit) {
    // 顶部分页条（上一页/下一页 + “第 X- Y / 总数”文本）。
    page.querySelector('.availableImagesPaging').innerHTML = getPagingHtml(startIndex, limit, imagesResult.TotalRecordCount);

    let html = '';

    for (let i = 0, length = imagesResult.Images.length; i < length; i++) {
        html += getRemoteImageHtml(imagesResult.Images[i], imageType);
    }

    const availableImagesList = page.querySelector('.availableImagesList');
    availableImagesList.innerHTML = html;
    // 懒加载卡片背景图，避免一次性解码过多图片导致卡顿/内存飙升。
    imageLoader.lazyChildren(availableImagesList);

    const btnNextPage = page.querySelector('.btnNextPage');
    const btnPreviousPage = page.querySelector('.btnPreviousPage');

    if (btnNextPage) {
        btnNextPage.addEventListener('click', function () {
            // 下一页：startIndex 往后推进 pageSize。
            browsableImageStartIndex += browsableImagePageSize;
            reloadBrowsableImages(page, apiClient);
        });
    }

    if (btnPreviousPage) {
        btnPreviousPage.addEventListener('click', function () {
            // 上一页：startIndex 往前回退 pageSize。
            browsableImageStartIndex -= browsableImagePageSize;
            reloadBrowsableImages(page, apiClient);
        });
    }
}

function getPagingHtml(startIndex, limit, totalRecordCount) {
    let html = '';

    const recordsEnd = Math.min(startIndex + limit, totalRecordCount);

    // 仅当总数超过当前 limit 时显示上一页/下一页按钮。
    const showControls = totalRecordCount > limit;

    html += '<div class="listPaging">';

    html += '<span style="margin-right: 10px;">';

    const startAtDisplay = totalRecordCount ? startIndex + 1 : 0;
    html += globalize.translate('ListPaging', startAtDisplay, recordsEnd, totalRecordCount);

    html += '</span>';

    if (showControls) {
        html += '<div data-role="controlgroup" data-type="horizontal" style="display:inline-block;">';

        html += `<button is="paper-icon-button-light" title="${globalize.translate('Previous')}" class="btnPreviousPage autoSize" ${(startIndex ? '' : 'disabled')}><span class="material-icons arrow_back" aria-hidden="true"></span></button>`;
        html += `<button is="paper-icon-button-light" title="${globalize.translate('Next')}" class="btnNextPage autoSize" ${(startIndex + limit >= totalRecordCount ? 'disabled' : '')}><span class="material-icons arrow_forward" aria-hidden="true"></span></button>`;
        html += '</div>';
    }

    html += '</div>';

    return html;
}

function downloadRemoteImage(page, apiClient, url, type, provider) {
    // 下载图片时必须针对“当前条目”执行，因此强制使用 currentItemId（不受“显示父级图片”影响）。
    const options = getBaseRemoteOptions(page, true);

    options.Type = type;
    options.ImageUrl = url;
    options.ProviderName = provider;

    loading.show();

    // 下载成功即关闭对话框，并在关闭回调中 resolve Promise。
    apiClient.downloadRemoteImage(options).then(function () {
        hasChanges = true;
        const dlg = dom.parentWithClass(page, 'dialog');
        dialogHelper.close(dlg);
    });
}

function getRemoteImageHtml(image, imageType) {
    // TV 端用 button 以便获取/表现焦点；非 TV 用 div + footer 操作按钮。
    const tagName = layoutManager.tv ? 'button' : 'div';
    const enableFooterButtons = !layoutManager.tv;

    // TODO: 将卡片拼接逻辑迁移到统一的 Card 组件。

    let html = '';

    let cssClass = 'card scalableCard imageEditorCard';
    const cardBoxCssClass = 'cardBox visualCardBox';

    let shape;
    // 根据图片类型/媒体类型推断卡片比例（影响 padder 与样式）。
    if (imageType === 'Backdrop' || imageType === 'Art' || imageType === 'Thumb' || imageType === 'Logo') {
        shape = 'backdrop';
    } else if (imageType === 'Banner') {
        shape = 'banner';
    } else if (imageType === 'Disc') {
        shape = 'square';
    } else if (currentItemType === 'Episode') {
        shape = 'backdrop';
    } else if (currentItemType === 'MusicAlbum' || currentItemType === 'MusicArtist') {
        shape = 'square';
    } else {
        shape = 'portrait';
    }

    cssClass += ' ' + shape + 'Card ' + shape + 'Card-scalable';
    if (tagName === 'button') {
        cssClass += ' btnImageCard';

        if (layoutManager.tv) {
            cssClass += ' show-focus';

            if (enableFocusTransform) {
                // 电视端焦点切换时允许缩放动画（部分浏览器/低性能设备禁用）。
                cssClass += ' show-animation';
            }
        }

        html += '<button type="button" class="' + cssClass + '"';
    } else {
        html += '<div class="' + cssClass + '"';
    }

    html += ' data-imageprovider="' + image.ProviderName + '" data-imageurl="' + image.Url + '" data-imagetype="' + image.Type + '"';

    html += '>';

    html += '<div class="' + cardBoxCssClass + '">';
    html += '<div class="cardScalable visualCardBox-cardScalable" style="background-color:transparent;">';
    html += '<div class="cardPadder-' + shape + '"></div>';
    html += '<div class="cardContent">';

    if (layoutManager.tv || !appHost.supports(AppFeature.ExternalLinks)) {
        // TV 端或不支持外链：用 div 显示（不可点击打开原图）。
        html += '<div class="cardImageContainer lazy" data-src="' + image.Url + '" style="background-position:center center;background-size:contain;"></div>';
    } else {
        // 支持外链：允许点开原始图片链接（新标签页）。
        html += '<a is="emby-linkbutton" target="_blank" href="' + image.Url + '" class="button-link cardImageContainer lazy" data-src="' + image.Url + '" style="background-position:center center;background-size:contain"></a>';
    }

    html += '</div>';
    html += '</div>';

    // begin footer
    html += '<div class="cardFooter visualCardBox-cardFooter">';

    html += '<div class="cardText cardTextCentered">' + image.ProviderName + '</div>';

    if (image.Width || image.Height || image.Language) {
        html += '<div class="cardText cardText-secondary cardTextCentered">';

        if (image.Width && image.Height) {
            html += image.Width + ' x ' + image.Height;

            if (image.Language) {
                html += ' • ' + image.Language;
            }
        } else if (image.Language) {
            html += image.Language;
        }

        html += '</div>';
    }

    if (image.CommunityRating != null) {
        html += '<div class="cardText cardText-secondary cardTextCentered">';

        if (image.RatingType === 'Likes') {
            html += image.CommunityRating + (image.CommunityRating === 1 ? ' like' : ' likes');
        } else if (image.CommunityRating) {
            html += image.CommunityRating.toFixed(1);

            if (image.VoteCount) {
                html += ' • ' + image.VoteCount + (image.VoteCount === 1 ? ' vote' : ' votes');
            }
        } else {
            html += 'Unrated';
        }

        html += '</div>';
    }

    if (enableFooterButtons) {
        // 非 TV 端：在 footer 放“下载”按钮。
        html += '<div class="cardText cardTextCentered">';

        html += `<button is="paper-icon-button-light" class="btnDownloadRemoteImage autoSize" raised" title="${globalize.translate('Download')}"><span class="material-icons cloud_download" aria-hidden="true"></span></button>`;
        html += '</div>';
    }

    html += '</div>';
    // end footer

    html += '</div>';

    html += '</' + tagName + '>';

    return html;
}

function reloadBrowsableImagesFirstPage(page, apiClient) {
    // 任何筛选条件变化都回到第一页。
    browsableImageStartIndex = 0;
    reloadBrowsableImages(page, apiClient);
}

function initEditor(page, apiClient) {
    // 绑定筛选/勾选项事件；变化后重新加载远程图片。
    page.querySelector('#selectBrowsableImageType').addEventListener('change', function () {
        browsableImageType = this.value;
        selectedProvider = null;

        reloadBrowsableImagesFirstPage(page, apiClient);
    });

    page.querySelector('#selectImageProvider').addEventListener('change', function () {
        selectedProvider = this.value;

        reloadBrowsableImagesFirstPage(page, apiClient);
    });

    page.querySelector('#chkAllLanguages').addEventListener('change', function () {
        reloadBrowsableImagesFirstPage(page, apiClient);
    });

    page.querySelector('#chkShowParentImages').addEventListener('change', function () {
        reloadBrowsableImagesFirstPage(page, apiClient);
    });

    page.addEventListener('click', function (e) {
        // 事件委托：点击下载按钮或 TV 端整张卡片都触发下载。
        const btnDownloadRemoteImage = dom.parentWithClass(e.target, 'btnDownloadRemoteImage');
        if (btnDownloadRemoteImage) {
            const card = dom.parentWithClass(btnDownloadRemoteImage, 'card');
            downloadRemoteImage(page, apiClient, card.getAttribute('data-imageurl'), card.getAttribute('data-imagetype'), card.getAttribute('data-imageprovider'));
            return;
        }

        const btnImageCard = dom.parentWithClass(e.target, 'btnImageCard');
        if (btnImageCard) {
            downloadRemoteImage(page, apiClient, btnImageCard.getAttribute('data-imageurl'), btnImageCard.getAttribute('data-imagetype'), btnImageCard.getAttribute('data-imageprovider'));
        }
    });
}

function showEditor(itemId, serverId, itemType) {
    loading.show();

    // 通过 serverId 获取对应的 ApiClient（多服务器连接场景）。
    const apiClient = ServerConnections.getApiClient(serverId);

    currentItemId = itemId;
    currentItemType = itemType;

    const dialogOptions = {
        removeOnClose: true
    };

    if (layoutManager.tv) {
        dialogOptions.size = 'fullscreen';
    } else {
        dialogOptions.size = 'small';
    }

    const dlg = dialogHelper.createDialog(dialogOptions);

    dlg.innerHTML = globalize.translateHtml(template, 'core');

    if (layoutManager.tv) {
        scrollHelper.centerFocus.on(dlg, false);
    }

    if (browsableParentId) {
        // 仅当传入 parentId 时才显示“显示父级图片”选项。
        dlg.querySelector('#lblShowParentImages').classList.remove('hide');
    }

    // close 事件需在 open 后绑定：对话框打开后才会分配 z-index。
    dlg.addEventListener('close', onDialogClosed);

    dialogHelper.open(dlg);

    const editorContent = dlg.querySelector('.formDialogContent');
    initEditor(editorContent, apiClient);

    dlg.querySelector('.btnCancel').addEventListener('click', function () {
        dialogHelper.close(dlg);
    });

    reloadBrowsableImages(editorContent, apiClient);
}

function onDialogClosed() {
    const dlg = this;

    if (layoutManager.tv) {
        scrollHelper.centerFocus.off(dlg, false);
    }

    loading.hide();
    // 通过 Promise 通知调用方：有下载成功则 resolve，否则 reject（用于刷新 UI 等）。
    if (hasChanges) {
        currentResolve();
    } else {
        currentReject();
    }
}

export function show(itemId, serverId, itemType, imageType, parentId) {
    // 打开远程图片下载对话框：初始化全局状态，并返回 Promise 给调用方。
    return new Promise(function (resolve, reject) {
        currentResolve = resolve;
        currentReject = reject;
        hasChanges = false;
        browsableImageStartIndex = 0;
        browsableImageType = imageType || 'Primary';
        selectedProvider = null;
        browsableParentId = parentId;
        showEditor(itemId, serverId, itemType);
    });
}

export default {
    show: show
};

