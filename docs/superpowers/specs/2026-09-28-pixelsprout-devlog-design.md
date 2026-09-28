# Pixelsprout devlog: design

Date: 2026-09-28
Status: approved in conversation, awaiting spec review
Design canvas: https://claude.ai/artifact/XhxvWVKyCd8oYbic4EhG8M (row "B+ · Soil Terminal with a growing plant")

## 1. Intent

Pixelsprout is the owner's home on the web. rocco is its first project.
rocco is a 3D game engine in Odin that runs games written in Roc
(`~/playground/rocco-engine`, public at `github.com/Pixelsprout/rocco-engine`).

- The main readers are other developers: Roc, Odin and engine people.
- The owner writes every post. The build creates only draft stubs with placeholders.
- A pixel plant shows rocco's progress. The plant grows from the rocco dex task log.
- Success: the owner publishes a post by writing one MDX file and pushing it.
  The plant grows without an edit to the site.

## 2. Decisions

| Topic | Decision |
|---|---|
| Framework | Astro, from the `minimal` template, with `@astrojs/mdx`, `@astrojs/rss`, `@astrojs/sitemap` |
| Look | "Soil Terminal": dark, monospace, terminal prompts, git-log post list |
| Progress source | `.dex/tasks.jsonl` in rocco-engine, fetched at build time |
| Hosting | Vercel, static output, Node 24, npm |
| Repo | `github.com/Pixelsprout/pixelsprout-site`, local at `~/projects/personal-site` |
| Domain | `pixelsprout.dev` on Cloudflare DNS; `www` redirects to the apex |
| Theme | Dark only |

Out of scope: comments, search, tag pages beyond the milestone filter,
analytics, a theme toggle, i18n, drawing side shoots on the plant.

## 3. Structure

```
src/
  content.config.ts        # collection schemas: posts, garden
  content/posts/rocco/     # one .mdx file per post
  loaders/dex.ts           # dex loader
  lib/garden.ts            # growth maths
  lib/plant.ts             # plant pixel rectangles
  components/              # Plant, StatusPanel, GitLog, Prompt, PostAside, PostNav, Check, Figure
  layouts/                 # Base, Post
  pages/
    index.astro
    devlog/index.astro
    devlog/[...slug].astro
    projects/index.astro
    projects/rocco.astro
    rss.xml.ts
public/                    # logo, favicon
test/fixtures/tasks.jsonl  # trimmed dex fixture
```

### 3.1 Routes

| Route | Contents |
|---|---|
| `/` | `about.txt` intro, rocco status panel with the plant, 5 newest posts, summary of the newest post |
| `/devlog/` | All posts, newest first, git-log style, with milestone filter links |
| `/devlog/m<N>/` | Static filter page: posts for milestone N |
| `/devlog/<slug>/` | Post page |
| `/projects/` | One card per project |
| `/projects/rocco/` | Full milestone and subtask checklist with the large plant |
| `/rss.xml` | Feed of published posts |

Post files live under `posts/<project>/`. Post URLs stay flat: `/devlog/<slug>/`.

### 3.2 Post frontmatter

```yaml
title: Mesh handles and the manifest
date: 2026-09-28
summary: One sentence for lists and RSS.
project: rocco                 # default: rocco
milestone: 3                   # optional, 1–7
commits: [9039d52, 14b10ee]    # optional
draft: true                    # optional, default false
```

- The build fails if `milestone` does not name a dex milestone.
- Each commit links to `https://github.com/Pixelsprout/rocco-engine/commit/<hash>`.
- The `GitLog` hash column shows the first commit, or stays blank.
- The post tag is `m<N>` when `milestone` is set. Else the tag is `notes`.
  Stubs in the "—" and "side" rows of 3.4 have no `milestone`, so they show `notes`.

### 3.3 Drafts

| Environment | Detection | Drafts |
|---|---|---|
| Local | `astro dev` | Shown |
| Preview | `VERCEL_ENV=preview` | Shown, with a `draft` badge |
| Production | `VERCEL_ENV=production` | Excluded from pages, lists, RSS and sitemap |

### 3.4 Seed content

Create one draft stub per idea below. Each stub has real frontmatter and
`[write this]` section headings. Do not write post prose.

| Milestone | Stubs |
|---|---|
| — | Why Odin for systems and Roc for gameplay · Building an engine with agents and dex |
| 1 | One checkout, three machines · The GL clip-space depth bug · Testing a window in a headless Docker container · Pinning sokol by tree hash |
| 2 | The platform stops naming the game · Holding a Roc Model as one boxed pointer · Refcounts across the seam · Hot reload under roc run · Counting allocations with alloc-check |
| 3 | Mesh handles and a magenta fallback · Pong: a real game with nothing new |
| 4 | Picking a mesh format · Generations on mesh ids before level meshes unload |
| 5 | Entities as a List, parenting as a fold |
| 6 | Swept AABB on the host, meaning in the game |
| 7 | One verb as a stage in the step pipeline |
| side | Audio returned as data · Debug drawing · A CI matrix over three targets |

Give stubs for completed work the date of the matching dex completion or commit.
Give stubs for future work the build date and leave them as drafts.

## 4. Dex loader

### 4.1 Source

By default the loader pins the fetch to a commit. `raw.githubusercontent.com`
caches a branch URL for up to 5 minutes, so a build that the deploy hook starts
could read the old file.

1. Send `GET https://api.github.com/repos/Pixelsprout/rocco-engine/commits/main`. Read `sha`.
2. Fetch `https://raw.githubusercontent.com/Pixelsprout/rocco-engine/<sha>/.dex/tasks.jsonl`.
3. Log the SHA in the build output.

- If the `GITHUB_TOKEN` environment variable is set, send it as a bearer token in step 1.
  Without it, the API allows 60 requests an hour.
- The `DEX_SOURCE` environment variable overrides the default. It accepts a URL or a local file path.
  With `DEX_SOURCE`, the loader skips steps 1 and 2 and reads that source.

### 4.2 Parsing

`parseDex(text)` is a pure function. The Astro loader fetches the text, calls
`parseDex`, and stores the result as the `garden` collection.

1. Split the text into lines. Parse each non-empty line as JSON.
2. Validate each row with Zod. Keep only `id`, `parent_id`, `name`,
   `completed`, `completed_at`, `created_at`. Drop every other field,
   including `description`, `result` and `metadata`.
3. Find the root: no `parent_id` and name `rocco roadmap`.
4. Classify each root child:
   - A name that matches `^Milestone (\d+): (.+)$` is a milestone.
   - Any other name is a side shoot.
5. Attach each milestone's and side shoot's direct children as subtasks.

### 4.3 Garden entry

```ts
{
  id: "m3" | "side-<slug of name>",
  kind: "milestone" | "side",
  number?: number,           // milestones only
  title: string,
  completed: boolean,
  completedAt: Date | null,
  tasks: { name: string; completed: boolean; completedAt: Date | null }[],
}
```

The site publishes subtask names on `/projects/rocco/`. The owner approved this.

### 4.4 Errors

Every error fails the build. Vercel keeps the last good deployment live.

| Case | Message names |
|---|---|
| Commit lookup fails, or its status is not 200 | The API URL and the status. A 403 also names `GITHUB_TOKEN`. |
| Fetch fails or status is not 200 | The source and the status |
| Row fails the schema | The line number and the field |
| No root, or no milestones | The expected root name and milestone pattern |
| Missing or duplicate milestone number | The number |

## 5. Growth and the plant

### 5.1 Growth maths (`lib/garden.ts`)

- `growthAt(garden, date)` returns a number from 0 to 7. Only milestones count.
  - A milestone complete by `date` counts 1.
  - An incomplete milestone counts (subtasks complete by `date`) ÷ (all subtasks).
    A milestone with no subtasks counts 0.
- "By `date`" means `completedAt` ≤ 23:59:59.999 UTC on that date.
- The homepage and `/projects/rocco/` use `growthAt(garden, now)`.
- The post page computes growth at the post's date and at the previous published post's date.
  - If `floor` of the growth went up, it shows "This post grew rocco A → B".
  - Else it shows "rocco at stage B".
  - The first post compares against growth 0.

### 5.2 Plant (`lib/plant.ts`, `Plant.astro`)

- `plantRects(growth)` returns pixel rectangles on a 16 × 24 grid. Port the logic from the canvas `Plant.dc.html`.
- There are 7 leaf slots, one per milestone. For slot k, let f be that milestone's count:
  - f = 1: full leaf.
  - 0.5 ≤ f < 1: half leaf.
  - 0 < f < 0.5: 1-pixel bud.
  - f = 0: nothing.
- The stem height follows the number of slots with f > 0.
- Growth 7 replaces the tip with a flower.
- `Plant.astro` renders inline SVG with `shape-rendering="crispEdges"`, `role="img"`
  and `aria-label="rocco plant, stage <growth to one decimal> of 7"`.
- The `cell` prop sets the pixel size: 12 on the homepage, 8 below 720px, 6 in `PostAside`.

## 6. Components and style

| Component | Job |
|---|---|
| `Prompt` | Shows `~/pixelsprout $ <command>` |
| `StatusPanel` | Shows the plant, the stage and the checklist (`[x]`, `[~]`, `[ ]`). Side shoots show as extra rows. |
| `GitLog` | Shows hash, date, title and tag for each post |
| `PostAside` | Shows the small plant, the growth line, commit links and the headings on the page |
| `PostNav` | Links the previous and next published posts |
| `Check`, `Figure` | MDX components for the dashed "check:" box and captioned figures |

- Code blocks: Shiki with a custom `soil` theme built from the palette.
  The fence meta `title="<path>"` shows a file name bar.
  If Shiki has no Roc or Odin grammar, add a TextMate grammar for each to the repo.
- Copy button: one inline script, about 15 lines. This is the only client JavaScript.
- Fonts: Pixelify Sans (headings) and IBM Plex Mono (everything else), self-hosted with Fontsource.
- Layout: one breakpoint at 720px. Below it, use the phone layout from the canvas.
- Palette (from the logo and the canvas):

| Token | Value | Use |
|---|---|---|
| `--soil` | `#1B1410` | Page background |
| `--soil-raised` | `#241A14` | Panels |
| `--soil-deep` | `#120D0A` | Code blocks |
| `--edge` | `#3A2C22` | Borders, pixel frames |
| `--text` | `#EDE3CC` | Body text |
| `--text-muted` | `#A8977F` | Dates, prompts |
| `--text-faint` | `#9A8872` | Seed rows (raised from `#7D6C58` to pass 4.5:1) |
| `--sprout` | `#9BD46B` | Links, done state |
| `--clay` | `#F0A070` | Hashes, growing state |

- Check every text token against its background. Each pair must reach 4.5:1.

## 7. Deployment

### 7.1 Vercel

- Connect `Pixelsprout/pixelsprout-site` to one Vercel project.
- Production builds from `main`. Every other branch and pull request gets a preview.

### 7.2 Domain

1. Add `pixelsprout.dev` and `www.pixelsprout.dev` to the Vercel project.
2. Set `www.pixelsprout.dev` to redirect to `pixelsprout.dev`.
3. In Cloudflare DNS, add the records that Vercel shows for each name.
4. Set both records to "DNS only". If Cloudflare proxies them, Vercel cannot issue the certificate.

`.dev` is on the HSTS preload list. The site works only over HTTPS.

### 7.3 Plant updates

1. Create a Vercel Deploy Hook for `main`.
2. Store its URL as the secret `VERCEL_DEPLOY_HOOK` in the rocco-engine repo.
3. Add `.github/workflows/grow-site.yml` to rocco-engine.
   It runs on a push to `main` that changes `.dex/tasks.jsonl`, and it sends `POST` to the hook.

The workflow file exists as commit `0f81555` on branch `ci/grow-site` in rocco-engine.
It is not pushed. It runs only on a push to `main` that changes `.dex/tasks.jsonl`, or by hand.
If the secret is not set, the job logs a warning and succeeds.

The owner creates the hook and the secret, then merges and pushes the branch.

## 8. Testing

| Check | Scope |
|---|---|
| Vitest: `parseDex` | Milestone and side split, subtask counts, dropped fields, every error in 4.4 |
| Vitest: `growthAt` | Complete, partial and empty milestones; the UTC day boundary; the post growth line |
| Vitest: `plantRects` | Growth 0, 0.4, 0.5, 3, 3.5, 7 |
| `astro check` | Types and collection schemas |
| Build smoke test | Build with `DEX_SOURCE=test/fixtures/tasks.jsonl` and `VERCEL_ENV=production`. Assert that `/`, one post, `/rss.xml` and `/projects/rocco/` exist. Assert that no draft appears in the output. |

One GitHub Actions workflow in the site repo runs these checks on every pull request.

The fixture is a copy of the current `tasks.jsonl`, trimmed to about 15 rows,
with `description` and `result` set to `"x"`.
