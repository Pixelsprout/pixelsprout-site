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

// Holds only the context fields the docs loader reads, so a new field it reads must be added here.
async function runLoader(loader: Loader) {
  const cacheDir = pathToFileURL(`${await mkdtemp(join(tmpdir(), 'docs-loader-'))}/`);
  const entries = new Map<string, unknown>();
  const context = {
    store: { clear: () => entries.clear(), set: ({ id, data }: { id: string; data: unknown }) => entries.set(id, data) },
    parseData: async ({ data }: { data: unknown }) => data,
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
