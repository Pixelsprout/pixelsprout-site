import { readFile as readFileFromDisk } from 'node:fs/promises';
import {
  REPO,
  SourceError,
  apiError,
  assertToken,
  errorMessage,
  expandHome,
  fetchText,
  githubApi,
  rawUrl,
  requester,
  type FetchLike,
} from './github';

export type { FetchLike };

const LOG_PATH = '.dex/tasks.jsonl';

export type DexSourceOptions = {
  source?: string;
  token?: string;
  requireToken?: boolean;
  timeoutMs?: number;
  fetch?: FetchLike;
  readFile?: (path: string) => Promise<string>;
};

async function readPath(readFile: (path: string) => Promise<string>, source: string): Promise<string> {
  try {
    return await readFile(expandHome(source));
  } catch (error) {
    throw new SourceError(`Cannot read DEX_SOURCE ${source}: ${errorMessage(error)}`);
  }
}

export async function readDexSource(options: DexSourceOptions = {}): Promise<{ text: string; origin: string }> {
  const readFile = options.readFile ?? ((path: string) => readFileFromDisk(path, 'utf8'));
  const request = requester(options.fetch, options.timeoutMs);

  if (options.source) {
    const text = /^https?:\/\//.test(options.source)
      ? await fetchText(request, options.source)
      : await readPath(readFile, options.source);
    return { text, origin: options.source };
  }

  assertToken(options);

  // A branch URL on raw.githubusercontent.com is cached for up to 5 minutes; a commit URL is not stale.
  const { url, res } = await githubApi(request, options.token)('commits/main');
  if (!res.ok) throw apiError(url, res.status);
  const { sha } = (await res.json()) as { sha?: unknown };
  if (typeof sha !== 'string') throw new SourceError(`GET ${url} returned no commit sha`);

  const text = await fetchText(request, rawUrl(sha, LOG_PATH));
  return { text, origin: `${REPO}@${sha.slice(0, 7)}` };
}
