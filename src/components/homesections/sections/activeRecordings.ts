import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type { ApiClient } from 'jellyfin-apiclient';

import cardBuilder from 'components/cardbuilder/cardBuilder';
import globalize from 'lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';

import type { SectionContainerElement, SectionOptions } from './section';

// 根据配置生成“录制列表”的拉取函数。
// - activeRecordingsOnly=true：只显示正在录制（InProgress）的项目
// - enableOverflow=true：使用横向滚动容器并拉取更多条目
function getLatestRecordingsFetchFn(
    serverId: string,
    activeRecordingsOnly: boolean,
    { enableOverflow }: SectionOptions
) {
    return function () {
        // 通过 serverId 获取对应服务器的 ApiClient（而不是直接使用调用方传入的实例）。
        const apiClient = ServerConnections.getApiClient(serverId);
        return apiClient.getLiveTvRecordings({
            userId: apiClient.getCurrentUserId(),
            // 溢出滚动时展示更多卡片，否则保持较小数量以减少首屏负担。
            Limit: enableOverflow ? 12 : 5,
            Fields: 'PrimaryImageAspectRatio',
            EnableTotalRecordCount: false,
            // 注意：这里使用 null 来表示“不按该条件过滤”。
            // LatestRecordings：过滤掉“正在录制”，只显示已完成录制（IsLibraryItem=false）。
            IsLibraryItem: activeRecordingsOnly ? null : false,
            // ActiveRecordings：只拉取正在录制（IsInProgress=true）。
            IsInProgress: activeRecordingsOnly ? true : null
        });
    };
}

// 生成录制条目的卡片 HTML。
// activeRecordingsOnly 影响卡片的交互方式：
// - 最新录制：显示播放按钮
// - 正在录制：更多按钮/不直接播放
function getLatestRecordingItemsHtml(
    activeRecordingsOnly: boolean,
    { enableOverflow }: SectionOptions
) {
    return function (items: BaseItemDto[]) {
        return cardBuilder.getCardsHtml({
            items: items,
            // overflow 模式用于横向滚动；否则使用普通布局。
            shape: enableOverflow ? 'autooverflow' : 'auto',
            showTitle: true,
            showParentTitle: true,
            coverImage: true,
            lazy: true,
            showDetailsMenu: true,
            centerText: true,
            overlayText: false,
            showYear: true,
            lines: 2,
            // 非“正在录制”时才显示播放覆盖按钮。
            overlayPlayButton: !activeRecordingsOnly,
            allowBottomPadding: !enableOverflow,
            preferThumb: true,
            cardLayout: false,
            // “正在录制”条目以更多按钮为主（避免误触播放）。
            overlayMoreButton: activeRecordingsOnly,
            action: activeRecordingsOnly ? 'none' : null,
            centerPlayButton: activeRecordingsOnly
        });
    };
}

export function loadRecordings(
    elem: HTMLElement,
    activeRecordingsOnly: boolean,
    apiClient: ApiClient,
    options: SectionOptions
) {
    // 标题根据“正在录制/最新录制”切换。
    const title = activeRecordingsOnly ?
        globalize.translate('HeaderActiveRecordings') :
        globalize.translate('HeaderLatestRecordings');

    let html = '';

    html += '<div class="sectionTitleContainer sectionTitleContainer-cards">';
    html += '<h2 class="sectionTitle sectionTitle-cards padded-left">' + title + '</h2>';
    html += '</div>';

    if (options.enableOverflow) {
        // overflow 模式：外层 scroller + 内层 itemsContainer（横向滚动、中心聚焦）。
        html += '<div is="emby-scroller" class="padded-top-focusscale padded-bottom-focusscale" data-centerfocus="true">';
        html += '<div is="emby-itemscontainer" class="itemsContainer scrollSlider focuscontainer-x">';
    } else {
        // 非 overflow：直接渲染 itemsContainer，使用左右 padding 并允许换行。
        html += '<div is="emby-itemscontainer" class="itemsContainer padded-left padded-right vertical-wrap focuscontainer-x">';
    }

    if (options.enableOverflow) {
        html += '</div>';
    }
    html += '</div>';

    elem.classList.add('hide');
    elem.innerHTML = html;

    // itemsContainer 是自定义元素（见 SectionContainerElement），通过挂载函数实现懒加载。
    const itemsContainer: SectionContainerElement | null = elem.querySelector('.itemsContainer');
    if (!itemsContainer) return;
    // 绑定数据拉取与渲染函数，由容器在合适的时机触发。
    itemsContainer.fetchData = getLatestRecordingsFetchFn(apiClient.serverId(), activeRecordingsOnly, options);
    itemsContainer.getItemsHtml = getLatestRecordingItemsHtml(activeRecordingsOnly, options);
    itemsContainer.parentContainer = elem;
}
