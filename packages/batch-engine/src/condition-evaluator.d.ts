export declare const ALLOWED_FIELDS: readonly ["temperature", "pH", "DO", "OD600", "weight", "phase_elapsed_min", "total_elapsed_min"];
export type AllowedField = typeof ALLOWED_FIELDS[number];
export declare const ALLOWED_OPS: readonly [">", "<", ">=", "<=", "==", "!="];
export type ComparisonOp = typeof ALLOWED_OPS[number];
export type ComparisonNode = {
    type: 'comparison';
    field: AllowedField;
    op: ComparisonOp;
    value: number;
};
export type LogicalNode = {
    type: 'logical';
    op: '&&' | '||';
    left: ExprNode;
    right: ExprNode;
};
export type ExprNode = ComparisonNode | LogicalNode;
export interface ParseResult {
    ok: true;
    ast: ExprNode;
    usedFields: AllowedField[];
}
export interface ParseError {
    ok: false;
    error: string;
}
/**
 * 解析表达式字符串 → AST
 * 拒绝任何不在白名单的 field 或 op。
 */
export declare function parseExpression(input: string): ParseResult | ParseError;
/**
 * 求值: 给定 AST + context (PV 值), 返回 bool
 * context 缺字段的 comparison 返回 false (安全默认)
 */
export declare function evaluate(ast: ExprNode, context: Partial<Record<AllowedField, number>>): boolean;
/**
 * 一步到位: 解析 + 求值
 */
export declare function evaluateExpression(input: string, context: Partial<Record<AllowedField, number>>): {
    ok: true;
    value: boolean;
} | {
    ok: false;
    error: string;
};
//# sourceMappingURL=condition-evaluator.d.ts.map