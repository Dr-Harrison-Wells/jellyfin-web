/**
 * Tuner选择器组件
 * 用于检测和选择电视调谐器设备
 */

// 导入对话框助手
import dialogHelper from './dialogHelper/dialogHelper';
// 导入DOM操作工具
import dom from '../scripts/dom';
// 导入布局管理器
import layoutManager from './layoutManager';
// 导入国际化工具
import globalize from '../lib/globalize';
// 导入加载指示器
import loading from './loading/loading';
// 导入浏览器检测工具
import browser from '../scripts/browser';
// 导入焦点管理器
import focusManager from './focusManager';
// 导入滚动助手
import scrollHelper from '../scripts/scrollHelper';
import 'material-design-icons-iconfont';
import './formdialog.scss';
import '../elements/emby-button/emby-button';
import '../elements/emby-itemscontainer/emby-itemscontainer';
import './cardbuilder/card.scss';

// 启用焦点变换效果（在非慢速浏览器和非Edge浏览器中）
const enableFocusTransform = !browser.slow && !browser.edge;

/**
 * 生成编辑器的HTML结构
 * @returns {string} 编辑器的HTML字符串
 */
function getEditorHtml() {
    let html = '';
    // 创建可滚动的对话框内容区域
    html += '<div class="formDialogContent scrollY">';
    html += '<div class="dialogContentInner dialog-content-centered">';
    // 创建加载提示区域（初始隐藏）
    html += '<div class="loadingContent hide">';
    html += '<h1>' + globalize.translate('DetectingDevices') + '...</h1>';
    html += '<p>' + globalize.translate('MessagePleaseWait') + '</p>';
    html += '</div>';
    // 创建设备列表标题（初始隐藏）
    html += '<h1 style="margin-bottom:.25em;" class="devicesHeader hide">' + globalize.translate('HeaderNewDevices') + '</h1>';
    // 创建设备结果容器
    html += '<div is="emby-itemscontainer" class="results vertical-wrap">';
    html += '</div>';
    html += '</div>';
    html += '</div>';
    return html;
}

/**
 * 生成单个设备的HTML卡片
 * @param {Object} device - 设备对象
 * @param {string} device.DeviceId - 设备ID
 * @param {string} device.Type - 设备类型
 * @param {string} device.FriendlyName - 设备友好名称
 * @param {string} device.Url - 设备URL
 * @returns {string} 设备卡片的HTML字符串
 */
function getDeviceHtml(device) {
    let html = '';
    // 设置卡片的基础CSS类
    let cssClass = 'card scalableCard backdropCard backdropCard-scalable';
    const cardBoxCssClass = 'cardBox visualCardBox';
    const padderClass = 'cardPadder-backdrop';

    // TODO 将卡片创建代码移至Card组件

    // 如果是电视布局，添加焦点相关样式
    if (layoutManager.tv) {
        cssClass += ' show-focus';

        if (enableFocusTransform) {
            cssClass += ' show-animation';
        }
    }

    html += '<button type="button" class="' + cssClass + '" data-id="' + device.DeviceId + '" style="min-width:33.3333%;">';
    html += '<div class="' + cardBoxCssClass + '">';
    html += '<div class="cardScalable visualCardBox-cardScalable">';
    html += '<div class="' + padderClass + '"></div>';
    html += '<div class="cardContent searchImage">';
    html += '<div class="cardImageContainer coveredImage"><span class="cardImageIcon material-icons dvr" aria-hidden="true"></span></div>';
    html += '</div>';
    html += '</div>';
    html += '<div class="cardFooter visualCardBox-cardFooter">';
    html += '<div class="cardText cardTextCentered">' + getTunerName(device.Type) + '</div>';
    html += '<div class="cardText cardTextCentered cardText-secondary">' + device.FriendlyName + '</div>';
    html += '<div class="cardText cardText-secondary cardTextCentered">';
    html += device.Url || '&nbsp;';
    html += '</div>';
    html += '</div>';
    html += '</div>';
    html += '</button>';
    return html;
}

/**
 * 根据提供商ID获取调谐器的显示名称
 * @param {string} providerId - 提供商ID
 * @returns {string} 调谐器的友好名称
 */
function getTunerName(providerId) {
    switch (providerId.toLowerCase()) {
        case 'm3u':
            return 'M3U';

        case 'hdhomerun':
            return 'HDHomerun';

        case 'hauppauge':
            return 'Hauppauge';

        case 'satip':
            return 'DVB';

        default:
            return 'Unknown';
    }
}

/**
 * 渲染设备列表到视图中
 * @param {HTMLElement} view - 视图元素
 * @param {Array} devices - 设备数组
 */
function renderDevices(view, devices) {
    let html = '';

    // 遍历所有设备，生成HTML
    for (let i = 0, length = devices.length; i < length; i++) {
        html += getDeviceHtml(devices[i]);
    }

    // 根据设备数量显示或隐藏标题
    if (devices.length) {
        view.querySelector('.devicesHeader').classList.remove('hide');
    } else {
        // 没有找到新设备时显示提示信息
        html = '<p><br/>' + globalize.translate('NoNewDevicesFound') + '</p>';
        view.querySelector('.devicesHeader').classList.add('hide');
    }

    // 将生成的HTML插入到结果容器中
    const elem = view.querySelector('.results');
    elem.innerHTML = html;

    // 在电视布局中自动聚焦
    if (layoutManager.tv) {
        focusManager.autoFocus(elem);
    }
}

/**
 * 发现并获取新的调谐器设备
 * @param {HTMLElement} view - 视图元素
 * @returns {Promise} 返回Promise，解析为设备列表
 */
function discoverDevices(view) {
    // 显示全局加载指示器
    loading.show();
    // 显示加载内容区域
    view.querySelector('.loadingContent').classList.remove('hide');
    // 调用API发现新设备
    return ApiClient.getJSON(ApiClient.getUrl('LiveTv/Tuners/Discover', {
        NewDevicesOnly: true
    })).then(function (devices) {
        // 保存当前设备列表
        currentDevices = devices;
        // 渲染设备到视图
        renderDevices(view, devices);
        // 隐藏加载内容
        view.querySelector('.loadingContent').classList.add('hide');
        // 隐藏全局加载指示器
        loading.hide();
    });
}

/**
 * TunerPicker构造函数
 * 创建调谐器选择器实例
 */
function TunerPicker() {
    /**
     * 显示调谐器选择对话框
     * @returns {Promise} 返回Promise，解析为选中的设备或拒绝
     */
    this.show = function () {
        // 设置对话框选项
        const dialogOptions = {
            removeOnClose: true, // 关闭时移除DOM元素
            scrollY: false // 禁用垂直滚动
        };

        // 根据布局类型设置对话框大小
        if (layoutManager.tv) {
            dialogOptions.size = 'fullscreen'; // 电视布局使用全屏
        } else {
            dialogOptions.size = 'small'; // 其他布局使用小尺寸
        }

        // 创建对话框
        const dlg = dialogHelper.createDialog(dialogOptions);
        dlg.classList.add('formDialog');
        // 构建对话框HTML
        let html = '';
        html += '<div class="formDialogHeader">';
        // 添加返回按钮
        html += `<button is="paper-icon-button-light" class="btnCancel autoSize" tabindex="-1" title="${globalize.translate('ButtonBack')}"><span class="material-icons arrow_back" aria-hidden="true"></span></button>`;
        html += '<h3 class="formDialogHeaderTitle">';
        html += globalize.translate('HeaderLiveTvTunerSetup');
        html += '</h3>';
        html += '</div>';
        // 添加编辑器内容
        html += getEditorHtml();
        dlg.innerHTML = html;
        // 为取消按钮添加点击事件
        dlg.querySelector('.btnCancel').addEventListener('click', function () {
            dialogHelper.close(dlg);
        });
        // 用于保存用户选择的设备
        let deviceResult;
        // 为结果容器添加点击事件监听器
        dlg.querySelector('.results').addEventListener('click', function (e) {
            // 查找被点击的卡片元素
            const tunerCard = dom.parentWithClass(e.target, 'card');

            if (tunerCard) {
                // 获取设备ID
                const deviceId = tunerCard.getAttribute('data-id');
                // 从当前设备列表中找到对应的设备
                deviceResult = currentDevices.filter(function (d) {
                    return d.DeviceId === deviceId;
                })[0];
                // 关闭对话框
                dialogHelper.close(dlg);
            }
        });

        // 在电视布局中启用居中焦点滚动
        if (layoutManager.tv) {
            scrollHelper.centerFocus.on(dlg.querySelector('.formDialogContent'), false);
        }

        // 开始发现设备
        discoverDevices(dlg);

        // 在电视布局中禁用居中焦点滚动
        if (layoutManager.tv) {
            scrollHelper.centerFocus.off(dlg.querySelector('.formDialogContent'), false);
        }

        // 打开对话框并返回Promise
        return dialogHelper.open(dlg).then(function () {
            // 如果用户选择了设备，返回该设备
            if (deviceResult) {
                return Promise.resolve(deviceResult);
            }

            // 用户取消操作，返回拒绝的Promise
            return Promise.reject();
        });
    };
}

// 保存当前发现的设备列表
let currentDevices = [];

// 导出TunerPicker构造函数
export default TunerPicker;
