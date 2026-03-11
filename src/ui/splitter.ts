/**
 * Splitter - Draggable resizable split pane system
 * 
 * Creates a container with two panes separated by a draggable handle.
 * Supports horizontal (side-by-side) and vertical (top-bottom) splits.
 * Persists sizes to localStorage. Double-click handle to reset.
 */

import { el } from './helpers.ts';

export interface SplitterOptions {
  /** Unique key for persisting size to localStorage */
  id: string;
  /** Split direction */
  direction: 'horizontal' | 'vertical';
  /** Initial size of the first pane as a percentage (0-100). Default 50. */
  defaultSize?: number;
  /** Minimum size of first pane in pixels */
  minFirst?: number;
  /** Minimum size of second pane in pixels */
  minSecond?: number;
  /** First pane content element */
  first: HTMLElement;
  /** Second pane content element */
  second: HTMLElement;
  /** Extra CSS class for the container */
  className?: string;
}

const STORAGE_PREFIX = 'cpu-sim-splitter-';

function loadSize(id: string): number | null {
  try {
    const val = localStorage.getItem(STORAGE_PREFIX + id);
    if (val !== null) {
      const num = parseFloat(val);
      if (!isNaN(num) && num > 0 && num < 100) return num;
    }
  } catch { /* ignore */ }
  return null;
}

function saveSize(id: string, pct: number) {
  try {
    localStorage.setItem(STORAGE_PREFIX + id, pct.toFixed(2));
  } catch { /* ignore */ }
}

export function createSplitter(opts: SplitterOptions): HTMLElement {
  const {
    id,
    direction,
    defaultSize = 50,
    minFirst = 100,
    minSecond = 100,
    first,
    second,
    className,
  } = opts;

  const isHorizontal = direction === 'horizontal';
  const savedSize = loadSize(id);
  let currentPct = savedSize ?? defaultSize;

  const container = el('div', {
    className: `splitter ${isHorizontal ? 'splitter-h' : 'splitter-v'}${className ? ' ' + className : ''}`,
  });

  const paneFirst = el('div', { className: 'splitter-pane splitter-first' });
  const handle = el('div', { className: 'splitter-handle' });
  const handleBar = el('div', { className: 'splitter-handle-bar' });
  handle.appendChild(handleBar);
  const paneSecond = el('div', { className: 'splitter-pane splitter-second' });

  paneFirst.appendChild(first);
  paneSecond.appendChild(second);

  container.appendChild(paneFirst);
  container.appendChild(handle);
  container.appendChild(paneSecond);

  function applySize(pct: number) {
    currentPct = pct;
    if (isHorizontal) {
      paneFirst.style.width = pct + '%';
      paneSecond.style.width = (100 - pct) + '%';
    } else {
      paneFirst.style.height = pct + '%';
      paneSecond.style.height = (100 - pct) + '%';
    }
  }

  applySize(currentPct);

  // ── Drag logic ───────────────────────────────────────────────

  let dragging = false;

  function onPointerDown(e: PointerEvent) {
    e.preventDefault();
    dragging = true;
    handle.classList.add('active');
    document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';
    // Prevent text selection during drag
    document.body.style.userSelect = 'none';
    (document.body.style as unknown as Record<string, string>)['-webkit-user-select'] = 'none';

    handle.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;

    const rect = container.getBoundingClientRect();
    let pct: number;

    if (isHorizontal) {
      const x = e.clientX - rect.left;
      pct = (x / rect.width) * 100;
      // Enforce minimums
      const minFirstPct = (minFirst / rect.width) * 100;
      const minSecondPct = (minSecond / rect.width) * 100;
      pct = Math.max(minFirstPct, Math.min(100 - minSecondPct, pct));
    } else {
      const y = e.clientY - rect.top;
      pct = (y / rect.height) * 100;
      const minFirstPct = (minFirst / rect.height) * 100;
      const minSecondPct = (minSecond / rect.height) * 100;
      pct = Math.max(minFirstPct, Math.min(100 - minSecondPct, pct));
    }

    applySize(pct);
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    (document.body.style as unknown as Record<string, string>)['-webkit-user-select'] = '';
    saveSize(id, currentPct);
  }

  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onPointerUp);
  handle.addEventListener('pointercancel', onPointerUp);

  // Double-click to reset
  handle.addEventListener('dblclick', () => {
    applySize(defaultSize);
    saveSize(id, defaultSize);
  });

  return container;
}
