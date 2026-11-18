// Vercel has no pre-compressed file support and compresses .wasm and .data badly or not at all, so the site deploys
// them only as brotli .br files. The engine's loaders add this suffix to those names when the page passes it.
export const DEPLOY_SUFFIX = '.br';

const COMPRESSED = /\.(wasm|data)$/;

export const isCompressed = (path: string) => COMPRESSED.test(path);

// The name the site deploys a Tour artifact under.
export const deployedName = (path: string) => (isCompressed(path) ? path + DEPLOY_SUFFIX : path);

const WORKER_FILES = ['compile-worker.mjs', 'compile-worker.wasm', 'source-bundle.json'];

export function tourUrls(base: string) {
  const worker = `${base}compile-worker/`;
  return {
    worker: `${worker}compile-worker.mjs?suffix=${DEPLOY_SUFFIX}`,
    preview: `${base}preview/host.html?suffix=${DEPLOY_SUFFIX}`,
    // The files the worker requests, so the page can check which are gone.
    workerFiles: WORKER_FILES.map((name) => worker + deployedName(name)),
  };
}
