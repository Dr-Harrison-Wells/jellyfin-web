// 导入应用路由器
import { appRouter } from './router/appRouter';
// 导入浏览器检测工具
import browser from '../scripts/browser';
// 导入对话框组件
import dialog from './dialog/dialog';
// 导入全球化/国际化工具
import globalize from '../lib/globalize';

/**
 * 显示警告提示框
 * @param {string|object} text - 提示文本或选项对象
 * @param {string} title - 标题（当text为字符串时使用）
 * @returns {Promise} 返回Promise对象
 */
export default async function (text, title) {
    // 在 Web OS 和 Tizen 2.x 上，模态框似乎被阻止了
    // 检测是否可以使用原生警告框
    const canUseNativeAlert = !!(
        !browser.web0s // 不是 Web OS
        && !(browser.tizenVersion && (browser.tizenVersion < 3 || browser.tizenVersion >= 8)) // 不是 Tizen 2.x 或 8.x+
        && browser.tv // 是电视浏览器
        && window.alert // 支持原生 alert
    );

    // 如果 text 是字符串，则构造选项对象；否则直接使用传入的选项对象
    const options = typeof text === 'string' ? { title, text } : text;

    // 等待应用路由器准备就绪
    await appRouter.ready();

    // 如果可以使用原生警告框
    if (canUseNativeAlert) {
        // 使用原生 alert，将 HTML 换行标签替换为换行符
        alert((options.text || '').replaceAll('<br/>', '\n'));

        return Promise.resolve();
    }

    // 配置对话框按钮
    options.buttons = [
        {
            name: globalize.translate('ButtonGotIt'), // 翻译"知道了"按钮文本
            id: 'ok',
            type: 'submit'
        }
    ];

    // 使用自定义对话框显示
    return dialog.show(options);
}
