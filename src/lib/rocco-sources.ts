import { DOCS_ASSET, readDocsCheckout, readReleaseDocs, type DocsSource } from './docs-source';
import { REPO, SourceError, apiError, assertToken, githubApi, requester, type FetchLike } from './github';
import { TOUR_ASSET, readReleaseTour, readTourCheckout, type TourSource } from './tour-source';

export type RoccoSources = { docs: DocsSource; tour: TourSource };

export type RoccoSourcesOptions = {
  source?: string;
  token?: string;
  requireToken?: boolean;
  timeoutMs?: number;
  fetch?: FetchLike;
};

type Asset = { name?: unknown; browser_download_url?: unknown };
type Release = { tag_name?: unknown; assets?: Asset[] };

const assetUrl = (assets: Asset[], name: string) => {
  const url = assets.find((asset) => asset.name === name)?.browser_download_url;
  return typeof url === 'string' ? url : undefined;
};

// "latest" skips prereleases, so a release that failed its bundle test never feeds the site.
async function readRelease(options: RoccoSourcesOptions): Promise<RoccoSources> {
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

async function readCheckout(source: string): Promise<RoccoSources> {
  const [docs, tour] = await Promise.all([readDocsCheckout(source), readTourCheckout(source)]);
  return { docs, tour };
}

export async function readRoccoSources(options: RoccoSourcesOptions = {}): Promise<RoccoSources> {
  return options.source ? readCheckout(options.source) : readRelease(options);
}
