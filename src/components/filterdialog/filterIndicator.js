import './filterIndicator.scss';

// 判断当前查询条件是否“启用了筛选”。
// 这里的策略是：只要 query 上任意一个筛选相关字段存在/为真，就认为当前处于筛选状态。
function getFilterStatus(query) {
    return Boolean(
        query.Filters
            || query.IsFavorite
            || query.VideoTypes
            || query.SeriesStatus
            || query.Is4K
            // IsHD 可能是 false（明确筛选“非高清”），因此要用 undefined/null 判断是否“被设置过”
            || (query.IsHD !== undefined && query.IsHD !== null)
            || query.IsSD
            || query.Is3D
            || query.HasSubtitles
            || query.HasTrailer
            || query.HasSpecialFeature
            || query.HasThemeSong
            || query.HasThemeVideo
            || query.IsMissing
            || query.ParentIndexNumber
            || query.Genres
            || query.Tags
            || query.Years
            || query.OfficialRatings
            || query.IsUnaired
    );
}

// 根据 query 的筛选状态，在页面的筛选按钮区域显示/隐藏一个提示指示器（感叹号）。
export function setFilterStatus(page, query) {
    const hasFilters = getFilterStatus(query);

    // 筛选按钮的包裹容器（用于定位插入指示器的位置）
    const btnFilterWrapper = page.querySelector('.btnFilter-wrapper');

    if (btnFilterWrapper) {
        // 指示器元素：存在时会根据 hasFilters 切换 hide
        let indicatorElem = btnFilterWrapper.querySelector('.filterIndicator');

        // 只有当“需要显示筛选状态”且指示器尚不存在时才创建，避免重复插入
        if (!indicatorElem && hasFilters) {
            btnFilterWrapper.insertAdjacentHTML(
                'afterbegin',
                '<div class="filterIndicator">!</div>'
            );
            // 额外的 class 用于让按钮在有指示器时应用相应样式
            btnFilterWrapper.classList.add('btnFilterWithIndicator');
            indicatorElem = btnFilterWrapper.querySelector('.filterIndicator');
        }

        if (indicatorElem) {
            // 有筛选：显示；无筛选：隐藏（通过 CSS 类控制）
            indicatorElem.classList.toggle('hide', !hasFilters);
        }
    }
}
