/* The writers' replies in one folder, rewrites applied (search200, 2026-10-18): what check-tri.mjs gates and
   freeze-tri.mjs freezes, read one way for both.
   ─────────────────────────────────────────────────────────────────
     <folder>/**\/<packet>.json            a packet's reply, [{id, q[, from]}] (write.py; reserves sit beside cases)
     <folder>/rewrites/<stamp>-<name>.json  write.py --rewrite's replies, [{id, q[, from], why}]: applied in file-name
                                           order (the UTC stamp leads, so that is the order they were written)
   An id's latest version is the one gated and frozen; its v counts its versions (1 = the packet's reply). Every
   earlier version is retired with the why of the version that replaced it. gates.json, calls.jsonl and *.tmp are not
   replies. Pure reading: nothing prints, so a sealed folder stays sealed.
   ─────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';

/** Every reply file under a folder: the packets' replies, then the rewrites in name order (paths absolute). */
export function replyFiles(folder) {
  const orig = []; const rew = [];
  (function walk(d, inRewrites) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, inRewrites || e.name === 'rewrites');
      else if (e.name.endsWith('.json') && e.name !== 'gates.json') (inRewrites ? rew : orig).push(p);
    }
  })(folder, false);
  orig.sort();
  rew.sort((a, b) => path.basename(a).localeCompare(path.basename(b)) || a.localeCompare(b));
  return { orig, rew };
}

/** One reply file's objects; throws naming the file (never its content) when it is not a reply. */
function readArray(f) {
  let arr;
  try { arr = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { throw new Error('not JSON: ' + f); }
  if (!Array.isArray(arr)) throw new Error('not a writer reply (an array): ' + f);
  return arr;
}
const str = (x) => (typeof x === 'string' ? x : undefined);

/** The folder's replies. rows: one per id, its latest version: {id, q, from, packet, src (path relative to the
    folder), v, retired: [{q, from?, why}], dupId (a second packet reply for an id already replied), orphan (a rewrite
    of an id no packet replied)}; plus the files read and each packet's ids (for the missing count). */
export function readReplies(folder) {
  const { orig, rew } = replyFiles(folder);
  const rel = (f) => path.relative(folder, f).replace(/\\/g, '/');
  const rows = []; const byId = new Map(); const packets = new Map();
  for (const f of orig) {
    const packet = path.basename(f, '.json');
    const ids = new Set();
    for (const o of readArray(f)) {
      const id = o && typeof o.id === 'string' ? o.id : '?';
      ids.add(id);
      const r = { id, q: str(o && o.q) || '', from: str(o && o.from), packet, src: rel(f), v: 1, retired: [], dupId: byId.has(id), orphan: false };
      rows.push(r);
      if (!byId.has(id)) byId.set(id, r);
    }
    packets.set(packet, ids);
  }
  for (const f of rew) {
    for (const o of readArray(f)) {
      const id = o && typeof o.id === 'string' ? o.id : '?';
      const why = str(o && o.why) || '';
      const cur = byId.get(id);
      const next = { id, q: str(o && o.q) || '', from: str(o && o.from), src: rel(f) };
      if (!cur) { const r = { ...next, packet: path.basename(f, '.json'), v: 1, retired: [], dupId: false, orphan: true }; rows.push(r); byId.set(id, r); continue; }
      cur.retired.push({ q: cur.q, ...(cur.from != null ? { from: cur.from } : {}), why });
      Object.assign(cur, next, { v: cur.v + 1 });
    }
  }
  return { rows, files: orig.concat(rew), packets };
}
