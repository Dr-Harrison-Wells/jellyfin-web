import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import escapeHtml from 'escape-html';

import imageLoader from 'components/images/imageLoader';
import { appRouter } from 'components/router/appRouter';
import globalize from 'lib/globalize';
import imageHelper from 'utils/image';

/**
 * 根据用户可见的媒体库（views）生成“我的媒体”区域的按钮 HTML。
 *
 * 说明：这里返回的是字符串 HTML，后续由调用方写入 DOM 并触发懒加载。
 */
function getLibraryButtonsHtml(items: BaseItemDto[]) {
    let html = '';

    // 外层区域容器
    html += '<div class="verticalSection verticalSection-extrabottompadding">';
    html += '<h2 class="sectionTitle sectionTitle-cards padded-left">' + globalize.translate('HeaderMyMedia') + '</h2>';

    // itemsContainer：横向可聚焦容器，内部是每个媒体库的入口按钮
    html += '<div is="emby-itemscontainer" class="itemsContainer padded-left padded-right vertical-wrap focuscontainer-x" data-multiselect="false">';

    // 为每个媒体库 view 生成一个按钮：图标 + 名称 + 路由链接
    for (let i = 0, length = items.length; i < length; i++) {
        const item = items[i];
        // 根据 CollectionType（Movies/TVShows/Music/...）选择对应的图标 class
        const icon = imageHelper.getLibraryIcon(item.CollectionType);
        // 名称需要做 HTML 转义，避免特殊字符导致的渲染问题或注入风险
        html += '<a is="emby-linkbutton" href="' + appRouter.getRouteUrl(item) + '" class="raised homeLibraryButton"><span class="material-icons homeLibraryIcon ' + icon + '" aria-hidden="true"></span><span class="homeLibraryText">' + escapeHtml(item.Name) + '</span></a>';
    }

    html += '</div>';
    html += '</div>';

    return html;
}

/**
 * 将“我的媒体”按钮区域渲染到指定元素中。
 * @param elem 目标容器（通常是首页的某个 section 容器）
 * @param userViews 当前用户可见的媒体库视图列表
 */
export function loadLibraryButtons(elem: HTMLElement, userViews: BaseItemDto[]) {
    // 这里的容器本身不是 verticalSection；实际 verticalSection 包裹在生成的 HTML 中
    elem.classList.remove('verticalSection');
    const html = getLibraryButtonsHtml(userViews);

    // 写入 HTML 并对内部图片/资源进行懒加载处理
    elem.innerHTML = html;
    imageLoader.lazyChildren(elem);
}
