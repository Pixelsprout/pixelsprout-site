import { posix } from 'node:path';
import { REPO } from './github';

export const DOCS_BASE = '/projects/rocco/docs/';
export const API_BASE = '/projects/rocco/api/';
export const API_PACKAGES = ['platform', 'linalg', 'mesh', 'ui', 'camera'];

export type Markers = Record<string, string>;

export class DocsError extends Error {
  override name = 'DocsError';
}

// Matches any text in double braces, so a misspelt marker fails instead of reaching the page.
const MARKER = /\{\{([^{}\n]*)\}\}/g;

// With no urls.json, as in a checkout preview, the reader sees the markers as GitHub shows them.
export function replaceMarkers(text: string, markers: Markers | null, page: string): string {
  if (!markers) return text;
  return text.replace(MARKER, (marker, name: string) => {
    if (!Object.hasOwn(markers, name)) {
      throw new DocsError(`${page} has the unknown marker ${marker}. urls.json gives ${Object.keys(markers).join(', ')}.`);
    }
    return markers[name];
  });
}

export const pageSlug = (path: string) => path.replace(/^guide\//, '').replace(/\.md$/, '');

export const docsUrl = (slug: string) => (slug ? `${DOCS_BASE}${slug}/` : DOCS_BASE);

// Resolves a link as GitHub does for the file at `page`, then maps it to the site.
function resolveLink(href: string, page: string, ref: string): string {
  if (href === '' || /^([a-z][a-z0-9+.-]*:|[#/])/i.test(href)) return href;
  const split = href.search(/[?#]/);
  const path = split === -1 ? href : href.slice(0, split);
  const suffix = split === -1 ? '' : href.slice(split);
  const target = posix.normalize(posix.join(posix.dirname(page), path)).replace(/\/$/, '');
  if (target === '..' || target.startsWith('../')) return href;

  if (target === 'guide' || target.startsWith('guide/')) {
    const rest = target.slice('guide/'.length);
    if (rest.endsWith('.md')) return docsUrl(pageSlug(target)) + suffix;
    if (!posix.extname(rest)) return docsUrl(rest) + suffix;
    return DOCS_BASE + rest + suffix;
  }
  return target === '.'
    ? `https://github.com/${REPO}/tree/${ref}`
    : `https://github.com/${REPO}/blob/${ref}/${target}${suffix}`;
}

// Any indent, so a fence inside a list item counts.
const FENCE = /^\s*(`{3,}|~{3,})/;
const CODE_SPAN = /(`+)[\s\S]*?\1/g;
const INLINE_LINK = /(\]\(\s*)(<[^>]*>|[^\s()<>]+)/g;
const REFERENCE = /^( {0,3}\[[^\]^][^\]]*\]:\s*)(<[^>]*>|\S+)/;
const HTML_TAG = /<(?:a|img)\b[^>]*>/gi;
const HTML_URL = /(\s(?:href|src)=(["']))(.*?)(\2)/gi;

function rewriteText(text: string, resolve: (href: string) => string): string {
  const destination = (href: string) => (href.startsWith('<') ? `<${resolve(href.slice(1, -1))}>` : resolve(href));
  return text
    .replace(INLINE_LINK, (_, open: string, href: string) => open + destination(href))
    .replace(REFERENCE, (_, open: string, href: string) => open + destination(href))
    .replace(HTML_TAG, (tag) =>
      tag.replace(HTML_URL, (_, open: string, _quote: string, href: string, close: string) => open + resolve(href) + close),
    );
}

// Rewrites the Markdown before Astro renders it, because Astro turns a relative image into an import of a local file.
// Fenced code and code spans keep their text.
export function rewriteLinks(markdown: string, page: string, ref: string): string {
  const resolve = (href: string) => resolveLink(href, page, ref);
  let fence: string | null = null;
  return markdown
    .split('\n')
    .map((line) => {
      const open = FENCE.exec(line)?.[1];
      if (fence) {
        if (open && open[0] === fence[0] && open.length >= fence.length && line.trim() === open) fence = null;
        return line;
      }
      if (open) {
        fence = open;
        return line;
      }
      let out = '';
      let last = 0;
      for (const span of line.matchAll(CODE_SPAN)) {
        out += rewriteText(line.slice(last, span.index), resolve) + span[0];
        last = span.index + span[0].length;
      }
      return out + rewriteText(line.slice(last), resolve);
    })
    .join('\n');
}

export type SidebarPage = { slug: string; title: string; order: number };
export type DocsSection<P extends SidebarPage> = { folder: string; title: string; pages: P[] };

const folderOf = (slug: string) => posix.dirname(slug).replace(/^\.$/, '');

export function docsSections<P extends SidebarPage>(pages: P[]): DocsSection<P>[] {
  const folders = [...new Set(pages.map((p) => folderOf(p.slug)))].sort();
  return folders.map((folder) => ({
    folder,
    title: folder ? folder[0].toUpperCase() + folder.slice(1) : 'Guide',
    pages: pages
      .filter((p) => folderOf(p.slug) === folder)
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
  }));
}
