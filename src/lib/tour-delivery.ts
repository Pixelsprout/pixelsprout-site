import { createHash } from 'node:crypto';
import type { FileEntry } from './files';
import { deployedName, isCompressed } from './tour-urls';

export type Compress = (data: Uint8Array) => Promise<Uint8Array>;

// encoding is the one Content-Encoding that the deploy must send for the file.
export type Digest = { path: string; encoding: 'br' | null; sha256: string };

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

// The page passes the .br suffix to the engine's loaders, so the scripts deploy unchanged.
export async function deliverTour(files: FileEntry[], compress: Compress): Promise<{ files: FileEntry[]; digests: Digest[] }> {
  const delivered = await Promise.all(
    files.map(async (file) => {
      const path = deployedName(file.path);
      if (isCompressed(file.path)) {
        return { file: { path, data: await compress(file.data) }, digest: { path, encoding: 'br', sha256: sha256(file.data) } as Digest };
      }
      return { file, digest: { path, encoding: null, sha256: sha256(file.data) } as Digest };
    }),
  );
  return { files: delivered.map((d) => d.file), digests: delivered.map((d) => d.digest) };
}
