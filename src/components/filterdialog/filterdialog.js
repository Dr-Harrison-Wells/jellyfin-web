import dom from '../../scripts/dom';
import dialogHelper from '../dialogHelper/dialogHelper';
import globalize from '../../lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import union from 'lodash-es/union';
import Events from '../../utils/events.ts';
import '../../elements/emby-checkbox/emby-checkbox';
import '../../elements/emby-collapse/emby-collapse';
import './style.scss';
import template from './filterdialog.template.html';
import { stopMultiSelect } from '../../components/multiSelect/multiSelect';

// 将“动态返回的可选项(resultItems)”与“当前查询里已选项(queryItems)”合并。
// - queryItems 通常是用 delimiter 拼接的字符串（例如 Genres 用 '|'，Years 用 ','）
// - 最终返回去重后的数组，并按字母序排序用于渲染
function merge(resultItems, queryItems, delimiter) {
    if (!queryItems) {
        return resultItems;
    }
    // eslint-disable-next-line sonarjs/no-alphabetical-sort
    return union(resultItems, queryItems.split(delimiter)).sort();
}

// 根据给定 items 渲染一组复选框，并根据 isCheckedFn 决定默认选中状态。
// selector: 容器选择器（例如 '.genreFilters'）
// cssClass: checkbox 标记类名（用于事件委托定位）
function renderOptions(context, selector, cssClass, items, isCheckedFn) {
    const elem = context.querySelector(selector);
    if (items.length) {
        elem.classList.remove('hide');
    } else {
        elem.classList.add('hide');
    }
    let html = '';
    html += '<div class="checkboxList">';
    html += items.map(function (filter) {
        let itemHtml = '';
        const checkedHtml = isCheckedFn(filter) ? 'checked' : '';
        itemHtml += '<label>';
        itemHtml += `<input is="emby-checkbox" type="checkbox" ${checkedHtml} data-filter="${filter}" class="${cssClass}"/>`;
        itemHtml += `<span>${filter}</span>`;
        itemHtml += '</label>';
        return itemHtml;
    }).join('');
    html += '</div>';
    elem.querySelector('.filterOptions').innerHTML = html;
}

// 按不同维度（类型/评级/标签/年份）渲染动态筛选项。
// 注意：Genres/Tags/OfficialRatings 使用 '|' 分隔；Years 使用 ',' 分隔。
function renderFilters(context, result, query) {
    renderOptions(context, '.genreFilters', 'chkGenreFilter', merge(result.Genres, query.Genres, '|'), function (i) {
        const delimeter = '|';
        return (delimeter + (query.Genres || '') + delimeter).includes(delimeter + i + delimeter);
    });
    renderOptions(context, '.officialRatingFilters', 'chkOfficialRatingFilter', merge(result.OfficialRatings, query.OfficialRatings, '|'), function (i) {
        const delimeter = '|';
        return (delimeter + (query.OfficialRatings || '') + delimeter).includes(delimeter + i + delimeter);
    });
    renderOptions(context, '.tagFilters', 'chkTagFilter', merge(result.Tags, query.Tags, '|'), function (i) {
        const delimeter = '|';
        return (delimeter + (query.Tags || '') + delimeter).includes(delimeter + i + delimeter);
    });
    renderOptions(context, '.yearFilters', 'chkYearFilter', merge(result.Years, query.Years, ','), function (i) {
        const delimeter = ',';
        return (delimeter + (query.Years || '') + delimeter).includes(delimeter + i + delimeter);
    });
}

// 从服务端拉取“可用筛选项”（不同库/类型会不同），再根据当前 query 渲染。
function loadDynamicFilters(context, apiClient, userId, itemQuery) {
    return apiClient.getJSON(apiClient.getUrl('Items/Filters', {
        UserId: userId,
        ParentId: itemQuery.ParentId,
        IncludeItemTypes: itemQuery.IncludeItemTypes
    })).then(function (result) {
        renderFilters(context, result, itemQuery);
    });
}

/**
     * @param context {HTMLDivElement} Dialog
     * @param options {any} Options
     */
function updateFilterControls(context, options) {
    const query = options.query;

    // 先把“query 当前状态”映射到 UI：初始化各 checkbox 的 checked。
    if (options.mode === 'livetvchannels') {
        context.querySelector('.chkFavorite').checked = query.IsFavorite === true;
    } else {
        for (const elem of context.querySelectorAll('.chkStandardFilter')) {
            const filters = `,${query.Filters || ''}`;
            const filterName = elem.getAttribute('data-filter');
            elem.checked = filters.includes(`,${filterName}`);
        }
    }

    for (const elem of context.querySelectorAll('.chkVideoTypeFilter')) {
        const filters = `,${query.VideoTypes || ''}`;
        const filterName = elem.getAttribute('data-filter');
        elem.checked = filters.includes(`,${filterName}`);
    }
    context.querySelector('.chk3DFilter').checked = query.Is3D === true;
    context.querySelector('.chkHDFilter').checked = query.IsHD === true;
    context.querySelector('.chk4KFilter').checked = query.Is4K === true;
    context.querySelector('.chkSDFilter').checked = query.IsHD === false;
    context.querySelector('#chkSubtitle').checked = query.HasSubtitles === true;
    context.querySelector('#chkTrailer').checked = query.HasTrailer === true;
    context.querySelector('#chkThemeSong').checked = query.HasThemeSong === true;
    context.querySelector('#chkThemeVideo').checked = query.HasThemeVideo === true;
    context.querySelector('#chkSpecialFeature').checked = query.HasSpecialFeature === true;
    context.querySelector('#chkSpecialEpisode').checked = query.ParentIndexNumber === 0;
    context.querySelector('#chkMissingEpisode').checked = query.IsMissing === true;
    context.querySelector('#chkFutureEpisode').checked = query.IsUnaired === true;
    for (const elem of context.querySelectorAll('.chkStatus')) {
        const filters = `,${query.SeriesStatus || ''}`;
        const filterName = elem.getAttribute('data-filter');
        elem.checked = filters.includes(`,${filterName}`);
    }
}

/**
     * @param instance {FilterDialog} An instance of FilterDialog
     */
function triggerChange(instance) {
    // 变更筛选时结束多选模式，避免 UI/手势冲突。
    stopMultiSelect();
    // 对外抛出 filterchange 事件，由调用方刷新列表。
    Events.trigger(instance, 'filterchange');
}

function setVisibility(context, options) {
    // 不同“列表模式”支持的筛选项不同，这里负责控制区域显示/隐藏。
    if (options.mode === 'livetvchannels' || options.mode === 'albums' || options.mode === 'artists' || options.mode === 'albumartists' || options.mode === 'songs') {
        hideByClass(context, 'videoStandard');
    }

    if (enableDynamicFilters(options.mode)) {
        // 动态筛选：Genres/Tags/OfficialRatings/Years 由服务端返回。
        context.querySelector('.genreFilters').classList.remove('hide');
        context.querySelector('.officialRatingFilters').classList.remove('hide');
        context.querySelector('.tagFilters').classList.remove('hide');
        context.querySelector('.yearFilters').classList.remove('hide');
    }

    if (options.mode === 'movies' || options.mode === 'episodes') {
        context.querySelector('.videoTypeFilters').classList.remove('hide');
    }

    if (options.mode === 'movies' || options.mode === 'series' || options.mode === 'episodes') {
        context.querySelector('.features').classList.remove('hide');
    }

    if (options.mode === 'series') {
        context.querySelector('.seriesStatus').classList.remove('hide');
    }

    if (options.mode === 'episodes') {
        showByClass(context, 'episodeFilter');
    }
}

function showByClass(context, className) {
    // 批量显示某一类区域
    for (const elem of context.querySelectorAll(`.${className}`)) {
        elem.classList.remove('hide');
    }
}

function hideByClass(context, className) {
    // 批量隐藏某一类区域
    for (const elem of context.querySelectorAll(`.${className}`)) {
        elem.classList.add('hide');
    }
}

function enableDynamicFilters(mode) {
    // 这些模式会调用 Items/Filters 动态获取筛选项。
    return mode === 'movies' || mode === 'series' || mode === 'albums' || mode === 'albumartists' || mode === 'artists' || mode === 'songs' || mode === 'episodes';
}

class FilterDialog {
    constructor(options) {
        /**
             * @private
             */
        // options.query 会被本对话框就地修改（回写筛选条件）。
        this.options = options;
    }

    /**
         * @private
         */
    onFavoriteChange(elem) {
        const query = this.options.query;
        // 任何筛选变更都回到第一页
        query.StartIndex = 0;
        // 这里用 null 表示“未限制/不筛选”
        query.IsFavorite = !!elem.checked || null;
        triggerChange(this);
    }

    /**
         * @private
         */
    onStandardFilterChange(elem) {
        const query = this.options.query;
        const filterName = elem.getAttribute('data-filter');
        let filters = query.Filters || '';

        // Filters 是逗号分隔字符串：先删除旧值，再视情况追加。
        filters = (`,${filters}`).replace(`,${filterName}`, '').substring(1);

        if (elem.checked) {
            filters = filters ? `${filters},${filterName}` : filterName;
        }

        query.StartIndex = 0;
        query.Filters = filters;
        triggerChange(this);
    }

    /**
         * @private
         */
    onVideoTypeFilterChange(elem) {
        const query = this.options.query;
        const filterName = elem.getAttribute('data-filter');
        let filters = query.VideoTypes || '';

        // VideoTypes 同样是逗号分隔字符串
        filters = (`,${filters}`).replace(`,${filterName}`, '').substring(1);

        if (elem.checked) {
            filters = filters ? `${filters},${filterName}` : filterName;
        }

        query.StartIndex = 0;
        query.VideoTypes = filters;
        triggerChange(this);
    }

    /**
         * @private
         */
    onStatusChange(elem) {
        const query = this.options.query;
        const filterName = elem.getAttribute('data-filter');
        let filters = query.SeriesStatus || '';

        // SeriesStatus 为逗号分隔字符串
        filters = (`,${filters}`).replace(`,${filterName}`, '').substring(1);

        if (elem.checked) {
            filters = filters ? `${filters},${filterName}` : filterName;
        }

        query.SeriesStatus = filters;
        query.StartIndex = 0;
        triggerChange(this);
    }

    /**
         * @param context {HTMLDivElement} The dialog
         */
    bindEvents(context) {
        const query = this.options.query;

        // 绑定“标准筛选/收藏”事件（不同模式略有区别）
        if (this.options.mode === 'livetvchannels') {
            for (const elem of context.querySelectorAll('.chkFavorite')) {
                elem.addEventListener('change', () => this.onFavoriteChange(elem));
            }
        } else {
            for (const elem of context.querySelectorAll('.chkStandardFilter')) {
                elem.addEventListener('change', () => this.onStandardFilterChange(elem));
            }
        }

        // 视频类型筛选（Movies/Episodes）
        for (const elem of context.querySelectorAll('.chkVideoTypeFilter')) {
            elem.addEventListener('change', () => this.onVideoTypeFilterChange(elem));
        }

        // 画质/格式相关筛选（3D/4K/HD/SD），会互相排斥（HD 与 SD）
        const chk3DFilter = context.querySelector('.chk3DFilter');
        chk3DFilter.addEventListener('change', () => {
            query.StartIndex = 0;
            query.Is3D = chk3DFilter.checked ? true : null;
            triggerChange(this);
        });
        const chk4KFilter = context.querySelector('.chk4KFilter');
        chk4KFilter.addEventListener('change', () => {
            query.StartIndex = 0;
            query.Is4K = chk4KFilter.checked ? true : null;
            triggerChange(this);
        });
        const chkHDFilter = context.querySelector('.chkHDFilter');
        const chkSDFilter = context.querySelector('.chkSDFilter');
        chkHDFilter.addEventListener('change', () => {
            query.StartIndex = 0;
            if (chkHDFilter.checked) {
                chkSDFilter.checked = false;
                query.IsHD = true;
            } else {
                query.IsHD = null;
            }
            triggerChange(this);
        });
        chkSDFilter.addEventListener('change', () => {
            query.StartIndex = 0;
            if (chkSDFilter.checked) {
                chkHDFilter.checked = false;
                query.IsHD = false;
            } else {
                query.IsHD = null;
            }
            triggerChange(this);
        });

        // 剧集状态筛选（Continuing/Ended 等）
        for (const elem of context.querySelectorAll('.chkStatus')) {
            elem.addEventListener('change', () => this.onStatusChange(elem));
        }

        // 其他特性筛选：预告片/主题曲/主题视频/花絮/字幕/缺失/特别篇/未来集
        const chkTrailer = context.querySelector('#chkTrailer');
        chkTrailer.addEventListener('change', () => {
            query.StartIndex = 0;
            query.HasTrailer = chkTrailer.checked ? true : null;
            triggerChange(this);
        });
        const chkThemeSong = context.querySelector('#chkThemeSong');
        chkThemeSong.addEventListener('change', () => {
            query.StartIndex = 0;
            query.HasThemeSong = chkThemeSong.checked ? true : null;
            triggerChange(this);
        });
        const chkSpecialFeature = context.querySelector('#chkSpecialFeature');
        chkSpecialFeature.addEventListener('change', () => {
            query.StartIndex = 0;
            query.HasSpecialFeature = chkSpecialFeature.checked ? true : null;
            triggerChange(this);
        });
        const chkThemeVideo = context.querySelector('#chkThemeVideo');
        chkThemeVideo.addEventListener('change', () => {
            query.StartIndex = 0;
            query.HasThemeVideo = chkThemeVideo.checked ? true : null;
            triggerChange(this);
        });
        const chkMissingEpisode = context.querySelector('#chkMissingEpisode');
        chkMissingEpisode.addEventListener('change', () => {
            query.StartIndex = 0;
            query.IsMissing = !!chkMissingEpisode.checked;
            triggerChange(this);
        });
        const chkSpecialEpisode = context.querySelector('#chkSpecialEpisode');
        chkSpecialEpisode.addEventListener('change', () => {
            query.StartIndex = 0;
            query.ParentIndexNumber = chkSpecialEpisode.checked ? 0 : null;
            triggerChange(this);
        });
        const chkFutureEpisode = context.querySelector('#chkFutureEpisode');
        chkFutureEpisode.addEventListener('change', () => {
            query.StartIndex = 0;
            // FutureEpisode 勾选：只看未播出；取消：回到“不过滤未播出”，并显式排除虚拟未播出。
            if (chkFutureEpisode.checked) {
                query.IsUnaired = true;
                query.IsVirtualUnaired = null;
            } else {
                query.IsUnaired = null;
                query.IsVirtualUnaired = false;
            }
            triggerChange(this);
        });
        const chkSubtitle = context.querySelector('#chkSubtitle');
        chkSubtitle.addEventListener('change', () => {
            query.StartIndex = 0;
            query.HasSubtitles = chkSubtitle.checked ? true : null;
            triggerChange(this);
        });

        // 动态筛选项使用事件委托：Genres/Tags/Years/OfficialRatings
        context.addEventListener('change', (e) => {
            const chkGenreFilter = dom.parentWithClass(e.target, 'chkGenreFilter');
            if (chkGenreFilter) {
                const filterName = chkGenreFilter.getAttribute('data-filter');
                let filters = query.Genres || '';
                const delimiter = '|';
                filters = filters
                    .split(delimiter)
                    .filter((f) => f !== filterName)
                    .join(delimiter);;
                if (chkGenreFilter.checked) {
                    filters = filters ? (filters + delimiter + filterName) : filterName;
                }
                query.StartIndex = 0;
                query.Genres = filters;
                triggerChange(this);
                return;
            }
            const chkTagFilter = dom.parentWithClass(e.target, 'chkTagFilter');
            if (chkTagFilter) {
                const filterName = chkTagFilter.getAttribute('data-filter');
                let filters = query.Tags || '';
                const delimiter = '|';
                filters = filters
                    .split(delimiter)
                    .filter((f) => f !== filterName)
                    .join(delimiter);;
                if (chkTagFilter.checked) {
                    filters = filters ? (filters + delimiter + filterName) : filterName;
                }
                query.StartIndex = 0;
                query.Tags = filters;
                triggerChange(this);
                return;
            }
            const chkYearFilter = dom.parentWithClass(e.target, 'chkYearFilter');
            if (chkYearFilter) {
                const filterName = chkYearFilter.getAttribute('data-filter');
                let filters = query.Years || '';
                const delimiter = ',';
                filters = filters
                    .split(delimiter)
                    .filter((f) => f !== filterName)
                    .join(delimiter);;
                if (chkYearFilter.checked) {
                    filters = filters ? (filters + delimiter + filterName) : filterName;
                }
                query.StartIndex = 0;
                query.Years = filters;
                triggerChange(this);
                return;
            }
            const chkOfficialRatingFilter = dom.parentWithClass(e.target, 'chkOfficialRatingFilter');
            if (chkOfficialRatingFilter) {
                const filterName = chkOfficialRatingFilter.getAttribute('data-filter');
                let filters = query.OfficialRatings || '';
                const delimiter = '|';
                filters = filters
                    .split(delimiter)
                    .filter((f) => f !== filterName)
                    .join(delimiter);
                if (chkOfficialRatingFilter.checked) {
                    filters = filters ? (filters + delimiter + filterName) : filterName;
                }
                query.StartIndex = 0;
                query.OfficialRatings = filters;
                triggerChange(this);
            }
        });
    }

    show() {
        return new Promise((resolve) => {
            // 创建并打开对话框（非模态，关闭时自动移除 DOM）
            const dlg = dialogHelper.createDialog({
                removeOnClose: true,
                modal: false
            });
            dlg.classList.add('ui-body-a');
            dlg.classList.add('background-theme-a');
            dlg.classList.add('formDialog');
            dlg.classList.add('filterDialog');
            dlg.innerHTML = globalize.translateHtml(template);

            // 根据 mode 调整可见区域，再初始化控件状态并绑定事件
            setVisibility(dlg, this.options);
            dialogHelper.open(dlg);
            dlg.addEventListener('close', resolve);
            updateFilterControls(dlg, this.options);
            this.bindEvents(dlg);

            // 如果支持动态筛选，则额外请求服务端过滤维度并渲染
            if (enableDynamicFilters(this.options.mode)) {
                dlg.classList.add('dynamicFilterDialog');
                const apiClient = ServerConnections.getApiClient(this.options.serverId);
                loadDynamicFilters(dlg, apiClient, apiClient.getCurrentUserId(), this.options.query);
            }
        });
    }
}

export default FilterDialog;
