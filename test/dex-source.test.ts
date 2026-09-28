import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readDexSource, type FetchLike } from '../src/lib/dex-source';

const API = 'https://api.github.com/repos/Pixelsprout/rocco-engine/commits/main';
const SHA = 'abc1234def5678abc1234def5678abc1234def56';
const RAW = `https://raw.githubusercontent.com/Pixelsprout/rocco-engine/${SHA}/.dex/tasks.jsonl`;

type Call = { url: string; headers?: Record<string, string> };

function fakeFetch(routes: Record<string, { status: number; body: unknown }>) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: init?.headers });
    const route = routes[url];
    if (!route) throw new Error(`boom: ${url}`);
    return {
      ok: route.status >= 200 && route.status < 300,
      status: route.status,
      text: async () => String(route.body),
      json: async () => route.body,
    };
  };
  return { fetch, calls };
}

describe('readDexSource', () => {
  it('pins the raw fetch to the latest main commit', async () => {
    const { fetch, calls } = fakeFetch({ [API]: { status: 200, body: { sha: SHA } }, [RAW]: { status: 200, body: 'LOG' } });
    const result = await readDexSource({ fetch });
    expect(result).toEqual({ text: 'LOG', origin: 'Pixelsprout/rocco-engine@abc1234' });
    expect(calls.map((c) => c.url)).toEqual([API, RAW]);
    expect(calls[0].headers?.Accept).toBe('application/vnd.github+json');
    expect(calls[0].headers?.Authorization).toBeUndefined();
  });

  it('sends GITHUB_TOKEN as a bearer token', async () => {
    const { fetch, calls } = fakeFetch({ [API]: { status: 200, body: { sha: SHA } }, [RAW]: { status: 200, body: 'LOG' } });
    await readDexSource({ fetch, token: 't0k' });
    expect(calls[0].headers?.Authorization).toBe('Bearer t0k');
  });

  it('names GITHUB_TOKEN when the API refuses with 403', async () => {
    const { fetch } = fakeFetch({ [API]: { status: 403, body: {} } });
    await expect(readDexSource({ fetch })).rejects.toThrow(/returned 403\. Set GITHUB_TOKEN/);
  });

  it('fails when the API returns no sha', async () => {
    const { fetch } = fakeFetch({ [API]: { status: 200, body: {} } });
    await expect(readDexSource({ fetch })).rejects.toThrow(/no commit sha/);
  });

  it('names the raw URL and status when the file fetch fails', async () => {
    const { fetch } = fakeFetch({ [API]: { status: 200, body: { sha: SHA } }, [RAW]: { status: 404, body: '' } });
    await expect(readDexSource({ fetch })).rejects.toThrow(`${RAW} returned 404`);
  });

  it('wraps network errors with the URL', async () => {
    const { fetch } = fakeFetch({});
    await expect(readDexSource({ fetch })).rejects.toThrow(`Fetching ${API} failed: boom`);
  });

  it('fetches a DEX_SOURCE URL directly', async () => {
    const url = 'https://example.com/tasks.jsonl';
    const { fetch, calls } = fakeFetch({ [url]: { status: 200, body: 'LOG' } });
    expect(await readDexSource({ fetch, source: url })).toEqual({ text: 'LOG', origin: url });
    expect(calls.map((c) => c.url)).toEqual([url]);
  });

  it('reads a DEX_SOURCE path and expands ~', async () => {
    const seen: string[] = [];
    const readFile = async (path: string) => { seen.push(path); return 'LOG'; };
    await readDexSource({ source: '~/rocco/.dex/tasks.jsonl', readFile });
    expect(seen).toEqual([join(homedir(), 'rocco/.dex/tasks.jsonl')]);
  });

  it('names the path when a DEX_SOURCE file cannot be read', async () => {
    const readFile = async () => { throw new Error('ENOENT'); };
    await expect(readDexSource({ source: './missing.jsonl', readFile })).rejects.toThrow(
      /Cannot read DEX_SOURCE \.\/missing\.jsonl: ENOENT/,
    );
  });

  it('fails before any fetch when a token is required and missing', async () => {
    const { fetch, calls } = fakeFetch({});
    await expect(readDexSource({ fetch, requireToken: true })).rejects.toThrow(
      /GITHUB_TOKEN is required on Vercel/,
    );
    expect(calls).toHaveLength(0);
  });

  it('does not require a token when DEX_SOURCE is set', async () => {
    const readFile = async () => 'LOG';
    await expect(readDexSource({ source: './x.jsonl', readFile, requireToken: true })).resolves.toEqual({
      text: 'LOG',
      origin: './x.jsonl',
    });
  });
});
