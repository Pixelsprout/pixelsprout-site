# pixelsprout

The Pixelsprout devlog at [pixelsprout.dev](https://pixelsprout.dev). It is an Astro site. The pixel plant on it grows from
the [rocco](https://github.com/Pixelsprout/rocco-engine) dex task log.

## Commands

| Command | Action |
|---|---|
| `pnpm install` | Install dependencies |
| `pnpm dev` | Start the dev server at `localhost:4321`. The dex log comes from GitHub. |
| `pnpm dev:local` | Start the dev server with the dex log from `../../playground/rocco-engine` |
| `pnpm build` | Build the site to `./dist/` |
| `pnpm test` | Run the unit tests |
| `pnpm check` | Type-check the site and the content schemas |
| `pnpm smoke` | Build twice against the fixtures and check the output |
| `pnpm ci` | Run test, check and smoke. CI runs this with `DEX_SOURCE=test/fixtures/tasks.jsonl`. |

## Writing a post

1. Open a file in `src/content/posts/rocco/`, or add a new `.mdx` file there. The file name is the URL: `/devlog/<file name>/`.
2. Fill in the frontmatter:

   ```yaml
   title: Mesh handles and a magenta fallback
   date: 2026-09-28
   summary: One sentence for lists and RSS.
   milestone: 3                    # optional, a dex milestone number
   commits: ["9039d52", "14b10ee"] # optional; quote each hash
   draft: true                     # remove to publish
   ```

3. Write the post. `<Check>` and `<Figure alt="…" src="…" caption="…" />` work without an import. A code fence takes a
   file name: ` ```roc title="packages/meshes/Meshes.roc" `.
4. Remove `draft: true` and push to `main`.

Drafts show in `pnpm dev` and on Vercel preview deployments. They never show in production or in RSS.

## How the plant grows

The build reads `.dex/tasks.jsonl` from rocco-engine at the latest `main` commit. Each finished milestone adds a leaf.
An open milestone grows by its share of finished subtasks. When rocco's dex log changes on `main`, the
`grow-site.yml` workflow in rocco-engine calls a Vercel deploy hook, and the site rebuilds.

The site keeps only task names, states and dates. It never stores task descriptions or results.

## Environment variables

| Name | Where | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | Required on Vercel | Authenticates the GitHub API lookup of the latest commit. Use a fine-grained token with no extra permissions. |
| `DEX_SOURCE` | Optional | A URL or file path (`~/…` works) that replaces the GitHub fetch |
| `POSTS_DIR` | Tests only | Replaces `src/content/posts` |

## Design

- Spec: `docs/superpowers/specs/2026-09-28-pixelsprout-devlog-design.md`
- Plan: `docs/superpowers/plans/2026-09-28-pixelsprout-devlog.md`
