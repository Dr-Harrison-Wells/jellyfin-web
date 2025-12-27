// 导入toast样式
import './toast.scss';

// Toast消息接口定义
interface Toast {
    text: string // 提示文本内容
}

// 全局toast容器元素
let toastContainer: HTMLDivElement;

/**
 * 获取或创建toast容器
 * @returns 返回toast容器元素
 */
function getToastContainer() {
    if (!toastContainer) {
        // 创建容器div元素
        toastContainer = document.createElement('div');
        toastContainer.classList.add('toastContainer');
        // 将容器添加到body中
        document.body.appendChild(toastContainer);
    }

    return toastContainer;
}

/**
 * 移除toast元素
 * @param elem 要移除的HTML元素
 */
function remove(elem: HTMLElement) {
    setTimeout(function () {
        // 从DOM中移除元素
        elem.parentNode?.removeChild(elem);
    }, 300);
}

/**
 * 添加隐藏动画并移除toast元素
 * @param elem 要移除的HTML元素
 */
function animateRemove(elem: HTMLElement) {
    setTimeout(function () {
        // 添加隐藏样式类
        elem.classList.add('toastHide');
        // 执行移除操作
        remove(elem);
    }, 3300); // 3.3秒后开始隐藏动画
}

/**
 * 显示toast提示消息
 * @param options 可以是字符串或Toast对象
 */
export default function (options: string | Toast) {
    // 如果传入的是字符串，转换为Toast对象
    if (typeof options === 'string') {
        options = {
            text: options
        } as Toast;
    }

    // 创建toast元素
    const elem = document.createElement('div');
    elem.classList.add('toast');
    elem.textContent = options.text;

    // 将toast添加到容器中
    getToastContainer().appendChild(elem);

    // 延迟300ms后显示toast
    setTimeout(function () {
        elem.classList.add('toastVisible');

        // 触发自动隐藏和移除
        animateRemove(elem);
    }, 300);
}
