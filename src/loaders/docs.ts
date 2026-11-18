import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Loader } from 'astro/loaders';
import { docsFilesDir } from '../integrations/docs-files';
import { API_BASE, API_PACKAGES, DOCS_BASE, docsPageSchema, pageSlug, replaceMarkers, rewriteLinks } from '../lib/docs';
import type { DocsSource } from '../lib/docs-source';
import { cachedBrotli } from '../lib/brotli';
import { readRoccoSources } from '../lib/rocco-sources';
import { tourSiteFiles } from '../lib/tour';
import { tourSteps, type GuidePage } from '../lib/tour-steps';
import type { TourBuildInfo } from '../lib/tour-source';

export const SOURCE_ID = '#source';
export const stepId = (slug: string) => `#tour/${slug}`;

const FONTS = [
  'node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2',
  'node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2',
  'node_modules/@fontsource/jersey-10/files/jersey-10-latin-400-normal.woff2',
];

const STYLESHEET = /^[^/]+\/styles\.css$/;

type SiteFiles = { onDisk: (sitePath: string) => string; write: (sitePath: string, data: Uint8Array | string) => Promise<void> };

function siteFiles(files: string): SiteFiles {
  // A file name is not a URL, so it must not go through URL parsing, where %2e%2e means "..".
  const onDisk = (sitePath: string) => {
    const path = join(files, sitePath);
    if (!path.startsWith(files + sep)) throw new Error(`${sitePath} is outside the docs files folder`);
    return path;
  };
  const write = async (sitePath: string, data: Uint8Array | string) => {
    const path = onDisk(sitePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  };
  return { onDisk, write };
}

async function writeDocsFiles(source: Extract<DocsSource, { kind: 'docs' }>, root: URL, { onDisk, write }: SiteFiles) {
  const override = await readFile(new URL('src/styles/roc-docs.css', root), 'utf8');
  for (const file of source.api) {
    const data = STYLESHEET.test(file.path) ? `${new TextDecoder().decode(file.data)}\n${override}` : file.data;
    await write(API_BASE + file.path, data);
  }
  if (source.api.length > 0) {
    await mkdir(onDisk(`${API_BASE}fonts`), { recursive: true });
    for (const font of FONTS) await copyFile(new URL(font, root), onDisk(`${API_BASE}fonts/${basename(font)}`));
  }
  for (const file of source.guide) {
    if (!file.path.endsWith('.md')) await write(DOCS_BASE + file.path.slice('guide/'.length), file.data);
  }
}

export function docsLoader(): Loader {
  return {
    name: 'rocco-docs',
    load: async ({ store, parseData, renderMarkdown, generateDigest, logger, config }) => {
      const { docs: source, tour } = await readRoccoSources({
        source: process.env.DOCS_SOURCE,
        token: process.env.GITHUB_TOKEN,
        requireToken: Boolean(process.env.VERCEL),
      });
      const files = fileURLToPath(docsFilesDir(config.cacheDir)).replace(/[\\/]$/, '');
      await rm(files, { recursive: true, force: true });
      store.clear();
      const site = siteFiles(files);

      const compress = cachedBrotli(fileURLToPath(new URL('tour-brotli/', config.cacheDir)));
      for (const file of await tourSiteFiles(tour, compress)) await site.write(file.path, file.data);
      let buildInfo: TourBuildInfo | null = null;
      if (tour.kind === 'tour') {
        buildInfo = tour.buildInfo;
        logger.info(`Loaded the Tour artifacts ${tour.buildInfo.buildId} from ${tour.origin}.`);
      } else {
        logger.info(`No Tour: ${tour.reason}. The Tour pages say that the Tour is not available for this release.`);
      }

      const setSource = async (ref: string | null, api: string[]) => {
        const data = { kind: 'source', origin: source.origin, ref, api, tour: buildInfo };
        store.set({ id: SOURCE_ID, data: await parseData({ id: SOURCE_ID, data }) });
      };

      if (source.kind === 'none') {
        logger.info(`No docs: ${source.reason}. The docs pages say that no release has docs yet.`);
        await setSource(null, []);
        return;
      }

      for (const note of source.notes) logger.info(note);
      await writeDocsFiles(source, config.root, site);
      const pages = source.guide.filter((file) => file.path.endsWith('.md'));
      if (pages.length === 0) logger.warn(`${source.origin} has no guide pages`);
      const guidePages: GuidePage[] = [];
      for (const file of pages) {
        const id = pageSlug(file.path);
        const markdown = new TextDecoder().decode(file.data);
        const text = rewriteLinks(replaceMarkers(markdown, source.markers, file.path), file.path, source.ref);
        const rendered = await renderMarkdown(text);
        const data = await parseData({ id, data: { ...rendered.metadata?.frontmatter, kind: 'page', path: file.path } });
        store.set({ id, data, rendered, digest: generateDigest(text) });
        const { title, order } = docsPageSchema.parse(data);
        guidePages.push({ path: file.path, text: markdown, title, order });
      }
      // Without Tour artifacts there is nothing to run, so the step pages say that the Tour is not available.
      if (buildInfo) {
        const steps = tourSteps({ pages: guidePages, sources: source.sources, ref: source.ref, markers: source.markers });
        for (const { text, ...step } of steps) {
          const id = stepId(step.slug);
          const data = await parseData({ id, data: { kind: 'step', ...step } });
          store.set({ id, data, rendered: await renderMarkdown(text), digest: generateDigest(text) });
        }
        logger.info(`Built ${steps.length} Tour steps.`);
      }
      const api = API_PACKAGES.filter((name) => source.api.some((file) => file.path === `${name}/index.html`));
      await setSource(source.ref, api);
      logger.info(`Loaded ${pages.length} guide pages from ${source.origin}. API pages: ${api.join(', ') || 'none'}.`);
    },
  };
}
