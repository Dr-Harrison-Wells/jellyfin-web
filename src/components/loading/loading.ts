// 导入加载动画样式
import './loading.scss';

// 全局加载器元素
let loader: HTMLDivElement | undefined;

/**
 * 创建加载器元素
 * @returns 返回包含 Material Design 风格的加载动画的 div 元素
 */
function createLoader(): HTMLDivElement {
    // 创建容器元素
    const elem = document.createElement('div');
    // 设置文本方向为从左到右
    elem.setAttribute('dir', 'ltr');
    // 添加加载动画相关的样式类
    elem.classList.add('docspinner');
    elem.classList.add('mdl-spinner');

    // 设置 Material Design 风格的多层旋转加载动画 HTML 结构
    elem.innerHTML = '<div class="mdl-spinner__layer mdl-spinner__layer-1"><div class="mdl-spinner__circle-clipper mdl-spinner__left"><div class="mdl-spinner__circle mdl-spinner__circleLeft"></div></div><div class="mdl-spinner__circle-clipper mdl-spinner__right"><div class="mdl-spinner__circle mdl-spinner__circleRight"></div></div></div><div class="mdl-spinner__layer mdl-spinner__layer-2"><div class="mdl-spinner__circle-clipper mdl-spinner__left"><div class="mdl-spinner__circle mdl-spinner__circleLeft"></div></div><div class="mdl-spinner__circle-clipper mdl-spinner__right"><div class="mdl-spinner__circle mdl-spinner__circleRight"></div></div></div><div class="mdl-spinner__layer mdl-spinner__layer-3"><div class="mdl-spinner__circle-clipper mdl-spinner__left"><div class="mdl-spinner__circle mdl-spinner__circleLeft"></div></div><div class="mdl-spinner__circle-clipper mdl-spinner__right"><div class="mdl-spinner__circle mdl-spinner__circleRight"></div></div></div><div class="mdl-spinner__layer mdl-spinner__layer-4"><div class="mdl-spinner__circle-clipper mdl-spinner__left"><div class="mdl-spinner__circle mdl-spinner__circleLeft"></div></div><div class="mdl-spinner__circle-clipper mdl-spinner__right"><div class="mdl-spinner__circle mdl-spinner__circleRight"></div></div></div>';

    // 将加载器元素添加到页面 body 中
    document.body.appendChild(elem);
    return elem;
}

/**
 * 显示加载动画
 */
export function show() {
    // 如果加载器尚未创建，则创建它
    if (!loader) {
        loader = createLoader();
    }
    // 激活加载动画
    loader.classList.add('mdlSpinnerActive');
}

/**
 * 隐藏加载动画
 */
export function hide() {
    // 如果加载器存在，则移除激活状态
    if (loader) {
        loader.classList.remove('mdlSpinnerActive');
    }
}

// 导出的加载动画对象
const loading = {
    show,
    hide
};

// 将加载动画对象挂载到全局 window 对象上，方便在其他地方访问
window.Loading = loading;

export default loading;
