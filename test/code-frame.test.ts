import { createHighlighter } from 'shiki';
import { describe, expect, it } from 'vitest';
import roc from '../src/grammars/roc.tmLanguage.json' with { type: 'json' };
import { codeFrame } from '../src/lib/code-frame.mjs';
import { soil } from '../src/styles/soil-theme.mjs';
import { contrast } from './contrast';

// createHighlighter adds a scope-less default entry to the theme it is given.
const themeColours = (soil.tokenColors ?? []).map((t) => ({
  scope: String([t.scope].flat()[0]),
  foreground: String(t.settings.foreground),
}));
const highlighter = await createHighlighter({ themes: [soil], langs: [{ ...roc, name: 'roc' }, 'odin'] });
const render = (raw?: string) =>
  highlighter.codeToHtml('x = 1', { lang: 'roc', theme: 'soil', transformers: [codeFrame], meta: raw ? { __raw: raw } : undefined });

describe('codeFrame', () => {
  it('puts the fence title in the bar', () => {
    expect(render('title="packages/meshes/Meshes.roc"')).toMatch(
      /^<div class="code"><div class="code-bar"><span>packages\/meshes\/Meshes\.roc<\/span><\/div><pre/,
    );
  });

  it('leaves an empty bar without a title', () => {
    expect(render()).toMatch(/^<div class="code"><div class="code-bar"><\/div><pre/);
  });

  it('highlights Odin with the bundled grammar', () => {
    expect(highlighter.codeToHtml('main :: proc() {}', { lang: 'odin', theme: 'soil' })).toContain('<pre');
  });
});

describe('soil theme', () => {
  const bg = String(soil.colors?.['editor.background']);
  for (const { scope, foreground } of themeColours) {
    it(`${scope} reaches 4.5:1`, () => {
      expect(contrast(foreground, bg)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
