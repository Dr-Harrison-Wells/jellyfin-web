// 导入服务器连接模块
import { ServerConnections } from 'lib/jellyfin-apiclient';
// 导入DOM操作工具
import dom from '../scripts/dom';
// 导入应用路由器
import { appRouter } from './router/appRouter';
// 导入仪表板工具
import Dashboard from '../utils/dashboard';

/**
 * 处理分组卡片点击事件
 * @param {Event} e - 点击事件对象
 * @param {HTMLElement} card - 被点击的卡片元素
 */
function onGroupedCardClick(e, card) {
    // 获取项目ID
    const itemId = card.getAttribute('data-id');
    // 获取服务器ID
    const serverId = card.getAttribute('data-serverid');
    // 根据服务器ID获取API客户端
    const apiClient = ServerConnections.getApiClient(serverId);
    // 获取当前用户ID
    const userId = apiClient.getCurrentUserId();
    // 查找已播放指示器元素
    const playedIndicator = card.querySelector('.playedIndicator');
    // 获取已播放指示器的HTML内容
    const playedIndicatorHtml = playedIndicator ? playedIndicator.innerHTML : null;
    // 构建API请求选项
    const options = {
        Limit: parseInt(playedIndicatorHtml || '10', 10), // 限制返回结果数量，默认10
        Fields: 'PrimaryImageAspectRatio,DateCreated', // 请求返回的字段
        ParentId: itemId, // 父级项目ID
        GroupItems: false // 不分组项目
    };
    // 查找可操作的父元素（A标签、按钮或输入框）
    const actionableParent = dom.parentWithTag(e.target, ['A', 'BUTTON', 'INPUT']);

    // 如果没有找到可操作父元素，或者父元素是卡片内容区域
    if (!actionableParent || actionableParent.classList.contains('cardContent')) {
        // 获取最新项目列表
        apiClient.getJSON(apiClient.getUrl('Users/' + userId + '/Items/Latest', options)).then(function (items) {
            // 如果只有一个项目，直接显示该项目
            if (items.length === 1) {
                appRouter.showItem(items[0]);
                return;
            }

            // 否则导航到详情页面
            const url = 'details?id=' + itemId + '&serverId=' + serverId;
            Dashboard.navigate(url);
        });
        // 阻止事件冒泡
        e.stopPropagation();
        // 阻止默认行为
        e.preventDefault();
        return false;
    }
}

/**
 * 处理项目容器点击事件的默认导出函数
 * @param {Event} e - 点击事件对象
 */
export default function onItemsContainerClick(e) {
    // 查找被点击的分组卡片元素
    const groupedCard = dom.parentWithClass(e.target, 'groupedCard');

    // 如果找到分组卡片，则处理点击事件
    if (groupedCard) {
        onGroupedCardClick(e, groupedCard);
    }
}
