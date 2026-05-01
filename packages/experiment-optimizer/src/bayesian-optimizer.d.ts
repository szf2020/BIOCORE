export interface ExperimentPoint {
    params: Record<string, number>;
    outcome: number;
}
export interface ParameterBounds {
    name: string;
    min: number;
    max: number;
    step?: number;
}
export declare class BayesianOptimizer {
    private data;
    private bounds;
    private lengthScale;
    private beta;
    constructor(bounds: ParameterBounds[]);
    addObservation(params: Record<string, number>, outcome: number): void;
    loadHistory(points: ExperimentPoint[]): void;
    getBest(): ExperimentPoint | null;
    private kernel;
    private toVector;
    predict(params: Record<string, number>): {
        mean: number;
        variance: number;
    };
    recommend(nCandidates?: number): {
        suggestedParams: Record<string, number>;
        expectedImprovement: number;
        confidence: number;
        explorationRatio: number;
    };
    private invertMatrix;
    private matVecMul;
}
//# sourceMappingURL=bayesian-optimizer.d.ts.map