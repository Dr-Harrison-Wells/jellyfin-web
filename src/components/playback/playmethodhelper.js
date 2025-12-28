export function getDisplayPlayMethod(session) {
    // 根据会话信息推导一个“展示用”的播放方式字符串（用于 UI 显示）。
    // 注意：这里是“显示名称”的映射/归类，不一定与服务端 PlayMethod 一一对应。
    if (!session.NowPlayingItem) {
        // 没有正在播放的条目时，不显示播放方式。
        return null;
    }

    if ((session.TranscodingInfo?.IsVideoDirect || !session.TranscodingInfo?.VideoCodec) && session.TranscodingInfo?.IsAudioDirect) {
        // 视频未转码（直通或没有视频编码信息）且音频直通：通常表示“封装重封装/仅容器变更”。
        // UI 使用 Remux 作为展示名称。
        return 'Remux';
    } else if (session.TranscodingInfo?.IsVideoDirect) {
        // 视频直通但不满足 Remux 条件：通常表示“直接串流”（可能仍涉及音频处理/封装等）。
        return 'DirectStream';
    } else if (session.PlayState.PlayMethod === 'Transcode') {
        // 明确走转码流程。
        return 'Transcode';
    } else if (session.PlayState.PlayMethod === 'DirectStream') {
        // 服务端标记为 DirectStream 时，UI 侧按 DirectPlay 展示（沿用历史显示口径）。
        return 'DirectPlay';
    } else if (session.PlayState.PlayMethod === 'DirectPlay') {
        // 直接播放。
        return 'DirectPlay';
    }
}

export default {
    getDisplayPlayMethod: getDisplayPlayMethod
};
