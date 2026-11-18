import { describe, expect, it } from 'vitest';
import { devHeaders } from '../src/integrations/docs-files';

describe('devHeaders', () => {
  it('serves a .br file in dev as the encoded file it stands for, as vercel.json does in production', () => {
    expect(devHeaders('/a/compile-worker.wasm.br')).toEqual({ 'Content-Type': 'application/wasm', 'Content-Encoding': 'br' });
    expect(devHeaders('/a/index.data.br')).toEqual({ 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'br' });
  });

  it('serves other files with their type only', () => {
    expect(devHeaders('/a/preview.js')).toEqual({ 'Content-Type': 'text/javascript; charset=utf-8' });
  });
});
