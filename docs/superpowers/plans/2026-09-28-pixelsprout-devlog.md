# Pixelsprout Devlog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and ship the Pixelsprout devlog at `pixelsprout.dev`: an Astro site in the "Soil Terminal" style whose pixel plant grows from the rocco dex task log.

**Architecture:** Astro 7 static site. Posts are MDX files in a `glob` content collection. A custom content loader reads `.dex/tasks.jsonl` from rocco-engine at build time, pinned to the latest `main` commit, and stores a `garden` collection. Pure TypeScript modules in `src/lib/` hold all logic (dex parsing, growth maths, plant pixels, post rules) and carry the unit tests. Astro components only render.

**Tech Stack:** Astro 7.3, `@astrojs/mdx` 8, `@astrojs/rss` 4, `@astrojs/sitemap` 3, Zod 4 via `astro/zod`, Shiki 4 (bundled with Astro), Vitest 5, `@astrojs/check` with TypeScript 6, Fontsource (Pixelify Sans, IBM Plex Mono), Vercel static hosting.

**Spec:** `docs/superpowers/specs/2026-09-28-pixelsprout-devlog-design.md`. Read it before you start. The design canvas is https://claude.ai/artifact/XhxvWVKyCd8oYbic4EhG8M (row "B+").

## Global Constraints

- Node: `>=24` in `package.json` `engines`. Vercel builds on Node 24.
- TypeScript: `^6` (`@astrojs/check` 0.9 supports `^5 || ^6` only). Do not install TypeScript 7.
- Import Zod from `astro/zod`, never from `zod`.
- Dex fields the site keeps: `id`, `parent_id`, `name`, `completed`, `completed_at`, `created_at`. Drop all others, including `description`, `result`, `metadata`.
- Dex root: no `parent_id`, name `rocco roadmap`. Milestone pattern: `^Milestone (\d+): (.+)$`.
- Dex default source: GitHub API `GET https://api.github.com/repos/Pixelsprout/rocco-engine/commits/main`, then `https://raw.githubusercontent.com/Pixelsprout/rocco-engine/<sha>/.dex/tasks.jsonl`. `DEX_SOURCE` overrides with a URL or a file path. `GITHUB_TOKEN` is optional.
- Every data or content error fails the build. There is no fallback data.
- Drafts: shown when `astro dev` runs or `VERCEL_ENV=preview`. Hidden otherwise. RSS never includes drafts.
- Dates compare in UTC. "By date D" means at or before 23:59:59.999 UTC on D.
- Client JavaScript: only the inline copy-button script.
- Fonts: self-hosted with Fontsource. No Google Fonts requests.
- Breakpoint: one, at `max-width: 720px`.
- Text colours must reach 4.5:1 against every background they sit on.
- Site URL: `https://pixelsprout.dev`. Commit links: `https://github.com/Pixelsprout/rocco-engine/commit/<hash>`.
- The owner writes all post prose. Generate only draft stubs with `[write this]` placeholders.
- personal-site commits: conventional commits, ending with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- rocco-engine commits: conventional commits with no author or generated-by lines (its `AGENTS.md` rule).
- Do not push, create remote repos, create Vercel projects, or change DNS without the owner's explicit yes for that step.

## Review Focus

1. **Launch day, every post is a draft.** Production must build, and the homepage, `/devlog/` and RSS must show an empty state, not crash. Test: Task 15 smoke build with `POSTS_DIR=test/fixtures/empty-posts`, and the `GitLog` empty message in Task 9.
2. **All subtasks done but the milestone still open.** The plant must not show that leaf as full. Test: Task 4 `OPEN_MILESTONE_CAP` cases.
3. **`DEX_SOURCE` as `~/…` or as a missing file.** The loader must expand `~` and name the path in the error. Test: Task 3.
4. **Two posts with the same file name in different project folders.** The build must fail and name both files. Test: Task 6 `assertPosts`.
5. **Several posts on one date.** Order must be stable, and only one of them reports "grew". Test: Task 6 `visiblePosts` tie order, Task 4 `growthLine`.

---

## File map

| Path | Responsibility |
|---|---|
| `astro.config.mjs` | Site URL, integrations, Shiki setup |
| `vitest.config.ts` | Test file pattern |
| `src/content.config.ts` | `posts` and `garden` collection schemas |
| `src/loaders/dex.ts` | Astro loader: read source, parse, store |
| `src/lib/dex.ts` | `parseDex`: text → garden entries. Pure. |
| `src/lib/dex-source.ts` | `readDexSource`: SHA-pinned fetch, URL or file override |
| `src/lib/garden.ts` | Growth maths, entry states, growth line. Pure. |
| `src/lib/plant.ts` | Plant pixel rectangles and label. Pure. |
| `src/lib/post-meta.ts` | Draft rules, slugs, tags, ordering, post checks. Pure. |
| `src/lib/content.ts` | `getGarden`, `getPosts`: the only files that call `astro:content` helpers |
| `src/lib/code-frame.mjs` | Shiki transformer: file name bar wrapper |
| `src/styles/global.css` | Tokens, base styles, code block styles |
| `src/styles/soil-theme.mjs` | Shiki theme |
| `src/grammars/roc.tmLanguage.json` | Roc TextMate grammar (MIT, roc-vscode-unofficial) |
| `src/layouts/Base.astro`, `Post.astro` | Page shells |
| `src/components/*.astro` | `SiteHeader`, `SiteFooter`, `Prompt`, `Plant`, `StatusPanel`, `GitLog`, `DevlogFilter`, `PostAside`, `PostNav`, `Check`, `Figure` |
| `src/pages/…` | Routes from spec 3.1 |
| `src/content/posts/rocco/*.mdx` | Draft stubs |
| `test/*.test.ts` | Unit tests |
| `test/fixtures/` | `tasks.jsonl`, fixture posts, empty posts folder |
| `scripts/smoke.mjs` | Production build checks |
| `.github/workflows/ci.yml` | CI |

---

### Task 1: Scaffold the Astro project

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `src/pages/index.astro`, `public/pixelsprout.png`
- Delete: `public/favicon.svg`, `public/favicon.ico`

**Interfaces:**
- Produces: npm scripts `dev`, `dev:local`, `build`, `check`, `test`, `smoke`, `ci`. Later tasks run these.

- [ ] **Step 1: Create the work branch**

```bash
cd ~/projects/personal-site
git switch -c feat/devlog-site
```

- [ ] **Step 2: Scaffold into a temp folder and copy in**

The repo already holds `docs/`, so do not scaffold in place.

```bash
TMP="$(mktemp -d)"
(cd "$TMP" && npm create astro@latest site -- --template minimal --no-install --no-git --skip-houston --yes)
cp -R "$TMP/site/." ~/projects/personal-site/
rm -f public/favicon.svg public/favicon.ico
cp ~/Downloads/1cb0650f557bd73eb6ba38fe006fe3ad.png public/pixelsprout.png
ls
```

Expected: `AGENTS.md CLAUDE.md README.md astro.config.mjs docs package.json public src tsconfig.json`. If the logo file is missing from `~/Downloads`, stop and ask the owner for it.

- [ ] **Step 3: Install dependencies**

```bash
npm install astro@^7.3.5 @astrojs/mdx@^8 @astrojs/rss@^4 @astrojs/sitemap@^3 @fontsource/pixelify-sans@^5 @fontsource/ibm-plex-mono@^5
npm install -D vitest@^5 @astrojs/check@^0.9 typescript@^6
```

- [ ] **Step 4: Write `package.json` scripts and engines**

Replace the `scripts` and `engines` blocks. Keep every other key that the scaffold and npm wrote.

```json
"engines": { "node": ">=24" },
"scripts": {
  "dev": "astro dev",
  "dev:local": "DEX_SOURCE=../../playground/rocco-engine/.dex/tasks.jsonl astro dev",
  "build": "astro build",
  "preview": "astro preview",
  "check": "astro check",
  "test": "vitest run",
  "smoke": "node scripts/smoke.mjs",
  "ci": "npm test && npm run check && npm run smoke",
  "astro": "astro"
}
```

Set `"name": "pixelsprout-site"`.

- [ ] **Step 5: Write `astro.config.mjs`**

```js
// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://pixelsprout.dev',
  integrations: [mdx(), sitemap()],
});
```

- [ ] **Step 6: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
});
```

- [ ] **Step 7: Add to `.gitignore`**

Append:

```
.vercel/
.env*
!.env.example
```

- [ ] **Step 8: Build**

Run: `npm run build`
Expected: exit 0, `1 page(s) built`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "build: Scaffold the Astro site with MDX, RSS, sitemap and Vitest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Parse the dex log

**Files:**
- Create: `src/lib/dex.ts`, `test/fixtures/tasks.jsonl`, `test/dex.test.ts`

**Interfaces:**
- Produces:
  - `type DexTask = { name: string; completed: boolean; completedAt: Date | null }`
  - `type GardenEntry = { id: string; kind: 'milestone' | 'side'; number?: number; title: string; completed: boolean; completedAt: Date | null; tasks: DexTask[] }`
  - `class DexError extends Error`
  - `parseDex(text: string): GardenEntry[]`: milestones by number, then side shoots by title.
  - `ROOT_NAME`, `MILESTONE_PATTERN`

- [ ] **Step 1: Write the fixture**

`test/fixtures/tasks.jsonl` is trimmed from rocco's log. Task `uhqgk5sn` has a test-only completion on 2026-09-29, so tests can check a half-grown milestone. Write exactly these 19 lines:

```jsonl
{"id":"7mpm5az4","parent_id":null,"name":"rocco roadmap","description":"x","priority":1,"completed":false,"result":null,"metadata":{},"created_at":"2026-09-22T06:00:00.000Z","updated_at":"2026-09-22T06:00:00.000Z","started_at":null,"completed_at":null,"blockedBy":[],"blocks":[],"children":[]}
{"id":"d6o7lq9h","parent_id":"7mpm5az4","name":"Milestone 1: one source tree, three desktop targets","description":"x","priority":1,"completed":true,"result":"x","metadata":{},"created_at":"2026-09-22T06:01:00.000Z","updated_at":"2026-09-23T05:09:19.254Z","started_at":null,"completed_at":"2026-09-23T05:09:19.254Z","blockedBy":[],"blocks":[],"children":[]}
{"id":"0jeesh0o","parent_id":"d6o7lq9h","name":"Pin sokol as a git submodule","description":"x","priority":6,"completed":true,"result":"x","metadata":{},"created_at":"2026-09-22T06:03:00.000Z","updated_at":"2026-09-23T03:54:13.938Z","started_at":null,"completed_at":"2026-09-23T03:54:13.938Z","blockedBy":[],"blocks":[],"children":[]}
{"id":"58mch7nz","parent_id":"d6o7lq9h","name":"Linux link spike in Docker","description":"x","priority":1,"completed":true,"result":"x","metadata":{},"created_at":"2026-09-22T06:02:00.000Z","updated_at":"2026-09-23T00:17:08.504Z","started_at":null,"completed_at":"2026-09-23T00:17:08.504Z","blockedBy":[],"blocks":[],"children":[]}
{"id":"dnvmo0dw","parent_id":"7mpm5az4","name":"Milestone 2: the platform stops naming the game","description":"x","priority":2,"completed":true,"result":"x","metadata":{},"created_at":"2026-09-22T06:04:00.000Z","updated_at":"2026-09-25T02:28:39.180Z","started_at":null,"completed_at":"2026-09-25T02:28:39.180Z","blockedBy":["d6o7lq9h"],"blocks":[],"children":[]}
{"id":"bj7u7vsx","parent_id":"dnvmo0dw","name":"Write the camera package in packages/camera/","description":"x","priority":2,"completed":true,"result":"x","metadata":{},"created_at":"2026-09-22T06:05:00.000Z","updated_at":"2026-09-24T03:08:20.774Z","started_at":null,"completed_at":"2026-09-24T03:08:20.774Z","blockedBy":[],"blocks":[],"children":[]}
{"id":"c4fmohwc","parent_id":"7mpm5az4","name":"Milestone 3: mesh handles and the manifest","description":"x","priority":3,"completed":true,"result":"x","metadata":{},"created_at":"2026-09-22T06:06:00.000Z","updated_at":"2026-09-28T00:49:00.930Z","started_at":null,"completed_at":"2026-09-28T00:49:00.930Z","blockedBy":["dnvmo0dw"],"blocks":[],"children":[]}
{"id":"5huxufxb","parent_id":"c4fmohwc","name":"Give the renderer a mesh table indexed by id","description":"x","priority":1,"completed":true,"result":"x","metadata":{},"created_at":"2026-09-22T06:07:00.000Z","updated_at":"2026-09-28T00:48:59.927Z","started_at":null,"completed_at":"2026-09-28T00:48:59.927Z","blockedBy":[],"blocks":[],"children":[]}
{"id":"ly4ilkf7","parent_id":"7mpm5az4","name":"Milestone 4: geometry from disk","description":"x","priority":4,"completed":false,"result":null,"metadata":{},"created_at":"2026-09-22T06:08:00.000Z","updated_at":"2026-09-28T00:49:00.930Z","started_at":null,"completed_at":null,"blockedBy":["c4fmohwc"],"blocks":[],"children":[]}
{"id":"uhqgk5sn","parent_id":"ly4ilkf7","name":"Pick a mesh format and load positions, normals, indices","description":"x","priority":1,"completed":true,"result":"x","metadata":{},"created_at":"2026-09-22T06:09:00.000Z","updated_at":"2026-09-29T10:00:00.000Z","started_at":null,"completed_at":"2026-09-29T10:00:00.000Z","blockedBy":[],"blocks":[],"children":[]}
{"id":"jzvojfn9","parent_id":"ly4ilkf7","name":"Add a generation to mesh ids before level meshes unload","description":"x","priority":1,"completed":false,"result":null,"metadata":{},"created_at":"2026-09-22T06:10:00.000Z","updated_at":"2026-09-28T00:49:00.930Z","started_at":null,"completed_at":null,"blockedBy":[],"blocks":[],"children":[]}
{"id":"2yhubttj","parent_id":"7mpm5az4","name":"Milestone 5: entities in Roc","description":"x","priority":5,"completed":false,"result":null,"metadata":{},"created_at":"2026-09-22T06:11:00.000Z","updated_at":"2026-09-22T06:11:00.000Z","started_at":null,"completed_at":null,"blockedBy":["ly4ilkf7"],"blocks":[],"children":[]}
{"id":"6mt0q3gy","parent_id":"2yhubttj","name":"Move entities into the game's Model as List(Entity)","description":"x","priority":2,"completed":false,"result":null,"metadata":{},"created_at":"2026-09-22T06:12:00.000Z","updated_at":"2026-09-22T06:12:00.000Z","started_at":null,"completed_at":null,"blockedBy":[],"blocks":[],"children":[]}
{"id":"ph33bwe3","parent_id":"7mpm5az4","name":"Milestone 6: collision as data","description":"x","priority":6,"completed":false,"result":null,"metadata":{},"created_at":"2026-09-22T06:13:00.000Z","updated_at":"2026-09-22T06:13:00.000Z","started_at":null,"completed_at":null,"blockedBy":["2yhubttj"],"blocks":[],"children":[]}
{"id":"nakhrn2r","parent_id":"7mpm5az4","name":"Milestone 7: one gameplay verb","description":"x","priority":7,"completed":false,"result":null,"metadata":{},"created_at":"2026-09-22T06:14:00.000Z","updated_at":"2026-09-22T06:14:00.000Z","started_at":null,"completed_at":null,"blockedBy":["ph33bwe3"],"blocks":[],"children":[]}
{"id":"7z7cfqzk","parent_id":"7mpm5az4","name":"Shared code for games","description":"x","priority":3,"completed":false,"result":null,"metadata":{},"created_at":"2026-09-22T06:15:00.000Z","updated_at":"2026-09-28T02:30:00.000Z","started_at":null,"completed_at":null,"blockedBy":[],"blocks":[],"children":[]}
{"id":"i5jcdj5e","parent_id":"7z7cfqzk","name":"Add pf.Vocabulary and port the three games to it","description":"x","priority":1,"completed":true,"result":"x","metadata":{},"created_at":"2026-09-22T06:16:00.000Z","updated_at":"2026-09-28T02:30:00.000Z","started_at":null,"completed_at":"2026-09-28T02:30:00.000Z","blockedBy":[],"blocks":[],"children":[]}
{"id":"6xjrehjc","parent_id":"7mpm5az4","name":"Beside the milestones: opportunistic work","description":"x","priority":8,"completed":false,"result":null,"metadata":{},"created_at":"2026-09-22T06:17:00.000Z","updated_at":"2026-09-22T06:17:00.000Z","started_at":null,"completed_at":null,"blockedBy":[],"blocks":[],"children":[]}
{"id":"79n12xde","parent_id":"6xjrehjc","name":"Audio via saudio, returned as data","description":"x","priority":1,"completed":false,"result":null,"metadata":{},"created_at":"2026-09-22T06:18:00.000Z","updated_at":"2026-09-22T06:18:00.000Z","started_at":null,"completed_at":null,"blockedBy":[],"blocks":[],"children":[]}
```

- [ ] **Step 2: Write the failing tests**

`test/dex.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npm test -- test/dex.test.ts`
Expected: FAIL, `Cannot find module '../src/lib/dex'` or similar.

- [ ] **Step 4: Write `src/lib/dex.ts`**

```ts
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
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm test -- test/dex.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dex.ts test/dex.test.ts test/fixtures/tasks.jsonl
git commit -m "feat(dex): Parse the dex log into milestones and side shoots

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Read the dex source

**Files:**
- Create: `src/lib/dex-source.ts`, `test/dex-source.test.ts`

**Interfaces:**
- Consumes: `DexError` from `src/lib/dex.ts`.
- Produces:
  - `type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; text(): Promise<string>; json(): Promise<unknown> }>`
  - `readDexSource(options?: { source?: string; token?: string; fetch?: FetchLike; readFile?: (path: string) => Promise<string> }): Promise<{ text: string; origin: string }>`

- [ ] **Step 1: Write the failing tests**

`test/dex-source.test.ts`:

```ts
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readDexSource, type FetchLike } from '../src/lib/dex-source';

const API = 'https://api.github.com/repos/Pixelsprout/rocco-engine/commits/main';
const SHA = 'abc1234def5678abc1234def5678abc1234def56';
const RAW = `https://raw.githubusercontent.com/Pixelsprout/rocco-engine/${SHA}/.dex/tasks.jsonl`;

type Call = { url: string; headers?: Record<string, string> };

function fakeFetch(routes: Record<string, { status: number; body: unknown }>) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: init?.headers });
    const route = routes[url];
    if (!route) throw new Error(`boom: ${url}`);
    return {
      ok: route.status >= 200 && route.status < 300,
      status: route.status,
      text: async () => String(route.body),
      json: async () => route.body,
    };
  };
  return { fetch, calls };
}

describe('readDexSource', () => {
  it('pins the raw fetch to the latest main commit', async () => {
    const { fetch, calls } = fakeFetch({ [API]: { status: 200, body: { sha: SHA } }, [RAW]: { status: 200, body: 'LOG' } });
    const result = await readDexSource({ fetch });
    expect(result).toEqual({ text: 'LOG', origin: 'Pixelsprout/rocco-engine@abc1234' });
    expect(calls.map((c) => c.url)).toEqual([API, RAW]);
    expect(calls[0].headers?.Accept).toBe('application/vnd.github+json');
    expect(calls[0].headers?.Authorization).toBeUndefined();
  });

  it('sends GITHUB_TOKEN as a bearer token', async () => {
    const { fetch, calls } = fakeFetch({ [API]: { status: 200, body: { sha: SHA } }, [RAW]: { status: 200, body: 'LOG' } });
    await readDexSource({ fetch, token: 't0k' });
    expect(calls[0].headers?.Authorization).toBe('Bearer t0k');
  });

  it('names GITHUB_TOKEN when the API refuses with 403', async () => {
    const { fetch } = fakeFetch({ [API]: { status: 403, body: {} } });
    await expect(readDexSource({ fetch })).rejects.toThrow(/returned 403\. Set GITHUB_TOKEN/);
  });

  it('fails when the API returns no sha', async () => {
    const { fetch } = fakeFetch({ [API]: { status: 200, body: {} } });
    await expect(readDexSource({ fetch })).rejects.toThrow(/no commit sha/);
  });

  it('names the raw URL and status when the file fetch fails', async () => {
    const { fetch } = fakeFetch({ [API]: { status: 200, body: { sha: SHA } }, [RAW]: { status: 404, body: '' } });
    await expect(readDexSource({ fetch })).rejects.toThrow(`${RAW} returned 404`);
  });

  it('wraps network errors with the URL', async () => {
    const { fetch } = fakeFetch({});
    await expect(readDexSource({ fetch })).rejects.toThrow(`Fetching ${API} failed: boom`);
  });

  it('fetches a DEX_SOURCE URL directly', async () => {
    const url = 'https://example.com/tasks.jsonl';
    const { fetch, calls } = fakeFetch({ [url]: { status: 200, body: 'LOG' } });
    expect(await readDexSource({ fetch, source: url })).toEqual({ text: 'LOG', origin: url });
    expect(calls.map((c) => c.url)).toEqual([url]);
  });

  it('reads a DEX_SOURCE path and expands ~', async () => {
    const seen: string[] = [];
    const readFile = async (path: string) => { seen.push(path); return 'LOG'; };
    await readDexSource({ source: '~/rocco/.dex/tasks.jsonl', readFile });
    expect(seen).toEqual([join(homedir(), 'rocco/.dex/tasks.jsonl')]);
  });

  it('names the path when a DEX_SOURCE file cannot be read', async () => {
    const readFile = async () => { throw new Error('ENOENT'); };
    await expect(readDexSource({ source: './missing.jsonl', readFile })).rejects.toThrow(
      /Cannot read DEX_SOURCE \.\/missing\.jsonl: ENOENT/,
    );
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- test/dex-source.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `src/lib/dex-source.ts`**

```ts
import { readFile as readFileFromDisk } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DexError } from './dex';

const REPO = 'Pixelsprout/rocco-engine';
const LOG_PATH = '.dex/tasks.jsonl';

type FetchResponse = { ok: boolean; status: number; text(): Promise<string>; json(): Promise<unknown> };
export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<FetchResponse>;

export type DexSourceOptions = {
  source?: string;
  token?: string;
  fetch?: FetchLike;
  readFile?: (path: string) => Promise<string>;
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function request(fetcher: FetchLike, url: string, headers?: Record<string, string>): Promise<FetchResponse> {
  try {
    return await fetcher(url, { headers });
  } catch (error) {
    throw new DexError(`Fetching ${url} failed: ${message(error)}`);
  }
}

async function fetchText(fetcher: FetchLike, url: string): Promise<string> {
  const res = await request(fetcher, url);
  if (!res.ok) throw new DexError(`${url} returned ${res.status}`);
  return res.text();
}

async function readPath(readFile: (path: string) => Promise<string>, source: string): Promise<string> {
  const path = source.startsWith('~/') ? join(homedir(), source.slice(2)) : source;
  try {
    return await readFile(path);
  } catch (error) {
    throw new DexError(`Cannot read DEX_SOURCE ${source}: ${message(error)}`);
  }
}

export async function readDexSource(options: DexSourceOptions = {}): Promise<{ text: string; origin: string }> {
  const fetcher = options.fetch ?? (globalThis.fetch as unknown as FetchLike);
  const readFile = options.readFile ?? ((path: string) => readFileFromDisk(path, 'utf8'));

  if (options.source) {
    const text = /^https?:\/\//.test(options.source)
      ? await fetchText(fetcher, options.source)
      : await readPath(readFile, options.source);
    return { text, origin: options.source };
  }

  // A branch URL on raw.githubusercontent.com is cached for up to 5 minutes; a commit URL is not stale.
  const api = `https://api.github.com/repos/${REPO}/commits/main`;
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const res = await request(fetcher, api, headers);
  if (!res.ok) {
    const hint = res.status === 403 || res.status === 429 ? ' Set GITHUB_TOKEN to raise the rate limit.' : '';
    throw new DexError(`GET ${api} returned ${res.status}.${hint}`);
  }
  const { sha } = (await res.json()) as { sha?: unknown };
  if (typeof sha !== 'string') throw new DexError(`GET ${api} returned no commit sha`);

  const text = await fetchText(fetcher, `https://raw.githubusercontent.com/${REPO}/${sha}/${LOG_PATH}`);
  return { text, origin: `${REPO}@${sha.slice(0, 7)}` };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -- test/dex-source.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dex-source.ts test/dex-source.test.ts
git commit -m "feat(dex): Read the dex log pinned to the latest main commit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Growth maths

**Files:**
- Create: `src/lib/garden.ts`, `test/garden.test.ts`

**Interfaces:**
- Consumes: `GardenEntry`, `parseDex` from `src/lib/dex.ts`.
- Produces:
  - `type Growth = { total: number; slots: number[]; flowering: boolean }`
  - `type EntryState = 'grown' | 'growing' | 'seed'`
  - `OPEN_MILESTONE_CAP = 0.9`
  - `endOfUtcDay(date: Date): Date`
  - `entryShare(entry: GardenEntry, at: Date): number`
  - `growthAt(garden: GardenEntry[], at: Date): Growth`
  - `entryStates(garden: GardenEntry[], at: Date): Map<string, EntryState>`
  - `growthLine(previous: number, current: number, project?: string): string`

- [ ] **Step 1: Write the failing tests**

`test/garden.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDex, type GardenEntry } from '../src/lib/dex';
import { endOfUtcDay, entryStates, growthAt, growthLine, OPEN_MILESTONE_CAP } from '../src/lib/garden';

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
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- test/garden.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `src/lib/garden.ts`**

```ts
import type { GardenEntry } from './dex';

export type Growth = { total: number; slots: number[]; flowering: boolean };
export type EntryState = 'grown' | 'growing' | 'seed';

// An open milestone never draws as a full leaf, even when every subtask is done.
export const OPEN_MILESTONE_CAP = 0.9;

export function endOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

const doneBy = (completedAt: Date | null, at: Date) => completedAt !== null && completedAt.getTime() <= at.getTime();

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
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -- test/garden.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/garden.ts test/garden.test.ts
git commit -m "feat(garden): Compute plant growth from dex completion dates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Plant pixels

**Files:**
- Create: `src/lib/plant.ts`, `test/plant.test.ts`

**Interfaces:**
- Produces:
  - `type Rect = { x: number; y: number; w: number; h: number; fill: string }`
  - `PLANT_COLS = 16`, `PLANT_ROWS = 24`, `PLANT_COLOURS` (named fills)
  - `plantRects(slots: number[], flowering: boolean): Rect[]`
  - `plantLabel(project: string, total: number, count: number): string`

Leaf slot k (1 to 6) sits at row `17 - 2k - 1`. Odd slots grow left, even slots grow right. Slot 7 is the tip: a clay bud while it is partial, and a flower when the plant flowers. This matches the canvas `Plant.dc.html`.

- [ ] **Step 1: Write the failing tests**

`test/plant.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PLANT_COLOURS as C, PLANT_COLS, PLANT_ROWS, plantLabel, plantRects, type Rect } from '../src/lib/plant';

const zeros = [0, 0, 0, 0, 0, 0, 0];
const withSlots = (...leading: number[]) => [...leading, ...zeros].slice(0, 7);
const stem = (rects: Rect[]) => rects.find((r) => r.fill === C.stemDark);
const fullLeaves = (rects: Rect[]) => rects.filter((r) => r.fill === C.leaf && r.w === 3);

describe('plantRects', () => {
  it('draws only the pot at growth 0', () => {
    const rects = plantRects(zeros, false);
    expect(rects).toHaveLength(5);
    expect(stem(rects)).toBeUndefined();
  });

  it('draws a 1-pixel bud below half a milestone', () => {
    const rects = plantRects(withSlots(0.4), false);
    expect(rects).toContainEqual({ x: 6, y: 15, w: 1, h: 1, fill: C.tip });
    expect(stem(rects)?.y).toBe(14);
  });

  it('draws a half leaf from half a milestone', () => {
    expect(plantRects(withSlots(0.5), false)).toContainEqual({ x: 5, y: 15, w: 2, h: 1, fill: C.leaf });
  });

  it('draws three full leaves and a green tip at stage 3', () => {
    const rects = plantRects(withSlots(1, 1, 1), false);
    expect(fullLeaves(rects)).toHaveLength(3);
    expect(stem(rects)?.y).toBe(10);
    expect(rects).toContainEqual({ x: 7, y: 9, w: 2, h: 1, fill: C.tip });
  });

  it('draws the fourth leaf on the right as a half leaf at 3.5', () => {
    const rects = plantRects(withSlots(1, 1, 1, 0.5), false);
    expect(rects).toContainEqual({ x: 9, y: 9, w: 2, h: 1, fill: C.leaf });
    expect(stem(rects)?.y).toBe(8);
  });

  it('draws a clay bud while milestone 7 is partial', () => {
    const rects = plantRects([1, 1, 1, 1, 1, 1, 0.5], false);
    expect(fullLeaves(rects)).toHaveLength(6);
    expect(rects).toContainEqual({ x: 7, y: 2, w: 2, h: 1, fill: C.petal });
  });

  it('draws six leaves and a flower when flowering', () => {
    const rects = plantRects([1, 1, 1, 1, 1, 1, 1], true);
    expect(fullLeaves(rects)).toHaveLength(6);
    expect(rects).toContainEqual({ x: 7, y: 1, w: 2, h: 2, fill: C.centre });
    expect(stem(rects)?.y).toBe(3);
  });

  it('keeps every rect inside the grid', () => {
    const cases: [number[], boolean][] = [[zeros, false], [withSlots(0.4), false], [withSlots(1, 1, 1, 0.5), false], [[1, 1, 1, 1, 1, 1, 0.5], false], [[1, 1, 1, 1, 1, 1, 1], true]];
    for (const [slots, flowering] of cases) {
      for (const r of plantRects(slots, flowering)) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(PLANT_COLS);
        expect(r.y + r.h).toBeLessThanOrEqual(PLANT_ROWS);
      }
    }
  });
});

describe('plantLabel', () => {
  it('names the stage to one decimal', () => {
    expect(plantLabel('rocco', 3.5, 7)).toBe('rocco plant, stage 3.5 of 7');
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- test/plant.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `src/lib/plant.ts`**

```ts
export type Rect = { x: number; y: number; w: number; h: number; fill: string };

export const PLANT_COLS = 16;
export const PLANT_ROWS = 24;

export const PLANT_COLOURS = {
  stemDark: '#2F6B3A',
  stem: '#3E8E41',
  leaf: '#6DBE4F',
  tip: '#9BD46B',
  petal: '#F0A070',
  centre: '#F6E27A',
  rim: '#C8643A',
  soil: '#4A3326',
  pot: '#E0834F',
  potShade: '#A94F2C',
} as const;

const C = PLANT_COLOURS;
const LEAF_SLOTS = 6;
const SOIL_ROW = 17;

function leafRects(slot: number, share: number): Rect[] {
  if (share <= 0) return [];
  const y = SOIL_ROW - 2 * slot - 1;
  const left = slot % 2 === 1;
  if (share >= 1) {
    return left
      ? [{ x: 4, y, w: 3, h: 2, fill: C.leaf }, { x: 4, y: y + 1, w: 1, h: 1, fill: C.stem }]
      : [{ x: 9, y, w: 3, h: 2, fill: C.leaf }, { x: 11, y: y + 1, w: 1, h: 1, fill: C.stem }];
  }
  if (share >= 0.5) return [{ x: left ? 5 : 9, y: y + 1, w: 2, h: 1, fill: C.leaf }];
  return [{ x: left ? 6 : 9, y: y + 1, w: 1, h: 1, fill: C.tip }];
}

const flowerRects = (): Rect[] => [
  { x: 7, y: 0, w: 2, h: 1, fill: C.petal },
  { x: 6, y: 1, w: 4, h: 2, fill: C.petal },
  { x: 7, y: 3, w: 2, h: 1, fill: C.petal },
  { x: 7, y: 1, w: 2, h: 2, fill: C.centre },
];

const potRects = (): Rect[] => [
  { x: 2, y: 17, w: 12, h: 2, fill: C.rim },
  { x: 3, y: 17, w: 10, h: 1, fill: C.soil },
  { x: 3, y: 19, w: 10, h: 4, fill: C.pot },
  { x: 3, y: 19, w: 10, h: 1, fill: C.potShade },
  { x: 4, y: 23, w: 8, h: 1, fill: C.rim },
];

export function plantRects(slots: number[], flowering: boolean): Rect[] {
  const shown = slots.slice(0, LEAF_SLOTS + 1);
  const lastStarted = shown.reduce((last, share, i) => (share > 0 ? i + 1 : last), 0);
  const rects: Rect[] = [];

  if (lastStarted > 0 || flowering) {
    const top = flowering || lastStarted > LEAF_SLOTS ? 3 : SOIL_ROW - (1 + 2 * lastStarted);
    rects.push(
      { x: 7, y: top, w: 2, h: SOIL_ROW - top, fill: C.stemDark },
      { x: 7, y: top, w: 1, h: SOIL_ROW - top, fill: C.stem },
    );
    shown.slice(0, LEAF_SLOTS).forEach((share, i) => rects.push(...leafRects(i + 1, share)));
    if (flowering) rects.push(...flowerRects());
    else if (lastStarted > LEAF_SLOTS) rects.push({ x: 7, y: 2, w: 2, h: 1, fill: C.petal });
    else rects.push({ x: 7, y: top - 1, w: 2, h: 1, fill: C.tip });
  }

  return [...rects, ...potRects()];
}

export function plantLabel(project: string, total: number, count: number): string {
  return `${project} plant, stage ${total.toFixed(1)} of ${count}`;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -- test/plant.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plant.ts test/plant.test.ts
git commit -m "feat(plant): Draw the pixel plant from milestone shares

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Post rules

**Files:**
- Create: `src/lib/post-meta.ts`, `test/post-meta.test.ts`

**Interfaces:**
- Produces:
  - `type PostData = { title: string; date: Date; summary: string; project: string; milestone?: number; commits: string[]; draft: boolean }`
  - `type PostLike = { id: string; data: PostData }`
  - `showDrafts(env: { dev: boolean; vercelEnv?: string }): boolean`
  - `slugOf(post: PostLike): string`
  - `tagOf(post: PostLike): string`
  - `commitUrl(hash: string): string`
  - `formatDate(date: Date): string` → `YYYY-MM-DD` in UTC
  - `visiblePosts<T extends PostLike>(posts: T[], drafts: boolean): T[]` → newest first, ties by `id`
  - `assertPosts(posts: PostLike[], milestoneNumbers: number[]): void`

- [ ] **Step 1: Write the failing tests**

`test/post-meta.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  assertPosts, commitUrl, formatDate, showDrafts, slugOf, tagOf, visiblePosts, type PostLike,
} from '../src/lib/post-meta';

function post(id: string, date: string, extra: Partial<PostLike['data']> = {}): PostLike {
  return { id, data: { title: id, date: new Date(date), summary: 's', project: 'rocco', commits: [], draft: false, ...extra } };
}

describe('showDrafts', () => {
  it('shows drafts in dev and on preview deployments only', () => {
    expect(showDrafts({ dev: true })).toBe(true);
    expect(showDrafts({ dev: false, vercelEnv: 'preview' })).toBe(true);
    expect(showDrafts({ dev: false, vercelEnv: 'production' })).toBe(false);
    expect(showDrafts({ dev: false })).toBe(false);
  });
});

describe('slugs, tags and links', () => {
  it('uses the file name as the slug', () => {
    expect(slugOf(post('rocco/mesh-handles', '2026-09-28'))).toBe('mesh-handles');
  });

  it('tags a post by milestone, else notes', () => {
    expect(tagOf(post('a', '2026-09-28', { milestone: 3 }))).toBe('m3');
    expect(tagOf(post('a', '2026-09-28'))).toBe('notes');
  });

  it('links a commit on GitHub', () => {
    expect(commitUrl('9039d52')).toBe('https://github.com/Pixelsprout/rocco-engine/commit/9039d52');
  });

  it('formats dates in UTC', () => {
    expect(formatDate(new Date('2026-09-28T23:30:00.000Z'))).toBe('2026-09-28');
  });
});

describe('visiblePosts', () => {
  const posts = [
    post('rocco/b', '2026-09-28'),
    post('rocco/old', '2026-09-22'),
    post('rocco/draft', '2026-09-30', { draft: true }),
    post('rocco/a', '2026-09-28'),
  ];

  it('hides drafts and sorts newest first, ties by id', () => {
    expect(visiblePosts(posts, false).map((p) => p.id)).toEqual(['rocco/a', 'rocco/b', 'rocco/old']);
  });

  it('includes drafts when asked', () => {
    expect(visiblePosts(posts, true).map((p) => p.id)).toEqual(['rocco/draft', 'rocco/a', 'rocco/b', 'rocco/old']);
  });
});

describe('assertPosts', () => {
  it('accepts posts with known milestones and unique slugs', () => {
    expect(() => assertPosts([post('rocco/a', '2026-09-28', { milestone: 3 }), post('rocco/b', '2026-09-28')], [1, 2, 3])).not.toThrow();
  });

  it('names both files when two posts share a slug', () => {
    expect(() => assertPosts([post('rocco/intro', '2026-09-28'), post('other/intro', '2026-09-28')], [1])).toThrow(
      'Posts rocco/intro and other/intro share the slug "intro"',
    );
  });

  it('names a milestone that dex does not have', () => {
    expect(() => assertPosts([post('rocco/a', '2026-09-28', { milestone: 9 })], [1, 2])).toThrow(
      'Post rocco/a names milestone 9, which dex does not have',
    );
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- test/post-meta.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `src/lib/post-meta.ts`**

```ts
export type PostData = {
  title: string;
  date: Date;
  summary: string;
  project: string;
  milestone?: number;
  commits: string[];
  draft: boolean;
};

export type PostLike = { id: string; data: PostData };

const REPO_URL = 'https://github.com/Pixelsprout/rocco-engine';

export function showDrafts(env: { dev: boolean; vercelEnv?: string }): boolean {
  return env.dev || env.vercelEnv === 'preview';
}

export function slugOf(post: PostLike): string {
  return post.id.split('/').pop()!;
}

export function tagOf(post: PostLike): string {
  return post.data.milestone ? `m${post.data.milestone}` : 'notes';
}

export function commitUrl(hash: string): string {
  return `${REPO_URL}/commit/${hash}`;
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function visiblePosts<T extends PostLike>(posts: T[], drafts: boolean): T[] {
  return posts
    .filter((p) => drafts || !p.data.draft)
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime() || a.id.localeCompare(b.id));
}

export function assertPosts(posts: PostLike[], milestoneNumbers: number[]): void {
  const seen = new Map<string, string>();
  for (const post of posts) {
    const slug = slugOf(post);
    const other = seen.get(slug);
    if (other) throw new Error(`Posts ${other} and ${post.id} share the slug "${slug}"`);
    seen.set(slug, post.id);
    const { milestone } = post.data;
    if (milestone !== undefined && !milestoneNumbers.includes(milestone)) {
      throw new Error(`Post ${post.id} names milestone ${milestone}, which dex does not have`);
    }
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -- test/post-meta.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/post-meta.ts test/post-meta.test.ts
git commit -m "feat(posts): Add draft, slug, tag and ordering rules for posts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Collections and the dex loader

**Files:**
- Create: `src/content.config.ts`, `src/loaders/dex.ts`, `src/lib/content.ts`, `test/fixtures/posts/rocco/published-post.mdx`, `test/fixtures/posts/rocco/draft-post.mdx`, `test/fixtures/empty-posts/.gitkeep`

**Interfaces:**
- Consumes: `parseDex` (Task 2), `readDexSource` (Task 3), `assertPosts`, `showDrafts`, `visiblePosts` (Task 6).
- Produces:
  - Collections `posts` and `garden`.
  - `type Post = CollectionEntry<'posts'>`
  - `getGarden(): Promise<GardenEntry[]>`: milestones by number, then sides by title.
  - `getPosts(): Promise<Post[]>`: checked, visible, newest first.
  - Env vars: `DEX_SOURCE`, `GITHUB_TOKEN`, `POSTS_DIR` (test-only override of the posts folder).

- [ ] **Step 1: Write `src/loaders/dex.ts`**

```ts
import type { Loader } from 'astro/loaders';
import { parseDex } from '../lib/dex';
import { readDexSource } from '../lib/dex-source';

export function dexLoader(): Loader {
  return {
    name: 'dex',
    load: async ({ store, parseData, logger }) => {
      const { text, origin } = await readDexSource({
        source: process.env.DEX_SOURCE,
        token: process.env.GITHUB_TOKEN,
      });
      const entries = parseDex(text);
      store.clear();
      for (const { id, ...data } of entries) {
        store.set({ id, data: await parseData({ id, data }) });
      }
      logger.info(`Loaded ${entries.length} garden entries from ${origin}`);
    },
  };
}
```

- [ ] **Step 2: Write `src/content.config.ts`**

```ts
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { dexLoader } from './loaders/dex';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: process.env.POSTS_DIR ?? './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    summary: z.string(),
    project: z.string().default('rocco'),
    milestone: z.number().int().min(1).optional(),
    commits: z.array(z.string().regex(/^[0-9a-f]{7,40}$/)).default([]),
    draft: z.boolean().default(false),
  }),
});

const task = z.object({ name: z.string(), completed: z.boolean(), completedAt: z.date().nullable() });

const garden = defineCollection({
  loader: dexLoader(),
  schema: z.object({
    kind: z.enum(['milestone', 'side']),
    number: z.number().int().optional(),
    title: z.string(),
    completed: z.boolean(),
    completedAt: z.date().nullable(),
    tasks: z.array(task),
  }),
});

export const collections = { posts, garden };
```

- [ ] **Step 3: Write `src/lib/content.ts`**

```ts
import { getCollection, type CollectionEntry } from 'astro:content';
import type { GardenEntry } from './dex';
import { assertPosts, showDrafts, visiblePosts } from './post-meta';

export type Post = CollectionEntry<'posts'>;

export async function getGarden(): Promise<GardenEntry[]> {
  const entries = await getCollection('garden');
  const order = (e: GardenEntry) => (e.kind === 'milestone' ? e.number! : Number.MAX_SAFE_INTEGER);
  return entries
    .map((e) => ({ id: e.id, ...e.data }))
    .sort((a, b) => order(a) - order(b) || a.title.localeCompare(b.title));
}

export async function getPosts(): Promise<Post[]> {
  const [all, garden] = await Promise.all([getCollection('posts'), getGarden()]);
  assertPosts(all, garden.filter((g) => g.kind === 'milestone').map((g) => g.number!));
  return visiblePosts(all, showDrafts({ dev: import.meta.env.DEV, vercelEnv: process.env.VERCEL_ENV }));
}
```

- [ ] **Step 4: Write the fixture posts**

`test/fixtures/posts/rocco/published-post.mdx`:

````mdx
---
title: Published post title
date: 2026-09-28
summary: A published fixture post.
milestone: 3
commits: ["9039d52", "14b10ee"]
---

## First section

Fixture text.

```roc title="packages/meshes/Meshes.roc"
# A name the engine did not load resolves to 0.
named : Config, Str -> U32
```

<Check>a misspelt mesh name draws magenta and logs once.</Check>
````

`test/fixtures/posts/rocco/draft-post.mdx`:

```mdx
---
title: Draft post title
date: 2026-09-29
summary: A draft fixture post.
draft: true
---

## Draft section

Draft text.
```

Create an empty `test/fixtures/empty-posts/.gitkeep`.

- [ ] **Step 5: Sync against the fixture and against GitHub**

Run: `DEX_SOURCE=test/fixtures/tasks.jsonl POSTS_DIR=test/fixtures/posts npx astro sync`
Expected: exit 0 and a log line `Loaded 9 garden entries from test/fixtures/tasks.jsonl`.

Run: `POSTS_DIR=test/fixtures/posts npx astro sync`
Expected: exit 0 and `Loaded <n> garden entries from Pixelsprout/rocco-engine@<7 hex>`. If the result is a 403, set `GITHUB_TOKEN` and run it again.

- [ ] **Step 6: Check that a bad source fails the build**

Run: `DEX_SOURCE=./nope.jsonl npx astro sync; echo "exit $?"`
Expected: `Cannot read DEX_SOURCE ./nope.jsonl` and `exit 1`.

- [ ] **Step 7: Type-check**

Run: `DEX_SOURCE=test/fixtures/tasks.jsonl npm run check`
Expected: `0 errors`.

- [ ] **Step 8: Commit**

```bash
git add src/content.config.ts src/loaders/dex.ts src/lib/content.ts test/fixtures/posts test/fixtures/empty-posts
git commit -m "feat(content): Add the posts and garden collections and the dex loader

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Base layout, tokens and contrast check

**Files:**
- Create: `src/styles/global.css`, `src/layouts/Base.astro`, `src/components/SiteHeader.astro`, `src/components/SiteFooter.astro`, `src/components/Prompt.astro`, `test/contrast.ts`, `test/contrast.test.ts`
- Modify: `src/pages/index.astro` (temporary use of `Base`)

**Interfaces:**
- Produces:
  - `Base` layout: props `{ title: string; description?: string }`, one default slot.
  - `Prompt` component: props `{ command: string; path?: string }`, default path `~/pixelsprout`.
  - Global classes: `.pixel-frame`, `.code`, `.code-bar`, `.copy`, `.soil-strip`.
  - CSS tokens (spec 6).

- [ ] **Step 1: Write the contrast helper and the failing contrast test**

`test/contrast.ts` is a helper, not a test file, so Task 10 can import it without running these tests twice:

```ts
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
```

`test/contrast.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrast } from './contrast';

const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
const token = (name: string): string => {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!match) throw new Error(`token --${name} not found`);
  return match[1];
};

describe('text contrast', () => {
  const texts = ['text', 'text-muted', 'text-faint', 'sprout', 'clay'];
  const backgrounds = ['soil', 'soil-raised', 'soil-deep', 'soil-bar'];
  for (const fg of texts) {
    for (const bg of backgrounds) {
      it(`--${fg} on --${bg} reaches 4.5:1`, () => {
        expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npm test -- test/contrast.test.ts`
Expected: FAIL, `ENOENT` for `global.css`.

- [ ] **Step 3: Write `src/styles/global.css`**

```css
:root {
  --soil: #1B1410;
  --soil-raised: #241A14;
  --soil-deep: #120D0A;
  --soil-bar: #2E221A;
  --edge: #3A2C22;
  --text: #EDE3CC;
  --text-muted: #A8977F;
  --text-faint: #9A8872;
  --sprout: #9BD46B;
  --clay: #F0A070;
  --font-pixel: 'Pixelify Sans', ui-monospace, monospace;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;
  color-scheme: dark;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--soil);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 16px;
  line-height: 1.7;
}

a { color: var(--sprout); text-decoration: none; }
a:hover { color: var(--clay); text-decoration: underline; }
a:focus-visible, button:focus-visible { outline: 2px solid var(--clay); outline-offset: 2px; }

h1, h2, h3 { font-family: var(--font-pixel); font-weight: 600; line-height: 1.15; margin: 0; }

.page {
  max-width: 1040px;
  min-height: 100vh;
  margin: 0 auto;
  padding: 64px 24px;
  display: flex;
  flex-direction: column;
  gap: 48px;
}

main { display: flex; flex-direction: column; gap: 48px; flex-grow: 1; }

.pixel-frame {
  box-shadow: 0 -4px 0 0 var(--edge), 0 4px 0 0 var(--edge), -4px 0 0 0 var(--edge), 4px 0 0 0 var(--edge);
}

.soil-strip { align-self: stretch; height: 12px; background: #4A3326; box-shadow: inset 0 4px 0 0 #5E3B25; }

.code { margin: 0; }
.code-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 32px;
  padding: 4px 16px;
  background: var(--soil-bar);
  color: var(--text-muted);
  font-size: 12px;
}
.code-bar:empty { display: none; }
.code .astro-code { margin: 0; padding: 18px 20px; font-size: 14px; line-height: 1.65; overflow-x: auto; }
.copy {
  margin-left: auto;
  min-height: 24px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--sprout);
  font: inherit;
  cursor: pointer;
}

@media (max-width: 720px) {
  .page { padding: 20px 16px 28px; gap: 32px; }
  main { gap: 32px; }
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `npm test -- test/contrast.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 5: Write `src/components/Prompt.astro`**

```astro
---
type Props = { command: string; path?: string };
const { command, path = '~/pixelsprout' } = Astro.props;
---
<div class="prompt"><span class="path">{path}</span> $ {command}</div>

<style>
  .prompt { color: var(--text-muted); font-size: 14px; overflow-wrap: anywhere; }
  .path { color: var(--sprout); }
</style>
```

- [ ] **Step 6: Write `src/components/SiteHeader.astro`**

The canvas phone view shows a menu button. That needs JavaScript, so on phones the links wrap below the logo instead.

```astro
---
const links = [
  { href: '/devlog/', label: './devlog' },
  { href: '/projects/', label: './projects' },
  { href: '/rss.xml', label: 'rss.xml' },
  { href: 'https://github.com/Pixelsprout', label: 'github' },
];
const path = Astro.url.pathname;
---
<header class="site-header">
  <a class="brand" href="/">
    <img src="/pixelsprout.png" alt="" width="40" height="40" />
    <span>pixelsprout<span class="cursor">_</span></span>
  </a>
  <nav aria-label="Site">
    {links.map((link) => (
      <a href={link.href} aria-current={path.startsWith(link.href) ? 'page' : undefined}>{link.label}</a>
    ))}
  </nav>
</header>

<style>
  .site-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 24px;
    padding-bottom: 20px;
    border-bottom: 2px solid var(--edge);
  }
  .brand { display: flex; align-items: center; gap: 14px; color: var(--text); text-decoration: none; }
  .brand:hover { text-decoration: none; }
  .brand img { image-rendering: pixelated; }
  .brand > span { font-family: var(--font-pixel); font-size: 26px; font-weight: 600; }
  .cursor { color: var(--sprout); }
  nav { display: flex; flex-wrap: wrap; gap: 0 24px; font-size: 14px; }
  nav a { min-height: 44px; display: inline-flex; align-items: center; }
  nav a[aria-current='page'] { color: var(--clay); }
  @media (max-width: 720px) {
    .brand img { width: 32px; height: 32px; }
    .brand > span { font-size: 22px; }
    nav { gap: 0 16px; }
  }
</style>
```

- [ ] **Step 7: Write `src/components/SiteFooter.astro`**

```astro
<footer class="site-footer">
  <span>exit 0 · grown by hand</span>
  <span><a href="/rss.xml">rss</a> · <a href="https://github.com/Pixelsprout">github</a></span>
</footer>

<style>
  .site-footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 6px 24px;
    padding-top: 20px;
    border-top: 2px solid var(--edge);
    color: var(--text-muted);
    font-size: 12px;
  }
</style>
```

- [ ] **Step 8: Write `src/layouts/Base.astro`**

```astro
---
import '@fontsource/pixelify-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import '../styles/global.css';
import SiteHeader from '../components/SiteHeader.astro';
import SiteFooter from '../components/SiteFooter.astro';

type Props = { title: string; description?: string };
const {
  title,
  description = 'Pixelsprout: building rocco, a 3D engine in Odin that runs games written in Roc.',
} = Astro.props;
const pageTitle = title === 'pixelsprout' ? title : `${title} · pixelsprout`;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{pageTitle}</title>
    <meta name="description" content={description} />
    <link rel="icon" type="image/png" href="/pixelsprout.png" />
    <link rel="alternate" type="application/rss+xml" title="pixelsprout devlog" href="/rss.xml" />
    <link rel="canonical" href={new URL(Astro.url.pathname, Astro.site)} />
  </head>
  <body>
    <div class="page">
      <SiteHeader />
      <main><slot /></main>
      <SiteFooter />
    </div>
    <script is:inline>
      document.querySelectorAll('.code').forEach((frame) => {
        const bar = frame.querySelector('.code-bar');
        const code = frame.querySelector('pre code');
        if (!bar || !code || !navigator.clipboard) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'copy';
        button.textContent = 'copy';
        button.addEventListener('click', async () => {
          await navigator.clipboard.writeText(code.textContent || '');
          button.textContent = 'copied';
          setTimeout(() => { button.textContent = 'copy'; }, 1500);
        });
        bar.append(button);
      });
    </script>
  </body>
</html>
```

- [ ] **Step 9: Use `Base` on the scaffold homepage**

Replace `src/pages/index.astro`:

```astro
---
import Base from '../layouts/Base.astro';
---
<Base title="pixelsprout"><p>soil ready</p></Base>
```

- [ ] **Step 10: Build and look**

Run: `DEX_SOURCE=test/fixtures/tasks.jsonl npm run build && grep -c 'pixelsprout_' dist/index.html`
Expected: exit 0 and `1`.

Run `DEX_SOURCE=test/fixtures/tasks.jsonl npm run dev`. Open `http://localhost:4321/` at desktop width and at 390px width. Expected: dark soil background, pixel-font logo, and nav links that wrap below the logo at 390px.

- [ ] **Step 11: Commit**

```bash
git add src/styles/global.css src/layouts/Base.astro src/components/SiteHeader.astro src/components/SiteFooter.astro src/components/Prompt.astro src/pages/index.astro test/contrast.ts test/contrast.test.ts
git commit -m "feat(layout): Add the Soil Terminal tokens, base layout and contrast test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Plant, status panel, git log and homepage

**Files:**
- Create: `src/components/Plant.astro`, `src/components/StatusPanel.astro`, `src/components/GitLog.astro`
- Modify: `src/pages/index.astro`

**Interfaces:**
- Consumes: `plantRects`, `plantLabel`, `PLANT_COLS`, `PLANT_ROWS` (Task 5); `growthAt`, `entryStates` (Task 4); `getGarden`, `getPosts`, `Post` (Task 7); `formatDate`, `slugOf`, `tagOf` (Task 6); `Base`, `Prompt` (Task 8).
- Produces:
  - `Plant`: props `{ slots: number[]; flowering: boolean; label: string; cell: number; class?: string }`
  - `StatusPanel`: props `{ garden: GardenEntry[]; at: Date; detailed?: boolean }`
  - `GitLog`: props `{ posts: Post[] }`. When empty it shows `nothing published yet`.

- [ ] **Step 1: Write `src/components/Plant.astro`**

```astro
---
import { PLANT_COLS, PLANT_ROWS, plantRects } from '../lib/plant';

type Props = { slots: number[]; flowering: boolean; label: string; cell: number; class?: string };
const { slots, flowering, label, cell, class: className } = Astro.props;
const rects = plantRects(slots, flowering);
---
<svg
  class:list={['plant', className]}
  width={PLANT_COLS * cell}
  height={PLANT_ROWS * cell}
  viewBox={`0 0 ${PLANT_COLS} ${PLANT_ROWS}`}
  shape-rendering="crispEdges"
  role="img"
  aria-label={label}
>
  {rects.map((r) => <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} />)}
</svg>
```

- [ ] **Step 2: Write `src/components/StatusPanel.astro`**

```astro
---
import Plant from './Plant.astro';
import Prompt from './Prompt.astro';
import type { GardenEntry } from '../lib/dex';
import { entryStates, growthAt } from '../lib/garden';
import { plantLabel } from '../lib/plant';

type Props = { garden: GardenEntry[]; at: Date; detailed?: boolean };
const { garden, at, detailed = false } = Astro.props;
const growth = growthAt(garden, at);
const states = entryStates(garden, at);
const marks = { grown: '[x]', growing: '[~]', seed: '[ ]' } as const;
---
<section class="status pixel-frame">
  <div class="planter">
    <Plant
      slots={growth.slots}
      flowering={growth.flowering}
      cell={12}
      label={plantLabel('rocco', growth.total, growth.slots.length)}
    />
    <div class="soil-strip"></div>
  </div>
  <div class="report">
    <Prompt command="rocco status --roadmap" />
    <div class="stage">
      <span class="stage-number">stage {Math.floor(growth.total)}/{growth.slots.length}</span>
      <span class="hint">one leaf per milestone</span>
    </div>
    <ul class="checklist">
      {garden.map((entry) => {
        const state = states.get(entry.id) ?? 'seed';
        return (
          <li class={state}>
            <div class="row">
              <span>{marks[state]}</span>
              <span>{entry.kind === 'milestone' ? `M${entry.number}` : 'side'}</span>
              <span>{entry.title}</span>
              <span class="state">{state}</span>
            </div>
            {detailed && entry.tasks.length > 0 && (
              <ul class="tasks">
                {entry.tasks.map((t) => <li class={t.completed ? 'done' : undefined}>{t.completed ? '[x]' : '[ ]'} {t.name}</li>)}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  </div>
</section>

<style>
  .status {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    gap: 40px;
    padding: 28px 32px 0;
    background: var(--soil-raised);
  }
  .planter { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; }
  .report { display: flex; flex-direction: column; gap: 18px; padding-bottom: 28px; }
  .stage { display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px; }
  .stage-number { font-family: var(--font-pixel); font-size: 32px; font-weight: 600; color: var(--sprout); }
  .hint { font-size: 14px; color: var(--text-muted); }
  .checklist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 14px; }
  .row { display: grid; grid-template-columns: 36px 44px minmax(0, 1fr) 72px; gap: 8px; }
  .state { text-align: right; }
  .grown { color: var(--sprout); }
  .growing { color: var(--clay); }
  .seed { color: var(--text-faint); }
  .tasks { list-style: none; margin: 4px 0 8px 88px; padding: 0; font-size: 13px; color: var(--text-muted); }
  .tasks .done { color: var(--text); }
  @media (max-width: 720px) {
    .status { grid-template-columns: 1fr; gap: 16px; padding: 18px 18px 0; }
    .planter :global(svg) { width: 128px; height: 192px; }
    .report { padding-bottom: 18px; }
    .row { grid-template-columns: 36px 44px minmax(0, 1fr); }
    .state { display: none; }
    .tasks { margin-left: 0; }
  }
</style>
```

- [ ] **Step 3: Write `src/components/GitLog.astro`**

```astro
---
import type { Post } from '../lib/content';
import { formatDate, slugOf, tagOf } from '../lib/post-meta';

type Props = { posts: Post[] };
const { posts } = Astro.props;
---
{posts.length === 0 ? (
  <p class="empty">nothing published yet</p>
) : (
  <ol class="log">
    {posts.map((post) => (
      <li>
        <a href={`/devlog/${slugOf(post)}/`}>
          <span class="hash">{post.data.commits[0]?.slice(0, 7) ?? ''}</span>
          <span class="date">{formatDate(post.data.date)}</span>
          <span class="title">
            {post.data.title}
            {post.data.draft && <span class="draft"> [draft]</span>}
          </span>
          <span class="tag">({tagOf(post)})</span>
        </a>
      </li>
    ))}
  </ol>
)}

<style>
  .log { list-style: none; margin: 0; padding: 0; }
  .log a {
    display: grid;
    grid-template-columns: 90px 110px minmax(0, 1fr) 90px;
    gap: 16px;
    align-items: baseline;
    padding: 10px 12px;
    color: var(--text);
  }
  .log a:hover { background: var(--soil-raised); text-decoration: none; }
  .hash { color: var(--clay); font-size: 14px; }
  .date { color: var(--text-muted); font-size: 13px; }
  .tag { color: var(--sprout); font-size: 12px; text-align: right; }
  .draft { color: var(--clay); font-size: 12px; }
  .empty { margin: 0; color: var(--text-faint); }
  @media (max-width: 720px) {
    .log a { grid-template-columns: auto auto 1fr; gap: 4px 10px; padding: 14px 0; border-bottom: 1px solid var(--edge); }
    .title { grid-column: 1 / -1; grid-row: 2; font-size: 16px; }
    .tag { text-align: left; }
  }
</style>
```

- [ ] **Step 4: Write the homepage**

Replace `src/pages/index.astro`:

```astro
---
import Base from '../layouts/Base.astro';
import GitLog from '../components/GitLog.astro';
import Prompt from '../components/Prompt.astro';
import StatusPanel from '../components/StatusPanel.astro';
import { getGarden, getPosts } from '../lib/content';
import { slugOf } from '../lib/post-meta';

const [garden, posts] = await Promise.all([getGarden(), getPosts()]);
const latest = posts[0];
---
<Base title="pixelsprout">
  <section class="about">
    <Prompt command="cat about.txt" />
    <p>
      Building <a href="/projects/rocco/">rocco</a>: a 3D engine in Odin that runs games written in Roc.
      Odin owns the systems. Roc owns the game.
    </p>
  </section>

  <StatusPanel garden={garden} at={new Date()} />

  <section class="log">
    <Prompt command="git log devlog --oneline" />
    <GitLog posts={posts.slice(0, 5)} />
    {posts.length > 5 && <a class="more" href="/devlog/">all posts →</a>}
  </section>

  {latest && (
    <section class="latest">
      <h2>Latest: {latest.data.title}</h2>
      <p>{latest.data.summary}</p>
      <a href={`/devlog/${slugOf(latest)}/`}>read the post →</a>
    </section>
  )}
</Base>

<style>
  .about, .log, .latest { display: flex; flex-direction: column; gap: 12px; }
  .about p { margin: 0; font-size: 19px; }
  .latest h2 { font-size: 24px; }
  .latest p { margin: 0; color: var(--text-muted); }
  .more { font-size: 14px; }
</style>
```

- [ ] **Step 5: Build against the fixtures and check the output**

Run: `DEX_SOURCE=test/fixtures/tasks.jsonl POSTS_DIR=test/fixtures/posts VERCEL_ENV=production npm run build`
Expected: exit 0.

Run: `grep -o 'stage 3/7' dist/index.html; grep -o 'Published post title' dist/index.html | head -1; grep -c 'Draft post title' dist/index.html`
Expected: `stage 3/7`, `Published post title`, `0`.

Run: `DEX_SOURCE=test/fixtures/tasks.jsonl POSTS_DIR=test/fixtures/empty-posts VERCEL_ENV=production npm run build && grep -o 'nothing published yet' dist/index.html`
Expected: `nothing published yet`.

- [ ] **Step 6: Look at it**

Run `npm run dev:local`, or `DEX_SOURCE=test/fixtures/tasks.jsonl POSTS_DIR=test/fixtures/posts npm run dev` if rocco-engine is not at `~/playground/rocco-engine`. Compare `http://localhost:4321/` with the canvas "B+ · Home (desktop)" and "B+ · Home (phone)" artboards. Expected: the plant has 3 full leaves on a soil strip, M4 shows `[~]` in clay, and the draft post shows `[draft]`.

- [ ] **Step 7: Commit**

```bash
git add src/components/Plant.astro src/components/StatusPanel.astro src/components/GitLog.astro src/pages/index.astro
git commit -m "feat(home): Add the plant, status panel and git log to the homepage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Code blocks and MDX components

**Files:**
- Create: `src/grammars/roc.tmLanguage.json`, `src/grammars/LICENSE-roc-vscode-unofficial`, `src/styles/soil-theme.mjs`, `src/lib/code-frame.mjs`, `src/components/Check.astro`, `src/components/Figure.astro`, `test/code-frame.test.ts`
- Modify: `astro.config.mjs`

**Interfaces:**
- Produces:
  - `soil`: Shiki theme object.
  - `codeFrame`: Shiki transformer. It wraps every block in `<div class="code"><div class="code-bar">[<span>title</span>]</div><pre>…</pre></div>`.
  - `Check`: default slot. `Figure`: props `{ src?: string; alt: string; caption?: string }`.

- [ ] **Step 1: Vendor the Roc grammar and its licence**

```bash
curl -fsSL https://raw.githubusercontent.com/ivan-demchenko/roc-vscode-unofficial/main/syntaxes/roc.tmLanguage.json -o src/grammars/roc.tmLanguage.json
curl -fsSL https://raw.githubusercontent.com/ivan-demchenko/roc-vscode-unofficial/main/LICENSE -o src/grammars/LICENSE-roc-vscode-unofficial
node -e "const g=require('./src/grammars/roc.tmLanguage.json'); console.log(g.scopeName)"
```

Expected: `source.roc`. If the LICENSE URL returns 404, run `gh api repos/ivan-demchenko/roc-vscode-unofficial/license --jq .download_url` and fetch that URL. The grammar predates some newer Roc syntax, so some tokens may stay plain. That is acceptable.

- [ ] **Step 2: Write `src/styles/soil-theme.mjs`**

```js
export const soil = {
  name: 'soil',
  type: 'dark',
  colors: { 'editor.background': '#120D0A', 'editor.foreground': '#EDE3CC' },
  tokenColors: [
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#A8977F' } },
    { scope: ['keyword', 'keyword.control', 'storage.modifier'], settings: { foreground: '#C79BE0' } },
    { scope: ['entity.name.function', 'support.function', 'variable.function'], settings: { foreground: '#9BD46B' } },
    { scope: ['entity.name.type', 'support.type', 'storage.type', 'entity.name.tag'], settings: { foreground: '#F0A070' } },
    { scope: ['string', 'constant.character'], settings: { foreground: '#E6C98A' } },
    { scope: ['constant.numeric', 'constant.language'], settings: { foreground: '#F0A070' } },
  ],
};
```

- [ ] **Step 3: Write the failing transformer and theme tests**

`test/code-frame.test.ts`:

```ts
import { createHighlighter } from 'shiki';
import { describe, expect, it } from 'vitest';
import roc from '../src/grammars/roc.tmLanguage.json' with { type: 'json' };
import { codeFrame } from '../src/lib/code-frame.mjs';
import { soil } from '../src/styles/soil-theme.mjs';
import { contrast } from './contrast';

const highlighter = await createHighlighter({ themes: [soil], langs: [{ ...roc, name: 'roc' }, 'odin'] });
const render = (raw?: string) =>
  highlighter.codeToHtml('x = 1', { lang: 'roc', theme: 'soil', transformers: [codeFrame], meta: raw ? { __raw: raw } : undefined });

describe('codeFrame', () => {
  it('puts the fence title in the bar', () => {
    expect(render('title="packages/meshes/Meshes.roc"')).toMatch(
      /^<div class="code"><div class="code-bar"><span>packages\/meshes\/Meshes\.roc<\/span><\/div><pre/,
    );
  });

  it('leaves an empty bar without a title', () => {
    expect(render()).toMatch(/^<div class="code"><div class="code-bar"><\/div><pre/);
  });

  it('highlights Odin with the bundled grammar', () => {
    expect(highlighter.codeToHtml('main :: proc() {}', { lang: 'odin', theme: 'soil' })).toContain('<pre');
  });
});

describe('soil theme', () => {
  const bg = soil.colors['editor.background'];
  for (const { scope, settings } of soil.tokenColors) {
    it(`${scope[0]} reaches 4.5:1`, () => {
      expect(contrast(settings.foreground, bg)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `npm test -- test/code-frame.test.ts`
Expected: FAIL, `code-frame.mjs` not found.

- [ ] **Step 5: Write `src/lib/code-frame.mjs`**

```js
const element = (tagName, className, children) => ({
  type: 'element',
  tagName,
  properties: className ? { className: [className] } : {},
  children,
});

export const codeFrame = {
  name: 'pixelsprout:code-frame',
  root(root) {
    const title = /title="([^"]+)"/.exec(this.options.meta?.__raw ?? '')?.[1];
    const pre = root.children.find((node) => node.type === 'element' && node.tagName === 'pre');
    if (!pre) return;
    const bar = element('div', 'code-bar', title ? [element('span', null, [{ type: 'text', value: title }])] : []);
    root.children = [element('div', 'code', [bar, pre])];
  },
};
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npm test -- test/code-frame.test.ts`
Expected: PASS, 9 tests. If a theme contrast case fails, lighten that one colour in `soil-theme.mjs` until it passes, and keep its hue.

- [ ] **Step 7: Wire Shiki into `astro.config.mjs`**

```js
// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import roc from './src/grammars/roc.tmLanguage.json' with { type: 'json' };
import { codeFrame } from './src/lib/code-frame.mjs';
import { soil } from './src/styles/soil-theme.mjs';

export default defineConfig({
  site: 'https://pixelsprout.dev',
  integrations: [mdx(), sitemap()],
  markdown: {
    shikiConfig: {
      theme: soil,
      langs: [{ ...roc, name: 'roc' }],
      transformers: [codeFrame],
    },
  },
});
```

- [ ] **Step 8: Write `src/components/Check.astro`**

```astro
<div class="check"><span class="label">check:</span> <slot /></div>

<style>
  .check {
    padding: 16px 20px;
    background: var(--soil-raised);
    border: 2px dashed #6DBE4F;
    font-size: 15px;
    line-height: 1.6;
  }
  .label { color: var(--sprout); }
</style>
```

- [ ] **Step 9: Write `src/components/Figure.astro`**

Without `src`, the figure shows a labelled slot. Stubs use this until the owner adds a screenshot.

```astro
---
type Props = { src?: string; alt: string; caption?: string };
const { src, alt, caption } = Astro.props;
---
<figure class="figure">
  {src ? <img src={src} alt={alt} loading="lazy" /> : <div class="slot pixel-frame">[{alt}]</div>}
  {caption && <figcaption>{caption}</figcaption>}
</figure>

<style>
  .figure { margin: 0; display: flex; flex-direction: column; gap: 10px; }
  .figure img { width: 100%; height: auto; image-rendering: pixelated; }
  .slot {
    min-height: 240px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: var(--soil-deep);
    color: var(--text-faint);
    font-size: 13px;
    text-align: center;
  }
  figcaption { font-size: 12px; color: var(--text-muted); }
</style>
```

- [ ] **Step 10: Build and check the code block**

Run: `DEX_SOURCE=test/fixtures/tasks.jsonl POSTS_DIR=test/fixtures/posts npm run build`
Expected: exit 0. No page renders posts yet. Task 11 checks the HTML.

- [ ] **Step 11: Commit**

```bash
git add src/grammars src/styles/soil-theme.mjs src/lib/code-frame.mjs src/components/Check.astro src/components/Figure.astro test/code-frame.test.ts astro.config.mjs
git commit -m "feat(code): Add the soil Shiki theme, Roc grammar, file name bar and MDX components

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Post page

**Files:**
- Create: `src/layouts/Post.astro`, `src/components/PostAside.astro`, `src/components/PostNav.astro`, `src/pages/devlog/[slug].astro`

**Interfaces:**
- Consumes: `getGarden`, `getPosts`, `Post` (Task 7); `growthAt`, `endOfUtcDay`, `growthLine` (Task 4); `plantLabel` (Task 5); `commitUrl`, `formatDate`, `slugOf`, `tagOf` (Task 6); `Plant` (Task 9); `Check`, `Figure` (Task 10); `Base`, `Prompt` (Task 8).
- Produces: route `/devlog/<slug>/`. `older` is the next post in newest-first order. `newer` is the previous one.

- [ ] **Step 1: Write `src/components/PostAside.astro`**

```astro
---
import type { MarkdownHeading } from 'astro';
import Plant from './Plant.astro';
import type { Post } from '../lib/content';
import type { GardenEntry } from '../lib/dex';
import { endOfUtcDay, growthAt, growthLine } from '../lib/garden';
import { plantLabel } from '../lib/plant';
import { commitUrl } from '../lib/post-meta';

type Props = { post: Post; older?: Post; headings: MarkdownHeading[]; garden: GardenEntry[] };
const { post, older, headings, garden } = Astro.props;
const showPlant = post.data.project === 'rocco';
const growth = growthAt(garden, endOfUtcDay(post.data.date));
const previous = older ? growthAt(garden, endOfUtcDay(older.data.date)).total : 0;
const sections = headings.filter((h) => h.depth === 2);
---
<aside class="aside">
  {showPlant && (
    <div class="planter">
      <div class="pot pixel-frame">
        <Plant
          slots={growth.slots}
          flowering={growth.flowering}
          cell={6}
          label={plantLabel('rocco', growth.total, growth.slots.length)}
        />
        <div class="soil-strip"></div>
      </div>
      <p class="growth">{growthLine(previous, growth.total)}</p>
    </div>
  )}
  {post.data.commits.length > 0 && (
    <div class="group">
      <span class="heading">commits</span>
      {post.data.commits.map((hash) => <a class="hash" href={commitUrl(hash)}>{hash.slice(0, 7)}</a>)}
    </div>
  )}
  {sections.length > 0 && (
    <nav class="group" aria-label="On this page">
      <span class="heading">on this page</span>
      {sections.map((h) => <a href={`#${h.slug}`}>{h.text}</a>)}
    </nav>
  )}
</aside>

<style>
  .aside { display: flex; flex-direction: column; gap: 28px; font-size: 13px; color: var(--text-muted); }
  .planter { display: flex; flex-direction: column; gap: 12px; }
  .pot { display: flex; flex-direction: column; align-items: center; padding: 20px 20px 0; background: var(--soil-raised); }
  .growth { margin: 0; text-align: center; color: var(--sprout); }
  .group { display: flex; flex-direction: column; gap: 6px; }
  .heading { color: var(--text); }
  .hash { color: var(--clay); }
</style>
```

- [ ] **Step 2: Write `src/components/PostNav.astro`**

```astro
---
import type { Post } from '../lib/content';
import { slugOf } from '../lib/post-meta';

type Props = { older?: Post; newer?: Post };
const { older, newer } = Astro.props;
const hash = (post: Post) => (post.data.commits[0] ? ` · ${post.data.commits[0].slice(0, 7)}` : '');
---
{(older || newer) && (
  <nav class="post-nav" aria-label="More posts">
    {older ? (
      <a href={`/devlog/${slugOf(older)}/`}><span class="dir">← prev{hash(older)}</span>{older.data.title}</a>
    ) : <span></span>}
    {newer && (
      <a class="next" href={`/devlog/${slugOf(newer)}/`}><span class="dir">next{hash(newer)} →</span>{newer.data.title}</a>
    )}
  </nav>
)}

<style>
  .post-nav {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
    padding-top: 28px;
    border-top: 2px solid var(--edge);
    font-size: 14px;
  }
  .post-nav a { display: flex; flex-direction: column; gap: 4px; }
  .next { text-align: right; }
  .dir { font-size: 12px; color: var(--text-muted); }
  @media (max-width: 720px) {
    .post-nav { grid-template-columns: 1fr; }
    .next { text-align: left; }
  }
</style>
```

- [ ] **Step 3: Write `src/layouts/Post.astro`**

```astro
---
import type { MarkdownHeading } from 'astro';
import Base from './Base.astro';
import PostAside from '../components/PostAside.astro';
import PostNav from '../components/PostNav.astro';
import Prompt from '../components/Prompt.astro';
import type { Post } from '../lib/content';
import type { GardenEntry } from '../lib/dex';
import { formatDate, slugOf, tagOf } from '../lib/post-meta';

type Props = { post: Post; headings: MarkdownHeading[]; older?: Post; newer?: Post; garden: GardenEntry[] };
const { post, headings, older, newer, garden } = Astro.props;
---
<Base title={post.data.title} description={post.data.summary}>
  <div class="post">
    <PostAside post={post} older={older} headings={headings} garden={garden} />
    <article>
      <Prompt path="~/pixelsprout/devlog" command={`cat ${slugOf(post)}.mdx`} />
      <header class="post-header">
        {post.data.draft && <p class="draft-banner">draft: not published</p>}
        <h1>{post.data.title}</h1>
        <p class="meta">
          <time datetime={post.data.date.toISOString()}>{formatDate(post.data.date)}</time>
          <span class="tag">({tagOf(post)})</span>
        </p>
      </header>
      <div class="prose"><slot /></div>
      <PostNav older={older} newer={newer} />
    </article>
  </div>
</Base>

<style>
  .post { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 72px; }
  article { display: flex; flex-direction: column; gap: 28px; max-width: 700px; min-width: 0; }
  .post-header { display: flex; flex-direction: column; gap: 14px; }
  .post-header h1 { font-size: 46px; }
  .meta { margin: 0; display: flex; gap: 18px; font-size: 13px; color: var(--text-muted); }
  .tag { color: var(--sprout); }
  .draft-banner { margin: 0; padding: 8px 12px; border: 2px dashed var(--clay); color: var(--clay); font-size: 13px; }
  .prose { display: flex; flex-direction: column; gap: 24px; font-size: 17px; line-height: 1.75; }
  .prose :global(p) { margin: 0; color: #DCD0B6; }
  .prose :global(h2) { margin-top: 12px; font-size: 26px; }
  .prose :global(h2)::before { content: '## '; color: var(--text-faint); }
  .prose :global(h3) { font-size: 20px; }
  .prose :global(:not(pre) > code) { color: var(--clay); }
  .prose :global(ul), .prose :global(ol) { margin: 0; padding-left: 24px; }
  .prose :global(blockquote) { margin: 0; padding-left: 16px; border-left: 4px solid var(--edge); color: var(--text-muted); }
  @media (max-width: 720px) {
    .post { grid-template-columns: 1fr; gap: 32px; }
    .post > :global(aside) { order: 2; }
    .post-header h1 { font-size: 32px; }
    .prose { font-size: 16px; }
  }
</style>
```

- [ ] **Step 4: Write `src/pages/devlog/[slug].astro`**

Quote the path in the shell. Zsh expands unquoted brackets.

```astro
---
import { render } from 'astro:content';
import PostLayout from '../../layouts/Post.astro';
import Check from '../../components/Check.astro';
import Figure from '../../components/Figure.astro';
import { getGarden, getPosts } from '../../lib/content';
import { slugOf } from '../../lib/post-meta';

export async function getStaticPaths() {
  const [posts, garden] = await Promise.all([getPosts(), getGarden()]);
  return posts.map((post, i) => ({
    params: { slug: slugOf(post) },
    props: { post, newer: posts[i - 1], older: posts[i + 1], garden },
  }));
}

const { post, newer, older, garden } = Astro.props;
const { Content, headings } = await render(post);
---
<PostLayout post={post} headings={headings} older={older} newer={newer} garden={garden}>
  <Content components={{ Check, Figure }} />
</PostLayout>
```

- [ ] **Step 5: Build and check the post HTML**

Run: `DEX_SOURCE=test/fixtures/tasks.jsonl POSTS_DIR=test/fixtures/posts VERCEL_ENV=production npm run build`
Expected: exit 0, and `dist/devlog/published-post/index.html` exists, and `dist/devlog/draft-post/` does not.

Run:

```bash
f=dist/devlog/published-post/index.html
grep -o '<span>packages/meshes/Meshes.roc</span>' $f
grep -o 'data-language="roc"' $f
grep -o 'This post grew rocco 0 → 3' $f
grep -o 'class="check"' $f | head -1
grep -o 'href="#first-section"' $f
```

Expected: each command prints one match. The fixture post is the only published post, so it has no older post and grows rocco from 0 to 3.

- [ ] **Step 6: Look at it**

Run `DEX_SOURCE=test/fixtures/tasks.jsonl POSTS_DIR=test/fixtures/posts npm run dev` and open `http://localhost:4321/devlog/published-post/`. Compare with the canvas "B+ · Post page". Click `copy`: it must change to `copied`. At 390px width the side panel must move below the article.

- [ ] **Step 7: Commit**

```bash
git add src/layouts/Post.astro src/components/PostAside.astro src/components/PostNav.astro 'src/pages/devlog/[slug].astro'
git commit -m "feat(post): Add the post page with the growth aside and post navigation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Devlog index, milestone filters and project pages

**Files:**
- Create: `src/components/DevlogFilter.astro`, `src/pages/devlog/index.astro`, `src/pages/devlog/m[n].astro`, `src/pages/projects/index.astro`, `src/pages/projects/rocco.astro`

**Interfaces:**
- Consumes: `getGarden`, `getPosts` (Task 7); `GitLog`, `StatusPanel` (Task 9); `Prompt`, `Base` (Task 8); `growthAt` (Task 4).
- Produces: routes `/devlog/`, `/devlog/m<N>/`, `/projects/`, `/projects/rocco/`.

- [ ] **Step 1: Write `src/components/DevlogFilter.astro`**

```astro
---
type Props = { numbers: number[]; current?: number };
const { numbers, current } = Astro.props;
---
<nav class="filter" aria-label="Filter by milestone">
  <a href="/devlog/" aria-current={current === undefined ? 'page' : undefined}>all</a>
  {numbers.map((n) => (
    <a href={`/devlog/m${n}/`} aria-current={current === n ? 'page' : undefined}>m{n}</a>
  ))}
</nav>

<style>
  .filter { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 14px; }
  .filter a { min-height: 44px; display: inline-flex; align-items: center; }
  .filter a[aria-current='page'] { color: var(--clay); }
</style>
```

- [ ] **Step 2: Write `src/pages/devlog/index.astro`**

```astro
---
import Base from '../../layouts/Base.astro';
import DevlogFilter from '../../components/DevlogFilter.astro';
import GitLog from '../../components/GitLog.astro';
import Prompt from '../../components/Prompt.astro';
import { getGarden, getPosts } from '../../lib/content';

const [garden, posts] = await Promise.all([getGarden(), getPosts()]);
const numbers = garden.filter((g) => g.kind === 'milestone').map((g) => g.number!);
---
<Base title="devlog" description="Every rocco devlog post, newest first.">
  <section class="devlog">
    <Prompt command="git log devlog --oneline" />
    <DevlogFilter numbers={numbers} />
    <GitLog posts={posts} />
  </section>
</Base>

<style>
  .devlog { display: flex; flex-direction: column; gap: 16px; }
</style>
```

- [ ] **Step 3: Write `src/pages/devlog/m[n].astro`**

```astro
---
import Base from '../../layouts/Base.astro';
import DevlogFilter from '../../components/DevlogFilter.astro';
import GitLog from '../../components/GitLog.astro';
import Prompt from '../../components/Prompt.astro';
import { getGarden, getPosts } from '../../lib/content';

export async function getStaticPaths() {
  const garden = await getGarden();
  const milestones = garden.filter((g) => g.kind === 'milestone');
  const numbers = milestones.map((m) => m.number!);
  return milestones.map((m) => ({ params: { n: String(m.number) }, props: { number: m.number!, title: m.title, numbers } }));
}

const { number, title, numbers } = Astro.props;
const posts = (await getPosts()).filter((p) => p.data.milestone === number);
---
<Base title={`M${number}: ${title}`} description={`rocco devlog posts for milestone ${number}: ${title}.`}>
  <section class="devlog">
    <Prompt command={`git log devlog --grep m${number}`} />
    <h1>M{number}: {title}</h1>
    <DevlogFilter numbers={numbers} current={number} />
    <GitLog posts={posts} />
  </section>
</Base>

<style>
  .devlog { display: flex; flex-direction: column; gap: 16px; }
  h1 { font-size: 32px; }
</style>
```

- [ ] **Step 4: Write `src/pages/projects/index.astro`**

```astro
---
import Base from '../../layouts/Base.astro';
import Prompt from '../../components/Prompt.astro';
import { getGarden } from '../../lib/content';
import { growthAt } from '../../lib/garden';

const growth = growthAt(await getGarden(), new Date());
---
<Base title="projects" description="Projects growing at Pixelsprout.">
  <section class="projects">
    <Prompt command="ls projects" />
    <a class="card pixel-frame" href="/projects/rocco/">
      <span class="name">rocco</span>
      <span class="desc">3D engine in Odin. Games in Roc. macOS, Linux, Windows.</span>
      <span class="stage">stage {Math.floor(growth.total)}/{growth.slots.length} · growing</span>
    </a>
  </section>
</Base>

<style>
  .projects { display: flex; flex-direction: column; gap: 20px; }
  .card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-width: 420px;
    padding: 20px;
    background: var(--soil-raised);
    color: var(--text);
  }
  .card:hover { text-decoration: none; }
  .name { font-family: var(--font-pixel); font-size: 22px; font-weight: 600; }
  .desc { color: var(--text-muted); font-size: 15px; }
  .stage { color: var(--sprout); font-size: 13px; }
</style>
```

- [ ] **Step 5: Write `src/pages/projects/rocco.astro`**

```astro
---
import Base from '../../layouts/Base.astro';
import GitLog from '../../components/GitLog.astro';
import Prompt from '../../components/Prompt.astro';
import StatusPanel from '../../components/StatusPanel.astro';
import { getGarden, getPosts } from '../../lib/content';

const [garden, posts] = await Promise.all([getGarden(), getPosts()]);
const roccoPosts = posts.filter((p) => p.data.project === 'rocco');
---
<Base title="rocco" description="rocco: a 3D engine in Odin that runs games written in Roc. Roadmap and devlog.">
  <section class="intro">
    <Prompt command="cat projects/rocco/README" />
    <h1>rocco</h1>
    <p>
      A 3D game engine in Odin that runs games written in Roc. Source on
      <a href="https://github.com/Pixelsprout/rocco-engine">GitHub</a>.
    </p>
  </section>
  <StatusPanel garden={garden} at={new Date()} detailed />
  <section class="log">
    <Prompt command="git log devlog --oneline -- rocco" />
    <GitLog posts={roccoPosts} />
  </section>
</Base>

<style>
  .intro, .log { display: flex; flex-direction: column; gap: 12px; }
  .intro h1 { font-size: 40px; }
  .intro p { margin: 0; }
</style>
```

- [ ] **Step 6: Build and check the routes**

Run: `DEX_SOURCE=test/fixtures/tasks.jsonl POSTS_DIR=test/fixtures/posts VERCEL_ENV=production npm run build`
Expected: exit 0.

Run: `ls dist/devlog dist/projects; grep -c 'Published post title' dist/devlog/m3/index.html; grep -c 'Published post title' dist/devlog/m1/index.html; grep -o 'Pick a mesh format' dist/projects/rocco/index.html`
Expected: `dist/devlog` lists `index.html m1 … m7 published-post`, and `dist/projects` lists `index.html rocco`. Then the counts are `1` (m3) and `0` (m1), and the last command prints `Pick a mesh format`.

- [ ] **Step 7: Commit**

```bash
git add src/components/DevlogFilter.astro src/pages/devlog/index.astro 'src/pages/devlog/m[n].astro' src/pages/projects
git commit -m "feat(pages): Add the devlog index, milestone filters and project pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: RSS feed

**Files:**
- Create: `src/pages/rss.xml.ts`

**Interfaces:**
- Consumes: `getPosts` (Task 7), `slugOf` (Task 6).
- Produces: `/rss.xml`. It never includes drafts, even on previews.

- [ ] **Step 1: Write `src/pages/rss.xml.ts`**

```ts
import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPosts } from '../lib/content';
import { slugOf } from '../lib/post-meta';

export async function GET(context: APIContext) {
  const posts = (await getPosts()).filter((p) => !p.data.draft);
  return rss({
    title: 'pixelsprout devlog',
    description: 'Notes from building rocco, a 3D engine in Odin that runs games written in Roc.',
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.summary,
      link: `/devlog/${slugOf(post)}/`,
    })),
  });
}
```

- [ ] **Step 2: Build as a preview and check drafts stay out**

Run: `DEX_SOURCE=test/fixtures/tasks.jsonl POSTS_DIR=test/fixtures/posts VERCEL_ENV=preview npm run build`
Expected: exit 0, and `dist/devlog/draft-post/index.html` exists (previews show drafts).

Run: `grep -c 'Published post title' dist/rss.xml; grep -c 'Draft post title' dist/rss.xml`
Expected: `1` and `0`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/rss.xml.ts
git commit -m "feat(rss): Add the RSS feed of published posts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Draft stubs

**Files:**
- Create: 22 files under `src/content/posts/rocco/`

**Interfaces:**
- Consumes: the `posts` schema (Task 7).

Each stub has real frontmatter, an MDX comment with the angle and sources, and `[write this]` headings. Do not write prose. Stubs for work that is not done yet use the date 2026-09-28, the day these stubs were written. The owner changes each date when the post goes live.

- [ ] **Step 1: Generate the stubs**

Run this once. It is a one-off generator. Do not commit it.

```bash
node --input-type=module <<'EOF'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
const dir = 'src/content/posts/rocco';
mkdirSync(dir, { recursive: true });
const stubs = [
  ['why-odin-and-roc', 'Why Odin for systems and Roc for gameplay', '2026-09-22', null, ['6fd139c'], 'Where the line between host and game goes, and why. Source: docs/DESIGN.md.'],
  ['agents-and-dex', 'Building an engine with agents and dex', '2026-09-22', null, ['662e17b'], 'How dex tasks, skills and agents shape the work. Source: AGENTS.md, .dex/tasks.jsonl.'],
  ['one-checkout-three-machines', 'One checkout, three machines', '2026-09-23', 1, ['0eef513', '155c512'], 'Metal, GL core and D3D11 from one shader source through sokol. Source: Milestone 1 in docs/ROADMAP.md.'],
  ['gl-clip-space-depth', 'The GL clip-space depth bug', '2026-09-23', 1, ['e4f137d'], "Reversed-Z, GL's -1..1 clip range and sokol-shdc fixup_clipspace."],
  ['headless-window-in-docker', 'Testing a window in a headless Docker container', '2026-09-23', 1, ['155c512', 'ac0f74b'], 'xvfb-run, software GL and ROCCO_EXIT_AFTER_FRAMES as a check.'],
  ['pinning-sokol-by-tree-hash', 'Pinning sokol by tree hash', '2026-09-23', 1, ['b9b9d02'], 'Matching a vendored folder to an upstream commit by tree hash.'],
  ['platform-stops-naming-the-game', 'The platform stops naming the game', '2026-09-25', 2, ['0d4d429', '7f0bed1'], 'One generic Roc platform that any game plugs into. Source: Milestone 2 in docs/ROADMAP.md.'],
  ['model-as-one-boxed-pointer', 'Holding a Roc Model as one boxed pointer', '2026-09-25', 2, ['7abf8d1'], 'Why the host keeps the game state opaque.'],
  ['refcounts-across-the-seam', 'Refcounts across the seam', '2026-09-25', 2, ['7387757', '6af61e0'], 'The Roc_Str field order and list header size bugs.'],
  ['hot-reload-under-roc-run', 'Hot reload under roc run', '2026-09-25', 2, [], 'What reloads, and why a change to the Model type breaks it.'],
  ['counting-allocations', 'Counting allocations with alloc-check', '2026-09-24', 2, ['a3aa156'], 'ROCCO_ALLOC_REPORT and scripts/alloc-check.sh.'],
  ['mesh-handles-and-a-magenta-fallback', 'Mesh handles and a magenta fallback', '2026-09-28', 3, ['9039d52', '14b10ee'], 'The mesh table, the manifest, and id 0. Source: Milestone 3 in docs/ROADMAP.md, packages/meshes/Meshes.roc.'],
  ['pong-with-nothing-new', 'Pong: a real game with nothing new', '2026-09-28', 3, ['56166e1', '9a0ba60'], 'What the engine already had, and the Running, Paused and EndGame states.'],
  ['giving-games-named-keys', 'Giving games named keys', '2026-09-28', null, ['918fc95', '910de74'], 'pf.Vocabulary and pf.Key generated from sokol. Side shoot: Shared code for games.'],
  ['picking-a-mesh-format', 'Picking a mesh format', '2026-09-28', 4, [], 'Positions, normals and indices from disk.'],
  ['mesh-id-generations', 'Generations on mesh ids before level meshes unload', '2026-09-28', 4, [], 'Stale ids after a level unloads.'],
  ['entities-as-a-list', 'Entities as a List, parenting as a fold', '2026-09-28', 5, [], "List(Entity) in the game's Model, and parent : U64."],
  ['swept-aabb', 'Swept AABB on the host, meaning in the game', '2026-09-28', 6, [], 'The host computes contacts. The game decides what a contact means.'],
  ['one-verb', 'One verb as a stage in the step pipeline', '2026-09-28', 7, [], 'The first gameplay verb, with a test.'],
  ['audio-as-data', 'Audio returned as data', '2026-09-28', null, [], 'saudio behind a pure request. Side shoot: Beside the milestones.'],
  ['debug-drawing', 'Debug drawing', '2026-09-28', null, [], 'Lines, wireframe and text. Side shoot: Beside the milestones.'],
  ['ci-matrix', 'A CI matrix over three targets', '2026-09-28', null, [], 'GitHub Actions over arm64mac, x64glibc and x64win. Side shoot: Beside the milestones.'],
];
for (const [slug, title, date, milestone, commits, angle] of stubs) {
  const path = `${dir}/${slug}.mdx`;
  if (existsSync(path)) throw new Error(`${path} exists`);
  const front = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `date: ${date}`,
    'summary: "[write this: one sentence for lists and RSS]"',
    ...(milestone ? [`milestone: ${milestone}`] : []),
    ...(commits.length ? [`commits: [${commits.map((c) => JSON.stringify(c)).join(', ')}]`] : []),
    'draft: true',
    '---',
  ];
  const body = [
    '', `{/* Angle: ${angle} */}`, '',
    '## [write this: the problem]', '', '[write this]', '',
    '## [write this: what you tried]', '', '[write this]', '',
    '## [write this: what worked]', '', '[write this]', '',
  ];
  writeFileSync(path, [...front, ...body].join('\n'));
}
console.log(`wrote ${stubs.length} stubs`);
EOF
```

Expected: `wrote 22 stubs`.

- [ ] **Step 2: Build in production and in dev mode**

Run: `DEX_SOURCE=test/fixtures/tasks.jsonl VERCEL_ENV=production npm run build`
Expected: exit 0, and `dist/devlog/` holds only `index.html` and `m1` to `m7`. Every stub is a draft.

Run: `DEX_SOURCE=test/fixtures/tasks.jsonl npm run dev` and open `http://localhost:4321/devlog/`.
Expected: 22 rows, each marked `[draft]`, newest first.

- [ ] **Step 3: Commit**

```bash
git add src/content/posts
git commit -m "docs(posts): Add draft stubs for the rocco devlog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Smoke test and CI

**Files:**
- Create: `scripts/smoke.mjs`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the fixtures (Tasks 2 and 7), and all routes.
- Produces: `npm run smoke`, `npm run ci`, and the CI workflow.

- [ ] **Step 1: Write `scripts/smoke.mjs`**

```js
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const fixtureEnv = { DEX_SOURCE: 'test/fixtures/tasks.jsonl', VERCEL_ENV: 'production' };

function build(env) {
  execFileSync('npx', ['astro', 'build'], { stdio: 'inherit', env: { ...process.env, ...fixtureEnv, ...env } });
}

function fail(message) {
  console.error(`smoke: ${message}`);
  process.exit(1);
}

function check(condition, message) {
  if (!condition) fail(message);
}

const read = (path) => readFileSync(join('dist', path), 'utf8');

const outputFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? outputFiles(path) : [path];
  });

build({ POSTS_DIR: 'test/fixtures/posts' });

for (const path of [
  'index.html',
  'devlog/index.html',
  'devlog/published-post/index.html',
  'devlog/m3/index.html',
  'projects/index.html',
  'projects/rocco/index.html',
  'rss.xml',
  'sitemap-index.xml',
]) {
  check(existsSync(join('dist', path)), `missing dist/${path}`);
}

check(!existsSync('dist/devlog/draft-post'), 'a draft page was built');
const everything = outputFiles('dist')
  .filter((f) => /\.(html|xml)$/.test(f))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');
check(!everything.includes('Draft post title'), 'a draft title appears in the production output');
check(read('rss.xml').includes('Published post title'), 'rss.xml lacks the published post');
check(read('index.html').includes('stage 3/7'), 'the homepage does not show stage 3/7');

build({ POSTS_DIR: 'test/fixtures/empty-posts' });

check(read('index.html').includes('nothing published yet'), 'the homepage lacks the empty state');
check(read('devlog/index.html').includes('nothing published yet'), '/devlog/ lacks the empty state');
check(read('rss.xml').includes('<channel>'), 'rss.xml is not a feed');

console.log('smoke: ok');
```

- [ ] **Step 2: Run the smoke test**

Run: `npm run smoke`
Expected: two builds, then `smoke: ok`.

- [ ] **Step 3: Check that the smoke test catches a leak**

Edit `src/lib/post-meta.ts` for a moment: in `visiblePosts`, change `drafts || !p.data.draft` to `true`. Run `npm run smoke`.
Expected: exit 1 with `smoke: a draft page was built`. Revert the edit and run `npm run smoke` again. Expected: `smoke: ok`.

- [ ] **Step 4: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    env:
      DEX_SOURCE: test/fixtures/tasks.jsonl
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run ci
```

- [ ] **Step 5: Run the full CI command locally**

Run: `DEX_SOURCE=test/fixtures/tasks.jsonl npm run ci`
Expected: every unit test passes, `astro check` reports `0 errors`, and the output ends with `smoke: ok`.

- [ ] **Step 6: Commit**

```bash
git add scripts/smoke.mjs .github/workflows/ci.yml
git commit -m "test: Add the production smoke test and the CI workflow

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Launch

This task changes outside systems. Before each numbered group, show the owner the exact command or setting, and wait for a yes. If the owner declines a group, stop and report what is left.

**Files:**
- Create: `.env.example`
- Modify: rocco-engine branch `ci/grow-site` (merge only)

- [ ] **Step 1: Write `.env.example` and commit**

```
# Optional. Raises the GitHub API limit for the dex commit lookup.
GITHUB_TOKEN=
# Optional. A URL or file path that replaces the GitHub fetch, for example ~/playground/rocco-engine/.dex/tasks.jsonl
DEX_SOURCE=
```

```bash
git add .env.example
git commit -m "docs: Document the optional build environment variables

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Group A (ask first): create the GitHub repo and push**

```bash
gh repo create Pixelsprout/pixelsprout-site --public --source . --remote origin
git push -u origin main feat/devlog-site
gh pr create --base main --head feat/devlog-site --title "feat: Pixelsprout devlog site" --body "Builds the site in docs/superpowers/specs/2026-09-28-pixelsprout-devlog-design.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Expected: the CI workflow passes on the pull request. Ask the owner whether the repo is public or private before running the first command.

- [ ] **Step 3: Group B (the owner does this in Vercel; give these steps)**

1. In Vercel, import `Pixelsprout/pixelsprout-site`. Keep the Astro framework preset.
2. In Settings → Build and Deployment, set Node.js Version to 24.x.
3. Optional: in Settings → Environment Variables, add `GITHUB_TOKEN` (a fine-grained token with no permissions, used only to raise the rate limit) for Production and Preview.
4. Merge the pull request. Vercel builds `main` to production.
5. Open the `*.vercel.app` URL. Check that the homepage shows the plant and `nothing published yet`.

- [ ] **Step 4: Group C (the owner does this; give these steps): the domain**

1. In Vercel → Settings → Domains, add `pixelsprout.dev` and `www.pixelsprout.dev`. Set `www.pixelsprout.dev` to redirect to `pixelsprout.dev`.
2. In Cloudflare → DNS for `pixelsprout.dev`, add the records that Vercel shows for each name.
3. Set both records to "DNS only" (grey cloud).
4. Wait until Vercel shows both domains as valid, with a certificate.
5. Open `https://pixelsprout.dev/rss.xml`. Check that it loads over HTTPS.

- [ ] **Step 5: Group D (ask first): connect the plant to dex**

The owner does steps 1 and 2:
1. In Vercel → Settings → Git → Deploy Hooks, create a hook named `dex` for branch `main`. Copy the URL.
2. In GitHub → `Pixelsprout/rocco-engine` → Settings → Secrets and variables → Actions, add the secret `VERCEL_DEPLOY_HOOK` with that URL.

Then, with the owner's yes, merge and push the rocco branch:

```bash
cd ~/playground/rocco-engine
git switch main
git merge --ff-only ci/grow-site || git merge --no-ff ci/grow-site -m "ci: Merge the grow-site workflow"
git push origin main
gh workflow run grow-site.yml
```

Expected: the `Grow the site` run succeeds, and Vercel starts a production deployment. The build log shows `Loaded <n> garden entries from Pixelsprout/rocco-engine@<sha>`.

- [ ] **Step 6: Report**

Tell the owner:
- the production URL,
- which groups ran and which were skipped,
- how to publish a post: remove `draft: true`, write the prose, push to `main`.
