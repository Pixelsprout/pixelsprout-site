import { DocsError, docsUrl, replaceMarkers, rewriteLinks, type Markers } from './docs';
import type { FileEntry } from './files';
import { TOUR_BASE } from './tour';

const SKIP_OPEN = '<!-- tour:skip -->';
const SKIP_CLOSE = '<!-- /tour:skip -->';
// The tour-only text sits inside the comment, so GitHub and the docs pages do not show it.
const ONLY_OPEN = '<!-- tour-only';
const ONLY_CLOSE = '-->';
const ANY_MARKER = /<!--\s*\/?tour\b/;
const FENCE = /^\s*(`{3,}|~{3,})/;

type Block = { kind: 'tour:skip' | 'tour-only'; line: number };

// Drops tour:skip blocks and shows the text of tour-only blocks. A bad marker fails the build.
export function applyTourMarkers(markdown: string, page: string): string {
  const out: string[] = [];
  let fence: string | null = null;
  let block: Block | null = null;
  const fail = (line: number, message: string): never => {
    throw new DocsError(`${page}:${line} ${message}`);
  };

  markdown.split('\n').forEach((line, i) => {
    const number = i + 1;
    const keep = () => {
      if (block?.kind !== 'tour:skip') out.push(line);
    };
    const open = FENCE.exec(line)?.[1];
    if (fence) {
      if (open && open[0] === fence[0] && open.length >= fence.length && line.trim() === open) fence = null;
      return keep();
    }
    if (open) {
      fence = open;
      return keep();
    }

    const marker = line.trim();
    const opens = marker === SKIP_OPEN ? 'tour:skip' : marker === ONLY_OPEN ? 'tour-only' : null;
    if (opens) {
      if (block) fail(number, `opens a ${opens} block inside the ${block.kind} block from line ${block.line}`);
      block = { kind: opens, line: number };
      return;
    }
    if (marker === SKIP_CLOSE) {
      if (block?.kind !== 'tour:skip') fail(number, 'closes a tour:skip block that is not open');
      block = null;
      return;
    }
    if (marker === ONLY_CLOSE && block?.kind === 'tour-only') {
      block = null;
      return;
    }
    if (ANY_MARKER.test(line)) fail(number, `has the unknown tour marker ${marker}`);
    keep();
  });

  const open = block as Block | null;
  if (open) fail(open.line, `opens a ${open.kind} block that never closes`);
  return out.join('\n');
}

export type GuidePage = { path: string; text: string; title: string; order: number };

export type TourStep = { slug: string; path: string; title: string; order: number; text: string; start: string; answer: string };

export type TourStepsInput = { pages: GuidePage[]; sources: FileEntry[]; ref: string; markers: Markers | null };

const TUTORIAL = 'guide/tutorial/';
export const STUB_SOURCE = 'examples/tutorial/00-start/main.roc';
const chapterSource = (slug: string) => `examples/tutorial/${slug}/main.roc`;

export const tourUrl = (slug: string) => `${TOUR_BASE}${slug}/`;

const stepUrl = (slug: string) => (slug.startsWith('tutorial/') ? tourUrl(slug.slice('tutorial/'.length)) : docsUrl(slug));

// One step per Tutorial page. A step starts from the app of the chapter before it; step 1 starts from the stub.
export function tourSteps({ pages, sources, ref, markers }: TourStepsInput): TourStep[] {
  const chapters = pages
    .filter((p) => p.path.startsWith(TUTORIAL) && p.path.endsWith('.md') && !p.path.slice(TUTORIAL.length).includes('/'))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
    .map((page) => ({ page, slug: page.path.slice(TUTORIAL.length, -'.md'.length) }));
  const text = new Map(sources.map((s) => [s.path, new TextDecoder().decode(s.data)]));
  return chapters.map(({ page, slug }, i) => {
    const sourceOf = (path: string) => {
      const found = text.get(path);
      if (found === undefined) throw new DocsError(`The Tour step ${slug} needs ${path}, which the docs source does not have`);
      return found;
    };
    const lesson = applyTourMarkers(replaceMarkers(page.text, markers, page.path), page.path);
    return {
      slug,
      path: page.path,
      title: page.title,
      order: page.order,
      text: rewriteLinks(lesson, page.path, ref, stepUrl),
      start: sourceOf(i === 0 ? STUB_SOURCE : chapterSource(chapters[i - 1].slug)),
      answer: sourceOf(chapterSource(slug)),
    };
  });
}
