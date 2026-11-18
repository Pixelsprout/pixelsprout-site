import { createHash } from 'node:crypto';
import { brotliCompressSync, brotliDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { deliverTour } from '../src/lib/tour-delivery';

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (data: Uint8Array) => new TextDecoder().decode(data);
const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const brotli = async (data: Uint8Array) => new Uint8Array(brotliCompressSync(data));

const WASM = new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);
const DATA = bytes('pip.glb blip.wav');

// The loaders as the engine builds them, cut to the lines that name the files.
const artifacts = () => [
  { path: 'compile-worker/compile-worker.mjs', data: bytes('// loads compile-worker.wasm\nload("compile-worker.wasm").then((r) => r.arrayBuffer());') },
  { path: 'compile-worker/compile-worker.wasm', data: WASM },
  { path: 'manifest.json', data: bytes('{"tag":"v0.2.0"}') },
  { path: 'preview/index.data', data: DATA },
  { path: 'preview/index.data.js', data: bytes('var data = fetch("index.data");\nModule["addRunDependency"]("index.data");') },
  { path: 'preview/index.js', data: bytes("function findWasmBinary() {\n  return locateFile('index.wasm');\n}") },
  { path: 'preview/index.wasm', data: WASM },
];

const byName = (files: { path: string; data: Uint8Array }[]) => Object.fromEntries(files.map((f) => [f.path, f.data]));

describe('deliverTour', () => {
  it('replaces each .wasm and .data file with a .br file that decodes to the same bytes', async () => {
    const { files } = await deliverTour(artifacts(), brotli);
    const out = byName(files);
    expect(Object.keys(out).filter((p) => /\.(wasm|data)$/.test(p))).toEqual([]);
    expect(brotliDecompressSync(out['compile-worker/compile-worker.wasm.br'])).toEqual(Buffer.from(WASM));
    expect(brotliDecompressSync(out['preview/index.wasm.br'])).toEqual(Buffer.from(WASM));
    expect(brotliDecompressSync(out['preview/index.data.br'])).toEqual(Buffer.from(DATA));
  });

  it('keeps every other file unchanged, the loaders included', async () => {
    const out = byName((await deliverTour(artifacts(), brotli)).files);
    expect(text(out['manifest.json'])).toBe('{"tag":"v0.2.0"}');
    expect(text(out['preview/index.js'])).toBe("function findWasmBinary() {\n  return locateFile('index.wasm');\n}");
    expect(text(out['compile-worker/compile-worker.mjs'])).toBe('// loads compile-worker.wasm\nload("compile-worker.wasm").then((r) => r.arrayBuffer());');
  });

  it('lists each deployed file with the digest of the bytes that a browser gets after it decodes the body', async () => {
    const { files, digests } = await deliverTour(artifacts(), brotli);
    const out = byName(files);
    expect(digests).toContainEqual({ path: 'preview/index.data.br', encoding: 'br', sha256: sha256(DATA) });
    expect(digests).toContainEqual({ path: 'manifest.json', encoding: null, sha256: sha256(bytes('{"tag":"v0.2.0"}')) });
    expect(digests).toContainEqual({ path: 'preview/index.js', encoding: null, sha256: sha256(out['preview/index.js']) });
    expect(digests.map((d) => d.path)).toEqual(files.map((f) => f.path));
  });
});
