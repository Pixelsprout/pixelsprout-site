import type { TarFile } from './tar';
import type { TourBuildInfo, TourSource } from './tour-source';

export const TOUR_BASE = '/projects/rocco/tour/';
export const TOUR_UNAVAILABLE = 'The Tour is not available for this release';

export type Tour = { available: true; buildInfo: TourBuildInfo; base: string } | { available: false; message: string };

// The build deploys only the current tag, so a new release never mixes files with an old one.
const artifactsBase = (tag: string) => `${TOUR_BASE}_r/${tag}/`;

export function tourSiteFiles(source: TourSource): TarFile[] {
  if (source.kind === 'none') return [];
  const base = artifactsBase(source.buildInfo.tag);
  return source.files.map((file) => ({ path: base + file.path, data: file.data }));
}

export function tourOf(buildInfo: TourBuildInfo | null): Tour {
  if (!buildInfo) return { available: false, message: TOUR_UNAVAILABLE };
  return { available: true, buildInfo, base: artifactsBase(buildInfo.tag) };
}
