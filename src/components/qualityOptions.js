// 导入全球化/国际化工具
import globalize from '../lib/globalize';

/**
 * 获取视频质量选项
 * @param {Object} options - 配置选项
 * @param {number} options.currentMaxBitrate - 当前最大流式传输比特率
 * @param {number} [options.videoBitRate] - 视频比特率
 * @param {string} [options.videoCodec] - 视频编解码器（如 'hevc', 'av1', 'vp9'）
 * @param {boolean} options.isAutomaticBitrateEnabled - 是否启用自动比特率
 * @param {boolean} options.enableAuto - 是否启用自动选项
 * @returns {Array<Object>} 质量选项数组
 */
export function getVideoQualityOptions(options) {
    // 获取最大流式传输比特率
    const maxStreamingBitrate = options.currentMaxBitrate;
    // 获取视频比特率，默认为 -1
    const videoBitRate = options.videoBitRate ?? -1;
    // 获取视频编解码器
    const videoCodec = options.videoCodec;
    // 参考比特率，初始值为视频比特率
    let referenceBitRate = videoBitRate;

    // 质量选项按比特率索引。如果必须复制它们，请确保每个都是唯一的（通过将最后一位数字设为1）
    // 问题：maxHeight 字段似乎没有在任何地方使用，删除它们是否安全？
    // 比特率配置数组，包含不同质量级别的选项
    const bitrateConfigurations = [
        { name: '120 Mbps', maxHeight: 2160, bitrate: 120000000 },
        { name: '80 Mbps', maxHeight: 2160, bitrate: 80000000 },
        { name: '60 Mbps', maxHeight: 2160, bitrate: 60000000 },
        { name: '40 Mbps', maxHeight: 2160, bitrate: 40000000 },
        { name: '20 Mbps', maxHeight: 2160, bitrate: 20000000 },
        { name: '15 Mbps', maxHeight: 1440, bitrate: 15000000 },
        { name: '10 Mbps', maxHeight: 1440, bitrate: 10000000 },
        { name: '8 Mbps', maxHeight: 1080, bitrate: 8000000 },
        { name: '6 Mbps', maxHeight: 1080, bitrate: 6000000 },
        { name: '4 Mbps', maxHeight: 720, bitrate: 4000000 },
        { name: '3 Mbps', maxHeight: 720, bitrate: 3000000 },
        { name: '1.5 Mbps', maxHeight: 720, bitrate: 1500000 },
        { name: '720 kbps', maxHeight: 480, bitrate: 720000 },
        { name: '420 kbps', maxHeight: 360, bitrate: 420000 }
    ];

    // 初始化质量选项数组
    const qualityOptions = [];

    // 创建自动质量选项
    const autoQualityOption = {
        name: globalize.translate('Auto'), // 翻译后的"自动"文本
        bitrate: 0, // 自动模式比特率为 0
        selected: options.isAutomaticBitrateEnabled // 根据配置决定是否选中
    };

    // 如果启用自动选项，则添加到质量选项数组中
    if (options.enableAuto) {
        qualityOptions.push(autoQualityOption);
    }

    // 如果视频比特率有效且小于最高配置的比特率
    if (videoBitRate > 0 && videoBitRate < bitrateConfigurations[0].bitrate) {
        // 对于高效编解码器（HEVC、AV1、VP9），当比特率不太高时，稍微增加参考比特率
        // 理想情况下，我们只需要在转码为 h264 时执行此操作，但需要额外的 API 请求来获取该信息，这并不理想
        if (videoCodec && ['hevc', 'av1', 'vp9'].includes(videoCodec) && referenceBitRate <= 20000000) {
            referenceBitRate *= 1.5; // 增加 50%
        }
        // 添加一个比特率上限高于视频比特率的选项，以便在自动模式也受限时使用源比特率
        const sourceOptions = bitrateConfigurations.filter((c) => c.bitrate > referenceBitRate).pop();
        qualityOptions.push(sourceOptions);
    }

    // 遍历比特率配置，将符合条件的选项添加到质量选项数组
    bitrateConfigurations.forEach((c) => {
        // 如果视频比特率无效或当前配置的比特率不超过参考比特率，则添加该选项
        if (videoBitRate <= 0 || c.bitrate <= referenceBitRate) {
            qualityOptions.push(c);
        }
    });

    // 如果设置了最大流式传输比特率，则选择合适的质量选项
    if (maxStreamingBitrate) {
        // 默认选择最后一个（最低质量）选项
        let selectedIndex = qualityOptions.length - 1;
        // 从前往后遍历，找到第一个符合最大比特率限制的选项
        for (let i = 0, length = qualityOptions.length; i < length; i++) {
            const option = qualityOptions[i];

            // 如果选项的比特率有效且不超过最大流式传输比特率
            if (option.bitrate > 0 && option.bitrate <= maxStreamingBitrate) {
                selectedIndex = i;
                break;
            }
        }

        const currentQualityOption = qualityOptions[selectedIndex];

        // 如果未启用自动比特率，则标记当前选项为已选中
        if (!options.isAutomaticBitrateEnabled) {
            currentQualityOption.selected = true;
        } else {
            // 如果启用自动比特率，则在自动选项中显示当前选择的质量名称
            autoQualityOption.autoText = currentQualityOption.name;
        }
    }

    return qualityOptions;
}

/**
 * 获取音频质量选项
 * @param {Object} options - 配置选项
 * @param {number} options.currentMaxBitrate - 当前最大流式传输比特率
 * @param {boolean} options.isAutomaticBitrateEnabled - 是否启用自动比特率
 * @param {boolean} options.enableAuto - 是否启用自动选项
 * @returns {Array<Object>} 质量选项数组
 */
export function getAudioQualityOptions(options) {
    // 获取最大流式传输比特率
    const maxStreamingBitrate = options.currentMaxBitrate;

    // 初始化质量选项数组
    const qualityOptions = [];

    // 创建自动质量选项
    const autoQualityOption = {
        name: globalize.translate('Auto'), // 翻译后的"自动"文本
        bitrate: 0, // 自动模式比特率为 0
        selected: options.isAutomaticBitrateEnabled // 根据配置决定是否选中
    };

    // 如果启用自动选项，则添加到质量选项数组中
    if (options.enableAuto) {
        qualityOptions.push(autoQualityOption);
    }

    // 添加预定义的音频质量选项（从高到低）
    qualityOptions.push({ name: '2 Mbps', bitrate: 2000000 }); // 2 Mbps - 最高质量
    qualityOptions.push({ name: '1.5 Mbps', bitrate: 1500000 }); // 1.5 Mbps
    qualityOptions.push({ name: '1 Mbps', bitrate: 1000000 }); // 1 Mbps
    qualityOptions.push({ name: '320 kbps', bitrate: 320000 }); // 320 kbps - 高质量
    qualityOptions.push({ name: '256 kbps', bitrate: 256000 }); // 256 kbps
    qualityOptions.push({ name: '192 kbps', bitrate: 192000 }); // 192 kbps - 标准质量
    qualityOptions.push({ name: '128 kbps', bitrate: 128000 }); // 128 kbps
    qualityOptions.push({ name: '96 kbps', bitrate: 96000 }); // 96 kbps - 中等质量
    qualityOptions.push({ name: '64 kbps', bitrate: 64000 }); // 64 kbps - 最低质量

    // 如果设置了最大流式传输比特率，则选择合适的质量选项
    if (maxStreamingBitrate) {
        // 默认选择最后一个（最低质量）选项
        let selectedIndex = qualityOptions.length - 1;
        // 从前往后遍历，找到第一个符合最大比特率限制的选项
        for (let i = 0, length = qualityOptions.length; i < length; i++) {
            const option = qualityOptions[i];

            // 如果选项的比特率有效且不超过最大流式传输比特率
            if (option.bitrate > 0 && option.bitrate <= maxStreamingBitrate) {
                selectedIndex = i;
                break;
            }
        }

        const currentQualityOption = qualityOptions[selectedIndex];

        // 如果未启用自动比特率，则标记当前选项为已选中
        if (!options.isAutomaticBitrateEnabled) {
            currentQualityOption.selected = true;
        } else {
            // 如果启用自动比特率，则在自动选项中显示当前选择的质量名称
            autoQualityOption.autoText = currentQualityOption.name;
        }
    }

    return qualityOptions;
}

// 导出视频和音频质量选项函数
export default {
    getVideoQualityOptions,
    getAudioQualityOptions
};
