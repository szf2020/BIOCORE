const compileCache = new Map<string, (v: any) => any>();
const IDENTITY = (v: any) => v;

export function compileTransform(expr: string): (v: any) => any {
  if (!expr) return IDENTITY;
  const cached = compileCache.get(expr);
  if (cached) return cached;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('v', `return (${expr});`) as (v: any) => any;
    compileCache.set(expr, fn);
    return fn;
  } catch (e) {
    console.warn('[widget] transform compile failed:', expr, e);
    compileCache.set(expr, IDENTITY);
    return IDENTITY;
  }
}

export function _resetCompileCache(): void {
  compileCache.clear();
}
