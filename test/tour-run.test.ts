import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runController, type CompileRequest, type Identity, type PreviewPort, type RunEvent, type WorkerMessage } from '../src/lib/tour-run';

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
  return { controller, requests, previews, events, compiled, failed, from, imagesSent, worker };
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

  it('runs the edited source in a new Preview that replaces the old one on its first frame and takes focus', () => {
    const t = setup();
    t.controller.start('app [stub]');
    const [first] = t.previews;
    t.from(first, { type: 'tour:waiting' });
    t.compiled([1]);
    t.from(first, { type: 'rocco:ready' });

    t.controller.run('app [edited]', { focus: true });
    expect(t.requests.at(-1)!.source).toBe('app [edited]');
    t.compiled([2]);
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
    expect(t.events).toContainEqual({ type: 'output', message: { type: 'tour:dbg', text: '"tick"' } });

    t.controller.run('app [edited]', { focus: true });
    t.compiled([2]);
    const second = t.previews[1];
    const before = t.events.length;
    t.controller.fromWindow({}, { type: 'tour:waiting' });
    t.from(first, { type: 'tour:crash', message: 'boom' });
    t.from(first, { type: 'tour:waiting' });
    t.from(first, { type: 'rocco:ready' });
    expect(t.events.length).toBe(before);
    expect(t.imagesSent(second)).toEqual([]);
    expect(t.imagesSent(first)).toHaveLength(1);
    expect(second.shown).toBe(false);

    t.from(second, { type: 'tour:waiting' });
    t.from(second, { type: 'tour:crash', message: 'boom' });
    expect(t.events.at(-1)).toEqual({ type: 'output', message: { type: 'tour:crash', message: 'boom' } });
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
});

