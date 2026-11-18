import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FileEntry } from '../src/lib/files';
import { applyTourMarkers, tourSteps, type GuidePage } from '../src/lib/tour-steps';

const FIXTURE = new URL('fixtures/tour-guide/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, FIXTURE), 'utf8');

describe('applyTourMarkers', () => {
  const window = () => applyTourMarkers(read('guide/tutorial/01-window.md'), 'guide/tutorial/01-window.md');

  it('drops tour:skip blocks', () => {
    const text = window();
    expect(text).not.toContain('## Before you start');
    expect(text).not.toContain('In `pip/`, run:');
    expect(text).not.toContain('tour:skip');
    expect(text).toContain('## Make the game folder');
  });

  it('shows the text of tour-only blocks', () => {
    const text = window();
    expect(text).toContain('\nPress **Run**. The Preview shows an orange cube.\n');
    expect(text).toContain('\n## Run the game\n');
    expect(text).not.toContain('tour-only');
    expect(text).not.toContain('-->\n\nNext, read');
  });

  it('keeps the front matter and the rest of the page', () => {
    const text = window();
    expect(text.startsWith('---\ntitle: "1. A window, a camera and a cube"\n')).toBe(true);
    expect(text).toContain('Next, read [2. The character](02-character.md).');
  });

  const fails = (text: string, message: RegExp) =>
    expect(() => applyTourMarkers(text, 'guide/tutorial/01-window.md')).toThrow(message);

  it('fails on a tour:skip block that never closes, and names the page and line', () => {
    fails('# A\n\n<!-- tour:skip -->\nB\n', /guide\/tutorial\/01-window\.md:3 opens a tour:skip block that never closes/);
  });

  it('fails on a close with no open', () => {
    fails('# A\n<!-- /tour:skip -->\n', /01-window\.md:2 closes a tour:skip block that is not open/);
  });

  it('fails on a tour-only block that never closes', () => {
    fails('# A\n<!-- tour-only\nB\n', /01-window\.md:2 opens a tour-only block that never closes/);
  });

  it('fails on a block inside another block', () => {
    fails('<!-- tour:skip -->\n<!-- tour-only\nB\n-->\n<!-- /tour:skip -->\n', /01-window\.md:2 opens a tour-only block inside the tour:skip block from line 1/);
    fails('<!-- tour:skip -->\n<!-- tour:skip -->\n<!-- /tour:skip -->\n', /01-window\.md:2 opens a tour:skip block inside/);
  });

  it('fails on a misspelt marker', () => {
    fails('<!-- tour-skip -->\nB\n', /01-window\.md:1 has the unknown tour marker <!-- tour-skip -->/);
    fails('<!-- tour:only -->\n', /unknown tour marker/);
  });

  it('leaves markers in fenced code alone', () => {
    const text = '```md\n<!-- tour:skip -->\n```\n';
    expect(applyTourMarkers(text, 'guide/tutorial/01-window.md')).toBe(text);
  });
});

describe('tourSteps', () => {
  const page = (slug: string, title: string, order: number): GuidePage => {
    const path = `guide/tutorial/${slug}.md`;
    return { path, title, order, text: read(path) };
  };
  const source = (folder: string): FileEntry => {
    const path = `examples/tutorial/${folder}/main.roc`;
    return { path, data: new TextEncoder().encode(read(path)) };
  };
  const pages = () => [
    page('02-character', '2. The character', 2),
    { path: 'guide/calls.md', title: 'The five calls', order: 2, text: '# The five calls' },
    page('01-window', '1. A window, a camera and a cube', 1),
  ];
  const sources = () => [source('00-start'), source('01-window'), source('02-character')];
  const build = (markers: Record<string, string> | null = null) =>
    tourSteps({ pages: pages(), sources: sources(), ref: 'v0.2.0', markers });

  it('makes one step per Tutorial page, in Tutorial order, with the page slug', () => {
    expect(build().map((s) => [s.slug, s.title, s.order])).toEqual([
      ['01-window', '1. A window, a camera and a cube', 1],
      ['02-character', '2. The character', 2],
    ]);
  });

  it('starts each step from the previous chapter app, and step 1 from the stub', () => {
    const [window, character] = build();
    expect(window.start).toBe(read('examples/tutorial/00-start/main.roc'));
    expect(window.answer).toBe(read('examples/tutorial/01-window/main.roc'));
    expect(character.start).toBe(read('examples/tutorial/01-window/main.roc'));
    expect(character.answer).toBe(read('examples/tutorial/02-character/main.roc'));
  });

  it('applies the tour markers to the step text', () => {
    const character = build()[1].text;
    expect(character).not.toContain('git diff --no-index');
    expect(character).toContain('The Tour gives your game `pip.glb`, so you need no download.');
  });

  it('points chapter links at Tour steps and other links at the Guide', () => {
    const [window, character] = build();
    expect(window.text).toContain('Next, read [2. The character](/projects/rocco/tour/02-character/).');
    expect(window.text).toContain('[The Scene](/projects/rocco/docs/scene/#lights)');
    expect(window.text).toContain('(/projects/rocco/docs/images/tutorial-01-window.png)');
    expect(character.text).toContain('[1. A window, a camera and a cube](/projects/rocco/tour/01-window/)');
    expect(character.text).toContain('[`examples/tutorial/02-character/main.roc`](https://github.com/Pixelsprout/rocco-engine/blob/v0.2.0/examples/tutorial/02-character/main.roc)');
  });

  it('fills the markers of a release in the step text', () => {
    const markers = { camera_url: 'https://x/cam.tar.zst', mesh_url: 'https://x/mesh.tar.zst', platform_url: 'https://x/pf.tar.zst', roc_nightly: 'nightly-1' };
    const [, character] = build(markers);
    expect(character.text).toContain('cam: "https://x/cam.tar.zst"');
    expect(character.text).not.toContain('{{');
  });

  it('fails when a chapter app is missing, and names the file', () => {
    expect(() => tourSteps({ pages: pages(), sources: [source('00-start'), source('01-window')], ref: 'main', markers: null })).toThrow(
      /The Tour step 02-character needs examples\/tutorial\/02-character\/main\.roc/,
    );
  });

  it('fails when the step 1 stub is missing', () => {
    expect(() => tourSteps({ pages: pages(), sources: [source('01-window'), source('02-character')], ref: 'main', markers: null })).toThrow(
      /The Tour step 01-window needs examples\/tutorial\/00-start\/main\.roc/,
    );
  });

  it('fails on unbalanced markers', () => {
    const broken = { ...page('01-window', 'One', 1), text: '# One\n<!-- tour:skip -->\n' };
    expect(() => tourSteps({ pages: [broken], sources: sources(), ref: 'main', markers: null })).toThrow(/never closes/);
  });
});
