// ============================================================
// formula-evaluator.ts — 安全数学表达式求值器
//
// 不使用 eval/Function, 用递归下降解析 + AST 求值
// 支持: +, -, *, /, pow(), log(), ln(), exp(), sqrt(), abs(), min(), max()
// 变量: rpm, airflow, DO, temperature, pH, pressure, weight, kLa, OUR 等
// ============================================================

type ASTNode =
  | { type: 'number'; value: number }
  | { type: 'variable'; name: string }
  | { type: 'binary'; op: '+' | '-' | '*' | '/'; left: ASTNode; right: ASTNode }
  | { type: 'unary'; op: '-'; operand: ASTNode }
  | { type: 'call'; name: string; args: ASTNode[] };

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  pow: (a, b) => Math.pow(a, b),
  sqrt: (a) => Math.sqrt(a),
  abs: (a) => Math.abs(a),
  log: (a) => Math.log10(a),
  log10: (a) => Math.log10(a),
  ln: (a) => Math.log(a),
  exp: (a) => Math.exp(a),
  min: (...args) => Math.min(...args),
  max: (...args) => Math.max(...args),
  floor: (a) => Math.floor(a),
  ceil: (a) => Math.ceil(a),
  round: (a) => Math.round(a),
};

// ─── 词法分析 ─────────────────────────────────────────────

type Token =
  | { type: 'number'; value: number }
  | { type: 'ident'; name: string }
  | { type: 'op'; op: string }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' };

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < expr.length && /[0-9.eE\-+]/.test(expr[i])) {
        // 避免将减号误解为数字的一部分 (e.g., "2-3")
        if ((expr[i] === '-' || expr[i] === '+') && num.length > 0 && !/[eE]/.test(num[num.length - 1])) break;
        num += expr[i++];
      }
      tokens.push({ type: 'number', value: parseFloat(num) });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let name = '';
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) name += expr[i++];
      tokens.push({ type: 'ident', name });
      continue;
    }
    if ('+-*/^'.includes(ch)) { tokens.push({ type: 'op', op: ch }); i++; continue; }
    if (ch === '(') { tokens.push({ type: 'lparen' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen' }); i++; continue; }
    if (ch === ',') { tokens.push({ type: 'comma' }); i++; continue; }
    throw new Error(`公式语法错误: 未知字符 '${ch}' (位置 ${i})`);
  }
  return tokens;
}

// ─── 语法分析 (递归下降) ──────────────────────────────────

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) { this.tokens = tokens; }

  private peek(): Token | null { return this.pos < this.tokens.length ? this.tokens[this.pos] : null; }
  private advance(): Token { return this.tokens[this.pos++]; }
  private expect(type: string): Token {
    const t = this.advance();
    if (!t || t.type !== type) throw new Error(`公式语法错误: 期望 ${type}, 得到 ${t?.type || 'EOF'}`);
    return t;
  }

  parse(): ASTNode {
    const node = this.parseAddSub();
    if (this.pos < this.tokens.length) throw new Error(`公式语法错误: 意外的 token '${JSON.stringify(this.tokens[this.pos])}'`);
    return node;
  }

  // 加减
  private parseAddSub(): ASTNode {
    let left = this.parseMulDiv();
    while (this.peek()?.type === 'op' && (this.peek() as any).op === '+' || this.peek()?.type === 'op' && (this.peek() as any).op === '-') {
      const op = (this.advance() as any).op as '+' | '-';
      left = { type: 'binary', op, left, right: this.parseMulDiv() };
    }
    return left;
  }

  // 乘除
  private parseMulDiv(): ASTNode {
    let left = this.parsePower();
    while (this.peek()?.type === 'op' && ('*/'.includes((this.peek() as any).op))) {
      const op = (this.advance() as any).op as '*' | '/';
      left = { type: 'binary', op, left, right: this.parsePower() };
    }
    return left;
  }

  // 幂运算 (^)
  private parsePower(): ASTNode {
    let left = this.parseUnary();
    while (this.peek()?.type === 'op' && (this.peek() as any).op === '^') {
      this.advance();
      left = { type: 'call', name: 'pow', args: [left, this.parseUnary()] };
    }
    return left;
  }

  // 一元负号
  private parseUnary(): ASTNode {
    if (this.peek()?.type === 'op' && (this.peek() as any).op === '-') {
      this.advance();
      return { type: 'unary', op: '-', operand: this.parsePrimary() };
    }
    return this.parsePrimary();
  }

  // 基本单元: 数字, 变量, 函数调用, 括号
  private parsePrimary(): ASTNode {
    const t = this.peek();
    if (!t) throw new Error('公式语法错误: 意外结束');

    // 数字
    if (t.type === 'number') {
      this.advance();
      return { type: 'number', value: t.value };
    }

    // 标识符 (变量或函数)
    if (t.type === 'ident') {
      this.advance();
      // 函数调用
      if (this.peek()?.type === 'lparen') {
        this.advance(); // (
        const args: ASTNode[] = [];
        if (this.peek()?.type !== 'rparen') {
          args.push(this.parseAddSub());
          while (this.peek()?.type === 'comma') {
            this.advance();
            args.push(this.parseAddSub());
          }
        }
        this.expect('rparen');
        if (!FUNCTIONS[t.name]) throw new Error(`公式错误: 未知函数 '${t.name}', 可用: ${Object.keys(FUNCTIONS).join(', ')}`);
        return { type: 'call', name: t.name, args };
      }
      // 变量
      return { type: 'variable', name: t.name };
    }

    // 括号
    if (t.type === 'lparen') {
      this.advance();
      const node = this.parseAddSub();
      this.expect('rparen');
      return node;
    }

    throw new Error(`公式语法错误: 意外的 '${JSON.stringify(t)}'`);
  }
}

// ─── AST 求值 ─────────────────────────────────────────────

function evaluate(node: ASTNode, vars: Record<string, number>): number {
  switch (node.type) {
    case 'number': return node.value;
    case 'variable': {
      if (!(node.name in vars)) throw new Error(`公式变量 '${node.name}' 未定义, 可用: ${Object.keys(vars).join(', ')}`);
      return vars[node.name];
    }
    case 'binary': {
      const l = evaluate(node.left, vars);
      const r = evaluate(node.right, vars);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return r !== 0 ? l / r : 0;
      }
      return 0; // unreachable
    }
    case 'unary': return -evaluate(node.operand, vars);
    case 'call': {
      const fn = FUNCTIONS[node.name];
      if (!fn) throw new Error(`未知函数: ${node.name}`);
      const args = node.args.map(a => evaluate(a, vars));
      return fn(...args);
    }
  }
}

// ─── 公开 API ─────────────────────────────────────────────

/**
 * 验证表达式语法 (不求值)
 * @returns null 表示合法, 否则返回错误信息
 */
export function validateExpression(expr: string, availableVars?: string[]): string | null {
  try {
    const tokens = tokenize(expr);
    const parser = new Parser(tokens);
    const ast = parser.parse();
    // 检查变量是否都在可用列表中
    if (availableVars) {
      const used = collectVariables(ast);
      const unknown = used.filter(v => !availableVars.includes(v));
      if (unknown.length > 0) return `未知变量: ${unknown.join(', ')}`;
    }
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/**
 * 求值表达式
 */
export function evaluateExpression(expr: string, vars: Record<string, number>): number {
  const tokens = tokenize(expr);
  const parser = new Parser(tokens);
  const ast = parser.parse();
  return evaluate(ast, vars);
}

/**
 * 收集表达式中使用的变量名
 */
export function collectVariables(node: ASTNode): string[] {
  const vars = new Set<string>();
  function walk(n: ASTNode) {
    if (n.type === 'variable') vars.add(n.name);
    if (n.type === 'binary') { walk(n.left); walk(n.right); }
    if (n.type === 'unary') walk(n.operand);
    if (n.type === 'call') n.args.forEach(walk);
  }
  walk(node);
  return [...vars];
}

/** 可用过程变量列表 */
export const AVAILABLE_VARS = [
  'rpm', 'airflow', 'DO', 'temperature', 'pH', 'pressure', 'weight',
  'feed_P01', 'feed_P02', 'feed_P04',
  'kLa', 'OUR', 'Vs', 'PV', 'mu',
  'cumFeed', 'cumBase', 'cumAcid', 'Vliquid',
];
