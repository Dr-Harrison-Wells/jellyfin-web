import actionsheet from '../actionSheet/actionSheet';
import { playbackManager } from '../playback/playbackmanager';
import globalize from 'lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import qualityoptions from '../qualityOptions';

// 播放器设置菜单：根据播放器能力（supportedCommands）和用户策略动态拼装菜单项。
// 本文件只负责“展示菜单 + 分发点击”，具体行为由 playbackManager/外部回调实现。

function showQualityMenu(player, btn) {
    // 清晰度/码率选择：读取当前媒体源的视频流信息（编码、码率等），交给 qualityoptions 生成候选项。
    const videoStream = playbackManager.currentMediaSource(player).MediaStreams.filter(function (stream) {
        return stream.Type === 'Video';
    })[0];

    const videoCodec = videoStream ? videoStream.Codec : null;
    const videoBitRate = videoStream ? videoStream.BitRate : null;

    const options = qualityoptions.getVideoQualityOptions({
        currentMaxBitrate: playbackManager.getMaxStreamingBitrate(player),
        isAutomaticBitrateEnabled: playbackManager.enableAutomaticBitrateDetection(player),
        videoCodec,
        videoBitRate,
        enableAuto: true
    });

    const menuItems = options.map(function (o) {
        const opt = {
            name: o.name,
            id: o.bitrate,
            asideText: o.secondaryText
        };

        if (o.selected) {
            opt.selected = true;
        }

        return opt;
    });

    const selectedId = options.filter(function (o) {
        return o.selected;
    });

    const selectedBitrate = selectedId.length ? selectedId[0].bitrate : null;

    return actionsheet.show({
        items: menuItems,
        positionTo: btn
    }).then(function (id) {
        // actionsheet 返回所选项的 id；这里的 id 对应 bitrate（字符串），需要转成数字。
        const bitrate = parseInt(id, 10);
        if (bitrate !== selectedBitrate) {
            // bitrate 为 0/NaN 时表示“自动”（enableAutomaticBitrateDetection = true）
            playbackManager.setMaxStreamingBitrate({
                enableAutomaticBitrateDetection: !bitrate,
                maxBitrate: bitrate
            }, player);
        }
    });
}

function showRepeatModeMenu(player, btn) {
    // 循环播放模式：RepeatAll / RepeatOne / RepeatNone
    const menuItems = [];
    const currentValue = playbackManager.getRepeatMode(player);

    menuItems.push({
        name: globalize.translate('RepeatAll'),
        id: 'RepeatAll',
        selected: currentValue === 'RepeatAll'
    });

    menuItems.push({
        name: globalize.translate('RepeatOne'),
        id: 'RepeatOne',
        selected: currentValue === 'RepeatOne'
    });

    menuItems.push({
        name: globalize.translate('None'),
        id: 'RepeatNone',
        selected: currentValue === 'RepeatNone'
    });

    return actionsheet.show({
        items: menuItems,
        positionTo: btn
    }).then(function (mode) {
        // mode 为空表示用户取消
        if (mode) {
            playbackManager.setRepeatMode(mode, player);
        }
    });
}

function getQualitySecondaryText(player) {
    // 生成“清晰度”菜单的右侧提示文案（asideText），用于展示当前选择项。
    const state = playbackManager.getPlayerState(player);

    const videoStream = playbackManager.currentMediaSource(player).MediaStreams.filter(function (stream) {
        return stream.Type === 'Video';
    })[0];

    const videoWidth = videoStream ? videoStream.Width : null;
    const videoHeight = videoStream ? videoStream.Height : null;

    const options = qualityoptions.getVideoQualityOptions({
        currentMaxBitrate: playbackManager.getMaxStreamingBitrate(player),
        isAutomaticBitrateEnabled: playbackManager.enableAutomaticBitrateDetection(player),
        videoWidth: videoWidth,
        videoHeight: videoHeight,
        enableAuto: true
    });

    let selectedOption = options.filter(function (o) {
        return o.selected;
    });

    if (!selectedOption.length) {
        return null;
    }

    selectedOption = selectedOption[0];
    let text = selectedOption.name;

    if (selectedOption.autoText) {
        // 自动模式下：若并非转码（Transcode），通常代表直连播放（Direct Play），显示更直观的提示。
        if (state.PlayState && state.PlayState.PlayMethod !== 'Transcode') {
            text += ' - Direct';
        } else {
            text += ' ' + selectedOption.autoText;
        }
    }

    return text;
}

function showAspectRatioMenu(player, btn) {
    // 画面比例：每个选项包含 name 和 id，由播放器能力决定支持哪些比例。
    const currentId = playbackManager.getAspectRatio(player);
    const menuItems = playbackManager.getSupportedAspectRatios(player)
        .map(({ id, name }) => ({
            id,
            name,
            selected: id === currentId
        }));

    return actionsheet.show({
        items: menuItems,
        positionTo: btn
    }).then(function (id) {
        // id 为空表示用户取消
        if (id) {
            playbackManager.setAspectRatio(id, player);
            return Promise.resolve();
        }

        return Promise.reject();
    });
}

function showPlaybackRateMenu(player, btn) {
    // 播放速度：每个选项包含 name 和 id，由播放器能力决定支持哪些倍速。
    const currentId = playbackManager.getPlaybackRate(player);
    const menuItems = playbackManager.getSupportedPlaybackRates(player).map(i => ({
        id: i.id,
        name: i.name,
        selected: i.id === currentId
    }));

    return actionsheet.show({
        items: menuItems,
        positionTo: btn
    }).then(function (id) {
        // id 为空表示用户取消
        if (id) {
            playbackManager.setPlaybackRate(id, player);
            return Promise.resolve();
        }

        return Promise.reject();
    });
}

function showWithUser(options, player, user) {
    // 基于播放器支持的命令与用户策略，动态生成设置菜单项。
    const supportedCommands = playbackManager.getSupportedCommands(player);

    const menuItems = [];
    if (supportedCommands.indexOf('SetAspectRatio') !== -1) {
        // 画面比例（右侧显示当前比例名称）
        const currentAspectRatioId = playbackManager.getAspectRatio(player);
        const currentAspectRatio = playbackManager.getSupportedAspectRatios(player).filter(function (i) {
            return i.id === currentAspectRatioId;
        })[0];

        menuItems.push({
            name: globalize.translate('AspectRatio'),
            id: 'aspectratio',
            asideText: currentAspectRatio ? currentAspectRatio.name : null
        });
    }

    if (supportedCommands.indexOf('PlaybackRate') !== -1) {
        // 播放速度（右侧显示当前倍速名称）
        const currentPlaybackRateId = playbackManager.getPlaybackRate(player);
        const currentPlaybackRate = playbackManager.getSupportedPlaybackRates(player).filter(i => i.id === currentPlaybackRateId)[0];

        menuItems.push({
            name: globalize.translate('PlaybackRate'),
            id: 'playbackrate',
            asideText: currentPlaybackRate ? currentPlaybackRate.name : null
        });
    }

    if (options.quality && supportedCommands.includes('SetMaxStreamingBitrate')
            && user?.Policy?.EnableVideoPlaybackTranscoding) {
        // 清晰度：需要 UI 启用该选项 + 播放器支持设置最大码率 + 当前用户允许视频转码。
        const secondaryQualityText = getQualitySecondaryText(player);

        menuItems.push({
            name: globalize.translate('Quality'),
            id: 'quality',
            asideText: secondaryQualityText
        });
    }

    const repeatMode = playbackManager.getRepeatMode(player);

    if (supportedCommands.indexOf('SetRepeatMode') !== -1 && playbackManager.currentMediaSource(player).RunTimeTicks) {
        // 循环模式：仅在可设置且媒体有时长（RunTimeTicks）时显示。
        menuItems.push({
            name: globalize.translate('RepeatMode'),
            id: 'repeatmode',
            asideText: repeatMode === 'RepeatNone' ? globalize.translate('None') : globalize.translate('' + repeatMode)
        });
    }

    if (options.suboffset) {
        // 字幕偏移：具体处理由外部 options.onOption 回调完成。
        menuItems.push({
            name: globalize.translate('SubtitleOffset'),
            id: 'suboffset',
            asideText: null
        });
    }

    if (options.stats) {
        // 播放统计/数据：具体处理由外部 options.onOption 回调完成。
        menuItems.push({
            name: globalize.translate('PlaybackData'),
            id: 'stats',
            asideText: null
        });
    }

    return actionsheet.show({
        items: menuItems,
        positionTo: options.positionTo
    }).then(function (id) {
        // 将用户选择的菜单 id 分发到对应处理函数
        return handleSelectedOption(id, options, player);
    });
}

export function show(options) {
    // 对外入口：若能拿到 ServerId，则拉取当前用户以便做权限/策略判断。
    const player = options.player;
    const currentItem = playbackManager.currentItem(player);

    if (!currentItem?.ServerId) {
        // 没有服务器上下文（例如本地播放/某些嵌入场景），直接按“无用户信息”展示。
        return showWithUser(options, player, null);
    }

    const apiClient = ServerConnections.getApiClient(currentItem.ServerId);
    return apiClient.getCurrentUser().then(function (user) {
        return showWithUser(options, player, user);
    });
}

function handleSelectedOption(id, options, player) {
    // 菜单项点击后的分发：
    // - 内部选项（quality/aspectratio/playbackrate/repeatmode）会弹出二级菜单
    // - 外部选项（stats/suboffset）交给调用方回调处理
    switch (id) {
        case 'quality':
            return showQualityMenu(player, options.positionTo);
        case 'aspectratio':
            return showAspectRatioMenu(player, options.positionTo);
        case 'playbackrate':
            return showPlaybackRateMenu(player, options.positionTo);
        case 'repeatmode':
            return showRepeatModeMenu(player, options.positionTo);
        case 'stats':
            if (options.onOption) {
                options.onOption('stats');
            }
            return Promise.resolve();
        case 'suboffset':
            if (options.onOption) {
                options.onOption('suboffset');
            }
            return Promise.resolve();
        default:
            break;
    }

    return Promise.reject();
}

export default {
    show: show
};
