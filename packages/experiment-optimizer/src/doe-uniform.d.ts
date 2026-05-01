import type { UniformTableMeta, UniformDesign } from './doe-types';
/** 获取所有可用均匀表 */
export declare function listUniformTables(): UniformTableMeta[];
/** 按名称获取均匀表 */
export declare function getUniformTable(name: string): UniformTableMeta | null;
/** 自动选择合适的均匀表 */
export declare function selectUniformTable(factorCount: number, minRuns?: number): UniformTableMeta | null;
/**
 * 生成均匀试验设计方案
 *
 * 均匀表中的水平编号映射到因素的实际值:
 *   实际值 = min + (编号 - 0.5) / n × (max - min)
 * 其中 n 为水平数 (= 试验次数)
 *
 * @param factors - 因素定义 (levels 字段会被忽略, 用 min/max 连续映射)
 * @param tableName - 指定均匀表 (可选)
 */
export declare function generateUniformDesign(factors: {
    name: string;
    min: number;
    max: number;
    unit?: string;
}[], tableName?: string): UniformDesign;
/**
 * 自定义 GLP 均匀表生成
 *
 * 当内置表不满足需求时, 用 Good Lattice Point 法
 * 根据指定的试验次数和因素数生成均匀表.
 *
 * @param n - 试验次数 (最好为素数)
 * @param factorCount - 因素数
 */
export declare function generateCustomUniformTable(n: number, factorCount: number): UniformTableMeta;
export declare const BUILTIN_TABLES: {
    U5: UniformTableMeta;
    U7: UniformTableMeta;
    U8: UniformTableMeta;
    U9: UniformTableMeta;
    U11: UniformTableMeta;
    U12: UniformTableMeta;
    U13: UniformTableMeta;
};
//# sourceMappingURL=doe-uniform.d.ts.map