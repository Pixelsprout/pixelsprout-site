import { createHash } from 'node:crypto';
import type { FileEntry } from './files';
import { SourceError } from './github';

export type Compress = (data: Uint8Array) => Promise<Uint8Array>;

// encoding is the one Content-Encoding that the deploy must send for the file.
export type Digest = { path: string; encoding: 'br' | null; sha256: string };

const COMPRESSED = /\.(wasm|data)$/;
const SCRIPT = /\.(m?js|html)$/;

const folderOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1);
const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const quoted = (name: string) => new RegExp(`(["'])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`, 'g');

// Vercel has no pre-compressed file support and compresses .wasm and .data badly or not at all,
// so the site deploys only .br files. The engine's loaders name the plain files, and each
// fetches relative to its own folder, so the site renames the quoted names in that folder.
export async function deliverTour(files: FileEntry[], compress: Compress): Promise<{ files: FileEntry[]; digests: Digest[] }> {
  const scripts = new Map(files.filter((f) => SCRIPT.test(f.path)).map((f) => [f.path, new TextDecoder().decode(f.data)]));
  for (const file of files.filter((f) => COMPRESSED.test(f.path))) {
    const folder = folderOf(file.path);
    const name = nameOf(file.path);
    let named = false;
    for (const [path, text] of scripts) {
      if (folderOf(path) !== folder) continue;
      const renamed = text.replace(quoted(name), `$1${name}.br$1`);
      if (renamed !== text) named = true;
      scripts.set(path, renamed);
    }
    if (!named) throw new SourceError(`No script in ${folder || './'} names ${name}, so the site cannot point it at ${name}.br`);
  }

  const delivered = await Promise.all(
    files.map(async (file) => {
      if (COMPRESSED.test(file.path)) {
        const digest: Digest = { path: `${file.path}.br`, encoding: 'br', sha256: sha256(file.data) };
        return { file: { path: digest.path, data: await compress(file.data) }, digest };
      }
      const text = scripts.get(file.path);
      const data = text === undefined ? file.data : new TextEncoder().encode(text);
      return { file: { path: file.path, data }, digest: { path: file.path, encoding: null, sha256: sha256(data) } as Digest };
    }),
  );
  return { files: delivered.map((d) => d.file), digests: delivered.map((d) => d.digest) };
}
