import type { PLCConnectionConfig, PLCVariableMapping } from './types';
export declare class VariableMappingManager {
    private db;
    constructor(db: any);
    private initTable;
    private migrate;
    getConnections(): PLCConnectionConfig[];
    upsertConnection(c: PLCConnectionConfig): void;
    deleteConnection(id: string): void;
    getVariables(connId?: string): PLCVariableMapping[];
    upsertVariable(v: PLCVariableMapping): void;
    deleteVariable(id: string): void;
    exportToJSON(): {
        connections: PLCConnectionConfig[];
        variables: PLCVariableMapping[];
    };
    exportToCSV(): string;
    importFromJSON(data: {
        connections?: any[];
        variables?: any[];
    }): {
        imported: number;
        errors: string[];
    };
}
//# sourceMappingURL=variable-mapping.d.ts.map