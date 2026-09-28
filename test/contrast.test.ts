import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrast } from './contrast';

const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
const token = (name: string): string => {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!match) throw new Error(`token --${name} not found`);
  return match[1];
};

describe('text contrast', () => {
  const texts = ['text', 'text-muted', 'text-faint', 'sprout', 'clay'];
  const backgrounds = ['soil', 'soil-raised', 'soil-deep', 'soil-bar'];
  for (const fg of texts) {
    for (const bg of backgrounds) {
      it(`--${fg} on --${bg} reaches 4.5:1`, () => {
        expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
