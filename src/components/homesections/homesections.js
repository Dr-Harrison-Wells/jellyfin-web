import layoutManager from 'components/layoutManager';
import { getUserViewsQuery } from 'hooks/useUserViews';
import globalize from 'lib/globalize';
import { DEFAULT_SECTIONS, HomeSectionType } from 'types/homeSectionType';
import Dashboard from 'utils/dashboard';
import { toApi } from 'utils/jellyfin-apiclient/compat';
import { queryClient } from 'utils/query/queryClient';

import { loadRecordings } from './sections/activeRecordings';
import { loadLibraryButtons } from './sections/libraryButtons';
import { loadLibraryTiles } from './sections/libraryTiles';
import { loadLiveTV } from './sections/liveTv';
import { loadNextUp } from './sections/nextUp';
import { loadRecentlyAdded } from './sections/recentlyAdded';
import { loadResume } from './sections/resume';

import 'elements/emby-button/paper-icon-button-light';
import 'elements/emby-itemscontainer/emby-itemscontainer';
import 'elements/emby-scroller/emby-scroller';
import 'elements/emby-button/emby-button';

import './homesections.scss';

// 获取某个索引对应的默认首页分区类型。
// index 越界时返回空字符串（表示不展示/无效）。
export function getDefaultSection(index) {
    if (index < 0 || index > DEFAULT_SECTIONS.length) return '';
    return DEFAULT_SECTIONS[index];
}

// 依据用户设置（userSettings）与最大分区数量，计算最终要展示的分区列表。
// 其中包含 TV 布局的兜底逻辑：确保“媒体库入口”一定可见。
function getAllSectionsToShow(userSettings, sectionCount) {
    const sections = [];
    for (let i = 0, length = sectionCount; i < length; i++) {
        // 优先使用用户自定义分区；没有则回落到默认分区。
        let section = userSettings.get('homesection' + i) || getDefaultSection(i);
        if (section === 'folders') {
            // 兼容旧设置：folders 已废弃/不再作为首页分区，回落到第一个默认分区。
            section = getDefaultSection(0);
        }

        sections.push(section);
    }

    // TV 布局下确保“媒体库入口”可见：如果用户没有配置 SmallLibraryTiles / LibraryButtons，
    // 则在最前面强制插入一个 SmallLibraryTiles 分区。
    if (
        layoutManager.tv
            && !sections.includes(HomeSectionType.SmallLibraryTiles)
            && !sections.includes(HomeSectionType.LibraryButtons)
    ) {
        return [
            HomeSectionType.SmallLibraryTiles,
            ...sections
        ];
    }

    return sections;
}

// 构建并加载首页各分区内容：
// 1) 拉取用户可见的媒体库视图（userViews）
// 2) 按分区配置创建容器节点
// 3) 并行加载各分区数据/渲染
export function loadSections(elem, apiClient, user, userSettings) {
    // user.Id 在某些场景可能不存在，回退到当前登录用户。
    const userId = user.Id || apiClient.getCurrentUserId();
    return queryClient
        .fetchQuery(getUserViewsQuery(toApi(apiClient), userId))
        .then(result => result.Items || [])
        .then(function (userViews) {
            let html = '';

            if (userViews.length) {
                // 用户可见视图存在：渲染最多 10 个分区。
                const userSectionCount = 10;
                // TV 布局可能需要额外占位分区（由 getAllSectionsToShow 兜底插入），
                // 所以这里容器数量会 +1。
                const totalSectionCount = layoutManager.tv ? userSectionCount + 1 : userSectionCount;
                for (let i = 0; i < totalSectionCount; i++) {
                    html += '<div class="verticalSection section' + i + '"></div>';
                }

                elem.innerHTML = html;
                elem.classList.add('homeSectionsContainer');

                const promises = [];
                // 注意：sections 的长度在 TV 布局下可能是 userSectionCount + 1。
                const sections = getAllSectionsToShow(userSettings, userSectionCount);
                for (let i = 0; i < sections.length; i++) {
                    promises.push(loadSection(elem, apiClient, user, userSettings, userViews, sections, i));
                }

                return Promise.all(promises)
                // 为 polyfilled CustomElements（例如 webOS 1.2）留出一个事件循环，
                // 避免自定义元素尚未完成升级导致后续调用异常。
                    .then(() => new Promise((resolve) => setTimeout(resolve, 0)))
                    .then(() => {
                        return resume(elem, {
                            refresh: true
                        });
                    });
            } else {
                // 用户没有任何可见媒体库：展示空态提示。
                let noLibDescription;
                if (user.Policy?.IsAdministrator) {
                    // 管理员：提供创建媒体库的入口。
                    noLibDescription = globalize.translate('NoCreatedLibraries', '<br><a id="button-createLibrary" class="button-link">', '</a>');
                } else {
                    // 非管理员：提示联系管理员创建媒体库。
                    noLibDescription = globalize.translate('AskAdminToCreateLibrary');
                }

                html += '<div class="centerMessage padded-left padded-right">';
                html += '<h2>' + globalize.translate('MessageNothingHere') + '</h2>';
                html += '<p>' + noLibDescription + '</p>';
                html += '</div>';
                elem.innerHTML = html;

                const createNowLink = elem.querySelector('#button-createLibrary');
                if (createNowLink) {
                    createNowLink.addEventListener('click', function () {
                        // 进入仪表盘的媒体库管理页面。
                        Dashboard.navigate('dashboard/libraries');
                    });
                }
            }
        });
}

// 销毁首页分区：清空 DOM，并解除 itemsContainer 上可能持有的引用，帮助 GC。
export function destroySections(elem) {
    const elems = elem.querySelectorAll('.itemsContainer');
    for (const e of elems) {
        e.fetchData = null;
        e.parentContainer = null;
        e.getItemsHtml = null;
    }

    elem.innerHTML = '';
}

// 暂停所有分区（通常用于页面切换/后台时停止刷新或媒体相关行为）。
export function pause(elem) {
    const elems = elem.querySelectorAll('.itemsContainer');
    for (const e of elems) {
        e.pause();
    }
}

// 恢复所有分区（可传入 options 控制是否刷新等）。
export function resume(elem, options) {
    const elems = elem.querySelectorAll('.itemsContainer');
    const promises = [];

    Array.prototype.forEach.call(elems, section => {
        if (section.resume) {
            promises.push(section.resume(options));
        }
    });

    return Promise.all(promises);
}

// 根据分区类型加载对应模块。
// 某些分区会返回 Promise（例如需要异步拉取数据），其余分区同步渲染后返回 resolved Promise。
function loadSection(page, apiClient, user, userSettings, userViews, allSections, index) {
    const section = allSections[index];
    const elem = page.querySelector('.section' + index);
    // enableOverflow 决定是否允许横向滚动（由 itemsContainer 相关组件使用）。
    const options = { enableOverflow: enableScrollX() };

    switch (section) {
        case HomeSectionType.ActiveRecordings:
            loadRecordings(elem, true, apiClient, options);
            break;
        case HomeSectionType.LatestMedia:
            loadRecentlyAdded(elem, apiClient, user, userViews, options);
            break;
        case HomeSectionType.LibraryButtons:
            loadLibraryButtons(elem, userViews);
            break;
        case HomeSectionType.LiveTv:
            return loadLiveTV(elem, apiClient, user, options);
        case HomeSectionType.NextUp:
            loadNextUp(elem, apiClient, userSettings, options);
            break;
        case HomeSectionType.Resume:
            return loadResume(elem, apiClient, 'HeaderContinueWatching', 'Video', userSettings, options);
        case HomeSectionType.ResumeAudio:
            return loadResume(elem, apiClient, 'HeaderContinueListening', 'Audio', userSettings, options);
        case HomeSectionType.ResumeBook:
            return loadResume(elem, apiClient, 'HeaderContinueReading', 'Book', userSettings, options);
        case HomeSectionType.SmallLibraryTiles:
            loadLibraryTiles(elem, userViews, options);
            break;
        default:
            // 未识别的分区类型：清空该分区容器，避免残留内容。
            elem.innerHTML = '';
    }

    return Promise.resolve();
}

// 是否启用横向滚动（目前始终开启；保留为函数便于将来按条件调整）。
function enableScrollX() {
    return true;
}

export default {
    getDefaultSection,
    loadSections,
    destroySections,
    pause,
    resume
};

