import {
  ROWS,
  paneStore,
  resizeLesson,
  resizeRow,
  resizeTarget,
  template,
  toggle,
  type Pane,
  type PaneLayout,
  type SizedRow,
} from './tour-panes';

export type TourPanes = {
  layout(): PaneLayout;
  setCollapsed(pane: Pane, collapsed: boolean): void;
  setExpanded(expanded: boolean): void;
};

const NAMES: Record<Pane, string> = { lesson: 'the lesson', editor: 'the editor', panel: 'the panel', preview: 'the Preview' };
const KEY_STEP = 16;

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export function mountTourPanes(tour: HTMLElement): TourPanes {
  const store = paneStore(storage());
  let layout = store.load();
  const pane = (name: Pane) => tour.querySelector<HTMLElement>(`[data-pane="${name}"]`)!;
  const edges = [...tour.querySelectorAll<HTMLElement>('[data-edge]')];

  const render = () => {
    const { columns, rows } = template(layout);
    tour.style.setProperty('--tour-columns', columns);
    tour.style.setProperty('--work-rows', rows);
    for (const name of Object.keys(NAMES) as Pane[]) {
      const collapsed = layout.collapsed[name];
      pane(name).toggleAttribute('data-collapsed', collapsed);
      for (const button of tour.querySelectorAll<HTMLElement>(`[data-toggle="${name}"]`)) {
        button.setAttribute('aria-expanded', String(!collapsed));
        button.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} ${NAMES[name]}`);
        button.textContent = collapsed ? '+' : '-';
      }
    }
    for (const edge of edges) {
      if (edge.dataset.edge !== 'lesson') edge.hidden = !resizeTarget(layout, edge.dataset.edge as SizedRow);
    }
  };
  const commit = (next: PaneLayout) => {
    layout = next;
    render();
    store.save(layout);
  };

  // The open rows share the height that is left after the collapsed bars.
  const rowRoom = () =>
    ROWS.filter((row) => !layout.collapsed[row]).reduce((sum, row) => sum + pane(row).getBoundingClientRect().height, 0);
  const resize = (edge: string, start: PaneLayout, delta: number, room: number) =>
    edge === 'lesson' ? resizeLesson(start, delta, room) : resizeRow(start, edge as SizedRow, delta, room);

  for (const edge of edges) {
    const name = edge.dataset.edge!;
    const vertical = name === 'lesson';
    const room = () => (vertical ? tour.getBoundingClientRect().width : rowRoom());

    edge.addEventListener('pointerdown', (down) => {
      if (down.button !== 0) return;
      down.preventDefault();
      edge.setPointerCapture(down.pointerId);
      tour.toggleAttribute('data-dragging', true);
      const start = layout;
      const space = room();
      const move = (event: PointerEvent) => {
        layout = resize(name, start, vertical ? event.clientX - down.clientX : event.clientY - down.clientY, space);
        render();
      };
      const end = () => {
        edge.removeEventListener('pointermove', move);
        tour.toggleAttribute('data-dragging', false);
        store.save(layout);
      };
      edge.addEventListener('pointermove', move);
      edge.addEventListener('lostpointercapture', end, { once: true });
    });

    edge.addEventListener('keydown', (event) => {
      const keys: Record<string, number> = vertical
        ? { ArrowLeft: -KEY_STEP, ArrowRight: KEY_STEP }
        : { ArrowUp: -KEY_STEP, ArrowDown: KEY_STEP };
      if (!(event.key in keys)) return;
      event.preventDefault();
      commit(resize(name, layout, keys[event.key], room()));
    });
  }

  for (const button of tour.querySelectorAll<HTMLElement>('[data-toggle]')) {
    button.addEventListener('click', () => commit(toggle(layout, button.dataset.toggle as Pane)));
  }

  const expand = tour.querySelector<HTMLElement>('[data-action="expand"]')!;
  const setExpanded = (expanded: boolean) => {
    tour.toggleAttribute('data-expanded', expanded);
    expand.setAttribute('aria-pressed', String(expanded));
    expand.textContent = expanded ? 'Shrink' : 'Expand';
  };
  expand.addEventListener('click', () => setExpanded(!tour.hasAttribute('data-expanded')));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && tour.hasAttribute('data-expanded')) setExpanded(false);
  });

  render();
  return {
    layout: () => layout,
    setCollapsed: (name, collapsed) => {
      if (layout.collapsed[name] !== collapsed) commit(toggle(layout, name));
    },
    setExpanded,
  };
}
