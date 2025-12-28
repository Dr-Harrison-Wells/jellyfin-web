import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';

import cardBuilder from 'components/cardbuilder/cardBuilder';
import imageLoader from 'components/images/imageLoader';
import globalize from 'lib/globalize';
import { getBackdropShape } from 'utils/card';

import type { SectionOptions } from './section';

/**
 * 渲染首页“我的媒体”媒体库视图（tiles）区域。
 *
 * 根据 `enableOverflow` 决定使用可横向滚动的 scroller，还是普通换行布局。
 * 最终写入 `elem.innerHTML`，并触发子元素的懒加载。
 */
export function loadLibraryTiles(
    elem: HTMLElement,
    userViews: BaseItemDto[],
    {
        enableOverflow
    }: SectionOptions
) {
    let html = '';

    // userViews 为空时保持该区域为空（不输出标题/容器）
    if (userViews.length) {
        html += '<h2 class="sectionTitle sectionTitle-cards padded-left">' + globalize.translate('HeaderMyMedia') + '</h2>';

        // enableOverflow=true：使用 scroller + scrollSlider，支持横向滚动与居中聚焦
        if (enableOverflow) {
            html += '<div is="emby-scroller" class="padded-top-focusscale padded-bottom-focusscale" data-centerfocus="true">';
            html += '<div is="emby-itemscontainer" class="itemsContainer scrollSlider focuscontainer-x">';
        } else {
            // enableOverflow=false：常规容器，允许换行展示
            html += '<div is="emby-itemscontainer" class="itemsContainer padded-left padded-right focuscontainer-x vertical-wrap">';
        }

        // 使用 cardBuilder 批量生成媒体库卡片 HTML
        html += cardBuilder.getCardsHtml({
            items: userViews,
            // 卡片形状随 overflow 模式调整（通常是更适合 backdrop 的比例/圆角策略）
            shape: getBackdropShape(enableOverflow),
            showTitle: true,
            centerText: true,
            overlayText: false,
            lazy: true,
            transition: false,
            // 非 overflow 模式下允许底部 padding，避免贴边
            allowBottomPadding: !enableOverflow
        });

        // overflow 模式多包了一层 itemscontainer，需要额外闭合
        if (enableOverflow) {
            html += '</div>';
        }
        html += '</div>';
    }

    // 写入 DOM 并触发内部图片等资源的懒加载
    elem.innerHTML = html;
    imageLoader.lazyChildren(elem);
}
