/**
 * WebAudioService (Infrastructure Layer)
 * ブラウザ標準の Web Audio API を活用し、音声ファイルのデコード、WAVエンコード、および指定秒数での切り出しを実行します。
 */
export default class WebAudioService {
    constructor() {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.originalBuffer = null;
    }

    /**
     * ArrayBufferからAudioBufferにデコードし内部に保持する
     * @param {ArrayBuffer} arrayBuffer 
     */
    async decodeAudioData(arrayBuffer) {
        if (this.audioCtx.state === 'closed') {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }

        try {
            this.originalBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
        } catch (error) {
            console.error("Audio decoding failed", error);
            throw new Error("音声のデコードに失敗しました");
        }
    }

    /**
     * 保持しているAudioBufferから指定区間を切り出した新しいAudioBufferを返す
     * @param {number} startSec 
     * @param {number} endSec 
     * @returns {AudioBuffer}
     */
    sliceAudio(startSec, endSec) {
        if (!this.originalBuffer) throw new Error("音声が読み込まれていません");

        const sampleRate = this.originalBuffer.sampleRate;
        const channels = this.originalBuffer.numberOfChannels;

        const startOffset = Math.floor(sampleRate * startSec);
        const endOffset = Math.floor(sampleRate * endSec);
        const frameCount = endOffset - startOffset;

        if (frameCount <= 0) {
            throw new Error("無効な区間です");
        }

        const newBuffer = this.audioCtx.createBuffer(channels, frameCount, sampleRate);

        for (let i = 0; i < channels; i++) {
            const channelData = this.originalBuffer.getChannelData(i);
            const slicedData = new Float32Array(frameCount);
            for (let j = 0; j < frameCount; j++) {
                slicedData[j] = channelData[startOffset + j];
            }
            newBuffer.copyToChannel(slicedData, i);
        }

        return newBuffer;
    }

    /**
     * AudioBufferをWAV Blobにエンコードする
     * @param {AudioBuffer} buffer 
     * @returns {Promise<Blob>}
     */
    async encodeToWav(buffer) {
        return new Promise((resolve) => {
            const numOfChan = buffer.numberOfChannels;
            const length = buffer.length * numOfChan * 2 + 44;
            const out = new ArrayBuffer(length);
            const view = new DataView(out);
            const channels = [];
            let sample;
            let offset = 0;
            let pos = 0;

            // write WAVE header
            setUint32(0x46464952);                         // "RIFF"
            setUint32(length - 8);                         // file length - 8
            setUint32(0x45564157);                         // "WAVE"

            setUint32(0x20746d66);                         // "fmt " chunk
            setUint32(16);                                 // length = 16
            setUint16(1);                                  // PCM (uncompressed)
            setUint16(numOfChan);
            setUint32(buffer.sampleRate);
            setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
            setUint16(numOfChan * 2);                      // block-align
            setUint16(16);                                 // 16-bit

            setUint32(0x61746164);                         // "data" - chunk
            setUint32(length - pos - 4);                   // chunk length

            // write interleaved data
            for (let i = 0; i < buffer.numberOfChannels; i++) {
                channels.push(buffer.getChannelData(i));
            }

            while (pos < length) {
                if (offset >= buffer.length) break;
                for (let i = 0; i < numOfChan; i++) {
                    sample = Math.max(-1, Math.min(1, channels[i][offset]));
                    sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
                    view.setInt16(pos, sample, true);
                    pos += 2;
                }
                offset++;
            }

            resolve(new Blob([view], { type: "audio/wav" }));

            function setUint16(data) {
                view.setUint16(pos, data, true);
                pos += 2;
            }

            function setUint32(data) {
                view.setUint32(pos, data, true);
                pos += 4;
            }
        });
    }
}
