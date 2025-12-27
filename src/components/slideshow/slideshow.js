/**
 * 图片查看器组件
 * Image viewer component
 * @module components/slideshow/slideshow
 */
// 导入应用功能常量
import { AppFeature } from 'constants/appFeature';
// 导入对话框辅助工具
import dialogHelper from '../dialogHelper/dialogHelper';
// 导入服务器连接管理器
import { ServerConnections } from 'lib/jellyfin-apiclient';
// 导入输入管理器
import inputManager from '../../scripts/inputManager';
// 导入布局管理器
import layoutManager from '../layoutManager';
// 导入焦点管理器
import focusManager from '../focusManager';
// 导入浏览器工具
import browser from '../../scripts/browser';
// 导入应用主机
import { appHost } from '../apphost';
// 导入 DOM 工具
import dom from '../../scripts/dom';

// 导入样式文件
import './style.scss';
// 导入 Material Design 图标字体
import 'material-design-icons-iconfont';
// 导入图标按钮组件
import '../../elements/emby-button/paper-icon-button-light';
// 导入全屏插件
import screenfull from 'screenfull';
// 导入随机整数工具函数
import { randomInt } from '../../utils/number.ts';

/**
 * 过渡动画结束事件的名称
 * Name of transition event.
 */
const transitionEndEventName = dom.whichTransitionEvent();

/**
 * 是否使用虚拟图片来修复缩放后图片模糊的问题
 * 至少 WebKit 不会恢复缩放图片的质量
 * Flag to use fake image to fix blurry zoomed image.
 * At least WebKit doesn't restore quality for zoomed images.
 */
const useFakeZoomImage = browser.safari;

/**
 * 从 API 获取项目的图片 URL
 * Retrieves an item's image URL from the API.
 * @param {object|string} item - 用于生成图片 URL 的项目
 * @param {object} options - 图片选项
 * @param {object} apiClient - 用于检索图片的 API 客户端实例
 * @returns {null|string} 项目图片的 URL
 */
function getImageUrl(item, options, apiClient) {
    options = options || {};
    options.type = options.type || 'Primary';

    if (typeof (item) === 'string') {
        return apiClient.getScaledImageUrl(item, options);
    }

    if (item.ImageTags?.[options.type]) {
        options.tag = item.ImageTags[options.type];
        return apiClient.getScaledImageUrl(item.Id, options);
    }

    if (options.type === 'Primary' && item.AlbumId && item.AlbumPrimaryImageTag) {
        options.tag = item.AlbumPrimaryImageTag;
        return apiClient.getScaledImageUrl(item.AlbumId, options);
    }

    return null;
}

/**
 * 从 API 获取背景图片的 URL
 * Retrieves a backdrop's image URL from the API.
 * @param {object} item - 用于生成图片 URL 的项目
 * @param {object} options - 图片选项
 * @param {object} apiClient - 用于检索图片的 API 客户端实例
 * @returns {null|string} 项目背景图片的 URL
 */
function getBackdropImageUrl(item, options, apiClient) {
    options = options || {};
    options.type = options.type || 'Backdrop';

    // 如果不调整大小，则获取原始图片
    // If not resizing, get the original image
    if (!options.maxWidth && !options.width && !options.maxHeight && !options.height && !options.fillWidth && !options.fillHeight) {
        options.quality = 100;
    }

    if (item.BackdropImageTags?.length) {
        options.index = randomInt(0, item.BackdropImageTags.length - 1);
        options.tag = item.BackdropImageTags[options.index];
        return apiClient.getScaledImageUrl(item.Id, options);
    }

    return null;
}

/**
 * 将项目的图片请求分发到相应的处理器
 * Dispatches a request for an item's image to its respective handler.
 * @param {object} item - 用于生成图片 URL 的项目
 * @param {object} user - 用户对象
 * @returns {string} 项目图片的 URL
 */
function getImgUrl(item, user) {
    const apiClient = ServerConnections.getApiClient(item.ServerId);
    const imageOptions = {};

    if (item.BackdropImageTags?.length) {
        return getBackdropImageUrl(item, imageOptions, apiClient);
    } else {
        if (item.MediaType === 'Photo' && user?.Policy.EnableContentDownloading) {
            return apiClient.getItemDownloadUrl(item.Id);
        }
        imageOptions.type = 'Primary';
        return getImageUrl(item, imageOptions, apiClient);
    }
}

/**
 * 使用指定的图标、类和属性生成按钮
 * Generates a button using the specified icon, classes and properties.
 * @param {string} icon - 按钮上的 Material 图标名称
 * @param {string} cssClass - 分配给按钮的 CSS 类
 * @param {boolean} canFocus - 是否将按钮的 tabindex 属性设置为 -1
 * @param {boolean} autoFocus - 是否在按钮上设置 autofocus 属性
 * @returns {string} 按钮的 HTML 标记
 */
function getIcon(icon, cssClass, canFocus, autoFocus) {
    const tabIndex = canFocus ? '' : ' tabindex="-1"';
    autoFocus = autoFocus ? ' autofocus' : '';
    return '<button is="paper-icon-button-light" class="autoSize ' + cssClass + '"' + tabIndex + autoFocus + '><span class="material-icons slideshowButtonIcon ' + icon + '" aria-hidden="true"></span></button>';
}

/**
 * 设置视口元标签以启用或禁用用户缩放
 * Sets the viewport meta tag to enable or disable scaling by the user.
 * @param {boolean} scalable - 设置视口可缩放性的标志
 */
function setUserScalable(scalable) {
    try {
        appHost.setUserScalable(scalable);
    } catch (err) {
        console.error('error in appHost.setUserScalable: ' + err);
    }
}

export default function (options) {
    const self = this;
    /** 已初始化的 Swiper 实例 / Initialized instance of Swiper. */
    let swiperInstance;
    /** 包含 Swiper 实例的对话框的已初始化实例 / Initialized instance of the dialog containing the Swiper instance. */
    let dialog;
    /** 幻灯片组件的选项 / Options of the slideshow components */
    let currentOptions;
    /** 用于隐藏 OSD 的超时 ID / ID of the timeout used to hide the OSD. */
    let hideTimeout;
    /** 鼠标指针的最后坐标 / Last coordinates of the mouse pointer. */
    let lastMouseMoveData;

    /**
     * 创建对话框和 OSD 的 HTML 标记
     * Creates the HTML markup for the dialog and the OSD.
     * @param {Object} slideshowOptions - 用于创建对话框和幻灯片的选项
     */
    function createElements(slideshowOptions) {
        currentOptions = slideshowOptions;

        dialog = dialogHelper.createDialog({
            exitAnimationDuration: slideshowOptions.interactive ? 400 : 800,
            size: 'fullscreen',
            autoFocus: false,
            scrollY: false,
            exitAnimation: 'fadeout',
            removeOnClose: true
        });

        dialog.classList.add('slideshowDialog');

        let html = '';

        html += '<div class="slideshowSwiperContainer"><div class="swiper-wrapper"></div></div>';

        if (slideshowOptions.interactive && !layoutManager.tv) {
            const actionButtonsOnTop = layoutManager.mobile;

            html += getIcon('keyboard_arrow_left', 'btnSlideshowPrevious slideshowButton hide-mouse-idle-tv', false);
            html += getIcon('keyboard_arrow_right', 'btnSlideshowNext slideshowButton hide-mouse-idle-tv', false);

            html += '<div class="topActionButtons">';
            if (actionButtonsOnTop) {
                html += getIcon('play_arrow', 'btnSlideshowPause slideshowButton', true);

                if (appHost.supports(AppFeature.FileDownload) && slideshowOptions.user?.Policy.EnableContentDownloading) {
                    html += getIcon('file_download', 'btnDownload slideshowButton', true);
                }
                if (appHost.supports(AppFeature.Sharing)) {
                    html += getIcon('share', 'btnShare slideshowButton', true);
                }
                if (screenfull.isEnabled) {
                    html += getIcon('fullscreen', 'btnFullscreen', true);
                    html += getIcon('fullscreen_exit', 'btnFullscreenExit hide', true);
                }
            }
            html += getIcon('close', 'slideshowButton btnSlideshowExit hide-mouse-idle-tv', false);
            html += '</div>';

            if (!actionButtonsOnTop) {
                html += '<div class="slideshowBottomBar hide">';

                html += getIcon('play_arrow', 'btnSlideshowPause slideshowButton', true, true);
                if (appHost.supports(AppFeature.FileDownload) && slideshowOptions?.user.Policy.EnableContentDownloading) {
                    html += getIcon('file_download', 'btnDownload slideshowButton', true);
                }
                if (appHost.supports(AppFeature.Sharing)) {
                    html += getIcon('share', 'btnShare slideshowButton', true);
                }
                if (screenfull.isEnabled) {
                    html += getIcon('fullscreen', 'btnFullscreen', true);
                    html += getIcon('fullscreen_exit', 'btnFullscreenExit hide', true);
                }

                html += '</div>';
            }
        } else {
            html += '<div class="slideshowImage"></div><h1 class="slideshowImageText"></h1>';
        }

        dialog.innerHTML = html;

        if (slideshowOptions.interactive && !layoutManager.tv) {
            dialog.querySelector('.btnSlideshowExit').addEventListener('click', function () {
                dialogHelper.close(dialog);
            });

            dialog.querySelector('.btnSlideshowPrevious')?.addEventListener('click', getClickHandler(null));
            dialog.querySelector('.btnSlideshowNext')?.addEventListener('click', getClickHandler(null));

            const btnPause = dialog.querySelector('.btnSlideshowPause');
            if (btnPause) {
                btnPause.addEventListener('click', getClickHandler(playPause));
            }

            const btnDownload = dialog.querySelector('.btnDownload');
            if (btnDownload) {
                btnDownload.addEventListener('click', getClickHandler(download));
            }

            const btnShare = dialog.querySelector('.btnShare');
            if (btnShare) {
                btnShare.addEventListener('click', getClickHandler(share));
            }

            const btnFullscreen = dialog.querySelector('.btnFullscreen');
            if (btnFullscreen) {
                btnFullscreen.addEventListener('click', getClickHandler(fullscreen));
            }

            const btnFullscreenExit = dialog.querySelector('.btnFullscreenExit');
            if (btnFullscreenExit) {
                btnFullscreenExit.addEventListener('click', getClickHandler(fullscreenExit));
            }

            if (screenfull.isEnabled) {
                screenfull.on('change', function () {
                    toggleFullscreenButtons(screenfull.isFullscreen);
                });
            }
        }

        setUserScalable(true);

        dialogHelper.open(dialog).then(function () {
            setUserScalable(false);
        });

        inputManager.on(window, onInputCommand);
        /* eslint-disable-next-line compat/compat */
        document.addEventListener((window.PointerEvent ? 'pointermove' : 'mousemove'), onPointerMove);

        dialog.addEventListener('close', onDialogClosed);

        loadSwiper(dialog, options);

        if (layoutManager.desktop) {
            const topActionButtons = dialog.querySelector('.topActionButtons');
            if (topActionButtons) topActionButtons.classList.add('hide');
        }

        const btnSlideshowPrevious = dialog.querySelector('.btnSlideshowPrevious');
        if (btnSlideshowPrevious) btnSlideshowPrevious.classList.add('hide');
        const btnSlideshowNext = dialog.querySelector('.btnSlideshowNext');
        if (btnSlideshowNext) btnSlideshowNext.classList.add('hide');
    }

    /**
     * 处理自动播放开始时的 OSD 变化
     * Handles OSD changes when the autoplay is started.
     */
    function onAutoplayStart() {
        const btnSlideshowPause = dialog.querySelector('.btnSlideshowPause .material-icons');
        if (btnSlideshowPause) {
            btnSlideshowPause.classList.replace('play_arrow', 'pause');
        }
    }

    /**
     * 处理自动播放停止时的 OSD 变化
     * Handles OSD changes when the autoplay is stopped.
     */
    function onAutoplayStop() {
        const btnSlideshowPause = dialog.querySelector('.btnSlideshowPause .material-icons');
        if (btnSlideshowPause) {
            btnSlideshowPause.classList.replace('pause', 'play_arrow');
        }
    }

    /**
     * 处理缩放变化
     * Handles zoom changes.
     * @param {object} swiper - Swiper 实例
     * @param {number} scale - 缩放比例
     * @param {HTMLElement} imageEl - 图片元素
     * @param {HTMLElement} slideEl - 幻灯片元素
     */
    function onZoomChange(swiper, scale, imageEl, slideEl) {
        const zoomImage = slideEl.querySelector('.swiper-zoom-fakeimg');

        if (zoomImage) {
            zoomImage.style.width = zoomImage.style.height = scale * 100 + '%';

            if (scale > 1) {
                if (zoomImage.classList.contains('swiper-zoom-fakeimg-hidden')) {
                    // 等待 Swiper 样式变化
                    // Await for Swiper style changes
                    setTimeout(() => {
                        const callback = () => {
                            imageEl.removeEventListener(transitionEndEventName, callback);
                            zoomImage.classList.remove('swiper-zoom-fakeimg-hidden');
                        };

                        // Swiper 为自动缩放设置 'transition-duration: 300ms'
                        // 为触摸缩放设置 'transition-duration: 0s'
                        // Swiper set 'transition-duration: 300ms' for auto zoom
                        // and 'transition-duration: 0s' for touch zoom
                        const transitionDuration = parseFloat(imageEl.style.transitionDuration.replace(/[a-z]/i, ''));

                        if (transitionDuration > 0) {
                            imageEl.addEventListener(transitionEndEventName, callback);
                        } else {
                            callback();
                        }
                    }, 0);
                }
            } else {
                zoomImage.classList.add('swiper-zoom-fakeimg-hidden');
            }
        }
    }

    /**
     * 初始化 Swiper 实例并绑定相关事件
     * Initializes the Swiper instance and binds the relevant events.
     * @param {HTMLElement} dialogElement - 包含对话框的元素
     * @param {Object} swiperOptions - 用于初始化 Swiper 实例的选项
     */
    function loadSwiper(dialogElement, swiperOptions) {
        let slides;
        if (currentOptions.slides) {
            slides = currentOptions.slides;
        } else {
            slides = currentOptions.items;
        }

        //eslint-disable-next-line import/no-unresolved
        import('swiper/css/bundle');

        // eslint-disable-next-line import/no-unresolved
        import('swiper/bundle').then(({ Swiper }) => {
            swiperInstance = new Swiper(dialogElement.querySelector('.slideshowSwiperContainer'), {
                direction: 'horizontal',
                // 由于虚拟幻灯片选项不支持循环，因此禁用循环
                // Loop is disabled due to the virtual slides option not supporting it.
                loop: false,
                zoom: {
                    minRatio: 1,
                    toggle: true
                },
                autoplay: swiperOptions.autoplay ?? !swiperOptions.interactive,
                keyboard: {
                    enabled: true
                },
                preloadImages: true,
                slidesPerView: 1,
                slidesPerColumn: 1,
                initialSlide: swiperOptions.startIndex || 0,
                speed: 240,
                navigation: {
                    nextEl: '.btnSlideshowNext',
                    prevEl: '.btnSlideshowPrevious'
                },
                // 虚拟幻灯片减少大型库的内存消耗，同时允许预加载图片
                // Virtual slides reduce memory consumption for large libraries while allowing preloading of images;
                virtual: {
                    slides: slides,
                    cache: true,
                    renderSlide: getSwiperSlideHtml,
                    addSlidesBefore: 1,
                    addSlidesAfter: 1
                }
            });

            swiperInstance.on('autoplayStart', onAutoplayStart);
            swiperInstance.on('autoplayStop', onAutoplayStop);

            if (useFakeZoomImage) {
                swiperInstance.on('zoomChange', onZoomChange);
            }

            if (swiperInstance.autoplay?.running) onAutoplayStart();
        });
    }

    /**
     * 为项目或幻灯片渲染幻灯片的 HTML 标记
     * Renders the HTML markup of a slide for an item or a slide.
     * @param {Object} item - 用于渲染幻灯片的项目
     * @returns {string} 幻灯片的 HTML 标记
     */
    function getSwiperSlideHtml(item) {
        if (currentOptions.slides) {
            return getSwiperSlideHtmlFromSlide(item);
        } else {
            return getSwiperSlideHtmlFromItem(item);
        }
    }

    /**
     * 为项目渲染幻灯片的 HTML 标记
     * Renders the HTML markup of a slide for an item.
     * @param {Object} item - 用于生成幻灯片的项目
     * @returns {string} 幻灯片的 HTML 标记
     */
    function getSwiperSlideHtmlFromItem(item) {
        return getSwiperSlideHtmlFromSlide({
            originalImage: getImgUrl(item, currentOptions.user),
            Id: item.Id,
            ServerId: item.ServerId
        });
    }

    /**
     * 为幻灯片对象渲染幻灯片的 HTML 标记
     * Renders the HTML markup of a slide for a slide object.
     * @param {Object} item - 用于生成幻灯片的幻灯片对象
     * @returns {string} 幻灯片的 HTML 标记
     */
    function getSwiperSlideHtmlFromSlide(item) {
        let html = '';
        html += '<div class="swiper-slide" data-original="' + item.originalImage + '" data-itemid="' + item.Id + '" data-serverid="' + item.ServerId + '">';
        html += '<div class="swiper-zoom-container">';
        if (useFakeZoomImage) {
            html += `<div class="swiper-zoom-fakeimg swiper-zoom-fakeimg-hidden" style="background-image: url('${item.originalImage}')"></div>`;
        }
        html += '<img src="' + item.originalImage + '" class="swiper-slide-img">';
        html += '</div>';
        if (item.title || item.subtitle) {
            html += '<div class="slideText">';
            html += '<div class="slideTextInner">';
            if (item.title) {
                html += '<h1 class="slideTitle">';
                html += item.title;
                html += '</h1>';
            }
            if (item.description) {
                html += '<div class="slideSubtitle">';
                html += item.description;
                html += '</div>';
            }
            html += '</div>';
            html += '</div>';
        }
        html += '</div>';

        return html;
    }

    /**
     * 获取当前显示的幻灯片的信息
     * Fetches the information of the currently displayed slide.
     * @returns {null|{itemId: string, shareUrl: string, serverId: string, url: string}} 包含当前显示幻灯片信息的对象
     */
    function getCurrentImageInfo() {
        if (swiperInstance) {
            const slide = document.querySelector('.swiper-slide-active');

            if (slide) {
                return {
                    url: slide.getAttribute('data-original'),
                    shareUrl: slide.getAttribute('data-original'),
                    itemId: slide.getAttribute('data-itemid'),
                    serverId: slide.getAttribute('data-serverid')
                };
            }
            return null;
        } else {
            return null;
        }
    }

    /**
     * 开始下载当前显示的幻灯片
     * Starts a download for the currently displayed slide.
     */
    function download() {
        const imageInfo = getCurrentImageInfo();

        import('../../scripts/fileDownloader').then((fileDownloader) => {
            fileDownloader.download([imageInfo]);
        });
    }

    /**
     * 使用浏览器内置的分享功能分享当前显示的幻灯片
     * Shares the currently displayed slide using the browser's built-in sharing feature.
     */
    function share() {
        const imageInfo = getCurrentImageInfo();

        navigator.share({
            url: imageInfo.shareUrl
        });
    }

    /**
     * 使用 screenfull 插件进入全屏
     * Goes to fullscreen using screenfull plugin
     */
    function fullscreen() {
        if (!screenfull.isFullscreen) screenfull.request();
        toggleFullscreenButtons(true);
    }

    /**
     * 使用 screenfull 插件退出全屏
     * Exits fullscreen using screenfull plugin
     */
    function fullscreenExit() {
        if (screenfull.isFullscreen) screenfull.exit();
        toggleFullscreenButtons(false);
    }

    /**
     * 更新全屏按钮的显示
     * Updates the display of fullscreen buttons
     * @param {boolean} isFullscreen - 按钮所需的状态是否为全屏
     */
    function toggleFullscreenButtons(isFullscreen) {
        const btnFullscreen = dialog.querySelector('.btnFullscreen');
        const btnFullscreenExit = dialog.querySelector('.btnFullscreenExit');
        if (btnFullscreen) {
            btnFullscreen.classList.toggle('hide', isFullscreen);
        }
        if (btnFullscreenExit) {
            btnFullscreenExit.classList.toggle('hide', !isFullscreen);
        }
    }

    /**
     * 启动 Swiper 实例的自动播放功能
     * Starts the autoplay feature of the Swiper instance.
     */
    function play() {
        if (swiperInstance.autoplay) {
            swiperInstance.autoplay.start();
        }
    }

    /**
     * 暂停 Swiper 实例的自动播放功能
     * Pauses the autoplay feature of the Swiper instance;
     */
    function pause() {
        if (swiperInstance.autoplay) {
            swiperInstance.autoplay.stop();
        }
    }

    /**
     * 切换 Swiper 实例的自动播放功能
     * Toggles the autoplay feature of the Swiper instance.
     */
    function playPause() {
        const paused = !dialog.querySelector('.btnSlideshowPause .material-icons').classList.contains('pause');
        if (paused) {
            play();
        } else {
            pause();
        }
    }

    /**
     * 关闭对话框并销毁 Swiper 实例
     * Closes the dialog and destroys the Swiper instance.
     */
    function onDialogClosed() {
        // 退出全屏
        // Exits fullscreen
        fullscreenExit();

        const swiper = swiperInstance;
        if (swiper) {
            swiper.destroy(true, true);
            swiperInstance = null;
        }

        inputManager.off(window, onInputCommand);
        /* eslint-disable-next-line compat/compat */
        document.removeEventListener((window.PointerEvent ? 'pointermove' : 'mousemove'), onPointerMove);
    }

    /**
     * 显示 OSD（屏幕显示）
     * Shows the OSD.
     */
    function showOsd() {
        const bottom = dialog.querySelector('.slideshowBottomBar');
        if (bottom) {
            slideToShow(bottom, 'down');
        }

        const topActionButtons = dialog.querySelector('.topActionButtons');
        if (topActionButtons) slideToShow(topActionButtons, 'up');

        const left = dialog.querySelector('.btnSlideshowPrevious');
        if (left) slideToShow(left, 'left');

        const right = dialog.querySelector('.btnSlideshowNext');
        if (right) slideToShow(right, 'right');

        startHideTimer();
    }

    /**
     * 隐藏 OSD（屏幕显示）
     * Hides the OSD.
     */
    function hideOsd() {
        const bottom = dialog.querySelector('.slideshowBottomBar');
        if (bottom) {
            slideToHide(bottom, 'down');
        }

        const topActionButtons = dialog.querySelector('.topActionButtons');
        if (topActionButtons) slideToHide(topActionButtons, 'up');

        const left = dialog.querySelector('.btnSlideshowPrevious');
        if (left) slideToHide(left, 'left');

        const right = dialog.querySelector('.btnSlideshowNext');
        if (right) slideToHide(right, 'right');
    }

    /**
     * 启动用于自动隐藏 OSD 的计时器
     * Starts the timer used to automatically hide the OSD.
     */
    function startHideTimer() {
        stopHideTimer();
        hideTimeout = setTimeout(hideOsd, 3000);
    }

    /**
     * 停止用于自动隐藏 OSD 的计时器
     * Stops the timer used to automatically hide the OSD.
     */
    function stopHideTimer() {
        if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
        }
    }

    /**
     * 生成滑动动画的关键帧
     * @param {string} hiddenPosition - 隐藏元素相对于可见时的位置（'down'、'up'、'left'、'right'）
     * @param {*} fadingOut - 是淡出还是淡入
     * @param {HTMLElement} element - 要淡化的元素
     * @returns {Array} 关键帧数组
     */
    function keyframesSlide(hiddenPosition, fadingOut, element) {
        const visible = { transform: 'translate(0,0)', opacity: '1' };
        const invisible = { opacity: '.3' };

        if (hiddenPosition === 'up' || hiddenPosition === 'down') {
            invisible['transform'] = 'translate3d(0,' + element.offsetHeight * (hiddenPosition === 'down' ? 1 : -1) + 'px,0)';
        } else if (hiddenPosition === 'left' || hiddenPosition === 'right') {
            invisible['transform'] = 'translate3d(' + element.offsetWidth * (hiddenPosition === 'right' ? 1 : -1) + 'px,0,0)';
        }

        return fadingOut ? [visible, invisible] : [invisible, visible];
    }

    /**
     * 通过滑动显示元素
     * Shows the element by sliding it into view.
     * @param {HTMLElement} element - 要显示的元素
     * @param {string} slideFrom - 滑入的方向（'down'、'up'、'left'、'right'）
     */
    function slideToShow(element, slideFrom) {
        if (!element.classList.contains('hide')) {
            return;
        }

        element.classList.remove('hide');

        const onFinish = function () {
            const btnSlideshowPause = element.querySelector('.btnSlideshowPause');
            if (btnSlideshowPause) focusManager.focus(btnSlideshowPause);
        };

        if (!element.animate) {
            onFinish();
            return;
        }

        requestAnimationFrame(function () {
            const keyframes = keyframesSlide(slideFrom, false, element);
            const timing = { duration: 300, iterations: 1, easing: 'ease-out' };
            element.animate(keyframes, timing).onfinish = onFinish;
        });
    }

    /**
     * 通过滑动隐藏元素
     * Hides the element by sliding it out of view.
     * @param {HTMLElement} element - 要隐藏的元素
     * @param {string} slideInto - 滑出的方向（'down'、'up'、'left'、'right'）
     */
    function slideToHide(element, slideInto) {
        if (element.classList.contains('hide')) {
            return;
        }

        const onFinish = function () {
            element.classList.add('hide');
        };

        if (!element.animate) {
            onFinish();
            return;
        }

        requestAnimationFrame(function () {
            const keyframes = keyframesSlide(slideInto, true, element);
            const timing = { duration: 300, iterations: 1, easing: 'ease-out' };
            element.animate(keyframes, timing).onfinish = onFinish;
        });
    }

    /**
     * 在移动鼠标指针或触摸屏幕时显示 OSD
     * Shows the OSD when moving the mouse pointer or touching the screen.
     * @param {Event} event - 指针移动事件
     */
    function onPointerMove(event) {
        const pointerType = event.pointerType || (layoutManager.mobile ? 'touch' : 'mouse');

        if (pointerType === 'mouse') {
            const eventX = event.screenX || 0;
            const eventY = event.screenY || 0;

            const obj = lastMouseMoveData;
            if (!obj) {
                lastMouseMoveData = {
                    x: eventX,
                    y: eventY
                };
                return;
            }

            // 如果坐标相同，说明没有移动
            // if coord are same, it didn't move
            if (Math.abs(eventX - obj.x) < 10 && Math.abs(eventY - obj.y) < 10) {
                return;
            }

            obj.x = eventX;
            obj.y = eventY;
        }
        showOsd();
    }

    /**
     * 将键盘输入分发到相应的处理器
     * Dispatches keyboard inputs to their proper handlers.
     * @param {Event} event - 键盘输入事件
     */
    function onInputCommand(event) {
        switch (event.detail.command) {
            case 'up':
            case 'down':
            case 'select':
            case 'menu':
            case 'info':
                showOsd();
                break;
            case 'play':
                play();
                break;
            case 'pause':
                pause();
                break;
            case 'playpause':
                playPause();
                break;
            default:
                break;
        }
    }

    /**
     * 构造点击事件处理器
     * Constructs click event handler.
     * @param {function|null|undefined} callback - 点击事件处理器
     */
    function getClickHandler(callback) {
        return (e) => {
            showOsd();
            callback?.(e);
        };
    }

    /**
     * 显示幻灯片组件
     * Shows the slideshow component.
     */
    self.show = function () {
        createElements(options);
    };

    /**
     * 隐藏幻灯片元素
     * Hides the slideshow element.
     */
    self.hide = function () {
        if (dialog) {
            dialogHelper.close(dialog);
        }
    };
}
