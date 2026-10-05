/* ═══════════════════════════════════════════════════════════════════════
   snapshot-sink — where the automatic snapshots live (datasafe 2026-10-05)
   ═══════════════════════════════════════════════════════════════════════
   ES module. Bundled into bundle-b (data-safety.js is its only caller).

   On 2026-10-02 the owner's phone came back from a WebView storage loss with
   an empty database, and every copy the app kept was in that same storage. A
   snapshot is only worth having where that loss cannot reach it:

     - The phone app: window.AndroidBridge.snapshot* (SnapshotStore.kt), the
       app's private files dir - survives a WebView storage wipe, goes only
       with an uninstall or "Clear storage". Called directly, guarded, like
       setAudioActive (BridgeContractTest lists them).
     - The web app: the Origin Private File System, in a 'vot-snapshots'
       directory. Same origin as IndexedDB, so a browser that clears the
       site's data clears these too - weaker, and the Your Data copy says so.
       Kept anyway: a database that comes back empty or corrupt on its own
       leaves OPFS files alone.

   Both answer one shape, every call async and quiet on failure:
     save(json) → Promise<boolean>     list() → Promise<{name, at, size}[]> (newest first)
     read(name) → Promise<string>      clear() → Promise<boolean>
   Names are `snap-yyyyMMdd-HHmmss.json` (local time) on both, and both keep
   the newest per day for KEEP_DAYS days plus the newest per week for
   KEEP_WEEKS weeks before those (pruneSnapshotNames - the web side's copy of
   SnapshotStore.prune).
   ═══════════════════════════════════════════════════════════════════════ */

export const KEEP_DAYS = 7;
export const KEEP_WEEKS = 4;
const NAME = /^snap-(\d{8})-(\d{6})\.json$/;
const OPFS_DIR = 'vot-snapshots';

/** @param {number} n */
const pad = (n) => String(n).padStart(2, '0');

/** `snap-yyyyMMdd-HHmmss.json` for a local time. @param {number} ms */
export function snapshotName(ms) {
  const d = new Date(ms);
  return 'snap-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '.json';
}

/** The local time a snapshot name carries (epoch ms), or 0. @param {string} name */
export function snapshotTime(name) {
  const m = NAME.exec(name);
  if (!m) return 0;
  const [d, t] = [m[1], m[2]];
  return new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +t.slice(0, 2), +t.slice(2, 4), +t.slice(4, 6)).getTime();
}

/** A week key for a local time (the Sunday it starts on). @param {number} ms */
function weekKey(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/**
 * The snapshot names to delete: keep the newest of each of the KEEP_DAYS most
 * recent days that have one, then the newest of each of the KEEP_WEEKS weeks
 * before those.
 * @param {string[]} names
 * @returns {string[]}
 */
export function pruneSnapshotNames(names) {
  const sorted = names.filter((n) => NAME.test(n)).sort().reverse();
  const days = new Set();
  const weeks = new Set();
  /** @type {string[]} */ const drop = [];
  for (const n of sorted) {
    const day = /** @type {RegExpExecArray} */ (NAME.exec(n))[1];
    if (days.has(day)) { drop.push(n); continue; }
    if (days.size < KEEP_DAYS) { days.add(day); continue; }
    const wk = weekKey(snapshotTime(n));
    if (weeks.has(wk) || weeks.size >= KEEP_WEEKS) { drop.push(n); continue; }
    weeks.add(wk);
    days.add(day);
  }
  return drop;
}

/** The phone app's sink, or null when the bridge has no snapshot methods (an older shell). */
function androidSink() {
  const b = /** @type {any} */ (typeof window !== 'undefined' ? window : {}).AndroidBridge;
  if (!b || typeof b.snapshotSave !== 'function') return null;
  return {
    kind: 'android',
    save: async (/** @type {string} */ json) => { try { return !!b.snapshotSave(json); } catch (_e) { return false; } },
    list: async () => {
      try {
        const arr = JSON.parse(b.snapshotList() || '[]');
        return Array.isArray(arr) ? arr.filter((x) => x && NAME.test(x.name)) : [];
      } catch (_e) { return []; }
    },
    read: async (/** @type {string} */ name) => { try { return String(b.snapshotRead(name) || ''); } catch (_e) { return ''; } },
    clear: async () => { try { return !!b.snapshotClear(); } catch (_e) { return false; } },
  };
}

/** The web app's sink (OPFS), or null where OPFS or its writable streams are missing. */
function opfsSink() {
  const nav = /** @type {any} */ (typeof navigator !== 'undefined' ? navigator : null);
  if (!nav || !nav.storage || typeof nav.storage.getDirectory !== 'function') return null;
  const dir = async () => (await nav.storage.getDirectory()).getDirectoryHandle(OPFS_DIR, { create: true });
  const names = async () => {
    /** @type {string[]} */ const out = [];
    const d = await dir();
    for await (const key of d.keys()) if (NAME.test(key)) out.push(key);
    return out;
  };
  return {
    kind: 'opfs',
    save: async (/** @type {string} */ json) => {
      try {
        const d = await dir();
        const h = await d.getFileHandle(snapshotName(Date.now()), { create: true });
        if (typeof h.createWritable !== 'function') return false;
        const w = await h.createWritable();
        await w.write(json);
        await w.close();
        for (const n of pruneSnapshotNames(await names())) { try { await d.removeEntry(n); } catch (_e) { /* next prune */ } }
        return true;
      } catch (_e) { return false; }
    },
    list: async () => {
      try {
        const d = await dir();
        const out = [];
        for (const n of (await names()).sort().reverse()) {
          const f = await (await d.getFileHandle(n)).getFile();
          out.push({ name: n, at: snapshotTime(n), size: f.size });
        }
        return out;
      } catch (_e) { return []; }
    },
    read: async (/** @type {string} */ name) => {
      if (!NAME.test(String(name))) return '';
      try { return await (await (await dir()).getFileHandle(name)).getFile().then((f) => f.text()); } catch (_e) { return ''; }
    },
    clear: async () => {
      try {
        const d = await dir();
        for (const n of await names()) await d.removeEntry(n);
        return true;
      } catch (_e) { return false; }
    },
  };
}

/**
 * Where this platform keeps snapshots, or null when it has nowhere outside the
 * database to put them.
 */
export function snapshotSink() {
  return androidSink() || opfsSink();
}
