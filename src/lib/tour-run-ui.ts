import * as monaco from 'monaco-editor/editor/editor.api.js';
import type { TourEditor } from './tour-editor';
import type { TourPanes } from './tour-pane-ui';
import type { Problem } from './tour-reports';
import { runController, type Card, type PreviewPort, type PreviewState, type RunEvent, type WorkerMessage } from './tour-run';

// The compile worker compiles the reader's game at this path.
const APP_PATH = '/rocco/examples/tutorial/tour/main.roc';

const NO_WEBGPU = 'The Preview needs WebGPU, which this browser does not have. Try a recent Chrome or Edge on desktop. Run still shows compile problems.';

const STATUS: Record<PreviewState, string> = {
  unsupported: 'no WebGPU',
  starting: 'starting…',
  running: '',
  'last-good': 'last good run',
  crashed: 'crashed',
  stopped: 'stopped',
  stale: 'out of date',
};

// A dbg in step posts every frame, so a line that alternates never collapses. Keep the newest lines.
const CONSOLE_LIMIT = 500;

type Elements = {
  stage: HTMLElement;
  status: HTMLElement;
  restart: HTMLButtonElement;
  card: HTMLElement;
  panel: HTMLElement;
  problems: HTMLElement;
  count: HTMLElement;
  console: HTMLElement;
  consoleCount: HTMLElement;
  clear: HTMLElement;
  run: HTMLElement;
};

// A missing file means the deployed Tour moved on from this page's build.
async function anyMissing(urls: string[]) {
  const statuses = await Promise.all(urls.map((url) => fetch(url, { method: 'HEAD', cache: 'no-store' }).then((r) => r.status, () => 0)));
  return statuses.includes(404);
}

// The Preview files load inside the iframe, so the iframe's own timing entries hold their HTTP status.
function previewFileMissing(stage: HTMLElement) {
  return [...stage.querySelectorAll('iframe')].some((frame) => {
    const perf = frame.contentWindow?.performance;
    if (!perf) return false;
    const entries = [...perf.getEntriesByType('navigation'), ...perf.getEntriesByType('resource')] as PerformanceResourceTiming[];
    return entries.some((entry) => entry.responseStatus === 404);
  });
}

function iframePreview(stage: HTMLElement, url: string, onLoad: () => void): PreviewPort {
  const frame = document.createElement('iframe');
  frame.addEventListener('load', onLoad);
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

function renderProblems({ problems: panel, count }: Elements, editor: TourEditor, problems: Problem[], internal: string | null) {
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

function panelTabs({ panel }: Elements) {
  const tabs = [...panel.querySelectorAll<HTMLElement>('[role="tab"]')];
  const select = (name: string) => {
    for (const tab of tabs) {
      const on = tab.dataset.tab === name;
      tab.setAttribute('aria-selected', String(on));
      document.getElementById(tab.getAttribute('aria-controls')!)!.hidden = !on;
    }
    panel.dataset.tab = name;
  };
  for (const tab of tabs) tab.addEventListener('click', () => select(tab.dataset.tab!));
  return { select };
}

function consoleView({ console: list, consoleCount }: Elements) {
  const setCount = () => (consoleCount.textContent = list.childElementCount ? String(list.childElementCount) : '');
  return {
    line(kind: string, text: string, count: number) {
      if (count > 1 && list.lastElementChild) {
        list.lastElementChild.querySelector('.repeat')!.textContent = `x${count}`;
        return;
      }
      const row = document.createElement('li');
      row.className = kind;
      row.innerHTML = '<span class="kind"></span><span class="text"></span><span class="repeat"></span>';
      row.querySelector('.kind')!.textContent = kind;
      row.querySelector('.text')!.textContent = text;
      const follow = list.scrollTop + list.clientHeight >= list.scrollHeight - 4;
      list.append(row);
      if (list.childElementCount > CONSOLE_LIMIT) list.firstElementChild!.remove();
      if (follow) list.scrollTop = list.scrollHeight;
      setCount();
    },
    clear() {
      list.replaceChildren();
      setCount();
    },
  };
}

const CARD_TITLE = { crashed: 'The game crashed', stopped: 'The game stopped', stale: 'The Tour was updated. Reload the page.' };

function renderCard({ card: element, stage }: Elements, card: Card | null) {
  element.hidden = !card;
  if (!card) {
    delete stage.dataset.ended;
    return;
  }
  stage.dataset.ended = 'card';
  element.dataset.kind = card.kind;
  element.querySelector('h3')!.textContent = CARD_TITLE[card.kind];
  element.querySelector('pre')!.textContent = card.kind === 'stale' ? '' : card.message;
}

export function mountTourRun(base: string, editor: TourEditor, panes: TourPanes, elements: Elements) {
  const worker = new Worker(`${base}compile-worker/compile-worker.mjs`, { type: 'module' });
  const webgpu = 'gpu' in navigator;
  const previewUrl = `${base}preview/host.html`;

  const workerFiles = ['compile-worker.mjs', 'compile-worker.wasm', 'source-bundle.json'].map((name) => `${base}compile-worker/${name}`);
  const tabs = panelTabs(elements);
  const output = consoleView(elements);

  const show = (event: RunEvent) => {
    if (event.type === 'problems') {
      renderProblems(elements, editor, event.problems, event.internal);
      if (event.problems.length || event.internal !== null) {
        tabs.select('problems');
        panes.setCollapsed('panel', false);
      }
    } else if (event.type === 'preview') {
      elements.status.textContent = STATUS[event.state];
      elements.restart.disabled = event.state === 'unsupported' || event.state === 'stale';
      const note = elements.stage.querySelector('.note');
      if (event.state === 'unsupported' && note) note.textContent = NO_WEBGPU;
    } else if (event.type === 'console') {
      output.line(event.kind, event.text, event.count);
    } else if (event.type === 'console-cleared') {
      output.clear();
    } else if (event.type === 'card') {
      renderCard(elements, event.card);
      if (event.card?.kind === 'stopped' && previewFileMissing(elements.stage)) controller.stale();
    }
  };

  const controller = runController({
    compiler: { post: (message) => worker.postMessage(message) },
    createPreview: webgpu
      ? () =>
          iframePreview(elements.stage, previewUrl, () => {
            if (previewFileMissing(elements.stage)) controller.stale();
          })
      : null,
    emit: show,
  });
  // A startup failure can be a stale page whose worker files are gone.
  const startFailed = async (message: WorkerMessage) => {
    if (await anyMissing(workerFiles)) controller.stale();
    else controller.fromWorker(message);
  };
  worker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
    if (event.data.type === 'failed' && event.data.id === null) startFailed(event.data);
    else controller.fromWorker(event.data);
  });
  worker.addEventListener('error', () =>
    startFailed({ type: 'failed', id: null, kind: 'internal', reports: 'The compile worker did not start.' }),
  );
  addEventListener('message', (event) => controller.fromWindow(event.source, event.data));

  elements.restart.addEventListener('click', () => controller.restart());
  elements.clear.addEventListener('click', () => controller.clearConsole());
  elements.card.addEventListener('click', (event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>('[data-card-action]')?.dataset.cardAction;
    if (action === 'restart') controller.restart();
    else if (action === 'dismiss') {
      elements.card.hidden = true;
      elements.stage.dataset.ended = 'frame';
    }
    else if (action === 'reload') location.reload();
  });

  const run = () => controller.run(editor.source(), { focus: true });
  elements.run.addEventListener('click', run);
  editor.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run);

  controller.start(editor.source());
  return controller;
}
