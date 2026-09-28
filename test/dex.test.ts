import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DexError, parseDex } from '../src/lib/dex';

const fixture = readFileSync(new URL('./fixtures/tasks.jsonl', import.meta.url), 'utf8');

function row(fields: Record<string, unknown>): string {
  return JSON.stringify({
    id: 'r', parent_id: null, name: 'rocco roadmap', completed: false,
    completed_at: null, created_at: '2026-09-22T06:00:00.000Z', description: 'x', ...fields,
  });
}

function withMilestones(...numbers: number[]): string {
  return [row({}), ...numbers.map((n, i) => row({ id: `m${i}`, parent_id: 'r', name: `Milestone ${n}: thing ${i}` }))].join('\n');
}

describe('parseDex', () => {
  const garden = parseDex(fixture);

  it('lists milestones by number, then side shoots by title', () => {
    expect(garden.map((e) => e.id)).toEqual([
      'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7',
      'side-beside-the-milestones-opportunistic-work',
      'side-shared-code-for-games',
    ]);
  });

  it('reads a milestone number, title and completion', () => {
    const m1 = garden[0];
    expect(m1.kind).toBe('milestone');
    expect(m1.number).toBe(1);
    expect(m1.title).toBe('one source tree, three desktop targets');
    expect(m1.completed).toBe(true);
    expect(m1.completedAt).toEqual(new Date('2026-09-23T05:09:19.254Z'));
  });

  it('attaches subtasks in creation order', () => {
    expect(garden[0].tasks.map((t) => t.name)).toEqual(['Linux link spike in Docker', 'Pin sokol as a git submodule']);
    expect(garden[3].tasks).toHaveLength(2);
    expect(garden[5].tasks).toHaveLength(0);
  });

  it('keeps side shoot titles whole', () => {
    const side = garden.find((e) => e.id === 'side-shared-code-for-games');
    expect(side?.kind).toBe('side');
    expect(side?.number).toBeUndefined();
    expect(side?.title).toBe('Shared code for games');
  });

  it('drops every field the site does not use', () => {
    expect(Object.keys(garden[0]).sort()).toEqual(['completed', 'completedAt', 'id', 'kind', 'number', 'tasks', 'title']);
    expect(Object.keys(garden[0].tasks[0]).sort()).toEqual(['completed', 'completedAt', 'name']);
    expect(JSON.stringify(garden)).not.toMatch(/description|result|metadata/);
  });

  it('names the line of invalid JSON, counting blank lines', () => {
    expect(() => parseDex(`${row({})}\n\n{nope`)).toThrow(/line 3: not valid JSON/);
  });

  it('names the line and field of a row that fails the schema', () => {
    expect(() => parseDex(row({ completed: 'yes' }))).toThrow(/line 1: field "completed"/);
  });

  it('throws a DexError when there is no root', () => {
    expect(() => parseDex(row({ name: 'something else' }))).toThrow(DexError);
    expect(() => parseDex(row({ name: 'something else' }))).toThrow(/No root task named "rocco roadmap"/);
  });

  it('throws when no child matches the milestone pattern', () => {
    expect(() => parseDex(row({}))).toThrow(/Milestone N: <title>/);
  });

  it('throws on a duplicate milestone number', () => {
    expect(() => parseDex(withMilestones(1, 2, 2))).toThrow(/Milestone 2 appears more than once/);
  });

  it('throws on a missing milestone number', () => {
    expect(() => parseDex(withMilestones(1, 3))).toThrow(/Milestone 2 is missing/);
  });

  it('throws on milestone 0', () => {
    expect(() => parseDex(withMilestones(0, 1))).toThrow(/Milestone numbers start at 1/);
  });
});
