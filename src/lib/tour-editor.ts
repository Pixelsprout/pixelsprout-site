import * as monaco from 'monaco-editor/editor/editor.api.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import { shikiToMonaco } from '@shikijs/monaco';
import { createHighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import roc from '../grammars/roc.tmLanguage.json';
import { soil } from '../styles/soil-theme.mjs';
import { stepEdits, type StepSources } from './tour-edits';

export type TourEditor = { editor: monaco.editor.IStandaloneCodeEditor; source(): string; reset(): void; showAnswer(): void };

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

let highlighting: Promise<void> | null = null;

function highlightRoc(): Promise<void> {
  highlighting ??= (async () => {
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
