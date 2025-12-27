/**
 * 用户数据按钮组件
 * 用于显示和处理媒体项目的用户交互按钮（已播放、收藏等）
 */

// 导入国际化工具
import globalize from '../../lib/globalize';
// 导入服务器连接管理器
import { ServerConnections } from 'lib/jellyfin-apiclient';
// 导入 DOM 操作工具
import dom from '../../scripts/dom';
// 导入项目辅助工具
import itemHelper from '../itemHelper';

// 导入按钮组件样式
import '../../elements/emby-button/paper-icon-button-light';
import 'material-design-icons-iconfont';
import '../../elements/emby-button/emby-button';
import './userdatabuttons.scss';

// 用户数据操作方法映射表
const userDataMethods = {
    markPlayed: markPlayed, // 标记已播放
    markFavorite: markFavorite // 标记收藏
};

/**
 * 生成用户数据按钮的 HTML 字符串
 * @param {string} method - 按钮触发的方法名
 * @param {string} itemId - 媒体项目 ID
 * @param {string} serverId - 服务器 ID
 * @param {string} icon - 图标名称
 * @param {string} tooltip - 提示文本
 * @param {string} style - 按钮样式（fab、fab-mini 等）
 * @param {Object} classes - CSS 类名配置
 * @returns {string} 按钮的 HTML 字符串
 */
function getUserDataButtonHtml(method, itemId, serverId, icon, tooltip, style, classes) {
    let buttonCssClass = classes.buttonCssClass;
    let iconCssClass = classes.iconCssClass;

    // 处理 fab-mini 样式，转换为 fab + mini 类
    if (style === 'fab-mini') {
        style = 'fab';
        buttonCssClass = buttonCssClass ? (buttonCssClass + ' mini') : 'mini';
    }

    // 根据样式选择按钮类型和基础类名
    const is = style === 'fab' ? 'emby-button' : 'paper-icon-button-light';
    let className = style === 'fab' ? 'autoSize fab' : 'autoSize';

    // 添加自定义按钮类名
    if (buttonCssClass) {
        className += ' ' + buttonCssClass;
    }

    // 处理图标类名，添加 Material Icons 基础类
    if (iconCssClass) {
        iconCssClass += ' ';
    } else {
        iconCssClass = '';
    }

    iconCssClass += 'material-icons';

    // 返回完整的按钮 HTML 字符串
    return `<button title="${tooltip}" data-itemid="${itemId}" data-serverid="${serverId}" is="${is}" data-method="${method}" class="${className}"><span class="${iconCssClass} ${icon}" aria-hidden="true"></span></button>`;
}

/**
 * 容器点击事件处理函数
 * @param {Event} e - 点击事件对象
 */
function onContainerClick(e) {
    // 查找最近的用户数据按钮父元素
    const btnUserData = dom.parentWithClass(e.target, 'btnUserData');

    // 如果没有找到按钮，直接返回
    if (!btnUserData) {
        return;
    }

    // 获取按钮的方法名并执行相应操作
    const method = btnUserData.getAttribute('data-method');
    userDataMethods[method](btnUserData);
}

/**
 * 填充用户数据按钮到指定元素
 * @param {Object} options - 配置选项
 * @param {HTMLElement} options.element - 目标元素
 * @param {string} options.fillMode - 填充模式（insertAdjacent 或直接替换）
 * @param {string} options.insertLocation - 插入位置（beforeend 等）
 */
function fill(options) {
    // 生成按钮 HTML
    const html = getIconsHtml(options);

    // 根据填充模式插入或替换 HTML
    if (options.fillMode === 'insertAdjacent') {
        options.element.insertAdjacentHTML(options.insertLocation || 'beforeend', html);
    } else {
        options.element.innerHTML = html;
    }

    // 移除旧的点击事件监听器（避免重复绑定）
    dom.removeEventListener(options.element, 'click', onContainerClick, {
        passive: true
    });

    // 添加新的点击事件监听器
    dom.addEventListener(options.element, 'click', onContainerClick, {
        passive: true
    });
}

/**
 * 销毁用户数据按钮，清理事件监听器
 * @param {Object} options - 配置选项
 * @param {HTMLElement} options.element - 目标元素
 */
function destroy(options) {
    // 清空元素内容
    options.element.innerHTML = '';

    // 移除点击事件监听器
    dom.removeEventListener(options.element, 'click', onContainerClick, {
        passive: true
    });
}

/**
 * 根据媒体项目生成用户数据按钮的 HTML
 * @param {Object} options - 配置选项
 * @param {Object} options.item - 媒体项目对象
 * @param {boolean} options.includePlayed - 是否包含已播放按钮
 * @param {string} options.cssClass - 自定义 CSS 类名
 * @param {string} options.style - 按钮样式
 * @param {string} options.iconCssClass - 图标 CSS 类名
 * @returns {string} 按钮组的 HTML 字符串
 */
function getIconsHtml(options) {
    const item = options.item;
    const includePlayed = options.includePlayed;
    const cssClass = options.cssClass;
    const style = options.style;

    let html = '';

    // 获取用户数据（已播放、收藏等）
    const userData = item.UserData || {};

    const itemId = item.Id;

    // 如果是本地项目，不显示用户数据按钮
    if (itemHelper.isLocalItem(item)) {
        return html;
    }

    // 构建按钮基础 CSS 类名
    let btnCssClass = 'btnUserData';

    if (cssClass) {
        btnCssClass += ' ' + cssClass;
    }

    const iconCssClass = options.iconCssClass;
    // 构建类名配置对象
    const classes = { buttonCssClass: btnCssClass, iconCssClass: iconCssClass };
    const serverId = item.ServerId;

    // 添加已播放按钮
    if (includePlayed !== false) {
        const tooltipPlayed = globalize.translate('MarkPlayed');

        // 检查项目是否可以标记为已播放
        if (itemHelper.canMarkPlayed(item)) {
            if (userData.Played) {
                // 已播放状态：显示激活状态的按钮
                const buttonCssClass = classes.buttonCssClass + ' btnUserDataOn';
                html += getUserDataButtonHtml('markPlayed', itemId, serverId, 'check', tooltipPlayed, style, { buttonCssClass, ...classes });
            } else {
                // 未播放状态：显示普通按钮
                html += getUserDataButtonHtml('markPlayed', itemId, serverId, 'check', tooltipPlayed, style, classes);
            }
        }
    }

    // 添加收藏按钮
    const tooltipFavorite = globalize.translate('Favorite');
    if (userData.IsFavorite) {
        // 已收藏状态：显示激活状态的按钮
        const buttonCssClass = classes.buttonCssClass + ' btnUserData btnUserDataOn';
        html += getUserDataButtonHtml('markFavorite', itemId, serverId, 'favorite', tooltipFavorite, style, { buttonCssClass, ...classes });
    } else {
        // 未收藏状态：显示普通按钮
        classes.buttonCssClass += ' btnUserData';
        html += getUserDataButtonHtml('markFavorite', itemId, serverId, 'favorite', tooltipFavorite, style, classes);
    }

    return html;
}

/**
 * 切换媒体项目的收藏状态
 * @param {HTMLElement} link - 按钮元素
 */
function markFavorite(link) {
    const id = link.getAttribute('data-itemid');
    const serverId = link.getAttribute('data-serverid');

    // 根据当前状态决定是添加收藏还是取消收藏
    const markAsFavorite = !link.classList.contains('btnUserDataOn');

    // 调用 API 更新收藏状态
    favorite(id, serverId, markAsFavorite);

    // 更新按钮的视觉状态
    if (markAsFavorite) {
        link.classList.add('btnUserDataOn');
    } else {
        link.classList.remove('btnUserDataOn');
    }
}

/**
 * 切换媒体项目的已播放状态
 * @param {HTMLElement} link - 按钮元素
 */
function markPlayed(link) {
    const id = link.getAttribute('data-itemid');
    const serverId = link.getAttribute('data-serverid');

    // 根据当前状态切换已播放/未播放
    if (!link.classList.contains('btnUserDataOn')) {
        // 标记为已播放
        played(id, serverId, true);

        link.classList.add('btnUserDataOn');
    } else {
        // 标记为未播放
        played(id, serverId, false);

        link.classList.remove('btnUserDataOn');
    }
}

/**
 * 调用 API 更新项目的已播放状态
 * @param {string} id - 媒体项目 ID
 * @param {string} serverId - 服务器 ID
 * @param {boolean} isPlayed - 是否已播放
 * @returns {Promise} API 调用的 Promise
 */
function played(id, serverId, isPlayed) {
    // 获取对应服务器的 API 客户端
    const apiClient = ServerConnections.getApiClient(serverId);

    // 根据状态选择调用的 API 方法
    const method = isPlayed ? 'markPlayed' : 'markUnplayed';

    // 调用 API 更新播放状态
    return apiClient[method](apiClient.getCurrentUserId(), id, new Date());
}

/**
 * 调用 API 更新项目的收藏状态
 * @param {string} id - 媒体项目 ID
 * @param {string} serverId - 服务器 ID
 * @param {boolean} isFavorite - 是否收藏
 * @returns {Promise} API 调用的 Promise
 */
function favorite(id, serverId, isFavorite) {
    // 获取对应服务器的 API 客户端
    const apiClient = ServerConnections.getApiClient(serverId);

    // 调用 API 更新收藏状态
    return apiClient.updateFavoriteStatus(apiClient.getCurrentUserId(), id, isFavorite);
}

// 导出模块的公共 API
export default {
    fill: fill, // 填充按钮到元素
    destroy: destroy, // 销毁按钮和事件监听器
    getIconsHtml: getIconsHtml // 生成按钮 HTML
};
