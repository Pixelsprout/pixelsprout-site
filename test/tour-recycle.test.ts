import { describe, expect, it } from 'vitest';
import { recyclingCompiler, CACHE_IMPORT_LIMIT, RECYCLE_BYTES, type CacheEntry, type WorkerPort, type WorkerReply, type WorkerRequest } from '../src/lib/tour-recycle';

const MiB = 1024 * 1024;

type FakeWorker = WorkerPort & {
  requests: WorkerRequest[];
  transfers: Transferable[][];
  terminated: boolean;
  reply(message: WorkerReply): void;
};

function setup() {
  const workers: FakeWorker[] = [];
  const delivered: WorkerReply[] = [];
  const compiler = recyclingCompiler({
    spawn(listen) {
      const worker: FakeWorker = {
        requests: [],
        transfers: [],
        terminated: false,
        post: (message, transfer = []) => {
          worker.requests.push(message);
          worker.transfers.push(transfer);
        },
        terminate: () => void (worker.terminated = true),
        reply: (message) => listen(message),
      };
      workers.push(worker);
      return worker;
    },
    deliver: (message) => void delivered.push(message),
  });
  let nextId = 1;
  const compile = (source = 'app [stub]') => {
    const id = nextId++;
    compiler.post({ type: 'compile', id, source });
    return id;
  };
  const compiled = (worker: FakeWorker, id: number, memory: number) =>
    worker.reply({ type: 'compiled', id, image: new ArrayBuffer(1), identity: null as never, reports: '', stats: {}, memory });
  const compiles = (worker: FakeWorker) => worker.requests.filter((r) => r.type === 'compile').map((r) => (r as { id: number }).id);
  return { workers, delivered, compile, compiled, compiles };
}

const entry = (path: string, bytes: number[]): CacheEntry => ({ path, bytes: new Uint8Array(bytes).buffer });
// Only byteLength is read before the transfer, so a large entry needs no real buffer.
const sized = (path: string, byteLength: number): CacheEntry => ({ path, bytes: { byteLength } as ArrayBuffer });

function recycleWith(entries: CacheEntry[]) {
  const t = setup();
  const [old] = t.workers;
  t.compiled(old, t.compile(), RECYCLE_BYTES + 1);
  const fresh = t.workers[1];
  fresh.reply({ type: 'ready' });
  old.reply({ type: 'cache', entries });
  return { t, old, fresh };
}

describe('recyclingCompiler', () => {
  it('compiles on one worker and delivers its replies while the memory stays at the limit', () => {
    const t = setup();
    const id = t.compile();
    expect(t.workers).toHaveLength(1);
    const [worker] = t.workers;
    expect(worker.requests).toEqual([{ type: 'compile', id, source: 'app [stub]' }]);
    worker.reply({ type: 'ready' });
    t.compiled(worker, id, RECYCLE_BYTES);
    expect(t.delivered.map((m) => m.type)).toEqual(['ready', 'compiled']);
    expect(t.workers).toHaveLength(1);
    expect(RECYCLE_BYTES).toBe(640 * MiB);
  });

  it('replaces a worker over the limit with a new one that takes the live cache, and the reader never waits', () => {
    const t = setup();
    const first = t.compile();
    const [old] = t.workers;
    t.compiled(old, first, RECYCLE_BYTES + 1);
    expect(t.workers).toHaveLength(2);
    const fresh = t.workers[1];
    expect(old.requests.at(-1)).toEqual({ type: 'cache-export' });

    const during = t.compile();
    expect(t.compiles(old)).toEqual([first, during]);
    t.compiled(old, during, 700 * MiB);
    expect(t.workers).toHaveLength(2);

    fresh.reply({ type: 'ready' });
    const entries = [entry('/cache/a', [1]), entry('/cache/b', [2, 3])];
    old.reply({ type: 'cache', entries });
    expect(fresh.requests).toEqual([{ type: 'cache-import', entries }]);
    expect(fresh.transfers[0]).toEqual(entries.map((e) => e.bytes));
    expect(old.terminated).toBe(true);

    const after = t.compile();
    expect(t.compiles(fresh)).toEqual([after]);
    t.compiled(fresh, after, 100 * MiB);
    expect(t.delivered.filter((m) => m.type === 'compiled').map((m) => (m as { id: number }).id)).toEqual([first, during, after]);
    expect(t.delivered.map((m) => m.type)).not.toContain('ready');
  });

  it('delivers the reply of a compile the old worker started before the switch, then terminates it', () => {
    const t = setup();
    const [old] = t.workers;
    t.compiled(old, t.compile(), RECYCLE_BYTES + 1);
    const fresh = t.workers[1];
    old.reply({ type: 'cache', entries: [] });
    const during = t.compile();
    fresh.reply({ type: 'ready' });
    expect(old.terminated).toBe(false);

    t.compiled(old, during, 700 * MiB);
    expect(t.delivered.at(-1)).toMatchObject({ type: 'compiled', id: during });
    expect(old.terminated).toBe(true);
    expect(t.workers).toHaveLength(2);
    expect(t.compiles(fresh)).toEqual([]);
  });

  it('keeps the old worker when the new one does not start, and tries no more recycles', () => {
    const t = setup();
    const [old] = t.workers;
    t.compiled(old, t.compile(), RECYCLE_BYTES + 1);
    const fresh = t.workers[1];
    fresh.reply({ type: 'failed', id: null, kind: 'internal', reports: 'Error: compile-worker.wasm: HTTP 404' });
    expect(fresh.terminated).toBe(true);
    expect(t.delivered.map((m) => m.type)).toEqual(['compiled']);

    old.reply({ type: 'cache', entries: [entry('/cache/a', [1])] });
    const next = t.compile();
    expect(t.compiles(old).at(-1)).toBe(next);
    t.compiled(old, next, RECYCLE_BYTES + 1);
    expect(t.workers).toHaveLength(2);
    expect(old.terminated).toBe(false);
  });

  it('seeds the new worker with a live cache of exactly the import limit', () => {
    const entries = [sized('/cache/a', CACHE_IMPORT_LIMIT / 2), sized('/cache/b', CACHE_IMPORT_LIMIT / 2)];
    const { fresh } = recycleWith(entries);
    expect(fresh.requests).toEqual([{ type: 'cache-import', entries }]);
    expect(CACHE_IMPORT_LIMIT).toBe(64 * MiB);
  });

  it('starts the new worker cold when the live cache is over the import limit', () => {
    const { t, old, fresh } = recycleWith([sized('/cache/a', CACHE_IMPORT_LIMIT / 2), sized('/cache/b', CACHE_IMPORT_LIMIT / 2 + 1)]);
    expect(fresh.requests).toEqual([]);
    expect(old.terminated).toBe(true);
    const next = t.compile();
    expect(t.compiles(fresh)).toEqual([next]);
  });
});
