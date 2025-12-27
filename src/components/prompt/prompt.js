// 导入浏览器检测模块
import browser from '../../scripts/browser';
// 导入对话框帮助工具
import dialogHelper from '../dialogHelper/dialogHelper';
// 导入布局管理器
import layoutManager from '../layoutManager';
// 导入滚动帮助工具
import scrollHelper from '../../scripts/scrollHelper';
// 导入全球化/国际化工具
import globalize from '../../lib/globalize';
// 导入DOM操作工具
import dom from '../../scripts/dom';
// 导入Material Design图标字体
import 'material-design-icons-iconfont';
// 导入自定义按钮组件
import '../../elements/emby-button/emby-button';
import '../../elements/emby-button/paper-icon-button-light';
// 导入自定义输入框组件
import '../../elements/emby-input/emby-input';
// 导入表单对话框样式
import '../formdialog.scss';
// 导入提示框模板
import template from './prompt.template.html';

/**
 * 提示框组件
 * 用于显示输入对话框，获取用户输入
 */
export default (() => {
    /**
     * 设置输入框属性
     * @param {HTMLElement} dlg - 对话框DOM元素
     * @param {Object} options - 选项对象
     */
    function setInputProperties(dlg, options) {
        // 获取输入框元素
        const txtInput = dlg.querySelector('#txtInput');

        // 设置输入框标签
        if (txtInput.label) {
            txtInput.label(options.label || '');
        } else {
            txtInput.setAttribute('label', options.label || '');
        }
        // 设置输入框的初始值
        txtInput.value = options.value || '';
    }

    /**
     * 显示对话框
     * @param {Object} options - 对话框选项
     * @returns {Promise} 返回用户输入的Promise
     */
    function showDialog(options) {
        // 对话框配置选项
        const dialogOptions = {
            removeOnClose: true, // 关闭时移除对话框
            scrollY: false // 禁用垂直滚动
        };

        // 如果是TV模式，设置全屏显示
        if (layoutManager.tv) {
            dialogOptions.size = 'fullscreen';
        }

        // 创建对话框
        const dlg = dialogHelper.createDialog(dialogOptions);

        // 添加表单对话框样式类
        dlg.classList.add('formDialog');

        // 设置对话框HTML内容并翻译
        dlg.innerHTML = globalize.translateHtml(template, 'core');

        // TV模式下启用焦点居中滚动
        if (layoutManager.tv) {
            scrollHelper.centerFocus.on(dlg.querySelector('.formDialogContent'), false);
        } else {
            // 非TV模式下使用迷你对话框样式
            dlg.querySelector('.dialogContentInner').classList.add('dialogContentInner-mini');
            dlg.classList.add('dialog-fullscreen-lowres');
        }

        // 绑定取消按钮点击事件
        dlg.querySelector('.btnCancel').addEventListener('click', () => {
            dialogHelper.close(dlg);
        });

        // 设置对话框标题
        dlg.querySelector('.formDialogHeaderTitle').innerText = options.title || '';

        // 设置描述信息（如果有）
        if (options.description) {
            dlg.querySelector('.fieldDescription').innerText = options.description;
        } else {
            // 没有描述时隐藏描述区域
            dlg.querySelector('.fieldDescription').classList.add('hide');
        }

        // 设置输入框属性
        setInputProperties(dlg, options);

        // 用于存储提交的值
        let submitValue;

        // 绑定表单提交事件
        dlg.querySelector('form').addEventListener('submit', e => {
            // 获取输入框的值
            submitValue = dlg.querySelector('#txtInput').value;
            e.preventDefault();
            e.stopPropagation();

            // 重要：延迟关闭对话框，等待表单提交完成，否则在Chrome中会导致错误
            setTimeout(() => {
                dialogHelper.close(dlg);
            }, 300);

            return false;
        });

        // 设置提交按钮文本
        dlg.querySelector('.submitText').innerText = options.confirmText || globalize.translate('ButtonOk');

        // 设置对话框最小宽度
        dlg.style.minWidth = `${Math.min(400, dom.getWindowSize().innerWidth - 50)}px`;

        // 打开对话框并返回Promise
        return dialogHelper.open(dlg).then(() => {
            // TV模式下关闭焦点居中滚动
            if (layoutManager.tv) {
                scrollHelper.centerFocus.off(dlg.querySelector('.formDialogContent'), false);
            }

            // 如果有提交值，返回该值，否则拒绝Promise
            if (submitValue) {
                return submitValue;
            } else {
                return Promise.reject();
            }
        });
    }

    // 如果是TV或Xbox One平台且支持原生confirm，使用原生prompt
    if ((browser.tv || browser.xboxOne) && window.confirm) {
        return options => {
            // 如果传入的是字符串，转换为选项对象
            if (typeof options === 'string') {
                options = {
                    label: '',
                    text: options
                };
            }

            // 将HTML换行标签替换为换行符
            const label = (options.label || '').replaceAll('<br/>', '\n');
            // 使用原生prompt获取用户输入
            const result = prompt(label, options.text || '');

            // 如果有结果，返回解决的Promise，否则返回拒绝的Promise
            if (result) {
                return Promise.resolve(result);
            } else {
                return Promise.reject(result);
            }
        };
    } else {
        // 其他平台使用自定义对话框
        return options => {
            // 如果传入的是字符串，转换为选项对象
            if (typeof options === 'string') {
                options = {
                    title: '',
                    text: options
                };
            }
            // 显示自定义对话框
            return showDialog(options);
        };
    }
})();
