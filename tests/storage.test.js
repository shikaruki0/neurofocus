import { describe, it, expect, beforeEach } from 'vitest';
import { get, set, remove, clearAll, exportAll, importAll } from '../src/modules/storage.js';

describe('Storage Module', () => {
  beforeEach(() => {
    // Clear all nf_ keys before each test
    clearAll();
  });

  describe('get', () => {
    it('returns fallback for non-existent key', () => {
      expect(get('nonexistent', 'default')).toBe('default');
    });

    it('returns null fallback by default', () => {
      expect(get('nonexistent')).toBeNull();
    });

    it('returns stored value', () => {
      set('testKey', 'testValue');
      expect(get('testKey')).toBe('testValue');
    });

    it('parses JSON objects', () => {
      set('objKey', { a: 1, b: 'two' });
      const result = get('objKey');
      expect(result).toEqual({ a: 1, b: 'two' });
    });

    it('parses JSON arrays', () => {
      set('arrKey', [1, 2, 3]);
      expect(get('arrKey')).toEqual([1, 2, 3]);
    });
  });

  describe('set', () => {
    it('stores a string value', () => {
      set('strKey', 'hello');
      expect(get('strKey')).toBe('hello');
    });

    it('stores a number value', () => {
      set('numKey', 42);
      expect(get('numKey')).toBe(42);
    });

    it('stores a boolean value', () => {
      set('boolKey', true);
      expect(get('boolKey')).toBe(true);
    });

    it('stores null value', () => {
      set('nullKey', null);
      expect(get('nullKey')).toBeNull();
    });
  });

  describe('remove', () => {
    it('removes a key', () => {
      set('toRemove', 'value');
      remove('toRemove');
      expect(get('toRemove')).toBeNull();
    });

    it('does not throw for non-existent key', () => {
      expect(() => remove('nonexistent')).not.toThrow();
    });
  });

  describe('clearAll', () => {
    it('removes all nf_ keys', () => {
      set('key1', 'val1');
      set('key2', 'val2');
      clearAll();
      expect(get('key1')).toBeNull();
      expect(get('key2')).toBeNull();
    });
  });

  describe('exportAll', () => {
    it('exports all data', () => {
      set('export1', 'val1');
      set('export2', 'val2');
      const exported = exportAll();
      expect(exported.export1).toBe('val1');
      expect(exported.export2).toBe('val2');
    });
  });

  describe('importAll', () => {
    it('imports data from object', () => {
      const count = importAll({ imp1: 'a', imp2: 'b' });
      expect(count).toBe(2);
      expect(get('imp1')).toBe('a');
      expect(get('imp2')).toBe('b');
    });

    it('returns 0 for empty object', () => {
      expect(importAll({})).toBe(0);
    });

    it('returns 0 for null', () => {
      expect(importAll(null)).toBe(0);
    });
  });
});
