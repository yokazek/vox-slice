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
}

// アプリケーションの起動
document.addEventListener('DOMContentLoaded', () => {
    new App();
});
