import { join } from 'node:path';
import type { Markers } from './docs';
import { byPath, readFolder } from './files';
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
  type ApiGet,
  type FetchLike,
  type Request,
} from './github';
import { readTarGz, type TarFile } from './tar';
import { TOUR_ASSET, readReleaseTour, readTourCheckout, type TourSource } from './tour-source';

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

type Asset = { name?: unknown; browser_download_url?: unknown };
type Release = { tag_name?: unknown; assets?: Asset[] };
type Tree = { truncated?: boolean; tree?: { path: string; type: string }[] };

const assetUrl = (assets: Asset[], name: string) => {
  const url = assets.find((asset) => asset.name === name)?.browser_download_url;
  return typeof url === 'string' ? url : undefined;
};

async function readReleaseDocs(request: Request, get: ApiGet, tag: string, download: string | undefined): Promise<DocsSource> {
  const origin = `${REPO}@${tag}`;
  if (!download) return { kind: 'none', origin, reason: `the latest release ${tag} has no ${DOCS_ASSET}` };

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

// "latest" skips prereleases, so a release that failed its bundle test never feeds the site.
async function readRelease(options: DocsSourceOptions): Promise<RoccoSources> {
  assertToken(options);
  const request = requester(options.fetch, options.timeoutMs);
  const get = githubApi(request, options.token);

  const latest = await get('releases/latest');
  if (latest.res.status === 404) {
    const reason = `${REPO} has no release`;
    return { docs: { kind: 'none', origin: REPO, reason }, tour: { kind: 'none', reason } };
  }
  if (!latest.res.ok) throw apiError(latest.url, latest.res.status);
  const { tag_name: tag, assets = [] } = (await latest.res.json()) as Release;
  if (typeof tag !== 'string') throw new SourceError(`GET ${latest.url} returned no tag_name`);
  const [docs, tour] = await Promise.all([
    readReleaseDocs(request, get, tag, assetUrl(assets, DOCS_ASSET)),
    readReleaseTour(request, tag, assetUrl(assets, TOUR_ASSET)),
  ]);
  return { docs, tour };
}

export type RoccoSources = { docs: DocsSource; tour: TourSource };

export async function readRoccoSources(options: DocsSourceOptions = {}): Promise<RoccoSources> {
  if (!options.source) return readRelease(options);
  return { docs: await readCheckout(options.source), tour: await readTourCheckout(options.source) };
}

export async function readDocsSource(options: DocsSourceOptions = {}): Promise<DocsSource> {
  return (await readRoccoSources(options)).docs;
}
