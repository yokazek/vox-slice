import WaveSurfer from 'https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.esm.js';
import RegionsPlugin from 'https://unpkg.com/wavesurfer.js@7/dist/plugins/regions.esm.js';
import TimelinePlugin from 'https://unpkg.com/wavesurfer.js@7/dist/plugins/timeline.esm.js';

/**
 * WaveformView (Presentation Layer)
 * WaveSurfer.jsを利用した波形の描画と、RegionsPluginを利用したUI制御を担当。
 * アプリケーション固有の概念（UseCaseなど）には依存せず、表示とイベント発火のみを行う。
 */
export default class WaveformView {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = document.querySelector(containerId);

        // 外部に通知するためのコールバック
        this.onReady = null;
        this.onTimeUpdate = null;
        this.onSliceLineCreated = null;
        this.onSliceLineMoved = null;
        this.onSegmentRightClicked = null;

        // 特定区間のみを再生している時の終了時間（null時は無効）
        this._playRegionEnd = null;
        this._isLooping = false;
        this._activeRegionId = null;

        // UI要素
        this.loadingOverlay = document.getElementById('waveform-loading');
        this.tooltip = document.getElementById('time-tooltip');

        this.wsRegions = null; // RegionsPluginのインスタンス
        this._isUpdatingInternally = false;

        this._initWaveSurfer();
        this._setupEvents();
    }

    _initWaveSurfer() {
        if (this.wavesurfer) {
            this.wavesurfer.destroy();
        }

        const root = document.documentElement;
        const style = getComputedStyle(root);

        this.wsRegions = RegionsPlugin.create();

        this.wavesurfer = WaveSurfer.create({
            container: this.containerId,
            waveColor: style.getPropertyValue('--clr-wave').trim() || '#f59e0b',
            progressColor: style.getPropertyValue('--clr-wave').trim() || '#f59e0b', // 再生済みの色変化をなくす
            cursorColor: style.getPropertyValue('--clr-secondary').trim() || '#f59e0b',
            height: 150,
            normalize: true,
            minPxPerSec: 50,
            interact: true, // クリックでのシークを許可
            forceDecode: true, // ズーム時の波形精度を向上させる

            // カスタムレンダラー等は使用せずRegionsのDOM上でCSS mix-blend-modeを使います
            plugins: [
                this.wsRegions,
                TimelinePlugin.create({
                    height: 20,
                    timeInterval: 0.5,
                    primaryLabelInterval: 5,
                    style: {
                        fontSize: '12px',
                        color: 'var(--clr-text-muted)'
                    }
                })
            ]
        });
    }

    _setupEvents() {
        // --- WaveSurfer 本体のイベント ---
        this.wavesurfer.on('load', () => this.showLoading(true));

        this.wavesurfer.on('ready', () => {
            this.showLoading(false);
            if (this.onReady) this.onReady();

            // WaveSurferのShadow DOM内部へスクロールバーのカスタマイズCSSを注入する
            const wrapper = this.wavesurfer.getWrapper();
            if (wrapper && !wrapper.querySelector('#custom-scrollbar-style')) {
                const style = document.createElement('style');
                style.id = 'custom-scrollbar-style';
                style.textContent = `
                    ::-webkit-scrollbar {
                        height: 10px;
                        background: transparent;
                    }
                    ::-webkit-scrollbar-track {
                        background: var(--clr-bg-base, #0f172a); 
                        border-radius: 4px;
                    }
                    ::-webkit-scrollbar-thumb {
                        background: var(--clr-secondary, #f59e0b); 
                        border-radius: 4px;
                        border: 2px solid var(--clr-bg-base, #0f172a);
                    }
                    ::-webkit-scrollbar-thumb:hover {
                        background: var(--clr-primary, #FBBC04); 
                    }
                `;
                // v7ではWrapper自身にappendChildすることで内部のスタイルも上書きされます
                wrapper.appendChild(style);
            }
        });

        this.wavesurfer.on('timeupdate', (currentTime) => {
            if (this.onTimeUpdate) this.onTimeUpdate(currentTime);

            // 特定の区間を再生中であり、終了時間を超えたら
            if (this._playRegionEnd !== null && currentTime >= this._playRegionEnd) {
                if (this._isLooping && this._activeRegionId && this.wsRegions) {
                    // ループモードがオンなら、再度開始位置に戻して再生を続ける
                    const regions = this.wsRegions.getRegions();
                    const target = regions.find(r => r.id === this._activeRegionId);
                    if (target) {
                        target.play(); // regionsPlugin.play() が開始位置へのシークと再生を行う
                    }
                } else {
                    // ループオフなら一時停止
                    this._playRegionEnd = null;
                    this._activeRegionId = null;
                    this.wavesurfer.pause();
                }
            }
        });

        // ユーザーの手動停止やシークが行われたら区間再生状態を解除
        this.wavesurfer.on('pause', () => {
            // ループによる意図的なシーク(play/pauseの切り替わり等)もあるため、ここはinteractionのみに寄せる方が安全
        });

        // ユーザーの手動シーク操作（波形のクリックやドラッグ）が行われたら区間再生状態を解除
        this.wavesurfer.on('interaction', () => {
            this._playRegionEnd = null;
            this._activeRegionId = null;
        });

        this.wavesurfer.on('error', (err) => {
            this.showLoading(false);
            console.error('WaveSurfer error:', err);
            alert('音声の読み込み時にエラーが発生しました。');
        });

        // 波形のクリックイベント（新規スライス追加）
        this.wavesurfer.on('click', (relativeX) => {
            // Regionのドラッグ等の操作中でなければ発火
            const clickTime = relativeX * this.wavesurfer.getDuration();
            if (this.onSliceLineCreated) {
                this.onSliceLineCreated(clickTime);
            }
        });

        // --- 波形領域上のシステム系イベント ---
        // (右クリックイベントは、マウスクリック時のズレ解消のため 각 Region 要素自体に付与するように変更しました)

        // マウスホイールによるズーム操作（マウス位置を基準に拡大縮小）
        this.container.addEventListener('wheel', (e) => {
            // 縦スクロール（ホイール回転）の場合のみ処理
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.preventDefault();

                const oldZoom = this.wavesurfer.options.minPxPerSec;
                const zoomSensitivity = 0.5;
                let newZoom = oldZoom - (e.deltaY * zoomSensitivity);
                newZoom = Math.max(10, Math.min(newZoom, 1000));

                if (oldZoom === newZoom) return;

                const scrollLeft = this.wavesurfer.getScroll() || 0;
                const rect = this.container.getBoundingClientRect();
                const offsetX = e.clientX - rect.left;

                // マウス位置が指している音声の「時間 (秒)」を計算
                const mouseTime = (scrollLeft + offsetX) / oldZoom;

                // WaveSurferのズーム倍率を変更
                this.wavesurfer.zoom(newZoom);

                // ズーム後、元のマウス位置がずれないようにスクロール調整
                const newScrollLeft = (mouseTime * newZoom) - offsetX;
                this.wavesurfer.setScroll(newScrollLeft);
            }
        }, { passive: false });

        // マウス中ボタンによるパン（ドラッグスクロール）操作
        let isPanning = false;
        let panStartX = 0;
        let panStartScroll = 0;

        // mousedownでパン開始を検知
        this.container.addEventListener('mousedown', (e) => {
            // 1 はマウス中ボタン（ホイールクリック）
            if (e.button === 1) {
                e.preventDefault();
                isPanning = true;
                panStartX = e.clientX;
                panStartScroll = this.wavesurfer.getScroll() || 0;
                this.container.style.cursor = 'grabbing';
            }
        });

        // windowに対してイベントを張ることで、コンテナ外にマウスが出てもドラッグを追従させる
        window.addEventListener('mousemove', (e) => {
            if (!isPanning) return;
            e.preventDefault();
            // 右にドラッグで左へスクロール（直感的な掴んで動かす操作）
            const deltaX = e.clientX - panStartX;
            this.wavesurfer.setScroll(panStartScroll - deltaX);
        });

        window.addEventListener('mouseup', (e) => {
            // 1 はマウス中ボタン
            if (e.button === 1 && isPanning) {
                isPanning = false;
                this.container.style.cursor = 'default';
            }
        });
        // --- RegionsPlugin のイベント ---
        this.wsRegions.on('region-updated', (region) => {
            // ViewからUseCaseへ変更を書き戻すイベント
            // _isUpdatingInternally フラグが立っている時（UseCaseからの描画時）は発火させない（無限ループ防止）
            if (this._isUpdatingInternally) return;

            // idには 'region_0', 'region_1' のように紐付いているためパースする
            const indexStr = region.id.split('_')[1];
            if (!indexStr) return;
            const index = parseInt(indexStr);

            // Region(区間)の左端・右端のどちらが動かされたかを判定してSlicePointの移動を通知する。
            // (RegionsPluginの仕様上、区間自体の移動や伸縮が発生する)
            // この連携はやや複雑になるため、ここでは「左端」または「右端」が変更されたら、対応するSlicePointを動かす通知をする。

            // NOTE:
            // 本来はslicePoints(点)ベースではなく、Regionベースで管理する方がこれらプラグインとの相性は良い。
            // ひとまずは現在のアーキテクチャ(点が区間を分断する形式)に合わせて、ドラッグされた端点のみを反映させる。

            // 左側の境界（前回のSlicePoint(index-1)に相当）が動いた場合
            if (Math.abs(region.start - region.element.dataset.origStart) > 0.001) {
                if (index > 0 && this.onSliceLineMoved) {
                    this.onSliceLineMoved(index - 1, region.start);
                }
            }
            // 右側の境界（次回のSlicePoint(index)に相当）が動いた場合
            else if (Math.abs(region.end - region.element.dataset.origEnd) > 0.001) {
                if (this.onSliceLineMoved) {
                    this.onSliceLineMoved(index, region.end);
                }
            }
        });
    }

    /**
     * 外部から音声ファイルを読み込む
     */
    loadAudio(audio) {
        if (!this.wavesurfer) this._initWaveSurfer();
        this.wsRegions.clearRegions();
        // this._regionsData = []; // Clear custom renderer data - Handled by updateSlicesAndSegments

        if (audio instanceof File || audio instanceof Blob) {
            const url = URL.createObjectURL(audio);
            this.wavesurfer.load(url);
        } else {
            this.wavesurfer.load(audio);
        }
    }

    /**
     * UseCaseからの最新状態を元に、波形上のRegionを描画し直す
     * @param {Array<number>} slicePoints 
     * @param {Array<Object>} regions (DomainのRegion配列)
     */
    updateSlicesAndSegments(slicePoints, regions) {
        if (!this.wavesurfer || this.wavesurfer.getDuration() === 0) return;

        this._isUpdatingInternally = true;
        this._regionsData = regions;

        const rootStyle = getComputedStyle(document.documentElement);
        const splitLineColor = rootStyle.getPropertyValue('--clr-slice-line').trim() || '#3b82f6';

        // 既存の領域（RegionsPlugin内の管理オブジェクト）を取得
        const existingRegions = this.wsRegions.getRegions();
        const existingMap = new Map();
        existingRegions.forEach(r => existingMap.set(r.id, r));

        const newIds = new Set(regions.map(r => `region_${r.index}`));

        // 1. 今回のリストに存在しない古い領域を削除
        existingRegions.forEach(r => {
            if (!newIds.has(r.id)) {
                r.remove();
            }
        });

        // 2. 新しい領域の追加、または既存領域の更新
        regions.forEach((region) => {
            const rId = `region_${region.index}`;
            let wsRegion = existingMap.get(rId);

            if (!wsRegion) {
                // 新規追加
                wsRegion = this.wsRegions.addRegion({
                    id: rId,
                    start: region.start,
                    end: region.end,
                    color: 'transparent',
                    drag: false, // 全体の移動ではなく「端」の移動のみを許容する
                    resize: true,
                });

                // 右クリックを検知してセグメントのトグルを行う
                wsRegion.element.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation(); // 他の処理が走るのを防ぐ
                    if (this.onSegmentRightClicked) {
                        // キャッシュから最新のデータを引いて中央の時間を渡す
                        const currentReg = this._regionsData.find(r => `region_${r.index}` === wsRegion.id);
                        if (currentReg) {
                            const midTime = (currentReg.start + currentReg.end) / 2;
                            this.onSegmentRightClicked(midTime);
                        }
                    }
                });
            } else {
                // 既存更新 (位置が変わっている場合のみ更新してパフォーマンスを向上)
                if (Math.abs(wsRegion.start - region.start) > 0.001 || Math.abs(wsRegion.end - region.end) > 0.001) {
                    wsRegion.setOptions({
                        start: region.start,
                        end: region.end
                    });
                }
            }

            // --- 区切り線のスタイル適用 ---
            wsRegion.element.style.borderLeft = `1px solid ${splitLineColor}`;
            wsRegion.element.style.borderRight = `1px solid ${splitLineColor}`;

            // --- 無効区間のオーバーレイ（mix-blend-mode）管理 ---
            // 毎回DOMを作り直さないことでチラツキ（Flicker）を完全に予防します
            let inactiveLayer = wsRegion.element.querySelector('.ws-inactive-overlay');
            if (!region.active) {
                if (!inactiveLayer) {
                    inactiveLayer = document.createElement('div');
                    inactiveLayer.className = 'ws-inactive-overlay';
                    inactiveLayer.style.position = 'absolute';
                    inactiveLayer.style.top = '0';
                    inactiveLayer.style.left = '0';
                    inactiveLayer.style.width = '100%';
                    inactiveLayer.style.height = '100%';
                    // イベントを貫通させるのでハンドル操作も邪魔しない
                    inactiveLayer.style.pointerEvents = 'none';

                    // CSSのbackdrop-filterを活用して、背後にある波形の色をグレーにして暗くする（視認性を確保）
                    inactiveLayer.style.backgroundColor = 'rgba(15, 23, 42, 0.4)';
                    inactiveLayer.style.backdropFilter = 'grayscale(100%) brightness(0.6)';
                    wsRegion.element.appendChild(inactiveLayer);
                }
            } else {
                if (inactiveLayer) {
                    inactiveLayer.remove();
                }
            }

            // 変更判定用に元の値をDOMのdatasetに持たせておく
            wsRegion.element.dataset.origStart = region.start;
            wsRegion.element.dataset.origEnd = region.end;
        });

        this._isUpdatingInternally = false;
    }

    getCurrentTime() {
        return this.wavesurfer ? this.wavesurfer.getCurrentTime() : 0;
    }

    getDuration() {
        return this.wavesurfer ? this.wavesurfer.getDuration() : 0;
    }

    showLoading(show) {
        if (show) {
            this.loadingOverlay.classList.remove('hidden');
        } else {
            this.loadingOverlay.classList.add('hidden');
        }
    }

    /**
     * ループモードの切り替え
     * @param {boolean} isLooping 
     */
    setLoopMode(isLooping) {
        this._isLooping = isLooping;
    }

    /**
     * 指定されたインデックスのRegion（区間）だけを再生する
     * @param {number} index
     */
    playRegion(index) {
        if (!this.wsRegions) return;
        const regions = this.wsRegions.getRegions();
        const targetId = `region_${index}`;
        const target = regions.find(r => r.id === targetId);
        if (target) {
            // 自動停止（またはループ）用の設定をセット
            this._playRegionEnd = target.end;
            this._activeRegionId = targetId;
            target.play();
        }
    }
}
