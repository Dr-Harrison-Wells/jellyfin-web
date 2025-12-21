import loading from 'components/loading/loading';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import Dashboard from 'utils/dashboard';
import dom from 'scripts/dom';

import 'elements/emby-button/emby-button';
import 'elements/emby-select/emby-select';

/*
 * 向导开始页控制器
 * 负责：
 * - 在视图显示时加载当前服务器名称、语言等配置信息并填充表单字段
 * - 在提交表单时保存配置并导航到下一个向导步骤
 */

// 填充页面字段：服务器名称和本地化语言选项
// 参数：
// - page: 向导页面 DOM 节点
// - systemInfo: 来自 API 的系统信息（包含默认 ServerName）
// - config: 当前启动/配置对象（包含 ServerName、UICulture）
// - languageOptions: 本地化语言选项数组
function loadPage(page, systemInfo, config, languageOptions) {
    const serverNameElem = page.querySelector('#txtServerName');
    // 优先使用已保存的配置；若无则使用系统信息提供的名称
    serverNameElem.value = config.ServerName || systemInfo.ServerName;

    const languageElem = page.querySelector('#selectLocalizationLanguage');
    // 将语言选项渲染为 <option> 列表
    languageElem.innerHTML = languageOptions.map(function (l) {
        return '<option value="' + l.Value + '">' + l.Name + '</option>';
    }).join('');
    // 选择当前配置中的 UI 语言
    languageElem.value = config.UICulture;

    // 完成加载后隐藏 loading 状态
    loading.hide();
}

// 将页面上的设置保存到服务器并导航到下一个向导步骤
// page: 表单所在的页面节点
function save(page) {
    loading.show();
    const apiClient = ServerConnections.currentApiClient();

    // 先获取当前服务器端配置对象（以保证完整性），再修改并提交
    apiClient.getJSON(apiClient.getUrl('Startup/Configuration')).then(function (config) {
        // 从页面读取新的值并写回配置对象
        config.ServerName = page.querySelector('#txtServerName').value;
        config.UICulture = page.querySelector('#selectLocalizationLanguage').value;

        // 以 JSON POST 提交配置
        apiClient.ajax({
            type: 'POST',
            data: JSON.stringify(config),
            url: apiClient.getUrl('Startup/Configuration'),
            contentType: 'application/json'
        }).then(function () {
            // 提交成功后前往用户创建步骤
            Dashboard.navigate('wizard/user');
        });
    });
}

// 表单提交处理器：阻止默认提交并调用 save
function onSubmit(e) {
    e.preventDefault();
    // this 为触发事件的表单元素，向上查找包含类名为 'page' 的父节点作为保存上下文
    save(dom.parentWithClass(this, 'page'));
}

// 初始化视图：绑定提交事件以及视图显示/隐藏时的处理
export default function (view) {
    // 绑定表单提交处理器
    view.querySelector('.wizardStartForm').addEventListener('submit', onSubmit);

    // 当视图显示时，加载所需数据并填充表单
    view.addEventListener('viewshow', function () {
        // 隐藏主页按钮样式（特定主题/皮肤相关）
        document.querySelector('.skinHeader').classList.add('noHomeButtonHeader');
        loading.show();
        const page = this;
        const apiClient = ServerConnections.currentApiClient();

        // 并行请求：系统信息、当前启动配置、语言选项
        Promise.all([
            apiClient.getPublicSystemInfo(),
            apiClient.getJSON(apiClient.getUrl('Startup/Configuration')),
            apiClient.getJSON(apiClient.getUrl('Localization/Options'))
        ]).then(([ systemInfo, config, languageOptions ]) => {
            loadPage(page, systemInfo, config, languageOptions);
        });
    });

    // 恢复 header 状态
    view.addEventListener('viewhide', function () {
        document.querySelector('.skinHeader').classList.remove('noHomeButtonHeader');
    });
}
