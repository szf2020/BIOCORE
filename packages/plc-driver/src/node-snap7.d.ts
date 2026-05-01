declare module 'node-snap7' {
  export class S7Client {
    ConnectTo(ip: string, rack: number, slot: number, callback: (err: any) => void): void;
    Disconnect(): void;
    Connected(): boolean;
    DBRead(dbNumber: number, start: number, size: number, callback: (err: any, data: Buffer) => void): void;
    DBWrite(dbNumber: number, start: number, size: number, buffer: Buffer, callback: (err: any) => void): void;
    ReadArea(area: number, dbNumber: number, start: number, amount: number, wordLen: number, callback: (err: any, data: Buffer) => void): void;
    WriteArea(area: number, dbNumber: number, start: number, amount: number, wordLen: number, buffer: Buffer, callback: (err: any) => void): void;
    SetConnectionType(type: number): void;
    static S7AreaDB: number;
    static S7WLByte: number;
    [key: string]: any;
  }
}
