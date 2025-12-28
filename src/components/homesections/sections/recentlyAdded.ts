import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import type { UserDto } from '@jellyfin/sdk/lib/generated-client/models/user-dto';
import { CollectionType } from '@jellyfin/sdk/lib/generated-client/models/collection-type';
import escapeHtml from 'escape-html';
import type { ApiClient } from 'jellyfin-apiclient';

import cardBuilder from 'components/cardbuilder/cardBuilder';
import layoutManager from 'components/layoutManager';
import { appRouter } from 'components/router/appRouter';
import globalize from 'lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { getBackdropShape, getPortraitShape, getSquareShape } from 'utils/card';

import type { SectionContainerElement, SectionOptions } from './section';

/**
 * 生成“获取最近新增项目”的数据请求函数。
 *
 * - 根据是否启用横向滚动（enableOverflow）以及媒体库类型（collectionType）决定请求数量（limit）。
 * - 返回的函数会在需要加载数据时被调用（赋值给 itemsContainer.fetchData）。
 */
function getFetchLatestItemsFn(
    serverId: string,
    parentId: string | undefined,
    collectionType: string | null | undefined,
    { enableOverflow }: SectionOptions
) {
    return function () {
        const apiClient = ServerConnections.getApiClient(serverId);
        let limit = 16;

        // 横向滚动模式下：音乐库展示更多；其他类型保持默认。
        if (enableOverflow) {
            if (collectionType === CollectionType.Music) {
                limit = 30;
            }
        // 非横向滚动模式下：不同媒体库用不同的行内布局与数量。
        } else if (collectionType === CollectionType.Tvshows) {
            limit = 5;
        } else if (collectionType === CollectionType.Music) {
            limit = 9;
        } else {
            limit = 8;
        }

        const options = {
            Limit: limit,
            Fields: 'PrimaryImageAspectRatio,Path',
            ImageTypeLimit: 1,
            EnableImageTypes: 'Primary,Backdrop,Thumb',
            ParentId: parentId
        };

        return apiClient.getLatestItems(options);
    };
}

/**
 * 生成“把最近新增条目渲染为卡片 HTML”的函数。
 *
 * - 根据 itemType / viewType 选择卡片形状（海报/方形/背景图）。
 * - 返回的函数会在数据返回后被调用（赋值给 itemsContainer.getItemsHtml）。
 */
function getLatestItemsHtmlFn(
    itemType: BaseItemKind | undefined,
    viewType: string | null | undefined,
    { enableOverflow }: SectionOptions
) {
    return function (items: BaseItemDto[]) {
        const cardLayout = false;
        let shape;

        // 形状选择：
        // - 电影/书籍/电视节目/频道：优先海报（纵向）
        // - 音乐/家庭视频：方形
        // - 其他：背景图（横向）
        if (itemType === 'Channel' || viewType === 'movies' || viewType === 'books' || viewType === 'tvshows') {
            shape = getPortraitShape(enableOverflow);
        } else if (viewType === 'music' || viewType === 'homevideos') {
            shape = getSquareShape(enableOverflow);
        } else {
            shape = getBackdropShape(enableOverflow);
        }

        return cardBuilder.getCardsHtml({
            items: items,
            shape: shape,
            // 电影/电视/频道/音乐更倾向使用主图；其他场景交给卡片自动决定。
            preferThumb: viewType !== 'movies' && viewType !== 'tvshows' && itemType !== 'Channel' && viewType !== 'music' ? 'auto' : null,
            showUnplayedIndicator: false,
            showChildCountIndicator: true,
            context: 'home',
            overlayText: false,
            centerText: !cardLayout,
            overlayPlayButton: viewType !== 'photos',
            allowBottomPadding: !enableOverflow && !cardLayout,
            cardLayout: cardLayout,
            showTitle: viewType !== 'photos',
            showYear: viewType === 'movies' || viewType === 'tvshows' || !viewType,
            showParentTitle: viewType === 'music' || viewType === 'tvshows' || !viewType || (cardLayout && (viewType === 'tvshows')),
            lines: 2
        });
    };
}

/**
 * 渲染单个“某个媒体库的最近新增”区块。
 *
 * 结构大致为：
 * - 标题栏（可点击跳转到该库的“latest”页面；TV 模式下不显示链接）
 * - 内容容器：
 *   - enableOverflow=true：使用 scroller + scrollSlider
 *   - enableOverflow=false：使用普通的 itemsContainer 换行布局
 */
function renderLatestSection(
    elem: HTMLElement,
    apiClient: ApiClient,
    user: UserDto,
    parent: BaseItemDto,
    options: SectionOptions
) {
    let html = '';

    html += '<div class="sectionTitleContainer sectionTitleContainer-cards padded-left">';
    if (!layoutManager.tv) {
        html += '<a is="emby-linkbutton" href="' + appRouter.getRouteUrl(parent, {
            section: 'latest'
        }) + '" class="more button-flat button-flat-mini sectionTitleTextButton">';
        html += '<h2 class="sectionTitle sectionTitle-cards">';
        html += globalize.translate('LatestFromLibrary', escapeHtml(parent.Name));
        html += '</h2>';
        html += '<span class="material-icons chevron_right" aria-hidden="true"></span>';
        html += '</a>';
    } else {
        html += '<h2 class="sectionTitle sectionTitle-cards">' + globalize.translate('LatestFromLibrary', escapeHtml(parent.Name)) + '</h2>';
    }
    html += '</div>';

    if (options.enableOverflow) {
        html += '<div is="emby-scroller" class="padded-top-focusscale padded-bottom-focusscale" data-centerfocus="true">';
        html += '<div is="emby-itemscontainer" class="itemsContainer scrollSlider focuscontainer-x">';
    } else {
        html += '<div is="emby-itemscontainer" class="itemsContainer focuscontainer-x padded-left padded-right vertical-wrap">';
    }

    if (options.enableOverflow) {
        html += '</div>';
    }
    html += '</div>';

    elem.innerHTML = html;

    const itemsContainer: SectionContainerElement | null = elem.querySelector('.itemsContainer');
    if (!itemsContainer) return;
    itemsContainer.fetchData = getFetchLatestItemsFn(apiClient.serverId(), parent.Id, parent.CollectionType, options);
    itemsContainer.getItemsHtml = getLatestItemsHtmlFn(parent.Type, parent.CollectionType, options);
    itemsContainer.parentContainer = elem;
}

export function loadRecentlyAdded(
    elem: HTMLElement,
    apiClient: ApiClient,
    user: UserDto,
    userViews: BaseItemDto[],
    options: SectionOptions
) {
    // 最近新增是“纵向分区”的集合：每个用户视图（媒体库）各渲染一个区块。
    elem.classList.remove('verticalSection');

    // 这些媒体库类型不显示“最近新增”。
    const excludeViewTypes = ['playlists', 'livetv', 'boxsets', 'channels', 'folders'];

    // 用户配置中可显式排除某些媒体库（LatestItemsExcludes 存储的是视图/媒体库的 Id）。
    const userExcludeItems = user.Configuration?.LatestItemsExcludes ?? [];

    userViews.forEach(item => {
        // 缺少 Id 或用户明确排除的视图：跳过。
        if (!item.Id || userExcludeItems.includes(item.Id)) {
            return;
        }

        // 某些 collectionType 不参与“最近新增”。
        if (item.CollectionType && excludeViewTypes.includes(item.CollectionType)) {
            return;
        }

        // 每个媒体库创建一个独立分区，初始隐藏；后续由数据加载/布局控制显示。
        const frag = document.createElement('div');
        frag.classList.add('verticalSection');
        frag.classList.add('hide');
        elem.appendChild(frag);

        renderLatestSection(frag, apiClient, user, item, options);
    });
}
