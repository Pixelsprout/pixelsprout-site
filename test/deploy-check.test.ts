import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { brotliCompressSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { checkDeploy } from '../scripts/deploy-check.mjs';
import { tourSiteFiles } from '../src/lib/tour';
import { serveLikeVercel, type Fault } from './vercel-server';

const VERCEL_JSON = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const bytes = (text: string) => new TextEncoder().encode(text);
const brotli = async (data: Uint8Array) => new Uint8Array(brotliCompressSync(data));
const buildInfo = { buildId: 'b1', tag: 'v0.2.0', rocNightly: 'nightly-2026-11-04-2622062' };

const ARTIFACTS = [
  { path: 'manifest.json', data: bytes(JSON.stringify(buildInfo)) },
  { path: 'compile-worker/compile-worker.mjs', data: bytes('load("compile-worker.wasm");') },
  { path: 'compile-worker/compile-worker.wasm', data: new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, ...bytes('worker'.repeat(50))]) },
  { path: 'preview/index.data', data: bytes('assets '.repeat(100)) },
  { path: 'preview/index.data.js', data: bytes('fetch("index.data");') },
];

async function site(extra: { path: string; data: Uint8Array }[] = []) {
  const dir = await mkdtemp(join(tmpdir(), 'deploy-check-'));
  const files = await tourSiteFiles({ kind: 'tour', origin: 'test', buildInfo, files: ARTIFACTS }, brotli);
  for (const file of [...files, ...extra]) {
    await mkdir(join(dir, dirname(file.path)), { recursive: true });
    await writeFile(join(dir, file.path), file.data);
  }
  return dir;
}

const servers: { close: () => Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

async function check(dir: string, { vercelJson = VERCEL_JSON, fault = 'none' as Fault } = {}) {
  const server = await serveLikeVercel(dir, vercelJson, fault);
  servers.push(server);
  return checkDeploy(server.url);
}

describe('checkDeploy', () => {
  it('passes a deploy that sends the vercel.json headers', async () => {
    const result = await check(await site());
    expect(result.failures).toEqual([]);
    expect([...result.checked].sort()).toEqual([
      'compile-worker/compile-worker.mjs',
      'compile-worker/compile-worker.wasm.br',
      'manifest.json',
      'preview/index.data.br',
      'preview/index.data.js',
    ]);
  });

  it('fails a deploy that compresses a .br file again and says so in the header', async () => {
    const { failures } = await check(await site(), { fault: 'recompress-with-header' });
    expect(failures).toContain('compile-worker/compile-worker.wasm.br: content-encoding is "br, br", not exactly "br"');
    expect(failures).toContain('preview/index.data.br: content-encoding is "br, br", not exactly "br"');
  });

  it('fails a deploy that compresses a .br body again under one br header', async () => {
    const { failures } = await check(await site(), { fault: 'recompress-body-only' });
    expect(failures).toContain('compile-worker/compile-worker.wasm.br: the body does not decode to the original bytes');
  });

  it('fails a deploy with no vercel.json headers', async () => {
    const { failures } = await check(await site(), { vercelJson: {} });
    expect(failures).toContain('compile-worker/compile-worker.wasm.br: content-encoding is "", not exactly "br"');
    expect(failures).toContain('compile-worker/compile-worker.wasm.br: content-type is "application/octet-stream", not "application/wasm"');
    expect(failures).toContain('compile-worker/compile-worker.wasm.br: vary does not name Accept-Encoding');
    expect(failures).toContain('manifest.json: cache-control is "", not "public, max-age=31536000, immutable"');
  });

  it('fails a deploy that also has the plain .wasm file', async () => {
    const plain = { path: '/projects/rocco/tour/_r/v0.2.0/compile-worker/compile-worker.wasm', data: ARTIFACTS[2].data };
    const { failures } = await check(await site([plain]));
    expect(failures).toEqual(['compile-worker/compile-worker.wasm: the plain file is deployed beside its .br file']);
  });

  it('passes a deploy with no Tour, and says that it checked nothing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'deploy-check-'));
    expect(await check(dir)).toEqual({ failures: [], checked: [], notes: ['The deploy has no Tour artifacts list, so there was nothing to check.'] });
  });
});
