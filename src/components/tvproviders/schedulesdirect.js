// 导入依赖项
import 'jquery'; // jQuery 库
import loading from '../loading/loading'; // 加载动画组件
import globalize from '../../lib/globalize'; // 国际化工具
import '../../elements/emby-checkbox/emby-checkbox'; // 复选框组件
import '../../elements/emby-input/emby-input'; // 输入框组件
import '../listview/listview.scss'; // 列表视图样式
import '../../elements/emby-button/paper-icon-button-light'; // 图标按钮组件
import '../../elements/emby-select/emby-select'; // 下拉选择组件
import '../../elements/emby-button/emby-button'; // 按钮组件
import '../../styles/flexstyles.scss'; // Flex 布局样式
import './style.scss'; // 本地样式
import Dashboard from '../../utils/dashboard'; // Dashboard 工具类
import Events from '../../utils/events.ts'; // 事件管理器

/**
 * 根据提供商 ID 获取调谐器名称
 * @param {string} providerId - 提供商 ID
 * @returns {string} 调谐器显示名称
 */
function getTunerName(providerId) {
    switch (providerId.toLowerCase()) {
        case 'm3u':
            return 'M3U Playlist';
        case 'hdhomerun':
            return 'HDHomerun';
        case 'satip':
            return 'DVB';
        default:
            return 'Unknown';
    }
}

/**
 * 刷新调谐器设备列表
 * @param {HTMLElement} page - 页面元素
 * @param {Object} providerInfo - 提供商信息
 * @param {Array} devices - 设备列表
 */
function refreshTunerDevices(page, providerInfo, devices) {
    let html = '';

    // 遍历所有设备并生成 HTML
    for (let i = 0, length = devices.length; i < length; i++) {
        const device = devices[i];
        html += '<div class="listItem">';
        const enabledTuners = providerInfo.EnabledTuners || [];
        // 检查设备是否已启用
        const isChecked = providerInfo.EnableAllTuners || enabledTuners.indexOf(device.Id) !== -1;
        const checkedAttribute = isChecked ? ' checked' : '';
        // 添加复选框
        html += '<label class="checkboxContainer listItemCheckboxContainer"><input type="checkbox" is="emby-checkbox" data-id="' + device.Id + '" class="chkTuner" ' + checkedAttribute + '/><span></span></label>';
        html += '<div class="listItemBody two-line">';
        html += '<div class="listItemBodyText">';
        // 显示设备名称
        html += device.FriendlyName || getTunerName(device.Type);
        html += '</div>';
        html += '<div class="listItemBodyText secondary">';
        // 显示设备 URL
        html += device.Url;
        html += '</div>';
        html += '</div>';
        html += '</div>';
    }

    // 更新页面上的调谐器列表
    page.querySelector('.tunerList').innerHTML = html;
}

/**
 * SchedulesDirect 电视提供商配置组件
 * @param {HTMLElement} page - 页面元素
 * @param {string} providerId - 提供商 ID
 * @param {Object} options - 配置选项
 */
export default function (page, providerId, options) {
    /**
     * 重新加载提供商配置信息
     */
    function reload() {
        loading.show();
        // 获取直播电视配置
        ApiClient.getNamedConfiguration('livetv').then(function (config) {
            // 根据 providerId 过滤出对应的提供商信息
            const info = config.ListingProviders.filter(function (i) {
                return i.Id === providerId;
            })[0] || {};
            listingsId = info.ListingsId;
            // 填充表单字段
            page.querySelector('#selectListing').value = info.ListingsId || '';
            page.querySelector('.txtUser').value = info.Username || '';
            page.querySelector('.txtPass').value = '';
            page.querySelector('.txtZipCode').value = info.ZipCode || '';

            // 如果已有用户名和密码，显示列表选择区域
            if (info.Username && info.Password) {
                page.querySelector('.listingsSection').classList.remove('hide');
            } else {
                page.querySelector('.listingsSection').classList.add('hide');
            }

            // 设置"启用所有调谐器"复选框状态
            page.querySelector('.chkAllTuners').checked = info.EnableAllTuners;

            // 根据是否启用所有调谐器来显示/隐藏调谐器选择区域
            if (info.EnableAllTuners) {
                page.querySelector('.selectTunersSection').classList.add('hide');
            } else {
                page.querySelector('.selectTunersSection').classList.remove('hide');
            }

            // 设置国家信息
            setCountry(info);
            // 刷新调谐器设备列表
            refreshTunerDevices(page, info, config.TunerHosts);
        });
    }

    /**
     * 设置国家下拉列表
     * @param {Object} info - 提供商信息
     */
    function setCountry(info) {
        // 获取 SchedulesDirect 支持的国家列表
        ApiClient.getJSON(ApiClient.getUrl('LiveTv/ListingProviders/SchedulesDirect/Countries')).then(function (result) {
            let i;
            let length;
            const countryList = [];

            // 遍历所有地区
            for (const region in result) {
                const countries = result[region];

                // 排除 'ZZZ' 地区，收集所有国家信息
                if (countries.length && region !== 'ZZZ') {
                    for (i = 0, length = countries.length; i < length; i++) {
                        countryList.push({
                            name: countries[i].fullName,
                            value: countries[i].shortName
                        });
                    }
                }
            }

            // 按国家名称排序
            countryList.sort(function (a, b) {
                if (a.name > b.name) {
                    return 1;
                }

                if (a.name < b.name) {
                    return -1;
                }

                return 0;
            });
            // 填充国家下拉列表并设置当前值
            $('#selectCountry', page).html(countryList.map(function (c) {
                return '<option value="' + c.value + '">' + c.name + '</option>';
            }).join('')).val(info.Country || '');
            // 触发邮编输入框的 change 事件
            page.querySelector('.txtZipCode').dispatchEvent(new Event('change'));
        }, function () { // ApiClient.getJSON() 错误处理
            Dashboard.alert({
                message: globalize.translate('ErrorGettingTvLineups')
            });
        });
        loading.hide();
    }

    /**
     * 提交登录表单
     * 验证 SchedulesDirect 账户并保存凭据
     */
    function submitLoginForm() {
        loading.show();
        // 构建提供商信息对象
        const info = {
            Type: 'SchedulesDirect',
            Username: page.querySelector('.txtUser').value,
            EnableAllTuners: true,
            Password: page.querySelector('.txtPass').value
        };
        const id = providerId;

        // 如果存在提供商 ID，则添加到信息中（用于更新现有配置）
        if (id) {
            info.Id = id;
        }

        // 发送 POST 请求验证登录并保存配置
        ApiClient.ajax({
            type: 'POST',
            url: ApiClient.getUrl('LiveTv/ListingProviders', {
                ValidateLogin: true // 验证登录凭据
            }),
            data: JSON.stringify(info),
            contentType: 'application/json',
            dataType: 'json'
        }).then(function (result) {
            // 处理服务器配置更新结果
            Dashboard.processServerConfigurationUpdateResult();
            providerId = result.Id;
            reload(); // 重新加载配置
        }, function () {
            // 显示保存失败提示
            Dashboard.alert({
                message: globalize.translate('ErrorSavingTvProvider')
            });
        });
    }

    /**
     * 提交列表选择表单
     * 保存所选的节目列表和调谐器配置
     */
    function submitListingsForm() {
        const selectedListingsId = page.querySelector('#selectListing').value;

        // 验证是否已选择列表
        if (!selectedListingsId) {
            Dashboard.alert({
                message: globalize.translate('ErrorPleaseSelectLineup')
            });
            return;
        }

        loading.show();
        const id = providerId;
        // 获取当前直播电视配置
        ApiClient.getNamedConfiguration('livetv').then(function (config) {
            // 找到对应的提供商信息
            const info = config.ListingProviders.filter(function (i) {
                return i.Id === id;
            })[0];
            // 更新配置信息
            info.ZipCode = page.querySelector('.txtZipCode').value;
            info.Country = page.querySelector('#selectCountry').value;
            info.ListingsId = selectedListingsId;
            info.EnableAllTuners = page.querySelector('.chkAllTuners').checked;
            // 如果未启用所有调谐器，则获取选中的调谐器 ID 列表
            info.EnabledTuners = info.EnableAllTuners ? [] : $('.chkTuner', page).get().filter(function (i) {
                return i.checked;
            }).map(function (i) {
                return i.getAttribute('data-id');
            });
            // 发送 POST 请求保存配置并验证列表
            ApiClient.ajax({
                type: 'POST',
                url: ApiClient.getUrl('LiveTv/ListingProviders', {
                    ValidateListings: true // 验证节目列表
                }),
                data: JSON.stringify(info),
                contentType: 'application/json'
            }).then(function () {
                loading.hide();

                // 如果需要显示确认信息
                if (options.showConfirmation) {
                    Dashboard.processServerConfigurationUpdateResult();
                }

                // 触发提交事件
                Events.trigger(self, 'submitted');
            }, function () {
                loading.hide();
                Dashboard.alert({
                    message: globalize.translate('ErrorAddingListingsToSchedulesDirect')
                });
            });
        });
    }

    /**
     * 刷新节目列表下拉选项
     * @param {string} value - 邮政编码或位置信息
     */
    function refreshListings(value) {
        // 如果没有提供位置信息，清空列表
        if (!value) {
            page.querySelector('#selectListing').innerHTML = '';
            return;
        }

        loading.show();
        // 根据位置信息获取可用的节目列表
        ApiClient.ajax({
            type: 'GET',
            url: ApiClient.getUrl('LiveTv/ListingProviders/Lineups', {
                Id: providerId,
                Location: value, // 位置（邮编）
                Country: page.querySelector('#selectCountry').value // 国家
            }),
            dataType: 'json'
        }).then(function (result) {
            // 填充节目列表下拉选项
            page.querySelector('#selectListing').innerHTML = result.map(function (o) {
                return '<option value="' + o.Id + '">' + o.Name + '</option>';
            }).join('');

            // 如果之前已选择列表，恢复选择
            if (listingsId) {
                page.querySelector('#selectListing').value = listingsId;
            }

            loading.hide();
        }, function () {
            // 获取失败时显示错误提示
            Dashboard.alert({
                message: globalize.translate('ErrorGettingTvLineups')
            });
            refreshListings(''); // 清空列表
            loading.hide();
        });
    }

    let listingsId; // 当前选择的节目列表 ID
    const self = this;

    /**
     * 提交表单
     */
    self.submit = function () {
        page.querySelector('.btnSubmitListingsContainer').click();
    };

    /**
     * 初始化组件
     */
    self.init = function () {
        options = options || {};

        // 仅当明确设置为 false 时才隐藏按钮；默认显示按钮
        // FIXME: 重命名此选项以澄清逻辑
        const hideCancelButton = options.showCancelButton === false;
        page.querySelector('.btnCancel').classList.toggle('hide', hideCancelButton);

        const hideSubmitButton = options.showSubmitButton === false;
        page.querySelector('.btnSubmitListings').classList.toggle('hide', hideSubmitButton);

        // 绑定登录表单提交事件
        page.querySelector('.formLogin').addEventListener('submit', function (e) {
            e.preventDefault();
            submitLoginForm();
        });

        // 绑定列表表单提交事件
        page.querySelector('.formListings').addEventListener('submit', function (e) {
            e.preventDefault();
            submitListingsForm();
        });

        // 邮政编码改变时刷新节目列表
        page.querySelector('.txtZipCode').addEventListener('change', function () {
            refreshListings(this.value);
        });

        // "启用所有调谐器"复选框状态改变时切换调谐器选择区域的可见性
        page.querySelector('.chkAllTuners').addEventListener('change', function (e) {
            if (e.target.checked) {
                page.querySelector('.selectTunersSection').classList.add('hide');
            } else {
                page.querySelector('.selectTunersSection').classList.remove('hide');
            }
        });

        // 显示创建账户帮助信息
        $('.createAccountHelp', page).html(globalize.translate('MessageCreateAccountAt', '<a is="emby-linkbutton" class="button-link" href="http://www.schedulesdirect.org" target="_blank">http://www.schedulesdirect.org</a>'));

        // 加载现有配置
        reload();
    };
}
