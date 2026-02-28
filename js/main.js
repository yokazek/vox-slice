// Application UseCases
import EditorUseCase from './application/usecases/EditorUseCase.js';
import ExportUseCase from './application/usecases/ExportUseCase.js';

// Infrastructure
import WebAudioService from './infrastructure/WebAudioService.js';
import LameMp3Encoder from './infrastructure/LameMp3Encoder.js';
import ZipExporter from './infrastructure/ZipExporter.js';

// Presentation (UI)
import WaveformView from './ui/WaveformView.js';
import SegmentListView from './ui/RegionListView.js';
import ControlPanel from './ui/ControlPanel.js';

/**
 * アプリケーションのエントリポイント / DIコンテナ
 * 各層のインスタンスを生成し、依存関係を注入(Dependency Injection)して結びつけます。
 */
class App {
    constructor() {
        // --- Infrastructure 層の初期化 ---
        this.webAudioService = new WebAudioService();
        this.mp3Encoder = new LameMp3Encoder();
        this.zipExporter = new ZipExporter();

        // --- Application 層 (UseCases) の初期化とDI ---
        this.editorUseCase = new EditorUseCase();
        this.exportUseCase = new ExportUseCase(
            this.webAudioService,
            this.mp3Encoder,
            this.zipExporter
        );

        // UIコンポーネントのインスタンス化
        this.waveformView = new WaveformView('#waveform');
        this.segmentListView = new SegmentListView('#regions-section');
        this.controlPanel = new ControlPanel();

        // 状態フラグ
        this.currentFile = null;
        this.isPlaying = false;

        this._setupBindings();
    }

    /**
     * 各コンポーネント間のイベントをバインドする
     */
    _setupBindings() {
        // --- ControlPanel のイベント ---
        this.controlPanel.onFileSelected = async (file) => {
            this.currentFile = file;
            this.editorUseCase.clear();
            this.waveformView.loadAudio(file);

            // WebAudioServiceにデコードさせる
            const arrayBuffer = await file.arrayBuffer();
            try {
                await this.webAudioService.decodeAudioData(arrayBuffer);
            } catch (err) {
                alert(err.message);
            }
        };

        this.controlPanel.onPlayPauseClick = () => {
            if (!this.waveformView.wavesurfer) return;

            if (this.isPlaying) {
                this.waveformView.wavesurfer.pause();
            } else {
                this.waveformView.wavesurfer.play();
            }
        };

        this.controlPanel.onSplitClick = () => {
            if (!this.waveformView.wavesurfer) return;
            const currentTime = this.waveformView.getCurrentTime();
            this.editorUseCase.addSlicePoint(currentTime);
        };

        this.controlPanel.onAutoSilenceClick = (thresholdDb, duration) => {
            const audioBuffer = this.waveformView.wavesurfer?.getDecodedData();
            if (!audioBuffer) return;

            this.controlPanel.showProcessingState(true, '無音部分を解析中...', 50);

            // UIが更新される隙間を作るためsetTimeoutを使用
            setTimeout(() => {
                try {
                    const silenceRegions = this._detectSilence(audioBuffer, thresholdDb, duration);

                    if (silenceRegions.length === 0) {
                        alert("指定された条件（音量、長さ）を満たす無音区間は見つかりませんでした。");
                        return;
                    }

                    // 大量更新時のUIフリーズやチラツキを防ぐため、一時的にUIへの通知を停止
                    this.editorUseCase.suspendNotify();

                    // 無音区間の開始と終了に区切り線を追加する
                    silenceRegions.forEach(reg => {
                        this.editorUseCase.addSlicePoint(reg.start);
                        this.editorUseCase.addSlicePoint(reg.end);
                    });

                    // 挿入後、すべてのRegion（区間）のリストを取得する
                    const updatedRegions = this.editorUseCase.getRegions();

                    // 無音区間に含まれているRegionを特定して、除外(Inactive)へ切り替える
                    updatedRegions.forEach(reg => {
                        // 区間の中央時間を取得
                        const mid = (reg.start + reg.end) / 2;

                        // 中央の時間が、検出した無音区間のどれかに含まれているかを判定
                        const isInsideSilence = silenceRegions.some(sr => mid >= sr.start && mid <= sr.end);

                        // 無音領域であり、かつ現在アクティブならオフにする
                        if (isInsideSilence && reg.active) {
                            this.editorUseCase.toggleRegionActive(reg.index);
                        }
                    });

                } catch (err) {
                    console.error("Silence Detection Error:", err);
                    alert("解析エラー: " + err.message);
                } finally {
                    // 全ての処理が終わったらUI通知を再開し、一気に描画させる
                    this.editorUseCase.resumeNotify();
                    this.controlPanel.showProcessingState(false);
                }
            }, 50);
        };

        this.controlPanel.onDownloadClick = async (format) => {
            const audioBuffer = this.waveformView.wavesurfer.getDecodedData();
            if (!audioBuffer) {
                alert("音声データが読み込まれていません。");
                return;
            }

            const activeSegments = this.editorUseCase.getActiveRegions();
            if (activeSegments.length === 0) {
                alert("ダウンロード対象の区間がありません。（すべてグレーアウトされています）");
                return;
            }

            this.controlPanel.showProcessingState(true, '準備中...', 0);
            try {
                // ExportUseCase にエクスポートの進行を委譲する
                await this.exportUseCase.execute(
                    activeSegments,
                    format,
                    (statusText, progressPercent) => {
                        this.controlPanel.showProcessingState(true, statusText, progressPercent);
                    }
                );
            } catch (error) {
                console.error("Download Error:", error);
                alert("ダウンロード処理中にエラーが発生しました。\n" + error.message);
            } finally {
                this.controlPanel.showProcessingState(false);
            }
        };

        // --- WaveformView のイベント ---
        this.waveformView.onReady = () => {
            const duration = this.waveformView.getDuration();
            this.editorUseCase.initialize(duration);
            this.controlPanel.updateTimeDisplay(0, duration);
        };

        this.waveformView.onTimeUpdate = (currentTime) => {
            this.controlPanel.updateTimeDisplay(currentTime);
        };

        this.waveformView.onSliceLineCreated = (time) => {
            this.editorUseCase.addSlicePoint(time);
        };

        this.waveformView.onSliceLineMoved = (index, newTime) => {
            this.editorUseCase.moveSlicePoint(index, newTime);
        };

        this.waveformView.onSegmentRightClicked = (clickTime) => {
            const regions = this.editorUseCase.getRegions();
            const targetRegion = regions.find(reg => clickTime >= reg.start && clickTime <= reg.end);

            if (targetRegion) {
                this.editorUseCase.toggleRegionActive(targetRegion.index);
            }
        };

        // UI sync
        const checkWavesurferAndBind = setInterval(() => {
            if (this.waveformView.wavesurfer) {
                clearInterval(checkWavesurferAndBind);

                this.waveformView.wavesurfer.on('play', () => {
                    this.isPlaying = true;
                    this.controlPanel.setPlayingState(true);
                });

                this.waveformView.wavesurfer.on('pause', () => {
                    this.isPlaying = false;
                    this.controlPanel.setPlayingState(false);
                });
            }
        }, 100);

        // --- EditorUseCase のイベント ---
        this.editorUseCase.onChange((slicePoints, regions) => {
            // Update UI Layers
            this.waveformView.updateSlicesAndSegments(slicePoints, regions);
            this.segmentListView.render(regions);
            this.segmentListView.show(regions.length > 0);

            this._updateDownloadButtonState();
        });

        // --- SegmentListView のイベント ---
        this.segmentListView.onTimeChanged = (index, startSec, endSec) => {
            if (index > 0 && startSec !== this.editorUseCase.slicePoints[index - 1]) {
                this.editorUseCase.moveSlicePoint(index - 1, startSec);
            }
            if (index < this.editorUseCase.slicePoints.length && endSec !== this.editorUseCase.slicePoints[index]) {
                this.editorUseCase.moveSlicePoint(index, endSec);
            }
        };

        this.segmentListView.onToggleActive = (index) => {
            this.editorUseCase.toggleRegionActive(index);
        };

        this.segmentListView.onAddSplit = (timeSec) => {
            this.editorUseCase.addSlicePoint(timeSec);
        };

        this.segmentListView.onRemoveSegment = (index) => {
            if (index === 0 && this.editorUseCase.slicePoints.length > 0) {
                this.editorUseCase.removeSlicePoint(0);
            } else if (index > 0) {
                this.editorUseCase.removeSlicePoint(index - 1);
            }
        };
    }

    _updateDownloadButtonState() {
        const activeRegions = this.editorUseCase.getActiveRegions();
        this.controlPanel.setDownloadEnabled(activeRegions.length > 0);
    }

    /**
     * 音声バッファを解析して無音区間の配列を返す
     * @param {AudioBuffer} audioBuffer
     * @param {number} thresholdDb (例: -40)
     * @param {number} minSeconds (例: 0.5)
     */
    _detectSilence(audioBuffer, thresholdDb, minSeconds) {
        // 片方のチャンネル(Left)を基準に判定する
        const channelData = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;
        const threshold = Math.pow(10, thresholdDb / 20); // dBから振幅(Amplitude)へ変換

        // 50msごとに区切って判定（細かすぎると処理が重くなり、粗すぎると精度が落ちるため）
        const windowSize = Math.floor(sampleRate * 0.05);
        const regions = [];

        let isSilent = false;
        let silenceStart = 0;

        for (let i = 0; i < channelData.length; i += windowSize) {
            let maxAmp = 0;
            // 指定したウィンドウ内の最大音量を取得する
            const endIdx = Math.min(i + windowSize, channelData.length);
            for (let j = i; j < endIdx; j++) {
                const v = Math.abs(channelData[j]);
                if (v > maxAmp) maxAmp = v;
            }

            const currentlySilent = maxAmp < threshold;

            if (currentlySilent && !isSilent) {
                // 新しい無音区間が始まった
                isSilent = true;
                silenceStart = i / sampleRate;
            } else if (!currentlySilent && isSilent) {
                // 無音区間が終わった（音が鳴った）
                isSilent = false;
                const silenceEnd = i / sampleRate;
                if ((silenceEnd - silenceStart) >= minSeconds) {
                    regions.push({ start: silenceStart, end: silenceEnd });
                }
            }
        }

        // ファイルの末尾まで無音で終わっていた場合の処理
        if (isSilent) {
            const silenceEnd = channelData.length / sampleRate;
            if ((silenceEnd - silenceStart) >= minSeconds) {
                regions.push({ start: silenceStart, end: silenceEnd });
            }
        }

        return regions;
    }
}

// アプリケーションの起動
document.addEventListener('DOMContentLoaded', () => {
    new App();
});
