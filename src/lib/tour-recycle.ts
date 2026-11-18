import type { CompilePort, CompileRequest, WorkerMessage } from './tour-run';

// The wasm memory of a worker never shrinks. A worker over this size is replaced after its compile.
export const RECYCLE_BYTES = 640 * 1024 * 1024;

// One file of the worker's /cache/ folder.
export type CacheEntry = { path: string; bytes: ArrayBuffer };

// cache-export asks for the /cache/ entries the last compile hit. cache-import seeds a new worker with them.
export type WorkerRequest = CompileRequest | { type: 'cache-export' } | { type: 'cache-import'; entries: CacheEntry[] };

export type WorkerReply = WorkerMessage | { type: 'cache'; entries: CacheEntry[] };

export type WorkerPort = { post(message: WorkerRequest, transfer?: Transferable[]): void; terminate(): void };

export type RecycleHost = {
  spawn(listen: (message: WorkerReply) => void): WorkerPort;
  deliver(message: WorkerMessage): void;
};

type Worker = { port: WorkerPort; compiling: number };
type Recycle = { next: Worker; ready: boolean; entries: CacheEntry[] | null };

export function recyclingCompiler(host: RecycleHost): CompilePort & { close(): void } {
  let recycle: Recycle | null = null;
  // A new worker that fails to start would fail again, so the page keeps the old worker from then on.
  let gaveUp = false;
  const retired = new Set<Worker>();

  const spawn = (): Worker => {
    const worker: Worker = { port: undefined as never, compiling: 0 };
    worker.port = host.spawn((message) => receive(worker, message));
    return worker;
  };

  const retire = (worker: Worker) => {
    if (worker.compiling) retired.add(worker);
    else worker.port.terminate();
  };

  const switchOver = () => {
    if (!recycle?.ready || !recycle.entries) return;
    const { next, entries } = recycle;
    recycle = null;
    next.port.post({ type: 'cache-import', entries }, entries.map((e) => e.bytes));
    const old = active;
    active = next;
    retire(old);
  };

  const receive = (worker: Worker, message: WorkerReply) => {
    if (worker === recycle?.next) {
      if (message.type === 'ready') {
        recycle.ready = true;
        switchOver();
      } else if (message.type === 'failed' && message.id === null) {
        worker.port.terminate();
        recycle = null;
        gaveUp = true;
      }
      return;
    }
    if (message.type === 'cache') {
      if (worker === active && recycle) {
        recycle.entries = message.entries;
        switchOver();
      }
      return;
    }
    if (worker !== active && !retired.has(worker)) return;
    if (message.type !== 'ready' && message.id !== null) worker.compiling--;
    host.deliver(message);
    if (retired.has(worker) && !worker.compiling) {
      retired.delete(worker);
      worker.port.terminate();
    }
    if (worker === active && !recycle && !gaveUp && message.type !== 'ready' && (message.memory ?? 0) > RECYCLE_BYTES) {
      recycle = { next: spawn(), ready: false, entries: null };
      active.port.post({ type: 'cache-export' });
    }
  };

  let active = spawn();

  return {
    post(request) {
      active.compiling++;
      active.port.post(request);
    },
    close() {
      for (const worker of [active, recycle?.next, ...retired]) worker?.port.terminate();
      recycle = null;
      retired.clear();
    },
  };
}
