/**
 * VoxSlice - ControlPanel
 * UIコントロール群（再生、区切らせるボタン、ダウンロードなど）のイベントを管理するクラス
 */
export default class ControlPanel {
    constructor() {
        // アップロード関連
        this.dropZone = document.getElementById('upload-section');
        this.fileInput = document.getElementById('file-input');
        this.btnBrowse = document.getElementById('btn-browse');
        this.workspace = document.getElementById('workspace');
        this.fileNameDisplay = document.getElementById('file-name-display');

        // 再生コントロール関連
        this.currentTimeDisplay = document.getElementById('current-time');
        this.totalTimeDisplay = document.getElementById('total-time');
        this.headerTimeDisplay = document.getElementById('header-time-display');
        this.btnLoopToggle = document.getElementById('btn-loop-toggle');

        // アクション・履歴関連
        this.btnUndo = document.getElementById('btn-undo');
        this.btnRedo = document.getElementById('btn-redo');
        this.btnSplit = document.getElementById('btn-split');
        this.btnAutoSilence = document.getElementById('btn-auto-silence');
        this.inputSilenceThresh = document.getElementById('input-silence-thresh');
        this.inputSilenceDuration = document.getElementById('input-silence-duration');

        // 音量コントロール
        this.volumeSlider = document.getElementById('volume-slider');

        // プロジェクト保存/読込
        this.btnSaveProject = document.getElementById('btn-save-project');
        this.btnLoadProject = document.getElementById('btn-load-project');
        this.projectInput = document.getElementById('project-input');

        // エクスポートフォーマットは main.js や RegionListView から直接取れるか、もしくは残す
        this.exportFormatSelect = document.getElementById('export-format');
        this.btnDownloadAll = document.getElementById('btn-download-all');

        // 処理中オーバーレイ
        this.processingOverlay = document.getElementById('processing-overlay');
        this.processingStatus = document.getElementById('processing-status');
        this.processingProgress = document.getElementById('processing-progress');

        // リセット / タイトル
        this.btnReset = document.getElementById('btn-reset');
        this.appTitle = document.getElementById('app-title');

        // 外部に通知するイベントコールバック群
        this.onFileSelected = null;       // (file)
        this.onSpaceKeyPress = null;      // ()
        this.onLoopToggleClick = null;    // (isLooping)
        this.onSplitClick = null;         // ()
        this.onAutoSilenceClick = null;   // (thresholdDb, duration)
        this.onDownloadClick = null;      // (format)

        this.onVolumeChange = null;       // (volume)
        this.onUndoClick = null;          // ()
        this.onRedoClick = null;          // ()
        this.onSaveProjectClick = null;   // ()
        this.onLoadProjectFile = null;    // (file)
        this.onPrevRegionRequest = null;  // ()
        this.onNextRegionRequest = null;  // ()

        this._setupEvents();
    }

    _setupEvents() {
        // --- 1. ファイルアップロード関連 ---
        // クリックでファイル選択
        this.btnBrowse.addEventListener('click', () => {
            this.fileInput.click();
        });

        this.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this._handleFile(e.target.files[0]);
            }
        });

        // ドラッグ＆ドロップ
        this.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.classList.add('dragover');
        });

        this.dropZone.addEventListener('dragleave', () => {
            this.dropZone.classList.remove('dragover');
        });

        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('dragover');

            if (e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                if (file.type.includes('audio') || file.name.endsWith('.wav') || file.name.endsWith('.mp3')) {
                    this._handleFile(file);
                } else {
                    alert('wavまたはmp3ファイルを選択してください。');
                }
            }
        });

        // --- 2. プレイヤーコントロール関連 ---
        // ループボタンの実装 (スイッチ)
        this.isLooping = false;
        this.btnLoopToggle.addEventListener('change', () => {
            this.isLooping = this.btnLoopToggle.checked;
            if (this.onLoopToggleClick) {
                this.onLoopToggleClick(this.isLooping);
            }
        });

        this.btnSplit.addEventListener('click', () => {
            if (this.onSplitClick) this.onSplitClick();
        });

        this.btnAutoSilence.addEventListener('click', () => {
            if (this.onAutoSilenceClick) {
                const thresh = parseFloat(this.inputSilenceThresh.value);
                const duration = parseFloat(this.inputSilenceDuration.value);
                this.onAutoSilenceClick(thresh, duration);
            }
        });

        if (this.btnUndo) {
            this.btnUndo.addEventListener('click', () => {
                if (this.onUndoClick) this.onUndoClick();
            });
        }
        if (this.btnRedo) {
            this.btnRedo.addEventListener('click', () => {
                if (this.onRedoClick) this.onRedoClick();
            });
        }

        if (this.volumeSlider) {
            this.volumeSlider.addEventListener('input', (e) => {
                if (this.onVolumeChange) this.onVolumeChange(parseFloat(e.target.value));
            });
        }

        if (this.btnSaveProject) {
            this.btnSaveProject.addEventListener('click', () => {
                if (this.onSaveProjectClick) this.onSaveProjectClick();
            });
        }

        if (this.btnLoadProject && this.projectInput) {
            this.btnLoadProject.addEventListener('click', () => {
                this.projectInput.click();
            });

            this.projectInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0 && this.onLoadProjectFile) {
                    this.onLoadProjectFile(e.target.files[0]);
                }
                this.projectInput.value = ''; // リセット
            });
        }

        // --- エクスポート関連 ---
        if (this.btnDownloadAll) {
            this.btnDownloadAll.addEventListener('click', () => {
                if (this.onDownloadClick) {
                    const format = this.exportFormatSelect.value;
                    this.onDownloadClick(format);
                }
            });
        }

        // --- リセット処理 (ページリロード) ---
        const handleReload = () => {
            if (!this.workspace.classList.contains('hidden')) {
                if (confirm('現在の作業内容は消去されます。よろしいですか？')) {
                    window.location.reload();
                }
            } else {
                window.location.reload();
            }
        };

        if (this.btnReset) {
            this.btnReset.addEventListener('click', handleReload);
        }
        if (this.appTitle) {
            this.appTitle.addEventListener('click', handleReload);
        }

        // --- 4. キーボードショートカット ---
        document.addEventListener('keydown', (e) => {
            // 入力フィールド（リスト上の数値変更など）にフォーカスがあるときは無視
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

            // Space key => 現在位置の区間を再生 / 一時停止
            if (e.code === 'Space') {
                e.preventDefault();
                if (this.onSpaceKeyPress && !this.workspace.classList.contains('hidden')) {
                    this.onSpaceKeyPress();
                }
            }

            // Ctrl+Z (Undo) / Ctrl+Y or Ctrl+Shift+Z (Redo)
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

            if (isCmdOrCtrl && e.code === 'KeyZ') {
                e.preventDefault();
                if (e.shiftKey) {
                    // Redo
                    if (this.onRedoClick) this.onRedoClick();
                } else {
                    // Undo
                    if (this.onUndoClick) this.onUndoClick();
                }
                return;
            }

            if (isCmdOrCtrl && e.code === 'KeyY') {
                e.preventDefault();
                if (this.onRedoClick) this.onRedoClick();
                return;
            }

            // ArrowLeft / ArrowRight => 区間移動
            if (e.code === 'ArrowLeft') {
                e.preventDefault();
                if (this.onPrevRegionRequest) this.onPrevRegionRequest();
                return;
            }
            if (e.code === 'ArrowRight' || e.code === 'Tab') {
                e.preventDefault();
                if (this.onNextRegionRequest) this.onNextRegionRequest();
                return;
            }

            // Enter key => 現在位置で区切る
            if (e.code === 'Enter') {
                e.preventDefault();
                if (this.onSplitClick && !this.workspace.classList.contains('hidden')) {
                    this.btnSplit.classList.add('active'); // 視覚的フィードバック
                    this.onSplitClick();
                    setTimeout(() => this.btnSplit.classList.remove('active'), 100);
                }
            }
        });
    }

    _handleFile(file) {
        this.fileNameDisplay.textContent = file.name;
        // アップロードUIを隠してワークスペースを表示
        this.dropZone.classList.add('hidden');
        this.workspace.classList.remove('hidden');

        // ヘッダーのアニメーションと時間表示の有効化
        const container = document.querySelector('.app-container');
        if (container) container.classList.add('workspace-active');
        if (this.headerTimeDisplay) this.headerTimeDisplay.style.display = 'flex';

        if (this.onFileSelected) {
            this.onFileSelected(file);
        }
    }

    // ====== UIの状態更新メソッド ======

    /**
     * Undo/Redoボタンの有効化・無効化を切り替える
     */
    setHistoryState(canUndo, canRedo) {
        if (this.btnUndo) {
            if (canUndo) {
                this.btnUndo.removeAttribute('disabled');
            } else {
                this.btnUndo.setAttribute('disabled', 'true');
            }
        }
        if (this.btnRedo) {
            if (canRedo) {
                this.btnRedo.removeAttribute('disabled');
            } else {
                this.btnRedo.setAttribute('disabled', 'true');
            }
        }
    }

    /**
     * 再生状態に応じてPlay/Pauseアイコンを切り替える (ボタン削除に伴い無効化)
     */
    setPlayingState(isPlaying) {
        // 何もしない
    }

    /**
     * 時間表示の更新 (00:00.000 形式)
     */
    updateTimeDisplay(currentSec, totalSec) {
        if (currentSec !== undefined) {
            this.currentTimeDisplay.textContent = this._formatTime(currentSec);
        }
        if (totalSec !== undefined) {
            this.totalTimeDisplay.textContent = this._formatTime(totalSec);
        }
    }

    /**
     * ダウンロードボタンの有効/無効切り替え
     */
    setDownloadEnabled(enabled) {
        this.btnDownloadAll.disabled = !enabled;
    }

    /**
     * 処理中オーバーレイの表示制御
     */
    showProcessingState(show, text = '処理中...', progressPercent = 0) {
        if (show) {
            this.processingOverlay.classList.remove('hidden');
            this.processingStatus.textContent = text;
            this.processingProgress.style.width = `${progressPercent}%`;
        } else {
            this.processingOverlay.classList.add('hidden');
        }
    }

    /**
     * 秒数を 00:00.000 の文字列にフォーマット
     */
    _formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return '00:00.000';

        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);

        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    }
}
