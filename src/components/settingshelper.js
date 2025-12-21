// 导入全球化模块，用于处理多语言翻译
import globalize from 'lib/globalize';

/**
 * 设置辅助工具
 * 用于处理设置相关的功能
 * Helper for handling settings.
 * @module components/settingsHelper
 */

/**
 * 填充语言选项到下拉选择框
 * @param {HTMLElement} select - 需要填充的选择框元素
 * @param {Array} languages - 语言列表数组，每个元素包含 ThreeLetterISOLanguageName 和 DisplayName 属性
 */
export function populateLanguages(select, languages) {
    let html = '';

    // 添加"任何语言"选项作为默认选项
    html += "<option value=''>" + globalize.translate('AnyLanguage') + '</option>';

    // 遍历语言列表，为每种语言创建一个选项
    for (let i = 0, length = languages.length; i < length; i++) {
        const culture = languages[i];
        // 使用三字母ISO语言代码作为值，显示名称作为文本
        html += "<option value='" + culture.ThreeLetterISOLanguageName + "'>" + culture.DisplayName + '</option>';
    }

    // 将生成的HTML插入到选择框中
    select.innerHTML = html;
}

// 导出默认对象，包含所有辅助方法
export default {
    populateLanguages: populateLanguages
};
