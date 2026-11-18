import * as monaco from 'monaco-editor/editor/editor.api.js';
import type { TourEditor } from './tour-editor';
import type { TourPanes } from './tour-pane-ui';
import type { Problem } from './tour-reports';
import { runController, type PreviewPort, type PreviewState, type RunEvent, type WorkerMessage } from './tour-run';

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

export function mountTourRun(base: string, editor: TourEditor, panes: TourPanes, elements: Elements) {
  const worker = new Worker(`${base}compile-worker/compile-worker.mjs`, { type: 'module' });
  const webgpu = 'gpu' in navigator;
  const previewUrl = `${base}preview/host.html`;

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

  const controller = runController({
    compiler: { post: (message) => worker.postMessage(message) },
    createPreview: webgpu ? () => iframePreview(elements.stage, previewUrl) : null,
    emit: show,
  });
  worker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => controller.fromWorker(event.data));
  worker.addEventListener('error', () =>
    controller.fromWorker({ type: 'failed', id: null, kind: 'internal', reports: 'The compile worker did not start.' }),
  );
  addEventListener('message', (event) => controller.fromWindow(event.source, event.data));

  const run = () => controller.run(editor.source(), { focus: true });
  elements.run.addEventListener('click', run);
  editor.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run);

  controller.start(editor.source());
  return controller;
}
