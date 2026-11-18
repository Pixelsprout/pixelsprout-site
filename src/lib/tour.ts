import type { TarFile } from './tar';
import type { TourManifest, TourSource } from './tour-source';

export const TOUR_BASE = '/projects/rocco/tour/';
export const TOUR_UNAVAILABLE = 'The Tour is not available for this release';

export type Tour = { available: true; manifest: TourManifest; base: string } | { available: false; message: string };

// The build deploys only the current tag, so a new release never mixes files with an old one.
const artifactsBase = (tag: string) => `${TOUR_BASE}_r/${tag}/`;

export function tourSiteFiles(source: TourSource): TarFile[] {
  if (source.kind === 'none') return [];
  const base = artifactsBase(source.manifest.tag);
  return source.files.map((file) => ({ path: base + file.path, data: file.data }));
}

export function tourOf(manifest: TourManifest | null): Tour {
  if (!manifest) return { available: false, message: TOUR_UNAVAILABLE };
  return { available: true, manifest, base: artifactsBase(manifest.tag) };
}
