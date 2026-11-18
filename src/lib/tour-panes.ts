import { attempt, type EditStorage } from './tour-edits';

export type Pane = 'lesson' | 'editor' | 'panel' | 'preview';
export type Row = 'editor' | 'panel' | 'preview';

export type PaneLayout = {
  lessonWidth: number;
  panelHeight: number;
  previewHeight: number;
  collapsed: Record<Pane, boolean>;
};

export const ROWS: readonly Row[] = ['editor', 'panel', 'preview'];

export const MIN = { lesson: 240, work: 360, editor: 120, panel: 72, preview: 120 } as const;

export const DEFAULT_LAYOUT: PaneLayout = {
  lessonWidth: 480,
  panelHeight: 160,
  previewHeight: 320,
  collapsed: { lesson: false, editor: false, panel: false, preview: false },
};

// The editor takes the free height. With the editor collapsed, the Preview takes it, so the game gets bigger.
export function fillRow(layout: PaneLayout): Row | null {
  return (['editor', 'preview', 'panel'] as const).find((row) => !layout.collapsed[row]) ?? null;
}

const height = (layout: PaneLayout, row: Exclude<Row, 'editor'>) =>
  row === 'panel' ? layout.panelHeight : layout.previewHeight;

export function template(layout: PaneLayout): { columns: string; rows: string } {
  const fill = fillRow(layout);
  const track = (row: Row) => {
    if (layout.collapsed[row]) return 'auto';
    if (row === fill || row === 'editor') return `minmax(${MIN[row]}px, 1fr)`;
    return `minmax(${MIN[row]}px, ${height(layout, row)}px)`;
  };
  const lesson = layout.collapsed.lesson ? 'auto' : `minmax(${MIN.lesson}px, ${layout.lessonWidth}px)`;
  return { columns: `${lesson} minmax(${MIN.work}px, 1fr)`, rows: ROWS.map(track).join(' ') };
}

export function toggle(layout: PaneLayout, pane: Pane): PaneLayout {
  return { ...layout, collapsed: { ...layout.collapsed, [pane]: !layout.collapsed[pane] } };
}

export type SizedRow = Exclude<Row, 'editor'>;

const sized = (layout: PaneLayout, row: Row): row is SizedRow =>
  row !== 'editor' && !layout.collapsed[row] && row !== fillRow(layout);

const withHeight = (layout: PaneLayout, row: SizedRow, value: number): PaneLayout =>
  row === 'panel' ? { ...layout, panelHeight: value } : { ...layout, previewHeight: value };

const clamp = (value: number, min: number, max: number) => Math.round(Math.max(min, Math.min(max, value)));

// An edge is the top edge of the panel or of the Preview. It resizes the row under it, or else the row over it.
export function resizeTarget(layout: PaneLayout, edge: SizedRow): SizedRow | null {
  const above = ROWS[ROWS.indexOf(edge) - 1];
  if (sized(layout, edge)) return edge;
  if (sized(layout, above)) return above;
  return null;
}

// room is the height of the open rows together. delta is how far the pointer moved down.
export function resizeRow(layout: PaneLayout, edge: SizedRow, delta: number, room: number): PaneLayout {
  const target = resizeTarget(layout, edge);
  if (!target) return layout;
  const fill = fillRow(layout);
  const others = ROWS.filter((row): row is SizedRow => row !== target && sized(layout, row))
    .reduce((sum, row) => sum + height(layout, row), 0);
  const max = room - others - (fill ? MIN[fill] : 0);
  const next = height(layout, target) + (target === edge ? -delta : delta);
  return withHeight(layout, target, clamp(next, MIN[target], max));
}

// room is the width of the whole Tour. delta is how far the pointer moved right.
export function resizeLesson(layout: PaneLayout, delta: number, room: number): PaneLayout {
  return { ...layout, lessonWidth: clamp(layout.lessonWidth + delta, MIN.lesson, room - MIN.work) };
}

const LAYOUT_KEY = 'rocco-tour:layout';

const number = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

function parse(text: string | null): PaneLayout {
  const stored = attempt(() => (text ? JSON.parse(text) : null), null);
  if (!stored || typeof stored !== 'object') return DEFAULT_LAYOUT;
  const collapsed = stored.collapsed && typeof stored.collapsed === 'object' ? stored.collapsed : {};
  const base = DEFAULT_LAYOUT;
  return {
    lessonWidth: number(stored.lessonWidth, base.lessonWidth),
    panelHeight: number(stored.panelHeight, base.panelHeight),
    previewHeight: number(stored.previewHeight, base.previewHeight),
    collapsed: {
      lesson: flag(collapsed.lesson, base.collapsed.lesson),
      editor: flag(collapsed.editor, base.collapsed.editor),
      panel: flag(collapsed.panel, base.collapsed.panel),
      preview: flag(collapsed.preview, base.collapsed.preview),
    },
  };
}

export function paneStore(storage: EditStorage | null) {
  return {
    load: (): PaneLayout => parse(attempt(() => storage?.getItem(LAYOUT_KEY) ?? null, null)),
    save: (layout: PaneLayout) => attempt(() => storage?.setItem(LAYOUT_KEY, JSON.stringify(layout)), undefined),
  };
}
