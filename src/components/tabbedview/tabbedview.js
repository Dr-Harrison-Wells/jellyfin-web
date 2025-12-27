// 导入背景清除功能
import { clearBackdrop } from '../backdrop/backdrop';
// 导入主标签管理器
import * as mainTabsManager from '../maintabsmanager';
// 导入布局管理器
import layoutManager from '../layoutManager';
// 导入 emby 标签元素
import '../../elements/emby-tabs/emby-tabs';
// 导入库菜单
import LibraryMenu from '../../scripts/libraryMenu';

/**
 * 视图销毁时的回调函数
 * 清理所有标签控制器和相关引用
 */
function onViewDestroy() {
    const tabControllers = this.tabControllers;

    // 如果存在标签控制器，则遍历销毁每个控制器
    if (tabControllers) {
        tabControllers.forEach(function (t) {
            if (t.destroy) {
                t.destroy();
            }
        });

        this.tabControllers = null;
    }

    // 清空所有引用
    this.view = null;
    this.params = null;
    this.currentTabController = null;
    this.initialTabIndex = null;
}

/**
 * 标签视图类
 * 管理多个标签页的显示和切换
 */
class TabbedView {
    /**
     * 构造函数
     * @param {HTMLElement} view - 视图元素
     * @param {Object} params - 参数对象
     */
    constructor(view, params) {
        // 初始化标签控制器数组
        this.tabControllers = [];
        this.view = view;
        this.params = params;

        const self = this;

        // 解析当前标签索引，默认使用传入的 tab 参数或默认标签索引
        let currentTabIndex = parseInt(params.tab || this.getDefaultTabIndex(params.parentId), 10);
        this.initialTabIndex = currentTabIndex;

        /**
         * 验证标签是否可以加载
         * @param {number} index - 标签索引
         * @returns {Promise} 验证结果的 Promise
         */
        function validateTabLoad(index) {
            return self.validateTabLoad ? self.validateTabLoad(index) : Promise.resolve();
        }

        /**
         * 加载指定标签
         * @param {number} index - 要加载的标签索引
         * @param {number} previousIndex - 上一个标签的索引
         */
        function loadTab(index, previousIndex) {
            validateTabLoad(index).then(function () {
                // 获取标签控制器并执行恢复操作
                self.getTabController(index).then(function (controller) {
                    // 判断是否需要刷新（首次加载需要刷新）
                    const refresh = !controller.refreshed;

                    // 恢复控制器状态
                    controller.onResume({
                        autoFocus: previousIndex == null && layoutManager.tv, // TV 模式下首次加载时自动聚焦
                        refresh: refresh
                    });

                    // 标记为已刷新
                    controller.refreshed = true;

                    // 更新当前标签索引和控制器
                    currentTabIndex = index;
                    self.currentTabController = controller;
                });
            });
        }

        /**
         * 获取所有标签内容容器
         * @returns {NodeList} 标签内容容器列表
         */
        function getTabContainers() {
            return view.querySelectorAll('.tabContent');
        }

        /**
         * 标签切换事件处理函数
         * @param {Event} e - 事件对象
         */
        function onTabChange(e) {
            const newIndex = parseInt(e.detail.selectedTabIndex, 10);
            const previousIndex = e.detail.previousIndex;

            // 暂停上一个标签控制器
            const previousTabController = previousIndex == null ? null : self.tabControllers[previousIndex];
            if (previousTabController?.onPause) {
                previousTabController.onPause();
            }

            // 加载新标签
            loadTab(newIndex, previousIndex);
        }

        // 视图隐藏前暂停当前标签
        view.addEventListener('viewbeforehide', this.onPause.bind(this));

        // 视图显示前设置标签
        view.addEventListener('viewbeforeshow', function () {
            mainTabsManager.setTabs(view, currentTabIndex, self.getTabs, getTabContainers, null, onTabChange, false);
        });

        // 视图显示时恢复标签
        view.addEventListener('viewshow', function (e) {
            self.onResume(e.detail);
        });

        // 视图销毁时清理资源
        view.addEventListener('viewdestroy', onViewDestroy.bind(this));
    }

    /**
     * 视图恢复时调用
     * 设置标题、清除背景并恢复当前标签控制器
     */
    onResume() {
        // 设置页面标题
        this.setTitle();
        // 清除背景
        clearBackdrop();

        const currentTabController = this.currentTabController;

        // 如果没有当前标签控制器，则选择初始标签
        if (!currentTabController) {
            mainTabsManager.selectedTabIndex(this.initialTabIndex);
        } else if (currentTabController?.onResume) {
            // 恢复当前标签控制器
            currentTabController.onResume({});
        }
    }

    /**
     * 视图暂停时调用
     * 暂停当前标签控制器
     */
    onPause() {
        const currentTabController = this.currentTabController;

        // 如果当前标签控制器存在 onPause 方法，则调用它
        if (currentTabController?.onPause) {
            currentTabController.onPause();
        }
    }

    /**
     * 设置页面标题
     * 默认设置为空标题
     */
    setTitle() {
        LibraryMenu.setTitle('');
    }
}

export default TabbedView;
