import { AppFeature } from 'constants/appFeature';
import dialogHelper from '../dialogHelper/dialogHelper';
import loading from '../loading/loading';
import dom from '../../scripts/dom';
import layoutManager from '../layoutManager';
import focusManager from '../focusManager';
import globalize from '../../lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import scrollHelper from '../../scripts/scrollHelper';
import imageLoader from '../images/imageLoader';
import browser from '../../scripts/browser';
import { appHost } from '../apphost';
import '../cardbuilder/card.scss';
import '../formdialog.scss';
import '../../elements/emby-button/emby-button';
import '../../elements/emby-button/paper-icon-button-light';
import './imageeditor.scss';
import alert from '../alert';
import confirm from '../confirm/confirm';
import template from './imageeditor.template.html';

/**
 * 图片编辑器对话框逻辑（封面/背景图等）：
 * - 拉取条目图片信息与远程图片提供方
 * - 渲染图片卡片（Primary/Backdrop/...）
 * - 支持上传/搜索/删除/移动（Backdrop 可调整顺序）
 *
 * 备注：这是基于 DOM 的旧实现，主要通过事件委托绑定交互。
 */

// TV 模式下会显示焦点样式；性能较弱或 Edge 下禁用 transform 动画以避免卡顿/兼容性问题
const enableFocusTransform = !browser.slow && !browser.edge;

// 当前正在编辑的条目（在 showEditor/reloadItem 中赋值）
let currentItem;
// 本次对话框生命周期内是否发生过变更（用于 close 时 resolve/reject）
let hasChanges = false;

function getBaseRemoteOptions() {
    // 获取远程图片提供方（Remote Image Providers）时需要当前条目 Id
    // 注意：currentItem 在 showEditor/reloadItem 后才会被赋值
    return { itemId: currentItem.Id };
}

function reload(page, item, focusContext) {
    // 重新加载入口：
    // - 如果传入 item：直接用它对应的 ServerId 拉取图片信息
    // - 如果不传 item：先请求一次 getItem 拿到最新条目（避免图片 tag 过期）
    // - focusContext：TV 模式下用于把焦点放回到合理位置
    loading.show();

    let apiClient;

    if (item) {
        apiClient = ServerConnections.getApiClient(item.ServerId);
        reloadItem(page, item, apiClient, focusContext);
    } else {
        apiClient = ServerConnections.getApiClient(currentItem.ServerId);
        apiClient.getItem(apiClient.getCurrentUserId(), currentItem.Id).then(function (itemToReload) {
            reloadItem(page, itemToReload, apiClient, focusContext);
        });
    }
}

function addListeners(container, className, eventName, fn) {
    // 事件委托：
    // - 通过 parentWithClass 向上找到目标元素
    // - 避免给每个动态生成的卡片/按钮逐个绑定监听器
    // - 保证 render 后的新 DOM 也能响应事件
    container.addEventListener(eventName, function (e) {
        const elem = dom.parentWithClass(e.target, className);
        if (elem) {
            fn.call(elem, e);
        }
    });
}

function reloadItem(page, item, apiClient, focusContext) {
    // 用最新条目覆盖 currentItem，并拉取：
    // 1) 远程图片提供方（用于“搜索图片”能力开关）
    // 2) 该条目的图片信息列表（用于渲染卡片）
    currentItem = item;

    apiClient.getRemoteImageProviders(getBaseRemoteOptions()).then(function (providers) {
        const btnBrowseAllImages = page.querySelectorAll('.btnBrowseAllImages');
        for (let i = 0, length = btnBrowseAllImages.length; i < length; i++) {
            if (providers.length) {
                btnBrowseAllImages[i].classList.remove('hide');
            } else {
                btnBrowseAllImages[i].classList.add('hide');
            }
        }

        apiClient.getItemImageInfos(currentItem.Id).then(function (imageInfos) {
            renderStandardImages(page, apiClient, item, imageInfos, providers);
            renderBackdrops(page, apiClient, item, imageInfos, providers);
            loading.hide();

            if (layoutManager.tv) {
                focusManager.autoFocus((focusContext || page));
            }
        });
    });
}

function getImageUrl(item, apiClient, type, index, options) {
    options = options || {};
    options.type = type;
    options.index = index;

    if (type === 'Backdrop') {
        options.tag = item.BackdropImageTags[index];
    } else if (type === 'Primary') {
        options.tag = item.PrimaryImageTag || item.ImageTags[type];
    } else {
        options.tag = item.ImageTags[type];
    }

    // 通过 tag 提示后端/缓存层（同时用于浏览器缓存命中）：
    // - Backdrop：使用 BackdropImageTags[index]
    // - Primary：优先 PrimaryImageTag，否则 fallback 到 ImageTags
    // - 其他：使用 ImageTags[type]
    return apiClient.getScaledImageUrl(item.Id || item.ItemId, options);
}

function getCardHtml(image, apiClient, options) {
    // TODO move card creation code to Card component
    // TODO（中文）：后续可把字符串拼接的卡片渲染迁移到统一的 Card 组件

    let html = '';

    let cssClass = 'card scalableCard imageEditorCard';
    const cardBoxCssClass = 'cardBox visualCardBox';

    cssClass += ' backdropCard backdropCard-scalable';

    if (options.tagName === 'button') {
        cssClass += ' btnImageCard';

        if (layoutManager.tv) {
            cssClass += ' show-focus';

            if (enableFocusTransform) {
                cssClass += ' show-animation';
            }
        }

        html += '<button type="button" class="' + cssClass + '"';
    } else {
        html += '<div class="' + cssClass + '"';
    }

    // 通过 data-* 携带必要上下文，供点击/删除/移动/搜索时读取：
    // - data-index：当前卡片序号（用于左右移动按钮的可用性判断）
    // - data-imagetype / data-index：用于 delete/move 请求
    // - data-providers：用于决定是否显示“搜索”入口
    html += ' data-id="' + currentItem.Id + '" data-serverid="' + apiClient.serverId() + '" data-index="' + options.index + '" data-numimages="' + options.numImages + '" data-imagetype="' + image.ImageType + '" data-providers="' + options.imageProviders.length + '"';

    html += '>';

    html += '<div class="' + cardBoxCssClass + '">';
    html += '<div class="cardScalable visualCardBox-cardScalable" style="background-color:transparent;">';
    html += '<div class="cardPadder-backdrop"></div>';

    html += '<div class="cardContent">';

    const imageUrl = getImageUrl(currentItem, apiClient, image.ImageType, image.ImageIndex, { maxWidth: options.imageSize });

    html += '<div class="cardImageContainer" style="background-image:url(\'' + imageUrl + '\');background-position:center center;background-size:contain;"></div>';

    html += '</div>';
    html += '</div>';

    html += '<div class="cardFooter visualCardBox-cardFooter">';

    html += '<h3 class="cardText cardTextCentered" style="margin:0;">' + globalize.translate('' + image.ImageType) + '</h3>';

    html += '<div class="cardText cardText-secondary cardTextCentered">';
    if (image.Width && image.Height) {
        html += image.Width + ' X ' + image.Height;
    } else {
        html += '&nbsp;';
    }
    html += '</div>';

    if (options.enableFooterButtons) {
        html += '<div class="cardText cardTextCentered">';

        if (image.ImageType === 'Backdrop') {
            if (options.index > 0) {
                html += '<button type="button" is="paper-icon-button-light" class="btnMoveImage autoSize" data-imagetype="' + image.ImageType + '" data-index="' + image.ImageIndex + '" data-newindex="' + (image.ImageIndex - 1) + '" title="' + globalize.translate('MoveLeft') + '"><span class="material-icons chevron_left"></span></button>';
            } else {
                html += '<button type="button" is="paper-icon-button-light" class="autoSize" disabled title="' + globalize.translate('MoveLeft') + '"><span class="material-icons chevron_left" aria-hidden="true"></span></button>';
            }

            if (options.index < options.numImages - 1) {
                html += '<button type="button" is="paper-icon-button-light" class="btnMoveImage autoSize" data-imagetype="' + image.ImageType + '" data-index="' + image.ImageIndex + '" data-newindex="' + (image.ImageIndex + 1) + '" title="' + globalize.translate('MoveRight') + '"><span class="material-icons chevron_right" aria-hidden="true"></span></button>';
            } else {
                html += '<button type="button" is="paper-icon-button-light" class="autoSize" disabled title="' + globalize.translate('MoveRight') + '"><span class="material-icons chevron_right" aria-hidden="true"></span></button>';
            }
        } else if (options.imageProviders.length) {
            // 非 Backdrop：如果存在远程图片提供方，则允许搜索替换图片
            html += '<button type="button" is="paper-icon-button-light" data-imagetype="' + image.ImageType + '" class="btnSearchImages autoSize" title="' + globalize.translate('Search') + '"><span class="material-icons search" aria-hidden="true"></span></button>';
        }

        html += '<button type="button" is="paper-icon-button-light" data-imagetype="' + image.ImageType + '" data-index="' + (image.ImageIndex != null ? image.ImageIndex : 'null') + '" class="btnDeleteImage autoSize" title="' + globalize.translate('Delete') + '"><span class="material-icons delete" aria-hidden="true"></span></button>';
        html += '</div>';
    }

    html += '</div>';
    html += '</div>';
    html += '</' + options.tagName + '>';

    return html;
}

function deleteImage(context, itemId, type, index, apiClient, enableConfirmation) {
    // 删除图片：
    // - enableConfirmation=true 时弹出确认对话框
    // - 成功后标记 hasChanges，并触发 reload 重新拉取/渲染
    const afterConfirm = function () {
        apiClient.deleteItemImage(itemId, type, index).then(function () {
            hasChanges = true;
            reload(context);
        });
    };

    if (!enableConfirmation) {
        afterConfirm();
        return;
    }

    confirm({
        text: globalize.translate('ConfirmDeleteImage'),
        confirmText: globalize.translate('Delete'),
        primary: 'delete'
    }).then(afterConfirm);
}

function moveImage(context, apiClient, itemId, type, index, newIndex, focusContext) {
    // 调整图片顺序：当前仅 Backdrop 会调用（通过 updateItemImageIndex）
    // focusContext：用于 reload 后在 TV 模式恢复焦点
    apiClient.updateItemImageIndex(itemId, type, index, newIndex).then(function () {
        hasChanges = true;
        reload(context, null, focusContext);
    }, function () {
        alert(globalize.translate('ErrorDefault'));
    });
}

function renderImages(page, item, apiClient, images, imageProviders, elem) {
    // 渲染图片卡片列表：
    // - 根据窗口宽度动态决定卡片图像尺寸（尽量填充一行）
    // - TV 模式使用 button 以获得可聚焦/可操作的卡片
    // - 渲染后对卡片内图片做懒加载
    let html = '';

    let imageSize = 300;
    const windowSize = dom.getWindowSize();
    if (windowSize.innerWidth >= 1280) {
        imageSize = Math.round(windowSize.innerWidth / 4);
    }

    // TV 模式：卡片本身可点击（ActionSheet），不显示底部按钮
    const tagName = layoutManager.tv ? 'button' : 'div';
    const enableFooterButtons = !layoutManager.tv;

    for (let i = 0, length = images.length; i < length; i++) {
        const image = images[i];
        const options = { index: i, numImages: length, imageProviders, imageSize, tagName, enableFooterButtons };
        html += getCardHtml(image, apiClient, options);
    }

    elem.innerHTML = html;
    imageLoader.lazyChildren(elem);
}

function renderStandardImages(page, apiClient, item, imageInfos, imageProviders) {
    // 标准图片：
    // - 排除 Backdrop（单独分组显示并支持排序）
    // - 排除 Chapter（章节图片不在此处编辑）
    const images = imageInfos.filter(function (i) {
        return i.ImageType !== 'Backdrop' && i.ImageType !== 'Chapter';
    });

    renderImages(page, item, apiClient, images, imageProviders, page.querySelector('#images'));
}

function renderBackdrops(page, apiClient, item, imageInfos, imageProviders) {
    // 背景图：按 ImageIndex 排序，并在无数据时隐藏容器
    const images = imageInfos.filter(function (i) {
        return i.ImageType === 'Backdrop';
    }).sort(function (a, b) {
        return a.ImageIndex - b.ImageIndex;
    });

    if (images.length) {
        page.querySelector('#backdropsContainer', page).classList.remove('hide');
        renderImages(page, item, apiClient, images, imageProviders, page.querySelector('#backdrops'));
    } else {
        page.querySelector('#backdropsContainer', page).classList.add('hide');
    }
}

function showImageDownloader(page, imageType) {
    // 动态加载图片搜索/下载器（按需加载），避免初始包体增大
    // 下载/选择完成后会返回 Promise；成功则标记 hasChanges 并 reload
    import('../imageDownloader/imageDownloader').then((ImageDownloader) => {
        ImageDownloader.show(
            currentItem.Id,
            currentItem.ServerId,
            currentItem.Type,
            imageType,
            currentItem.Type == 'Season' ? currentItem.ParentId : null
        ).then(function () {
            hasChanges = true;
            reload(page);
        }).catch(function () {
            // image downloader closed
        });
    });
}

function showActionSheet(context, imageCard) {
    // TV 模式下点击卡片：弹出 action sheet（删除/搜索/左右移动等）
    // 注意：这里从卡片 data-* 读取 serverId/type/index，避免依赖全局状态以外的 DOM 上下文
    const itemId = imageCard.getAttribute('data-id');
    const serverId = imageCard.getAttribute('data-serverid');
    const apiClient = ServerConnections.getApiClient(serverId);

    const type = imageCard.getAttribute('data-imagetype');
    const index = parseInt(imageCard.getAttribute('data-index'), 10);
    const providerCount = parseInt(imageCard.getAttribute('data-providers'), 10);
    const numImages = parseInt(imageCard.getAttribute('data-numimages'), 10);

    import('../actionSheet/actionSheet').then(({ default: actionSheet }) => {
        const commands = [];

        commands.push({
            name: globalize.translate('Delete'),
            id: 'delete'
        });

        if (type === 'Backdrop') {
            if (index > 0) {
                commands.push({
                    name: globalize.translate('MoveLeft'),
                    id: 'moveleft'
                });
            }

            if (index < numImages - 1) {
                commands.push({
                    name: globalize.translate('MoveRight'),
                    id: 'moveright'
                });
            }
        }

        if (providerCount) {
            commands.push({
                name: globalize.translate('Search'),
                id: 'search'
            });
        }

        actionSheet.show({

            items: commands,
            positionTo: imageCard

        }).then(function (id) {
            switch (id) {
                case 'delete':
                    deleteImage(context, itemId, type, index, apiClient, false);
                    break;
                case 'search':
                    showImageDownloader(context, type);
                    break;
                case 'moveleft':
                    moveImage(context, apiClient, itemId, type, index, index - 1, dom.parentWithClass(imageCard, 'itemsContainer'));
                    break;
                case 'moveright':
                    moveImage(context, apiClient, itemId, type, index, index + 1, dom.parentWithClass(imageCard, 'itemsContainer'));
                    break;
                default:
                    break;
            }
        });
    });
}

function initEditor(context, options) {
    // 初始化对话框内交互：
    // - 根据宿主能力决定是否显示“上传”入口（FileInput）
    // - 统一用事件委托绑定上传/搜索/删除/移动等交互
    const uploadButtons = context.querySelectorAll('.btnOpenUploadMenu');
    const isFileInputSupported = appHost.supports(AppFeature.FileInput);
    for (let i = 0, length = uploadButtons.length; i < length; i++) {
        if (isFileInputSupported) {
            uploadButtons[i].classList.remove('hide');
        } else {
            uploadButtons[i].classList.add('hide');
        }
    }

    addListeners(context, 'btnOpenUploadMenu', 'click', function () {
        const imageType = this.getAttribute('data-imagetype');

        import('../imageUploader/imageUploader').then(({ default: imageUploader }) => {
            imageUploader.show({

                theme: options.theme,
                imageType: imageType,
                itemId: currentItem.Id,
                serverId: currentItem.ServerId

            }).then(function (hasChanged) {
                if (hasChanged) {
                    hasChanges = true;
                    reload(context);
                }
            });
        });
    });

    addListeners(context, 'btnSearchImages', 'click', function () {
        showImageDownloader(context, this.getAttribute('data-imagetype'));
    });

    addListeners(context, 'btnBrowseAllImages', 'click', function () {
        showImageDownloader(context, this.getAttribute('data-imagetype') || 'Primary');
    });

    addListeners(context, 'btnImageCard', 'click', function () {
        showActionSheet(context, this);
    });

    addListeners(context, 'btnDeleteImage', 'click', function () {
        const type = this.getAttribute('data-imagetype');
        let index = this.getAttribute('data-index');
        index = index === 'null' ? null : parseInt(index, 10);
        const apiClient = ServerConnections.getApiClient(currentItem.ServerId);
        deleteImage(context, currentItem.Id, type, index, apiClient, true);
    });

    addListeners(context, 'btnMoveImage', 'click', function () {
        const type = this.getAttribute('data-imagetype');
        const index = this.getAttribute('data-index');
        const newIndex = this.getAttribute('data-newindex');
        const apiClient = ServerConnections.getApiClient(currentItem.ServerId);
        moveImage(context, apiClient, currentItem.Id, type, index, newIndex, dom.parentWithClass(this, 'itemsContainer'));
    });
}

function showEditor(options, resolve, reject) {
    // 创建并打开对话框：
    // - 先拉取条目（确保 currentItem 与图片 tag 等信息最新）
    // - 渲染模板并绑定事件
    // - 对话框 close 时根据 hasChanges 决定 resolve/reject
    const itemId = options.itemId;
    const serverId = options.serverId;

    loading.show();

    const apiClient = ServerConnections.getApiClient(serverId);
    apiClient.getItem(apiClient.getCurrentUserId(), itemId).then(function (item) {
        const dialogOptions = {
            removeOnClose: true
        };

        if (layoutManager.tv) {
            dialogOptions.size = 'fullscreen';
        } else {
            dialogOptions.size = 'small';
        }

        const dlg = dialogHelper.createDialog(dialogOptions);

        dlg.classList.add('formDialog');

        dlg.innerHTML = globalize.translateHtml(template, 'core');

        if (layoutManager.tv) {
            scrollHelper.centerFocus.on(dlg, false);
        }

        initEditor(dlg, options);

        // Has to be assigned a z-index after the call to .open()
        dlg.addEventListener('close', function () {
            if (layoutManager.tv) {
                scrollHelper.centerFocus.off(dlg, false);
            }

            loading.hide();

            if (hasChanges) {
                // 对外表示“有变更”，调用方通常会据此刷新列表/详情
                resolve();
            } else {
                // 对外表示“无变更”（也可能是用户直接取消/关闭）
                reject();
            }
        });

        dialogHelper.open(dlg);

        reload(dlg, item);

        dlg.querySelector('.btnCancel').addEventListener('click', function () {
            dialogHelper.close(dlg);
        });
    });
}

export function show (options) {
    // 对外入口：
    // - 返回 Promise
    // - 若发生变更则 resolve，否则 reject（用于调用方决定是否刷新）
    // - hasChanges 是对话框生命周期内的状态标记
    return new Promise(function (resolve, reject) {
        hasChanges = false;
        showEditor(options, resolve, reject);
    });
}

export default {
    show
};

