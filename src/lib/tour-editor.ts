import * as monaco from 'monaco-editor/editor/editor.api.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import { shikiToMonaco } from '@shikijs/monaco';
import { createHighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import roc from '../grammars/roc.tmLanguage.json';
import { soil } from '../styles/soil-theme.mjs';
import { TransitionBeforeSwapEvent } from 'astro:transitions/client';
import { stepEdits, type StepSources } from './tour-edits';

export type TourEditor = { editor: monaco.editor.IStandaloneCodeEditor; source(): string; reset(): void; showAnswer(): void };

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

// Monaco adds its token colours and menu styles to <head> at run time. A ClientRouter swap removes every head
// element the next page does not also have, which leaves the editor uncoloured after a step change.
let keptStyles = 0;

function keepMonacoStyles(event: Event) {
  if (!(event instanceof TransitionBeforeSwapEvent)) return;
  const incoming = new Set([...event.newDocument.head.querySelectorAll('style')].map((style) => style.textContent));
  document.head.querySelectorAll<HTMLStyleElement>('style:not([data-vite-dev-id])').forEach((style) => {
    if (!style.textContent?.includes('.monaco-') || incoming.has(style.textContent)) return;
    style.dataset.astroTransitionPersist ??= `monaco-style-${keptStyles++}`;
    const twin = event.newDocument.createElement('style');
    twin.dataset.astroTransitionPersist = style.dataset.astroTransitionPersist;
    event.newDocument.head.append(twin);
  });
}

let highlighting: Promise<void> | null = null;

function highlightRoc(): Promise<void> {
  highlighting ??= (async () => {
    document.addEventListener('astro:before-swap', keepMonacoStyles);
    (self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = { getWorker: () => new EditorWorker() };
    const highlighter = await createHighlighterCore({
      themes: [soil],
      langs: [{ ...(roc as object), name: 'roc' } as never],
      engine: createOnigurumaEngine(import('shiki/wasm')),
    });
    monaco.languages.register({ id: 'roc' });
    shikiToMonaco(highlighter, monaco as never);
  })();
  return highlighting;
}

export async function mountTourEditor(host: HTMLElement, step: StepSources): Promise<TourEditor> {
  await highlightRoc();
  const edits = stepEdits(storage(), step);
  const editor = monaco.editor.create(host, {
    value: edits.initial(),
    language: 'roc',
    theme: 'soil',
    automaticLayout: true,
    minimap: { enabled: false },
    fontFamily: 'IBM Plex Mono',
    fontSize: 14,
    scrollBeyondLastLine: false,
    tabSize: 4,
    // Keyboard-shortcut extensions such as Vimium do not treat an EditContext element as editable and swallow
    // the reader's keys. The hidden textarea keeps typing working for them.
    editContext: false,
  });
  const model = editor.getModel()!;
  model.onDidChangeContent(() => edits.save(model.getValue()));

  // An edit, not setValue, so Cmd/Ctrl+Z brings the reader's own code back.
  const replace = (text: string) => {
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text }], () => null);
    model.pushStackElement();
  };
  return {
    editor,
    source: () => model.getValue(),
    reset: () => replace(edits.reset()),
    showAnswer: () => replace(edits.answer()),
  };
}
