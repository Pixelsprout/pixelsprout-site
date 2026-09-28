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
