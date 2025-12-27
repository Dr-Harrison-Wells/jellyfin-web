/**
 * 字幕同步组件
 * 用于调整字幕显示的时间偏移，使字幕与视频内容同步
 */

import { playbackManager } from '../playback/playbackmanager';
import layoutManager from '../layoutManager';
import template from './subtitlesync.template.html';
import './subtitlesync.scss';

// 当前播放器实例
let player;
// 字幕同步滑块控件
let subtitleSyncSlider;
// 字幕同步文本输入框
let subtitleSyncTextField;
// 字幕同步关闭按钮
let subtitleSyncCloseButton;
// 字幕同步容器元素
let subtitleSyncContainer;

/**
 * 初始化字幕同步组件
 * @param {Object} instance - SubtitleSync 实例
 */
function init(instance) {
    // 创建父容器并添加到页面
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    parent.innerHTML = template;

    // 获取各个 DOM 元素的引用
    subtitleSyncSlider = parent.querySelector('.subtitleSyncSlider');
    subtitleSyncTextField = parent.querySelector('.subtitleSyncTextField');
    subtitleSyncCloseButton = parent.querySelector('.subtitleSync-closeButton');
    subtitleSyncContainer = parent.querySelector('.subtitleSyncContainer');

    // 针对电视布局的特殊处理
    if (layoutManager.tv) {
        subtitleSyncSlider.classList.add('focusable');
        // 延迟处理：等待元素注册完成（Firefox 浏览器兼容性处理）
        setTimeout(function () {
            subtitleSyncSlider.enableKeyboardDragging();
        }, 0);
    }

    // 默认隐藏字幕同步容器
    subtitleSyncContainer.classList.add('hide');

    /**
     * 更新文本框显示的偏移值
     * @param {number} offset - 偏移值（秒）
     */
    subtitleSyncTextField.updateOffset = function (offset) {
        this.textContent = offset + 's';
    };

    // 点击文本框时保持焦点，防止 OSD（屏幕显示）淡出
    subtitleSyncTextField.addEventListener('click', function () {
        this.hasFocus = true;
    });

    // 处理文本框键盘输入事件
    subtitleSyncTextField.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            // 按下回车键时，解析输入的浮点数偏移值
            let inputOffset = /[-+]?\d+\.?\d*/g.exec(this.textContent);
            if (inputOffset) {
                inputOffset = inputOffset[0];
                inputOffset = parseFloat(inputOffset);

                // 更新滑块偏移值
                subtitleSyncSlider.updateOffset(inputOffset);
            } else {
                // 如果输入无效，恢复当前播放器的偏移值
                this.textContent = (playbackManager.getPlayerSubtitleOffset(player) || 0) + 's';
            }
            this.hasFocus = false;
            event.preventDefault();
        } else {
            // 保持焦点以防止 OSD 淡出
            this.hasFocus = true;
            // 只允许输入 +、-、数字、小数点和 's' 字符
            if (event.key.match(/[+-\d.s]/) === null) {
                event.preventDefault();
            }
        }

        // 待修复：电视布局需要特殊处理导航键，但目前字段不可聚焦
        event.stopPropagation();
    });

    /**
     * 重写文本框失焦方法
     * 当元素仍有焦点时，阻止失焦
     */
    subtitleSyncTextField.blur = function () {
        if (!this.hasFocus && this.prototype) {
            this.prototype.blur();
        }
    };

    /**
     * 更新字幕偏移值
     * 从滑块读取值并应用到播放器，同时更新文本框显示
     */
    function updateSubtitleOffset() {
        const value = parseFloat(subtitleSyncSlider.value);
        // 设置新的偏移值到播放器
        playbackManager.setSubtitleOffset(value, player);
        // 同步更新文本框显示的值
        subtitleSyncTextField.updateOffset(value);
    }

    /**
     * 更新滑块的偏移值
     * @param {number} sliderValue - 偏移值（秒），默认为 0
     */
    subtitleSyncSlider.updateOffset = function (sliderValue) {
        // 默认值为 0 秒 = 0 毫秒
        this.value = sliderValue === undefined ? 0 : sliderValue;

        updateSubtitleOffset();
    };

    // 监听滑块值变化事件
    subtitleSyncSlider.addEventListener('change', () => updateSubtitleOffset());

    /**
     * 生成滑块气泡提示的 HTML
     * @param {*} _ - 未使用的参数
     * @param {number} value - 当前偏移值
     * @returns {string} 气泡提示的 HTML 字符串
     */
    subtitleSyncSlider.getBubbleHtml = function (_, value) {
        return '<h1 class="sliderBubbleText">'
            + (value > 0 ? '+' : '') + parseFloat(value) + 's'
            + '</h1>';
    };

    // 关闭按钮点击事件：禁用字幕偏移显示并强制隐藏组件
    subtitleSyncCloseButton.addEventListener('click', function () {
        playbackManager.disableShowingSubtitleOffset(player);
        SubtitleSync.prototype.toggle('forceToHide');
    });

    // 保存父元素引用到实例
    instance.element = parent;
}

/**
 * 字幕同步类
 * 管理字幕时间偏移的调整界面
 */
class SubtitleSync {
    /**
     * 构造函数
     * @param {Object} currentPlayer - 当前播放器实例
     */
    constructor(currentPlayer) {
        player = currentPlayer;
        init(this);
    }

    /**
     * 销毁组件
     * 清理 DOM 元素和重置播放器状态
     */
    destroy() {
        // 强制隐藏组件
        SubtitleSync.prototype.toggle('forceToHide');
        if (player) {
            // 禁用字幕偏移显示
            playbackManager.disableShowingSubtitleOffset(player);
            // 重置字幕偏移为 0
            playbackManager.setSubtitleOffset(0, player);
        }
        const elem = this.element;
        if (elem) {
            // 从 DOM 中移除元素
            elem.parentNode.removeChild(elem);
            this.element = null;
        }
    }

    /**
     * 切换字幕同步组件的显示状态
     * @param {string} action - 操作类型：'hide'（隐藏）或 'forceToHide'（强制隐藏）
     */
    toggle(action) {
        // 验证 action 参数的有效性
        if (action && !['hide', 'forceToHide'].includes(action)) {
            console.warn('SubtitleSync.toggle called with invalid action', action);
            return;
        }

        // 检查播放器是否支持字幕偏移功能
        if (player && playbackManager.supportSubtitleOffset(player)) {
            if (!action) {
                // 如果启用了字幕偏移显示且当前字幕支持偏移
                if (playbackManager.isShowingSubtitleOffsetEnabled(player) && playbackManager.canHandleOffsetOnCurrentSubtitle(player)) {
                    // 如果未定义字幕偏移或元素没有焦点
                    if (!(playbackManager.getPlayerSubtitleOffset(player) || subtitleSyncTextField.hasFocus)) {
                        // 设置默认偏移值为 0 秒 = 0 毫秒
                        subtitleSyncSlider.value = '0';
                        subtitleSyncTextField.textContent = '0s';
                        playbackManager.setSubtitleOffset(0, player);
                    }
                    // 显示字幕同步组件
                    subtitleSyncContainer.classList.remove('hide');
                    return;
                }
            } else if (action === 'hide' && subtitleSyncTextField.hasFocus) {
                // 如果元素有焦点，不隐藏组件
                return;
            }

            // 隐藏字幕同步组件
            subtitleSyncContainer.classList.add('hide');
        }
    }

    /**
     * 更新字幕偏移值
     * @param {number} offset - 偏移增量（秒）
     */
    update(offset) {
        // 确保组件可见
        this.toggle();

        // 计算新的偏移值
        const value = parseFloat(subtitleSyncSlider.value) + offset;
        subtitleSyncSlider.updateOffset(value);
    }

    /**
     * 增加字幕偏移
     * 按照滑块步长增加偏移值
     */
    incrementOffset() {
        this.update(+subtitleSyncSlider.step);
    }

    /**
     * 减少字幕偏移
     * 按照滑块步长减少偏移值
     */
    decrementOffset() {
        this.update(-subtitleSyncSlider.step);
    }
}

export default SubtitleSync;
