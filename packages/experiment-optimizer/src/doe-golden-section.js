"use strict";
// ============================================================
// doe-golden-section.ts — 黄金分割法单因素优选
//
// 参考《试验设计与数据处理》第2章:
//   试验中只考察一个因素时, 利用黄金分割比 0.618
//   合理安排试验, 减少试验次数, 迅速找到最佳点.
//
// 算法流程:
//   1. 在 [a, b] 区间内取两个试验点 x1, x2
//      x1 = a + 0.382*(b-a),  x2 = a + 0.618*(b-a)
//   2. 比较 f(x1) 和 f(x2), 缩小区间
//   3. 重复直到区间足够小或达到最大迭代数
//
// 同时实现 Fibonacci 法作为可选替代
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGoldenSearch = createGoldenSearch;
exports.advanceGoldenSearch = advanceGoldenSearch;
exports.fibonacciSearchPoints = fibonacciSearchPoints;
exports.createMultiFactorSearch = createMultiFactorSearch;
exports.advanceMultiFactorSearch = advanceMultiFactorSearch;
/** 黄金分割比 */
const PHI = (Math.sqrt(5) - 1) / 2; // 0.6180339887...
const PHI_COMPLEMENT = 1 - PHI; // 0.3819660113...
// ─── 黄金分割搜索器 ────────────────────────────────────────
/**
 * 创建黄金分割搜索状态
 *
 * @param factorName - 因素名称
 * @param min - 搜索区间下界
 * @param max - 搜索区间上界
 * @param goal - 优化方向
 */
function createGoldenSearch(factorName, min, max, goal = 'maximize') {
    // 第一个试验点
    const x1 = min + PHI_COMPLEMENT * (max - min);
    return {
        factorName,
        interval: [min, max],
        evaluatedPoints: [],
        nextPoint: x1,
        currentBest: null,
        converged: false,
        iteration: 0,
    };
}
/**
 * 提交试验结果并获取下一个试验点
 *
 * @param state - 当前搜索状态
 * @param x - 刚完成的试验点
 * @param y - 对应的响应值
 * @param goal - 优化方向
 * @param tolerance - 收敛容差 (区间长度 / 初始区间长度 < tolerance 时停止)
 * @param maxIterations - 最大迭代次数
 * @returns 更新后的状态 (包含下一个试验点或收敛标记)
 */
function advanceGoldenSearch(state, x, y, goal = 'maximize', tolerance = 0.05, maxIterations = 10) {
    const newState = { ...state };
    newState.evaluatedPoints = [...state.evaluatedPoints, { x, y }];
    newState.iteration = state.iteration + 1;
    // 更新当前最优
    if (!newState.currentBest || isBetter(y, newState.currentBest.y, goal)) {
        newState.currentBest = { x, y };
    }
    const points = newState.evaluatedPoints;
    const [a, b] = newState.interval;
    const initialLength = b - a;
    // 检查收敛
    if (newState.iteration >= maxIterations) {
        newState.converged = true;
        newState.nextPoint = null;
        return newState;
    }
    const currentLength = newState.interval[1] - newState.interval[0];
    if (currentLength / initialLength < tolerance) {
        newState.converged = true;
        newState.nextPoint = null;
        return newState;
    }
    // 前两个点: 先安排两端或黄金分割点
    if (points.length === 1) {
        // 第一个点已评估, 安排第二个点
        const x2 = a + PHI * (b - a);
        newState.nextPoint = x2;
        return newState;
    }
    // 有至少2个点后, 根据比较结果缩小区间
    const lastTwo = points.slice(-2);
    const [p1, p2] = lastTwo[0].x < lastTwo[1].x ? lastTwo : [lastTwo[1], lastTwo[0]];
    if (isBetter(p2.y, p1.y, goal)) {
        // 较大x处更优 → 新区间 [p1.x, b]
        newState.interval = [p1.x, newState.interval[1]];
        // 下一个点: 在新区间的黄金分割处
        const newA = p1.x;
        const newB = newState.interval[1];
        newState.nextPoint = newA + PHI * (newB - newA);
    }
    else {
        // 较小x处更优 → 新区间 [a, p2.x]
        newState.interval = [newState.interval[0], p2.x];
        const newA = newState.interval[0];
        const newB = p2.x;
        newState.nextPoint = newA + PHI_COMPLEMENT * (newB - newA);
    }
    return newState;
}
/**
 * 比较两个响应值, 返回 a 是否优于 b
 */
function isBetter(a, b, goal) {
    return goal === 'maximize' ? a > b : a < b;
}
// ─── Fibonacci 搜索法 ──────────────────────────────────────
/**
 * 生成 Fibonacci 数列前 n 项
 */
function fibonacci(n) {
    const fib = [1, 1];
    for (let i = 2; i < n; i++) {
        fib.push(fib[i - 1] + fib[i - 2]);
    }
    return fib;
}
/**
 * Fibonacci 搜索法 — 预先确定试验次数
 *
 * 与黄金分割法相似, 但用 Fibonacci 比代替黄金比,
 * 在已知总试验次数时, 每次缩短区间的效率略优于黄金分割.
 *
 * @param factorName - 因素名称
 * @param min - 区间下界
 * @param max - 区间上界
 * @param totalTrials - 总试验次数 (包含区间两端)
 * @returns 全部试验点 (按顺序排列)
 */
function fibonacciSearchPoints(factorName, min, max, totalTrials) {
    if (totalTrials < 2)
        return [(min + max) / 2];
    const fib = fibonacci(totalTrials + 1);
    const points = [];
    let a = min;
    let b = max;
    for (let k = 0; k < totalTrials - 1; k++) {
        const ratio = fib[totalTrials - k - 1] / fib[totalTrials - k];
        const x1 = a + ratio * (b - a);
        points.push(x1);
        // 后续根据实验结果动态调整, 这里只生成初始推荐点
        // 实际使用时应配合 advanceGoldenSearch
    }
    return points;
}
/**
 * 创建多因素独立黄金分割搜索
 *
 * 按顺序对每个因素独立搜索:
 *   搜索因素A (其他固定) → 找到A最优 →
 *   搜索因素B (A固定在最优, 其他固定) → ...
 *
 * @param factorRanges - 各因素的搜索范围
 * @param goal - 优化方向
 */
function createMultiFactorSearch(factorRanges, goal = 'maximize') {
    const factors = {};
    const factorOrder = factorRanges.map(f => f.name);
    for (const f of factorRanges) {
        factors[f.name] = createGoldenSearch(f.name, f.min, f.max, goal);
    }
    return {
        factors,
        currentFactor: factorOrder[0] ?? null,
        factorOrder,
        currentIndex: 0,
        completed: factorOrder.length === 0,
    };
}
/**
 * 推进多因素搜索
 *
 * @returns 更新后的状态, currentFactor 指示当前搜索的因素
 */
function advanceMultiFactorSearch(state, x, y, goal = 'maximize') {
    if (state.completed || !state.currentFactor)
        return state;
    const newState = { ...state, factors: { ...state.factors } };
    const current = newState.currentFactor; // 上面已检查 non-null
    // 推进当前因素
    newState.factors[current] = advanceGoldenSearch(state.factors[current], x, y, goal);
    // 当前因素收敛 → 切换到下一个
    if (newState.factors[current].converged) {
        newState.currentIndex++;
        if (newState.currentIndex >= newState.factorOrder.length) {
            newState.completed = true;
            newState.currentFactor = null;
        }
        else {
            newState.currentFactor = newState.factorOrder[newState.currentIndex];
        }
    }
    return newState;
}
//# sourceMappingURL=doe-golden-section.js.map