import { playbackManager } from './playbackmanager';
import layoutManager from '../layoutManager';
import Events from '../../utils/events.ts';

// 是否已成功锁定屏幕方向（用于在停止播放时决定是否需要解锁）
let orientationLocked;

function onOrientationChangeSuccess() {
    // 某些实现返回 Promise：成功后标记已锁定
    orientationLocked = true;
}

function onOrientationChangeError(err) {
    // 锁定失败时，确保状态为未锁定，并输出错误便于排查
    orientationLocked = false;
    console.error('error locking orientation: ' + err);
}

Events.on(playbackManager, 'playbackstart', (_e, player) => {
    // 仅在“本地播放器 + 非外部播放器 + 播放的是视频”时才尝试锁定横屏
    const isLocalVideo = player.isLocalPlayer && !player.isExternalPlayer && playbackManager.isPlayingVideo(player);

    // 只在移动端布局时锁定方向（桌面端通常不需要/也不支持锁定）
    if (isLocalVideo && layoutManager.mobile) {
        // 兼容旧版 Screen Orientation API：不同浏览器前缀 / 新版 screen.orientation.lock
        const lockOrientation = window.screen.lockOrientation || window.screen.mozLockOrientation || window.screen.msLockOrientation || (window.screen.orientation?.lock);

        if (lockOrientation) {
            try {
                // 请求锁定到横屏；不同实现可能返回 Promise 或 boolean
                const promise = lockOrientation('landscape');
                if (promise.then) {
                    // Promise 方式：异步成功/失败回调里更新 orientationLocked
                    promise.then(onOrientationChangeSuccess, onOrientationChangeError);
                } else {
                    // returns a boolean
                    // boolean 方式：直接表示是否锁定成功
                    orientationLocked = promise;
                }
            } catch (err) {
                // 某些浏览器/环境可能会抛异常（权限/不支持/用户手势限制等）
                onOrientationChangeError(err);
            }
        }
    }
});

Events.on(playbackManager, 'playbackstop', (_e, playbackStopInfo) => {
    // 只有“之前确实锁过方向”且“不是马上切到下一段媒体”时，才执行解锁
    // nextMediaType 存在时通常表示无缝切换下一项播放：避免频繁解锁/再锁定导致体验抖动
    if (orientationLocked && !playbackStopInfo.nextMediaType) {
        // 兼容旧版解锁 API：不同浏览器前缀 / 新版 screen.orientation.unlock
        const unlockOrientation = window.screen.unlockOrientation || window.screen.mozUnlockOrientation || window.screen.msUnlockOrientation || (window.screen.orientation?.unlock);

        if (unlockOrientation) {
            try {
                // 恢复为系统默认的方向行为
                unlockOrientation();
            } catch (err) {
                console.error('error unlocking orientation: ' + err);
            }
            orientationLocked = false;
        }
    }
});
