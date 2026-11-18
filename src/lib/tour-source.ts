import { REPO, SourceError, errorMessage, fetchBytes, type Request } from './github';
import { readTarGz, type TarFile } from './tar';

export const TOUR_ASSET = 'tour.tar.gz';

export type TourManifest = { buildId: string; tag: string; rocNightly: string };

export type TourSource =
  | { kind: 'none'; reason: string }
  | { kind: 'tour'; origin: string; manifest: TourManifest; files: TarFile[] };

const byPath = (a: TarFile, b: TarFile) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

// The engine owns the rest of the Tour artifacts, so the site parses only this file.
function readManifest(files: TarFile[], where: string): TourManifest {
  const file = files.find((f) => f.path === 'manifest.json');
  if (!file) throw new SourceError(`There is no manifest.json in ${where}`);
  let fields: Partial<Record<keyof TourManifest, unknown>> | null = null;
  try {
    fields = JSON.parse(new TextDecoder().decode(file.data));
  } catch {}
  const { buildId, tag, rocNightly } = fields ?? {};
  if (typeof buildId !== 'string' || typeof tag !== 'string' || typeof rocNightly !== 'string') {
    throw new SourceError(`The manifest.json in ${where} is not an object with the strings buildId, tag and rocNightly`);
  }
  return { buildId, tag, rocNightly };
}

export async function readReleaseTour(request: Request, tag: string, download: string | undefined): Promise<TourSource> {
  if (!download) return { kind: 'none', reason: `the latest release ${tag} has no ${TOUR_ASSET}` };
  const where = `the ${TOUR_ASSET} of ${tag}`;
  const tarball = await fetchBytes(request, download);
  let files: TarFile[];
  try {
    files = readTarGz(tarball).sort(byPath);
  } catch (error) {
    throw new SourceError(`The ${TOUR_ASSET} of ${tag} does not extract: ${errorMessage(error)}`);
  }
  const manifest = readManifest(files, where);
  if (manifest.tag !== tag) throw new SourceError(`The manifest.json in ${where} has the tag ${manifest.tag}, not ${tag}`);
  return { kind: 'tour', origin: `${REPO}@${tag}`, manifest, files };
}

export async function readTourCheckout(_source: string): Promise<TourSource> {
  return { kind: 'none', reason: 'not built yet' };
}
