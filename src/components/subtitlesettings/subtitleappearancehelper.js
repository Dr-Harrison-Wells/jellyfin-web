/**
 * 字幕外观设置辅助工具。
 * @module components/subtitleSettings/subtitleAppearanceHelper
 * 该模块用于根据用户设置动态生成字幕样式，并应用到字幕元素上。
 */

/**
 * 根据字幕设置生成文本样式列表。
 * @param {Object} settings - 字幕外观设置对象。
 * @param {boolean} preview - 是否为预览模式。
 * @returns {Array} 样式对象数组。
 */
function getTextStyles(settings, preview) {
    const list = [];

    // 字体大小设置
    switch (settings.textSize || '') {
        case 'smaller':
            list.push({ name: 'font-size', value: '.8em' });
            break;
        case 'small':
            list.push({ name: 'font-size', value: 'inherit' });
            break;
        case 'larger':
            list.push({ name: 'font-size', value: '2em' });
            break;
        case 'extralarge':
            list.push({ name: 'font-size', value: '2.2em' });
            break;
        case 'large':
            list.push({ name: 'font-size', value: '1.72em' });
            break;
        case 'medium':
        default:
            list.push({ name: 'font-size', value: '1.36em' });
            break;
    }

    // 字体粗细设置
    switch (settings.textWeight || '') {
        case 'bold':
            list.push({ name: 'font-weight', value: 'bold' });
            break;
        case 'normal':
        default:
            list.push({ name: 'font-weight', value: 'normal' });
            break;
    }

    // 阴影效果设置
    switch (settings.dropShadow || '') {
        case 'raised':
            list.push({ name: 'text-shadow', value: '-0.04em -0.04em #fff, 0px -0.04em #fff, -0.04em 0px #fff, 0.04em 0.04em #000, 0px 0.04em #000, 0.04em 0px #000' });
            break;
        case 'depressed':
            list.push({ name: 'text-shadow', value: '0.04em 0.04em #fff, 0px 0.04em #fff, 0.04em 0px #fff, -0.04em -0.04em #000, 0px -0.04em #000, -0.04em 0px #000' });
            break;
        case 'uniform':
            list.push({ name: 'text-shadow', value: '#000 0px 0.03em, #000 0px -0.03em, #000 0px 0.05em, #000 0px -0.05em, #000 0.03em 0px, #000 -0.03em 0px, #000 0.03em 0.03em, #000 -0.03em 0.03em, #000 0.03em -0.03em, #000 -0.03em -0.03em, #000 0.03em 0.05em, #000 -0.03em 0.05em, #000 0.03em -0.05em, #000 -0.03em -0.05em, #000 0.05em 0px, #000 -0.05em 0px, #000 0.05em 0.03em, #000 -0.05em 0.03em, #000 0.05em -0.03em, #000 -0.05em -0.03em' });
            break;
        case 'none':
            list.push({ name: 'text-shadow', value: 'none' });
            break;
        case 'dropshadow':
        default:
            list.push({ name: 'text-shadow', value: '#000000 0px 0px 7px' });
            break;
    }

    // 背景色设置
    const background = settings.textBackground || 'transparent';
    if (background) {
        list.push({ name: 'background-color', value: background });
    }

    // 字体颜色设置
    const textColor = settings.textColor || '#ffffff';
    if (textColor) {
        list.push({ name: 'color', value: textColor });
    }

    // 字体类型设置
    switch (settings.font || '') {
        case 'typewriter':
            list.push({ name: 'font-family', value: '"Courier New",monospace' });
            list.push({ name: 'font-variant', value: 'none' });
            break;
        case 'print':
            list.push({ name: 'font-family', value: 'Georgia,Times New Roman,Arial,Helvetica,serif' });
            list.push({ name: 'font-variant', value: 'none' });
            break;
        case 'console':
            list.push({ name: 'font-family', value: 'Consolas,Lucida Console,Menlo,Monaco,monospace' });
            list.push({ name: 'font-variant', value: 'none' });
            break;
        case 'cursive':
            list.push({ name: 'font-family', value: 'Lucida Handwriting,Brush Script MT,Segoe Script,cursive,Quintessential,system-ui,-apple-system,BlinkMacSystemFont,sans-serif' });
            list.push({ name: 'font-variant', value: 'none' });
            break;
        case 'casual':
            list.push({ name: 'font-family', value: 'Gabriola,Segoe Print,Comic Sans MS,Chalkboard,Short Stack,system-ui,-apple-system,BlinkMacSystemFont,sans-serif' });
            list.push({ name: 'font-variant', value: 'none' });
            break;
        case 'smallcaps':
            list.push({ name: 'font-family', value: 'Copperplate Gothic,Copperplate Gothic Bold,Copperplate,system-ui,-apple-system,BlinkMacSystemFont,sans-serif' });
            list.push({ name: 'font-variant', value: 'small-caps' });
            break;
        default:
            list.push({ name: 'font-family', value: '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol' });
            list.push({ name: 'font-variant', value: 'none' });
            break;
    }

    // 垂直位置设置（仅非预览模式）
    if (!preview) {
        const pos = parseInt(settings.verticalPosition, 10);
        const lineHeight = 1.35; // FIXME: 最好从元素读取该值
        if (pos < 0) {
            const margin = Math.abs(pos + 1) * lineHeight;
            list.push({ name: 'margin-bottom', value: `${margin}em` });
            list.push({ name: 'margin-top', value: '' });
        } else {
            const margin = pos * lineHeight;
            list.push({ name: 'margin-bottom', value: '' });
            list.push({ name: 'margin-top', value: `${margin}em` });
        }
    }

    return list;
}

/**
 * 生成字幕窗口样式（主要用于定位字幕窗口）。
 * @param {Object} settings - 字幕外观设置对象。
 * @param {boolean} preview - 是否为预览模式。
 * @returns {Array} 样式对象数组。
 */
function getWindowStyles(settings, preview) {
    const list = [];

    // 仅非预览模式下设置窗口位置
    if (!preview) {
        const pos = parseInt(settings.verticalPosition, 10);
        if (pos < 0) {
            list.push({ name: 'top', value: '' });
            list.push({ name: 'bottom', value: '0' });
        } else {
            list.push({ name: 'top', value: '0' });
            list.push({ name: 'bottom', value: '' });
        }
    }

    return list;
}

/**
 * 获取所有字幕样式（文本和窗口）。
 * @param {Object} settings - 字幕外观设置对象。
 * @param {boolean} preview - 是否为预览模式。
 * @returns {Object} 包含 text 和 window 样式的对象。
 */
export function getStyles(settings, preview) {
    return {
        text: getTextStyles(settings, preview),
        window: getWindowStyles(settings, preview)
    };
}

/**
 * 将样式列表应用到指定 DOM 元素。
 * @param {Array} styles - 样式对象数组。
 * @param {HTMLElement} elem - 目标元素。
 */
function applyStyleList(styles, elem) {
    for (let i = 0, length = styles.length; i < length; i++) {
        const style = styles[i];
        elem.style[style.name] = style.value;
    }
}

/**
 * 根据外观设置将样式应用到字幕相关元素。
 * @param {Object} elements - 包含 text 和 window 的元素对象。
 * @param {Object} appearanceSettings - 字幕外观设置。
 */
export function applyStyles(elements, appearanceSettings) {
    const styles = getStyles(appearanceSettings, !!elements.preview);

    if (elements.text) {
        applyStyleList(styles.text, elements.text);
    }
    if (elements.window) {
        applyStyleList(styles.window, elements.window);
    }
}
/**
 * 默认导出：包含 getStyles 和 applyStyles 方法。
 */
export default {
    getStyles: getStyles,
    applyStyles: applyStyles
};
