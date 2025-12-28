import { randomInt } from '../../utils/number.ts';

let currentId = 0;
function addUniquePlaylistItemId(item) {
    // 为队列中的每个条目补齐一个稳定的唯一标识。
    // 说明：部分来源的数据可能没有 PlaylistItemId；这里用递增计数生成。
    if (!item.PlaylistItemId) {
        item.PlaylistItemId = 'playlistItem' + currentId;
        currentId++;
    }
}

function findPlaylistIndex(playlistItemId, list) {
    // 在指定列表里查找对应 PlaylistItemId 的索引。
    // 找不到则返回 -1（与 Array#indexOf 语义一致）。
    for (let i = 0, length = list.length; i < length; i++) {
        if (list[i].PlaylistItemId === playlistItemId) {
            return i;
        }
    }

    return -1;
}

class PlayQueueManager {
    constructor() {
        // _playlist: 当前“生效”的播放队列（可能是已打乱后的顺序）。
        // _sortedPlaylist: 用于“从随机切回排序”时的备份。
        this._sortedPlaylist = [];
        this._playlist = [];

        // Repeat 模式：
        // - RepeatNone: 播完到头就停
        // - RepeatAll: 到末尾后回到 0
        // - RepeatOne: 永远停留在当前项
        this._repeatMode = 'RepeatNone';

        // Shuffle 模式：
        // - Sorted: 按当前顺序播放
        // - Shuffle: 打乱（并把当前项固定在队首）
        this._shuffleMode = 'Sorted';
    }

    getPlaylist() {
        // 返回队列的浅拷贝，避免外部直接修改内部数组。
        return this._playlist.slice(0);
    }

    setPlaylist(items) {
        // 直接替换整个播放队列；会重置当前项与 Repeat 模式。
        items = items.slice(0);

        for (let i = 0, length = items.length; i < length; i++) {
            addUniquePlaylistItemId(items[i]);
        }

        this._currentPlaylistItemId = null;
        this._playlist = items;
        this._repeatMode = 'RepeatNone';
    }

    queue(items) {
        // 追加到队列末尾（保持现有顺序）。
        for (let i = 0, length = items.length; i < length; i++) {
            addUniquePlaylistItemId(items[i]);

            this._playlist.push(items[i]);
        }
    }

    shufflePlaylist() {
        // 将当前队列打乱。
        // 关键点：会把“当前播放项”先从队列中取出，打乱剩余项后再放回队首，
        // 从而保证切换随机时不会立即跳到其它条目。
        this._sortedPlaylist = [];
        for (const item of this._playlist) {
            this._sortedPlaylist.push(item);
        }
        const currentPlaylistItem = this._playlist.splice(this.getCurrentPlaylistIndex(), 1)[0];

        for (let i = this._playlist.length - 1; i > 0; i--) {
            const j = randomInt(0, i - 1);
            const temp = this._playlist[i];
            this._playlist[i] = this._playlist[j];
            this._playlist[j] = temp;
        }
        this._playlist.unshift(currentPlaylistItem);
        this._shuffleMode = 'Shuffle';
    }

    sortShuffledPlaylist() {
        // 从随机播放切回“原始排序”。
        // 说明：_sortedPlaylist 只在 shufflePlaylist() 时保存一份快照。
        this._playlist = [];
        for (const item of this._sortedPlaylist) {
            this._playlist.push(item);
        }
        this._sortedPlaylist = [];
        this._shuffleMode = 'Sorted';
    }

    clearPlaylist(clearCurrentItem = false) {
        // 清空队列。
        // 默认会保留当前项（避免播放中清空导致无法继续引用当前项）。
        const currentPlaylistItem = this._playlist.splice(this.getCurrentPlaylistIndex(), 1)[0];
        this._playlist = [];
        if (!clearCurrentItem) {
            this._playlist.push(currentPlaylistItem);
        }
    }

    queueNext(items) {
        // 将 items 插入到“当前项之后”的位置（即作为下一首播放）。
        // 若当前项不存在，则等价于插入到队列末尾。
        for (let i = 0, length = items.length; i < length; i++) {
            addUniquePlaylistItemId(items[i]);
        }

        let currentIndex = this.getCurrentPlaylistIndex();

        if (currentIndex === -1) {
            currentIndex = this._playlist.length;
        } else {
            currentIndex++;
        }

        arrayInsertAt(this._playlist, currentIndex, items);
    }

    getCurrentPlaylistIndex() {
        // 当前项在队列中的位置（取决于当前 _playlist 的顺序：排序/随机）。
        return findPlaylistIndex(this.getCurrentPlaylistItemId(), this._playlist);
    }

    getCurrentItem() {
        // 获取当前播放项；如果当前 id 无效则返回 null。
        const index = findPlaylistIndex(this.getCurrentPlaylistItemId(), this._playlist);

        return index === -1 ? null : this._playlist[index];
    }

    getCurrentPlaylistItemId() {
        return this._currentPlaylistItemId;
    }

    setPlaylistState(playlistItemId) {
        // 仅设置“当前项指针”（用 PlaylistItemId 表示）。
        this._currentPlaylistItemId = playlistItemId;
    }

    setPlaylistIndex(playlistIndex) {
        // 通过索引设置当前项；传入负数表示清空当前项。
        if (playlistIndex < 0) {
            this.setPlaylistState(null);
        } else {
            this.setPlaylistState(this._playlist[playlistIndex].PlaylistItemId);
        }
    }

    removeFromPlaylist(playlistItemIds) {
        // 从队列中移除指定的 PlaylistItemId 列表。
        // 同时也会从 _sortedPlaylist 里移除，保证随机/排序切换后也不会“复活”。
        if (this._playlist.length <= playlistItemIds.length) {
            return {
                result: 'empty'
            };
        }

        const currentPlaylistItemId = this.getCurrentPlaylistItemId();
        const isCurrentIndex = playlistItemIds.indexOf(currentPlaylistItemId) !== -1;

        this._sortedPlaylist = this._sortedPlaylist.filter(function (item) {
            return !playlistItemIds.includes(item.PlaylistItemId);
        });

        this._playlist = this._playlist.filter(function (item) {
            return !playlistItemIds.includes(item.PlaylistItemId);
        });

        return {
            result: 'removed',
            isCurrentIndex: isCurrentIndex
        };
    }

    movePlaylistItem(playlistItemId, newIndex) {
        // 将队列中的某一项移动到新位置。
        // 注意：这里对 playlist 做的是拷贝后再写回，避免原地操作导致外部持有引用时出现意外。
        const playlist = this.getPlaylist();

        let oldIndex;
        for (let i = 0, length = playlist.length; i < length; i++) {
            if (playlist[i].PlaylistItemId === playlistItemId) {
                oldIndex = i;
                break;
            }
        }

        if (oldIndex === -1 || oldIndex === newIndex) {
            return {
                result: 'noop'
            };
        }

        if (newIndex >= playlist.length) {
            throw new Error('newIndex out of bounds');
        }

        moveInArray(playlist, oldIndex, newIndex);

        this._playlist = playlist;

        return {
            result: 'moved',
            playlistItemId: playlistItemId,
            newIndex: newIndex
        };
    }

    reset() {
        // 重置为初始状态（清空队列、当前项、Repeat/Shuffle）。
        this._sortedPlaylist = [];
        this._playlist = [];
        this._currentPlaylistItemId = null;
        this._repeatMode = 'RepeatNone';
        this._shuffleMode = 'Sorted';
    }

    setRepeatMode(value) {
        // 设置循环模式；仅允许固定枚举值。
        const repeatModes = ['RepeatOne', 'RepeatAll', 'RepeatNone'];
        if (repeatModes.includes(value)) {
            this._repeatMode = value;
        } else {
            throw new TypeError('invalid value provided for setRepeatMode');
        }
    }

    getRepeatMode() {
        return this._repeatMode;
    }

    setShuffleMode(value) {
        // 设置随机/排序模式。
        // 这里不是简单写字段，而是会实际重排 _playlist。
        switch (value) {
            case 'Shuffle':
                this.shufflePlaylist();
                break;
            case 'Sorted':
                this.sortShuffledPlaylist();
                break;
            default:
                throw new TypeError('invalid value provided to setShuffleMode');
        }
    }

    toggleShuffleMode() {
        // 在 Shuffle / Sorted 之间切换。
        switch (this._shuffleMode) {
            case 'Shuffle':
                this.setShuffleMode('Sorted');
                break;
            case 'Sorted':
                this.setShuffleMode('Shuffle');
                break;
            default:
                throw new TypeError('current value for shufflequeue is invalid');
        }
    }

    getShuffleMode() {
        return this._shuffleMode;
    }

    getNextItemInfo() {
        // 根据 Repeat 模式计算“下一项”的信息。
        // 返回 { item, index } 或 null（到头且不循环时）。
        let newIndex;
        const playlist = this.getPlaylist();
        const playlistLength = playlist.length;

        switch (this.getRepeatMode()) {
            case 'RepeatOne':
                newIndex = this.getCurrentPlaylistIndex();
                break;
            case 'RepeatAll':
                newIndex = this.getCurrentPlaylistIndex() + 1;
                if (newIndex >= playlistLength) {
                    newIndex = 0;
                }
                break;
            default:
                newIndex = this.getCurrentPlaylistIndex() + 1;
                break;
        }

        if (newIndex < 0 || newIndex >= playlistLength) {
            return null;
        }

        const item = playlist[newIndex];

        if (!item) {
            return null;
        }

        return {
            item: item,
            index: newIndex
        };
    }
}

function arrayInsertAt(destArray, pos, arrayToInsert) {
    let args = [];
    args.push(pos); // 插入位置
    args.push(0); // 不删除任何元素
    args = args.concat(arrayToInsert); // 需要插入的数组
    destArray.splice.apply(destArray, args); // 通过 splice 执行插入
}

function moveInArray(array, from, to) {
    array.splice(to, 0, array.splice(from, 1)[0]);
}

export default PlayQueueManager;
