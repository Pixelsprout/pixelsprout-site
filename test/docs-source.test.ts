import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readDocsSource } from '../src/lib/docs-source';
import type { FetchLike } from '../src/lib/github';

const API = 'https://api.github.com/repos/Pixelsprout/rocco-engine';
const LATEST = `${API}/releases/latest`;
const TREE = `${API}/git/trees/v0.2.0?recursive=1`;
const RAW = 'https://raw.githubusercontent.com/Pixelsprout/rocco-engine/v0.2.0';
const DOWNLOAD = 'https://github.com/Pixelsprout/rocco-engine/releases/download/v0.2.0/docs.tar.gz';
const TARBALL = readFileSync(new URL('fixtures/docs.tar.gz', import.meta.url));
const CHECKOUT = new URL('fixtures/rocco', import.meta.url).pathname;

type Route = { status: number; body: unknown };
type Call = { url: string; headers?: Record<string, string> };

function fakeFetch(routes: Record<string, Route>) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: init?.headers });
    const route = routes[url];
    if (!route) throw new Error(`boom: ${url}`);
    const bytes = route.body instanceof Uint8Array ? route.body : new TextEncoder().encode(String(route.body));
    return {
      ok: route.status >= 200 && route.status < 300,
      status: route.status,
      text: async () => String(route.body),
      json: async () => route.body,
      arrayBuffer: async () => bytes.slice().buffer,
    };
  };
  return { fetch, calls };
}

const latest = (assets: string[]): Route => ({
  status: 200,
  body: {
    tag_name: 'v0.2.0',
    assets: assets.map((name) => ({ name, browser_download_url: `https://github.com/Pixelsprout/rocco-engine/releases/download/v0.2.0/${name}` })),
  },
});

const release = () => ({
  [LATEST]: latest(['platform-abc.tar.zst', 'docs.tar.gz']),
  [TREE]: {
    status: 200,
    body: {
      truncated: false,
      tree: [
        { path: 'README.md', type: 'blob' },
        { path: 'guide', type: 'tree' },
        { path: 'guide/install.md', type: 'blob' },
        { path: 'guide/images/cube.png', type: 'blob' },
      ],
    },
  },
  [`${RAW}/guide/install.md`]: { status: 200, body: '# Install' },
  [`${RAW}/guide/images/cube.png`]: { status: 200, body: new Uint8Array([137, 80, 78, 71]) },
  [DOWNLOAD]: { status: 200, body: new Uint8Array(TARBALL) },
});

const text = (data: Uint8Array) => new TextDecoder().decode(data);

describe('readDocsSource from the latest release', () => {
  it('reads guide/ at the latest release tag and unpacks its docs.tar.gz', async () => {
    const { fetch } = fakeFetch(release());
    const source = await readDocsSource({ fetch });
    if (source.kind !== 'docs') throw new Error(`expected docs, got ${source.reason}`);
    expect(source.ref).toBe('v0.2.0');
    expect(source.origin).toBe('Pixelsprout/rocco-engine@v0.2.0');
    expect(source.guide.map((f) => f.path)).toEqual(['guide/images/cube.png', 'guide/install.md']);
    expect(text(source.guide[1].data)).toBe('# Install');
    expect(Array.from(source.guide[0].data)).toEqual([137, 80, 78, 71]);
    expect(source.markers).toMatchObject({
      platform_url: 'https://github.com/Pixelsprout/rocco-engine/releases/download/v9.9.9/platform-abc.tar.zst',
      roc_nightly: 'nightly-2026-10-11-7d256b9',
    });
    const api = source.api.map((f) => f.path);
    expect(api).toContain('platform/index.html');
    expect(api).toContain('platform/Config/index.html');
    expect(api).toContain('ui/AVeryLongModuleNameThatPushesThePathOverTheOneHundredCharacterLimitOfTheUstarNameFieldByFar/index.html');
    expect(api).not.toContain('urls.json');
    expect(text(source.api.find((f) => f.path === 'platform/styles.css')!.data)).toBe(':root { --body-bg-color: #ffffff; }\n');
  });

  it('sends GITHUB_TOKEN to the API calls only', async () => {
    const { fetch, calls } = fakeFetch(release());
    await readDocsSource({ fetch, token: 't0k' });
    const auth = Object.fromEntries(calls.map((c) => [c.url, c.headers?.Authorization]));
    expect(auth[LATEST]).toBe('Bearer t0k');
    expect(auth[TREE]).toBe('Bearer t0k');
    expect(auth[DOWNLOAD]).toBeUndefined();
    expect(auth[`${RAW}/guide/install.md`]).toBeUndefined();
  });

  it('says that no release has docs when the repository has no release', async () => {
    const { fetch } = fakeFetch({ [LATEST]: { status: 404, body: {} } });
    expect(await readDocsSource({ fetch })).toEqual({
      kind: 'none',
      origin: 'Pixelsprout/rocco-engine',
      reason: 'Pixelsprout/rocco-engine has no release',
    });
  });

  it('says that no release has docs when the latest release has no docs.tar.gz', async () => {
    const { fetch, calls } = fakeFetch({ [LATEST]: latest(['platform-abc.tar.zst']) });
    expect(await readDocsSource({ fetch })).toEqual({
      kind: 'none',
      origin: 'Pixelsprout/rocco-engine@v0.2.0',
      reason: 'the latest release v0.2.0 has no docs.tar.gz',
    });
    expect(calls).toHaveLength(1);
  });

  it('names GITHUB_TOKEN when the API refuses with 403', async () => {
    const { fetch } = fakeFetch({ [LATEST]: { status: 403, body: {} } });
    await expect(readDocsSource({ fetch })).rejects.toThrow(/releases\/latest returned 403\. Set GITHUB_TOKEN/);
  });

  it('fails when the tree at the tag is truncated', async () => {
    const routes = { ...release(), [TREE]: { status: 200, body: { truncated: true, tree: [] } } };
    const { fetch } = fakeFetch(routes);
    await expect(readDocsSource({ fetch })).rejects.toThrow(/tree of v0\.2\.0 is truncated/);
  });

  it('names the URL when a guide file fetch fails', async () => {
    const routes = { ...release(), [`${RAW}/guide/install.md`]: { status: 404, body: '' } };
    const { fetch } = fakeFetch(routes);
    await expect(readDocsSource({ fetch })).rejects.toThrow(`${RAW}/guide/install.md returned 404`);
  });

  it('fails before any fetch when a token is required and missing', async () => {
    const { fetch, calls } = fakeFetch({});
    await expect(readDocsSource({ fetch, requireToken: true })).rejects.toThrow(/GITHUB_TOKEN is required on Vercel/);
    expect(calls).toHaveLength(0);
  });
});

describe('readDocsSource from DOCS_SOURCE', () => {
  it('reads guide/ and build/docs/ from a checkout, with no fetch and no markers', async () => {
    const { fetch, calls } = fakeFetch({});
    const source = await readDocsSource({ source: CHECKOUT, fetch, requireToken: true });
    if (source.kind !== 'docs') throw new Error(`expected docs, got ${source.reason}`);
    expect(calls).toHaveLength(0);
    expect(source.origin).toBe(CHECKOUT);
    expect(source.ref).toBe('main');
    expect(source.markers).toBeNull();
    expect(source.guide.map((f) => f.path)).toEqual([
      'guide/calls.md',
      'guide/images/cube.png',
      'guide/install.md',
      'guide/tutorial/01-cube.md',
    ]);
    expect(source.api.map((f) => f.path)).toEqual(['platform/index.html', 'platform/styles.css']);
    expect(source.notes).toEqual([`${CHECKOUT} is a checkout, not a release, so the markers stay unchanged`]);
  });

  it('notes a checkout with no API HTML', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'docs-source-'));
    await mkdir(join(dir, 'guide'));
    await writeFile(join(dir, 'guide/install.md'), '# Install');
    const source = await readDocsSource({ source: dir });
    if (source.kind !== 'docs') throw new Error(`expected docs, got ${source.reason}`);
    expect(source.api).toEqual([]);
    expect(source.notes).toContain(`${dir}/build/docs has no API HTML. Run roc scripts/build.roc docs in the checkout.`);
  });

  it('fails on a checkout with no guide/ folder', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'docs-source-'));
    await expect(readDocsSource({ source: dir })).rejects.toThrow(`Cannot read DOCS_SOURCE ${dir}/guide`);
  });
});
