/* id-datasafe 245 (s39.2, L5.2): the web app's OPFS snapshot sink is its only copy of the
   library outside IndexedDB, and nothing exercised it. A small in-memory OPFS stands in for
   navigator.storage.getDirectory(): save writes and prunes, list is newest first with sizes,
   read refuses names that are no snapshot, a save killed mid-write (an empty file older than a
   minute) is dropped, clear empties the folder, and without writable streams there is no sink. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { snapshotSink, snapshotName, KEEP_DAYS } from './snapshot-sink.js';

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
