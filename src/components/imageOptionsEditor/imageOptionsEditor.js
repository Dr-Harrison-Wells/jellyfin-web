
/**
 * 图片选项编辑器模块
 * Module for image Options Editor.
 * @module components/imageOptionsEditor/imageOptionsEditor
 */

// 导入全球化/国际化工具
import globalize from '../../lib/globalize';
// 导入 DOM 操作工具
import dom from '../../scripts/dom';
// 导入对话框助手
import dialogHelper from '../dialogHelper/dialogHelper';
import '../../elements/emby-checkbox/emby-checkbox';
import '../../elements/emby-select/emby-select';
import '../../elements/emby-input/emby-input';
// 导入 HTML 模板
import template from './imageOptionsEditor.template.html';

/**
 * 获取默认的图片配置
 * @param {string} itemType - 项目类型
 * @param {string} type - 图片类型
 * @returns {object} 默认图片配置对象
 */
function getDefaultImageConfig(itemType, type) {
    return {
        Type: type, // 图片类型
        MinWidth: 0, // 最小宽度
        Limit: type === 'Primary' ? 1 : 0 // 限制数量：主图片限制为1张，其他默认为0
    };
}

/**
 * 查找指定类型的图片选项
 * @param {Array} imageOptions - 图片选项数组
 * @param {string} type - 要查找的图片类型
 * @returns {object|undefined} 找到的第一个匹配的图片选项
 */
function findImageOptions(imageOptions, type) {
    return imageOptions.filter(i => {
        return i.Type == type;
    })[0];
}

/**
 * 获取图片配置，按优先级查找：自定义配置 -> 默认配置 -> 生成默认配置
 * @param {object} options - 用户选项
 * @param {object} availableOptions - 可用选项
 * @param {string} imageType - 图片类型
 * @param {string} itemType - 项目类型
 * @returns {object} 图片配置对象
 */
function getImageConfig(options, availableOptions, imageType, itemType) {
    // 依次尝试：当前图片选项 -> 默认图片选项 -> 生成默认配置
    return findImageOptions(options.ImageOptions || [], imageType) || findImageOptions(availableOptions.DefaultImageOptions || [], imageType) || getDefaultImageConfig(itemType, imageType);
}

/**
 * 设置背景图片字段的可见性
 * @param {HTMLElement} elem - 要设置的元素
 * @param {boolean} visible - 是否可见
 */
function setVisibilityOfBackdrops(elem, visible) {
    if (visible) {
        // 显示元素并设置输入框为必填
        elem.classList.remove('hide');
        elem.querySelector('input').setAttribute('required', 'required');
    } else {
        // 隐藏元素并移除必填属性
        elem.classList.add('hide');
        elem.querySelector('input').setAttribute('required', '');
        elem.querySelector('input').removeAttribute('required');
    }
}

/**
 * 加载并显示配置值到表单
 * @param {HTMLElement} context - 对话框上下文元素
 * @param {string} itemType - 项目类型
 * @param {object} options - 当前选项
 * @param {object} availableOptions - 可用选项
 */
function loadValues(context, itemType, options, availableOptions) {
    // 获取支持的图片类型列表
    const supportedImageTypes = availableOptions.SupportedImageTypes || [];
    // 设置背景图片字段的可见性
    setVisibilityOfBackdrops(context.querySelector('.backdropFields'), supportedImageTypes.includes('Backdrop'));
    // 遍历所有图片类型复选框
    Array.prototype.forEach.call(context.querySelectorAll('.imageType'), i => {
        const imageType = i.getAttribute('data-imagetype');
        const container = dom.parentWithTag(i, 'LABEL');

        // 根据是否支持该图片类型来显示或隐藏
        if (!supportedImageTypes.includes(imageType)) {
            container.classList.add('hide');
        } else {
            container.classList.remove('hide');
        }

        // 根据配置的限制值设置复选框状态
        if (getImageConfig(options, availableOptions, imageType, itemType).Limit) {
            i.checked = true;
        } else {
            i.checked = false;
        }
    });
    // 加载背景图片配置
    const backdropConfig = getImageConfig(options, availableOptions, 'Backdrop', itemType);
    context.querySelector('#txtMaxBackdrops').value = backdropConfig.Limit; // 最大背景图片数量
    context.querySelector('#txtMinBackdropDownloadWidth').value = backdropConfig.MinWidth; // 最小下载宽度
}

/**
 * 保存表单中的配置值
 * @param {HTMLElement} context - 对话框上下文元素
 * @param {object} options - 要保存的选项对象
 */
function saveValues(context, options) {
    // 收集所有可见的图片类型配置
    options.ImageOptions = Array.prototype.map.call(context.querySelectorAll('.imageType:not(.hide)'), c => {
        return {
            Type: c.getAttribute('data-imagetype'), // 图片类型
            Limit: c.checked ? 1 : 0, // 限制数量：选中为1，未选中为0
            MinWidth: 0 // 最小宽度
        };
    });
    // 添加背景图片配置
    options.ImageOptions.push({
        Type: 'Backdrop',
        Limit: context.querySelector('#txtMaxBackdrops').value, // 最大背景图片数量
        MinWidth: context.querySelector('#txtMinBackdropDownloadWidth').value // 最小下载宽度
    });
}

/**
 * 图片选项编辑器类
 */
class ImageOptionsEditor {
    /**
     * 显示图片选项编辑器对话框
     * @param {string} itemType - 项目类型
     * @param {object} options - 当前选项
     * @param {object} availableOptions - 可用选项
     */
    show(itemType, options, availableOptions) {
        // 创建对话框
        const dlg = dialogHelper.createDialog({
            size: 'small', // 小尺寸对话框
            removeOnClose: true, // 关闭时移除
            scrollY: false // 禁用垂直滚动
        });
        dlg.classList.add('formDialog');
        // 设置对话框内容为翻译后的模板
        dlg.innerHTML = globalize.translateHtml(template);
        // 监听对话框关闭事件，保存配置
        dlg.addEventListener('close', function () {
            saveValues(dlg, options);
        });
        // 加载当前配置值
        loadValues(dlg, itemType, options, availableOptions);
        // 打开对话框
        dialogHelper.open(dlg).then(() => {
            return;
        }).catch(() => {
            return;
        });
        // 绑定取消按钮点击事件
        dlg.querySelector('.btnCancel').addEventListener('click', function () {
            dialogHelper.close(dlg);
        });
    }
}

export default ImageOptionsEditor;
