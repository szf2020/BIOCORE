// Public API surface for @biocore/runtime-guard.
// Modules added in subsequent tasks (T16-T22): handles-inspector,
// event-loop-monitor, diagnostic-dump, crash-handler, memory-watchdog,
// metrics-collector.
export { RingBuffer } from './ring-buffer';
export { inspectHandles, type HandlesReport } from './handles-inspector';
export { EventLoopMonitor, type EventLoopSnapshot } from './event-loop-monitor';
export { writeDiagnosticDump, listDiagnosticDumps, readDiagnosticDump, type Dump, type DumpOptions } from './diagnostic-dump';
