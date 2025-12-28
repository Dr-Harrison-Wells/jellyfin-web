
/**
 * Module for display media info.
 * 用于显示媒体信息的模块
 * @module components/itemMediaInfo/itemMediaInfo
 */

import escapeHtml from 'escape-html';

import dialogHelper from 'components/dialogHelper/dialogHelper';
import itemHelper from 'components/itemHelper';
import layoutManager from 'components/layoutManager';
import loading from 'components/loading/loading';
import toast from 'components/toast/toast';
import globalize from 'lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { copy } from 'scripts/clipboard';
import dom from 'scripts/dom';
import { getReadableSize } from 'utils/file';

import 'components/formdialog.scss';
import 'components/listview/listview.scss';
import 'elements/emby-button/emby-button';
import 'elements/emby-button/paper-icon-button-light';
import 'elements/emby-select/emby-select';
import 'material-design-icons-iconfont';

import 'styles/flexstyles.scss';

import template from './itemMediaInfo.template.html';

// Do not add extra spaces between tags - they will be copied into the result
// 标签之间不要添加额外的空格 - 它们会被复制到结果中
const copyButtonHtml = layoutManager.tv ? '' :
    `<button is="paper-icon-button-light" class="btnCopy" title="${globalize.translate('Copy')}" aria-label="${globalize.translate('Copy')}"
        ><span class="material-icons content_copy" aria-hidden="true"></span></button>`;
const attributeDelimiterHtml = layoutManager.tv ? '' : '<span class="hide">: </span>';

/**
 * 设置媒体信息到页面
 * @param {Object} user - 用户对象
 * @param {HTMLElement} page - 页面元素
 * @param {Object} item - 媒体项对象
 */
function setMediaInfo(user, page, item) {
    // 遍历所有媒体源，生成HTML并用分隔线连接
    let html = item.MediaSources.map(version => {
        return getMediaSourceHtml(user, item, version);
    }).join('<div style="border-top:1px solid #444;margin: 1em 0;"></div>');
    if (item.MediaSources.length > 1) {
        html = `<br/>${html}`;
    }
    const mediaInfoContent = page.querySelector('#mediaInfoContent');
    mediaInfoContent.innerHTML = html;

    // 为所有复制按钮添加点击事件监听器
    for (const btn of mediaInfoContent.querySelectorAll('.btnCopy')) {
        btn.addEventListener('click', () => {
            // 找到需要复制的信息块（流信息、源信息或整个内容）
            const infoBlock = dom.parentWithClass(btn, 'mediaInfoStream') || dom.parentWithClass(btn, 'mediaInfoSource') || mediaInfoContent;

            // 复制文本内容到剪贴板
            copy(infoBlock.textContent).then(() => {
                toast(globalize.translate('Copied'));
            }).catch(() => {
                console.error('Could not copy text');
                toast(globalize.translate('CopyFailed'));
            });
        });
    }
}

/**
 * 生成媒体源的HTML内容
 * @param {Object} user - 用户对象
 * @param {Object} item - 媒体项对象
 * @param {Object} version - 媒体源版本对象
 * @returns {string} 生成的HTML字符串
 */
function getMediaSourceHtml(user, item, version) {
    let html = '<div class="mediaInfoSource">';
    if (version.Name) {
        html += `<div><h2 class="mediaInfoStreamType">${escapeHtml(version.Name)}${copyButtonHtml}</h2></div>\n`;
    }
    if (version.Container) {
        html += `${createAttribute(globalize.translate('MediaInfoContainer'), version.Container)}<br/>`;
    }
    if (version.Formats?.length) {
        html += `${createAttribute(globalize.translate('MediaInfoFormat'), version.Formats.join(','))}<br/>`;
    }
    if (version.Path && user?.Policy.IsAdministrator) {
        html += `${createAttribute(globalize.translate('MediaInfoPath'), version.Path, true)}<br/>`;
    }
    if (version.Size) {
        const size = getReadableSize(version.Size);
        html += `${createAttribute(globalize.translate('MediaInfoSize'), size)}<br/>`;
    }
    // 对媒体流进行排序
    version.MediaStreams.sort(itemHelper.sortTracks);
    // 遍历所有媒体流
    for (const stream of version.MediaStreams) {
        // 跳过数据类型的流
        if (stream.Type === 'Data') {
            continue;
        }

        html += '<div class="mediaInfoStream">';
        let translateString;
        // 根据流类型确定翻译字符串
        switch (stream.Type) {
            case 'Audio':
            case 'Data':
            case 'Subtitle':
            case 'Video':
            case 'Lyric':
                translateString = stream.Type;
                break;
            case 'EmbeddedImage':
                translateString = 'Image';
                break;
        }

        const displayType = globalize.translate(translateString);
        html += `\n<h2 class="mediaInfoStreamType">${displayType}${copyButtonHtml}</h2>\n`;
        // 收集流的所有属性
        const attributes = [];
        if (stream.DisplayTitle) {
            attributes.push(createAttribute(globalize.translate('MediaInfoTitle'), stream.DisplayTitle));
        }
        if (stream.Language && stream.Type !== 'Video') {
            attributes.push(createAttribute(globalize.translate('MediaInfoLanguage'), stream.Language));
        }
        if (stream.Codec) {
            attributes.push(createAttribute(globalize.translate('MediaInfoCodec'), stream.Codec.toUpperCase()));
        }
        if (stream.CodecTag) {
            attributes.push(createAttribute(globalize.translate('MediaInfoCodecTag'), stream.CodecTag));
        }
        if (stream.IsAVC != null) {
            attributes.push(createAttribute('AVC', (stream.IsAVC ? 'Yes' : 'No')));
        }
        if (stream.Profile) {
            attributes.push(createAttribute(globalize.translate('MediaInfoProfile'), stream.Profile));
        }
        if (stream.Level > 0) {
            attributes.push(createAttribute(globalize.translate('MediaInfoLevel'), stream.Level));
        }
        if (stream.Width || stream.Height) {
            attributes.push(createAttribute(globalize.translate('MediaInfoResolution'), `${stream.Width}x${stream.Height}`));
        }
        if (stream.AspectRatio && stream.Codec !== 'mjpeg') {
            attributes.push(createAttribute(globalize.translate('MediaInfoAspectRatio'), stream.AspectRatio));
        }
        if (stream.Type === 'Video') {
            if (stream.IsAnamorphic != null) {
                attributes.push(createAttribute(globalize.translate('MediaInfoAnamorphic'), (stream.IsAnamorphic ? 'Yes' : 'No')));
            }
            attributes.push(createAttribute(globalize.translate('MediaInfoInterlaced'), (stream.IsInterlaced ? 'Yes' : 'No')));
        }
        if ((stream.AverageFrameRate || stream.RealFrameRate) && stream.Type === 'Video') {
            attributes.push(createAttribute(globalize.translate('MediaInfoFramerate'), (stream.AverageFrameRate || stream.RealFrameRate)));
        }
        if (stream.ChannelLayout) {
            attributes.push(createAttribute(globalize.translate('MediaInfoLayout'), stream.ChannelLayout));
        }
        if (stream.Channels) {
            attributes.push(createAttribute(globalize.translate('MediaInfoChannels'), `${stream.Channels} ch`));
        }
        if (stream.BitRate) {
            attributes.push(createAttribute(globalize.translate('MediaInfoBitrate'), `${parseInt(stream.BitRate / 1000, 10)} kbps`));
        }
        if (stream.SampleRate) {
            attributes.push(createAttribute(globalize.translate('MediaInfoSampleRate'), `${stream.SampleRate} Hz`));
        }
        if (stream.BitDepth) {
            attributes.push(createAttribute(globalize.translate('MediaInfoBitDepth'), `${stream.BitDepth} bit`));
        }
        if (stream.VideoRange && stream.Type === 'Video') {
            attributes.push(createAttribute(globalize.translate('MediaInfoVideoRange'), stream.VideoRange));
        }
        if (stream.VideoRangeType && stream.Type === 'Video') {
            attributes.push(createAttribute(globalize.translate('MediaInfoVideoRangeType'), stream.VideoRangeType));
        }
        if (stream.VideoDoViTitle) {
            attributes.push(createAttribute(globalize.translate('MediaInfoDoViTitle'), stream.VideoDoViTitle));
            if (stream.DvVersionMajor != null) {
                attributes.push(createAttribute(globalize.translate('MediaInfoDvVersionMajor'), stream.DvVersionMajor));
            }
            if (stream.DvVersionMinor != null) {
                attributes.push(createAttribute(globalize.translate('MediaInfoDvVersionMinor'), stream.DvVersionMinor));
            }
            if (stream.DvProfile != null) {
                attributes.push(createAttribute(globalize.translate('MediaInfoDvProfile'), stream.DvProfile));
            }
            if (stream.DvLevel != null) {
                attributes.push(createAttribute(globalize.translate('MediaInfoDvLevel'), stream.DvLevel));
            }
            if (stream.RpuPresentFlag != null) {
                attributes.push(createAttribute(globalize.translate('MediaInfoRpuPresentFlag'), stream.RpuPresentFlag));
            }
            if (stream.ElPresentFlag != null) {
                attributes.push(createAttribute(globalize.translate('MediaInfoElPresentFlag'), stream.ElPresentFlag));
            }
            if (stream.BlPresentFlag != null) {
                attributes.push(createAttribute(globalize.translate('MediaInfoBlPresentFlag'), stream.BlPresentFlag));
            }
            if (stream.DvBlSignalCompatibilityId != null) {
                attributes.push(createAttribute(globalize.translate('MediaInfoDvBlSignalCompatibilityId'), stream.DvBlSignalCompatibilityId));
            }
        }
        if (stream.ColorSpace) {
            attributes.push(createAttribute(globalize.translate('MediaInfoColorSpace'), stream.ColorSpace));
        }
        if (stream.ColorTransfer) {
            attributes.push(createAttribute(globalize.translate('MediaInfoColorTransfer'), stream.ColorTransfer));
        }
        if (stream.ColorPrimaries) {
            attributes.push(createAttribute(globalize.translate('MediaInfoColorPrimaries'), stream.ColorPrimaries));
        }
        if (stream.PixelFormat) {
            attributes.push(createAttribute(globalize.translate('MediaInfoPixelFormat'), stream.PixelFormat));
        }
        if (stream.RefFrames) {
            attributes.push(createAttribute(globalize.translate('MediaInfoRefFrames'), stream.RefFrames));
        }
        if (stream.Rotation && stream.Type === 'Video') {
            attributes.push(createAttribute(globalize.translate('MediaInfoRotation'), stream.Rotation));
        }
        if (stream.NalLengthSize) {
            attributes.push(createAttribute('NAL', stream.NalLengthSize));
        }
        if (stream.Type === 'Subtitle' || stream.Type === 'Audio') {
            attributes.push(createAttribute(globalize.translate('MediaInfoDefault'), (stream.IsDefault ? 'Yes' : 'No')));
            attributes.push(createAttribute(globalize.translate('MediaInfoForced'), (stream.IsForced ? 'Yes' : 'No')));
            attributes.push(createAttribute(globalize.translate('MediaInfoExternal'), (stream.IsExternal ? 'Yes' : 'No')));
        }
        if (stream.Type === 'Video' && version.Timestamp) {
            attributes.push(createAttribute(globalize.translate('MediaInfoTimestamp'), version.Timestamp));
        }
        html += attributes.join('<br/>');
        html += '</div>';
    }
    html += '</div>';
    return html;
}

/**
 * 创建属性HTML元素
 * 文件路径应始终为从左到右（LTR）。isLtr 参数允许这样做。
 * @param {string} label - 属性标签
 * @param {string} value - 属性值
 * @param {boolean} isLtr - 是否强制从左到右显示
 * @returns {string} 属性的HTML字符串
 */
function createAttribute(label, value, isLtr) {
    return `<span class="mediaInfoLabel">${label}</span>${attributeDelimiterHtml}<span class="mediaInfoAttribute" ${isLtr && 'dir="ltr"'}>${escapeHtml(value)}</span>\n`;
}

/**
 * 加载并显示媒体信息
 * @param {string} itemId - 媒体项ID
 * @param {string} serverId - 服务器ID
 * @returns {Promise} 加载完成的Promise
 */
function loadMediaInfo(itemId, serverId) {
    const apiClient = ServerConnections.getApiClient(serverId);
    // 获取媒体项信息
    return apiClient.getItem(apiClient.getCurrentUserId(), itemId).then(item => {
        // 配置对话框选项
        const dialogOptions = {
            size: 'small',
            removeOnClose: true,
            scrollY: false
        };
        // TV模式下使用全屏对话框
        if (layoutManager.tv) {
            dialogOptions.size = 'fullscreen';
        }
        // 创建对话框
        const dlg = dialogHelper.createDialog(dialogOptions);
        dlg.classList.add('formDialog');
        let html = '';
        html += globalize.translateHtml(template, 'core');
        dlg.innerHTML = html;
        if (layoutManager.tv) {
            dlg.querySelector('.formDialogContent');
        }
        dialogHelper.open(dlg);
        // 为取消按钮添加事件监听器
        dlg.querySelector('.btnCancel').addEventListener('click', () => {
            dialogHelper.close(dlg);
        });
        // 获取当前用户并设置媒体信息
        apiClient.getCurrentUser().then(user => {
            setMediaInfo(user, dlg, item);
        });
        loading.hide();
    });
}

/**
 * 显示媒体信息对话框（导出函数）
 * @param {string} itemId - 媒体项ID
 * @param {string} serverId - 服务器ID
 * @returns {Promise} 返回加载媒体信息的Promise
 */
export function show(itemId, serverId) {
    // 显示加载动画
    loading.show();
    return loadMediaInfo(itemId, serverId);
}

// 默认导出对象
export default {
    show: show
};
