/**
 * XSS Prevention — Escapes HTML entities to prevent injection attacks.
 * All user-generated content MUST pass through this before DOM insertion.
 */

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
};

/**
 * Escapes a string for safe HTML insertion.
 * @param {string} str - Raw user input
 * @returns {string} Escaped string safe for innerHTML
 */
export function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"'/]/g, (char) => ESCAPE_MAP[char]);
}

/**
 * Sanitizes a string for use in HTML attributes.
 * More restrictive than escapeHTML — removes potentially dangerous patterns.
 * @param {string} str - Raw input
 * @returns {string} Sanitized string
 */
export function sanitizeAttr(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/[^a-zA-Z0-9_\- ]/g, '')
    .trim()
    .slice(0, 200);
}

/**
 * Validates and sanitizes a number input.
 * @param {*} value - Input value
 * @param {number} min - Minimum allowed
 * @param {number} max - Maximum allowed
 * @param {number} fallback - Default if invalid
 * @returns {number} Sanitized number
 */
export function sanitizeNumber(value, min = 0, max = 9999, fallback = 0) {
  const num = parseInt(value, 10);
  if (isNaN(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

/**
 * Validates a string length.
 * @param {string} str - Input string
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} Truncated string
 */
export function sanitizeString(str, maxLength = 500) {
  if (str === null || str === undefined) return '';
  return String(str).trim().slice(0, maxLength);
}

/**
 * Validates a Firebase config object structure.
 * Only checks for required keys — does NOT validate values.
 * @param {object} config - Parsed config object
 * @returns {boolean} True if structure is valid
 */
export function isValidFirebaseConfig(config) {
  if (!config || typeof config !== 'object') return false;
  const required = ['apiKey', 'projectId', 'authDomain'];
  return required.every((key) => typeof config[key] === 'string' && config[key].length > 0);
}
