export declare class CUSUMDetector {
    private channel;
    private mean;
    private std;
    private h;
    private k;
    private cumPos;
    private cumNeg;
    private configured;
    constructor(channel?: string);
    setBaseline(mean: number, std: number, h?: number, k?: number): void;
    detect(value: number): {
        anomaly: boolean;
        cumPos: number;
        cumNeg: number;
        normalized: number;
    };
    reset(): void;
    isConfigured(): boolean;
    getChannel(): string;
}
//# sourceMappingURL=cusum.d.ts.map