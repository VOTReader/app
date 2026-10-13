/* W9.3 — import-payload validator tests. */

import { describe, it, expect } from 'vitest';
import {
  validateStorePayload,
  validateImportEnvelope,
  validateV3MediaMetadata,
  validateMediaRecord,
  isNewerBackup,
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
  it('accepts a v3 manifest envelope (media is an ARRAY of metadata)', () => {
    expect(validateImportEnvelope({
      app: 'VOTReader', exportVersion: 3, data: {}, stores: {},
      media: [{ id: 'm1', type: 'image', mime: 'image/png', size: 10 }],
    })).toEqual([]);
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
    expect(validateImportEnvelope({ app: 'VOTReader', data: {}, exportVersion: 2.5 }).some((e) => e.includes('exportVersion'))).toBe(true);
  });
  it('requires a v3 media manifest instead of treating a missing list as empty', () => {
    const errs = validateImportEnvelope({ app: 'VOTReader', exportVersion: 3, data: {}, stores: {} });
    expect(errs.some((e) => e.includes('media'))).toBe(true);
  });
  it('keeps the legacy media object contract for v1/v2', () => {
    const errs = validateImportEnvelope({ app: 'VOTReader', exportVersion: 2, data: {}, media: [] });
    expect(errs.some((e) => e.includes('media'))).toBe(true);
  });
  it('fails closed on a newer backup format this client cannot safely interpret', () => {
    const errs = validateImportEnvelope({ app: 'VOTReader', exportVersion: 4, data: {}, stores: {}, media: [] });
    expect(errs.some((e) => e.includes('unsupported exportVersion 4'))).toBe(true);
  });
  // SE1 — prototype-pollution guard. JSON.parse stores "__proto__" as an OWN
  // property (not the setter), so the payloads are built via JSON.parse to mimic
  // a real imported file, not via object literals (which would set the proto).
  it('rejects a top-level __proto__ key (SE1)', () => {
    const p = JSON.parse('{"app":"VOTReader","data":{},"__proto__":{"polluted":true}}');
    expect(validateImportEnvelope(p).some((e) => e.includes('unsafe key'))).toBe(true);
  });
  it('rejects a nested __proto__ key, with its path (SE1)', () => {
    const p = JSON.parse('{"app":"VOTReader","data":{"x":{"__proto__":{"y":1}}}}');
    const errs = validateImportEnvelope(p);
    expect(errs.some((e) => e.includes('unsafe key') && e.includes('__proto__'))).toBe(true);
  });
  it('rejects a constructor key (SE1)', () => {
    const p = JSON.parse('{"app":"VOTReader","data":{},"constructor":{"z":1}}');
    expect(validateImportEnvelope(p).some((e) => e.includes('unsafe key'))).toBe(true);
  });
  it('accepts an envelope with no dangerous keys (SE1 control)', () => {
    const p = JSON.parse('{"app":"VOTReader","exportVersion":2,"data":{"vot-state":{"x":1}},"stores":{},"media":{}}');
    expect(validateImportEnvelope(p)).toEqual([]);
  });
});

describe('validateV3MediaMetadata', () => {
  it('accepts a complete manifest, including an empty one', () => {
    expect(validateV3MediaMetadata([])).toEqual([]);
    expect(validateV3MediaMetadata([
      { id: 'photo-1', type: 'image', mime: 'image/png', size: 12 },
      { id: 'memo-1', type: 'audio', size: 0 },
    ])).toEqual([]);
  });

  it('rejects missing, malformed, and duplicate entries', () => {
    expect(validateV3MediaMetadata(undefined)[0]).toContain('array');
    expect(validateV3MediaMetadata([{ id: '', type: 'image', size: 1 }]).join(' ')).toContain('id');
    expect(validateV3MediaMetadata([{ id: 'm1', type: 'video', size: 1 }]).join(' ')).toContain('type');
    expect(validateV3MediaMetadata([{ id: 'm1', type: 'image', size: -1 }]).join(' ')).toContain('size');
    expect(validateV3MediaMetadata([{ id: 'm1', type: 'image', size: 1.5 }]).join(' ')).toContain('size');
    expect(validateV3MediaMetadata([
      { id: 'm1', type: 'image', size: 1 },
      { id: 'm1', type: 'audio', size: 2 },
    ]).join(' ')).toContain('duplicate');
  });
});

describe('validateMediaRecord', () => {
  it('accepts a valid base64 record', () => {
    expect(validateMediaRecord('m1', { data: 'QUJDREVG', type: 'image', mime: 'image/png' })).toEqual([]);
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
    expect(validateMediaRecord('m1', { data: 'QUJDREVG', type: 'audio' }, 1024)).toEqual([]);
  });
});

// W10 (sweep 2026-10-13): a v2 record is held to the rule the v3 manifest checks.
// A record this import accepts is written to the device as it is, and the next
// .votbak export writes its id, type and mime into the manifest; a value v3
// refuses there made every later backup unimportable.
describe('validateMediaRecord matches the v3 manifest rule (W10)', () => {
  const ok = { data: 'aGk=', type: 'image', mime: 'image/png', size: 2 };
  it('accepts what our own export writes, with or without mime and size', () => {
    expect(validateMediaRecord('m1', ok)).toEqual([]);
    expect(validateMediaRecord('m1', { data: 'aGk=', type: 'audio' })).toEqual([]);
  });
  it('refuses a type v3 refuses', () => {
    expect(validateMediaRecord('m1', { ...ok, type: 'video' }).join()).toContain('"type"');
    expect(validateMediaRecord('m1', { ...ok, type: undefined }).join()).toContain('"type"');
  });
  it('refuses a mime v3 refuses', () => {
    expect(validateMediaRecord('m1', { ...ok, mime: '' }).join()).toContain('"mime"');
    expect(validateMediaRecord('m1', { ...ok, mime: null }).join()).toContain('"mime"');
    expect(validateMediaRecord('m1', { ...ok, mime: 7 }).join()).toContain('"mime"');
  });
  it('refuses a size v3 refuses', () => {
    expect(validateMediaRecord('m1', { ...ok, size: -1 }).join()).toContain('"size"');
    expect(validateMediaRecord('m1', { ...ok, size: 1.5 }).join()).toContain('"size"');
    expect(validateMediaRecord('m1', { ...ok, size: '2' }).join()).toContain('"size"');
  });
  it('refuses an id v3 refuses', () => {
    expect(validateMediaRecord('', ok).join()).toContain('id');
    expect(validateMediaRecord('  ', ok).join()).toContain('id');
  });
});

// W10: v3 is a .votbak container (the media bytes are frames after the
// manifest). A plain JSON file stamped 3 has an ARRAY for media, which the v1/v2
// applier read as an id map; every photo and memo on the device was then pruned.
describe('validateImportEnvelope on the JSON path (W10)', () => {
  const v3 = { app: 'VOTReader', exportVersion: 3, data: {}, stores: {}, media: [] };
  it('a v3 manifest is still valid inside a container', () => {
    expect(validateImportEnvelope(v3)).toEqual([]);
  });
  it('a JSON file stamped 3 is refused', () => {
    expect(validateImportEnvelope(v3, { json: true }).length).toBeGreaterThan(0);
  });
  it('v1 and v2 JSON files still pass', () => {
    expect(validateImportEnvelope({ app: 'VOTReader', data: {} }, { json: true })).toEqual([]);
    expect(validateImportEnvelope({ app: 'VOTReader', exportVersion: 2, data: {}, stores: {}, media: {} }, { json: true })).toEqual([]);
  });
});

describe('isNewerBackup (W10)', () => {
  it('names a VOTReader backup stamped past what this build reads', () => {
    expect(isNewerBackup({ app: 'VOTReader', exportVersion: 4, data: {} })).toBe(true);
    expect(isNewerBackup({ app: 'VOTReader', exportVersion: 12 })).toBe(true);
  });
  it('is false for every version this build reads', () => {
    expect(isNewerBackup({ app: 'VOTReader', exportVersion: 3, data: {}, media: [] })).toBe(false);
    expect(isNewerBackup({ app: 'VOTReader', exportVersion: 2, data: {} })).toBe(false);
    expect(isNewerBackup({ app: 'VOTReader', data: {} })).toBe(false);
  });
  it('is false for a stranger or a damaged stamp', () => {
    expect(isNewerBackup({ exportVersion: 4, data: {} })).toBe(false);
    expect(isNewerBackup({ app: 'VOTReader', exportVersion: '4' })).toBe(false);
    expect(isNewerBackup({ app: 'VOTReader', exportVersion: 4.5 })).toBe(false);
    expect(isNewerBackup(null)).toBe(false);
    expect(isNewerBackup([])).toBe(false);
  });
});
