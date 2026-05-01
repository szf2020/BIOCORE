import { Router, type Request, type Response } from 'express';
import { RingBuffer } from '@biocore/runtime-guard';

/**
 * /api/v1/events — Server-Sent Events stream (T39, Sprint 4 Track A spec §6.1).
 *
 * Why: lets enterprise IT pull notifier events (process_restart, oom_threshold,
 * plc_disconnect_5min, uncaught_exception, heap_growth_anomaly) into their own
 * SOC / log pipelines without polling.
 *
 * Replay: Last-Event-ID header lets clients resume after disconnect; we keep
 * a ring buffer (default 1000 events) so resumes within ~1000 events succeed.
 * Older events are lost (acceptable: SSE is best-effort, not guaranteed delivery).
 *
 * Max clients: default 100 to bound FD usage (each SSE keeps a live connection).
 */
export interface SseEvent {
  id: number;
  ts: string;
  type: string;
  data: unknown;
}

export class EventStream {
  private nextId = 1;
  private readonly buffer: RingBuffer<SseEvent>;
  private readonly clients = new Set<Response>();

  constructor(bufferSize: number) {
    this.buffer = new RingBuffer<SseEvent>(bufferSize);
  }

  publish(type: string, data: unknown): void {
    const ev: SseEvent = { id: this.nextId++, ts: new Date().toISOString(), type, data };
    this.buffer.push(ev);
    for (const res of this.clients) {
      try {
        res.write(`id: ${ev.id}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);
      } catch {
        // Connection broken; will be cleaned up on req.close
      }
    }
  }

  attach(res: Response, lastId: number): () => void {
    this.clients.add(res);

    // Replay events newer than lastId
    for (const ev of this.buffer.toArray()) {
      if (ev.id > lastId) {
        try {
          res.write(`id: ${ev.id}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);
        } catch {
          break;
        }
      }
    }

    return () => { this.clients.delete(res); };
  }

  clientCount(): number {
    return this.clients.size;
  }
}

/**
 * SSE bypasses the v1 response wrapper because it streams text/event-stream.
 * The v1ResponseWrapper middleware should NOT touch this route.
 */
export function createEventsSseRouter(stream: EventStream, maxClients: number): Router {
  const r = Router();

  r.get('/', (req: Request, res: Response) => {
    if (stream.clientCount() >= maxClients) {
      res.status(503).json({ error: 'sse_max_clients_reached' });
      return;
    }

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',  // disable nginx buffering
    });
    res.flushHeaders();

    const lastIdHeader = req.headers['last-event-id'];
    const lastId = typeof lastIdHeader === 'string' ? Number(lastIdHeader) || 0 : 0;
    const detach = stream.attach(res, lastId);

    const heartbeat = setInterval(() => {
      try {
        res.write(`event: heartbeat\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`);
      } catch {
        clearInterval(heartbeat);
      }
    }, 30_000);
    heartbeat.unref?.();

    req.on('close', () => {
      clearInterval(heartbeat);
      detach();
    });
  });

  return r;
}
