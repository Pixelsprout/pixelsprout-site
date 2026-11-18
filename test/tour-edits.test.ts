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
