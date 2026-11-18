import { describe, expect, it } from 'vitest';
import { tourOf, tourSiteFiles } from '../src/lib/tour';

const buildInfo = { buildId: 'b7f3c2', tag: 'v0.2.0', rocNightly: 'nightly-2026-10-11-7d256b9' };
const bytes = (text: string) => new TextEncoder().encode(text);

const keep = async (data: Uint8Array) => data;

describe('tourSiteFiles', () => {
  it('puts every Tour artifact under the tag path', async () => {
    const files = [
      { path: 'manifest.json', data: bytes('{}') },
      { path: 'worker/compile.mjs', data: bytes('fetch("compile.wasm")') },
    ];
    const site = await tourSiteFiles({ kind: 'tour', origin: 'Pixelsprout/rocco-engine@v0.2.0', buildInfo, files }, keep);
    expect(site.map((f) => f.path)).toContain('/projects/rocco/tour/_r/v0.2.0/manifest.json');
    expect(site.map((f) => f.path)).toContain('/projects/rocco/tour/_r/v0.2.0/worker/compile.mjs');
  });

  it('deploys a .wasm file only as its .br file', async () => {
    const files = [
      { path: 'worker/compile.mjs', data: bytes('fetch("compile.wasm")') },
      { path: 'worker/compile.wasm', data: bytes('wasm') },
    ];
    const site = await tourSiteFiles({ kind: 'tour', origin: 'checkout', buildInfo, files }, keep);
    const paths = site.map((f) => f.path);
    expect(paths).toContain('/projects/rocco/tour/_r/v0.2.0/worker/compile.wasm.br');
    expect(paths).not.toContain('/projects/rocco/tour/_r/v0.2.0/worker/compile.wasm');
  });

  it('lists the deployed artifacts for the post-deploy smoke test at a path that does not change per tag', async () => {
    const files = [{ path: 'manifest.json', data: bytes('{}') }];
    const site = await tourSiteFiles({ kind: 'tour', origin: 'checkout', buildInfo, files }, keep);
    const list = site.find((f) => f.path === '/projects/rocco/tour/artifacts.json');
    expect(JSON.parse(new TextDecoder().decode(list?.data))).toEqual({
      tag: 'v0.2.0',
      base: '/projects/rocco/tour/_r/v0.2.0/',
      files: [{ path: 'manifest.json', encoding: null, sha256: '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' }],
    });
  });

  it('gives no files when there is no Tour', async () => {
    expect(await tourSiteFiles({ kind: 'none', reason: 'the latest release v0.2.0 has no tour.tar.gz' }, keep)).toEqual([]);
  });
});

describe('tourOf', () => {
  it('gives Tour pages the build info and the folder of the Tour artifacts', () => {
    expect(tourOf(buildInfo)).toEqual({ available: true, buildInfo, base: '/projects/rocco/tour/_r/v0.2.0/' });
  });

  it('gives Tour pages the not-available message when the build has no Tour artifacts', () => {
    expect(tourOf(null)).toEqual({ available: false, message: 'The Tour is not available for this release' });
  });
});
