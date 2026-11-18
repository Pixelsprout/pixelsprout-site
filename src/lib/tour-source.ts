import { join } from 'node:path';
import { z } from 'astro/zod';
import { byPath, exists, readFolder, type FileEntry } from './files';
import { REPO, SourceError, errorMessage, expandHome, fetchBytes, type Release } from './github';
import { readTarGz } from './tar';

export const TOUR_ASSET = 'tour.tar.gz';

export const tourBuildInfoSchema = z.object({ buildId: z.string(), tag: z.string(), rocNightly: z.string() });

export type TourBuildInfo = z.infer<typeof tourBuildInfoSchema>;

export type TourSource =
  | { kind: 'none'; reason: string }
  | { kind: 'tour'; origin: string; buildInfo: TourBuildInfo; files: FileEntry[] };

// The tag names a folder on the site, /projects/rocco/tour/_r/<tag>/.
const SAFE_TAG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// The engine owns the rest of the Tour artifacts, so the site parses only manifest.json.
function readBuildInfo(files: FileEntry[], where: string): TourBuildInfo {
  const file = files.find((f) => f.path === 'manifest.json');
  if (!file) throw new SourceError(`There is no manifest.json in ${where}`);
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(file.data));
  } catch {}
  const parsed = tourBuildInfoSchema.safeParse(json);
  if (!parsed.success) {
    throw new SourceError(`The manifest.json in ${where} is not an object with the strings buildId, tag and rocNightly`);
  }
  const { tag } = parsed.data;
  if (!SAFE_TAG.test(tag)) throw new SourceError(`The manifest.json in ${where} has the tag ${tag}, which is not a safe folder name`);
  return parsed.data;
}

export async function readReleaseTour({ request, tag, download: asset }: Release): Promise<TourSource> {
  const download = asset(TOUR_ASSET);
  if (!download) return { kind: 'none', reason: `the latest release ${tag} has no ${TOUR_ASSET}` };
  const where = `the ${TOUR_ASSET} of ${tag}`;
  const tarball = await fetchBytes(request, download);
  let files: FileEntry[];
  try {
    files = readTarGz(tarball).sort(byPath);
  } catch (error) {
    throw new SourceError(`Cannot extract ${where}: ${errorMessage(error)}`);
  }
  const buildInfo = readBuildInfo(files, where);
  if (buildInfo.tag !== tag) throw new SourceError(`The manifest.json in ${where} has the tag ${buildInfo.tag}, not ${tag}`);
  return { kind: 'tour', origin: `${REPO}@${tag}`, buildInfo, files };
}

export async function readTourCheckout(source: string): Promise<TourSource> {
  const where = join(source, 'build/tour');
  const folder = join(expandHome(source), 'build/tour');
  if (!(await exists(folder, 'folder'))) return { kind: 'none', reason: `${where} does not exist` };
  const files = await readFolder(folder, '');
  return { kind: 'tour', origin: where, buildInfo: readBuildInfo(files, where), files };
}
