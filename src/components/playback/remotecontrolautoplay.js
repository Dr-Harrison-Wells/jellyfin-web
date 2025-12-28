import { playbackManager } from '../playback/playbackmanager';
import Events from '../../utils/events.ts';

// 当播放器从“本地播放器”切换到“远程播放器”（例如投屏/远程控制）时：
// 这个模块会尝试把当前播放队列、播放进度等状态从旧播放器转移到新播放器，
// 以实现“自动接管/续播”的体验。

function transferPlayback(oldPlayer, newPlayer) {
    // 从旧播放器读取当前播放状态
    const state = playbackManager.getPlayerState(oldPlayer);
    const item = state.NowPlayingItem;

    // 没有正在播放的条目时，无需转移
    if (!item) {
        return;
    }

    // 获取旧播放器的播放列表（队列），以便在新播放器上按同一队列继续播放
    playbackManager.getPlaylist(oldPlayer).then(playlist => {
        const playlistIds = playlist.map(x => x.Id);
        const playState = state.PlayState || {};
        // 续播位置（ticks）
        const resumePositionTicks = playState.PositionTicks || 0;
        // 计算当前播放条目在队列中的位置
        // 注意：indexOf 找不到会返回 -1（这里保持原有逻辑不做修正）。
        const playlistIndex = playlistIds.indexOf(item.Id) || 0;

        // 先停止旧播放器，再在新播放器上开始播放（避免两边同时播放）
        playbackManager.stop(oldPlayer).then(() => {
            playbackManager.play({
                ids: playlistIds,
                serverId: item.ServerId,
                startPositionTicks: resumePositionTicks,
                startIndex: playlistIndex
            }, newPlayer);
        });
    });
}

// 监听 playbackManager 的 playerchange 事件：
// 仅在“旧播放器是本地播放器 && 新播放器是远程播放器”时触发转移。
Events.on(playbackManager, 'playerchange', (e, newPlayer, newTarget, oldPlayer) => {
    if (!oldPlayer || !newPlayer) {
        return;
    }

    if (!oldPlayer.isLocalPlayer) {
        // 旧播放器本身就是远程播放器时，不做自动转移
        console.debug('Skipping remote control autoplay because oldPlayer is not a local player');
        return;
    }

    if (newPlayer.isLocalPlayer) {
        // 新播放器仍是本地播放器时，不做自动转移
        console.debug('Skipping remote control autoplay because newPlayer is a local player');
        return;
    }

    // 满足条件：从本地切到远端，开始转移播放状态
    transferPlayback(oldPlayer, newPlayer);
});
