export interface AlarmAnalysisParams {
    alarmCode: string;
    alarmTime: Date;
    paramHistory: Record<string, number[]>;
    paramNames: string[];
    normalRanges: Record<string, [number, number]>;
}
export interface AlarmAnalysisResult {
    probableCauses: {
        cause: string;
        confidence: number;
        evidence: string;
    }[];
    affectedParams: string[];
    recommendation: string;
    timelineNarrative: string;
}
export declare class RootCauseAnalyzer {
    /**
     * Analyze alarm context by examining parameter trends around
     * the alarm time and matching against known causal patterns.
     */
    analyze(params: AlarmAnalysisParams): AlarmAnalysisResult;
}
//# sourceMappingURL=root-cause.d.ts.map