/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Router, RouterState } from '@remix-run/router';
import type { History, Listener, To } from 'history';

import Events, { type Event } from 'utils/events';

// 历史记录更新事件名称
const HISTORY_UPDATE_EVENT = 'HISTORY_UPDATE';

/**
 * 路由历史管理类
 * 实现了 History 接口，用于包装 @remix-run/router 的路由器
 * 提供浏览器历史记录管理功能
 */
export class RouterHistory implements History {
    // 内部路由器实例
    _router: Router;
    // 创建 href 的方法
    createHref: (arg: any) => string;

    /**
     * 构造函数
     * @param router - Remix 路由器实例
     */
    constructor(router: Router) {
        this._router = router;

        // 订阅路由状态变化，当状态更新时触发自定义事件
        this._router.subscribe(state => {
            console.debug('[RouterHistory] history update', state);
            Events.trigger(document, HISTORY_UPDATE_EVENT, [ state ]);
        });

        // 绑定 createHref 方法
        this.createHref = router.createHref;
    }

    /**
     * 获取当前历史记录操作类型
     * @returns 历史记录操作（push、pop、replace等）
     */
    get action() {
        return this._router.state.historyAction;
    }

    /**
     * 获取当前位置信息
     * @returns 当前路由位置对象
     */
    get location() {
        return this._router.state.location;
    }

    /**
     * 返回上一页
     */
    back() {
        void this._router.navigate(-1);
    }

    /**
     * 前进到下一页
     */
    forward() {
        void this._router.navigate(1);
    }

    /**
     * 在历史记录中跳转指定步数
     * @param delta - 跳转步数（正数前进，负数后退）
     */
    go(delta: number) {
        void this._router.navigate(delta);
    }

    /**
     * 导航到指定路径（添加新的历史记录）
     * @param to - 目标路径
     * @param state - 可选的状态对象
     */
    push(to: To, state?: any) {
        void this._router.navigate(to, { state });
    }

    /**
     * 替换当前历史记录
     * @param to - 目标路径
     * @param state - 可选的状态对象
     */
    replace(to: To, state?: any): void {
        void this._router.navigate(to, { state, replace: true });
    }

    /**
     * 阻止导航（未实现）
     * 注意：我们似乎不使用此功能，因此保持未实现状态
     * @throws 抛出未实现错误
     */
    block() {
        // NOTE: We don't seem to use this functionality, so leaving it unimplemented.
        // 注意：我们似乎不使用此功能，因此保持未实现状态
        throw new Error('`history.block()` is not implemented');
        return () => undefined;
    }

    /**
     * 监听历史记录变化
     * @param listener - 监听器回调函数
     * @returns 取消监听的函数
     */
    listen(listener: Listener) {
        // 创建兼容的监听器，将路由器状态转换为 History 接口格式
        const compatListener = (_e: Event, state: RouterState) => {
            return listener({ action: state.historyAction, location: state.location });
        };

        // 注册事件监听器
        Events.on(document, HISTORY_UPDATE_EVENT, compatListener);

        // 返回取消监听的函数
        return () => Events.off(document, HISTORY_UPDATE_EVENT, compatListener);
    }
}

/**
 * 创建路由历史实例
 * @param router - Remix 路由器实例
 * @returns History 接口实例
 */
export const createRouterHistory = (router: Router): History => {
    return new RouterHistory(router);
};

/* eslint-enable @typescript-eslint/no-explicit-any */
