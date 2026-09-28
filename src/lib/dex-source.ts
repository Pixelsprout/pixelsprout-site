import { readFile as readFileFromDisk } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DexError } from './dex';

const REPO = 'Pixelsprout/rocco-engine';
const LOG_PATH = '.dex/tasks.jsonl';

type FetchResponse = { ok: boolean; status: number; text(): Promise<string>; json(): Promise<unknown> };
export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<FetchResponse>;

export type DexSourceOptions = {
  source?: string;
  token?: string;
  requireToken?: boolean;
  fetch?: FetchLike;
  readFile?: (path: string) => Promise<string>;
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function request(fetcher: FetchLike, url: string, headers?: Record<string, string>): Promise<FetchResponse> {
  try {
    return await fetcher(url, { headers });
  } catch (error) {
    throw new DexError(`Fetching ${url} failed: ${message(error)}`);
  }
}

async function fetchText(fetcher: FetchLike, url: string): Promise<string> {
  const res = await request(fetcher, url);
  if (!res.ok) throw new DexError(`${url} returned ${res.status}`);
  return res.text();
}

async function readPath(readFile: (path: string) => Promise<string>, source: string): Promise<string> {
  const path = source.startsWith('~/') ? join(homedir(), source.slice(2)) : source;
  try {
    return await readFile(path);
  } catch (error) {
    throw new DexError(`Cannot read DEX_SOURCE ${source}: ${message(error)}`);
  }
}

export async function readDexSource(options: DexSourceOptions = {}): Promise<{ text: string; origin: string }> {
  const fetcher = options.fetch ?? (globalThis.fetch as unknown as FetchLike);
  const readFile = options.readFile ?? ((path: string) => readFileFromDisk(path, 'utf8'));

  if (options.source) {
    const text = /^https?:\/\//.test(options.source)
      ? await fetchText(fetcher, options.source)
      : await readPath(readFile, options.source);
    return { text, origin: options.source };
  }

  // Vercel build machines share outgoing IPs, so the 60 requests an hour for unauthenticated calls runs out.
  if (options.requireToken && !options.token) {
    throw new DexError('GITHUB_TOKEN is required on Vercel. Add a fine-grained token with no permissions to the project.');
  }

  // A branch URL on raw.githubusercontent.com is cached for up to 5 minutes; a commit URL is not stale.
  const api = `https://api.github.com/repos/${REPO}/commits/main`;
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const res = await request(fetcher, api, headers);
  if (!res.ok) {
    const hint = res.status === 403 || res.status === 429 ? ' Set GITHUB_TOKEN to raise the rate limit.' : '';
    throw new DexError(`GET ${api} returned ${res.status}.${hint}`);
  }
  const { sha } = (await res.json()) as { sha?: unknown };
  if (typeof sha !== 'string') throw new DexError(`GET ${api} returned no commit sha`);

  const text = await fetchText(fetcher, `https://raw.githubusercontent.com/${REPO}/${sha}/${LOG_PATH}`);
  return { text, origin: `${REPO}@${sha.slice(0, 7)}` };
}
