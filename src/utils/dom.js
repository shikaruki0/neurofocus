/**
 * DOM Helpers — Lightweight utilities for element creation and selection.
 * Avoids direct innerHTML for user content (use with escapeHTML).
 */

/**
 * Shorthand for querySelector.
 * @param {string} selector
 * @param {Element} [parent=document]
 * @returns {Element|null}
 */
export function qs(selector, parent = document) {
  return parent.querySelector(selector);
}

/**
 * Shorthand for querySelectorAll returning an array.
 * @param {string} selector
 * @param {Element} [parent=document]
 * @returns {Element[]}
 */
export function qsa(selector, parent = document) {
  return Array.from(parent.querySelectorAll(selector));
}

/**
 * Creates an element with attributes and children.
 * @param {string} tag - HTML tag name
 * @param {object} [attrs] - Attributes (className, id, onclick, etc.)
 * @param {...(Node|string)} children - Child nodes or text
 * @returns {HTMLElement}
 */
export function createEl(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === 'className') el.className = val;
    else if (key === 'dataset') Object.assign(el.dataset, val);
    else if (key.startsWith('on') && typeof val === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (val !== null && val !== undefined) {
      el.setAttribute(key, val);
    }
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    el.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return el;
}

/**
 * Clears all children of an element.
 * @param {Element} el
 */
export function clearEl(el) {
  if (el) el.innerHTML = '';
}

/**
 * Toggles a class based on a condition.
 * @param {Element} el
 * @param {string} className
 * @param {boolean} condition
 */
export function toggleClass(el, className, condition) {
  if (el) el.classList.toggle(className, condition);
}

/**
 * Sets element content safely (escapes text).
 * @param {Element} el
 * @param {string} text
 */
export function setText(el, text) {
  if (el) el.textContent = text;
}

/**
 * Safely sets innerHTML (only for trusted template strings, never user input).
 * @param {Element} el
 * @param {string} html
 */
export function setHTML(el, html) {
  if (el) el.innerHTML = html;
}
