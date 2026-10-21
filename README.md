# pixelsprout

The Pixelsprout devlog at [pixelsprout.dev](https://pixelsprout.dev). It is an Astro site. The pixel plant on it grows from
the [rocco](https://github.com/Pixelsprout/rocco-engine) dex task log.

## Commands

| Command | Action |
|---|---|
| `pnpm install` | Install dependencies |
| `pnpm dev` | Start the dev server at `localhost:4321`. The dex log comes from GitHub. |
| `pnpm dev:local` | Start the dev server with the dex log and the docs from `../../playground/rocco-engine` |
| `pnpm build` | Build the site to `./dist/` |
| `pnpm test` | Run the unit tests |
| `pnpm check` | Type-check the site and the content schemas |
| `pnpm smoke` | Build twice against the fixtures and check the output |
| `pnpm run ci` | Run test, check and smoke. CI runs this with `DEX_SOURCE=test/fixtures/tasks.jsonl` and `DOCS_SOURCE=test/fixtures/rocco`. Plain `pnpm ci` is pnpm's clean install, not this script. |

## Writing a post

1. Open a file in `src/content/posts/rocco/`, or add a new `.mdx` file there. The file name is the URL: `/devlog/<file name>/`.
2. Fill in the frontmatter:

   ```yaml
   title: Mesh handles and a magenta fallback
   date: 2026-09-28
   summary: One sentence for lists and RSS.
   type: deep-dive                 # announcement, walkthrough, deep-dive or notes
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

## How the docs get here

The rocco docs live in rocco-engine, in `guide/`. The build reads them at the latest rocco release tag. It also downloads
the `docs.tar.gz` of that release. The tarball holds the `roc docs` HTML of the platform and the bundled packages, and
`urls.json`.

- `guide/*.md` renders at `/projects/rocco/docs/<name>/`, and `guide/tutorial/*.md` at `/projects/rocco/docs/tutorial/<name>/`.
  The sidebar sorts the pages of each folder by the `order` field of their frontmatter.
- Links between pages, links to `images/` and links to other repository files work as they do on GitHub. A link
  outside `guide/` goes to the file on GitHub at the release tag.
- The build replaces each marker such as `{{platform_url}}` with its value in `urls.json`. A marker that `urls.json`
  does not give fails the build.
- The `roc docs` HTML is served unchanged at `/projects/rocco/api/<package>/`. Only its `styles.css` changes: the build
  appends `src/styles/roc-docs.css`, for the site's fonts and colours.

If the latest release has no `docs.tar.gz`, the build still succeeds, and the docs pages say that no release has docs
yet. When a release is published, the `grow-site.yml` workflow in rocco-engine asks Vercel to rebuild the site.

To preview docs that are not released, set `DOCS_SOURCE` to a rocco-engine checkout. Run `roc scripts/build.roc docs` in
the checkout first, to make the API HTML in `build/docs/`. A checkout has no `urls.json`, so the markers stay unchanged
and the build log says so.

## Environment variables

| Name | Where | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | Required on Vercel | Authenticates the GitHub API lookups of the latest commit and the latest release. Use a fine-grained token with no extra permissions. |
| `DEX_SOURCE` | Optional | A URL or file path (`~/…` works) that replaces the GitHub fetch |
| `DOCS_SOURCE` | Optional | A rocco-engine checkout (`~/…` works) that replaces the release fetch of the docs |
| `POSTS_DIR` | Tests only | Replaces `src/content/posts` |

## Design

- Spec: `docs/superpowers/specs/2026-09-28-pixelsprout-devlog-design.md`
- Plan: `docs/superpowers/plans/2026-09-28-pixelsprout-devlog.md`
