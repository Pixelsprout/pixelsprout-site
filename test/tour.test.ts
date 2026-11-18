import { describe, expect, it } from 'vitest';
import { tourOf, tourSiteFiles } from '../src/lib/tour';

const buildInfo = { buildId: 'b7f3c2', tag: 'v0.2.0', rocNightly: 'nightly-2026-10-11-7d256b9' };
const bytes = (text: string) => new TextEncoder().encode(text);

describe('tourSiteFiles', () => {
  it('puts every Tour artifact under the tag path', () => {
    const files = [
      { path: 'manifest.json', data: bytes('{}') },
      { path: 'worker/compile.wasm', data: bytes('wasm') },
    ];
    const site = tourSiteFiles({ kind: 'tour', origin: 'Pixelsprout/rocco-engine@v0.2.0', buildInfo, files });
    expect(site.map((f) => f.path)).toEqual([
      '/projects/rocco/tour/_r/v0.2.0/manifest.json',
      '/projects/rocco/tour/_r/v0.2.0/worker/compile.wasm',
    ]);
    expect(site[1].data).toBe(files[1].data);
  });

  it('gives no files when there is no Tour', () => {
    expect(tourSiteFiles({ kind: 'none', reason: 'the latest release v0.2.0 has no tour.tar.gz' })).toEqual([]);
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
