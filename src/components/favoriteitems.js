import dom from 'scripts/dom';
import globalize from 'lib/globalize';
import { getBackdropShape, getPortraitShape, getSquareShape } from 'utils/card';
import { getParameterByName } from 'utils/url';

import cardBuilder from './cardbuilder/cardBuilder';
import imageLoader from './images/imageLoader';
import layoutManager from './layoutManager';
import loading from './loading/loading';

import 'elements/emby-itemscontainer/emby-itemscontainer';

import 'styles/scrollstyles.scss';

/**
 * 检查是否应启用水平滚动。
 * @returns {boolean} 如果启用了水平滚动，则为 true，否则为 false。
 */
function enableScrollX() {
    return !layoutManager.desktop;
}

/**
 * 获取要显示的部分列表。
 * @returns {Array} 部分对象的数组。
 */
function getSections() {
    return [{
        name: 'Movies',
        types: 'Movie',
        id: 'favoriteMovies',
        shape: getPortraitShape(enableScrollX()),
        showTitle: false,
        overlayPlayButton: true
    }, {
        name: 'Shows',
        types: 'Series',
        id: 'favoriteShows',
        shape: getPortraitShape(enableScrollX()),
        showTitle: false,
        overlayPlayButton: true
    }, {
        name: 'Episodes',
        types: 'Episode',
        id: 'favoriteEpisode',
        shape: getBackdropShape(enableScrollX()),
        preferThumb: false,
        showTitle: true,
        showParentTitle: true,
        overlayPlayButton: true,
        overlayText: false,
        centerText: true
    }, {
        name: 'Videos',
        types: 'Video,MusicVideo',
        id: 'favoriteVideos',
        shape: getBackdropShape(enableScrollX()),
        preferThumb: true,
        showTitle: true,
        overlayPlayButton: true,
        overlayText: false,
        centerText: true
    }, {
        name: 'Artists',
        types: 'MusicArtist',
        id: 'favoriteArtists',
        shape: getSquareShape(enableScrollX()),
        preferThumb: false,
        showTitle: true,
        overlayText: false,
        showParentTitle: false,
        centerText: true,
        overlayPlayButton: true,
        coverImage: true
    }, {
        name: 'Albums',
        types: 'MusicAlbum',
        id: 'favoriteAlbums',
        shape: getSquareShape(enableScrollX()),
        preferThumb: false,
        showTitle: true,
        overlayText: false,
        showParentTitle: true,
        centerText: true,
        overlayPlayButton: true,
        coverImage: true
    }, {
        name: 'Songs',
        types: 'Audio',
        id: 'favoriteSongs',
        shape: getSquareShape(enableScrollX()),
        preferThumb: false,
        showTitle: true,
        overlayText: false,
        showParentTitle: true,
        centerText: true,
        overlayMoreButton: true,
        action: 'instantmix',
        coverImage: true
    }];
}

/**
 * 加载特定部分的收藏项目。
 * @param {HTMLElement} elem - 要将部分渲染到的 DOM 元素。
 * @param {string} userId - 用户 ID。
 * @param {string} topParentId - 顶级父 ID（可选）。
 * @param {Object} section - 部分配置对象。
 * @param {boolean} isSingleSection - 是否仅显示此部分。
 * @returns {Promise} 当部分加载完成时解析的 Promise。
 */
function loadSection(elem, userId, topParentId, section, isSingleSection) {
    const screenWidth = dom.getWindowSize().innerWidth;
    const options = {
        SortBy: 'SortName',
        SortOrder: 'Ascending',
        Filters: 'IsFavorite',
        Recursive: true,
        Fields: 'PrimaryImageAspectRatio',
        CollapseBoxSetItems: false,
        ExcludeLocationTypes: 'Virtual',
        EnableTotalRecordCount: false
    };

    if (topParentId) {
        options.ParentId = topParentId;
    }

    // 如果不是单一部分视图，则根据屏幕宽度设置限制
    if (!isSingleSection) {
        options.Limit = 6;

        if (enableScrollX()) {
            options.Limit = 20;
        } else if (screenWidth >= 1920) {
            options.Limit = 10;
        } else if (screenWidth >= 1440) {
            options.Limit = 8;
        }
    }

    let promise;

    // 根据部分类型获取项目
    if (section.types === 'MusicArtist') {
        promise = ApiClient.getArtists(userId, options);
    } else {
        options.IncludeItemTypes = section.types;
        promise = ApiClient.getItems(userId, options);
    }

    return promise.then(function (result) {
        let html = '';

        if (result.Items.length) {
            html += '<div class="sectionTitleContainer sectionTitleContainer-cards padded-left">';

            // 如果项目数量超过限制，则渲染“更多”按钮
            if (!layoutManager.tv && options.Limit && result.Items.length >= options.Limit) {
                html += '<a is="emby-linkbutton" href="' + ('#/list?serverId=' + ApiClient.serverId() + '&type=' + section.types + '&IsFavorite=true') + '" class="more button-flat button-flat-mini sectionTitleTextButton">';
                html += '<h2 class="sectionTitle sectionTitle-cards">';
                html += globalize.translate(section.name);
                html += '</h2>';
                html += '<span class="material-icons chevron_right" aria-hidden="true"></span>';
                html += '</a>';
            } else {
                html += '<h2 class="sectionTitle sectionTitle-cards">' + globalize.translate(section.name) + '</h2>';
            }

            html += '</div>';
            if (enableScrollX()) {
                let scrollXClass = 'scrollX hiddenScrollX';
                if (layoutManager.tv) {
                    scrollXClass += ' smoothScrollX';
                }

                html += '<div is="emby-itemscontainer" class="itemsContainer ' + scrollXClass + ' padded-left padded-right">';
            } else {
                html += '<div is="emby-itemscontainer" class="itemsContainer vertical-wrap padded-left padded-right">';
            }

            // NOTE: Why is card layout always disabled?
            // let cardLayout = appHost.preferVisualCards && section.autoCardLayout && section.showTitle;
            const cardLayout = false;

            // 生成卡片的 HTML
            html += cardBuilder.getCardsHtml(result.Items, {
                preferThumb: section.preferThumb,
                shape: section.shape,
                centerText: section.centerText && !cardLayout,
                overlayText: section.overlayText !== false,
                showTitle: section.showTitle,
                showParentTitle: section.showParentTitle,
                scalable: true,
                coverImage: section.coverImage,
                overlayPlayButton: section.overlayPlayButton,
                overlayMoreButton: section.overlayMoreButton && !cardLayout,
                action: section.action,
                allowBottomPadding: !enableScrollX(),
                cardLayout: cardLayout
            });
            html += '</div>';
        }

        elem.innerHTML = html;
        imageLoader.lazyChildren(elem);
    });
}

/**
 * 加载所有收藏部分到页面中。
 * @param {HTMLElement} page - 页面元素。
 * @param {string} userId - 用户 ID。
 * @param {string} topParentId - 顶级父 ID（可选）。
 * @param {Array} types - 要过滤的类型数组（可选）。
 */
export function loadSections(page, userId, topParentId, types) {
    loading.show();
    let sections = getSections();
    const sectionid = getParameterByName('sectionid');

    // 如果在 URL 中提供了特定的部分 ID，则过滤部分
    if (sectionid) {
        sections = sections.filter(function (s) {
            return s.id === sectionid;
        });
    }

    // 根据提供的类型过滤部分
    if (types) {
        sections = sections.filter(function (s) {
            return types.indexOf(s.id) !== -1;
        });
    }

    let elem = page.querySelector('.favoriteSections');

    // 如果部分不存在，则为其创建占位符
    if (!elem.innerHTML) {
        let html = '';

        for (let i = 0, length = sections.length; i < length; i++) {
            html += '<div class="verticalSection section' + sections[i].id + '"></div>';
        }

        elem.innerHTML = html;
    }

    const promises = [];

    // 加载每个部分
    for (let i = 0, length = sections.length; i < length; i++) {
        const section = sections[i];
        elem = page.querySelector('.section' + section.id);
        promises.push(loadSection(elem, userId, topParentId, section, sections.length === 1));
    }

    Promise.all(promises).then(function () {
        loading.hide();
    });
}

export default {
    render: loadSections
};
