import type { PLCVariableMapping } from './types';
import type { ParsedAddress } from './types';
export declare function parseAddr(addr: string): ParsedAddress;
export interface AddressValidation {
    valid: boolean;
    error?: string;
}
export declare function validateAddr(addr: string, dataType?: string): AddressValidation;
export declare function byteLen(dt: string): number;
export declare function decode(buf: Buffer, dt: string, bit?: number): number;
export declare function encode(val: number, dt: string): Buffer;
export declare function scale(raw: number, v: Pick<PLCVariableMapping, 'raw_min' | 'raw_max' | 'eng_min' | 'eng_max'>): number;
export declare function unscale(eng: number, v: Pick<PLCVariableMapping, 'raw_min' | 'raw_max' | 'eng_min' | 'eng_max'>): number;
export interface AddressGroup {
    db?: number;
    startByte: number;
    length: number;
    vars: PLCVariableMapping[];
}
export declare function groupByRegion(vars: PLCVariableMapping[]): AddressGroup[];
//# sourceMappingURL=utils.d.ts.map