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
function attempt<T>(action: () => T, fallback: T): T {
  try {
    return action();
  } catch {
    return fallback;
  }
}

export function stepEdits(storage: EditStorage | null, step: StepSources): StepEdits {
  const key = editKey(step.slug);
  const forget = () => attempt(() => storage?.removeItem(key), undefined);
  return {
    initial: () => attempt(() => storage?.getItem(key), null) ?? step.start,
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
