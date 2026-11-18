import { describe, expect, it } from 'vitest';
import { deliverTour } from '../src/lib/tour-delivery';
import { tourUrls } from '../src/lib/tour-urls';

const BASE = '/projects/rocco/tour/_r/v0.2.0/';
const keep = async (data: Uint8Array) => data;
const ARTIFACTS = ['compile-worker/compile-worker.mjs', 'compile-worker/compile-worker.wasm', 'compile-worker/source-bundle.json', 'preview/host.html', 'preview/index.wasm', 'preview/index.data'].map(
  (path) => ({ path, data: new Uint8Array([1]) }),
);

describe('tourUrls', () => {
  it('asks the compile worker and the Preview for the .br files', () => {
    const urls = tourUrls(BASE);
    expect(urls.worker).toBe(`${BASE}compile-worker/compile-worker.mjs?suffix=.br`);
    expect(urls.preview).toBe(`${BASE}preview/host.html?suffix=.br`);
  });

  it('names the worker files that the page requests, as the site deploys them', async () => {
    const deployed = (await deliverTour(ARTIFACTS, keep)).files.map((f) => BASE + f.path);
    expect(tourUrls(BASE).workerFiles).toEqual([
      `${BASE}compile-worker/compile-worker.mjs`,
      `${BASE}compile-worker/compile-worker.wasm.br`,
      `${BASE}compile-worker/source-bundle.json`,
    ]);
    for (const url of tourUrls(BASE).workerFiles) expect(deployed).toContain(url);
  });
});
