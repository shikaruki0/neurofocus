/**
 * XSS Prevention — Escapes HTML entities to prevent injection attacks.
 * All user-generated content MUST pass through this before DOM insertion.
 */

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
};

/**
 * Escapes a string for safe HTML insertion.
 * @param str - Raw user input
 * @returns Escaped string safe for innerHTML
 */
export function escapeHTML(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"'/]/g, (char) => ESCAPE_MAP[char]);
}

/**
 * Sanitizes a string for use in HTML attributes.
 * More restrictive than escapeHTML — removes potentially dangerous patterns.
 * @param str - Raw input
 * @returns Sanitized string
 */
export function sanitizeAttr(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/[^a-zA-Z0-9_\- ]/g, '')
    .trim()
    .slice(0, 200);
}

/**
 * Validates and sanitizes a number input.
 * @param value - Input value
 * @param min - Minimum allowed
 * @param max - Maximum allowed
 * @param fallback - Default if invalid
 * @returns Sanitized number
 */
export function sanitizeNumber(value: unknown, min = 0, max = 9999, fallback = 0): number {
  const num = parseInt(String(value), 10);
  if (isNaN(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

/**
 * Validates a string length.
 * @param str - Input string
 * @param maxLength - Maximum allowed length
 * @returns Truncated string
 */
export function sanitizeString(str: unknown, maxLength = 500): string {
  if (str === null || str === undefined) return '';
  return String(str).trim().slice(0, maxLength);
}
