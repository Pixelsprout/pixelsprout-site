import type { FileEntry } from './files';
import { deliverTour, type Compress } from './tour-delivery';
import { ARTIFACTS_LIST, TOUR_BASE } from './tour-paths.mjs';
import type { TourBuildInfo, TourSource } from './tour-source';

export { TOUR_BASE };
export const TOUR_UNAVAILABLE = 'The Tour is not available for this release';

export type Tour = { available: true; buildInfo: TourBuildInfo; base: string } | { available: false; message: string };

// The build deploys only the current tag, so a new release never mixes files with an old one.
const artifactsBase = (tag: string) => `${TOUR_BASE}_r/${tag}/`;

export async function tourSiteFiles(source: TourSource, compress: Compress): Promise<FileEntry[]> {
  if (source.kind === 'none') return [];
  const { tag } = source.buildInfo;
  const base = artifactsBase(tag);
  const { files, digests } = await deliverTour(source.files, compress);
  const list = JSON.stringify({ tag, base, files: digests }, null, 2);
  return [...files.map((file) => ({ path: base + file.path, data: file.data })), { path: ARTIFACTS_LIST, data: new TextEncoder().encode(list) }];
}

export function tourOf(buildInfo: TourBuildInfo | null): Tour {
  if (!buildInfo) return { available: false, message: TOUR_UNAVAILABLE };
  return { available: true, buildInfo, base: artifactsBase(buildInfo.tag) };
}
