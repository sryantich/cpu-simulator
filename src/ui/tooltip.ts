/**
 * Tooltip System
 *
 * Provides lightweight, accessible tooltips for any element.
 * Uses a single shared tooltip element repositioned on hover.
 *
 * Usage:
 *   tooltip(element, 'Helpful description');
 *   tooltip(element, () => getDynamicText());   // dynamic content
 */

// ── Singleton tooltip element ────────────────────────────────────

let tipEl: HTMLDivElement | null = null;
let showTimeout: ReturnType<typeof setTimeout> | undefined;
let hideTimeout: ReturnType<typeof setTimeout> | undefined;
let currentTarget: HTMLElement | null = null;

const SHOW_DELAY = 400;   // ms before tooltip appears
const HIDE_DELAY = 100;   // ms grace period when moving between elements
const OFFSET = 8;         // px gap between element and tooltip

function ensureTipElement(): HTMLDivElement {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'sim-tooltip';
    tipEl.setAttribute('role', 'tooltip');
    tipEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

function showTip(target: HTMLElement, content: string) {
  const tip = ensureTipElement();
  tip.textContent = content;
  tip.classList.add('visible');
  tip.setAttribute('aria-hidden', 'false');
  currentTarget = target;
  positionTip(target, tip);
}

function hideTip() {
  if (tipEl) {
    tipEl.classList.remove('visible');
    tipEl.setAttribute('aria-hidden', 'true');
  }
  currentTarget = null;
}

function positionTip(target: HTMLElement, tip: HTMLDivElement) {
  const rect = target.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Default: position below the element, centered horizontally
  let top = rect.bottom + OFFSET;
  let left = rect.left + (rect.width - tipRect.width) / 2;

  // If tooltip would go below viewport, position above
  if (top + tipRect.height > vh - OFFSET) {
    top = rect.top - tipRect.height - OFFSET;
  }

  // If tooltip would go above viewport, fall back to below
  if (top < OFFSET) {
    top = rect.bottom + OFFSET;
  }

  // Clamp horizontal to viewport
  if (left < OFFSET) {
    left = OFFSET;
  } else if (left + tipRect.width > vw - OFFSET) {
    left = vw - tipRect.width - OFFSET;
  }

  tip.style.top = `${top}px`;
  tip.style.left = `${left}px`;
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Attach a tooltip to an element.
 *
 * @param element  The target element
 * @param content  Static string or function returning string (for dynamic tips)
 */
export function tooltip(
  element: HTMLElement,
  content: string | (() => string),
): void {
  // Set accessible label if element doesn't have one
  if (!element.getAttribute('aria-label') && typeof content === 'string') {
    element.setAttribute('aria-label', content);
  }

  element.addEventListener('mouseenter', () => {
    clearTimeout(hideTimeout);
    clearTimeout(showTimeout);

    const text = typeof content === 'function' ? content() : content;
    if (!text) return;

    showTimeout = setTimeout(() => {
      showTip(element, text);
    }, SHOW_DELAY);
  });

  element.addEventListener('mouseleave', () => {
    clearTimeout(showTimeout);
    hideTimeout = setTimeout(() => {
      if (currentTarget === element) {
        hideTip();
      }
    }, HIDE_DELAY);
  });

  // Hide immediately on click (tooltip shouldn't obscure actions)
  element.addEventListener('mousedown', () => {
    clearTimeout(showTimeout);
    hideTip();
  });

  // Handle focus for keyboard accessibility
  element.addEventListener('focus', () => {
    clearTimeout(hideTimeout);
    const text = typeof content === 'function' ? content() : content;
    if (!text) return;
    showTip(element, text);
  });

  element.addEventListener('blur', () => {
    hideTip();
  });
}

/**
 * Convenience: attach tooltips to multiple elements from a map.
 *
 * @param entries  Array of [element, content] pairs
 */
export function tooltips(entries: [HTMLElement, string | (() => string)][]): void {
  for (const [el, content] of entries) {
    tooltip(el, content);
  }
}
