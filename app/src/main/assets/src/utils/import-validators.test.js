/* W9.3 — import-payload validator tests. */

import { describe, it, expect } from 'vitest';
import {
  validateStorePayload,
  validateImportEnvelope,
  validateMediaRecord,
} from './import-validators.js';

describe('validateStorePayload', () => {
  it('tolerates unknown store names (forward-compat)', () => {
    expect(validateStorePayload('vot-future-store', { anything: true })).toEqual([]);
    expect(validateStorePayload('vot-future-store', 42)).toEqual([]);
  });

  describe('objectOfArrays (annotations, journal-index)', () => {
    it('accepts an empty object', () => {
      expect(validateStorePayload('vot-annotations', {})).toEqual([]);
    });
    it('accepts keys mapping to arrays', () => {
      expect(validateStorePayload('vot-annotations', { 'letter:x:1': [{ id: 'a' }] })).toEqual([]);
      expect(validateStorePayload('vot-journal-index', { 'chapter:genesis:1': ['j1'] })).toEqual([]);
    });
    it('rejects an array at top level', () => {
      expect(validateStorePayload('vot-annotations', [])[0]).toContain('expected an object');
    });
    it('rejects a value that is not an array', () => {
      expect(validateStorePayload('vot-annotations', { k: 'nope' })[0]).toContain('must be an array');
    });
  });

  describe('objectOfObjects (notes)', () => {
    it('accepts keys mapping to objects', () => {
      expect(validateStorePayload('vot-notes', { g1: { body: 'x' } })).toEqual([]);
    });
    it('rejects a value that is not an object', () => {
      expect(validateStorePayload('vot-notes', { g1: ['arr'] })[0]).toContain('must be an object');
    });
    it('rejects an array at top level', () => {
      expect(validateStorePayload('vot-notes', [])[0]).toContain('expected an object');
    });
  });

  describe('object (prophecy-cards, journal-stats, state)', () => {
    it('accepts a plain object', () => {
      expect(validateStorePayload('vot-state', { settings: {} })).toEqual([]);
      expect(validateStorePayload('vot-journal-stats', {})).toEqual([]);
      expect(validateStorePayload('vot-prophecy-cards', { 'a:0:x': true })).toEqual([]);
    });
    it('rejects an array', () => {
      expect(validateStorePayload('vot-state', [])[0]).toContain('expected an object');
    });
    it('rejects null', () => {
      expect(validateStorePayload('vot-state', null)[0]).toContain('expected an object');
    });
    it('rejects a string', () => {
      expect(validateStorePayload('vot-state', 'corrupt')[0]).toContain('expected an object');
    });
  });

  describe('listObject (notebooks, journal, journal-notebooks)', () => {
    it('accepts an object with a list array', () => {
      expect(validateStorePayload('vot-journal', { list: [] })).toEqual([]);
      expect(validateStorePayload('vot-notebooks', { list: [{ id: 'n1' }] })).toEqual([]);
    });
    it('rejects when list is missing', () => {
      expect(validateStorePayload('vot-journal', {})[0]).toContain('"list" must be an array');
    });
    it('rejects when list is not an array', () => {
      expect(validateStorePayload('vot-journal', { list: {} })[0]).toContain('"list" must be an array');
    });
    it('rejects a top-level array', () => {
      expect(validateStorePayload('vot-notebooks', [])[0]).toContain('expected an object');
    });
  });

  describe('array (bookmarks, links, recent-nav, history)', () => {
    it('accepts an array', () => {
      expect(validateStorePayload('vot-bookmarks', [])).toEqual([]);
      expect(validateStorePayload('vot-links', [{ id: 'l1' }])).toEqual([]);
      expect(validateStorePayload('vot-recent-nav', [])).toEqual([]);
      expect(validateStorePayload('vot-history', [])).toEqual([]);
    });
    it('rejects an object', () => {
      expect(validateStorePayload('vot-bookmarks', {})[0]).toContain('expected an array');
    });
  });

  describe('stringArray (home-order)', () => {
    it('accepts an array of strings', () => {
      expect(validateStorePayload('vot-home-order', ['volumes', 'scriptures'])).toEqual([]);
      expect(validateStorePayload('vot-home-order', [])).toEqual([]);
    });
    it('rejects a non-array', () => {
      expect(validateStorePayload('vot-home-order', {})[0]).toContain('expected an array');
    });
    it('rejects non-string entries', () => {
      expect(validateStorePayload('vot-home-order', ['ok', 3])[0]).toContain('must be strings');
    });
  });
});

describe('validateImportEnvelope', () => {
  it('accepts a valid V2 envelope', () => {
    expect(validateImportEnvelope({ app: 'VOTReader', exportVersion: 2, data: {}, stores: {}, media: {} })).toEqual([]);
  });
  it('accepts a V1 envelope (no exportVersion)', () => {
    expect(validateImportEnvelope({ app: 'VOTReader', data: {} })).toEqual([]);
  });
  it('rejects a non-object', () => {
    expect(validateImportEnvelope('nope')[0]).toContain('not an object');
  });
  it('rejects a wrong app field', () => {
    expect(validateImportEnvelope({ app: 'SomethingElse', data: {} })[0]).toContain('not a VOTReader backup');
  });
  it('rejects missing data', () => {
    expect(validateImportEnvelope({ app: 'VOTReader' }).some((e) => e.includes('"data"'))).toBe(true);
  });
  it('rejects non-object data', () => {
    expect(validateImportEnvelope({ app: 'VOTReader', data: [] }).some((e) => e.includes('"data"'))).toBe(true);
  });
  it('rejects non-object stores when present', () => {
    expect(validateImportEnvelope({ app: 'VOTReader', data: {}, stores: [] }).some((e) => e.includes('"stores"'))).toBe(true);
  });
  it('rejects non-object media when present', () => {
    expect(validateImportEnvelope({ app: 'VOTReader', data: {}, media: 'x' }).some((e) => e.includes('"media"'))).toBe(true);
  });
  it('rejects an invalid exportVersion', () => {
    expect(validateImportEnvelope({ app: 'VOTReader', data: {}, exportVersion: 0 }).some((e) => e.includes('exportVersion'))).toBe(true);
    expect(validateImportEnvelope({ app: 'VOTReader', data: {}, exportVersion: 'two' }).some((e) => e.includes('exportVersion'))).toBe(true);
  });
});

describe('validateMediaRecord', () => {
  it('accepts a valid base64 record', () => {
    expect(validateMediaRecord('m1', { data: 'QUJDREVG', mime: 'image/png' })).toEqual([]);
  });
  it('rejects a non-object', () => {
    expect(validateMediaRecord('m1', null)[0]).toContain('not an object');
  });
  it('rejects missing data', () => {
    expect(validateMediaRecord('m1', { mime: 'image/png' })[0]).toContain('missing base64');
  });
  it('rejects empty data', () => {
    expect(validateMediaRecord('m1', { data: '' })[0]).toContain('missing base64');
  });
  it('rejects non-base64 data', () => {
    expect(validateMediaRecord('m1', { data: 'not valid base64!!' })[0]).toContain('not valid base64');
  });
  it('rejects data exceeding the size limit', () => {
    // 20 base64 chars → ~15 decoded bytes; limit 10 → over.
    const errs = validateMediaRecord('m1', { data: 'QUJD'.repeat(5) }, 10);
    expect(errs[0]).toContain('exceeds the limit');
  });
  it('accepts data within an explicit limit', () => {
    expect(validateMediaRecord('m1', { data: 'QUJDREVG' }, 1024)).toEqual([]);
  });
});
