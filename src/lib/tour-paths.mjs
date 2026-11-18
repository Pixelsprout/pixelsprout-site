// Plain JavaScript, so scripts/deploy-check.mjs reads the same paths in Node.
export const TOUR_BASE = '/projects/rocco/tour/';

// The post-deploy smoke test reads this list, so it needs only the site URL.
export const ARTIFACTS_LIST = `${TOUR_BASE}artifacts.json`;
