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
            this.tbody.appendChild(tr);
        });
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
                <span class="status-badge ${segment.active ? 'status-active' : 'status-inactive'}">
                    ${segment.active ? '有効' : '除外'}
                </span>
            </td>
            <td>
                <button class="btn btn-secondary btn-sm play-btn" title="この区間だけを再生します" style="padding: 2px 8px; font-size: 0.75rem; border-radius: 4px; cursor: pointer; margin-right: 4px;">▶ 再生</button>
                <button class="btn btn-danger btn-sm delete-btn" title="直前の区切り線を削除して結合します" style="padding: 2px 8px; font-size: 0.75rem; background-color: var(--clr-danger, #ef4444); color: white; border: none; border-radius: 4px; cursor: pointer;">削 除</button>
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
        statusBadge.addEventListener('click', () => {
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
