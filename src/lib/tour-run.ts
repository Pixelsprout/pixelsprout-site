import { parseReports, type Problem } from './tour-reports';

// The ADR 0041 Identity, from the compile worker.
export type Identity = {
  digests: string[];
  init: string;
  loaded: string;
  launch: string;
  erasedCallables: number;
  buildId: string;
};

export type CompileRequest = { type: 'compile'; id: number; source: string };

export type WorkerMessage =
  | { type: 'ready' }
  | { type: 'compiled'; id: number; image: ArrayBuffer; identity: Identity; reports: string; stats: object }
  | { type: 'failed'; id: number | null; kind: 'compile' | 'internal'; reports: string; stats?: object };

export type PageToPreview = { type: 'tour:image'; image: ArrayBuffer; identity: Identity };

export type PreviewToPage =
  | { type: 'tour:waiting' }
  | { type: 'rocco:ready' }
  | { type: 'rocco:unsupported' | 'rocco:stopped'; reason: string; message: string }
  | { type: 'rocco:quit' }
  | { type: 'tour:crash'; message: string }
  | { type: 'tour:dbg' | 'tour:expect'; text: string }
  | { type: 'tour:swapped' }
  | { type: 'tour:need-iframe'; reason: string }
  | { type: 'tour:bad-image'; reason: 'build'; message: string };

export type CompilePort = { post(message: CompileRequest): void };

// One Preview (an iframe in the browser). source is the window its messages come from.
export type PreviewPort = {
  readonly source: unknown;
  post(message: PageToPreview, transfer: Transferable[]): void;
  show(): void;
  focus(): void;
  remove(): void;
};

export type PreviewState = 'unsupported' | 'starting' | 'running' | 'last-good' | 'crashed' | 'stopped' | 'stale';

export type ConsoleKind = 'dbg' | 'expect' | 'crash' | 'stopped';

// The card over the Preview. stale: the deployed Tour changed under this page, and only a reload helps.
export type Card = { kind: 'crashed' | 'stopped'; message: string } | { kind: 'stale' };

export type RunEvent =
  | { type: 'problems'; problems: Problem[]; internal: string | null }
  | { type: 'preview'; state: PreviewState }
  // count 1 adds a line. A higher count is an identical repeat of the last line.
  | { type: 'console'; kind: ConsoleKind; text: string; count: number }
  | { type: 'console-cleared' }
  | { type: 'card'; card: Card | null }
  | { type: 'output'; message: PreviewToPage };

export type RunHost = {
  compiler: CompilePort;
  // null when the browser has no WebGPU: Run still compiles and shows problems.
  createPreview: (() => PreviewPort) | null;
  emit(event: RunEvent): void;
};

export type RunOptions = { focus: boolean };

export type RunController = {
  start(source: string): void;
  run(source: string, options: RunOptions): void;
  fromWorker(message: WorkerMessage): void;
  fromWindow(source: unknown, data: unknown): void;
  // Starts the newest image again from init in a new Preview.
  restart(): void;
  clearConsole(): void;
  // The page is older than the deployed Tour. Never reload by itself: a stale cache would loop.
  stale(): void;
};

type Image = { image: ArrayBuffer; identity: Identity };
type Preview = { port: PreviewPort; waiting: boolean; image: Image | null; sent: boolean; focus: boolean; ended: boolean };

export function runController(host: RunHost): RunController {
  let nextId = 1;
  let compiling: { id: number; focus: boolean } | null = null;
  let waiting: { source: string; focus: boolean } | null = null;
  // The Preview on screen, and the newest Preview. They differ while a new Preview starts.
  let shown: Preview | null = null;
  let latest: Preview | null = null;
  let isStale = false;
  let lastLine: { kind: ConsoleKind; text: string; count: number } | null = null;

  const newPreview = (): Preview | null => {
    if (!host.createPreview) return null;
    return { port: host.createPreview(), waiting: false, image: null, sent: false, focus: false, ended: false };
  };

  // The controller keeps the original, so a later Preview can start from the same image.
  const send = (preview: Preview) => {
    if (!preview.waiting || !preview.image || preview.sent) return;
    preview.sent = true;
    const image = preview.image.image.slice(0);
    preview.port.post({ type: 'tour:image', image, identity: preview.image.identity }, [image]);
  };

  // One compile at a time. A newer edit replaces the one that waits.
  const compile = (source: string, focus: boolean) => {
    if (compiling) {
      waiting = { source, focus };
      return;
    }
    compiling = { id: nextId++, focus };
    host.compiler.post({ type: 'compile', id: compiling.id, source });
  };

  const launch = (image: Image, focus: boolean) => {
    if (isStale) return;
    // A prewarmed Preview with no image yet takes this one. A Preview that has an image starts nothing new.
    if (!latest || latest.image) {
      if (latest && latest !== shown) latest.port.remove();
      latest = newPreview();
    }
    if (!latest) return;
    latest.image = image;
    latest.focus = focus;
    host.emit({ type: 'preview', state: 'starting' });
    send(latest);
  };

  const ready = (preview: Preview) => {
    if (shown && shown !== preview) shown.port.remove();
    shown = preview;
    preview.port.show();
    if (preview.focus) preview.port.focus();
    host.emit({ type: 'preview', state: 'running' });
    host.emit({ type: 'card', card: null });
  };

  const log = (kind: ConsoleKind, text: string) => {
    if (lastLine && lastLine.kind === kind && lastLine.text === text) lastLine.count++;
    else lastLine = { kind, text, count: 1 };
    host.emit({ type: 'console', ...lastLine });
  };

  const stale = () => {
    if (isStale) return;
    isStale = true;
    if (latest && latest !== shown) latest.port.remove();
    host.emit({ type: 'preview', state: 'stale' });
    host.emit({ type: 'card', card: { kind: 'stale' } });
  };

  const problems = (reports: string, internal: string | null = null) =>
    host.emit({ type: 'problems', problems: parseReports(reports), internal });

  return {
    start(source) {
      latest = newPreview();
      if (!latest) host.emit({ type: 'preview', state: 'unsupported' });
      compile(source, false);
    },
    run(source, { focus }) {
      compile(source, focus);
    },
    fromWorker(message) {
      if (message.type === 'ready') return;
      if (message.type === 'failed' && message.id === null) return problems('', message.reports);
      if (!compiling || message.id !== compiling.id) return;
      const { focus } = compiling;
      compiling = null;
      if (waiting) {
        const next = waiting;
        waiting = null;
        return compile(next.source, next.focus);
      }
      if (message.type === 'compiled') {
        problems(message.reports);
        launch({ image: message.image, identity: message.identity }, focus);
      } else {
        if (message.kind === 'internal') problems('', message.reports);
        else problems(message.reports);
        if (shown && !isStale && !latest?.ended) host.emit({ type: 'preview', state: 'last-good' });
      }
    },
    restart() {
      if (latest?.image) launch(latest.image, true);
    },
    stale,
    clearConsole() {
      lastLine = null;
      host.emit({ type: 'console-cleared' });
    },
    fromWindow(source, data) {
      const preview = latest;
      if (isStale || !preview || source !== preview.port.source || typeof (data as { type?: unknown } | null)?.type !== 'string') return;
      const message = data as PreviewToPage;
      if (message.type === 'tour:waiting') {
        preview.waiting = true;
        send(preview);
      } else if (message.type === 'rocco:ready') {
        ready(preview);
      } else if (message.type === 'tour:dbg' || message.type === 'tour:expect') {
        log(message.type === 'tour:dbg' ? 'dbg' : 'expect', message.text);
      } else if (message.type === 'tour:crash') {
        preview.ended = true;
        log('crash', message.message);
        host.emit({ type: 'preview', state: 'crashed' });
        host.emit({ type: 'card', card: { kind: 'crashed', message: message.message } });
      } else if (message.type === 'tour:bad-image') {
        stale();
      } else if (message.type === 'rocco:stopped' || message.type === 'rocco:unsupported') {
        // A crash can be followed by rocco:stopped; the crash card stays.
        if (preview.ended) return;
        preview.ended = true;
        log('stopped', message.message);
        host.emit({ type: 'preview', state: 'stopped' });
        host.emit({ type: 'card', card: { kind: 'stopped', message: message.message } });
      } else {
        host.emit({ type: 'output', message });
      }
    },
  };
}
