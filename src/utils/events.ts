/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 事件工具（轻量级发布/订阅模式）
 *
 * 提供三个方法：
 * - `on(obj, type, fn)`: 在对象 `obj` 上注册事件回调 `fn`（同一对象可注册多个类型/多个回调）。
 * - `off(obj, type, fn)`: 从对象 `obj` 的指定事件类型 `type` 中移除回调 `fn`。
 * - `trigger(obj, type, args)`: 触发对象 `obj` 的事件 `type`，并传递额外参数给回调。
 *
 * 实现细节：回调列表保存在目标对象的私有属性 `_callbacks` 中，结构为
 * `{ [type: string]: Callback[] }`。触发事件时会使用 `slice(0)` 克隆回调数组，
 * 以避免回调执行过程中对数组的修改影响当前循环。
 */

export interface Event {
    /** 事件类型标识 */
    type: string;
}

/** 回调签名：第一个参数为 `Event` 对象，后续为触发时传入的任意参数 */
type Callback = (e: Event, ...args: any[]) => void;

/**
 * 获取目标对象上指定类型的回调数组（总是返回数组引用）
 * @param obj 目标对象（不能为 null/undefined）
 * @param type 事件类型
 */
function getCallbacks(obj: any, type: string): Callback[] {
    if (!obj) {
        throw new Error('obj cannot be null!');
    }

    // 在对象上懒创建 _callbacks 容器
    obj._callbacks = obj._callbacks || {};

    let callbacks = obj._callbacks[type];

    if (!callbacks) {
        obj._callbacks[type] = [];
        callbacks = obj._callbacks[type];
    }

    return callbacks;
}

export default {
    /** 在 `obj` 上为 `type` 注册回调 `fn` */
    on(obj: any, type: string, fn: Callback): void {
        const callbacks = getCallbacks(obj, type);

        callbacks.push(fn);
    },

    /** 从 `obj` 上的 `type` 回调列表中移除 `fn`（如果存在） */
    off(obj: any, type: string, fn: Callback): void {
        const callbacks = getCallbacks(obj, type);

        const i = callbacks.indexOf(fn);
        if (i !== -1) {
            callbacks.splice(i, 1);
        }
    },

    /**
     * 触发 `obj` 上的事件 `type`，可传入可选参数数组 `args`，
     * 回调将接收到一个 `Event` 对象作为第一个参数，随后为 `args` 的内容。
     */
    trigger(obj: any, type: string, args: any[] = []) {
        const eventArgs: [Event, ...any] = [{ type }, ...args];

        // 使用 slice 复制回调数组，防止在迭代过程中被修改
        getCallbacks(obj, type).slice(0)
            .forEach(callback => {
                callback.apply(obj, eventArgs);
            });
    }
};
/* eslint-enable @typescript-eslint/no-explicit-any */
