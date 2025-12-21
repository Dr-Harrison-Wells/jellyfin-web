
import { appHost } from './apphost';
import browser from '../scripts/browser';
import appSettings from '../scripts/settings/appSettings';
import Events from '../utils/events.ts';

/**
 * 在 LayoutManager 实例上设置指定布局的布尔标志并切换 document 根元素的 CSS 类。
 * @param {Object} instance Layout 管理器实例（通常是 `layoutManager`）
 * @param {string} layout 要设置的布局名称（例如 'mobile'/'tv'/'desktop'）
 * @param {string} selectedLayout 当前选中的布局名称
 */
function setLayout(instance, layout, selectedLayout) {
    if (layout === selectedLayout) {
        instance[layout] = true;
        document.documentElement.classList.add('layout-' + layout);
    } else {
        instance[layout] = false;
        document.documentElement.classList.remove('layout-' + layout);
    }
}

class LayoutManager {
    tv = false;
    mobile = false;
    desktop = false;
    experimental = false;

    /**
     * 设置当前布局模式。
     * 如果传入 'auto' 或未指定，则改为调用 `autoLayout()` 自动选择。
     * @param {string} layout 要设置的布局（'mobile'|'tv'|'desktop'|'experimental'|'auto'）
     * @param {boolean} [save] 是否将选择保存到应用设置（默认为 true）
     */
    setLayout(layout, save) {
        if (!layout || layout === 'auto') {
            this.autoLayout();

            if (save !== false) {
                appSettings.set('layout', '');
            }
        } else {
            setLayout(this, 'mobile', layout);
            setLayout(this, 'tv', layout);
            setLayout(this, 'desktop', layout);

            this.experimental = layout === 'experimental';
            if (this.experimental) {
                const legacyLayoutMode = browser.mobile ? 'mobile' : this.defaultLayout || 'desktop';
                setLayout(this, legacyLayoutMode, legacyLayoutMode);
            }

            if (save !== false) {
                appSettings.set('layout', layout);
            }
        }

        Events.trigger(this, 'modechange');
    }

    /**
     * 获取已保存的布局设置（如果存在）。
     * @returns {string} 保存的布局名称或空字符串
     */
    getSavedLayout() {
        return appSettings.get('layout');
    }

    /**
     * 根据运行环境猜测并设置初始布局：移动设备 -> 'mobile'，
     * TV/主机 -> 'tv'，否则使用默认或 'tv'。
     */
    autoLayout() {
        // Take a guess at initial layout. The consuming app can override
        if (browser.mobile) {
            this.setLayout('mobile', false);
        } else if (browser.tv || browser.xboxOne || browser.ps4) {
            this.setLayout('tv', false);
        } else {
            this.setLayout(this.defaultLayout || 'tv', false);
        }
    }

    /**
     * 初始化布局管理器：尝试使用保存的布局，否则使用自动检测。
     */
    init() {
        const saved = this.getSavedLayout();
        if (saved) {
            this.setLayout(saved, false);
        } else {
            this.autoLayout();
        }
    }
}

const layoutManager = new LayoutManager();

if (appHost.getDefaultLayout) {
    layoutManager.defaultLayout = appHost.getDefaultLayout();
}

layoutManager.init();

export default layoutManager;
