import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { Markers } from './docs';
import {
  REPO,
  SourceError,
  apiError,
  assertToken,
  errorMessage,
  expandHome,
  fetchBytes,
  githubApi,
  rawUrl,
  requester,
  type FetchLike,
} from './github';
import { readTarGz, type TarFile } from './tar';

export type DocsFile = TarFile;

export type DocsSource =
  | { kind: 'none'; origin: string; reason: string }
  | { kind: 'docs'; origin: string; ref: string; guide: DocsFile[]; api: DocsFile[]; markers: Markers | null; notes: string[] };

export type DocsSourceOptions = {
  source?: string;
  token?: string;
  requireToken?: boolean;
  timeoutMs?: number;
  fetch?: FetchLike;
};

const DOCS_ASSET = 'docs.tar.gz';

const byPath = (a: DocsFile, b: DocsFile) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

async function readFolder(dir: string, prefix: string): Promise<DocsFile[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
      .map(async (entry) => {
        const path = join(entry.parentPath, entry.name);
        const name = relative(dir, path).split(sep).join('/');
        return { path: prefix ? `${prefix}/${name}` : name, data: new Uint8Array(await readFile(path)) };
      }),
  );
  return files.sort(byPath);
}

async function readCheckout(source: string): Promise<DocsSource> {
  const root = expandHome(source);
  let guide: DocsFile[];
  try {
    guide = await readFolder(join(root, 'guide'), 'guide');
  } catch (error) {
    throw new SourceError(`Cannot read DOCS_SOURCE ${join(source, 'guide')}: ${errorMessage(error)}`);
  }
  const api = await readFolder(join(root, 'build/docs'), '').catch(() => []);
  const notes = [`${source} is a checkout, not a release, so the markers stay unchanged`];
  if (api.length === 0) notes.push(`${join(source, 'build/docs')} has no API HTML. Run roc scripts/build.roc docs in the checkout.`);
  return { kind: 'docs', origin: source, ref: 'main', guide, api, markers: null, notes };
}

function parseMarkers(data: Uint8Array, tag: string): Markers {
  const markers: unknown = JSON.parse(new TextDecoder().decode(data));
  const valid =
    typeof markers === 'object' && markers !== null && Object.values(markers).every((value) => typeof value === 'string');
  if (!valid) throw new SourceError(`urls.json in the ${DOCS_ASSET} of ${tag} is not an object of strings`);
  return markers as Markers;
}

type Release = { tag_name?: unknown; assets?: { name?: unknown; browser_download_url?: unknown }[] };
type Tree = { truncated?: boolean; tree?: { path: string; type: string }[] };

// "latest" skips prereleases, so a release that failed its bundle test never feeds the site.
async function readRelease(options: DocsSourceOptions): Promise<DocsSource> {
  assertToken(options);
  const request = requester(options.fetch, options.timeoutMs);
  const get = githubApi(request, options.token);

  const latest = await get('releases/latest');
  if (latest.res.status === 404) return { kind: 'none', origin: REPO, reason: `${REPO} has no release` };
  if (!latest.res.ok) throw apiError(latest.url, latest.res.status);
  const { tag_name: tag, assets = [] } = (await latest.res.json()) as Release;
  if (typeof tag !== 'string') throw new SourceError(`GET ${latest.url} returned no tag_name`);
  const origin = `${REPO}@${tag}`;
  const download = assets.find((asset) => asset.name === DOCS_ASSET)?.browser_download_url;
  if (typeof download !== 'string') return { kind: 'none', origin, reason: `the latest release ${tag} has no ${DOCS_ASSET}` };

  const tree = await get(`git/trees/${encodeURIComponent(tag)}?recursive=1`);
  if (!tree.res.ok) throw apiError(tree.url, tree.res.status);
  const { truncated, tree: entries = [] } = (await tree.res.json()) as Tree;
  if (truncated) throw new SourceError(`GET ${tree.url}: the tree of ${tag} is truncated`);
  const paths = entries.filter((e) => e.type === 'blob' && e.path.startsWith('guide/')).map((e) => e.path);

  const [tarball, guide] = await Promise.all([
    fetchBytes(request, download),
    Promise.all(paths.map(async (path) => ({ path, data: await fetchBytes(request, rawUrl(encodeURIComponent(tag), encodeURI(path))) }))),
  ]);
  const files = readTarGz(tarball);
  const urls = files.find((file) => file.path === 'urls.json');
  if (!urls) throw new SourceError(`The ${DOCS_ASSET} of ${tag} has no urls.json`);
  return {
    kind: 'docs',
    origin,
    ref: tag,
    guide: guide.sort(byPath),
    api: files.filter((file) => file !== urls).sort(byPath),
    markers: parseMarkers(urls.data, tag),
    notes: [],
  };
}

export function readDocsSource(options: DocsSourceOptions = {}): Promise<DocsSource> {
  return options.source ? readCheckout(options.source) : readRelease(options);
}
