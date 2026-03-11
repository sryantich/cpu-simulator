/**
 * UI Helpers - Shared utilities for building the interface
 */

/** Create an element with optional class, id, children, and attributes */
export function el(
  tag: string,
  opts?: {
    className?: string;
    id?: string;
    text?: string;
    html?: string;
    children?: (HTMLElement | string)[];
    attrs?: Record<string, string>;
    style?: Partial<CSSStyleDeclaration>;
    onClick?: (e: MouseEvent) => void;
  }
): HTMLElement {
  const elem = document.createElement(tag);
  if (opts?.className) elem.className = opts.className;
  if (opts?.id) elem.id = opts.id;
  if (opts?.text) elem.textContent = opts.text;
  if (opts?.html) elem.innerHTML = opts.html;
  if (opts?.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) {
      elem.setAttribute(k, v);
    }
  }
  if (opts?.style) {
    Object.assign(elem.style, opts.style);
  }
  if (opts?.children) {
    for (const child of opts.children) {
      if (typeof child === 'string') {
        elem.appendChild(document.createTextNode(child));
      } else {
        elem.appendChild(child);
      }
    }
  }
  if (opts?.onClick) {
    elem.addEventListener('click', opts.onClick);
  }
  return elem;
}

/** Format a number as hex */
export function hex(n: number, width: number = 8): string {
  return '0x' + ((n >>> 0).toString(16)).padStart(width, '0');
}

/** Format a number as binary */
export function bin(n: number, width: number = 32): string {
  return ((n >>> 0).toString(2)).padStart(width, '0');
}

/** Truncate string */
export function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.substring(0, maxLen - 1) + '\u2026' : s;
}
