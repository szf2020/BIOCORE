"use strict";
// CUSUM (Cumulative Sum) 异常检测器
// 基于历史批次均值±标准差的在线偏移检测
Object.defineProperty(exports, "__esModule", { value: true });
exports.CUSUMDetector = void 0;
class CUSUMDetector {
    channel;
    mean = 0;
    std = 1;
    h = 4; // 报警阈值 (h × std)
    k = 0.5; // 漂移容许 (k × std)
    cumPos = 0;
    cumNeg = 0;
    configured = false;
    constructor(channel = '') {
        this.channel = channel;
    }
    setBaseline(mean, std, h = 4, k = 0.5) {
        this.mean = mean;
        this.std = Math.max(std, 0.001);
        this.h = h;
        this.k = k;
        this.configured = true;
        this.reset();
    }
    detect(value) {
        if (!this.configured)
            return { anomaly: false, cumPos: 0, cumNeg: 0, normalized: 0 };
        const z = (value - this.mean) / this.std;
        const drift = this.k;
        this.cumPos = Math.max(0, this.cumPos + z - drift);
        this.cumNeg = Math.max(0, this.cumNeg - z - drift);
        const anomaly = this.cumPos > this.h || this.cumNeg > this.h;
        return { anomaly, cumPos: this.cumPos, cumNeg: this.cumNeg, normalized: z };
    }
    reset() { this.cumPos = 0; this.cumNeg = 0; }
    isConfigured() { return this.configured; }
    getChannel() { return this.channel; }
}
exports.CUSUMDetector = CUSUMDetector;
//# sourceMappingURL=cusum.js.map