/**
 * ControlPanel
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
        this.btnPlayPause = document.getElementById('btn-play-pause');
        this.iconPlay = this.btnPlayPause.querySelector('.icon-play');
        this.iconPause = this.btnPlayPause.querySelector('.icon-pause');
        this.currentTimeDisplay = document.getElementById('current-time');
        this.totalTimeDisplay = document.getElementById('total-time');

        // アクション関連
        this.btnSplit = document.getElementById('btn-split');

        // エクスポート関連
        this.btnDownloadAll = document.getElementById('btn-download-all');
        this.exportFormatSelect = document.getElementById('export-format');

        // 処理中オーバーレイ
        this.processingOverlay = document.getElementById('processing-overlay');
        this.processingStatus = document.getElementById('processing-status');
        this.processingProgress = document.getElementById('processing-progress');

        // 外部に通知するイベントコールバック群
        this.onFileSelected = null;       // (file)
        this.onPlayPauseClick = null;     // ()
        this.onSplitClick = null;         // ()
        this.onDownloadClick = null;      // (format)

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
        this.btnPlayPause.addEventListener('click', () => {
            if (this.onPlayPauseClick) this.onPlayPauseClick();
        });

        this.btnSplit.addEventListener('click', () => {
            if (this.onSplitClick) this.onSplitClick();
        });

        // --- 3. エクスポート関連 ---
        this.btnDownloadAll.addEventListener('click', () => {
            if (this.onDownloadClick) {
                const format = this.exportFormatSelect.value; // 'wav' or 'mp3'
                this.onDownloadClick(format);
            }
        });

        // --- 4. キーボードショートカット ---
        document.addEventListener('keydown', (e) => {
            // 入力フィールド（リスト上の数値変更など）にフォーカスがあるときは無視
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

            // Space key => 再生/一時停止
            if (e.code === 'Space') {
                e.preventDefault();
                if (this.onPlayPauseClick && !this.workspace.classList.contains('hidden')) {
                    this.onPlayPauseClick();
                }
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

        if (this.onFileSelected) {
            this.onFileSelected(file);
        }
    }

    // ====== UIの状態更新メソッド ======

    /**
     * 再生・停止ボタンの表示切り替え
     */
    setPlayingState(isPlaying) {
        if (isPlaying) {
            this.iconPlay.classList.add('hidden');
            this.iconPause.classList.remove('hidden');
        } else {
            this.iconPlay.classList.remove('hidden');
            this.iconPause.classList.add('hidden');
        }
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
