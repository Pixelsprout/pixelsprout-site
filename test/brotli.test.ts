import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { cachedBrotli } from '../src/lib/brotli';

const DATA = new TextEncoder().encode('rocco '.repeat(1000));

describe('cachedBrotli', () => {
  it('gives brotli bytes that decode to the input', async () => {
    const compress = cachedBrotli(await mkdtemp(join(tmpdir(), 'brotli-')));
    expect(brotliDecompressSync(await compress(DATA))).toEqual(Buffer.from(DATA));
  });

  // A release build compresses the 16 MB compile worker at quality 11 for about 45 s, so a dev restart must not.
  it('reuses the result for the same input from the cache folder', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'brotli-'));
    await cachedBrotli(dir)(DATA);
    const [name] = await readdir(dir);
    await writeFile(join(dir, name), 'cached');
    expect(new TextDecoder().decode(await cachedBrotli(dir)(DATA))).toBe('cached');
  });
});
