import { describe, expect, it } from 'vitest';
import { DocsError, docsSections, pageSlug, replaceMarkers, rewriteLinks } from '../src/lib/docs';

const BLOB = 'https://github.com/Pixelsprout/rocco-engine/blob/v0.2.0';

describe('replaceMarkers', () => {
  const markers = { platform_url: 'https://x/platform.tar.zst', roc_nightly: 'nightly-2026-10-11' };

  it('replaces every marker, in code blocks too', () => {
    const text = 'Use `{{roc_nightly}}`.\n\n```roc\napp { pf: platform "{{platform_url}}", roc: "{{roc_nightly}}" }\n```\n';
    expect(replaceMarkers(text, markers, 'guide/install.md')).toBe(
      'Use `nightly-2026-10-11`.\n\n```roc\napp { pf: platform "https://x/platform.tar.zst", roc: "nightly-2026-10-11" }\n```\n',
    );
  });

  it('fails on a marker that urls.json does not give, and names the page', () => {
    expect(() => replaceMarkers('a {{camera_url}} b', markers, 'guide/install.md')).toThrow(DocsError);
    expect(() => replaceMarkers('a {{camera_url}} b', markers, 'guide/install.md')).toThrow(
      /guide\/install\.md has the unknown marker \{\{camera_url\}\}/,
    );
  });

  it('fails on a marker with spaces or a hyphen, so a typo cannot reach the page', () => {
    expect(() => replaceMarkers('{{ platform_url }}', markers, 'guide/install.md')).toThrow(/unknown marker \{\{ platform_url \}\}/);
    expect(() => replaceMarkers('{{platform-url}}', markers, 'guide/install.md')).toThrow(/unknown marker \{\{platform-url\}\}/);
  });

  it('leaves the text unchanged when there is no urls.json', () => {
    expect(replaceMarkers('a {{camera_url}} {{platform_url}}', null, 'guide/install.md')).toBe(
      'a {{camera_url}} {{platform_url}}',
    );
  });
});

describe('pageSlug', () => {
  it('drops guide/ and .md', () => {
    expect(pageSlug('guide/install.md')).toBe('install');
    expect(pageSlug('guide/tutorial/01-cube.md')).toBe('tutorial/01-cube');
  });
});

describe('rewriteLinks', () => {
  const rewrite = (text: string, page = 'guide/install.md') => rewriteLinks(text, page, 'v0.2.0');

  it('points a link to a page at its route, with the anchor', () => {
    expect(rewrite('[calls](calls.md#launch)')).toBe('[calls](/projects/rocco/docs/calls/#launch)');
    expect(rewrite('[ch 1](tutorial/01-cube.md)')).toBe('[ch 1](/projects/rocco/docs/tutorial/01-cube/)');
    expect(rewrite('[back](../install.md)', 'guide/tutorial/01-cube.md')).toBe('[back](/projects/rocco/docs/install/)');
  });

  it('points a link to a guide folder at its index', () => {
    expect(rewrite('[tutorial](tutorial/)')).toBe('[tutorial](/projects/rocco/docs/tutorial/)');
    expect(rewrite('[all](../)', 'guide/tutorial/01-cube.md')).toBe('[all](/projects/rocco/docs/)');
  });

  it('points an image in guide/ at the copied file', () => {
    expect(rewrite('![cube](images/cube.png)')).toBe('![cube](/projects/rocco/docs/images/cube.png)');
    expect(rewrite('![cube](../images/cube.png "The cube")', 'guide/tutorial/01-cube.md')).toBe(
      '![cube](/projects/rocco/docs/images/cube.png "The cube")',
    );
  });

  it('points a link outside guide/ at the file on GitHub at the ref', () => {
    expect(rewrite('[cards](../examples/cards/main.roc#L3)')).toBe(`[cards](${BLOB}/examples/cards/main.roc#L3)`);
  });

  it('keeps URLs, absolute paths and anchors', () => {
    const text = '[a](https://roc-lang.org) [b](#install-roc) [c](/devlog/) [d](mailto:x@y.z)';
    expect(rewrite(text)).toBe(text);
  });

  it('rewrites reference definitions and HTML tags', () => {
    expect(rewrite('[calls]: calls.md')).toBe('[calls]: /projects/rocco/docs/calls/');
    expect(rewrite('<img src="images/cube.png" width="320" alt="cube">')).toBe(
      '<img src="/projects/rocco/docs/images/cube.png" width="320" alt="cube">',
    );
    expect(rewrite('<a href="calls.md">calls</a>')).toBe('<a href="/projects/rocco/docs/calls/">calls</a>');
  });

  it('leaves code blocks and code spans alone', () => {
    const text = '```md\n[calls](calls.md)\n```\n\nWrite `[calls](calls.md)` to link [calls](calls.md).\n~~~\n![x](images/x.png)\n~~~';
    expect(rewrite(text)).toBe(
      '```md\n[calls](calls.md)\n```\n\nWrite `[calls](calls.md)` to link [calls](/projects/rocco/docs/calls/).\n~~~\n![x](images/x.png)\n~~~',
    );
  });

  it('rewrites single-quoted HTML URLs and leaves footnotes alone', () => {
    expect(rewrite("<img src='images/cube.png'>")).toBe("<img src='/projects/rocco/docs/images/cube.png'>");
    expect(rewrite('[^1]: See calls.md')).toBe('[^1]: See calls.md');
  });

  it('leaves a fence inside a list item alone', () => {
    const text = '1. Run this:\n\n    ```md\n    [calls](calls.md)\n    ```\n';
    expect(rewrite(text)).toBe(text);
  });

  it('keeps a link that climbs out of the repository', () => {
    expect(rewrite('[up](../../x.md)')).toBe('[up](../../x.md)');
  });
});

describe('docsSections', () => {
  const page = (slug: string, title: string, order: number) => ({ slug, title, order });

  it('puts the guide first and sorts each folder by order', () => {
    const sections = docsSections([
      page('tutorial/02-keys', 'Keys', 2),
      page('scene', 'The Scene', 3),
      page('tutorial/01-cube', 'Cube', 1),
      page('install', 'Install', 1),
      page('calls', 'The five calls', 2),
    ]);
    expect(sections.map((s) => [s.folder, s.title, s.pages.map((p) => p.slug)])).toEqual([
      ['', 'Guide', ['install', 'calls', 'scene']],
      ['tutorial', 'Tutorial', ['tutorial/01-cube', 'tutorial/02-keys']],
    ]);
  });

  it('breaks an order tie by title', () => {
    const [guide] = docsSections([page('b', 'Beta', 1), page('a', 'Alpha', 1)]);
    expect(guide.pages.map((p) => p.title)).toEqual(['Alpha', 'Beta']);
  });
});
