// 播放菜单组件 - 用于显示媒体项的播放选项（从头开始播放或从上次位置继续播放）
import actionsheet from './actionSheet/actionSheet';
import datetime from '../scripts/datetime';
import { playbackManager } from './playback/playbackmanager';
import globalize from '../lib/globalize';

/**
 * 显示播放菜单
 * @param {Object} options - 选项对象
 * @param {Object} options.item - 要播放的媒体项
 * @param {Object} options.positionTo - 菜单定位元素
 */
export function show(options) {
    const item = options.item;

    // 获取用户的播放位置（以 ticks 为单位），如果有的话
    const resumePositionTicks = item.UserData ? item.UserData.PlaybackPositionTicks : null;

    // 对于电视节目类型，使用频道 ID；否则使用项目 ID
    // 对于电视节目类型，使用频道 ID；否则使用项目 ID
    const playableItemId = item.Type === 'Program' ? item.ChannelId : item.Id;

    // 如果没有播放进度或者是文件夹，直接开始播放
    if (!resumePositionTicks || item.IsFolder) {
        playbackManager.play({
            ids: [playableItemId],
            serverId: item.ServerId
        });
        return;
    }

    // 构建菜单项数组
    const menuItems = [];

    // 添加"继续播放"选项，显示上次播放位置
    menuItems.push({
        name: globalize.translate('ResumeAt', datetime.getDisplayRunningTime(resumePositionTicks)),
        id: 'resume'
    });

    // 添加"从头开始播放"选项
    menuItems.push({
        name: globalize.translate('PlayFromBeginning'),
        id: 'play'
    });

    // 显示动作菜单
    actionsheet.show({

        items: menuItems,
        positionTo: options.positionTo

    }).then(function (id) {
        // 根据用户选择执行相应的操作
        switch (id) {
            case 'play':
                // 从头开始播放
                playbackManager.play({
                    ids: [playableItemId],
                    serverId: item.ServerId
                });
                break;
            case 'resume':
                // 从上次播放位置继续播放
                playbackManager.play({
                    ids: [playableItemId],
                    startPositionTicks: resumePositionTicks,
                    serverId: item.ServerId
                });
                break;
            case 'queue':
                // 将项目添加到播放队列
                playbackManager.queue({
                    items: [item]
                });
                break;
            case 'shuffle':
                // 随机播放
                playbackManager.shuffle(item);
                break;
            default:
                break;
        }
    });
}

// 导出默认对象
export default {
    show: show
};
