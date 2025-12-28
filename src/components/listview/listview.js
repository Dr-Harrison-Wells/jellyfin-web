
/**
 * 用于显示列表视图的模块。
 * Module for display list view.
 * @module components/listview/listview
 */

// 导入所需的依赖库和组件
import escapeHtml from 'escape-html';
import itemHelper from '../itemHelper';
import mediaInfo from '../mediainfo/mediainfo';
import indicators from '../indicators/indicators';
import layoutManager from '../layoutManager';
import globalize from '../../lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import datetime from '../../scripts/datetime';
import cardBuilder from '../cardbuilder/cardBuilder';
import './listview.scss';
import '../../elements/emby-ratingbutton/emby-ratingbutton';
import '../../elements/emby-playstatebutton/emby-playstatebutton';
import { getDefaultBackgroundClass } from '../cardbuilder/cardBuilderUtils';
import markdownIt from 'markdown-it';
import DOMPurify from 'dompurify';

/**
 * 获取列表项的索引标题（用于分组显示）
 * @param {Object} item - 媒体项对象
 * @param {Object} options - 选项配置
 * @returns {string} 索引标题文本
 */
function getIndex(item, options) {
    // 如果按光盘编号索引
    if (options.index === 'disc') {
        return item.ParentIndexNumber == null ? '' : globalize.translate('ValueDiscNumber', item.ParentIndexNumber);
    }

    // 获取排序方式
    const sortBy = (options.sortBy || '').toLowerCase();
    let code;
    let name;

    // 按排序名称索引
    if (sortBy.indexOf('sortname') === 0) {
        if (item.Type === 'Episode') {
            return '';
        }

        // 获取排序名称的首字母
        name = (item.SortName || item.Name || '?')[0].toUpperCase();

        // 检查是否为字母 A-Z
        code = name.charCodeAt(0);
        if (code < 65 || code > 90) {
            return '#'; // 非字母返回 '#'
        }

        return name.toUpperCase();
    }
    // 按官方评级索引
    if (sortBy.indexOf('officialrating') === 0) {
        return item.OfficialRating || globalize.translate('Unrated');
    }
    // 按社区评分索引
    if (sortBy.indexOf('communityrating') === 0) {
        if (item.CommunityRating == null) {
            return globalize.translate('Unrated');
        }

        return Math.floor(item.CommunityRating);
    }
    // 按影评人评分索引
    if (sortBy.indexOf('criticrating') === 0) {
        if (item.CriticRating == null) {
            return globalize.translate('Unrated');
        }

        return Math.floor(item.CriticRating);
    }
    // 按专辑艺术家索引
    if (sortBy.indexOf('albumartist') === 0) {
        // 获取专辑艺术家名称
        if (!item.AlbumArtist) {
            return '';
        }

        name = item.AlbumArtist[0].toUpperCase();

        // 检查是否为字母 A-Z
        code = name.charCodeAt(0);
        if (code < 65 || code > 90) {
            return '#'; // 非字母返回 '#'
        }

        return name.toUpperCase();
    }
    return '';
}

/**
 * 获取媒体项的图片 URL
 * @param {Object} item - 媒体项对象
 * @param {number} size - 图片尺寸
 * @returns {string|null} 图片 URL 或 null
 */
function getImageUrl(item, size) {
    // 获取 API 客户端
    const apiClient = ServerConnections.getApiClient(item.ServerId);
    let itemId;

    // 配置图片选项
    const options = {
        fillWidth: size,
        fillHeight: size,
        type: 'Primary'
    };

    // 优先使用项目自身的主图片
    if (item.ImageTags?.Primary) {
        options.tag = item.ImageTags.Primary;
        itemId = item.Id;
    } else if (item.AlbumId && item.AlbumPrimaryImageTag) {
        // 使用专辑图片
        options.tag = item.AlbumPrimaryImageTag;
        itemId = item.AlbumId;
    } else if (item.SeriesId && item.SeriesPrimaryImageTag) {
        // 使用剧集图片
        options.tag = item.SeriesPrimaryImageTag;
        itemId = item.SeriesId;
    } else if (item.ParentPrimaryImageTag) {
        // 使用父项目图片
        options.tag = item.ParentPrimaryImageTag;
        itemId = item.ParentPrimaryImageItemId;
    }

    if (itemId) {
        return apiClient.getScaledImageUrl(itemId, options);
    }
    return null;
}

/**
 * 获取频道的图片 URL
 * @param {Object} item - 媒体项对象
 * @param {number} size - 图片尺寸
 * @returns {string|undefined} 图片 URL
 */
function getChannelImageUrl(item, size) {
    // 获取 API 客户端
    const apiClient = ServerConnections.getApiClient(item.ServerId);
    const options = {
        fillWidth: size,
        fillHeight: size,
        type: 'Primary'
    };

    // 设置频道图片标签
    if (item.ChannelId && item.ChannelPrimaryImageTag) {
        options.tag = item.ChannelPrimaryImageTag;
    }

    if (item.ChannelId) {
        return apiClient.getScaledImageUrl(item.ChannelId, options);
    }
}

/**
 * 生成文本行的 HTML
 * @param {Array} textlines - 文本行数组
 * @param {boolean} isLargeStyle - 是否使用大样式
 * @returns {string} 生成的 HTML 字符串
 */
function getTextLinesHtml(textlines, isLargeStyle) {
    let html = '';

    // 根据设备类型选择标题标签
    const largeTitleTagName = layoutManager.tv ? 'h2' : 'div';

    // 遍历每一行文本
    for (const [i, text] of textlines.entries()) {
        if (!text) {
            continue;
        }

        let elem;

        // 第一行使用主标题样式
        if (i === 0) {
            if (isLargeStyle) {
                elem = document.createElement(largeTitleTagName);
            } else {
                elem = document.createElement('div');
            }
        } else {
            // 其他行使用次要文本样式
            elem = document.createElement('div');
            elem.classList.add('secondary');
        }

        elem.classList.add('listItemBodyText');

        elem.innerHTML = '<bdi>' + escapeHtml(text) + '</bdi>';

        html += elem.outerHTML;
    }

    return html;
}

/**
 * 生成右侧按钮的 HTML
 * @param {Object} options - 选项配置
 * @returns {string} 生成的按钮 HTML 字符串
 */
function getRightButtonsHtml(options) {
    let html = '';

    // 遍历所有右侧按钮配置
    for (let i = 0, length = options.rightButtons.length; i < length; i++) {
        const button = options.rightButtons[i];

        html += `<button is="paper-icon-button-light" class="listItemButton itemAction" data-action="custom" data-customaction="${button.id}" title="${button.title}"><span class="material-icons ${button.icon}" aria-hidden="true"></span></button>`;
    }

    return html;
}

/**
 * 生成列表视图的 HTML
 * @param {Object} options - 选项配置
 * @param {Array} options.items - 要显示的媒体项数组
 * @param {string} options.action - 点击动作类型
 * @param {string} options.imageSize - 图片尺寸
 * @param {boolean} options.enableOverview - 是否显示概述
 * @returns {string} 生成的列表视图 HTML 字符串
 */
export function getListViewHtml(options) {
    // 获取要显示的媒体项列表
    const items = options.items;

    let groupTitle = ''; // 当前分组标题
    const action = options.action || 'link'; // 默认动作类型

    const isLargeStyle = options.imageSize === 'large'; // 是否使用大图样式
    const enableOverview = options.enableOverview; // 是否启用概述

    const clickEntireItem = layoutManager.tv; // TV 模式下点击整个项目
    const outerTagName = clickEntireItem ? 'button' : 'div'; // 外层标签类型
    const enableSideMediaInfo = options.enableSideMediaInfo != null ? options.enableSideMediaInfo : true; // 是否显示侧边媒体信息

    let outerHtml = ''; // 最终生成的 HTML

    const enableContentWrapper = options.enableOverview && !layoutManager.tv; // 是否启用内容包装器

    // 遍历所有媒体项
    for (let i = 0, length = items.length; i < length; i++) {
        const item = items[i];

        let html = '';

        // 如果启用索引显示，处理分组标题
        if (options.showIndex) {
            const itemGroupTitle = getIndex(item, options);

            // 当分组标题改变时，添加新的分组标题
            if (itemGroupTitle !== groupTitle) {
                if (html) {
                    html += '</div>';
                }

                if (i === 0) {
                    html += '<h2 class="listGroupHeader listGroupHeader-first">';
                } else {
                    html += '<h2 class="listGroupHeader">';
                }
                html += escapeHtml(itemGroupTitle);
                html += '</h2>';

                html += '<div>';

                groupTitle = itemGroupTitle;
            }
        }

        // 构建列表项的 CSS 类名
        let cssClass = 'listItem';

        // 添加边框样式
        if (options.border || (options.highlight !== false && !layoutManager.tv)) {
            cssClass += ' listItem-border';
        }

        // TV 模式下点击整个项目
        if (clickEntireItem) {
            cssClass += ' itemAction listItem-button';
        }

        // TV 模式下添加焦点缩放效果
        if (layoutManager.tv) {
            cssClass += ' listItem-focusscale';
        }

        // 设置图片下载宽度
        let downloadWidth = 80;

        // 大样式使用更大的图片
        if (isLargeStyle) {
            cssClass += ' listItem-largeImage';
            downloadWidth = 500;
        }

        // 构建各种数据属性
        const playlistItemId = item.PlaylistItemId ? (` data-playlistitemid="${item.PlaylistItemId}"`) : '';

        const positionTicksData = item.UserData?.PlaybackPositionTicks ? (` data-positionticks="${item.UserData.PlaybackPositionTicks}"`) : '';
        const collectionIdData = options.collectionId ? (` data-collectionid="${options.collectionId}"`) : '';
        const playlistIdData = options.playlistId ? (` data-playlistid="${options.playlistId}"`) : '';
        const mediaTypeData = item.MediaType ? (` data-mediatype="${item.MediaType}"`) : '';
        const collectionTypeData = item.CollectionType ? (` data-collectiontype="${item.CollectionType}"`) : '';
        const channelIdData = item.ChannelId ? (` data-channelid="${item.ChannelId}"`) : '';

        if (enableContentWrapper) {
            cssClass += ' listItem-withContentWrapper';
        }

        // 创建列表项的外层元素
        html += `<${outerTagName} class="${cssClass}"${playlistItemId} data-action="${action}" data-isfolder="${item.IsFolder}" data-id="${item.Id}" data-serverid="${item.ServerId}" data-type="${item.Type}"${mediaTypeData}${collectionTypeData}${channelIdData}${positionTicksData}${collectionIdData}${playlistIdData}>`;

        // 如果需要内容包装器
        if (enableContentWrapper) {
            html += '<div class="listItem-content">';
        }

        // 添加拖拽句柄
        if (!clickEntireItem && options.dragHandle) {
            html += '<span class="listViewDragHandle material-icons listItemIcon listItemIcon-transparent drag_handle" aria-hidden="true"></span>';
        }

        // 处理图片显示
        if (options.image !== false) {
            // 根据图片来源获取图片 URL
            const imgUrl = options.imageSource === 'channel' ? getChannelImageUrl(item, downloadWidth) : getImageUrl(item, downloadWidth);
            let imageClass = isLargeStyle ? 'listItemImage listItemImage-large' : 'listItemImage';

            // 频道图片添加特定样式
            if (options.imageSource === 'channel') {
                imageClass += ' listItemImage-channel';
            }

            // TV 模式下的大图样式
            if (isLargeStyle && layoutManager.tv) {
                imageClass += ' listItemImage-large-tv';
            }

            // 是否在图片上显示播放按钮
            const playOnImageClick = options.imagePlayButton && !layoutManager.tv;

            // 非全项点击模式下，图片可单独点击
            if (!clickEntireItem) {
                imageClass += ' itemAction';
            }

            // 确定图片的点击动作
            const imageAction = playOnImageClick ? 'link' : action;

            // 如果有图片 URL，显示图片
            if (imgUrl) {
                html += '<div data-action="' + imageAction + '" class="' + imageClass + ' lazy" data-src="' + imgUrl + '" item-icon>';
            } else {
                // 没有图片，显示默认背景和文本
                html += '<div class="' + imageClass + ' cardImageContainer ' + getDefaultBackgroundClass(item.Name) + '">' + cardBuilder.getDefaultText(item, options);
            }

            // 媒体源数量指示器（如果有多个源）
            const mediaSourceCount = item.MediaSourceCount || 1;
            if (mediaSourceCount > 1 && options.disableIndicators !== true) {
                html += '<div class="mediaSourceIndicator">' + mediaSourceCount + '</div>';
            }

            // 生成播放状态指示器 HTML
            let indicatorsHtml = '';
            indicatorsHtml += indicators.getPlayedIndicatorHtml(item);

            // 添加指示器到图片
            if (indicatorsHtml) {
                html += `<div class="indicators listItemIndicators">${indicatorsHtml}</div>`;
            }

            // 在图片上显示播放按钮
            if (playOnImageClick) {
                html += '<button is="paper-icon-button-light" class="listItemImageButton itemAction" data-action="resume"><span class="material-icons listItemImageButton-icon play_arrow" aria-hidden="true"></span></button>';
            }

            // 生成进度条 HTML
            const progressHtml = indicators.getProgressBarHtml(item, {
                containerClass: 'listItemProgressBar'
            });

            // 添加进度条
            if (progressHtml) {
                html += progressHtml;
            }
            html += '</div>';
        }

        // 显示左侧索引号
        if (options.showIndexNumberLeft) {
            html += '<div class="listItem-indexnumberleft">';
            html += (item.IndexNumber || '&nbsp;');
            html += '</div>';
        }

        // 准备文本行数组
        const textlines = [];

        // 显示节目的日期时间
        if (options.showProgramDateTime) {
            textlines.push(datetime.toLocaleString(datetime.parseISO8601Date(item.StartDate), {

                weekday: 'long',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
            }));
        }

        // 显示节目时间
        if (options.showProgramTime) {
            textlines.push(datetime.getDisplayTime(datetime.parseISO8601Date(item.StartDate)));
        }

        // 显示频道名称
        if (options.showChannel && item.ChannelName) {
            textlines.push(item.ChannelName);
        }

        // 处理父项标题（如剧集名称）
        let parentTitle = null;

        if (options.showParentTitle) {
            if (item.Type === 'Episode') {
                // 剧集显示剧名
                parentTitle = item.SeriesName;
            } else if (item.IsSeries || (item.EpisodeTitle && item.Name)) {
                parentTitle = item.Name;
            }
        }

        // 获取项目的显示名称
        let displayName = itemHelper.getDisplayName(item, {
            includeParentInfo: options.includeParentInfoInTitle
        });

        // 如果显示索引号，将其添加到显示名称前
        if (options.showIndexNumber && item.IndexNumber != null) {
            displayName = `${item.IndexNumber}. ${displayName}`;
        }

        // 处理标题和父标题的组合显示
        if (options.showParentTitle && options.parentTitleWithTitle) {
            if (displayName) {
                if (parentTitle) {
                    parentTitle += ' - ';
                }
                parentTitle = (parentTitle || '') + displayName;
            }

            textlines.push(parentTitle || '');
        } else if (options.showParentTitle) {
            textlines.push(parentTitle || '');
        }

        if (displayName && !options.parentTitleWithTitle) {
            textlines.push(displayName);
        }

        // 处理艺术家信息显示
        if (item.IsFolder) {
            // 如果是文件夹（如专辑），显示专辑艺术家
            if (options.artist !== false && item.AlbumArtist && item.Type === 'MusicAlbum') {
                textlines.push(item.AlbumArtist);
            }
        } else if (options.artist) {
            // 显示项目的艺术家列表
            const artistItems = item.ArtistItems;
            if (artistItems && item.Type !== 'MusicAlbum') {
                textlines.push(artistItems.map(a => {
                    return a.Name;
                }).join(', '));
            }
        }

        // 如果是电视频道且有当前节目，显示当前节目名
        if (item.Type === 'TvChannel' && item.CurrentProgram) {
            textlines.push(itemHelper.getDisplayName(item.CurrentProgram));
        }

        // 构建列表项主体的 CSS 类名
        cssClass = 'listItemBody';
        if (!clickEntireItem) {
            cssClass += ' itemAction';
        }

        // 如果不显示图片，移除左内边距
        if (options.image === false) {
            cssClass += ' listItemBody-noleftpadding';
        }

        html += `<div class="${cssClass}">`;

        // 添加文本行 HTML
        html += getTextLinesHtml(textlines, isLargeStyle);

        // 添加主要媒体信息（内联样式）
        if (options.mediaInfo !== false && !enableSideMediaInfo) {
            const mediaInfoClass = 'secondary listItemMediaInfo listItemBodyText';

            html += `<div class="${mediaInfoClass}">`;
            html += mediaInfo.getPrimaryMediaInfoHtml(item, {
                episodeTitle: false,
                originalAirDate: false,
                subtitles: false

            });
            html += '</div>';
        }

        // 添加项目概述（支持 Markdown）
        if (enableOverview && item.Overview) {
            // 使用 Markdown 渲染并清理 HTML
            const overview = DOMPurify.sanitize(markdownIt({ html: true }).render(item.Overview || ''));
            html += '<div class="secondary listItem-overview listItemBodyText">';
            html += '<bdi>' + overview + '</bdi>';
            html += '</div>';
        }

        html += '</div>';

        // 添加侧边媒体信息
        if (options.mediaInfo !== false && enableSideMediaInfo) {
            html += '<div class="secondary listItemMediaInfo">';
            html += mediaInfo.getPrimaryMediaInfoHtml(item, {

                year: false,
                container: false,
                episodeTitle: false,
                criticRating: false,
                officialRating: false,
                endsAt: false

            });
            html += '</div>';
        }

        // 添加定时器或节目的录制指示器
        if (!options.recordButton && (item.Type === 'Timer' || item.Type === 'Program')) {
            html += indicators.getTimerIndicator(item).replace('indicatorIcon', 'indicatorIcon listItemAside');
        }

        // 添加用户数据按钮容器
        html += '<div class="listViewUserDataButtons">';

        if (!clickEntireItem) {
            // 添加到播放列表按钮
            if (options.addToListButton) {
                html += '<button is="paper-icon-button-light" class="listItemButton itemAction" data-action="addtoplaylist"><span class="material-icons playlist_add" aria-hidden="true"></span></button>';
            }

            // 信息按钮
            if (options.infoButton) {
                html += '<button is="paper-icon-button-light" class="listItemButton itemAction" data-action="link"><span class="material-icons info_outline" aria-hidden="true"></span></button>';
            }

            // 自定义右侧按钮
            if (options.rightButtons) {
                html += getRightButtonsHtml(options);
            }

            // 启用用户数据按钮（已播、喜爱等）
            if (options.enableUserDataButtons !== false) {
                const userData = item.UserData || {};
                const likes = userData.Likes == null ? '' : userData.Likes;

                // 播放状态按钮（标记为已播/未播）
                if (itemHelper.canMarkPlayed(item) && options.enablePlayedButton !== false) {
                    html += '<button is="emby-playstatebutton" type="button" class="listItemButton paper-icon-button-light" data-id="' + item.Id + '" data-serverid="' + item.ServerId + '" data-itemtype="' + item.Type + '" data-played="' + (userData.Played) + '"><span class="material-icons check" aria-hidden="true"></span></button>';
                }

                // 评分/喜爱按钮
                if (itemHelper.canRate(item) && options.enableRatingButton !== false) {
                    html += '<button is="emby-ratingbutton" type="button" class="listItemButton paper-icon-button-light" data-id="' + item.Id + '" data-serverid="' + item.ServerId + '" data-itemtype="' + item.Type + '" data-likes="' + likes + '" data-isfavorite="' + (userData.IsFavorite) + '"><span class="material-icons favorite" aria-hidden="true"></span></button>';
                }
            }

            // 更多菜单按钮
            if (options.moreButton !== false) {
                html += '<button is="paper-icon-button-light" class="listItemButton itemAction" data-action="menu"><span class="material-icons more_vert" aria-hidden="true"></span></button>';
            }
        }
        html += '</div>';

        // 结束内容包装器
        if (enableContentWrapper) {
            html += '</div>';

            // 在底部显示概述
            if (enableOverview && item.Overview) {
                html += '<div class="listItem-bottomoverview secondary">';
                html += '<bdi>' + item.Overview + '</bdi>';
                html += '</div>';
            }
        }

        // 结束外层元素
        html += `</${outerTagName}>`;

        // 将生成的 HTML 添加到总 HTML 中
        outerHtml += html;
    }

    // 返回所有生成的 HTML
    return outerHtml;
}

// 导出模块
export default {
    getListViewHtml: getListViewHtml
};
