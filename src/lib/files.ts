import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { TarFile } from './tar';

export const byPath = (a: TarFile, b: TarFile) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

export async function readFolder(dir: string, prefix: string): Promise<TarFile[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
      .map(async (entry) => {
        const path = join(entry.parentPath, entry.name);
        const name = relative(dir, path).split(sep).join('/');
        return { path: prefix ? `${prefix}/${name}` : name, data: new Uint8Array(await readFile(path)) };
      }),
  );
  return files.sort(byPath);
}
