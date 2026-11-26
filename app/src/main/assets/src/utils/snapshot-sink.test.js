/* id-datasafe 245 (s39.2, L5.2): the web app's OPFS snapshot sink is its only copy of the
   library outside IndexedDB, and nothing exercised it. A small in-memory OPFS stands in for
   navigator.storage.getDirectory(): save writes and prunes, list is newest first with sizes,
   read refuses names that are no snapshot, a save killed mid-write (an empty file older than a
   minute) is dropped, clear empties the folder, and without writable streams there is no sink. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { snapshotSink, snapshotName, snapshotTime, pruneSnapshotNames, KEEP_DAYS, KEEP_WEEKS } from './snapshot-sink.js';

/** One OPFS directory in memory: name -> text. */
function fakeOpfs() {
  /** @type {Map<string, Map<string, string>>} */ const dirs = new Map();
  class FakeFileHandle {
    /** @param {Map<string, string>} files @param {string} name */
    constructor(files, name) { this.files = files; this.name = name; }
    async createWritable() {
      let buf = '';
      return { write: async (/** @type {string} */ t) => { buf += t; }, close: async () => { this.files.set(this.name, buf); } };
    }
    async getFile() {
      const text = this.files.get(this.name);
      if (text == null) throw new Error('NotFoundError');
      return { size: new TextEncoder().encode(text).length, text: async () => text };
    }
  }
  const dirHandle = (/** @type {Map<string, string>} */ files) => ({
    async *keys() { for (const k of [...files.keys()]) yield k; },
    async getFileHandle(/** @type {string} */ name, /** @type {any} */ opts) {
      if (!files.has(name)) {
        if (!(opts && opts.create)) throw new Error('NotFoundError');
        files.set(name, '');                 // OPFS creates the file empty
      }
      return new FakeFileHandle(files, name);
    },
    async removeEntry(/** @type {string} */ name) { files.delete(name); },
  });
  const root = {
    async getDirectoryHandle(/** @type {string} */ name, /** @type {any} */ opts) {
      if (!dirs.has(name)) { if (!(opts && opts.create)) throw new Error('NotFoundError'); dirs.set(name, new Map()); }
      return dirHandle(/** @type {Map<string, string>} */ (dirs.get(name)));
    },
  };
  return { dirs, root, FakeFileHandle };
}

const DAY = 86400000;
let opfs;
let savedStorage;

beforeEach(() => {
  opfs = fakeOpfs();
  savedStorage = Object.getOwnPropertyDescriptor(navigator, 'storage');
  Object.defineProperty(navigator, 'storage', { configurable: true, value: { getDirectory: async () => opfs.root } });
  /** @type {any} */ (globalThis).FileSystemFileHandle = opfs.FakeFileHandle;
  delete /** @type {any} */ (window).AndroidBridge;
});

afterEach(() => {
  vi.useRealTimers();
  if (savedStorage) Object.defineProperty(navigator, 'storage', savedStorage);
  else delete /** @type {any} */ (navigator).storage;
  delete /** @type {any} */ (globalThis).FileSystemFileHandle;
});

const files = () => /** @type {Map<string, string>} */ (opfs.dirs.get('vot-snapshots'));

describe('the OPFS snapshot sink (web)', () => {
  it('saves, lists newest first with sizes, and reads a snapshot back', async () => {
    const sink = snapshotSink();
    expect(sink && sink.kind).toBe('opfs');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 9, 20, 12));
    expect(await sink.save('{"day":1}')).toBe(true);
    vi.setSystemTime(Date.UTC(2026, 9, 21, 12));
    expect(await sink.save('{"day":2}')).toBe(true);
    const list = await sink.list();
    expect(list.map((x) => x.name)).toEqual([snapshotName(Date.UTC(2026, 9, 21, 12)), snapshotName(Date.UTC(2026, 9, 20, 12))]);
    expect(list[0].size).toBe('{"day":2}'.length);
    expect(await sink.read(list[1].name)).toBe('{"day":1}');
  });

  it('refuses to read a name that is no snapshot, and answers empty for one that is gone', async () => {
    const sink = snapshotSink();
    expect(await sink.save('{"x":1}')).toBe(true);
    files().set('notes.txt', 'private');
    expect(await sink.read('notes.txt')).toBe('');
    expect(await sink.read('../vot-snapshots/notes.txt')).toBe('');
    expect(await sink.read(snapshotName(Date.UTC(2020, 0, 1)))).toBe('');
    expect((await sink.list()).every((x) => x.name !== 'notes.txt')).toBe(true);
  });

  it('keeps one per day, prunes past the kept days, and drops a save killed mid-write', async () => {
    const sink = snapshotSink();
    vi.useFakeTimers({ toFake: ['Date'] });
    const start = Date.UTC(2026, 9, 1, 12);
    for (let d = 0; d < KEEP_DAYS; d++) {
      vi.setSystemTime(start + d * DAY);
      await sink.save('{"d":' + d + '}');
      vi.setSystemTime(start + d * DAY + 3600000);
      await sink.save('{"d":' + d + ',"later":1}');           // a second save the same day
    }
    expect(files().size).toBe(KEEP_DAYS);                     // the newest of each day
    // A killed save: an empty file from an hour before the next one.
    const killed = snapshotName(start + KEEP_DAYS * DAY - 3600000);
    files().set(killed, '');
    vi.setSystemTime(start + KEEP_DAYS * DAY);
    await sink.save('{"d":"new"}');
    expect(files().has(killed)).toBe(false);
    expect([...files().values()].every((t) => t.length > 0)).toBe(true);
  });

  it('clear empties the folder and leaves files that are no snapshot', async () => {
    const sink = snapshotSink();
    await sink.save('{"x":1}');
    files().set('other.bin', 'x');
    expect(await sink.clear()).toBe(true);
    expect([...files().keys()]).toEqual(['other.bin']);
    expect(await sink.list()).toEqual([]);
  });

  it('a save that cannot write says so', async () => {
    const sink = snapshotSink();
    opfs.FakeFileHandle.prototype.createWritable = async () => { throw new Error('QuotaExceededError'); };
    expect(await sink.save('{"x":1}')).toBe(false);
  });

  it('is no sink without writable streams (Safari before 26) or without OPFS', () => {
    delete /** @type {any} */ (globalThis).FileSystemFileHandle;
    expect(snapshotSink()).toBeNull();
    Object.defineProperty(navigator, 'storage', { configurable: true, value: {} });
    /** @type {any} */ (globalThis).FileSystemFileHandle = opfs.FakeFileHandle;
    expect(snapshotSink()).toBeNull();
  });
});

describe('snapshotTime and pruneSnapshotNames (pure helpers)', () => {
  const noon = (/** @type {number} */ y, /** @type {number} */ m, /** @type {number} */ d) => new Date(y, m, d, 12, 0, 0).getTime();

  it('snapshotTime reads a valid name back and answers 0 for anything else', () => {
    const ms = noon(2026, 9, 20);
    expect(snapshotTime(snapshotName(ms))).toBe(ms);
    expect(snapshotTime('')).toBe(0);
    expect(snapshotTime('notes.txt')).toBe(0);
    expect(snapshotTime('snap-20261020-120000.txt')).toBe(0);
    expect(snapshotTime('snap-2026-10-20.json')).toBe(0);
    expect(snapshotTime('xsnap-20261020-120000.json')).toBe(0);
  });

  it('prune keeps one per day for KEEP_DAYS days, then one per week for KEEP_WEEKS weeks', () => {
    const dayNames = [20, 21, 22, 23, 24, 25, 26].map((d) => snapshotName(noon(2026, 9, d)));
    const sun = new Date(2026, 8, 1, 12, 0, 0);
    while (sun.getDay() !== 0) sun.setDate(sun.getDate() + 1);
    const sunMs = sun.getTime();
    const sundays = [0, 1, 2, 3, 4].map((w) => snapshotName(sunMs + w * 7 * DAY));
    const newestMon = snapshotName(sunMs + 4 * 7 * DAY + DAY);
    const drop = pruneSnapshotNames([...dayNames, ...sundays, newestMon, 'notes.txt', 'snap-bad.json']);
    expect(drop.sort()).toEqual([sundays[0], sundays[4]].sort());
    expect(dayNames.length).toBe(KEEP_DAYS);
    expect(KEEP_WEEKS).toBe(4);
  });

  it('a broken snapshot never keeps its day: the good copy before it survives', () => {
    const newest = snapshotName(noon(2026, 9, 26));
    const earlierSameDay = snapshotName(noon(2026, 9, 26) - 3600000);
    const dayBefore = snapshotName(noon(2026, 9, 25));
    expect(pruneSnapshotNames([newest, earlierSameDay, dayBefore])).toEqual([earlierSameDay]);
    expect(pruneSnapshotNames([newest, earlierSameDay, dayBefore], new Set([newest]))).toEqual([newest]);
    expect(pruneSnapshotNames([])).toEqual([]);
    expect(pruneSnapshotNames(['junk', 'also-junk'])).toEqual([]);
  });
});

describe('the Android snapshot sink (bridge)', () => {
  afterEach(() => { delete /** @type {any} */ (window).AndroidBridge; });
  const goodName = 'snap-20261020-120000.json';

  it('a bridge without snapshotSave is no Android sink: OPFS answers instead', () => {
    /** @type {any} */ (window).AndroidBridge = {};
    const a = snapshotSink();
    expect(a && a.kind).toBe('opfs');
    /** @type {any} */ (window).AndroidBridge = { snapshotSave: 'yes' };
    const b = snapshotSink();
    expect(b && b.kind).toBe('opfs');
  });

  it('saves, lists only snapshot names, reads, and clears through the bridge', async () => {
    const bridge = {
      snapshotSave: vi.fn(() => true),
      snapshotList: vi.fn(() => JSON.stringify([{ name: goodName, at: 1, size: 2 }, { name: 'junk.txt' }, {}, null])),
      snapshotRead: vi.fn((/** @type {string} */ n) => 'data:' + n),
      snapshotClear: vi.fn(() => 1),
    };
    /** @type {any} */ (window).AndroidBridge = bridge;
    const sink = snapshotSink();
    expect(sink && sink.kind).toBe('android');
    expect(await sink.save('{"x":1}')).toBe(true);
    expect(bridge.snapshotSave).toHaveBeenCalledWith('{"x":1}');
    expect(await sink.list()).toEqual([{ name: goodName, at: 1, size: 2 }]);
    expect(await sink.read(goodName)).toBe('data:' + goodName);
    expect(await sink.clear()).toBe(true);
  });

  it('falsy and empty bridge answers stay quiet: false, empty list, empty read', async () => {
    /** @type {any} */ (window).AndroidBridge = {
      snapshotSave: () => 0,
      snapshotList: () => '',
      snapshotRead: () => null,
      snapshotClear: () => '',
    };
    const sink = snapshotSink();
    expect(await sink.save('x')).toBe(false);
    expect(await sink.list()).toEqual([]);
    expect(await sink.read(goodName)).toBe('');
    expect(await sink.clear()).toBe(false);
    /** @type {any} */ (window).AndroidBridge = {
      snapshotSave: () => true,
      snapshotList: () => '"not-an-array"',
      snapshotRead: () => 'y',
      snapshotClear: () => true,
    };
    const s2 = snapshotSink();
    expect(await s2.list()).toEqual([]);
    /** @type {any} */ (window).AndroidBridge = {
      snapshotSave: () => true,
      snapshotList: () => 'not json at all',
      snapshotRead: () => 'y',
      snapshotClear: () => true,
    };
    const s3 = snapshotSink();
    expect(await s3.list()).toEqual([]);
  });

  it('a throwing bridge answers false and empty, never throws', async () => {
    const boom = () => { throw new Error('bridge gone'); };
    /** @type {any} */ (window).AndroidBridge = { snapshotSave: boom, snapshotList: boom, snapshotRead: boom, snapshotClear: boom };
    const sink = snapshotSink();
    expect(await sink.save('x')).toBe(false);
    expect(await sink.list()).toEqual([]);
    expect(await sink.read(goodName)).toBe('');
    expect(await sink.clear()).toBe(false);
  });
});

describe('the OPFS sink, failure arms', () => {
  it('is no sink without storage, or without a FileSystemFileHandle that can write', () => {
    Object.defineProperty(navigator, 'storage', { configurable: true, value: undefined });
    expect(snapshotSink()).toBeNull();
    Object.defineProperty(navigator, 'storage', { configurable: true, value: { getDirectory: async () => opfs.root } });
    /** @type {any} */ (globalThis).FileSystemFileHandle = {};
    expect(snapshotSink()).toBeNull();
    /** @type {any} */ (globalThis).FileSystemFileHandle = class {};
    expect(snapshotSink()).toBeNull();
  });

  it('when OPFS itself refuses: list is empty, read is empty, save and clear say false', async () => {
    Object.defineProperty(navigator, 'storage', { configurable: true, value: { getDirectory: async () => { throw new Error('denied'); } } });
    const sink = snapshotSink();
    expect(sink && sink.kind).toBe('opfs');
    expect(await sink.list()).toEqual([]);
    expect(await sink.read(snapshotName(Date.UTC(2026, 9, 20, 12)))).toBe('');
    expect(await sink.save('{"x":1}')).toBe(false);
    expect(await sink.clear()).toBe(false);
  });

  it('read refuses non-string names without touching OPFS', async () => {
    const sink = snapshotSink();
    expect(await sink.read(/** @type {any} */ (null))).toBe('');
    expect(await sink.read(/** @type {any} */ (12345))).toBe('');
  });

  it('a young empty file across midnight is no killed save yet and survives the prune', async () => {
    const sink = snapshotSink();
    await sink.list();
    vi.useFakeTimers({ toFake: ['Date'] });
    const midnight = new Date(2026, 9, 21, 0, 0, 0).getTime();
    const youngEmpty = snapshotName(midnight - 15000);
    files().set(youngEmpty, '');
    vi.setSystemTime(midnight + 15000);
    expect(await sink.save('{"after":"midnight"}')).toBe(true);
    expect(files().has(youngEmpty)).toBe(true);
  });

  it('a file that vanishes before its size is read is judged next time, and the save still lands', async () => {
    const sink = snapshotSink();
    vi.useFakeTimers({ toFake: ['Date'] });
    const t0 = Date.UTC(2026, 9, 20, 12);
    vi.setSystemTime(t0);
    expect(await sink.save('{"day":1}')).toBe(true);
    const oldName = snapshotName(t0);
    const map = files();
    const origGet = map.get.bind(map);
    map.get = (k) => { if (k === oldName) throw new Error('gone'); return origGet(k); };
    vi.setSystemTime(t0 + DAY);
    expect(await sink.save('{"day":2}')).toBe(true);
    map.get = origGet;
  });

  it('a prune that cannot remove a file still saves: the next prune retries', async () => {
    const sink = snapshotSink();
    vi.useFakeTimers({ toFake: ['Date'] });
    const start = Date.UTC(2026, 9, 1, 12);
    vi.setSystemTime(start);
    expect(await sink.save('{"d":0}')).toBe(true);
    const first = snapshotName(start);
    const map = files();
    const origDelete = map.delete.bind(map);
    map.delete = () => { throw new Error('locked'); };
    vi.setSystemTime(start + 3600000);
    expect(await sink.save('{"d":0,"later":1}')).toBe(true);
    map.delete = origDelete;
    expect(files().has(first)).toBe(true);
    expect(files().size).toBe(2);
  });
});
