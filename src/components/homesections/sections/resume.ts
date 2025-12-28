import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import type { ApiClient } from 'jellyfin-apiclient';

import cardBuilder from 'components/cardbuilder/cardBuilder';
import globalize from 'lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import type { UserSettings } from 'scripts/settings/userSettings';
import { getBackdropShape, getPortraitShape } from 'utils/card';

import type { SectionContainerElement, SectionOptions } from './section';

// 不同媒体类型对应的 data-monitor 提示。
// 这些值会挂在 itemsContainer 的 data-monitor 上，用于告诉前端数据监控层：哪些事件会影响此区域需要刷新。
const dataMonitorHints: Record<string, string> = {
    Audio: 'audioplayback,markplayed',
    Video: 'videoplayback,markplayed'
};

function getItemsToResumeFn(
    mediaType: BaseItemKind,
    serverId: string,
    { enableOverflow }: SectionOptions
) {
    // 返回一个闭包函数，供 Section 容器在需要时调用以拉取“继续播放/继续阅读”列表。
    // 这里不直接请求，是为了让容器可以在合适的时机（例如滚动/可见时）触发 fetchData。
    return function () {
        const apiClient = ServerConnections.getApiClient(serverId);

        // 启用横向滚动（overflow）时展示更多卡片，否则在普通布局下限制更少的数量。
        const limit = enableOverflow ? 12 : 5;

        const options = {
            Limit: limit,
            Recursive: true,
            Fields: 'PrimaryImageAspectRatio',
            ImageTypeLimit: 1,
            EnableImageTypes: 'Primary,Backdrop,Thumb',
            EnableTotalRecordCount: false,
            MediaTypes: mediaType
        };

        return apiClient.getResumableItems(apiClient.getCurrentUserId(), options);
    };
}

function getItemsToResumeHtmlFn(
    useEpisodeImages: boolean,
    mediaType: BaseItemKind,
    { enableOverflow }: SectionOptions
) {
    // 返回一个闭包函数，把 API 返回的 items 渲染为卡片 HTML。
    // 由容器的 getItemsHtml 回调调用。
    return function (items: BaseItemDto[]) {
        const cardLayout = false;
        return cardBuilder.getCardsHtml({
            items: items,
            preferThumb: true,
            // 是否继承父级缩略图：如果允许使用剧集图（useEpisodeImages=true），则不继承；
            // 否则倾向使用父级/系列的 thumb，以保证“继续观看”区域图像更稳定。
            inheritThumb: !useEpisodeImages,
            // Book 使用竖版海报形状，其它媒体类型使用横版背景形状。
            shape: (mediaType === 'Book') ?
                getPortraitShape(enableOverflow) :
                getBackdropShape(enableOverflow),
            overlayText: false,
            showTitle: true,
            showParentTitle: true,
            lazy: true,
            showDetailsMenu: true,
            overlayPlayButton: true,
            // context=home 影响卡片在首页场景下的行为/样式（例如菜单项、可用操作）。
            context: 'home',
            centerText: !cardLayout,
            allowBottomPadding: false,
            cardLayout: cardLayout,
            showYear: true,
            // 最多显示两行标题文本。
            lines: 2
        });
    };
}

export function loadResume(
    elem: HTMLElement,
    apiClient: ApiClient,
    titleLabel: string,
    mediaType: BaseItemKind,
    userSettings: UserSettings,
    options: SectionOptions
) {
    let html = '';

    // data-monitor 用于监听播放/标记播放状态等事件，从而在状态变化时刷新该 section。
    // 未在表中列出的媒体类型，默认只监听 markplayed。
    const dataMonitor = dataMonitorHints[mediaType] ?? 'markplayed';

    // 拼接 section 标题。
    html += '<h2 class="sectionTitle sectionTitle-cards padded-left">' + globalize.translate(titleLabel) + '</h2>';
    if (options.enableOverflow) {
        // overflow 模式：外层使用 scroller，使卡片可横向滚动。
        html += '<div is="emby-scroller" class="padded-top-focusscale padded-bottom-focusscale" data-centerfocus="true">';
        html += `<div is="emby-itemscontainer" class="itemsContainer scrollSlider focuscontainer-x" data-monitor="${dataMonitor}">`;
    } else {
        // 非 overflow 模式：普通换行布局（vertical-wrap）。
        html += `<div is="emby-itemscontainer" class="itemsContainer padded-left padded-right vertical-wrap focuscontainer-x" data-monitor="${dataMonitor}">`;
    }

    if (options.enableOverflow) {
        html += '</div>';
    }
    html += '</div>';

    elem.classList.add('hide');
    elem.innerHTML = html;

    const itemsContainer: SectionContainerElement | null = elem.querySelector('.itemsContainer');
    if (!itemsContainer) return;

    // 为 itemsContainer 挂载数据获取与渲染回调。
    // itemsContainer 组件会调用 fetchData 拉取数据，然后用 getItemsHtml 生成卡片 HTML。
    itemsContainer.fetchData = getItemsToResumeFn(mediaType, apiClient.serverId(), options);
    itemsContainer.getItemsHtml = getItemsToResumeHtmlFn(userSettings.useEpisodeImagesInNextUpAndResume(), mediaType, options);
    itemsContainer.parentContainer = elem;
}
