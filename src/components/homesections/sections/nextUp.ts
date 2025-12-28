import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type { ApiClient } from 'jellyfin-apiclient';

import cardBuilder from 'components/cardbuilder/cardBuilder';
import layoutManager from 'components/layoutManager';
import { appRouter } from 'components/router/appRouter';
import globalize from 'lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import type { UserSettings } from 'scripts/settings/userSettings';
import { getBackdropShape } from 'utils/card';

import type { SectionContainerElement, SectionOptions } from './section';

// 首页「下一集/Next Up」区块：
// - 负责拉取 Next Up 剧集列表
// - 生成卡片 HTML 并挂到 itemsContainer（由容器组件负责实际渲染/刷新）

function getNextUpFetchFn(
    serverId: string,
    userSettings: UserSettings,
    { enableOverflow }: SectionOptions
) {
    return function () {
        const apiClient = ServerConnections.getApiClient(serverId);

        // Next Up 的时间下限：只显示最近 N 天内的「下一集」候选项。
        // N 由用户设置 maxDaysForNextUp() 决定。
        const oldestDateForNextUp = new Date();
        oldestDateForNextUp.setDate(oldestDateForNextUp.getDate() - userSettings.maxDaysForNextUp());

        // enableOverflow 表示横向滚动/溢出布局，通常会展示更多卡片。
        return apiClient.getNextUpEpisodes({
            Limit: enableOverflow ? 24 : 15,
            Fields: 'PrimaryImageAspectRatio,DateCreated,Path,MediaSourceCount',
            UserId: apiClient.getCurrentUserId(),
            ImageTypeLimit: 1,
            EnableImageTypes: 'Primary,Backdrop,Banner,Thumb',
            EnableTotalRecordCount: false,
            DisableFirstEpisode: false,
            NextUpDateCutoff: oldestDateForNextUp.toISOString(),
            EnableResumable: false,
            // 是否在 Next Up 中包含「重看」内容（由用户设置控制）。
            EnableRewatching: userSettings.enableRewatchingInNextUp()
        });
    };
}

function getNextUpItemsHtmlFn(
    useEpisodeImages: boolean,
    { enableOverflow }: SectionOptions
) {
    return function (items: BaseItemDto[]) {
        // cardLayout=false：沿用既有的卡片展示样式。
        const cardLayout = false;
        return cardBuilder.getCardsHtml({
            items: items,
            preferThumb: true,
            // 是否优先使用「剧集自身的图片」：
            // - useEpisodeImages=true 时，不继承父级（剧集季/系列）的缩略图
            // - useEpisodeImages=false 时，允许继承父级缩略图以提升命中率
            inheritThumb: !useEpisodeImages,
            shape: getBackdropShape(enableOverflow),
            overlayText: false,
            showTitle: true,
            showParentTitle: true,
            lazy: true,
            overlayPlayButton: true,
            context: 'home',
            centerText: !cardLayout,
            // 溢出滚动布局一般不需要额外的底部留白。
            allowBottomPadding: !enableOverflow,
            cardLayout: cardLayout
        });
    };
}

export function loadNextUp(
    elem: HTMLElement,
    apiClient: ApiClient,
    userSettings: UserSettings,
    options: SectionOptions
) {
    let html = '';

    html += '<div class="sectionTitleContainer sectionTitleContainer-cards padded-left">';

    // TV 模式下通常不显示可点击的标题按钮，避免影响遥控器/焦点导航。
    if (!layoutManager.tv) {
        html += '<a is="emby-linkbutton" href="' + appRouter.getRouteUrl('nextup', {
            serverId: apiClient.serverId()
        }) + '" class="button-flat button-flat-mini sectionTitleTextButton">';
        html += '<h2 class="sectionTitle sectionTitle-cards">';
        html += globalize.translate('NextUp');
        html += '</h2>';
        html += '<span class="material-icons chevron_right" aria-hidden="true"></span>';
        html += '</a>';
    } else {
        html += '<h2 class="sectionTitle sectionTitle-cards">';
        html += globalize.translate('NextUp');
        html += '</h2>';
    }
    html += '</div>';

    if (options.enableOverflow) {
        // enableOverflow：使用 scroller + scrollSlider 的横向滚动容器。
        html += '<div is="emby-scroller" class="padded-top-focusscale padded-bottom-focusscale" data-centerfocus="true">';
        html += '<div is="emby-itemscontainer" class="itemsContainer scrollSlider focuscontainer-x" data-monitor="videoplayback,markplayed">';
    } else {
        // 非溢出：使用普通的垂直换行容器。
        html += '<div is="emby-itemscontainer" class="itemsContainer padded-left padded-right vertical-wrap focuscontainer-x" data-monitor="videoplayback,markplayed">';
    }

    if (options.enableOverflow) {
        html += '</div>';
    }
    html += '</div>';

    elem.classList.add('hide');
    elem.innerHTML = html;

    const itemsContainer: SectionContainerElement | null = elem.querySelector('.itemsContainer');
    if (!itemsContainer) return;

    // 将数据拉取与 HTML 生成函数挂到容器元素上，容器会在需要时调用。
    itemsContainer.fetchData = getNextUpFetchFn(apiClient.serverId(), userSettings, options);
    itemsContainer.getItemsHtml = getNextUpItemsHtmlFn(userSettings.useEpisodeImagesInNextUpAndResume(), options);
    itemsContainer.parentContainer = elem;
}
