import type { GardenEntry } from './dex';

export type Growth = { total: number; slots: number[]; flowering: boolean };
export type EntryState = 'grown' | 'growing' | 'seed';

// An open milestone never draws as a full leaf, even when every subtask is done.
export const OPEN_MILESTONE_CAP = 0.9;

export function endOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

// dex can mark work complete without a date. Count it as done on every date.
const doneBy = (completedAt: Date | null, at: Date) => completedAt === null || completedAt.getTime() <= at.getTime();

export function entryShare(entry: GardenEntry, at: Date): number {
  if (entry.completed && doneBy(entry.completedAt, at)) return 1;
  if (entry.tasks.length === 0) return 0;
  const done = entry.tasks.filter((t) => t.completed && doneBy(t.completedAt, at)).length;
  return Math.min(done / entry.tasks.length, OPEN_MILESTONE_CAP);
}

export function growthAt(garden: GardenEntry[], at: Date): Growth {
  const slots = garden.filter((e) => e.kind === 'milestone').map((e) => entryShare(e, at));
  const total = slots.reduce((sum, share) => sum + share, 0);
  return { total, slots, flowering: slots.length > 0 && slots.every((s) => s === 1) };
}

export function growthStatus(growth: Growth): 'seed' | 'growing' | 'flowering' {
  if (growth.flowering) return 'flowering';
  return growth.total > 0 ? 'growing' : 'seed';
}

export function entryStates(garden: GardenEntry[], at: Date): Map<string, EntryState> {
  const states = new Map<string, EntryState>();
  const milestones = garden.filter((e) => e.kind === 'milestone');
  const shares = milestones.map((m) => entryShare(m, at));
  const firstOpen = shares.findIndex((s) => s < 1);
  milestones.forEach((m, i) => {
    const share = shares[i];
    states.set(m.id, share === 1 ? 'grown' : share > 0 || i === firstOpen ? 'growing' : 'seed');
  });
  for (const side of garden.filter((e) => e.kind === 'side')) {
    const share = entryShare(side, at);
    states.set(side.id, share === 1 ? 'grown' : share > 0 ? 'growing' : 'seed');
  }
  return states;
}

export function growthLine(previous: number, current: number, project = 'rocco'): string {
  const from = Math.floor(previous);
  const to = Math.floor(current);
  return to > from ? `This post grew ${project} ${from} → ${to}` : `${project} at stage ${to}`;
}
