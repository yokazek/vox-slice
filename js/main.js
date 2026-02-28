// Application UseCases
import EditorUseCase from './application/usecases/EditorUseCase.js';
import ExportUseCase from './application/usecases/ExportUseCase.js';

// Domain Services
import SilenceDetector from './domain/services/SilenceDetector.js';

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
        // --- Infrastructure 層 ---
        this.webAudioService = new WebAudioService();
        this.mp3Encoder = new LameMp3Encoder();
        this.zipExporter = new ZipExporter();

        // --- Domain Services ---
        this.silenceDetector = new SilenceDetector();

        // --- Application 層 (UseCases) ---
        this.editorUseCase = new EditorUseCase();
        this.exportUseCase = new ExportUseCase(
            this.webAudioService,
            this.mp3Encoder,
            this.zipExporter
        );

        // --- Presentation 層 (UI) ---
        this.waveformView = new WaveformView('#waveform');
        this.segmentListView = new SegmentListView('#regions-section');
        this.controlPanel = new ControlPanel();

        // 状態
        this.currentFile = null;
        this.isPlaying = false;

        this._setupBindings();
    }

    /**
     * 各コンポーネント間のイベントをバインドする
     */
    _setupBindings() {
        this._bindControlPanelEvents();
        this._bindWaveformEvents();
        this._bindSegmentListEvents();
        this._bindUseCaseEvents();
        this._bindWavesurferInternalEvents();
    }

    _bindControlPanelEvents() {
        this.controlPanel.onFileSelected = async (file) => {
            this.currentFile = file;
            this.editorUseCase.clear();
            this.waveformView.loadAudio(file);

            const arrayBuffer = await file.arrayBuffer();
            try {
                await this.webAudioService.decodeAudioData(arrayBuffer);
            } catch (err) {
                alert(err.message);
            }
        };

        this.controlPanel.onSpaceKeyPress = () => {
            if (!this.waveformView.wavesurfer) return;

            if (this.isPlaying) {
                this.waveformView.wavesurfer.pause();
                return;
            }

            const currentTime = this.waveformView.getCurrentTime();
            const regions = this.editorUseCase.getRegions();
            const currentRegion = regions.find(reg => currentTime >= reg.start && currentTime <= reg.end);

            if (currentRegion) {
                this.waveformView.playRegion(currentRegion.index);
            } else {
                this.waveformView.wavesurfer.play();
            }
        };

        this.controlPanel.onLoopToggleClick = (isLooping) => {
            this.waveformView.setLoopMode(isLooping);
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

            setTimeout(() => {
                try {
                    const silenceRegions = this.silenceDetector.detect(audioBuffer, thresholdDb, duration);

                    if (silenceRegions.length === 0) {
                        alert("指定された条件を満たす無音区間は見つかりませんでした。");
                        return;
                    }

                    this.editorUseCase.suspendNotify();

                    silenceRegions.forEach(reg => {
                        this.editorUseCase.addSlicePoint(reg.start);
                        this.editorUseCase.addSlicePoint(reg.end);
                    });

                    const updatedRegions = this.editorUseCase.getRegions();
                    updatedRegions.forEach(reg => {
                        const mid = (reg.start + reg.end) / 2;
                        const isInsideSilence = silenceRegions.some(sr => mid >= sr.start && mid <= sr.end);
                        if (isInsideSilence && reg.active) {
                            this.editorUseCase.toggleRegionActive(reg.index);
                        }
                    });

                } catch (err) {
                    console.error("Silence Detection Error:", err);
                    alert("解析レベルのエラー: " + err.message);
                } finally {
                    this.editorUseCase.resumeNotify();
                    this.controlPanel.showProcessingState(false);
                }
            }, 50);
        };

        this.controlPanel.onVolumeChange = (vol) => {
            this.waveformView.setVolume(vol);
        };

        this.controlPanel.onUndoClick = () => this.editorUseCase.undo();
        this.controlPanel.onRedoClick = () => this.editorUseCase.redo();
        this.controlPanel.onPrevRegionRequest = () => this._moveSeekToSplit(-1);
        this.controlPanel.onNextRegionRequest = () => this._moveSeekToSplit(1);

        this.controlPanel.onSaveProjectClick = () => this._handleSaveProject();
        this.controlPanel.onLoadProjectFile = (file) => this._handleLoadProject(file);

        this.controlPanel.onThemeToggle = () => {
            this.waveformView.refreshColors();
        };

        this.controlPanel.onDownloadClick = async (format) => {
            const activeSegments = this.editorUseCase.getActiveRegions();
            if (activeSegments.length === 0) {
                alert("ダウンロード対象の区間がありません。");
                return;
            }

            this.controlPanel.showProcessingState(true, '準備中...', 0);
            try {
                await this.exportUseCase.execute(activeSegments, format, (status, progress) => {
                    this.controlPanel.showProcessingState(true, status, progress);
                });
            } catch (error) {
                console.error("Download Error:", error);
                alert("エラーが発生しました: " + error.message);
            } finally {
                this.controlPanel.showProcessingState(false);
            }
        };
    }

    _bindWaveformEvents() {
        this.waveformView.onReady = () => {
            const duration = this.waveformView.getDuration();
            this.editorUseCase.initialize(duration);
            this.controlPanel.updateTimeDisplay(0, duration);
        };

        this.waveformView.onTimeUpdate = (currentTime) => {
            this.controlPanel.updateTimeDisplay(currentTime);
            const regions = this.editorUseCase.getRegions();
            const currentRegion = regions.find(reg => currentTime >= reg.start && currentTime <= reg.end);
            if (currentRegion) {
                this.segmentListView.highlightRow(currentRegion.index);
            }
        };

        this.waveformView.onSliceLineCreated = (time) => this.editorUseCase.addSlicePoint(time);
        this.waveformView.onSliceLineDeleted = (index) => this.editorUseCase.removeSlicePoint(index);
        this.waveformView.onSliceLineMoved = (index, newTime) => this.editorUseCase.moveSlicePoint(index, newTime);
        this.waveformView.onSegmentRightClicked = (clickTime) => {
            const regions = this.editorUseCase.getRegions();
            const targetRegion = regions.find(reg => clickTime >= reg.start && clickTime <= reg.end);
            if (targetRegion) this.editorUseCase.toggleRegionActive(targetRegion.index);
        };
    }

    _bindSegmentListEvents() {
        this.segmentListView.onTimeChanged = (index, startSec, endSec) => {
            if (index > 0 && startSec !== this.editorUseCase.slicePoints[index - 1]) {
                this.editorUseCase.moveSlicePoint(index - 1, startSec);
            }
            if (index < this.editorUseCase.slicePoints.length && endSec !== this.editorUseCase.slicePoints[index]) {
                this.editorUseCase.moveSlicePoint(index, endSec);
            }
        };

        this.segmentListView.onToggleActive = (index) => this.editorUseCase.toggleRegionActive(index);
        this.segmentListView.onAddSplit = (timeSec) => this.editorUseCase.addSlicePoint(timeSec);

        this.segmentListView.onRemoveSegment = (index) => {
            if (index === 0 && this.editorUseCase.slicePoints.length > 0) {
                this.editorUseCase.removeSlicePoint(0);
            } else if (index > 0) {
                this.editorUseCase.removeSlicePoint(index - 1);
            }
        };

        this.segmentListView.onPlayRegion = (index) => this.waveformView.playRegion(index);

        this.segmentListView.onDownloadRegion = async (index) => {
            const regions = this.editorUseCase.getRegions();
            const segment = regions.find(r => r.index === index);
            if (!segment || !segment.active) return;

            const format = document.getElementById('export-format')?.value || 'wav';
            this.controlPanel.showProcessingState(true, '準備中...', 0);
            try {
                await this.exportUseCase.execute([segment], format, (status, progress) => {
                    this.controlPanel.showProcessingState(true, status, progress);
                }, false);
            } catch (error) {
                alert("エラーが発生しました: " + error.message);
            } finally {
                this.controlPanel.showProcessingState(false);
            }
        };
    }

    _bindUseCaseEvents() {
        this.editorUseCase.onChange((slicePoints, regions) => {
            this.waveformView.updateSlicesAndSegments(slicePoints, regions);
            this.segmentListView.render(regions);
            this.segmentListView.show(regions.length > 0);
            this.controlPanel.setHistoryState(this.editorUseCase.canUndo, this.editorUseCase.canRedo);
            this._updateDownloadButtonState();
        });
    }

    _bindWavesurferInternalEvents() {
        const interval = setInterval(() => {
            if (this.waveformView.wavesurfer) {
                clearInterval(interval);
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
    }

    _handleSaveProject() {
        if (!this.currentFile) return;
        const data = {
            version: "1.0",
            fileName: this.currentFile.name,
            duration: this.editorUseCase.duration,
            slicePoints: this.editorUseCase.slicePoints,
            inactiveSegments: Array.from(this.editorUseCase.inactiveSegments)
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.currentFile.name.split('.')[0]}_project.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    _handleLoadProject(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                this.editorUseCase.suspendNotify();
                this.editorUseCase.slicePoints = data.slicePoints;
                this.editorUseCase.inactiveSegments = new Set(data.inactiveSegments || []);
                this.editorUseCase.resumeNotify();
            } catch (err) {
                alert("読み込みエラー: " + err.message);
            }
        };
        reader.readAsText(file);
    }

    _moveSeekToSplit(direction) {
        if (!this.waveformView.wavesurfer) return;
        const currentTime = this.waveformView.getCurrentTime();
        const slicePoints = [0, ...this.editorUseCase.slicePoints, this.waveformView.getDuration()];

        let targetTime = currentTime;
        if (direction > 0) {
            targetTime = slicePoints.find(p => p > currentTime + 0.1) ?? slicePoints[slicePoints.length - 1];
        } else {
            const prevPoints = slicePoints.filter(p => p < currentTime - 0.1);
            targetTime = prevPoints.length > 0 ? prevPoints[prevPoints.length - 1] : 0;
        }
        this.waveformView.wavesurfer.setTime(targetTime);
    }

    _updateDownloadButtonState() {
        const activeRegions = this.editorUseCase.getActiveRegions();
        this.controlPanel.setDownloadEnabled(activeRegions.length > 0);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new App();
});
