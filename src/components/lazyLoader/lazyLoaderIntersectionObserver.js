/**
 * 懒加载器类
 * 使用 IntersectionObserver API 实现元素的懒加载功能
 * 当元素进入视口时触发回调函数
 */
export class LazyLoader {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {Function} options.callback - 当元素进入视口时的回调函数
     */
    constructor(options) {
        this.options = options;
    }

    /**
     * 创建 IntersectionObserver 实例
     * 配置观察器的参数并设置回调函数
     */
    createObserver() {
        const callback = this.options.callback;

        const newObserver = new IntersectionObserver(
            (entries, observer) => {
                // 遍历所有观察到的条目
                entries.forEach(entry => {
                    callback(entry, observer);
                });
            },
            {
                rootMargin: '50%', // 提前50%的视口高度开始加载
                threshold: 0 // 元素任何部分可见时就触发
            });

        this.observer = newObserver;
    }

    /**
     * 添加需要观察的元素
     * @param {Array|NodeList} elements - 需要进行懒加载的元素列表
     */
    addElements(elements) {
        let observer = this.observer;

        // 如果观察器不存在，则创建一个新的
        if (!observer) {
            this.createObserver();
            observer = this.observer;
        }

        // 将所有元素添加到观察器中
        Array.from(elements).forEach(element => {
            observer.observe(element);
        });
    }

    /**
     * 销毁观察器
     * 断开所有观察并清理观察器实例
     */
    destroyObserver() {
        const observer = this.observer;

        if (observer) {
            observer.disconnect();
            this.observer = null;
        }
    }

    /**
     * 完全销毁懒加载器
     * 清理观察器和所有配置选项
     */
    destroy() {
        this.destroyObserver();
        this.options = null;
    }
}

/**
 * 揭示元素（启动懒加载）
 * @param {Array|NodeList} elements - 需要懒加载的元素列表
 * @param {Element} root - 根元素
 * @param {Function} callback - 回调函数
 */
function unveilElements(elements, root, callback) {
    // 如果没有元素，直接返回
    if (!elements.length) {
        return;
    }
    // 创建懒加载器实例并添加元素
    const lazyLoader = new LazyLoader({
        callback: callback
    });
    lazyLoader.addElements(elements);
}

/**
 * 懒加载子元素
 * 对指定元素下所有带有 'lazy' 类名的子元素进行懒加载
 * @param {Element} elem - 父元素
 * @param {Function} callback - 当子元素进入视口时的回调函数
 */
export function lazyChildren(elem, callback) {
    unveilElements(elem.getElementsByClassName('lazy'), elem, callback);
}

export default {
    LazyLoader: LazyLoader,
    lazyChildren: lazyChildren
};
