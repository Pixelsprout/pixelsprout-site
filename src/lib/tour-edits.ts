export type EditStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type StepSources = { slug: string; start: string; answer: string };

export type StepEdits = {
  initial(): string;
  save(text: string): void;
  reset(): string;
  answer(): string;
};

const editKey = (slug: string) => `rocco-tour:edit:${slug}`;

// localStorage throws in some private windows and when the quota is full. The editor still works; it only forgets.
export function attempt<T>(action: () => T, fallback: T): T {
  try {
    return action();
  } catch {
    return fallback;
  }
}

// A bundle URL ends in <name>-<content hash>.tar.zst, and its folder names the release.
const BUNDLE_URL = /https:\/\/[^\s"]+\/([A-Za-z0-9_]+)-[A-Za-z0-9]+\.tar\.zst/g;

// The worker mounts only the bundles of its own release, so a saved edit that still names an
// earlier release's bundles fails with InvalidDependency. Point each one at this release's bundle
// of the same name.
function onCurrentBundles(saved: string, start: string): string {
  const current = new Map([...start.matchAll(BUNDLE_URL)].map(([url, name]) => [name, url]));
  return saved.replace(BUNDLE_URL, (url, name: string) => current.get(name) ?? url);
}

export function stepEdits(storage: EditStorage | null, step: StepSources): StepEdits {
  const key = editKey(step.slug);
  const forget = () => attempt(() => storage?.removeItem(key), undefined);
  return {
    initial: () => {
      const saved = attempt(() => storage?.getItem(key), null) ?? null;
      return saved === null ? step.start : onCurrentBundles(saved, step.start);
    },
    save: (text) => {
      if (text === step.start) forget();
      else attempt(() => storage?.setItem(key, text), undefined);
    },
    reset: () => {
      forget();
      return step.start;
    },
    answer: () => step.answer,
  };
}

const autoRunKey = 'rocco-tour:auto-run';

// One choice for the whole Tour, not per step.
export function autoRunChoice(storage: EditStorage | null) {
  return {
    get: () => attempt(() => storage?.getItem(autoRunKey), null) !== 'off',
    set: (on: boolean) =>
      attempt(() => (on ? storage?.removeItem(autoRunKey) : storage?.setItem(autoRunKey, 'off')), undefined),
  };
}
