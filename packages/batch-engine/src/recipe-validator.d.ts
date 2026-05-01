import type { Recipe } from '@biocore/types';
export interface ValidationIssue {
    code: string;
    severity: 'error' | 'warning';
    message: string;
}
export interface ValidationResult {
    valid: boolean;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
}
export declare function validateRecipe(recipe: Recipe): ValidationResult;
interface DagNode {
    id: string;
    type: string;
}
interface DagEdge {
    id: string;
    from: string;
    to: string;
    label?: string;
}
interface DagShape {
    nodes: DagNode[];
    edges: DagEdge[];
}
export declare function validateDag(dag: DagShape): ValidationIssue[];
export {};
//# sourceMappingURL=recipe-validator.d.ts.map