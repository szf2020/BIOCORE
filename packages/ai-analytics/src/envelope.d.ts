export declare function buildEnvelope(batches: number[][]): {
    mean: number[];
    upper: number[];
    lower: number[];
};
export declare function checkEnvelope(current: number[], envelope: {
    mean: number[];
    upper: number[];
    lower: number[];
}): {
    inBand: boolean;
    deviations: number[];
};
//# sourceMappingURL=envelope.d.ts.map