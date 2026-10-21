import { homedir } from 'node:os';
import { join } from 'node:path';

export const REPO = 'Pixelsprout/rocco-engine';
const API = `https://api.github.com/repos/${REPO}`;

export class SourceError extends Error {
  override name = 'SourceError';
}

type FetchResponse = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
};
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<FetchResponse>;

export type Request = (url: string, headers?: Record<string, string>) => Promise<FetchResponse>;

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function requester(fetcher: FetchLike = globalThis.fetch as unknown as FetchLike, timeoutMs = 15_000): Request {
  return async (url, headers) => {
    try {
      return await fetcher(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      const reason = error instanceof Error && error.name === 'TimeoutError' ? `timed out after ${timeoutMs}ms` : errorMessage(error);
      throw new SourceError(`Fetching ${url} failed: ${reason}`);
    }
  };
}

async function checked(request: Request, url: string) {
  const res = await request(url);
  if (!res.ok) throw new SourceError(`${url} returned ${res.status}`);
  return res;
}

export const fetchText = async (request: Request, url: string) => (await checked(request, url)).text();

export const fetchBytes = async (request: Request, url: string) => new Uint8Array(await (await checked(request, url)).arrayBuffer());

export const rawUrl = (ref: string, path: string) => `https://raw.githubusercontent.com/${REPO}/${ref}/${path}`;

export function expandHome(path: string): string {
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path;
}

// Vercel build machines share outgoing IPs, so the 60 requests an hour for unauthenticated calls runs out.
export function assertToken(options: { token?: string; requireToken?: boolean }) {
  if (options.requireToken && !options.token) {
    throw new SourceError('GITHUB_TOKEN is required on Vercel. Add a fine-grained token with no permissions to the project.');
  }
}

export type ApiGet = (path: string) => Promise<{ url: string; res: FetchResponse }>;

export function githubApi(request: Request, token?: string): ApiGet {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return async (path) => {
    const url = `${API}/${path}`;
    return { url, res: await request(url, headers) };
  };
}

export function apiError(url: string, status: number): SourceError {
  const hint = status === 403 || status === 429 ? ' Set GITHUB_TOKEN to raise the rate limit.' : '';
  return new SourceError(`GET ${url} returned ${status}.${hint}`);
}
