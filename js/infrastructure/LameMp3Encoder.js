/**
 * LameMp3Encoder (Infrastructure Layer)
 * 外部ライブラリである `lamejs` をラップし、AudioBuffer を MP3 Blob に変換する責務を負います。
 */
export default class LameMp3Encoder {
    constructor() {
        this.lameJsLoaded = typeof lamejs !== 'undefined';
    }

    /**
     * AudioBufferをMP3 Blobにエンコードする
     * @param {AudioBuffer} buffer 
     * @returns {Promise<Blob>}
     */
    async encode(buffer) {
        if (!this.lameJsLoaded) {
            throw new Error("lamejsが読み込まれていないため、MP3エンコードは実行できません");
        }

        return new Promise((resolve) => {
            const channels = buffer.numberOfChannels;
            const sampleRate = buffer.sampleRate;
            const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, 128); // 128kbps
            const mp3Data = [];

            const left = buffer.getChannelData(0);
            const right = channels > 1 ? buffer.getChannelData(1) : null;

            const sampleBlockSize = 1152;
            const leftInt16 = new Int16Array(left.length);
            const rightInt16 = right ? new Int16Array(right.length) : null;

            // Float32 -> Int16 変換
            for (let i = 0; i < left.length; i++) {
                let sampleL = Math.max(-1, Math.min(1, left[i]));
                leftInt16[i] = sampleL < 0 ? sampleL * 0x8000 : sampleL * 0x7FFF;

                if (right) {
                    let sampleR = Math.max(-1, Math.min(1, right[i]));
                    rightInt16[i] = sampleR < 0 ? sampleR * 0x8000 : sampleR * 0x7FFF;
                }
            }

            // ブロックごとにエンコード
            for (let i = 0; i < leftInt16.length; i += sampleBlockSize) {
                const leftChunk = leftInt16.subarray(i, i + sampleBlockSize);
                const rightChunk = rightInt16 ? rightInt16.subarray(i, i + sampleBlockSize) : null;

                let mp3buf;
                if (channels === 1) {
                    mp3buf = mp3encoder.encodeBuffer(leftChunk);
                } else {
                    mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
                }

                if (mp3buf.length > 0) {
                    mp3Data.push(new Int8Array(mp3buf));
                }
            }

            // エンコード終了処理
            const mp3buf = mp3encoder.flush();
            if (mp3buf.length > 0) {
                mp3Data.push(new Int8Array(mp3buf));
            }

            resolve(new Blob(mp3Data, { type: 'audio/mp3' }));
        });
    }
}
