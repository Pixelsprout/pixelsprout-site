import { z } from 'astro/zod';

export type DexTask = { name: string; completed: boolean; completedAt: Date | null };

export type GardenEntry = {
  id: string;
  kind: 'milestone' | 'side';
  number?: number;
  title: string;
  completed: boolean;
  completedAt: Date | null;
  tasks: DexTask[];
};

export class DexError extends Error {
  override name = 'DexError';
}

export const ROOT_NAME = 'rocco roadmap';
export const MILESTONE_PATTERN = /^Milestone (\d+): (.+)$/;

// Only these fields leave dex. Task descriptions and results are the owner's working notes.
const rowSchema = z.object({
  id: z.string(),
  parent_id: z.string().nullable().optional(),
  name: z.string(),
  completed: z.boolean(),
  completed_at: z.iso.datetime().nullable().optional(),
  created_at: z.iso.datetime(),
});

type Row = z.infer<typeof rowSchema>;

function parseRows(text: string): Row[] {
  const rows: Row[] = [];
  text.split('\n').forEach((line, index) => {
    if (line.trim() === '') return;
    const lineNo = index + 1;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      throw new DexError(`tasks.jsonl line ${lineNo}: not valid JSON`);
    }
    const result = rowSchema.safeParse(json);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new DexError(`tasks.jsonl line ${lineNo}: field "${issue.path.join('.')}" ${issue.message}`);
    }
    rows.push(result.data);
  });
  return rows;
}

const toDate = (value: string | null | undefined): Date | null => (value ? new Date(value) : null);

const slugify = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function checkNumbers(milestones: GardenEntry[]): void {
  milestones.forEach((m, index) => {
    const number = m.number!;
    const expected = index + 1;
    if (number < 1) throw new DexError('Milestone numbers start at 1');
    if (number < expected) throw new DexError(`Milestone ${number} appears more than once`);
    if (number > expected) throw new DexError(`Milestone ${expected} is missing`);
  });
}

export function parseDex(text: string): GardenEntry[] {
  const rows = parseRows(text);
  const root = rows.find((r) => !r.parent_id && r.name === ROOT_NAME);
  if (!root) throw new DexError(`No root task named "${ROOT_NAME}" with no parent_id`);

  const childrenOf = (id: string) =>
    rows.filter((r) => r.parent_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at));

  const entries: GardenEntry[] = childrenOf(root.id).map((row) => {
    const base = {
      completed: row.completed,
      completedAt: toDate(row.completed_at),
      tasks: childrenOf(row.id).map((t) => ({ name: t.name, completed: t.completed, completedAt: toDate(t.completed_at) })),
    };
    const match = MILESTONE_PATTERN.exec(row.name);
    if (match) {
      const number = Number(match[1]);
      return { id: `m${number}`, kind: 'milestone', number, title: match[2], ...base };
    }
    return { id: `side-${slugify(row.name)}`, kind: 'side', title: row.name, ...base };
  });

  const milestones = entries.filter((e) => e.kind === 'milestone').sort((a, b) => a.number! - b.number!);
  if (milestones.length === 0) {
    throw new DexError(`No child of "${ROOT_NAME}" matches "Milestone N: <title>"`);
  }
  checkNumbers(milestones);

  const sides = entries.filter((e) => e.kind === 'side').sort((a, b) => a.title.localeCompare(b.title));
  return [...milestones, ...sides];
}
