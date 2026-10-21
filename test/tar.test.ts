import { readFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { readTarGz } from '../src/lib/tar';

function tarOf(name: string, body: string): Uint8Array {
  const header = new Uint8Array(512);
  const put = (offset: number, value: string) => header.set(new TextEncoder().encode(value), offset);
  const data = new TextEncoder().encode(body);
  put(0, name);
  put(124, `${data.length.toString(8).padStart(11, '0')}\0`);
  put(156, '0');
  put(257, 'ustar\0');
  const padded = new Uint8Array(Math.ceil(data.length / 512) * 512);
  padded.set(data);
  return gzipSync(Buffer.concat([header, padded, new Uint8Array(1024)]));
}

describe('readTarGz', () => {
  it('reads the files of a tarball from scripts/release.py and skips the folders', () => {
    const files = readTarGz(readFileSync(new URL('fixtures/docs.tar.gz', import.meta.url)));
    expect(files.map((f) => f.path)).toContain('urls.json');
    expect(files.map((f) => f.path)).not.toContain('platform');
    const index = files.find((f) => f.path === 'platform/index.html')!;
    expect(new TextDecoder().decode(index.data)).toMatch(/^<!DOCTYPE html>/);
  });

  it('reads a pax path longer than the ustar name field', () => {
    const files = readTarGz(readFileSync(new URL('fixtures/docs.tar.gz', import.meta.url)));
    const long = files.find((f) => f.path.startsWith('ui/AVeryLong'))!;
    expect(long.path).toHaveLength(105);
    expect(new TextDecoder().decode(long.data)).toBe('<p>long</p>\n');
  });

  it('fails on a tarball that ends inside a file', () => {
    const whole = gunzipSync(tarOf('a.html', 'x'.repeat(600)));
    expect(() => readTarGz(gzipSync(whole.subarray(0, 900)))).toThrow(/a\.html is cut short/);
  });

  it('rejects a path that leaves the tarball', () => {
    expect(() => readTarGz(tarOf('../escape.html', 'x'))).toThrow(/unsafe path \.\.\/escape\.html/);
    expect(() => readTarGz(tarOf('/etc/escape', 'x'))).toThrow(/unsafe path \/etc\/escape/);
  });
});
