export interface SoftSensorModel {
    id: string;
    name: string;
    target: string;
    input_features: string[];
    coefficients: number[];
    intercept: number;
    r_squared: number;
    training_batches: number;
    status: 'active' | 'inactive';
}
export interface PredictionResult {
    value: number;
    ciLower: number;
    ciUpper: number;
    isExtrapolating: boolean;
}
export declare class SoftSensorEngine {
    private models;
    private featureRanges;
    registerModel(model: SoftSensorModel): void;
    removeModel(id: string): void;
    listModels(): SoftSensorModel[];
    /**
     * Run inference: input features -> predicted value + confidence interval
     */
    predict(modelId: string, features: Record<string, number>): PredictionResult;
    /**
     * Train a simple linear regression from historical data using
     * ordinary least squares (OLS) via normal equation.
     */
    static trainLinearModel(target: string, features: string[], data: Record<string, number>[]): SoftSensorModel;
    /**
     * Store feature ranges for extrapolation detection.
     * Typically called after training with training data min/max.
     */
    setFeatureRanges(modelId: string, ranges: Record<string, [number, number]>): void;
}
export declare function engineerFeatures(rawData: Record<string, number>, history: Record<string, number[]>, elapsedHours: number): Record<string, number>;
export { FeedAdvisor } from './feed-advisor.js';
export { RootCauseAnalyzer } from './root-cause.js';
export { MultiReactorManager } from './multi-reactor.js';
//# sourceMappingURL=index.d.ts.map