import { join } from 'node:path';
import type { Markers } from './docs';
import { byPath, readFolder, type FileEntry } from './files';
import {
  REPO,
  SourceError,
  apiError,
  errorMessage,
  expandHome,
  fetchBytes,
  rawUrl,
  type ApiGet,
  type Request,
} from './github';
import { readTarGz } from './tar';

export type DocsSource =
  | { kind: 'none'; origin: string; reason: string }
  | { kind: 'docs'; origin: string; ref: string; guide: FileEntry[]; api: FileEntry[]; markers: Markers | null; notes: string[] };

export const DOCS_ASSET = 'docs.tar.gz';

export async function readDocsCheckout(source: string): Promise<DocsSource> {
  const root = expandHome(source);
  let guide: FileEntry[];
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

type Tree = { truncated?: boolean; tree?: { path: string; type: string }[] };

export async function readReleaseDocs(request: Request, get: ApiGet, tag: string, download: string | undefined): Promise<DocsSource> {
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
