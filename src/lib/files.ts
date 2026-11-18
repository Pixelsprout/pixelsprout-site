import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

export type FileEntry = { path: string; data: Uint8Array };

export const byPath = (a: FileEntry, b: FileEntry) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

export async function readFolder(dir: string, prefix: string): Promise<FileEntry[]> {
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
