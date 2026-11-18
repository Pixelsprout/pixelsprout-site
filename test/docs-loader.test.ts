import { readFileSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Loader, LoaderContext } from 'astro/loaders';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { docsLoader } from '../src/loaders/docs';

const LATEST = 'https://api.github.com/repos/Pixelsprout/rocco-engine/releases/latest';
const TOUR = 'https://github.com/Pixelsprout/rocco-engine/releases/download/v0.2.0/tour.tar.gz';
const TOUR_TARBALL = new Uint8Array(readFileSync(new URL('fixtures/tour.tar.gz', import.meta.url)));

function stubFetch(routes: Record<string, unknown>) {
  vi.stubGlobal('fetch', async (url: string) => {
    if (!(url in routes)) throw new Error(`boom: ${url}`);
    const body = routes[url];
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => String(body),
      arrayBuffer: async () => (body as Uint8Array).slice().buffer,
    };
  });
}

// Reads the flat `key: value` front matter of the fixture pages, as Astro's YAML would.
function frontmatter(text: string) {
  const block = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
  return Object.fromEntries(
    block.split('\n').map((line) => {
      const [key, ...rest] = line.split(':');
      const value = rest.join(':').trim().replace(/^"(.*)"$/, '$1');
      return [key, /^\d+$/.test(value) ? Number(value) : value];
    }),
  );
}

// Holds only the context fields the docs loader reads, so a new field it reads must be added here.
async function runLoader(loader: Loader) {
  const cacheDir = pathToFileURL(`${await mkdtemp(join(tmpdir(), 'docs-loader-'))}/`);
  const entries = new Map<string, unknown>();
  const context = {
    store: { clear: () => entries.clear(), set: ({ id, data }: { id: string; data: unknown }) => entries.set(id, data) },
    parseData: async ({ data }: { data: unknown }) => data,
    renderMarkdown: async (text: string) => ({ html: text, metadata: { frontmatter: frontmatter(text) } }),
    generateDigest: (text: string) => String(text.length),
    logger: { info: () => {}, warn: () => {} },
    config: { cacheDir, root: new URL('../', import.meta.url) },
  };
  await loader.load(context as unknown as LoaderContext);
  return { files: new URL('rocco-docs/', cacheDir), entries };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('docsLoader with a release that has a tour.tar.gz', () => {
  it('writes the Tour artifacts at /projects/rocco/tour/_r/<tag>/ and stores the build info', async () => {
    vi.stubEnv('DOCS_SOURCE', '');
    vi.stubEnv('VERCEL', '');
    stubFetch({
      [LATEST]: { tag_name: 'v0.2.0', assets: [{ name: 'tour.tar.gz', browser_download_url: TOUR }] },
      [TOUR]: TOUR_TARBALL,
    });

    const { files, entries } = await runLoader(docsLoader());

    const site = (path: string) => readFile(new URL(`projects/rocco/tour/_r/v0.2.0/${path}`, files));
    expect(JSON.parse((await site('manifest.json')).toString()).buildId).toBe('b7f3c2');
    expect((await site('preview/index.html')).toString()).toBe('<!doctype html>\n<p>preview</p>\n');
    expect(Array.from(await site('worker/compile.wasm'))).toEqual([0, 97, 115, 109, 1, 0, 0, 0]);
    expect(entries.get('#source')).toMatchObject({
      tour: { buildId: 'b7f3c2', tag: 'v0.2.0', rocNightly: 'nightly-2026-10-11-7d256b9' },
    });
  });
});

describe('docsLoader with a checkout that has Tour artifacts', () => {
  it('stores one Tour step per Tutorial page, with its lesson, starting source and answer', async () => {
    vi.stubEnv('DOCS_SOURCE', new URL('fixtures/rocco', import.meta.url).pathname);

    const { entries } = await runLoader(docsLoader());

    const step = entries.get('#tour/01-cube') as Record<string, unknown>;
    expect(step).toMatchObject({ kind: 'step', slug: '01-cube', title: 'A window, a camera and a cube', order: 1 });
    expect(step.start).toBe(readFileSync(new URL('fixtures/rocco/examples/tutorial/00-start/main.roc', import.meta.url), 'utf8'));
    expect(step.answer).toBe(readFileSync(new URL('fixtures/rocco/examples/tutorial/01-cube/main.roc', import.meta.url), 'utf8'));
    expect([...entries.keys()].filter((id) => id.startsWith('#tour/'))).toEqual(['#tour/01-cube']);
  });

  it('stores no Tour steps when there are no Tour artifacts', async () => {
    vi.stubEnv('DOCS_SOURCE', '');
    vi.stubEnv('VERCEL', '');
    stubFetch({ [LATEST]: { tag_name: 'v0.2.0', assets: [] } });

    const { entries } = await runLoader(docsLoader());

    expect([...entries.keys()].filter((id) => id.startsWith('#tour/'))).toEqual([]);
  });
});
