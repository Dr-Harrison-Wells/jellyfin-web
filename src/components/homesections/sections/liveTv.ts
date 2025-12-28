import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type { UserDto } from '@jellyfin/sdk/lib/generated-client/models/user-dto';
import type { ApiClient } from 'jellyfin-apiclient';

import { appRouter } from 'components/router/appRouter';
import cardBuilder from 'components/cardbuilder/cardBuilder';
import layoutManager from 'components/layoutManager';
import globalize from 'lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { getBackdropShape } from 'utils/card';

import type { SectionContainerElement, SectionOptions } from './section';

/**
 * Live TV 首页分区（“直播电视”与“正在播放”）
 *
 * 这个文件主要做两件事：
 * 1) 拉取“正在播放(On Now)”的直播节目数据
 * 2) 拼接并渲染对应的 HTML（包含跳转按钮与节目卡片容器）
 */

function getOnNowFetchFn(
    serverId: string
) {
    // 生成一个闭包：后续由 itemsContainer.fetchData 调用时再取当前 server 的 ApiClient 并请求数据
    return function () {
        const apiClient = ServerConnections.getApiClient(serverId);
        return apiClient.getLiveTvRecommendedPrograms({
            userId: apiClient.getCurrentUserId(),
            IsAiring: true,
            limit: 24,
            ImageTypeLimit: 1,
            EnableImageTypes: 'Primary,Thumb,Backdrop',
            EnableTotalRecordCount: false,
            Fields: 'ChannelInfo,PrimaryImageAspectRatio'
        });
    };
}

function getOnNowItemsHtmlFn(
    { enableOverflow }: SectionOptions
) {
    // 根据配置生成“节目卡片列表”的渲染函数；enableOverflow 会影响卡片形状与容器布局
    return (items: BaseItemDto[]) => (
        cardBuilder.getCardsHtml({
            items: items,
            preferThumb: 'auto',
            inheritThumb: false,
            shape: (enableOverflow ? 'autooverflow' : 'auto'),
            showParentTitleOrTitle: true,
            showTitle: true,
            centerText: true,
            coverImage: true,
            overlayText: false,
            allowBottomPadding: !enableOverflow,
            showAirTime: true,
            showChannelName: false,
            showAirDateTime: false,
            showAirEndTime: true,
            defaultShape: getBackdropShape(enableOverflow),
            lines: 3,
            overlayPlayButton: true
        })
    );
}

function buildSection(
    elem: HTMLElement,
    serverId: string,
    options: SectionOptions
) {
    // 构建两段 UI：
    // - 第一段：直播入口按钮（节目/指南/频道/录制/计划/系列等）
    // - 第二段：“正在播放”标题 + itemsContainer（由其负责拉取并渲染卡片）
    let html = '';

    elem.classList.remove('padded-left');
    elem.classList.remove('padded-right');
    elem.classList.remove('padded-bottom');
    elem.classList.remove('verticalSection');

    html += '<div class="verticalSection">';
    html += '<div class="sectionTitleContainer sectionTitleContainer-cards padded-left">';
    html += '<h2 class="sectionTitle sectionTitle-cards">' + globalize.translate('LiveTV') + '</h2>';
    html += '</div>';

    if (options.enableOverflow) {
        // 可横向溢出滚动：使用 emby-scroller + scrollSlider
        html += '<div is="emby-scroller" class="padded-top-focusscale padded-bottom-focusscale" data-centerfocus="true" data-scrollbuttons="false">';
        html += '<div class="padded-top padded-bottom scrollSlider focuscontainer-x">';
    } else {
        // 不启用溢出：直接用 focuscontainer-x 容器
        html += '<div class="padded-top padded-bottom focuscontainer-x">';
    }

    html += '<a is="emby-linkbutton" href="' + appRouter.getRouteUrl('livetv', {
        serverId,
        section: 'programs'
    }) + '" class="raised"><span>' + globalize.translate('Programs') + '</span></a>';

    html += '<a is="emby-linkbutton" href="' + appRouter.getRouteUrl('livetv', {
        serverId,
        section: 'guide'
    }) + '" class="raised"><span>' + globalize.translate('Guide') + '</span></a>';

    html += '<a is="emby-linkbutton" href="' + appRouter.getRouteUrl('livetv', {
        serverId,
        section: 'channels'
    }) + '" class="raised"><span>' + globalize.translate('Channels') + '</span></a>';

    html += '<a is="emby-linkbutton" href="' + appRouter.getRouteUrl('recordedtv', {
        serverId
    }) + '" class="raised"><span>' + globalize.translate('Recordings') + '</span></a>';

    html += '<a is="emby-linkbutton" href="' + appRouter.getRouteUrl('livetv', {
        serverId,
        section: 'dvrschedule'
    }) + '" class="raised"><span>' + globalize.translate('Schedule') + '</span></a>';

    html += '<a is="emby-linkbutton" href="' + appRouter.getRouteUrl('livetv', {
        serverId,
        section: 'seriesrecording'
    }) + '" class="raised"><span>' + globalize.translate('Series') + '</span></a>';

    html += '</div>';
    if (options.enableOverflow) {
        html += '</div>';
    }
    html += '</div>';
    html += '</div>';

    html += '<div class="verticalSection">';
    html += '<div class="sectionTitleContainer sectionTitleContainer-cards padded-left">';

    if (!layoutManager.tv) {
        // 非 TV 布局时标题可点击：跳转到“正在播放”完整页面
        html += '<a is="emby-linkbutton" href="' + appRouter.getRouteUrl('livetv', {
            serverId,
            section: 'onnow'
        }) + '" class="more button-flat button-flat-mini sectionTitleTextButton">';
        html += '<h2 class="sectionTitle sectionTitle-cards">';
        html += globalize.translate('HeaderOnNow');
        html += '</h2>';
        html += '<span class="material-icons chevron_right" aria-hidden="true"></span>';
        html += '</a>';
    } else {
        // TV 布局通常用方向键导航：标题不做链接
        html += '<h2 class="sectionTitle sectionTitle-cards">' + globalize.translate('HeaderOnNow') + '</h2>';
    }
    html += '</div>';

    if (options.enableOverflow) {
        // 溢出滚动模式：itemsContainer 放在 scroller 内部
        html += '<div is="emby-scroller" class="padded-top-focusscale padded-bottom-focusscale" data-centerfocus="true">';
        html += '<div is="emby-itemscontainer" class="itemsContainer scrollSlider focuscontainer-x">';
    } else {
        // 非溢出模式：itemsContainer 带左右 padding，并允许换行布局
        html += '<div is="emby-itemscontainer" class="itemsContainer padded-left padded-right vertical-wrap focuscontainer-x">';
    }

    if (options.enableOverflow) {
        html += '</div>';
    }

    html += '</div>';
    html += '</div>';

    elem.innerHTML = html;

    const itemsContainer: SectionContainerElement | null = elem.querySelector('.itemsContainer');
    if (!itemsContainer) return;

    // 由 itemsContainer 统一负责：
    // - 何时请求数据（fetchData）
    // - 如何把数据渲染成卡片 HTML（getItemsHtml）
    itemsContainer.parentContainer = elem;
    itemsContainer.fetchData = getOnNowFetchFn(serverId);
    itemsContainer.getItemsHtml = getOnNowItemsHtmlFn(options);
}

export function loadLiveTV(
    elem: HTMLElement,
    apiClient: ApiClient,
    user: UserDto,
    options: SectionOptions
) {
    // 用户策略禁用 Live TV 时：直接跳过，不渲染此分区
    if (!user.Policy?.EnableLiveTvAccess) {
        return Promise.resolve();
    }

    // 先用最小请求探测是否有“正在播放”的推荐节目；有数据才构建分区
    return apiClient.getLiveTvRecommendedPrograms({
        userId: apiClient.getCurrentUserId(),
        IsAiring: true,
        limit: 1,
        ImageTypeLimit: 1,
        EnableImageTypes: 'Primary,Thumb,Backdrop',
        EnableTotalRecordCount: false,
        Fields: 'ChannelInfo,PrimaryImageAspectRatio'
    }).then(function (result) {
        // 注意：这里只要有 1 条就渲染；实际卡片列表在 buildSection 中会按 24 条去拉取
        if (result.Items?.length) {
            buildSection(elem, apiClient.serverId(), options);
        }
    });
}
