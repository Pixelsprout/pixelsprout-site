import { gunzipSync } from 'node:zlib';

export type TarFile = { path: string; data: Uint8Array };

const BLOCK = 512;
const decoder = new TextDecoder();

function field(header: Uint8Array, offset: number, length: number): string {
  const bytes = header.subarray(offset, offset + length);
  const end = bytes.indexOf(0);
  return decoder.decode(end === -1 ? bytes : bytes.subarray(0, end));
}

// A pax header holds records of the form "<length> <key>=<value>\n". Python's tarfile writes one for a long path.
function paxPath(data: Uint8Array): string | undefined {
  for (const record of decoder.decode(data).split('\n')) {
    const match = /^\d+ path=(.*)$/.exec(record);
    if (match) return match[1];
  }
  return undefined;
}

// Reads the regular files of a ustar or pax tarball. The caller writes them to disk, so a path that leaves the tarball fails.
export function readTarGz(gz: Uint8Array): TarFile[] {
  const tar = gunzipSync(gz);
  const files: TarFile[] = [];
  let paxName: string | undefined;
  let offset = 0;
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) break;
    const size = parseInt(field(header, 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(header[156]);
    const data = tar.subarray(offset + BLOCK, offset + BLOCK + size);
    offset += BLOCK + Math.ceil(size / BLOCK) * BLOCK;

    if (type === 'x') {
      paxName = paxPath(data);
      continue;
    }
    if (type === 'g') continue;
    const prefix = field(header, 345, 155);
    const name = field(header, 0, 100);
    const path = paxName ?? (prefix ? `${prefix}/${name}` : name);
    paxName = undefined;
    if (type !== '0' && type !== '\0') continue;
    if (path.startsWith('/') || path.split('/').includes('..')) throw new Error(`The tarball has the unsafe path ${path}`);
    files.push({ path, data: new Uint8Array(data) });
  }
  return files;
}
