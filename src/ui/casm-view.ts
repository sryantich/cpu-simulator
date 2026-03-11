/**
 * C↔ASM Side-by-Side View
 *
 * Shows C source and generated assembly side-by-side with:
 * - Synchronized hover highlighting (C line ↔ ASM lines)
 * - Decompiler annotations on the ASM side
 * - Color-coded categories (prologue, condition, loop, call, etc.)
 * - Line numbers on both sides
 *
 * Demonstrates two directions:
 *   C → ASM: "What the compiler does" (hover C to see generated ASM)
 *   ASM → C: "What decompiling/RE does" (hover ASM to see originating C)
 */

import { el } from './helpers.ts';
import { tokenizeTinyC, tokenizeAssembly, type Token } from './syntax-highlight.ts';
import { decompileAsm, type DecompAnnotation } from '../compiler/decompiler.ts';
import type { SourceMap } from '../compiler/compiler.ts';

// ── Category colors ──────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  prologue:       'cat-prologue',
  epilogue:       'cat-epilogue',
  vardecl:        'cat-vardecl',
  assign:         'cat-assign',
  condition:      'cat-condition',
  loop:           'cat-loop',
  call:           'cat-call',
  return:         'cat-return',
  branch:         'cat-branch',
  runtime:        'cat-runtime',
  data:           'cat-data',
  infrastructure: 'cat-infra',
};

// ── Helpers ──────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderTokens(tokens: Token[]): string {
  return tokens.map(t => {
    const escaped = escapeHtml(t.text);
    if (t.type === 'plain') return escaped;
    return `<span class="ht-${t.type}">${escaped}</span>`;
  }).join('');
}

// ── Build source map lookups ─────────────────────────────────────

interface MappingLookup {
  /** C line (1-based) → ASM line indices (0-based) */
  cToAsm: Map<number, number[]>;
  /** ASM line (0-based) → C line (1-based), -1 = no mapping */
  asmToC: number[];
}

function buildMappingLookup(sourceMap: SourceMap): MappingLookup {
  const cToAsm = new Map<number, number[]>();
  for (let asmIdx = 0; asmIdx < sourceMap.length; asmIdx++) {
    const cLine = sourceMap[asmIdx];
    if (cLine > 0) {
      if (!cToAsm.has(cLine)) cToAsm.set(cLine, []);
      cToAsm.get(cLine)!.push(asmIdx);
    }
  }
  return { cToAsm, asmToC: sourceMap };
}

// ── Build annotation lookup ──────────────────────────────────────

function buildAnnotationLookup(annotations: DecompAnnotation[]): Map<number, DecompAnnotation> {
  const map = new Map<number, DecompAnnotation>();
  for (const ann of annotations) {
    for (const lineIdx of ann.asmLines) {
      map.set(lineIdx, ann);
    }
  }
  return map;
}

// ── Main component ───────────────────────────────────────────────

export interface CasmViewOptions {
  cSource: string;
  asmSource: string;
  sourceMap: SourceMap;
}

export interface CasmView {
  element: HTMLElement;
  destroy: () => void;
}

export function createCasmView(opts: CasmViewOptions): CasmView {
  const { cSource, asmSource, sourceMap } = opts;

  const cLines = cSource.split('\n');
  const asmLines = asmSource.split('\n');

  // Build lookups
  const mapping = buildMappingLookup(sourceMap);
  const annotations = decompileAsm(asmSource);
  const annotationMap = buildAnnotationLookup(annotations);

  // Tokenize for syntax highlighting
  const cTokenLines = tokenizeTinyC(cSource);
  const asmTokenLines = tokenizeAssembly(asmSource);

  // ── Container ──────────────────────────────────────────────────

  const container = el('div', { className: 'casm-view' });

  // Direction indicator / header
  const header = el('div', { className: 'casm-header', children: [
    el('div', { className: 'casm-header-left', children: [
      el('span', { className: 'casm-label', text: 'C Source' }),
      el('span', { className: 'casm-direction-hint', text: 'Hover to see generated ASM' }),
    ]}),
    el('div', { className: 'casm-header-arrow', text: '\u2194' }),
    el('div', { className: 'casm-header-right', children: [
      el('span', { className: 'casm-label', text: 'Generated Assembly' }),
      el('span', { className: 'casm-direction-hint', text: 'Hover to see originating C' }),
    ]}),
  ]});

  // ── C Source panel ─────────────────────────────────────────────

  const cPanel = el('div', { className: 'casm-panel casm-c-panel' });
  const cLineElements: HTMLElement[] = [];

  for (let i = 0; i < cLines.length; i++) {
    const lineNum = i + 1; // 1-based
    const hasMapping = mapping.cToAsm.has(lineNum);

    const lineEl = el('div', {
      className: `casm-line ${hasMapping ? 'casm-mapped' : 'casm-unmapped'}`,
      attrs: { 'data-c-line': String(lineNum) },
    });

    const numEl = el('span', { className: 'casm-linenum', text: String(lineNum) });
    const codeEl = el('span', { className: 'casm-code' });
    codeEl.innerHTML = renderTokens(cTokenLines[i] || []) || '&nbsp;';

    lineEl.appendChild(numEl);
    lineEl.appendChild(codeEl);
    cPanel.appendChild(lineEl);
    cLineElements.push(lineEl);
  }

  // ── ASM panel ──────────────────────────────────────────────────

  const asmPanel = el('div', { className: 'casm-panel casm-asm-panel' });
  const asmLineElements: HTMLElement[] = [];

  for (let i = 0; i < asmLines.length; i++) {
    const ann = annotationMap.get(i);
    const catClass = ann ? CATEGORY_COLORS[ann.category] || '' : '';
    const cLine = mapping.asmToC[i] ?? -1;
    const hasMapping = cLine > 0;

    const lineEl = el('div', {
      className: `casm-line ${hasMapping ? 'casm-mapped' : 'casm-unmapped'} ${catClass}`,
      attrs: { 'data-asm-line': String(i) },
    });

    const numEl = el('span', { className: 'casm-linenum', text: String(i + 1) });
    const codeEl = el('span', { className: 'casm-code' });
    codeEl.innerHTML = renderTokens(asmTokenLines[i] || []) || '&nbsp;';

    // Annotation badge (decompiler note)
    const annEl = el('span', { className: 'casm-annotation' });
    if (ann) {
      // Only show annotation on the first ASM line of a group
      if (ann.asmLines[0] === i) {
        annEl.textContent = ann.cEquivalent;
        annEl.classList.add(catClass);
      }
    }

    lineEl.appendChild(numEl);
    lineEl.appendChild(codeEl);
    lineEl.appendChild(annEl);
    asmPanel.appendChild(lineEl);
    asmLineElements.push(lineEl);
  }

  // ── Side-by-side body ──────────────────────────────────────────

  const body = el('div', { className: 'casm-body' });
  body.appendChild(cPanel);
  body.appendChild(asmPanel);

  container.appendChild(header);
  container.appendChild(body);

  // ── Synchronized scroll ────────────────────────────────────────

  let scrollSyncing = false;

  function syncScroll(source: HTMLElement, target: HTMLElement) {
    if (scrollSyncing) return;
    scrollSyncing = true;
    target.scrollTop = source.scrollTop;
    scrollSyncing = false;
  }

  cPanel.addEventListener('scroll', () => syncScroll(cPanel, asmPanel));
  asmPanel.addEventListener('scroll', () => syncScroll(asmPanel, cPanel));

  // ── Hover highlighting ─────────────────────────────────────────

  let activeHighlights: HTMLElement[] = [];

  function clearHighlights() {
    for (const el of activeHighlights) {
      el.classList.remove('casm-highlight');
    }
    activeHighlights = [];
  }

  // Hover on C line → highlight corresponding ASM lines
  cPanel.addEventListener('mouseover', (e) => {
    const target = (e.target as HTMLElement).closest('.casm-line') as HTMLElement | null;
    if (!target) return;
    const cLine = parseInt(target.getAttribute('data-c-line') || '0', 10);
    if (!cLine) return;

    clearHighlights();

    // Highlight this C line
    target.classList.add('casm-highlight');
    activeHighlights.push(target);

    // Highlight corresponding ASM lines
    const asmIndices = mapping.cToAsm.get(cLine) || [];
    for (const asmIdx of asmIndices) {
      const asmEl = asmLineElements[asmIdx];
      if (asmEl) {
        asmEl.classList.add('casm-highlight');
        activeHighlights.push(asmEl);
      }
    }

    // Scroll first highlighted ASM line into view if needed
    if (asmIndices.length > 0) {
      const firstAsm = asmLineElements[asmIndices[0]];
      if (firstAsm) {
        const panelRect = asmPanel.getBoundingClientRect();
        const lineRect = firstAsm.getBoundingClientRect();
        if (lineRect.top < panelRect.top || lineRect.bottom > panelRect.bottom) {
          firstAsm.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }
    }
  });

  // Hover on ASM line → highlight corresponding C line
  asmPanel.addEventListener('mouseover', (e) => {
    const target = (e.target as HTMLElement).closest('.casm-line') as HTMLElement | null;
    if (!target) return;
    const asmIdx = parseInt(target.getAttribute('data-asm-line') || '-1', 10);
    if (asmIdx < 0) return;

    clearHighlights();

    // Highlight this ASM line
    target.classList.add('casm-highlight');
    activeHighlights.push(target);

    // Find corresponding C line
    const cLine = mapping.asmToC[asmIdx];
    if (cLine > 0) {
      // Highlight the C line
      const cEl = cLineElements[cLine - 1]; // cLine is 1-based, array is 0-based
      if (cEl) {
        cEl.classList.add('casm-highlight');
        activeHighlights.push(cEl);
      }

      // Also highlight ALL ASM lines that map to this same C line
      const allAsm = mapping.cToAsm.get(cLine) || [];
      for (const idx of allAsm) {
        const el = asmLineElements[idx];
        if (el && !el.classList.contains('casm-highlight')) {
          el.classList.add('casm-highlight');
          activeHighlights.push(el);
        }
      }

      // Scroll C line into view if needed
      const panelRect = cPanel.getBoundingClientRect();
      const lineRect = cEl.getBoundingClientRect();
      if (lineRect.top < panelRect.top || lineRect.bottom > panelRect.bottom) {
        cEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  });

  // Clear on mouse leave
  container.addEventListener('mouseleave', clearHighlights);

  // ── Cleanup ────────────────────────────────────────────────────

  function destroy() {
    clearHighlights();
    container.remove();
  }

  return { element: container, destroy };
}
