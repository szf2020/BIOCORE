type ASTNode = {
    type: 'number';
    value: number;
} | {
    type: 'variable';
    name: string;
} | {
    type: 'binary';
    op: '+' | '-' | '*' | '/';
    left: ASTNode;
    right: ASTNode;
} | {
    type: 'unary';
    op: '-';
    operand: ASTNode;
} | {
    type: 'call';
    name: string;
    args: ASTNode[];
};
/**
 * 验证表达式语法 (不求值)
 * @returns null 表示合法, 否则返回错误信息
 */
export declare function validateExpression(expr: string, availableVars?: string[]): string | null;
/**
 * 求值表达式
 */
export declare function evaluateExpression(expr: string, vars: Record<string, number>): number;
/**
 * 收集表达式中使用的变量名
 */
export declare function collectVariables(node: ASTNode): string[];
/** 可用过程变量列表 */
export declare const AVAILABLE_VARS: string[];
export {};
//# sourceMappingURL=formula-evaluator.d.ts.map