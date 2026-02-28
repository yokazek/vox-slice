import Region from '../../domain/Region.js';

/**
 * EditorUseCase (アプリケーション層)
 * 波形の区切り線(SlicePoints)の追加・削除・移動や、それによって生成される区間(Region)のビジネスロジックを担う。
 * UIやWeb Audio APIなどの外部インフラには一切依存しない、純粋なJavaScriptのロジッククラス。
 */
export default class EditorUseCase {
    constructor() {
        this.duration = 0; // 音声の全体長(sec)
        this.slicePoints = []; // 区切り線の時間位置の配列 [t1, t2, ...] (昇順)
        this.inactiveSegments = new Set(); // 除外状態（Active=false）の区間インデックスのSet
        this.listeners = [];
        this._notifySuspended = false;
    }

    /**
     * 状態変更リスナーの登録（UI側に変更を通知するため）
     * @param {Function} callback (slicePoints: number[], regions: Region[]) => void
     */
    onChange(callback) {
        this.listeners.push(callback);
    }

    /**
     * リスナーへの通知（オブザーバーパターン）
     */
    _notify() {
        if (this._notifySuspended) return;

        if (this.listeners.length > 0) {
            const regions = this.getRegions();
            this.listeners.forEach(cb => cb(this.slicePoints, regions));
        }
    }

    /**
     * 複数処理を並行して行うための通知停止
     */
    suspendNotify() {
        this._notifySuspended = true;
    }

    /**
     * 通知再開
     */
    resumeNotify() {
        this._notifySuspended = false;
        this._notify();
    }

    /**
     * 波形をロードした時の初期化処理
     * @param {number} duration 音声の全体長(sec)
     */
    initialize(duration) {
        this.duration = duration;
        this.slicePoints = [];
        this.inactiveSegments.clear();
        this._notify();
    }

    /**
     * 区切り線を追加する (EnterやUIからの追加操作)
     * @param {number} time (sec) 追加する時間位置
     */
    addSlicePoint(time) {
        if (time <= 0 || time >= this.duration || this.slicePoints.includes(time)) {
            return;
        }

        // 新しい区切り線が挿入されるインデックスを特定する
        let insertIndex = 0;
        while (insertIndex < this.slicePoints.length && this.slicePoints[insertIndex] < time) {
            insertIndex++;
        }

        // 指定位置に挿入
        this.slicePoints.splice(insertIndex, 0, time);

        // 新しいインデックスに合わせて無効化領域（inactiveSegments）をシフト・複製する
        const newInactive = new Set();
        this.inactiveSegments.forEach(idx => {
            if (idx < insertIndex) {
                // 挿入点より前の領域はインデックスそのまま
                newInactive.add(idx);
            } else if (idx === insertIndex) {
                // 挿入点で領域が分割された場合、元の領域が無効なら、分割後の両方の領域も無効状態を引き継ぐ
                newInactive.add(idx);
                newInactive.add(idx + 1);
            } else {
                // 挿入点より後の領域はインデックスが1つ後ろにズレる
                newInactive.add(idx + 1);
            }
        });
        this.inactiveSegments = newInactive;

        this._notify();
    }

    /**
     * 区切り線を移動する (UIでのドラッグ操作やリストからの時刻変更)
     * @param {number} index 移動対象の区切り線のインデックス
     * @param {number} newTime (sec) 新しい時間位置
     */
    moveSlicePoint(index, newTime) {
        if (index < 0 || index >= this.slicePoints.length) return;

        const MathMax = Math.max;
        const MathMin = Math.min;

        const minTime = index === 0 ? 0 : this.slicePoints[index - 1];
        const maxTime = index === this.slicePoints.length - 1 ? this.duration : this.slicePoints[index + 1];

        const epsilon = 0.01;
        const clampedTime = MathMax(minTime + epsilon, MathMin(newTime, maxTime - epsilon));

        this.slicePoints[index] = clampedTime;
        this._notify();
    }

    /**
     * 区切り線を削除する
     * @param {number} index
     */
    removeSlicePoint(index) {
        if (index >= 0 && index < this.slicePoints.length) {
            this.slicePoints.splice(index, 1);

            // 削除されたインデックスに合わせて無効化領域をシフトする
            const newInactive = new Set();
            this.inactiveSegments.forEach(idx => {
                if (idx < index) {
                    newInactive.add(idx);
                } else if (idx === index || idx === index + 1) {
                    // 削除によって結合された2つの領域(index と index+1)。
                    // どちらか一方が無効状態だった場合、結合後の新しい領域(index)も無効状態にする
                    newInactive.add(index);
                } else if (idx > index + 1) {
                    // それ以降の領域はインデックスが1つ前にズレる
                    newInactive.add(idx - 1);
                }
            });
            this.inactiveSegments = newInactive;

            this._notify();
        }
    }

    /**
     * 区間（Region）の有効/除外状態を切り替える
     * @param {number} regionIndex
     */
    toggleRegionActive(regionIndex) {
        if (regionIndex < 0 || regionIndex > this.slicePoints.length) return;

        if (this.inactiveSegments.has(regionIndex)) {
            this.inactiveSegments.delete(regionIndex);
        } else {
            this.inactiveSegments.add(regionIndex);
        }
        this._notify();
    }

    /**
     * 全状態をクリアする
     */
    clear() {
        this.duration = 0;
        this.slicePoints = [];
        this.inactiveSegments.clear();
        this._notify();
    }

    /**
     * 現在の区切り線情報から、Domain Entityである Region の配列を生成して返す
     * @returns {Region[]}
     */
    getRegions() {
        if (this.duration <= 0) return [];

        const regions = [];
        let currentStart = 0;

        for (let i = 0; i <= this.slicePoints.length; i++) {
            const end = i < this.slicePoints.length ? this.slicePoints[i] : this.duration;
            const isActive = !this.inactiveSegments.has(i);

            regions.push(new Region(i, currentStart, end, isActive));

            currentStart = end;
        }

        return regions;
    }

    /**
     * ダウンロード対象（active=true）のRegionのみを取得
     * @returns {Region[]}
     */
    getActiveRegions() {
        return this.getRegions().filter(region => region.active);
    }
}
