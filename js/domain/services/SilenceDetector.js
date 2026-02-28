/**
 * SilenceDetector
 * 音声データ(AudioBuffer)から無音区間を検出するためのドメインサービス
 */
export default class SilenceDetector {
    /**
     * 音声バッファを解析して無音区間の配列を返す
     * @param {AudioBuffer} audioBuffer 解析対象の音声データ
     * @param {number} thresholdDb しきい値 (dB)
     * @param {number} minSeconds 最小秒数
     * @returns {Array<{start: number, end: number}>} 無音区間のリスト
     */
    detect(audioBuffer, thresholdDb, minSeconds) {
        // 片方のチャンネル(Left)を基準に判定する
        const channelData = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;
        const threshold = Math.pow(10, thresholdDb / 20); // dBから振幅(Amplitude)へ変換

        // 50msごとに区切って判定
        const windowSize = Math.floor(sampleRate * 0.05);
        const regions = [];

        let isSilent = false;
        let silenceStart = 0;

        for (let i = 0; i < channelData.length; i += windowSize) {
            let maxAmp = 0;
            const endIdx = Math.min(i + windowSize, channelData.length);
            for (let j = i; j < endIdx; j++) {
                const v = Math.abs(channelData[j]);
                if (v > maxAmp) maxAmp = v;
            }

            const currentlySilent = maxAmp < threshold;

            if (currentlySilent && !isSilent) {
                isSilent = true;
                silenceStart = i / sampleRate;
            } else if (!currentlySilent && isSilent) {
                isSilent = false;
                const silenceEnd = i / sampleRate;
                if ((silenceEnd - silenceStart) >= minSeconds) {
                    regions.push({ start: silenceStart, end: silenceEnd });
                }
            }
        }

        if (isSilent) {
            const silenceEnd = channelData.length / sampleRate;
            if ((silenceEnd - silenceStart) >= minSeconds) {
                regions.push({ start: silenceStart, end: silenceEnd });
            }
        }

        return regions;
    }
}
