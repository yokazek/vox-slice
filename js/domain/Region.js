/**
 * Region (区間) ドメインエンティティ
 * 音声の中で分割された1つの区間とその状態（有効/無効）を表す純粋なデータモデル。
 */
export default class Region {
    /**
     * @param {number} index 区間のインデックス番号
     * @param {number} start 開始時間 (秒)
     * @param {number} end 終了時間 (秒)
     * @param {boolean} active ダウンロード対象として有効かどうか
     */
    constructor(index, start, end, active = true) {
        this.index = index;
        this.start = start;
        this.end = end;
        this.active = active;
    }

    /**
     * 区間の長さを取得する
     * @returns {number} 長さ(秒)
     */
    getDuration() {
        return this.end - this.start;
    }

    /**
     * 有効・無効状態を切り替える
     */
    toggleActive() {
        this.active = !this.active;
    }

    /**
     * 開始時間を更新する
     * @param {number} newStart 
     */
    updateStart(newStart) {
        if (newStart < this.end) {
            this.start = newStart;
        }
    }

    /**
     * 終了時間を更新する
     * @param {number} newEnd 
     */
    updateEnd(newEnd) {
        if (newEnd > this.start) {
            this.end = newEnd;
        }
    }
}
