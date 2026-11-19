import { describe, expect, it } from 'vitest';
import { autoRunChoice, stepEdits, type EditStorage } from '../src/lib/tour-edits';

function memoryStorage(): EditStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

const brokenStorage: EditStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

const window = { slug: '01-window', start: 'app [stub]', answer: 'app [cube]' };
const character = { slug: '02-character', start: 'app [cube]', answer: 'app [pip]' };

describe('stepEdits', () => {
  it('opens a step with its starting source', () => {
    expect(stepEdits(memoryStorage(), window).initial()).toBe('app [stub]');
  });

  it('opens a step with the edit saved on an earlier visit', () => {
    const storage = memoryStorage();
    stepEdits(storage, window).save('app [mine]');
    expect(stepEdits(storage, window).initial()).toBe('app [mine]');
  });

  it('keeps the edits of each step apart', () => {
    const storage = memoryStorage();
    stepEdits(storage, window).save('app [mine]');
    expect(stepEdits(storage, character).initial()).toBe('app [cube]');
  });

  it('restores the starting source on reset, also on the next visit', () => {
    const storage = memoryStorage();
    stepEdits(storage, window).save('app [mine]');
    expect(stepEdits(storage, window).reset()).toBe('app [stub]');
    expect(stepEdits(storage, window).initial()).toBe('app [stub]');
  });

  it('gives the answer, and keeps it after the next save', () => {
    const storage = memoryStorage();
    const edits = stepEdits(storage, window);
    edits.save(edits.answer());
    expect(stepEdits(storage, window).initial()).toBe('app [cube]');
  });

  it('moves a saved edit onto the bundles of the current release', () => {
    const url = (tag: string, name: string, hash: string) =>
      `https://github.com/Pixelsprout/rocco-engine/releases/download/${tag}/${name}-${hash}.tar.zst`;
    const header = (tag: string, platformHash: string) =>
      `app [main] { pf: platform "${url(tag, 'platform', platformHash)}", mesh: "${url(tag, 'mesh', 'M3sh')}" }`;
    const step = { slug: '03-moving', start: `${header('v0.15.1', 'B6Z3')}\nmain = 1`, answer: '' };
    const storage = memoryStorage();
    storage.setItem('rocco-tour:edit:03-moving', `${header('v0.15.0', 'GUUw')}\nmain = 2`);
    expect(stepEdits(storage, step).initial()).toBe(`${header('v0.15.1', 'B6Z3')}\nmain = 2`);
  });

  it('leaves a bundle URL alone when the starting source has no bundle of that name', () => {
    const other = 'https://example.com/v1/extra-Xyz.tar.zst';
    const storage = memoryStorage();
    stepEdits(storage, window).save(`app [mine] { x: "${other}" }`);
    expect(stepEdits(storage, window).initial()).toBe(`app [mine] { x: "${other}" }`);
  });

  it('works with no storage, or a storage that throws', () => {
    for (const storage of [null, brokenStorage]) {
      const edits = stepEdits(storage, window);
      expect(() => edits.save('app [mine]')).not.toThrow();
      expect(edits.initial()).toBe('app [stub]');
      expect(edits.reset()).toBe('app [stub]');
    }
  });
});

describe('autoRunChoice', () => {
  it('is on until the reader turns it off, and the choice holds for every step', () => {
    const storage = memoryStorage();
    expect(autoRunChoice(storage).get()).toBe(true);
    autoRunChoice(storage).set(false);
    expect(autoRunChoice(storage).get()).toBe(false);
    autoRunChoice(storage).set(true);
    expect(autoRunChoice(storage).get()).toBe(true);
  });

  it('stays on when storage does not work', () => {
    autoRunChoice(brokenStorage).set(false);
    expect(autoRunChoice(brokenStorage).get()).toBe(true);
    expect(autoRunChoice(null).get()).toBe(true);
  });
});
