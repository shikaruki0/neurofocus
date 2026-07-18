import { describe, it, expect } from 'vitest';
import {
  escapeHTML,
  sanitizeAttr,
  sanitizeNumber,
  sanitizeString,
  isValidFirebaseConfig,
} from '../src/utils/sanitize.js';

describe('Sanitize', () => {
  describe('escapeHTML', () => {
    it('escapes ampersands', () => {
      expect(escapeHTML('a & b')).toBe('a &amp; b');
    });

    it('escapes less-than signs', () => {
      expect(escapeHTML('a < b')).toBe('a &lt; b');
    });

    it('escapes greater-than signs', () => {
      expect(escapeHTML('a > b')).toBe('a &gt; b');
    });

    it('escapes double quotes', () => {
      expect(escapeHTML('say "hello"')).toBe('say &quot;hello&quot;');
    });

    it('escapes single quotes', () => {
      expect(escapeHTML("say 'hello'")).toBe('say &#x27;hello&#x27;');
    });

    it('escapes forward slashes', () => {
      expect(escapeHTML('a/b')).toBe('a&#x2F;b');
    });

    it('handles script tags', () => {
      expect(escapeHTML('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;',
      );
    });

    it('returns empty string for null', () => {
      expect(escapeHTML(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(escapeHTML(undefined)).toBe('');
    });

    it('handles numbers', () => {
      expect(escapeHTML(42)).toBe('42');
    });
  });

  describe('sanitizeAttr', () => {
    it('removes special characters', () => {
      expect(sanitizeAttr('hello"onclick="alert')).toBe('helloonclickalert');
    });

    it('allows alphanumeric and underscores', () => {
      expect(sanitizeAttr('my_attr-123')).toBe('my_attr-123');
    });

    it('truncates to 200 chars', () => {
      const long = 'a'.repeat(250);
      expect(sanitizeAttr(long).length).toBe(200);
    });

    it('trims whitespace', () => {
      expect(sanitizeAttr('  hello  ')).toBe('hello');
    });
  });

  describe('sanitizeNumber', () => {
    it('parses valid numbers', () => {
      expect(sanitizeNumber('42')).toBe(42);
    });

    it('returns fallback for NaN', () => {
      expect(sanitizeNumber('abc', 0, 100, 5)).toBe(5);
    });

    it('enforces minimum', () => {
      expect(sanitizeNumber('-5', 0, 100)).toBe(0);
    });

    it('enforces maximum', () => {
      expect(sanitizeNumber('200', 0, 100)).toBe(100);
    });

    it('uses default fallback', () => {
      expect(sanitizeNumber('invalid')).toBe(0);
    });
  });

  describe('sanitizeString', () => {
    it('trims whitespace', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
    });

    it('truncates to max length', () => {
      const long = 'a'.repeat(600);
      expect(sanitizeString(long, 500).length).toBe(500);
    });

    it('returns empty for null', () => {
      expect(sanitizeString(null)).toBe('');
    });
  });

  describe('isValidFirebaseConfig', () => {
    it('validates correct config', () => {
      const config = { apiKey: 'abc', projectId: 'proj', authDomain: 'proj.firebaseapp.com' };
      expect(isValidFirebaseConfig(config)).toBe(true);
    });

    it('rejects null', () => {
      expect(isValidFirebaseConfig(null)).toBe(false);
    });

    it('rejects non-object', () => {
      expect(isValidFirebaseConfig('string')).toBe(false);
    });

    it('rejects missing apiKey', () => {
      expect(isValidFirebaseConfig({ projectId: 'proj' })).toBe(false);
    });

    it('rejects empty apiKey', () => {
      expect(isValidFirebaseConfig({ apiKey: '', projectId: 'proj' })).toBe(false);
    });
  });
});
