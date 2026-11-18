import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants } from 'node:zlib';
import type { Compress } from './tour-delivery';

const compress = promisify(brotliCompress);

// Quality 11 makes the compile worker 8.5 MB instead of 9.0 MB at quality 9.
export function cachedBrotli(dir: string): Compress {
  return async (data) => {
    const path = join(dir, `${createHash('sha256').update(data).digest('hex')}.br`);
    const cached = await readFile(path).catch(() => null);
    if (cached) return new Uint8Array(cached);
    const out = await compress(data, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: data.length },
    });
    await mkdir(dir, { recursive: true });
    // A build stopped halfway must not leave a cut file that a later build takes as whole.
    await writeFile(`${path}.tmp`, out);
    await rename(`${path}.tmp`, path);
    return new Uint8Array(out);
  };
}
