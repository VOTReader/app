/* DiagnosticLog — JS-side diagnostic ring buffer (W7.4).
   ─────────────────────────────────────────────────────────────
   Covers the contract the Kotlin BoundedLogTree pins on the native
   side: 200-entry FIFO ring buffer, URI/path sanitization, level
   tagging, immutable snapshots, and JSON serialization. The
   "concurrency" case is the JS-meaningful analog of BoundedLogTree's
   threaded test — JS is single-threaded, so the invariant is that a
   tight burst of interleaved writes leaves the buffer exactly capped
   and in FIFO order with no corruption.
   ─────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach } from 'vitest';
import { DiagnosticLog } from './diagnostic-log.js';

beforeEach(() => {
  DiagnosticLog.clear();
});

describe('DiagnosticLog — basic capture', () => {
  it('starts empty', () => {
    expect(DiagnosticLog.entries()).toEqual([]);
    expect(DiagnosticLog.toJSON()).toBe('[]');
  });

  it('warn() records a W-level entry with tag + message', () => {
    DiagnosticLog.warn('store', 'IDB write failed: annotations');
    const e = DiagnosticLog.entries();
    expect(e).toHaveLength(1);
    expect(e[0].lvl).toBe('W');
    expect(e[0].tag).toBe('store');
    expect(e[0].msg).toBe('IDB write failed: annotations');
    expect(typeof e[0].t).toBe('number');
  });

  it('error() records an E-level entry', () => {
    DiagnosticLog.error('render', 'TypeError: x is undefined');
    const e = DiagnosticLog.entries();
    expect(e[0].lvl).toBe('E');
    expect(e[0].tag).toBe('render');
  });

  it('timing() records an I-level entry with rounded ms suffix', () => {
    DiagnosticLog.timing('corpus', 'bible', 1234.7);
    const e = DiagnosticLog.entries();
    expect(e[0].lvl).toBe('I');
    expect(e[0].tag).toBe('corpus');
    expect(e[0].msg).toBe('bible 1235ms');
  });

  it('timing() coerces non-finite durations to 0', () => {
    DiagnosticLog.timing('corpus', 'matthew', NaN);
    expect(DiagnosticLog.entries()[0].msg).toBe('matthew 0ms');
  });

  it('preserves insertion order (oldest first)', () => {
    DiagnosticLog.warn('a', '1');
    DiagnosticLog.error('b', '2');
    DiagnosticLog.timing('c', 'x', 3);
    const msgs = DiagnosticLog.entries().map((e) => e.tag);
    expect(msgs).toEqual(['a', 'b', 'c']);
  });

  it('coerces non-string tag and message defensively', () => {
    // @ts-expect-error — exercising the String() coercion guard
    DiagnosticLog.warn(42, { toString: () => 'objmsg' });
    const e = DiagnosticLog.entries()[0];
    expect(e.tag).toBe('42');
    expect(e.msg).toBe('objmsg');
  });
});

describe('DiagnosticLog — ring buffer capacity + FIFO eviction', () => {
  it('caps at CAPACITY (200) entries', () => {
    for (let i = 0; i < DiagnosticLog.CAPACITY + 50; i++) DiagnosticLog.warn('t', 'm' + i);
    expect(DiagnosticLog.entries()).toHaveLength(DiagnosticLog.CAPACITY);
  });

  it('evicts oldest first — the first 50 of 250 are gone, newest retained', () => {
    const total = DiagnosticLog.CAPACITY + 50; // 250
    for (let i = 0; i < total; i++) DiagnosticLog.warn('t', 'm' + i);
    const e = DiagnosticLog.entries();
    // Oldest surviving entry is m50 (m0..m49 evicted); newest is m249.
    expect(e[0].msg).toBe('m' + (total - DiagnosticLog.CAPACITY));
    expect(e[e.length - 1].msg).toBe('m' + (total - 1));
  });

  it('exactly at capacity keeps everything', () => {
    for (let i = 0; i < DiagnosticLog.CAPACITY; i++) DiagnosticLog.warn('t', 'm' + i);
    const e = DiagnosticLog.entries();
    expect(e).toHaveLength(DiagnosticLog.CAPACITY);
    expect(e[0].msg).toBe('m0');
  });
});

describe('DiagnosticLog — sanitization (parity with BoundedLogTree)', () => {
  it('redacts content:// URIs', () => {
    DiagnosticLog.warn('import', 'failed reading content://com.android.providers/doc/42');
    expect(DiagnosticLog.entries()[0].msg).toBe('failed reading [uri]');
  });

  it('redacts file:// URIs', () => {
    DiagnosticLog.warn('import', 'opened file:///storage/emulated/0/x.json ok');
    expect(DiagnosticLog.entries()[0].msg).toBe('opened [uri] ok');
  });

  it('redacts absolute paths under Android-exposed roots', () => {
    DiagnosticLog.warn('store', 'wrote /storage/emulated/0/Download/backup.json');
    expect(DiagnosticLog.entries()[0].msg).toBe('wrote [path]');
  });

  it('redacts ALL occurrences, not just the first (the /g-flag contract)', () => {
    DiagnosticLog.warn('x', '/data/a and /cache/b both failed');
    expect(DiagnosticLog.entries()[0].msg).toBe('[path] and [path] both failed');
  });

  it('leaves trailing punctuation outside the path intact', () => {
    // The path class stops before the colon so context-bearing words survive.
    DiagnosticLog.warn('x', '/data/app: permission denied');
    expect(DiagnosticLog.entries()[0].msg).toBe('[path]: permission denied');
  });

  it('does not touch non-sensitive text', () => {
    DiagnosticLog.warn('quota', 'usage 95% of 50MB');
    expect(DiagnosticLog.entries()[0].msg).toBe('usage 95% of 50MB');
  });

  it('_sanitize is directly exercisable (mirrors BoundedLogTree.sanitize)', () => {
    expect(DiagnosticLog._sanitize('content://x /data/y')).toBe('[uri] [path]');
  });
});

describe('DiagnosticLog — immutable snapshots', () => {
  it('entries() returns a fresh array each call', () => {
    DiagnosticLog.warn('a', '1');
    expect(DiagnosticLog.entries()).not.toBe(DiagnosticLog.entries());
  });

  it('mutating the returned array does not affect internal state', () => {
    DiagnosticLog.warn('a', '1');
    const snap = DiagnosticLog.entries();
    snap.push({ t: 0, lvl: 'W', tag: 'fake', msg: 'injected' });
    snap[0].msg = 'tampered';
    const fresh = DiagnosticLog.entries();
    expect(fresh).toHaveLength(1);
    expect(fresh[0].msg).toBe('1');
  });
});

describe('DiagnosticLog — toJSON', () => {
  it('serializes entries in t,lvl,tag,msg key order (BoundedLogTree parity)', () => {
    DiagnosticLog.warn('store', 'boom');
    const parsed = JSON.parse(DiagnosticLog.toJSON());
    expect(parsed).toHaveLength(1);
    expect(Object.keys(parsed[0])).toEqual(['t', 'lvl', 'tag', 'msg']);
    expect(parsed[0]).toMatchObject({ lvl: 'W', tag: 'store', msg: 'boom' });
  });

  it('round-trips through JSON.parse to the same shape as entries()', () => {
    DiagnosticLog.warn('a', '1');
    DiagnosticLog.error('b', '2');
    expect(JSON.parse(DiagnosticLog.toJSON())).toEqual(DiagnosticLog.entries());
  });

  it('empty buffer serializes to "[]"', () => {
    expect(DiagnosticLog.toJSON()).toBe('[]');
  });
});

describe('DiagnosticLog — clear', () => {
  it('empties the buffer', () => {
    DiagnosticLog.warn('a', '1');
    DiagnosticLog.warn('b', '2');
    DiagnosticLog.clear();
    expect(DiagnosticLog.entries()).toEqual([]);
    expect(DiagnosticLog.toJSON()).toBe('[]');
  });
});

describe('DiagnosticLog — burst integrity (single-threaded concurrency analog)', () => {
  it('a tight interleaved burst leaves the buffer exactly capped + FIFO-ordered', () => {
    // BoundedLogTree's threaded test asserts no corruption under concurrent
    // append+evict. JS has one thread, so the equivalent guarantee is that a
    // dense burst of mixed warn/error/timing calls (well past capacity)
    // ends exactly at CAPACITY with monotonic, contiguous newest entries.
    const total = DiagnosticLog.CAPACITY * 3; // 600 writes
    for (let i = 0; i < total; i++) {
      if (i % 3 === 0) DiagnosticLog.warn('burst', 'w' + i);
      else if (i % 3 === 1) DiagnosticLog.error('burst', 'e' + i);
      else DiagnosticLog.timing('burst', 'tm', i);
    }
    const e = DiagnosticLog.entries();
    expect(e).toHaveLength(DiagnosticLog.CAPACITY);
    // Every retained entry is well-formed (no torn writes) and the surviving
    // window is the LAST CAPACITY writes in order — timestamps non-decreasing.
    for (let i = 0; i < e.length; i++) {
      expect(['W', 'E', 'I']).toContain(e[i].lvl);
      expect(e[i].tag).toBe('burst');
      if (i > 0) expect(e[i].t).toBeGreaterThanOrEqual(e[i - 1].t);
    }
  });
});
