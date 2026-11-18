import { DocsError } from './docs';

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
