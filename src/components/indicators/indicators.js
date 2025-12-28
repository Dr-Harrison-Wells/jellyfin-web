/**
 * 指示器组件
 * 用于显示各种媒体项的状态指示器，如播放进度、播放标记、计数器等
 */

import datetime from '../../scripts/datetime';
import itemHelper from '../itemHelper';
import '../../elements/emby-progressbar/emby-progressbar';
import './indicators.scss';
import 'material-design-icons-iconfont';

/**
 * 判断是否启用进度指示器
 * @param {Object} item - 媒体项对象
 * @returns {boolean} 是否应该显示进度指示器
 */
export function enableProgressIndicator(item) {
    // 视频类型（非电视频道）、有声读物、播客支持进度指示器
    return (item.MediaType === 'Video' && item.Type !== 'TvChannel')
        || item.Type === 'AudioBook'
        || item.Type === 'AudioPodcast';
}

/**
 * 生成进度条 HTML
 * @param {number} pct - 进度百分比
 * @param {Object} options - 可选配置项
 * @param {string} options.containerClass - 自定义容器类名
 * @returns {string} 进度条的 HTML 字符串
 */
export function getProgressHtml(pct, options) {
    let containerClass = 'itemProgressBar';
    if (options?.containerClass) {
        containerClass += ' ' + options.containerClass;
    }

    return '<div class="' + containerClass + '"><div class="itemProgressBarForeground" style="width:' + pct + '%;"></div></div>';
}

/**
 * 生成基于时间自动更新的进度条 HTML
 * @param {number} pct - 当前进度百分比
 * @param {Object} options - 可选配置项
 * @param {boolean} isRecording - 是否正在录制
 * @param {number} start - 开始时间戳
 * @param {number} end - 结束时间戳
 * @returns {string} 自动更新进度条的 HTML 字符串
 */
function getAutoTimeProgressHtml(pct, options, isRecording, start, end) {
    let containerClass = 'itemProgressBar';
    if (options?.containerClass) {
        containerClass += ' ' + options.containerClass;
    }

    let foregroundClass = 'itemProgressBarForeground';
    if (isRecording) {
        // 录制中的进度条使用特殊样式
        foregroundClass += ' itemProgressBarForeground-recording';
    }

    return '<div is="emby-progressbar" data-automode="time" data-starttime="' + start + '" data-endtime="' + end + '" class="' + containerClass + '"><div class="' + foregroundClass + '" style="width:' + pct + '%;"></div></div>';
}

/**
 * 获取媒体项的进度条 HTML
 * @param {Object} item - 媒体项对象
 * @param {Object} options - 可选配置项
 * @returns {string} 进度条的 HTML 字符串，如果不需要显示则返回空字符串
 */
export function getProgressBarHtml(item, options) {
    let pct;
    // 对于支持进度指示器的媒体项（非录制项）
    if (enableProgressIndicator(item) && item.Type !== 'Recording') {
        const userData = options?.userData ? options.userData : item.UserData;

        if (userData) {
            pct = userData.PlayedPercentage;
            // 如果已播放但未完成（小于100%），显示进度条
            if (pct && pct < 100) {
                return getProgressHtml(pct, options);
            }
        }
    }

    // 对于节目、定时器或录制项，显示基于时间的进度条
    if ((item.Type === 'Program' || item.Type === 'Timer' || item.Type === 'Recording') && item.StartDate && item.EndDate) {
        let startDate = 0;
        let endDate = 1;

        try {
            // 解析开始和结束时间
            startDate = datetime.parseISO8601Date(item.StartDate).getTime();
            endDate = datetime.parseISO8601Date(item.EndDate).getTime();
        } catch (err) {
            console.error(err);
        }

        // 计算当前时间的进度百分比
        const now = new Date().getTime();
        const total = endDate - startDate;
        pct = 100 * ((now - startDate) / total);

        // 如果进度在 0-100% 之间，显示自动更新的进度条
        if (pct > 0 && pct < 100) {
            const isRecording = item.Type === 'Timer' || item.Type === 'Recording' || item.TimerId;
            return getAutoTimeProgressHtml(pct, options, isRecording, startDate, endDate);
        }
    }

    return '';
}

/**
 * 判断是否启用已播放指示器
 * @param {Object} item - 媒体项对象
 * @returns {boolean} 是否可以标记为已播放
 */
export function enablePlayedIndicator(item) {
    return itemHelper.canMarkPlayed(item);
}

/**
 * 获取已播放指示器 HTML
 * @param {Object} item - 媒体项对象
 * @returns {string} 已播放指示器的 HTML 字符串
 */
export function getPlayedIndicatorHtml(item) {
    if (enablePlayedIndicator(item)) {
        const userData = item.UserData || {};
        // 显示未播放项目数量
        if (userData.UnplayedItemCount) {
            return '<div class="countIndicator indicator">' + formatCountIndicator(userData.UnplayedItemCount) + '</div>';
        }

        // 显示已完成播放的标记（勾选图标）
        if (userData.PlayedPercentage && userData.PlayedPercentage >= 100 || (userData.Played)) {
            return '<div class="playedIndicator indicator"><span class="material-icons indicatorIcon check" aria-hidden="true"></span></div>';
        }
    }

    return '';
}

/**
 * 获取子项数量指示器 HTML
 * @param {Object} item - 媒体项对象
 * @param {Object} options - 可选配置项
 * @param {number} options.minCount - 显示计数器的最小数量阈值
 * @returns {string} 子项数量指示器的 HTML 字符串
 */
export function getChildCountIndicatorHtml(item, options) {
    const minCount = options?.minCount ? options.minCount : 0;

    // 当子项数量大于最小阈值时显示计数器
    if (item.ChildCount && item.ChildCount > minCount) {
        return '<div class="countIndicator indicator">' + formatCountIndicator(item.ChildCount) + '</div>';
    }

    return '';
}

/**
 * 格式化计数器显示
 * @param {number} count - 数量
 * @returns {string} 格式化后的数量字符串，超过99显示为"99+"
 */
function formatCountIndicator(count) {
    return count >= 100 ? '99+' : count.toString();
}

/**
 * 获取定时器指示器 HTML
 * @param {Object} item - 媒体项对象
 * @returns {string} 定时器指示器的 HTML 字符串
 */
export function getTimerIndicator(item) {
    let status;

    // 系列定时器显示智能录制图标
    if (item.Type === 'SeriesTimer') {
        return '<span class="material-icons timerIndicator indicatorIcon fiber_smart_record" aria-hidden="true"></span>';
    } else if (item.TimerId || item.SeriesTimerId) {
        status = item.Status || 'Cancelled';
    } else if (item.Type === 'Timer') {
        status = item.Status;
    } else {
        return '';
    }

    if (item.SeriesTimerId) {
        // 已取消的系列定时器显示非活动状态
        if (status !== 'Cancelled') {
            return '<span class="material-icons timerIndicator indicatorIcon fiber_smart_record" aria-hidden="true"></span>';
        }

        return '<span class="material-icons timerIndicator timerIndicator-inactive indicatorIcon fiber_smart_record" aria-hidden="true"></span>';
    }

    // 单次定时器显示手动录制图标
    return '<span class="material-icons timerIndicator indicatorIcon fiber_manual_record" aria-hidden="true"></span>';
}

/**
 * 获取同步指示器 HTML
 * @param {Object} item - 媒体项对象
 * @returns {string} 同步指示器的 HTML 字符串
 */
export function getSyncIndicator(item) {
    // 同步完成（100%）显示完整同步图标
    if (item.SyncPercent === 100) {
        return '<div class="syncIndicator indicator fullSyncIndicator"><span class="material-icons indicatorIcon file_download" aria-hidden="true"></span></div>';
    } else if (item.SyncPercent != null) {
        // 同步中显示空心同步图标
        return '<div class="syncIndicator indicator emptySyncIndicator"><span class="material-icons indicatorIcon file_download" aria-hidden="true"></span></div>';
    }

    return '';
}

/**
 * 获取类型指示器 HTML
 * @param {Object} item - 媒体项对象
 * @returns {string} 类型指示器的 HTML 字符串
 */
export function getTypeIndicator(item) {
    // 不同媒体类型对应的图标映射
    const iconT = {
        'Video' : 'videocam',
        'Folder' : 'folder',
        'PhotoAlbum' : 'photo_album',
        'Photo' : 'photo'
    };

    const icon = iconT[item.Type];
    return icon ? '<div class="indicator videoIndicator"><span class="material-icons indicatorIcon ' + icon + '" aria-hidden="true"></span></div>' : '';
}

/**
 * 获取缺失指示器 HTML
 * @param {Object} item - 媒体项对象
 * @returns {string} 缺失或未播出指示器的 HTML 字符串
 */
export function getMissingIndicator(item) {
    // 对于虚拟的剧集项目
    if (item.Type === 'Episode' && item.LocationType === 'Virtual') {
        if (item.PremiereDate) {
            try {
                const premiereDate = datetime.parseISO8601Date(item.PremiereDate).getTime();
                // 如果首播日期在未来，显示"未播出"
                if (premiereDate > new Date().getTime()) {
                    return '<div class="unairedIndicator">Unaired</div>';
                }
            } catch (err) {
                console.error(err);
            }
        }
        // 否则显示"缺失"
        return '<div class="missingIndicator">Missing</div>';
    }

    return '';
}

/**
 * 默认导出所有指示器相关函数
 */
export default {
    getProgressHtml: getProgressHtml,
    getProgressBarHtml: getProgressBarHtml,
    getPlayedIndicatorHtml: getPlayedIndicatorHtml,
    getChildCountIndicatorHtml: getChildCountIndicatorHtml,
    enableProgressIndicator: enableProgressIndicator,
    getTimerIndicator: getTimerIndicator,
    enablePlayedIndicator: enablePlayedIndicator,
    getSyncIndicator: getSyncIndicator,
    getTypeIndicator: getTypeIndicator,
    getMissingIndicator: getMissingIndicator
};
