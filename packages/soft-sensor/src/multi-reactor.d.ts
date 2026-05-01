export interface ReactorConfig {
    id: string;
    name: string;
    plcConfig: Record<string, unknown>;
    status: 'online' | 'offline' | 'error' | 'initializing';
}
export declare class MultiReactorManager {
    private reactors;
    private static readonly MAX_REACTORS;
    addReactor(id: string, name: string, plcConfig: Record<string, unknown>): void;
    removeReactor(id: string): void;
    listReactors(): {
        id: string;
        name: string;
        status: string;
    }[];
    getReactor(id: string): ReactorConfig;
    setStatus(id: string, status: ReactorConfig['status']): void;
    getReactorCount(): number;
}
//# sourceMappingURL=multi-reactor.d.ts.map