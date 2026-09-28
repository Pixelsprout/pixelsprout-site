import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDex, type GardenEntry } from '../src/lib/dex';
import { endOfUtcDay, entryStates, growthAt, growthLine, growthStatus, OPEN_MILESTONE_CAP } from '../src/lib/garden';

const garden = parseDex(readFileSync(new URL('./fixtures/tasks.jsonl', import.meta.url), 'utf8'));
const day = (iso: string) => endOfUtcDay(new Date(iso));

function milestone(number: number, done: boolean): GardenEntry {
  const at = done ? new Date('2026-10-01T00:00:00.000Z') : null;
  return { id: `m${number}`, kind: 'milestone', number, title: 't', completed: done, completedAt: at, tasks: [] };
}

describe('endOfUtcDay', () => {
  it('returns the last millisecond of the UTC day', () => {
    expect(endOfUtcDay(new Date('2026-09-28T00:00:00.000Z')).toISOString()).toBe('2026-09-28T23:59:59.999Z');
    expect(endOfUtcDay(new Date('2026-09-28T23:59:59.999Z')).toISOString()).toBe('2026-09-28T23:59:59.999Z');
  });
});

describe('growthAt', () => {
  it('counts each complete milestone as 1', () => {
    expect(growthAt(garden, day('2026-09-28'))).toEqual({ total: 3, slots: [1, 1, 1, 0, 0, 0, 0], flowering: false });
  });

  it('counts an open milestone by its share of done subtasks', () => {
    const growth = growthAt(garden, day('2026-09-29'));
    expect(growth.slots[3]).toBe(0.5);
    expect(growth.total).toBe(3.5);
  });

  it('caps an open milestone whose subtasks are all done', () => {
    const justBefore = new Date('2026-09-23T05:09:19.253Z');
    expect(growthAt(garden, justBefore).slots[0]).toBe(OPEN_MILESTONE_CAP);
  });

  it('counts work completed exactly at the cut-off', () => {
    expect(growthAt(garden, new Date('2026-09-23T05:09:19.254Z')).slots[0]).toBe(1);
  });

  it('counts an open milestone with no subtasks as 0', () => {
    expect(growthAt(garden, day('2026-12-31')).slots[5]).toBe(0);
  });

  it('ignores side shoots', () => {
    expect(growthAt(garden, day('2026-09-28')).slots).toHaveLength(7);
  });

  it('flowers only when every milestone is complete', () => {
    const all = [1, 2, 3].map((n) => milestone(n, true));
    expect(growthAt(all, day('2026-10-02')).flowering).toBe(true);
    expect(growthAt([...all, milestone(4, false)], day('2026-10-02')).flowering).toBe(false);
  });
});

describe('entryStates', () => {
  const states = entryStates(garden, day('2026-09-28'));

  it('marks done milestones grown, the first open one growing, the rest seed', () => {
    expect(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'].map((id) => states.get(id))).toEqual([
      'grown', 'grown', 'grown', 'growing', 'seed', 'seed', 'seed',
    ]);
  });

  it('marks side shoots by their own subtasks', () => {
    expect(states.get('side-shared-code-for-games')).toBe('growing');
    expect(states.get('side-beside-the-milestones-opportunistic-work')).toBe('seed');
  });
});

describe('growthLine', () => {
  it('reports growth when the whole stage goes up', () => {
    expect(growthLine(2, 3)).toBe('This post grew rocco 2 → 3');
    expect(growthLine(0.9, 1.4)).toBe('This post grew rocco 0 → 1');
  });

  it('reports the stage when it did not go up', () => {
    expect(growthLine(3, 3.5)).toBe('rocco at stage 3');
    expect(growthLine(3, 3)).toBe('rocco at stage 3');
    expect(growthLine(0, 0.9)).toBe('rocco at stage 0');
  });
});

describe('undated completions', () => {
  const at = day('2026-09-28');

  it('counts a completed milestone with no completion date as grown', () => {
    const m: GardenEntry = { id: 'm1', kind: 'milestone', number: 1, title: 't', completed: true, completedAt: null, tasks: [] };
    expect(growthAt([m], at)).toEqual({ total: 1, slots: [1], flowering: true });
  });

  it('counts a completed task with no completion date as done', () => {
    const m: GardenEntry = {
      id: 'm1', kind: 'milestone', number: 1, title: 't', completed: false, completedAt: null,
      tasks: [{ name: 'a', completed: true, completedAt: null }, { name: 'b', completed: false, completedAt: null }],
    };
    expect(growthAt([m], at)).toEqual({ total: 0.5, slots: [0.5], flowering: false });
  });
});

describe('growthStatus', () => {
  it('names seed, growing and flowering', () => {
    expect(growthStatus({ total: 0, slots: [0, 0], flowering: false })).toBe('seed');
    expect(growthStatus({ total: 1.5, slots: [1, 0.5], flowering: false })).toBe('growing');
    expect(growthStatus({ total: 2, slots: [1, 1], flowering: true })).toBe('flowering');
  });
});
