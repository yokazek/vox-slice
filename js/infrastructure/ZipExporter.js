/**
 * ZipExporter (Infrastructure Layer)
 * 外部ライブラリである `JSZip` を使い複数のBlobを1つのZIPに結合し、ブラウザのダウンロードをトリガーします。
 */
export default class ZipExporter {
    constructor() {
        this.jsZipLoaded = typeof JSZip !== 'undefined';
    }

    /**
     * Blobのリストを受け取り、ZIP化してダウンロードさせる
     * @param {Array<{filename: string, blob: Blob}>} fileMap 
     * @param {string} zipFilename ダウンロードされるZIPファイル名
     * @param {Function} zipProgressCallback (metadata) => void
     */
    async exportAsZip(fileMap, zipFilename, zipProgressCallback) {
        if (!this.jsZipLoaded) {
            throw new Error("JSZipライブラリが読み込まれていません");
        }

        const zip = new JSZip();

        // ZIP内にファイルを登録
        for (const file of fileMap) {
            zip.file(file.filename, file.blob);
        }

        // ZIPデータの生成
        const zipBlob = await zip.generateAsync({ type: 'blob' }, zipProgressCallback);

        // ダウンロード処理をトリガー
        this._triggerDownload(zipBlob, zipFilename);
    }

    /**
     * ブラウザ上で非表示のリンクを作成し、ダウンロードを強制的に発火させる
     * @param {Blob} blob 
     * @param {string} filename 
     */
    _triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);

        a.click();

        // クリーンアップ
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }
}
