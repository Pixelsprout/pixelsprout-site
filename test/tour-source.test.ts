import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { readRoccoSources } from '../src/lib/docs-source';
import type { FetchLike } from '../src/lib/github';

const API = 'https://api.github.com/repos/Pixelsprout/rocco-engine';
const LATEST = `${API}/releases/latest`;
const TREE = `${API}/git/trees/v0.2.0?recursive=1`;
const RELEASE = 'https://github.com/Pixelsprout/rocco-engine/releases/download/v0.2.0';
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`fixtures/${name}`, import.meta.url)));

type Route = { status: number; body: unknown };

function fakeFetch(routes: Record<string, Route>) {
  const calls: string[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push(url);
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

const release = (tour: Uint8Array | null) => ({
  [LATEST]: {
    status: 200,
    body: {
      tag_name: 'v0.2.0',
      assets: ['docs.tar.gz', ...(tour ? ['tour.tar.gz'] : [])].map((name) => ({ name, browser_download_url: `${RELEASE}/${name}` })),
    },
  },
  [TREE]: { status: 200, body: { truncated: false, tree: [{ path: 'guide/install.md', type: 'blob' }] } },
  'https://raw.githubusercontent.com/Pixelsprout/rocco-engine/v0.2.0/guide/install.md': { status: 200, body: '# Install' },
  [`${RELEASE}/docs.tar.gz`]: { status: 200, body: fixture('docs.tar.gz') },
  ...(tour ? { [`${RELEASE}/tour.tar.gz`]: { status: 200, body: tour } } : {}),
});

const text = (data: Uint8Array) => new TextDecoder().decode(data);

function tarOf(name: string, body: string): Uint8Array {
  const header = new Uint8Array(512);
  const put = (offset: number, value: string) => header.set(new TextEncoder().encode(value), offset);
  const data = new TextEncoder().encode(body);
  put(0, name);
  put(124, `${data.length.toString(8).padStart(11, '0')}\0`);
  put(156, '0');
  put(257, 'ustar\0');
  const padded = new Uint8Array(Math.ceil(data.length / 512) * 512);
  padded.set(data);
  return new Uint8Array(gzipSync(Buffer.concat([header, padded, new Uint8Array(1024)])));
}

describe('the Tour artifacts from the latest release', () => {
  it('unpacks tour.tar.gz from the same release response as docs.tar.gz and parses its manifest', async () => {
    const { fetch, calls } = fakeFetch(release(fixture('tour.tar.gz')));
    const { docs, tour } = await readRoccoSources({ fetch });
    if (tour.kind !== 'tour') throw new Error(`expected the Tour, got ${tour.reason}`);
    expect(docs.kind).toBe('docs');
    expect(calls.filter((url) => url === LATEST)).toHaveLength(1);
    expect(tour.origin).toBe('Pixelsprout/rocco-engine@v0.2.0');
    expect(tour.manifest).toEqual({ buildId: 'b7f3c2', tag: 'v0.2.0', rocNightly: 'nightly-2026-10-11-7d256b9' });
    expect(tour.files.map((f) => f.path)).toEqual(['manifest.json', 'preview/index.html', 'worker/compile.js', 'worker/compile.wasm']);
    expect(Array.from(tour.files[3].data)).toEqual([0, 97, 115, 109, 1, 0, 0, 0]);
    expect(text(tour.files[1].data)).toBe('<!doctype html>\n<p>preview</p>\n');
  });

  it('says the Tour is not available when the release has no tour.tar.gz, and still reads the docs', async () => {
    const { fetch } = fakeFetch(release(null));
    const { docs, tour } = await readRoccoSources({ fetch });
    expect(docs.kind).toBe('docs');
    expect(tour).toEqual({ kind: 'none', reason: 'the latest release v0.2.0 has no tour.tar.gz' });
  });

  it('says the Tour is not available when the repository has no release', async () => {
    const { fetch } = fakeFetch({ [LATEST]: { status: 404, body: {} } });
    const { tour } = await readRoccoSources({ fetch });
    expect(tour).toEqual({ kind: 'none', reason: 'Pixelsprout/rocco-engine has no release' });
  });

  it('fails on a tour.tar.gz that does not extract', async () => {
    const { fetch } = fakeFetch(release(new TextEncoder().encode('not a tarball')));
    await expect(readRoccoSources({ fetch })).rejects.toThrow(/The tour\.tar\.gz of v0\.2\.0 does not extract: /);
  });

  it('fails on a tour.tar.gz with no manifest.json', async () => {
    const { fetch } = fakeFetch(release(fixture('tour-no-manifest.tar.gz')));
    await expect(readRoccoSources({ fetch })).rejects.toThrow('There is no manifest.json in the tour.tar.gz of v0.2.0');
  });

  it('fails when the manifest tag differs from the release tag', async () => {
    const { fetch } = fakeFetch(release(fixture('tour-wrong-tag.tar.gz')));
    await expect(readRoccoSources({ fetch })).rejects.toThrow(
      'The manifest.json in the tour.tar.gz of v0.2.0 has the tag v0.1.0, not v0.2.0',
    );
  });

  it('fails on a manifest that is not JSON or lacks a field', async () => {
    for (const manifest of ['{ not json', JSON.stringify({ tag: 'v0.2.0', rocNightly: 'nightly-2026-10-11-7d256b9' })]) {
      const { fetch } = fakeFetch(release(tarOf('manifest.json', manifest)));
      await expect(readRoccoSources({ fetch })).rejects.toThrow(
        'The manifest.json in the tour.tar.gz of v0.2.0 is not an object with the strings buildId, tag and rocNightly',
      );
    }
  });
});

describe('the Tour artifacts from DOCS_SOURCE', () => {
  const CHECKOUT = new URL('fixtures/rocco', import.meta.url).pathname;

  const checkout = async (files: Record<string, string>) => {
    const dir = await mkdtemp(join(tmpdir(), 'tour-source-'));
    await mkdir(join(dir, 'guide'));
    for (const [path, body] of Object.entries(files)) {
      await mkdir(join(dir, path, '..'), { recursive: true });
      await writeFile(join(dir, path), body);
    }
    return dir;
  };

  it('reads build/tour/ from the checkout, with no fetch', async () => {
    const { fetch, calls } = fakeFetch({});
    const { tour } = await readRoccoSources({ source: CHECKOUT, fetch, requireToken: true });
    if (tour.kind !== 'tour') throw new Error(`expected the Tour, got ${tour.reason}`);
    expect(calls).toHaveLength(0);
    expect(tour.origin).toBe(`${CHECKOUT}/build/tour`);
    expect(tour.manifest).toEqual({ buildId: 'checkout-build', tag: 'v0.2.0-dev', rocNightly: 'nightly-2026-10-11-7d256b9' });
    expect(tour.files.map((f) => f.path)).toEqual(['manifest.json', 'preview/index.html']);
  });

  it('says the Tour is not available when the checkout has no build/tour/', async () => {
    const dir = await checkout({});
    const { tour } = await readRoccoSources({ source: dir });
    expect(tour).toEqual({ kind: 'none', reason: `${dir}/build/tour does not exist. Build the Tour artifacts in the checkout.` });
  });

  it('fails on a build/tour/ with no manifest.json', async () => {
    const dir = await checkout({ 'build/tour/preview/index.html': '<p>preview</p>' });
    await expect(readRoccoSources({ source: dir })).rejects.toThrow(`There is no manifest.json in ${dir}/build/tour`);
  });

  it('fails on a manifest tag that is not one safe folder name', async () => {
    const manifest = JSON.stringify({ buildId: 'b', tag: '../escape', rocNightly: 'n' });
    const dir = await checkout({ 'build/tour/manifest.json': manifest });
    await expect(readRoccoSources({ source: dir })).rejects.toThrow(
      `The manifest.json in ${dir}/build/tour has the tag ../escape, which is not a safe folder name`,
    );
  });
});
