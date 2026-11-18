import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recyclingCompiler, RECYCLE_BYTES, type WorkerReply, type WorkerRequest } from '../src/lib/tour-recycle';
import { AUTO_RUN_MS, runController, type CompileRequest, type Identity, type PreviewPort, type RunEvent, type WorkerMessage } from '../src/lib/tour-run';

const identity: Identity = {
  digests: ['a', 'b', 'c', 'd', 'e', 'f'],
  init: '1',
  loaded: '2',
  launch: '3',
  erasedCallables: 0,
  buildId: 'v0.14.1-50-g1337f3d',
};

type FakePreview = PreviewPort & {
  source: object;
  posts: { message: unknown; transfer: Transferable[] }[];
  shown: boolean;
  removed: boolean;
  focused: boolean;
};

function fakePreview(): FakePreview {
  const preview: FakePreview = {
    source: {},
    posts: [],
    shown: false,
    removed: false,
    focused: false,
    post: (message, transfer) => void preview.posts.push({ message, transfer }),
    show: () => void (preview.shown = true),
    remove: () => void (preview.removed = true),
    focus: () => void (preview.focused = true),
  };
  return preview;
}

function setup({ webgpu = true } = {}) {
  const requests: CompileRequest[] = [];
  const previews: FakePreview[] = [];
  const events: RunEvent[] = [];
  const controller = runController({
    compiler: { post: (message) => void requests.push(message) },
    createPreview: webgpu
      ? () => {
          const preview = fakePreview();
          previews.push(preview);
          return preview;
        }
      : null,
    emit: (event) => void events.push(event),
  });
  const image = (bytes: number[]) => new Uint8Array(bytes).buffer;
  const worker = (message: WorkerMessage) => controller.fromWorker(message);
  const compiled = (bytes: number[] = [1, 2, 3], id = requests.at(-1)!.id) =>
    worker({ type: 'compiled', id, image: image(bytes), identity, reports: '', stats: {} });
  const failed = (reports: string, id = requests.at(-1)!.id) => worker({ type: 'failed', id, kind: 'compile', reports, stats: {} });
  const from = (preview: FakePreview, data: unknown) => controller.fromWindow(preview.source, data);
  const imagesSent = (preview: FakePreview) => preview.posts.filter((p) => (p.message as { type: string }).type === 'tour:image');
  // A Preview that runs the starting source.
  const running = () => {
    controller.start('app [stub]');
    const preview = previews.at(-1)!;
    from(preview, { type: 'tour:waiting' });
    compiled();
    from(preview, { type: 'rocco:ready' });
    return preview;
  };
  // The Console as the page shows it: a count above 1 updates the last line.
  const consoleLines = () => {
    const lines: { kind: string; text: string; count: number }[] = [];
    for (const event of events) {
      if (event.type === 'console-cleared') lines.length = 0;
      if (event.type !== 'console') continue;
      if (event.count > 1) lines.at(-1)!.count = event.count;
      else lines.push({ kind: event.kind, text: event.text, count: 1 });
    }
    return lines;
  };
  return { controller, requests, previews, events, compiled, failed, from, imagesSent, worker, running, consoleLines };
}

const twoErrors = readFileSync(new URL('fixtures/tour-reports/two-errors.txt', import.meta.url), 'utf8');

const bytesOf = (post: { message: unknown }) => [...new Uint8Array((post.message as { image: ArrayBuffer }).image)];

describe('runController', () => {
  it('runs the starting source on step load and sends its image after tour:waiting', () => {
    const t = setup();
    t.controller.start('app [stub]');
    expect(t.requests).toEqual([{ type: 'compile', id: expect.any(Number), source: 'app [stub]' }]);
    expect(t.previews).toHaveLength(1);
    const [preview] = t.previews;

    t.compiled([1, 2, 3]);
    expect(preview.posts).toEqual([]);

    t.from(preview, { type: 'tour:waiting' });
    const [sent, ...more] = t.imagesSent(preview);
    expect(more).toEqual([]);
    expect(sent.message).toMatchObject({ type: 'tour:image', identity });
    expect(bytesOf(sent)).toEqual([1, 2, 3]);
    expect(sent.transfer).toEqual([(sent.message as { image: ArrayBuffer }).image]);
  });

  it('sends the image as soon as it compiles when the Preview is already waiting', () => {
    const t = setup();
    t.controller.start('app [stub]');
    const [preview] = t.previews;
    t.from(preview, { type: 'tour:waiting' });
    expect(preview.posts).toEqual([]);
    t.compiled([7]);
    expect(t.imagesSent(preview).map(bytesOf)).toEqual([[7]]);
  });

  it('shows the starting game on its first frame without moving focus', () => {
    const t = setup();
    t.controller.start('app [stub]');
    const [preview] = t.previews;
    t.from(preview, { type: 'tour:waiting' });
    t.compiled();
    expect(preview.shown).toBe(false);
    t.from(preview, { type: 'rocco:ready' });
    expect(preview.shown).toBe(true);
    expect(preview.focused).toBe(false);
    expect(t.events).toContainEqual({ type: 'preview', state: 'running' });
  });

  it('runs a refused edit in a new Preview that replaces the old one on its first frame and takes focus', () => {
    const t = setup();
    t.controller.start('app [stub]');
    const [first] = t.previews;
    t.from(first, { type: 'tour:waiting' });
    t.compiled([1]);
    t.from(first, { type: 'rocco:ready' });

    t.controller.run('app [edited]', { focus: true });
    expect(t.requests.at(-1)!.source).toBe('app [edited]');
    t.compiled([2]);
    t.from(first, { type: 'tour:need-iframe', reason: 'init' });
    expect(t.previews).toHaveLength(2);
    const second = t.previews[1];
    t.from(second, { type: 'tour:waiting' });
    expect(t.imagesSent(second).map(bytesOf)).toEqual([[2]]);
    expect(first.removed).toBe(false);

    t.from(second, { type: 'rocco:ready' });
    expect(first.removed).toBe(true);
    expect(second.shown).toBe(true);
    expect(second.focused).toBe(true);
  });

  it('publishes the problems of a failed compile and keeps the last good run playing', () => {
    const t = setup();
    t.controller.start('app [stub]');
    const [first] = t.previews;
    t.from(first, { type: 'tour:waiting' });
    t.compiled();
    t.from(first, { type: 'rocco:ready' });
    expect(t.events).toContainEqual({ type: 'problems', problems: [], internal: null });

    t.controller.run('app [broken]', { focus: true });
    t.failed(twoErrors);
    const problems = t.events.filter((e) => e.type === 'problems').at(-1);
    expect(problems).toMatchObject({ internal: null, problems: [{ title: 'does not exist', line: 34 }, { title: 'type mismatch', line: 29 }] });
    expect(t.previews).toHaveLength(1);
    expect(first.removed).toBe(false);
    expect(t.events.at(-1)).toEqual({ type: 'preview', state: 'last-good' });
  });

  it('shows an internal failure of the compile worker as an internal problem', () => {
    const t = setup();
    t.controller.start('app [stub]');
    t.worker({ type: 'failed', id: t.requests[0].id, kind: 'internal', reports: 'compile-worker: NotSpecialized', stats: {} });
    expect(t.events).toContainEqual({ type: 'problems', problems: [], internal: 'compile-worker: NotSpecialized' });
    t.worker({ type: 'failed', id: null, kind: 'internal', reports: 'Error: compile-worker.wasm: HTTP 404' });
    expect(t.events).toContainEqual({ type: 'problems', problems: [], internal: 'Error: compile-worker.wasm: HTTP 404' });
  });

  it('compiles one source at a time, and only the newest of the edits that wait', () => {
    const t = setup();
    t.controller.start('app [stub]');
    t.controller.run('app [one]', { focus: true });
    t.controller.run('app [two]', { focus: true });
    expect(t.requests.map((r) => r.source)).toEqual(['app [stub]']);

    t.compiled([1], t.requests[0].id);
    expect(t.requests.map((r) => r.source)).toEqual(['app [stub]', 'app [two]']);
    t.compiled([2]);
    const [preview] = t.previews;
    t.from(preview, { type: 'tour:waiting' });
    expect(t.imagesSent(preview).map(bytesOf)).toEqual([[2]]);
  });

  it('forwards the messages of the newest Preview and ignores every other window', () => {
    const t = setup();
    t.controller.start('app [stub]');
    const [first] = t.previews;
    t.from(first, { type: 'tour:waiting' });
    t.compiled([1]);
    t.from(first, { type: 'rocco:ready' });
    t.from(first, { type: 'tour:dbg', text: '"tick"' });
    expect(t.consoleLines()).toEqual([{ kind: 'dbg', text: '"tick"', count: 1 }]);

    t.controller.run('app [edited]', { focus: true });
    t.compiled([2]);
    t.from(first, { type: 'tour:need-iframe', reason: 'init' });
    const second = t.previews[1];
    const before = t.events.length;
    t.controller.fromWindow({}, { type: 'tour:waiting' });
    t.from(first, { type: 'tour:crash', message: 'boom' });
    t.from(first, { type: 'tour:waiting' });
    t.from(first, { type: 'rocco:ready' });
    expect(t.events.length).toBe(before);
    expect(t.imagesSent(second)).toEqual([]);
    expect(t.imagesSent(first)).toHaveLength(2);
    expect(second.shown).toBe(false);

    t.from(second, { type: 'tour:waiting' });
    t.from(second, { type: 'tour:crash', message: 'boom' });
    expect(t.consoleLines().at(-1)).toEqual({ kind: 'crash', text: 'boom', count: 1 });
  });

  it('makes no Preview without WebGPU, and Run still publishes problems', () => {
    const t = setup({ webgpu: false });
    t.controller.start('app [stub]');
    expect(t.events).toContainEqual({ type: 'preview', state: 'unsupported' });
    t.compiled();
    t.controller.run('app [broken]', { focus: true });
    t.failed(twoErrors);
    expect(t.previews).toEqual([]);
    expect(t.events.filter((e) => e.type === 'problems').at(-1)).toMatchObject({ problems: [{ line: 34 }, { line: 29 }] });
    expect(t.events.filter((e) => e.type === 'preview')).toEqual([{ type: 'preview', state: 'unsupported' }]);
  });

  it('writes dbg and expect output to the Console and collapses identical repeats', () => {
    const t = setup();
    const preview = t.running();
    t.from(preview, { type: 'tour:dbg', text: '"tick"' });
    t.from(preview, { type: 'tour:dbg', text: '"tick"' });
    t.from(preview, { type: 'tour:dbg', text: '"tick"' });
    t.from(preview, { type: 'tour:expect', text: 'expect failed' });
    t.from(preview, { type: 'tour:dbg', text: '"tick"' });
    expect(t.consoleLines()).toEqual([
      { kind: 'dbg', text: '"tick"', count: 3 },
      { kind: 'expect', text: 'expect failed', count: 1 },
      { kind: 'dbg', text: '"tick"', count: 1 },
    ]);
  });

  it('empties the Console on Clear, so the next repeat starts a new line', () => {
    const t = setup();
    const preview = t.running();
    t.from(preview, { type: 'tour:dbg', text: '1' });
    t.from(preview, { type: 'tour:dbg', text: '1' });
    t.controller.clearConsole();
    expect(t.consoleLines()).toEqual([]);
    t.from(preview, { type: 'tour:dbg', text: '1' });
    expect(t.consoleLines()).toEqual([{ kind: 'dbg', text: '1', count: 1 }]);
  });

  it('shows a crash as a card and a Console line, and the next Run starts a new Preview that clears the card', () => {
    const t = setup();
    const first = t.running();
    t.from(first, { type: 'tour:crash', message: 'boom' });
    expect(t.events.filter((e) => e.type === 'card').at(-1)).toEqual({ type: 'card', card: { kind: 'crashed', message: 'boom' } });
    expect(t.events.filter((e) => e.type === 'preview').at(-1)).toEqual({ type: 'preview', state: 'crashed' });
    expect(t.consoleLines()).toEqual([{ kind: 'crash', text: 'boom', count: 1 }]);
    expect(first.removed).toBe(false);

    t.controller.run('app [fixed]', { focus: true });
    t.compiled([9]);
    const second = t.previews.at(-1)!;
    expect(second).not.toBe(first);
    t.from(second, { type: 'tour:waiting' });
    t.from(second, { type: 'rocco:ready' });
    expect(first.removed).toBe(true);
    expect(t.events.filter((e) => e.type === 'card').at(-1)).toEqual({ type: 'card', card: null });
    expect(t.events.filter((e) => e.type === 'preview').at(-1)).toEqual({ type: 'preview', state: 'running' });
  });

  it('shows a stopped Preview as a card and a Console line, but not after a crash', () => {
    const t = setup();
    const preview = t.running();
    t.from(preview, { type: 'rocco:stopped', reason: 'abort', message: 'The game stopped: oom' });
    expect(t.events.filter((e) => e.type === 'card').at(-1)).toEqual({ type: 'card', card: { kind: 'stopped', message: 'The game stopped: oom' } });
    expect(t.consoleLines()).toEqual([{ kind: 'stopped', text: 'The game stopped: oom', count: 1 }]);

    const u = setup();
    const crashed = u.running();
    u.from(crashed, { type: 'tour:crash', message: 'boom' });
    u.from(crashed, { type: 'rocco:stopped', reason: 'exit', message: 'The game stopped with exit code 1.' });
    expect(u.events.filter((e) => e.type === 'card').at(-1)).toEqual({ type: 'card', card: { kind: 'crashed', message: 'boom' } });
    expect(u.consoleLines()).toEqual([{ kind: 'crash', text: 'boom', count: 1 }]);
  });

  it('restarts the current image in a new Preview without a message to the old one or a compile', () => {
    const t = setup();
    const first = t.running();
    t.from(first, { type: 'tour:crash', message: 'boom' });
    const compiles = t.requests.length;
    const postsToFirst = first.posts.length;

    t.controller.restart();
    expect(t.requests).toHaveLength(compiles);
    expect(first.posts).toHaveLength(postsToFirst);
    expect(t.previews).toHaveLength(2);
    const second = t.previews[1];
    t.from(second, { type: 'tour:waiting' });
    expect(t.imagesSent(second).map(bytesOf)).toEqual([[1, 2, 3]]);
    t.from(second, { type: 'rocco:ready' });
    expect(first.removed).toBe(true);
    expect(second.focused).toBe(true);
    expect(t.events.filter((e) => e.type === 'card').at(-1)).toEqual({ type: 'card', card: null });
  });

  it('does nothing on Restart before the first image', () => {
    const t = setup();
    t.controller.start('app [stub]');
    t.controller.restart();
    expect(t.previews).toHaveLength(1);
  });

  it('asks the reader to reload on tour:bad-image, and starts no Preview after that', () => {
    const t = setup();
    t.controller.start('app [stub]');
    const [preview] = t.previews;
    t.from(preview, { type: 'tour:waiting' });
    t.compiled();
    t.from(preview, { type: 'tour:bad-image', reason: 'build', message: 'The image is from build X, and this Preview is build Y.' });
    expect(t.events.filter((e) => e.type === 'card').at(-1)).toEqual({ type: 'card', card: { kind: 'stale' } });
    expect(t.events.filter((e) => e.type === 'preview').at(-1)).toEqual({ type: 'preview', state: 'stale' });

    t.controller.restart();
    t.controller.run('app [edited]', { focus: true });
    t.compiled([2]);
    expect(t.previews).toHaveLength(1);

    t.controller.run('app [broken]', { focus: true });
    t.failed(twoErrors);
    expect(t.events.filter((e) => e.type === 'problems').at(-1)).toMatchObject({ problems: [{ line: 34 }, { line: 29 }] });
    expect(t.events.filter((e) => e.type === 'card').at(-1)).toEqual({ type: 'card', card: { kind: 'stale' } });
  });

  it('keeps the reload notice when the page finds a missing file while a Preview starts', () => {
    const t = setup();
    const first = t.running();
    t.controller.run('app [edited]', { focus: true });
    t.compiled([2]);
    t.from(first, { type: 'tour:need-iframe', reason: 'init' });
    const second = t.previews[1];
    t.controller.stale();
    t.from(second, { type: 'tour:waiting' });
    t.from(second, { type: 'rocco:ready' });
    expect(t.events.filter((e) => e.type === 'card').at(-1)).toEqual({ type: 'card', card: { kind: 'stale' } });
    expect(first.removed).toBe(false);
  });

  it('keeps the crashed status when a later edit fails to compile', () => {
    const t = setup();
    const preview = t.running();
    t.from(preview, { type: 'tour:crash', message: 'boom' });
    t.controller.run('app [broken]', { focus: true });
    t.failed(twoErrors);
    expect(t.events.filter((e) => e.type === 'preview').at(-1)).toEqual({ type: 'preview', state: 'crashed' });
  });

  it('starts the next step on the same compile worker and keeps the old game until the new first frame', () => {
    const t = setup();
    t.controller.start('app [one]');
    const [first] = t.previews;
    t.from(first, { type: 'tour:waiting' });
    t.compiled([1]);
    t.from(first, { type: 'rocco:ready' });

    t.controller.start('app [two]');
    expect(t.requests.map((r) => r.source)).toEqual(['app [one]', 'app [two]']);
    const second = t.previews[1];
    t.from(second, { type: 'tour:waiting' });
    t.compiled([2]);
    expect(first.removed).toBe(false);
    t.from(second, { type: 'rocco:ready' });
    expect(first.removed).toBe(true);
    expect(second.shown).toBe(true);
    expect(second.focused).toBe(false);
  });

  it('drops the Preview and the compile of a step the reader left before its first frame', () => {
    const t = setup();
    t.controller.start('app [one]');
    const [first] = t.previews;
    t.controller.start('app [two]');
    expect(first.removed).toBe(true);
    t.compiled([1], t.requests[0].id);
    expect(t.requests.map((r) => r.source)).toEqual(['app [one]', 'app [two]']);
    t.compiled([2]);
    const second = t.previews[1];
    t.from(second, { type: 'tour:waiting' });
    expect(t.imagesSent(second).map(bytesOf)).toEqual([[2]]);
    expect(t.previews).toHaveLength(2);
  });

  it('recycles a compile worker over 640 MiB after a Run while the reader keeps running games', () => {
    type FakeWorker = { requests: WorkerRequest[]; terminated: boolean; reply(message: WorkerReply): void };
    const workers: FakeWorker[] = [];
    const previews: FakePreview[] = [];
    let controller: ReturnType<typeof runController> | null = null;
    const compiler = recyclingCompiler({
      spawn(listen) {
        const worker: FakeWorker = { requests: [], terminated: false, reply: listen };
        workers.push(worker);
        return { post: (message) => void worker.requests.push(message), terminate: () => void (worker.terminated = true) };
      },
      deliver: (message) => controller!.fromWorker(message),
    });
    controller = runController({
      compiler,
      createPreview: () => {
        const preview = fakePreview();
        previews.push(preview);
        return preview;
      },
      emit: () => {},
    });
    const lastCompile = (worker: FakeWorker) => worker.requests.filter((r) => r.type === 'compile').at(-1) as { id: number; source: string };
    const compiled = (worker: FakeWorker, byte: number, memory: number) =>
      worker.reply({ type: 'compiled', id: lastCompile(worker).id, image: new Uint8Array([byte]).buffer, identity, reports: '', stats: {}, memory });
    const play = (preview: FakePreview) => {
      controller!.fromWindow(preview.source, { type: 'tour:waiting' });
      controller!.fromWindow(preview.source, { type: 'rocco:ready' });
    };

    controller.start('app [stub]');
    const [old] = workers;
    compiled(old, 1, RECYCLE_BYTES + 1);
    play(previews[0]);
    expect(workers).toHaveLength(2);
    const fresh = workers[1];

    controller.run('app [edit while the new worker starts]', { focus: true });
    expect(lastCompile(old).source).toBe('app [edit while the new worker starts]');
    compiled(old, 2, 700 * 1024 * 1024);
    controller.fromWindow(previews[0].source, { type: 'tour:swapped' });

    fresh.reply({ type: 'ready' });
    old.reply({ type: 'cache', entries: [{ path: '/cache/a', bytes: new ArrayBuffer(4) }] });
    expect(old.terminated).toBe(true);

    controller.run('app [edit on the new worker]', { focus: true });
    expect(lastCompile(fresh).source).toBe('app [edit on the new worker]');
    compiled(fresh, 3, 64 * 1024 * 1024);
    expect(previews[0].posts.map(bytesOf)).toEqual([[1], [2], [3]]);
  });

  it('keeps the reload notice on the next step and starts no Preview there', () => {
    const t = setup();
    t.running();
    t.controller.stale();
    const events = t.events.length;
    t.controller.start('app [next step]');
    expect(t.previews).toHaveLength(1);
    expect(t.requests.at(-1)!.source).toBe('app [next step]');
    expect(t.events.slice(events)).toEqual([
      { type: 'preview', state: 'stale' },
      { type: 'card', card: { kind: 'stale' } },
    ]);
  });
});

describe('auto-run', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('compiles the edit after the reader stops typing', () => {
    const t = setup();
    t.running();
    t.controller.edited('app [a]');
    vi.advanceTimersByTime(AUTO_RUN_MS - 100);
    t.controller.edited('app [ab]');
    vi.advanceTimersByTime(AUTO_RUN_MS - 1);
    expect(t.requests.map((r) => r.source)).toEqual(['app [stub]']);
    vi.advanceTimersByTime(1);
    expect(t.requests.map((r) => r.source)).toEqual(['app [stub]', 'app [ab]']);
  });

  it('compiles nothing after an edit with auto-run off, and Run still runs', () => {
    const t = setup();
    t.running();
    t.controller.setAutoRun(false);
    t.controller.edited('app [a]');
    vi.advanceTimersByTime(AUTO_RUN_MS * 2);
    expect(t.requests.map((r) => r.source)).toEqual(['app [stub]']);
    t.controller.run('app [a]', { focus: true });
    expect(t.requests.map((r) => r.source)).toEqual(['app [stub]', 'app [a]']);
  });

  it('drops a waiting auto-run when auto-run goes off', () => {
    const t = setup();
    t.running();
    t.controller.edited('app [a]');
    t.controller.setAutoRun(false);
    vi.advanceTimersByTime(AUTO_RUN_MS);
    expect(t.requests).toHaveLength(1);
  });

  it('drops a waiting auto-run on Run and on the next step', () => {
    const t = setup();
    t.running();
    t.controller.edited('app [a]');
    t.controller.run('app [a]', { focus: true });
    vi.advanceTimersByTime(AUTO_RUN_MS);
    t.compiled([2]);
    t.controller.edited('app [b]');
    t.controller.start('app [next step]');
    vi.advanceTimersByTime(AUTO_RUN_MS);
    expect(t.requests.map((r) => r.source)).toEqual(['app [stub]', 'app [a]', 'app [next step]']);
  });
});

describe('hot reload', () => {
  it('sends a later image to the running Preview and keeps it on tour:swapped', () => {
    const t = setup();
    const preview = t.running();
    t.controller.run('app [edited]', { focus: false });
    t.compiled([2]);
    expect(t.previews).toHaveLength(1);
    const [, later] = t.imagesSent(preview);
    expect(later.message).toMatchObject({ type: 'tour:image', identity });
    expect(bytesOf(later)).toEqual([2]);
    expect(later.transfer).toEqual([(later.message as { image: ArrayBuffer }).image]);

    t.from(preview, { type: 'tour:swapped' });
    expect(t.previews).toHaveLength(1);
    expect(preview.removed).toBe(false);
    expect(preview.focused).toBe(false);
    expect(t.events.filter((e) => e.type === 'preview').at(-1)).toEqual({ type: 'preview', state: 'running' });
  });

  it.each([
    ['init', 'Restarted: you changed init'],
    ['loaded', 'Restarted: you changed loaded'],
    ['launch', 'Restarted: you changed launch'],
    ['digest', 'Restarted: the Model changed'],
    ['erased-callable', 'Restarted: the game stores a function'],
  ])('starts a new Preview with the refused image on tour:need-iframe %s and says why in the Console', (reason, line) => {
    const t = setup();
    const first = t.running();
    t.controller.run('app [edited]', { focus: false });
    t.compiled([2]);
    t.from(first, { type: 'tour:need-iframe', reason });
    expect(t.consoleLines()).toEqual([{ kind: 'restart', text: line, count: 1 }]);
    expect(t.previews).toHaveLength(2);
    const second = t.previews[1];
    t.from(second, { type: 'tour:waiting' });
    expect(t.imagesSent(second).map(bytesOf)).toEqual([[2]]);
    expect(first.removed).toBe(false);
    expect(first.shown).toBe(true);
    t.from(second, { type: 'rocco:ready' });
    expect(first.removed).toBe(true);
    expect(second.shown).toBe(true);
    expect(second.focused).toBe(false);
  });

  it.each([
    ['crashed', { type: 'tour:crash', message: 'boom' }],
    ['stopped', { type: 'rocco:stopped', reason: 'exit', message: 'The game stopped.' }],
  ])('keeps the card on tour:need-iframe %s, and the next edit starts a new Preview', (reason, end) => {
    const t = setup();
    const first = t.running();
    t.controller.run('app [edited]', { focus: false });
    t.compiled([2]);
    t.from(first, end);
    const lines = t.consoleLines();
    t.from(first, { type: 'tour:need-iframe', reason });
    expect(t.consoleLines()).toEqual(lines);
    expect(t.previews).toHaveLength(1);
    t.controller.run('app [fixed]', { focus: false });
    t.compiled([3]);
    const second = t.previews[1];
    t.from(second, { type: 'tour:waiting' });
    expect(t.imagesSent(second).map(bytesOf)).toEqual([[3]]);
  });

  it('keeps one image in flight, and a newer edit replaces the one that waits', () => {
    const t = setup();
    const preview = t.running();
    for (const [n, bytes] of [[1, [2]], [2, [3]], [3, [4]]] as const) {
      t.controller.run(`app [edit ${n}]`, { focus: false });
      t.compiled([...bytes]);
    }
    expect(t.imagesSent(preview).map(bytesOf)).toEqual([[1, 2, 3], [2]]);
    t.from(preview, { type: 'tour:swapped' });
    expect(t.imagesSent(preview).map(bytesOf)).toEqual([[1, 2, 3], [2], [4]]);
    t.from(preview, { type: 'tour:swapped' });
    expect(t.imagesSent(preview)).toHaveLength(3);
  });

  it('starts the newest image when the Preview refuses an older one', () => {
    const t = setup();
    const first = t.running();
    t.controller.run('app [init edit]', { focus: false });
    t.compiled([2]);
    t.controller.run('app [step edit]', { focus: false });
    t.compiled([3]);
    t.from(first, { type: 'tour:need-iframe', reason: 'init' });
    const second = t.previews[1];
    t.from(second, { type: 'tour:waiting' });
    expect(t.imagesSent(second).map(bytesOf)).toEqual([[3]]);
    expect(t.imagesSent(first)).toHaveLength(2);
  });

  it('holds a later image until the new Preview draws its first frame', () => {
    const t = setup();
    const first = t.running();
    t.controller.run('app [init edit]', { focus: false });
    t.compiled([2]);
    t.from(first, { type: 'tour:need-iframe', reason: 'init' });
    const second = t.previews[1];
    t.from(second, { type: 'tour:waiting' });
    t.controller.run('app [step edit]', { focus: false });
    t.compiled([3]);
    expect(t.imagesSent(second).map(bytesOf)).toEqual([[2]]);
    t.from(second, { type: 'rocco:ready' });
    expect(t.imagesSent(second).map(bytesOf)).toEqual([[2], [3]]);
    expect(t.previews).toHaveLength(2);
  });

  it('replaces the image of a new Preview that has not asked for it yet', () => {
    const t = setup();
    const first = t.running();
    t.controller.run('app [init edit]', { focus: false });
    t.compiled([2]);
    t.from(first, { type: 'tour:need-iframe', reason: 'init' });
    t.controller.run('app [another edit]', { focus: false });
    t.compiled([3]);
    const second = t.previews[1];
    t.from(second, { type: 'tour:waiting' });
    expect(t.imagesSent(second).map(bytesOf)).toEqual([[3]]);
    expect(t.previews).toHaveLength(2);
  });

  it('sends no later image to a crashed Preview, and the next edit starts a new one', () => {
    const t = setup();
    const first = t.running();
    t.from(first, { type: 'tour:crash', message: 'boom' });
    t.controller.run('app [fixed]', { focus: false });
    t.compiled([2]);
    expect(t.imagesSent(first)).toHaveLength(1);
    const second = t.previews[1];
    t.from(second, { type: 'tour:waiting' });
    expect(t.imagesSent(second).map(bytesOf)).toEqual([[2]]);
  });

  it('ends the run on a crash in the swap frame and starts the next edit in a new Preview', () => {
    const t = setup();
    const first = t.running();
    t.controller.run('app [crashes in view]', { focus: false });
    t.compiled([2]);
    t.from(first, { type: 'tour:swapped' });
    t.from(first, { type: 'tour:crash', message: 'boom' });
    expect(t.events.filter((e) => e.type === 'preview').at(-1)).toEqual({ type: 'preview', state: 'crashed' });
    t.controller.run('app [fixed]', { focus: false });
    t.compiled([3]);
    expect(t.imagesSent(first)).toHaveLength(2);
    expect(t.previews).toHaveLength(2);
  });

  it('restarts the newest image after a crash while a later image waited', () => {
    const t = setup();
    const first = t.running();
    t.controller.run('app [one]', { focus: false });
    t.compiled([2]);
    t.controller.run('app [two]', { focus: false });
    t.compiled([3]);
    t.from(first, { type: 'tour:crash', message: 'boom' });
    t.from(first, { type: 'tour:need-iframe', reason: 'crashed' });
    expect(t.previews).toHaveLength(1);
    t.controller.restart();
    const second = t.previews[1];
    t.from(second, { type: 'tour:waiting' });
    expect(t.imagesSent(second).map(bytesOf)).toEqual([[3]]);
  });

  it('keeps the last good run on a failed compile, and a swap clears "last good run"', () => {
    const t = setup();
    const preview = t.running();
    t.controller.run('app [broken]', { focus: false });
    t.failed(twoErrors);
    expect(t.events.at(-1)).toEqual({ type: 'preview', state: 'last-good' });
    t.controller.run('app [fixed]', { focus: false });
    t.compiled([2]);
    expect(t.events.filter((e) => e.type === 'preview').at(-1)).toEqual({ type: 'preview', state: 'last-good' });
    t.from(preview, { type: 'tour:swapped' });
    expect(t.events.filter((e) => e.type === 'preview').at(-1)).toEqual({ type: 'preview', state: 'running' });
  });

  it('focuses the Preview after a swap that Run asked for', () => {
    const t = setup();
    const preview = t.running();
    t.controller.run('app [edited]', { focus: true });
    t.compiled([2]);
    expect(preview.focused).toBe(false);
    t.from(preview, { type: 'tour:swapped' });
    expect(preview.focused).toBe(true);
  });

  it('ignores the replies of a Preview that a new Preview replaced', () => {
    const t = setup();
    const first = t.running();
    t.controller.run('app [edited]', { focus: false });
    t.compiled([2]);
    t.controller.restart();
    const events = t.events.length;
    t.from(first, { type: 'tour:need-iframe', reason: 'init' });
    t.from(first, { type: 'tour:swapped' });
    expect(t.events.length).toBe(events);
    expect(t.previews).toHaveLength(2);
  });
});
