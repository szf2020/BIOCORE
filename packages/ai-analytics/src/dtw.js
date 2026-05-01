"use strict";
// Dynamic Time Warping — 批次相似度匹配
Object.defineProperty(exports, "__esModule", { value: true });
exports.dtwDistance = dtwDistance;
exports.rankBySimilarity = rankBySimilarity;
function dtwDistance(a, b) {
    const n = a.length, m = b.length;
    if (n === 0 || m === 0)
        return Infinity;
    const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(Infinity));
    dp[0][0] = 0;
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            const cost = Math.abs(a[i - 1] - b[j - 1]);
            dp[i][j] = cost + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[n][m];
}
function rankBySimilarity(target, historicals) {
    return historicals
        .map(h => ({ batchId: h.batchId, distance: dtwDistance(target, h.data) }))
        .sort((a, b) => a.distance - b.distance);
}
//# sourceMappingURL=dtw.js.map