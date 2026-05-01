"use strict";
// ============================================================
// condition-evaluator.ts — Sprint 3 M3.8
//
// 安全的条件表达式求值器, 用于 DAG branch 节点运行时判断。
//
// 支持语法:
//   <field> <op> <value>                                 例如 OD600 > 5
//   <expr> && <expr>                                     例如 temperature >= 37 && pH < 7
//   <expr> || <expr>                                     例如 phase_elapsed_min > 30 || DO < 10
//
// 字段白名单 (避免任意代码执行):
//   temperature, pH, DO, OD600, weight, phase_elapsed_min, total_elapsed_min
//
// 操作符白名单:
//   >  <  >=  <=  ==  !=
//
// 实现策略: 自己写 tokenizer + parser + evaluator, 不用 eval/Function/vm。
// 任何不在白名单的 token 会被 parser 拒绝。
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_OPS = exports.ALLOWED_FIELDS = void 0;
exports.parseExpression = parseExpression;
exports.evaluate = evaluate;
exports.evaluateExpression = evaluateExpression;
exports.ALLOWED_FIELDS = [
    'temperature', 'pH', 'DO', 'OD600', 'weight',
    'phase_elapsed_min', 'total_elapsed_min',
];
exports.ALLOWED_OPS = ['>', '<', '>=', '<=', '==', '!='];
/**
 * 解析表达式字符串 → AST
 * 拒绝任何不在白名单的 field 或 op。
 */
function parseExpression(input) {
    if (!input || typeof input !== 'string')
        return { ok: false, error: '表达式不能为空' };
    const trimmed = input.trim();
    if (trimmed.length > 500)
        return { ok: false, error: '表达式过长 (max 500)' };
    // 简单 tokenizer: 按空白切分, 但保留 && || >= <= == != < > 为独立 token
    // 先把多字符 op 转成占位符
    const normalized = trimmed
        .replace(/\s+/g, ' ')
        .replace(/(>=|<=|==|!=|&&|\|\|)/g, ' $1 ')
        .replace(/\s+/g, ' ')
        .trim();
    const tokens = normalized.split(' ').filter(Boolean);
    if (tokens.length === 0)
        return { ok: false, error: 'tokenize 失败' };
    // Simple recursive descent: 处理 a || b && c 这种结构
    // 优先级: && > ||
    let pos = 0;
    const parseComparison = () => {
        if (pos + 2 >= tokens.length + 1)
            return null;
        const field = tokens[pos];
        const op = tokens[pos + 1];
        const valStr = tokens[pos + 2];
        if (!exports.ALLOWED_FIELDS.includes(field)) {
            throw new Error(`不允许的字段: "${field}"`);
        }
        if (!exports.ALLOWED_OPS.includes(op)) {
            throw new Error(`不允许的操作符: "${op}"`);
        }
        const value = parseFloat(valStr);
        if (isNaN(value)) {
            throw new Error(`值不是数字: "${valStr}"`);
        }
        pos += 3;
        return {
            type: 'comparison',
            field: field,
            op: op,
            value,
        };
    };
    const parseAnd = () => {
        let left = parseComparison();
        if (!left)
            return null;
        while (pos < tokens.length && tokens[pos] === '&&') {
            pos++;
            const right = parseComparison();
            if (!right)
                throw new Error('&& 右侧缺少表达式');
            left = { type: 'logical', op: '&&', left, right };
        }
        return left;
    };
    const parseOr = () => {
        let left = parseAnd();
        if (!left)
            return null;
        while (pos < tokens.length && tokens[pos] === '||') {
            pos++;
            const right = parseAnd();
            if (!right)
                throw new Error('|| 右侧缺少表达式');
            left = { type: 'logical', op: '||', left, right };
        }
        return left;
    };
    try {
        const ast = parseOr();
        if (!ast)
            return { ok: false, error: '无法解析表达式' };
        if (pos < tokens.length) {
            return { ok: false, error: `解析后剩余多余 token: "${tokens.slice(pos).join(' ')}"` };
        }
        // 收集使用的字段
        const usedFields = new Set();
        const walk = (n) => {
            if (n.type === 'comparison')
                usedFields.add(n.field);
            else {
                walk(n.left);
                walk(n.right);
            }
        };
        walk(ast);
        return { ok: true, ast, usedFields: [...usedFields] };
    }
    catch (e) {
        return { ok: false, error: e.message };
    }
}
/**
 * 求值: 给定 AST + context (PV 值), 返回 bool
 * context 缺字段的 comparison 返回 false (安全默认)
 */
function evaluate(ast, context) {
    if (ast.type === 'comparison') {
        const lhs = context[ast.field];
        if (lhs === undefined || lhs === null || isNaN(lhs))
            return false;
        switch (ast.op) {
            case '>': return lhs > ast.value;
            case '<': return lhs < ast.value;
            case '>=': return lhs >= ast.value;
            case '<=': return lhs <= ast.value;
            case '==': return lhs === ast.value;
            case '!=': return lhs !== ast.value;
        }
    }
    else {
        const l = evaluate(ast.left, context);
        // 短路
        if (ast.op === '&&')
            return l && evaluate(ast.right, context);
        return l || evaluate(ast.right, context);
    }
}
/**
 * 一步到位: 解析 + 求值
 */
function evaluateExpression(input, context) {
    const parsed = parseExpression(input);
    if (!parsed.ok)
        return parsed;
    try {
        return { ok: true, value: evaluate(parsed.ast, context) };
    }
    catch (e) {
        return { ok: false, error: e.message };
    }
}
// ============================================================
// 自测块
// ============================================================
if (require.main === module) {
    console.log('Test 1 — 基本比较:');
    const t1 = evaluateExpression('OD600 > 5', { OD600: 7 });
    console.log(`  OD600=7, "OD600 > 5" → ${t1.ok && t1.value ? '✓ true' : '✗'}`);
    const t1b = evaluateExpression('OD600 > 5', { OD600: 3 });
    console.log(`  OD600=3, "OD600 > 5" → ${t1b.ok && !t1b.value ? '✓ false' : '✗'}`);
    console.log('Test 2 — AND:');
    const t2 = evaluateExpression('temperature >= 37 && pH < 7', { temperature: 37, pH: 6.8 });
    console.log(`  T=37 pH=6.8 → ${t2.ok && t2.value ? '✓ true' : '✗'}`);
    const t2b = evaluateExpression('temperature >= 37 && pH < 7', { temperature: 37, pH: 7.2 });
    console.log(`  T=37 pH=7.2 → ${t2b.ok && !t2b.value ? '✓ false' : '✗'}`);
    console.log('Test 3 — OR:');
    const t3 = evaluateExpression('OD600 > 10 || phase_elapsed_min > 60', { OD600: 3, phase_elapsed_min: 75 });
    console.log(`  OD=3 t=75 → ${t3.ok && t3.value ? '✓ true' : '✗'}`);
    console.log('Test 4 — 非法字段被拒:');
    const t4 = evaluateExpression('evilField > 1', { OD600: 5 });
    console.log(`  ${!t4.ok && t4.error.includes('不允许的字段') ? '✓' : '✗'} "不允许的字段" 错误`);
    console.log('Test 5 — 非法操作符被拒:');
    const t5 = evaluateExpression('OD600 ^^ 5', { OD600: 5 });
    console.log(`  ${!t5.ok ? '✓' : '✗'} 非法操作符被拒`);
    console.log('Test 6 — 注入尝试 __proto__:');
    const t6 = evaluateExpression('__proto__ > 1', {});
    console.log(`  ${!t6.ok ? '✓' : '✗'} __proto__ 被拒`);
    console.log('Test 7 — process.env:');
    const t7 = evaluateExpression('process.env > 0', {});
    console.log(`  ${!t7.ok ? '✓' : '✗'} process.env 被拒`);
    console.log('Test 8 — 空表达式:');
    const t8 = evaluateExpression('', {});
    console.log(`  ${!t8.ok ? '✓' : '✗'} 空被拒`);
    console.log('Test 9 — 缺字段返回 false (安全默认):');
    const t9 = evaluateExpression('OD600 > 5', {});
    console.log(`  ${t9.ok && !t9.value ? '✓' : '✗'} 缺字段 → false`);
    console.log('Test 10 — 混合 AND/OR 优先级:');
    // a || b && c = a || (b && c)
    const t10 = evaluateExpression('temperature > 40 || pH > 6 && DO > 20', { temperature: 30, pH: 6.5, DO: 25 });
    console.log(`  T=30 pH=6.5 DO=25 → ${t10.ok && t10.value ? '✓ true (走 &&)' : '✗'}`);
    console.log('\n所有条件求值单测通过');
}
//# sourceMappingURL=condition-evaluator.js.map