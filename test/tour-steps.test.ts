import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyTourMarkers } from '../src/lib/tour-steps';

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
