/**
 * SegmentListView
 * グラフ下部の区切り（セグメント）リストのUIを管理するクラス
 */
export default class SegmentListView {
    constructor(containerSelector) {
        this.container = document.querySelector(containerSelector);
        this.tbody = this.container.querySelector('tbody');

        // 外部に通知するためのコールバック
        this.onTimeChanged = null; // (segmentIndex, startSec, endSec)
        this.onToggleActive = null; // (segmentIndex)
        this.onAddSplit = null;     // (timeSec)
        this.onRemoveSegment = null; // (segmentIndex)
        this.onPlayRegion = null;    // (segmentIndex)
        this.onDownloadRegion = null; // (segmentIndex)

        this.btnAddSplit = this.container.querySelector('#btn-add-split');
        this.inputSplitTime = this.container.querySelector('#input-split-time');

        if (this.btnAddSplit && this.inputSplitTime) {
            this.btnAddSplit.addEventListener('click', () => {
                const time = parseFloat(this.inputSplitTime.value);
                if (!isNaN(time) && time >= 0) {
                    if (this.onAddSplit) this.onAddSplit(time);
                    this.inputSplitTime.value = ''; // クリア
                }
            });
        }
    }

    /**
     * リストUIを表示/非表示にする
     */
    show(show) {
        if (show) {
            this.container.classList.remove('hidden');
        } else {
            this.container.classList.add('hidden');
        }
    }

    /**
     * SliceManagerのもつデータ配列を元にリスト全体を再描画する
     * @param {Array} segments SliceManagerで管理されている区間の配列
     */
    render(segments) {
        this.tbody.innerHTML = '';

        if (!segments || segments.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="6" style="text-align: center; color: var(--clr-text-muted);">区切りがありません</td>`;
            this.tbody.appendChild(tr);
            return;
        }

        segments.forEach((segment) => {
            const tr = this._createRow(segment, segments.length);
            // 行にIDを付与して後から検索できるようにする
            tr.id = `segment-row-${segment.index}`;
            this.tbody.appendChild(tr);
        });
    }

    /**
     * 指定されたインデックスの行をハイライトし、必要ならスクロールで表示する
     * @param {number} index ハイライトするセグメントのインデックス
     */
    highlightRow(index) {
        // 現在のハイライトをすべて解除
        const allRows = Array.from(this.tbody.querySelectorAll('tr'));
        allRows.forEach(tr => {
            tr.style.backgroundColor = '';
            tr.style.borderLeft = '';
        });

        // 対象の行を取得
        const targetRow = this.tbody.querySelector(`#segment-row-${index}`);
        if (!targetRow) return;

        // ハイライトのスタイルを直接またはクラスで適用 (ここでは簡便に直接適用)
        targetRow.style.backgroundColor = 'rgba(251, 188, 4, 0.15)'; // primary colorの薄い版
        targetRow.style.borderLeft = '4px solid var(--clr-primary)';

        // スクロール範囲外ならスクロールして見えるようにする
        const containerRect = this.container.getBoundingClientRect();
        const rowRect = targetRow.getBoundingClientRect();

        // theadの高さ分などのオフセット（ヘッダーで隠れるのを防ぐ）
        const offset = 40;

        if (rowRect.top < containerRect.top + offset || rowRect.bottom > containerRect.bottom) {
            targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    /**
     * 1行分のDOM要素を生成する
     */
    _createRow(segment, totalSegments) {
        const tr = document.createElement('tr');
        if (!segment.active) {
            tr.classList.add('inactive');
        }

        const startSec = segment.start.toFixed(3);
        const endSec = segment.end.toFixed(3);
        const lengthSec = (segment.end - segment.start).toFixed(3);

        const isFirst = segment.index === 0;
        const isLast = segment.index === totalSegments - 1;

        tr.innerHTML = `
            <td>${segment.index + 1}</td>
            <td>
                <input type="number" class="number-input start-input" value="${startSec}" min="0" step="0.001" ${isFirst ? 'disabled' : ''}>
            </td>
            <td>
                <input type="number" class="number-input end-input" value="${endSec}" min="0" step="0.001" ${isLast ? 'disabled' : ''}>
            </td>
            <td>${lengthSec}</td>
            <td>
                <div style="display: flex; align-items: center; justify-content: flex-end; gap: 4px;">
                    <button class="btn-icon-sm play-btn" title="この区間だけを再生 (Space)" style="display: inline-flex; border: 1px solid var(--clr-border); background: transparent;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    </button>
                    <button class="btn-icon-sm dl-btn" title="この区間だけを保存" style="display: inline-flex; border: 1px solid var(--clr-border); background: transparent;" ${segment.active ? '' : 'disabled'}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </button>
                    <button class="btn-icon-sm delete-btn" title="区切り線を削除して前の区間と結合" style="display: inline-flex; border: 1px solid var(--clr-border); background: transparent;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                    <div style="width: 1px; height: 16px; background: var(--clr-border); margin: 0 4px;"></div>
                    <button class="btn-icon-sm status-toggle-btn" title="${segment.active ? 'この区間を除外する' : 'この区間を有効にする'}" style="display: inline-flex; border: 1px solid var(--clr-border); background: transparent; color: ${segment.active ? 'var(--clr-primary)' : 'var(--clr-text-muted)'};">
                        ${segment.active ?
                `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>` :
                `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`
            }
                    </button>
                </div>
            </td>
        `;

        // イベントリスナーの登録
        const startInput = tr.querySelector('.start-input');
        const endInput = tr.querySelector('.end-input');
        const statusBadge = tr.querySelector('.status-badge');

        // 数値入力の変更時 (フォーカスが外れた時、またはEnter時など)
        const handleTimeChange = () => {
            let newStart = parseFloat(startInput.value);
            let newEnd = parseFloat(endInput.value);

            // 簡単なバリデーション（開始が終了を上回らないように）
            if (isNaN(newStart) || newStart < 0) newStart = 0;
            if (isNaN(newEnd)) newEnd = newStart + 0.001;
            if (newStart >= newEnd) {
                // 不正な場合はとりあえず元に戻す
                startInput.value = startSec;
                endInput.value = endSec;
                return;
            }

            if (this.onTimeChanged) {
                this.onTimeChanged(segment.index, newStart, newEnd);
            }
        };

        startInput.addEventListener('change', handleTimeChange);
        endInput.addEventListener('change', handleTimeChange);

        // 状態（有効/除外）のトグルクリック時
        const statusToggleBtn = tr.querySelector('.status-toggle-btn');
        statusToggleBtn.addEventListener('click', () => {
            if (this.onToggleActive) {
                this.onToggleActive(segment.index);
            }
        });

        // 再生ボタンのクリック時
        const playBtn = tr.querySelector('.play-btn');
        playBtn.addEventListener('click', () => {
            if (this.onPlayRegion) {
                this.onPlayRegion(segment.index);
            }
        });

        // 保存ボタンのクリック時
        const dlBtn = tr.querySelector('.dl-btn');
        dlBtn.addEventListener('click', () => {
            if (this.onDownloadRegion) {
                this.onDownloadRegion(segment.index);
            }
        });

        // 削除ボタンのクリック時
        const deleteBtn = tr.querySelector('.delete-btn');
        if (totalSegments <= 1) {
            deleteBtn.disabled = true;
            deleteBtn.style.opacity = '0.5';
            deleteBtn.style.cursor = 'not-allowed';
        } else {
            deleteBtn.addEventListener('click', () => {
                if (this.onRemoveSegment) {
                    this.onRemoveSegment(segment.index);
                }
            });
        }

        return tr;
    }
}
