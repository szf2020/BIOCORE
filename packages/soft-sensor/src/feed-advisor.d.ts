export interface FeedRecommendation {
    suggestedRate: number;
    reason: string;
    confidence: number;
    action: 'increase' | 'decrease' | 'maintain';
}
export interface FeedAdvisorParams {
    currentOD: number;
    currentGlucose: number;
    targetMu: number;
    muMax: number;
    Ks: number;
    Yxs: number;
    currentFeedRate: number;
    feedConcentration: number;
    liquidVolume: number;
}
export declare class FeedAdvisor {
    /**
     * Calculate recommended feed rate based on:
     * - Current biomass (from soft sensor OD prediction)
     * - Target specific growth rate (μ_set)
     * - Substrate concentration (from soft sensor glucose prediction)
     * - Monod kinetics parameters (μ_max, Ks, Yxs)
     *
     * Monod equation: μ = μ_max * S / (Ks + S)
     * Feed rate for exponential feeding: F = (μ_set * X * V) / (Yxs * Sf)
     *   where X = biomass (OD600 proxy), V = volume, Sf = feed concentration
     */
    recommend(params: FeedAdvisorParams): FeedRecommendation;
}
//# sourceMappingURL=feed-advisor.d.ts.map