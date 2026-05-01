"use strict";
// 历史批次包络线 (均值 ± 2σ)
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildEnvelope = buildEnvelope;
exports.checkEnvelope = checkEnvelope;
function buildEnvelope(batches) {
    if (batches.length === 0)
        return { mean: [], upper: [], lower: [] };
    const maxLen = Math.max(...batches.map(b => b.length));
    const mean = [];
    const upper = [];
    const lower = [];
    for (let i = 0; i < maxLen; i++) {
        const vals = batches.map(b => b[i]).filter(v => v !== undefined);
        if (vals.length === 0) {
            mean.push(0);
            upper.push(0);
            lower.push(0);
            continue;
        }
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        const variance = vals.reduce((sum, v) => sum + (v - avg) ** 2, 0) / vals.length;
        const std = Math.sqrt(variance);
        mean.push(avg);
        upper.push(avg + 2 * std);
        lower.push(avg - 2 * std);
    }
    return { mean, upper, lower };
}
function checkEnvelope(current, envelope) {
    const deviations = [];
    let inBand = true;
    for (let i = 0; i < current.length && i < envelope.mean.length; i++) {
        if (current[i] > envelope.upper[i] || current[i] < envelope.lower[i]) {
            inBand = false;
            deviations.push(current[i] - envelope.mean[i]);
        }
        else {
            deviations.push(0);
        }
    }
    return { inBand, deviations };
}
//# sourceMappingURL=envelope.js.map