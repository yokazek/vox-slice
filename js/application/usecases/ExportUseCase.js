/**
 * ExportUseCase (Application Layer)
 * ユーザーが指定した一連の「Region（区間）」をループ処理し、スライス、エンコード、ZIP圧縮を指揮します。
 * 実際のWeb AudioやMP3処理、ZIP処理については、コンストラクタで注入された外部サービス（Infrastructure）に委譲します。
 */
export default class ExportUseCase {
    /**
     * @param {Object} audioService - 音声のデコード、波形スライス、WAVエンコードを担当するサービス
     * @param {Object} mp3Encoder - MP3へのエンコードを担当するサービス
     * @param {Object} zipExporter - 複数ファイルをZIP化してダウンロードさせるサービス
     */
    constructor(audioService, mp3Encoder, zipExporter) {
        this.audioService = audioService;
        this.mp3Encoder = mp3Encoder;
        this.zipExporter = zipExporter;
    }

    /**
     * エクスポート処理を実行する
     * @param {Array} regions - ダウンロード対象のRegionオブジェクト配列
     * @param {string} format - 'wav' または 'mp3'
     * @param {Function} progressCallback - 進捗通知用コールバック (statusText, percent)
     * @param {boolean} asZip - ZIP圧縮して単一ファイルにするかどうか（デフォルトtrue）
     */
    async execute(regions, format, progressCallback, asZip = true) {
        if (!regions || regions.length === 0) {
            throw new Error("ダウンロード対象の区間がありません。");
        }

        let fileIndex = 1;
        const total = regions.length;
        const fileMap = []; // { filename: string, blob: Blob } の配列

        // 1. 各Regionごとにスライスとエンコードを実行
        for (const region of regions) {
            if (progressCallback) {
                progressCallback(`スライス生成中... ${fileIndex}/${total} 個目`, (fileIndex / total) * 50);
            }

            const slicedBuffer = this.audioService.sliceAudio(region.start, region.end);

            let blob;
            if (format === 'mp3') {
                blob = await this.mp3Encoder.encode(slicedBuffer);
            } else {
                blob = await this.audioService.encodeToWav(slicedBuffer);
            }

            const filename = `slice_${String(fileIndex).padStart(3, '0')}.${format}`;
            fileMap.push({ filename, blob });

            fileIndex++;
        }

        // 2. ZIP生成とダウンロードの指示、または個別ダウンロード
        if (asZip) {
            if (progressCallback) {
                progressCallback(`ZIPファイルを圧縮中...`, 50);
            }
            await this.zipExporter.exportAsZip(fileMap, 'VoiceSlicer_Export.zip', (metadata) => {
                if (progressCallback) {
                    progressCallback(`ZIPファイルを圧縮中... ${metadata.percent.toFixed(1)}%`, 50 + (metadata.percent / 2));
                }
            });
        } else {
            // 個別ファイルのままブラウザの機能でダウンロードする
            for (const file of fileMap) {
                this._downloadSingleFile(file.blob, file.filename);
            }
        }

        if (progressCallback) {
            progressCallback(`処理完了`, 100);
        }
    }

    _downloadSingleFile(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }
}
