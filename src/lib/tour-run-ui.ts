import * as monaco from 'monaco-editor/editor/editor.api.js';
import type { TourEditor } from './tour-editor';
import type { TourPanes } from './tour-pane-ui';
import type { Problem } from './tour-reports';
import { recyclingCompiler, type WorkerReply } from './tour-recycle';
import { runController, type PreviewPort, type PreviewState, type RunController, type RunEvent } from './tour-run';

// The compile worker compiles the reader's game at this path.
const APP_PATH = '/rocco/examples/tutorial/tour/main.roc';

const NO_WEBGPU = 'The Preview needs WebGPU, which this browser does not have. Try a recent Chrome or Edge on desktop. Run still shows compile problems.';

const STATUS: Record<PreviewState, string> = {
  unsupported: 'no WebGPU',
  starting: 'starting…',
  running: '',
  'last-good': 'last good run',
};

type Elements = { stage: HTMLElement; status: HTMLElement; panel: HTMLElement; count: HTMLElement; run: HTMLElement };

function iframePreview(stage: HTMLElement, url: string): PreviewPort {
  const frame = document.createElement('iframe');
  frame.src = url;
  frame.title = 'Preview';
  frame.allow = 'autoplay; fullscreen';
  frame.className = 'starting';
  stage.append(frame);
  const targetOrigin = new URL(url, location.href).origin;
  return {
    source: frame.contentWindow,
    post: (message, transfer) => frame.contentWindow?.postMessage(message, { targetOrigin, transfer }),
    show: () => {
      frame.classList.remove('starting');
      stage.querySelector('.note')?.remove();
    },
    focus: () => frame.focus(),
    remove: () => frame.remove(),
  };
}

function renderProblems({ panel, count }: Elements, editor: TourEditor, problems: Problem[], internal: string | null) {
  const model = editor.editor.getModel()!;
  monaco.editor.setModelMarkers(
    model,
    'roc',
    problems
      .filter((p) => p.path === APP_PATH)
      .map((p) => ({
        severity: monaco.MarkerSeverity.Error,
        message: `${p.title}\n\n${p.body}`,
        startLineNumber: p.line,
        startColumn: p.column,
        endLineNumber: p.line,
        endColumn: p.endColumn,
      })),
  );
  const list = document.createElement('ul');
  list.className = 'problems';
  if (internal !== null) {
    const row = document.createElement('li');
    row.innerHTML = '<div class="head"><span class="title">Internal error</span></div><pre></pre>';
    row.querySelector('pre')!.textContent = internal;
    list.append(row);
  }
  for (const problem of problems) {
    const row = document.createElement('li');
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'head';
    const where = problem.path === APP_PATH ? 'main.roc' : problem.path;
    head.innerHTML = '<span class="where"></span> <span class="title"></span>';
    head.querySelector('.where')!.textContent = `${where}:${problem.line}:${problem.column}`;
    head.querySelector('.title')!.textContent = problem.title;
    if (problem.path === APP_PATH) {
      head.addEventListener('click', () => {
        editor.editor.setPosition({ lineNumber: problem.line, column: problem.column });
        editor.editor.revealLineInCenter(problem.line);
        editor.editor.focus();
      });
    }
    const body = document.createElement('pre');
    body.textContent = problem.body;
    row.append(head, body);
    list.append(row);
  }
  panel.replaceChildren(list);
  const total = problems.length + (internal === null ? 0 : 1);
  count.textContent = total ? String(total) : '';
}

// One session per Tour visit. ClientRouter keeps this module alive across Tour steps, so the compile worker and its
// cache stay warm. Each step page gives the session its own elements and its own show().
type Session = { base: string; controller: RunController; stage: HTMLElement; show(event: RunEvent): void; close(): void };
let session: Session | null = null;

function startSession(base: string, stage: HTMLElement): Session {
  const workerUrl = `${base}compile-worker/compile-worker.mjs`;
  const previewUrl = `${base}preview/host.html`;
  const compiler = recyclingCompiler({
    spawn(listen) {
      const worker = new Worker(workerUrl, { type: 'module' });
      worker.addEventListener('message', (event: MessageEvent<WorkerReply>) => listen(event.data));
      worker.addEventListener('error', () =>
        listen({ type: 'failed', id: null, kind: 'internal', reports: 'The compile worker did not start.' }),
      );
      return { post: (message, transfer = []) => worker.postMessage(message, transfer), terminate: () => worker.terminate() };
    },
    deliver: (message) => controller.fromWorker(message),
  });
  const controller = runController({
    compiler,
    createPreview: 'gpu' in navigator ? () => iframePreview(current.stage, previewUrl) : null,
    emit: (event) => current.show(event),
  });
  const fromWindow = (event: MessageEvent) => controller.fromWindow(event.source, event.data);
  addEventListener('message', fromWindow);
  const current: Session = {
    base,
    controller,
    stage,
    show: () => {},
    close: () => {
      compiler.close();
      removeEventListener('message', fromWindow);
    },
  };
  return current;
}

export function mountTourRun(base: string, editor: TourEditor, panes: TourPanes, elements: Elements) {
  if (session?.base !== base) {
    session?.close();
    session = startSession(base, elements.stage);
  }
  session.stage = elements.stage;

  const show = (event: RunEvent) => {
    if (event.type === 'problems') {
      renderProblems(elements, editor, event.problems, event.internal);
      if (event.problems.length || event.internal !== null) panes.setCollapsed('panel', false);
    } else if (event.type === 'preview') {
      elements.status.textContent = STATUS[event.state];
      const note = elements.stage.querySelector('.note');
      if (event.state === 'unsupported' && note) note.textContent = NO_WEBGPU;
    }
  };

  session.show = show;
  const { controller } = session;

  const run = () => controller.run(editor.source(), { focus: true });
  elements.run.addEventListener('click', run);
  editor.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run);

  controller.start(editor.source());
  return controller;
}

// Call before the step page goes away. Events in the gap until the next step mounts have no page to show them on.
export function leaveTourRun() {
  if (session) session.show = () => {};
}
