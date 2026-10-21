import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Loader } from 'astro/loaders';
import { docsFilesDir } from '../integrations/docs-files';
import { API_BASE, API_PACKAGES, DOCS_BASE, pageSlug, replaceMarkers, rewriteLinks } from '../lib/docs';
import { readDocsSource, type DocsSource } from '../lib/docs-source';

export const SOURCE_ID = '#source';

const FONTS = [
  'node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2',
  'node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2',
  'node_modules/@fontsource/jersey-10/files/jersey-10-latin-400-normal.woff2',
];

const STYLESHEET = /^[^/]+\/styles\.css$/;

async function writeFiles(source: Extract<DocsSource, { kind: 'docs' }>, root: URL, files: string) {
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
      const source = await readDocsSource({
        source: process.env.DOCS_SOURCE,
        token: process.env.GITHUB_TOKEN,
        requireToken: Boolean(process.env.VERCEL),
      });
      const files = fileURLToPath(docsFilesDir(config.cacheDir)).replace(/[\\/]$/, '');
      await rm(files, { recursive: true, force: true });
      store.clear();
      const setSource = async (ref: string | null, api: string[]) => {
        const data = { kind: 'source', origin: source.origin, ref, api };
        store.set({ id: SOURCE_ID, data: await parseData({ id: SOURCE_ID, data }) });
      };

      if (source.kind === 'none') {
        logger.info(`No docs: ${source.reason}. The docs pages say that no release has docs yet.`);
        await setSource(null, []);
        return;
      }

      for (const note of source.notes) logger.info(note);
      await writeFiles(source, config.root, files);
      const pages = source.guide.filter((file) => file.path.endsWith('.md'));
      if (pages.length === 0) logger.warn(`${source.origin} has no guide pages`);
      for (const file of pages) {
        const id = pageSlug(file.path);
        const text = rewriteLinks(replaceMarkers(new TextDecoder().decode(file.data), source.markers, file.path), file.path, source.ref);
        const rendered = await renderMarkdown(text);
        const data = await parseData({ id, data: { ...rendered.metadata?.frontmatter, kind: 'page', path: file.path } });
        store.set({ id, data, rendered, digest: generateDigest(text) });
      }
      const api = API_PACKAGES.filter((name) => source.api.some((file) => file.path === `${name}/index.html`));
      await setSource(source.ref, api);
      logger.info(`Loaded ${pages.length} guide pages from ${source.origin}. API pages: ${api.join(', ') || 'none'}.`);
    },
  };
}
