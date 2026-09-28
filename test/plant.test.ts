import { describe, expect, it } from 'vitest';
import { PLANT_COLOURS as C, PLANT_COLS, PLANT_ROWS, plantLabel, plantRects, type Rect } from '../src/lib/plant';

const zeros = [0, 0, 0, 0, 0, 0, 0];
const withSlots = (...leading: number[]) => [...leading, ...zeros].slice(0, 7);
const stem = (rects: Rect[]) => rects.find((r) => r.fill === C.stemDark);
const fullLeaves = (rects: Rect[]) => rects.filter((r) => r.fill === C.leaf && r.w === 3);

describe('plantRects', () => {
  it('draws only the pot at growth 0', () => {
    const rects = plantRects(zeros, false);
    expect(rects).toHaveLength(5);
    expect(stem(rects)).toBeUndefined();
  });

  it('draws a 1-pixel bud below half a milestone', () => {
    const rects = plantRects(withSlots(0.4), false);
    expect(rects).toContainEqual({ x: 6, y: 15, w: 1, h: 1, fill: C.tip });
    expect(stem(rects)?.y).toBe(14);
  });

  it('draws a half leaf from half a milestone', () => {
    expect(plantRects(withSlots(0.5), false)).toContainEqual({ x: 5, y: 15, w: 2, h: 1, fill: C.leaf });
  });

  it('draws three full leaves and a green tip at stage 3', () => {
    const rects = plantRects(withSlots(1, 1, 1), false);
    expect(fullLeaves(rects)).toHaveLength(3);
    expect(stem(rects)?.y).toBe(10);
    expect(rects).toContainEqual({ x: 7, y: 9, w: 2, h: 1, fill: C.tip });
  });

  it('draws the fourth leaf on the right as a half leaf at 3.5', () => {
    const rects = plantRects(withSlots(1, 1, 1, 0.5), false);
    expect(rects).toContainEqual({ x: 9, y: 9, w: 2, h: 1, fill: C.leaf });
    expect(stem(rects)?.y).toBe(8);
  });

  it('draws a clay bud while milestone 7 is partial', () => {
    const rects = plantRects([1, 1, 1, 1, 1, 1, 0.5], false);
    expect(fullLeaves(rects)).toHaveLength(6);
    expect(rects).toContainEqual({ x: 7, y: 2, w: 2, h: 1, fill: C.petal });
  });

  it('draws six leaves and a flower when flowering', () => {
    const rects = plantRects([1, 1, 1, 1, 1, 1, 1], true);
    expect(fullLeaves(rects)).toHaveLength(6);
    expect(rects).toContainEqual({ x: 7, y: 1, w: 2, h: 2, fill: C.centre });
    expect(stem(rects)?.y).toBe(3);
  });

  it('keeps every rect inside the grid', () => {
    const cases: [number[], boolean][] = [[zeros, false], [withSlots(0.4), false], [withSlots(1, 1, 1, 0.5), false], [[1, 1, 1, 1, 1, 1, 0.5], false], [[1, 1, 1, 1, 1, 1, 1], true]];
    for (const [slots, flowering] of cases) {
      for (const r of plantRects(slots, flowering)) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(PLANT_COLS);
        expect(r.y + r.h).toBeLessThanOrEqual(PLANT_ROWS);
      }
    }
  });
});

describe('plantLabel', () => {
  it('names the stage to one decimal', () => {
    expect(plantLabel('rocco', 3.5, 7)).toBe('rocco plant, stage 3.5 of 7');
  });
});
