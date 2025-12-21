/**
 * 活动日志组件
 * 用于显示和管理Jellyfin服务器的活动日志条目
 */

// HTML转义工具，防止XSS攻击
import escapeHtml from 'escape-html';
// 事件系统
import Events from '../utils/events.ts';
// 国际化工具
import globalize from '../lib/globalize';
// 服务器连接管理
import { ServerConnections } from 'lib/jellyfin-apiclient';
// DOM操作工具
import dom from '../scripts/dom';
// 日期格式化工具
import { formatRelative } from 'date-fns';
// 服务器通知系统
import serverNotifications from '../scripts/serverNotifications';
// 按钮组件
import '../elements/emby-button/emby-button';
// 列表视图样式
import './listview/listview.scss';
// 警告对话框
import alert from './alert';
// 区域设置工具
import { getLocale } from '../utils/dateFnsLocale.ts';
// 字符串转布尔值工具
import { toBoolean } from '../utils/string.ts';

/**
 * 生成单个活动日志条目的HTML
 * @param {Object} entry - 活动日志条目对象
 * @param {Object} apiClient - API客户端实例
 * @returns {string} 生成的HTML字符串
 */
function getEntryHtml(entry, apiClient) {
    let html = '';
    html += '<div class="listItem listItem-border">';
    // 默认颜色和图标（用于普通通知）
    let color = '#00a4dc';
    let icon = 'notifications';

    // 根据严重程度设置颜色和图标
    if (entry.Severity == 'Error' || entry.Severity == 'Fatal' || entry.Severity == 'Warn') {
        color = '#cc0000'; // 错误使用红色
        icon = 'notification_important'; // 重要通知图标
    }

    // 如果有用户信息和头像，显示用户头像；否则显示图标
    if (entry.UserId && entry.UserPrimaryImageTag) {
        html += '<span class="listItemIcon material-icons dvr" aria-hidden="true" style="width:2em!important;height:2em!important;padding:0;color:transparent;background-color:' + color + ";background-image:url('" + apiClient.getUserImageUrl(entry.UserId, {
            type: 'Primary',
            tag: entry.UserPrimaryImageTag
        }) + "');background-repeat:no-repeat;background-position:center center;background-size: cover;\"></span>";
    } else {
        html += '<span class="listItemIcon material-icons ' + icon + '" aria-hidden="true" style="background-color:' + color + '"></span>';
    }

    // 构建条目内容：名称、时间、简短概述
    html += '<div class="listItemBody three-line">';
    html += '<div class="listItemBodyText">';
    html += escapeHtml(entry.Name); // 条目名称
    html += '</div>';
    html += '<div class="listItemBodyText secondary">';
    html += formatRelative(Date.parse(entry.Date), Date.now(), { locale: getLocale() }); // 相对时间
    html += '</div>';
    html += '<div class="listItemBodyText secondary listItemBodyText-nowrap">';
    html += escapeHtml(entry.ShortOverview || ''); // 简短描述
    html += '</div>';
    html += '</div>';

    // 如果有详细信息，添加信息按钮
    if (entry.Overview) {
        html += `<button type="button" is="paper-icon-button-light" class="btnEntryInfo" data-id="${entry.Id}" title="${globalize.translate('Info')}">
                       <span class="material-icons info" aria-hidden="true"></span>
                    </button>`;
    }

    html += '</div>';

    return html;
}

/**
 * 渲染活动日志列表
 * @param {HTMLElement} elem - 目标DOM元素
 * @param {Object} apiClient - API客户端实例
 * @param {Object} result - 包含活动日志条目的结果对象
 */
function renderList(elem, apiClient, result) {
    // 将所有条目映射为HTML并插入到元素中
    elem.innerHTML = result.Items.map(function (i) {
        return getEntryHtml(i, apiClient);
    }).join('');
}

/**
 * 重新加载活动日志数据
 * @param {Object} instance - ActivityLog实例
 * @param {HTMLElement} elem - 目标DOM元素
 * @param {Object} apiClient - API客户端实例
 * @param {number} startIndex - 起始索引
 * @param {number} limit - 限制数量
 */
function reloadData(instance, elem, apiClient, startIndex, limit) {
    // 如果未提供起始索引，从元素属性中读取或使用默认值0
    if (startIndex == null) {
        startIndex = parseInt(elem.getAttribute('data-activitystartindex') || '0', 10);
    }

    // 设置限制数量，默认为7条
    limit = limit || parseInt(elem.getAttribute('data-activitylimit') || '7', 10);
    const minDate = new Date();
    const hasUserId = toBoolean(elem.getAttribute('data-useractivity'), true);

    // TODO: 使用date-fns替换
    // 根据是否有用户ID设置最小日期范围
    if (hasUserId) {
        minDate.setTime(minDate.getTime() - 24 * 60 * 60 * 1000); // 向前一天
    } else {
        minDate.setTime(minDate.getTime() - 7 * 24 * 60 * 60 * 1000); // 向前一周
    }

    // 从API获取活动日志条目
    ApiClient.getJSON(ApiClient.getUrl('System/ActivityLog/Entries', {
        startIndex: startIndex,
        limit: limit,
        minDate: minDate.toISOString(),
        hasUserId: hasUserId
    })).then(function (result) {
        // 保存当前的分页参数
        elem.setAttribute('data-activitystartindex', startIndex);
        elem.setAttribute('data-activitylimit', limit);
        // 如果是第一页，根据是否有数据来显示或隐藏容器
        if (!startIndex) {
            const activityContainer = dom.parentWithClass(elem, 'activityContainer');

            if (activityContainer) {
                if (result.Items.length) {
                    activityContainer.classList.remove('hide'); // 有数据，显示容器
                } else {
                    activityContainer.classList.add('hide'); // 无数据，隐藏容器
                }
            }
        }

        // 保存条目数据并渲染列表
        instance.items = result.Items;
        renderList(elem, apiClient, result);
    });
}

/**
 * 活动日志更新事件处理器
 * @param {Event} e - 事件对象
 * @param {Object} apiClient - API客户端实例
 */
function onActivityLogUpdate(e, apiClient) {
    const options = this.options;

    // 只在服务器ID匹配时重新加载数据
    if (options && options.serverId === apiClient.serverId()) {
        reloadData(this, options.element, apiClient);
    }
}

/**
 * 列表点击事件处理器
 * @param {Event} e - 点击事件对象
 */
function onListClick(e) {
    // 查找是否点击了信息按钮
    const btnEntryInfo = dom.parentWithClass(e.target, 'btnEntryInfo');

    if (btnEntryInfo) {
        const id = btnEntryInfo.getAttribute('data-id');
        const items = this.items;

        if (items) {
            // 在条目列表中查找对应的条目
            const item = items.filter(function (i) {
                return i.Id.toString() === id;
            })[0];

            if (item) {
                showItemOverview(item); // 显示详细信息
            }
        }
    }
}

/**
 * 显示条目的详细信息
 * @param {Object} item - 活动日志条目对象
 */
function showItemOverview(item) {
    // 使用警告对话框显示详细概述
    alert({
        text: item.Overview
    });
}

/**
 * 活动日志组件类
 * 管理活动日志的显示、更新和交互
 */
class ActivityLog {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {HTMLElement} options.element - 目标DOM元素
     * @param {string} options.serverId - 服务器ID
     */
    constructor(options) {
        this.options = options;
        const element = options.element;
        // 添加样式类
        element.classList.add('activityLogListWidget');
        // 绑定点击事件
        element.addEventListener('click', onListClick.bind(this));
        // 获取API客户端并加载数据
        const apiClient = ServerConnections.getApiClient(options.serverId);
        reloadData(this, element, apiClient);
        // 订阅活动日志更新事件
        const onUpdate = onActivityLogUpdate.bind(this);
        this.updateFn = onUpdate;
        Events.on(serverNotifications, 'ActivityLogEntry', onUpdate);
        // 通知服务器开始发送活动日志更新
        apiClient.sendMessage('ActivityLogEntryStart', '0,1500');
    }
    /**
     * 销毁组件，清理资源
     */
    destroy() {
        const options = this.options;

        if (options) {
            // 移除样式类
            options.element.classList.remove('activityLogListWidget');
            // 通知服务器停止发送活动日志更新
            ServerConnections.getApiClient(options.serverId).sendMessage('ActivityLogEntryStop', '0,1500');
        }

        const onUpdate = this.updateFn;

        if (onUpdate) {
            // 取消订阅事件
            Events.off(serverNotifications, 'ActivityLogEntry', onUpdate);
        }

        // 清空引用，释放内存
        this.items = null;
        this.options = null;
    }
}

export default ActivityLog;
