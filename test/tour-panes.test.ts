import { describe, expect, it } from 'vitest';
import type { EditStorage } from '../src/lib/tour-edits';
import { DEFAULT_LAYOUT, paneStore, resizeLesson, resizeRow, resizeTarget, template, toggle } from '../src/lib/tour-panes';

describe('template', () => {
  it('gives the lesson its width and the editor the rest of the work column', () => {
    expect(template(DEFAULT_LAYOUT)).toEqual({
      columns: 'minmax(240px, 480px) minmax(360px, 1fr)',
      rows: 'minmax(120px, 1fr) minmax(72px, 160px) minmax(120px, 320px)',
    });
  });

  it('shrinks a collapsed pane to its bar and gives the free space to the Preview', () => {
    const layout = toggle(toggle(DEFAULT_LAYOUT, 'editor'), 'lesson');
    expect(template(layout)).toEqual({
      columns: 'auto minmax(360px, 1fr)',
      rows: 'auto minmax(72px, 160px) minmax(120px, 1fr)',
    });
  });

  it('gives the free space to the panel when only the panel is open', () => {
    const layout = toggle(toggle(DEFAULT_LAYOUT, 'editor'), 'preview');
    expect(template(layout).rows).toBe('auto minmax(72px, 1fr) auto');
  });

  it('leaves the space empty when every row is collapsed', () => {
    const layout = toggle(toggle(toggle(DEFAULT_LAYOUT, 'editor'), 'panel'), 'preview');
    expect(template(layout).rows).toBe('auto auto auto');
  });
});

describe('toggle', () => {
  it('expands a collapsed pane again', () => {
    expect(toggle(toggle(DEFAULT_LAYOUT, 'panel'), 'panel')).toEqual(DEFAULT_LAYOUT);
  });
});

describe('resizeRow', () => {
  const room = 800;

  it('grows the panel when the reader drags its top edge up', () => {
    expect(resizeRow(DEFAULT_LAYOUT, 'panel', -40, room).panelHeight).toBe(200);
  });

  it('shrinks the Preview when the reader drags its top edge down', () => {
    expect(resizeRow(DEFAULT_LAYOUT, 'preview', 100, room).previewHeight).toBe(220);
  });

  it('keeps a pane at its minimum height', () => {
    expect(resizeRow(DEFAULT_LAYOUT, 'preview', 1000, room).previewHeight).toBe(120);
  });

  it('keeps the minimum editor height when a pane grows', () => {
    expect(resizeRow(DEFAULT_LAYOUT, 'panel', -1000, room).panelHeight).toBe(800 - 320 - 120);
  });

  it('resizes the panel from the Preview edge when the Preview takes the free height', () => {
    const layout = toggle(DEFAULT_LAYOUT, 'editor');
    expect(resizeTarget(layout, 'preview')).toBe('panel');
    expect(resizeRow(layout, 'preview', 40, room).panelHeight).toBe(200);
  });

  it('has no target for the edge of a collapsed panel under the editor', () => {
    const layout = toggle(DEFAULT_LAYOUT, 'panel');
    expect(resizeTarget(layout, 'panel')).toBeNull();
    expect(resizeRow(layout, 'panel', -40, room)).toEqual(layout);
  });
});

describe('resizeLesson', () => {
  const room = 1400;

  it('widens the lesson when the reader drags its edge right', () => {
    expect(resizeLesson(DEFAULT_LAYOUT, 60, room).lessonWidth).toBe(540);
  });

  it('keeps the lesson at its minimum width', () => {
    expect(resizeLesson(DEFAULT_LAYOUT, -1000, room).lessonWidth).toBe(240);
  });

  it('keeps the minimum width of the editor column', () => {
    expect(resizeLesson(DEFAULT_LAYOUT, 2000, room).lessonWidth).toBe(1400 - 360);
  });
});

function memoryStorage(): EditStorage & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

describe('paneStore', () => {
  it('opens the Tour with the default layout', () => {
    expect(paneStore(memoryStorage()).load()).toEqual(DEFAULT_LAYOUT);
  });

  it('keeps the layout for the whole Tour', () => {
    const storage = memoryStorage();
    const layout = toggle(resizeLesson(DEFAULT_LAYOUT, 60, 1400), 'panel');
    paneStore(storage).save(layout);
    expect(paneStore(storage).load()).toEqual(layout);
    expect([...storage.items.keys()]).toEqual(['rocco-tour:layout']);
  });

  it('uses the default for each value it cannot read', () => {
    const storage = memoryStorage();
    storage.setItem('rocco-tour:layout', JSON.stringify({ lessonWidth: 'wide', panelHeight: 200, collapsed: { preview: true, editor: 1 } }));
    expect(paneStore(storage).load()).toEqual({
      ...DEFAULT_LAYOUT,
      panelHeight: 200,
      collapsed: { ...DEFAULT_LAYOUT.collapsed, preview: true },
    });
  });

  it('uses the default layout when the stored text is not JSON', () => {
    const storage = memoryStorage();
    storage.setItem('rocco-tour:layout', '{');
    expect(paneStore(storage).load()).toEqual(DEFAULT_LAYOUT);
  });

  it('works without storage', () => {
    const broken: EditStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };
    expect(paneStore(broken).load()).toEqual(DEFAULT_LAYOUT);
    expect(() => paneStore(broken).save(DEFAULT_LAYOUT)).not.toThrow();
    expect(paneStore(null).load()).toEqual(DEFAULT_LAYOUT);
  });
});
