import type { DOEFactor, OrthogonalArrayMeta, OrthogonalDesign } from './doe-types';
/** 获取所有可用正交表 */
export declare function listOrthogonalArrays(): OrthogonalArrayMeta[];
/** 按名称获取正交表 */
export declare function getOrthogonalArray(name: string): OrthogonalArrayMeta | null;
/**
 * 根据因素数和水平数, 自动选择最合适的正交表
 *
 * 选表原则 (参考第4章):
 * 1. 水平数匹配 (L9/L27 用于3水平, L4/L8/L16 用于2水平)
 * 2. 列数 >= 因素数
 * 3. 试验次数尽量少
 * 4. 优先留空列用于误差估计
 */
export declare function selectOrthogonalArray(factorCount: number, levelCount: number): OrthogonalArrayMeta | null;
/**
 * 生成正交试验设计方案
 *
 * @param factors - 因素列表 (每个因素的水平数必须与正交表匹配)
 * @param arrayName - 指定使用的正交表名称 (可选, 不指定则自动选择)
 * @param columnAssignment - 手动指定因素-列分配 (可选)
 */
export declare function generateOrthogonalDesign(factors: DOEFactor[], arrayName?: string, columnAssignment?: Record<string, number>): OrthogonalDesign;
export declare const BUILTIN_ARRAYS: {
    L4: OrthogonalArrayMeta;
    L8: OrthogonalArrayMeta;
    L9: OrthogonalArrayMeta;
    L16: OrthogonalArrayMeta;
    L18: OrthogonalArrayMeta;
    L27: OrthogonalArrayMeta;
};
//# sourceMappingURL=doe-orthogonal.d.ts.map