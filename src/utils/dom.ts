/**
 * DOM Helpers — Lightweight utilities for element creation and selection.
 * Avoids direct innerHTML for user content (use with escapeHTML).
 */

type ElementAttributes = Record<string, unknown> & {
  className?: string;
  dataset?: Record<string, string>;
  [key: `on${string}`]: ((event: Event) => void) | undefined;
};

/**
 * Shorthand for querySelector.
 * @param selector - CSS selector
 * @param parent - Parent element (default: document)
 * @returns Element or null
 */
export function qs<T extends Element = Element>(
  selector: string,
  parent: Document | Element = document,
): T | null {
  return parent.querySelector<T>(selector);
}

/**
 * Shorthand for querySelectorAll returning an array.
 * @param selector - CSS selector
 * @param parent - Parent element (default: document)
 * @returns Array of elements
 */
export function qsa<T extends Element = Element>(
  selector: string,
  parent: Document | Element = document,
): T[] {
  return Array.from(parent.querySelectorAll<T>(selector));
}

/**
 * Creates an element with attributes and children.
 * @param tag - HTML tag name
 * @param attrs - Attributes (className, id, onclick, etc.)
 * @param children - Child nodes or text
 * @returns Created HTMLElement
 */
export function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: ElementAttributes = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === 'className') el.className = String(val);
    else if (key === 'dataset' && val && typeof val === 'object') Object.assign(el.dataset, val);
    else if (key.startsWith('on') && typeof val === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), val as EventListener);
    } else if (val !== null && val !== undefined) {
      el.setAttribute(key, String(val));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/**
 * Clears all children of an element.
 * @param el - Element to clear
 */
export function clearEl(el: Element | null): void {
  if (el) el.innerHTML = '';
}

/**
 * Toggles a class based on a condition.
 * @param el - Element
 * @param className - Class name
 * @param condition - Whether to add or remove
 */
export function toggleClass(el: Element | null, className: string, condition: boolean): void {
  if (el) el.classList.toggle(className, condition);
}

/**
 * Sets element content safely (escapes text).
 * @param el - Element
 * @param text - Text content
 */
export function setText(el: Element | null, text: string): void {
  if (el) el.textContent = text;
}

/**
 * Safely sets innerHTML (only for trusted template strings, never user input).
 * @param el - Element
 * @param html - HTML string
 */
export function setHTML(el: Element | null, html: string): void {
  if (el) el.innerHTML = html;
}
