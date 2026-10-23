// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   download-tree — what the Downloads screen's Choose tab ticks (downloads brief 2026-10-23, D3; 3b + 3c)
   ═══════════════════════════════════════════════════════════════════════
   The tree: The Volumes of Truth › collection › letter, and The Bible › edition › testament › book › chapter.
   A UNIT is one checkbox: a letter with all its parts (Christmas in two parts is one), or one Bible chapter.
   A tick means "on this phone after Apply": units already on the phone start ticked, and unticking one marks it
   for removal. Parents are tri-state ('all' / 'some' / 'none'); tapping a dash selects everything under it (M3).

   Plain functions over plain data: the screen builds the tree from the player's catalog (buildTvot / buildBible
   take the player as an argument), keeps `wanted` (a Set of unit ids) in React state, and asks planOf for the
   footer. Sizes and lengths come from the store (sizeOf: the baked table, D1) and AudioLengths.
   ═══════════════════════════════════════════════════════════════════════ */

/** @typedef {{ url: string, key?: string, title?: string, partLabel?: string | null }} Track */
/** @typedef {{ id: string, title: string, name: string, tracks: Track[], chapter?: number }} Unit  name = what a download is called (the letter, or the chapter's book) */
/**
 * @typedef {{ id: string, title: string, noun: 'recording' | 'chapter', units: Unit[], children?: TreeNode[],
 *   volKey?: string, suffix?: string }} TreeNode  units = every unit under the node, in order; suffix = what the
 *   confirm sheet adds after its name (a book's edition)
 */

/** Old Testament books are BIBLE_AUDIO_BOOKS' first 39. */
const OT_BOOKS = 39;

/** @param {TreeNode[]} children @returns {Unit[]} */
function _unitsUnder(children) {
  /** @type {Unit[]} */
  const out = [];
  for (const c of children) for (const u of c.units) out.push(u);
  return out;
}

/**
 * The Volumes of Truth branch: each collection with a recording, its letters in reading order.
 * @param {{ collections: any[], itemsOf: (col: any) => any[], player: any, voice?: string }} o
 *   itemsOf = the collection's preface and letters (colPreface + colLetterArr); voice = a reader code, or '' for the
 *   reading each row's own Listen plays (AudioPlayer.playbackTracks)
 * @returns {TreeNode}
 */
export function buildTvot({ collections, itemsOf, player, voice = '' }) {
  /** @type {TreeNode[]} */
  const children = [];
  for (const col of collections || []) {
    if (!col || !col.volKey) continue;
    const label = col.label || '';
    /** @type {Unit[]} */
    const units = [];
    for (const item of itemsOf(col) || []) {
      if (!item || !item.id) continue;
      let tracks = /** @type {Track[]} */ (player.playbackTracks(col.volKey, item, label) || []);
      if (voice && typeof player.renditionsFor === 'function') {
        const r = (player.renditionsFor(col.volKey, item, label) || []).find((/** @type {any} */ x) => x.reader === voice);
        if (r && r.tracks && r.tracks.length) tracks = r.tracks;
      }
      tracks = tracks.filter((t) => t && typeof t.url === 'string');
      if (tracks.length) units.push({ id: col.volKey + ':' + item.id, title: item.title || '', name: item.title || '', tracks });
    }
    if (units.length) children.push({ id: col.volKey, volKey: col.volKey, title: label, noun: 'recording', units });
  }
  return { id: 'tvot', title: 'The Volumes of Truth', noun: 'recording', children, units: _unitsUnder(children) };
}

/**
 * The Studies branch (brief 3b): each Bible/Letter Study with a recording, its recorded chapters in order. The player
 * knows a study's chapters as volKey 'study' ("study:<chapterId>"); a study's node id is its Listening Library volKey
 * ('study:<studyId>'), so "Choose…" on a study opens the tree at it.
 * @param {{ studies: any[], player: any }} o
 * @returns {TreeNode}
 */
export function buildStudies({ studies, player }) {
  /** @type {TreeNode[]} */
  const children = [];
  for (const st of studies || []) {
    if (!st || !st.id || !Array.isArray(st.chapters)) continue;
    const title = st.title || '';
    /** @type {Unit[]} */
    const units = [];
    for (const ch of st.chapters) {
      if (!ch || !ch.id) continue;
      const tracks = /** @type {Track[]} */ (player.playbackTracks('study', ch, title) || []).filter((t) => t && typeof t.url === 'string');
      if (tracks.length) units.push({ id: 'study:' + ch.id, title: ch.title || '', name: ch.title || title, tracks });
    }
    if (units.length) children.push({ id: 'study:' + st.id, volKey: 'study:' + st.id, title, noun: 'recording', units });
  }
  return { id: 'studies', title: 'Studies', noun: 'recording', children, units: _unitsUnder(children) };
}

/**
 * One Bible edition's branch: Old Testament / New Testament › books › chapters.
 * @param {{ edition: { volKey: string, label?: string, short?: string }, books: Array<[string, string]>, player: any }} o
 * @returns {TreeNode}
 */
export function buildBible({ edition, books, player }) {
  const volKey = edition.volKey;
  /** @type {TreeNode[][]} */
  const halves = [[], []];
  (books || []).forEach((b, i) => {
    const [id, title] = b;
    const tracks = /** @type {Track[]} */ (player.playbackTracks(volKey, { id, title }, edition.label || '') || [])
      .filter((t) => t && typeof t.url === 'string');
    if (!tracks.length) return;
    const units = tracks.map((t, n) => ({ id: t.url, title: t.title || title, name: title, tracks: [t], chapter: _chapterOf(t) || n + 1 }));
    halves[i < OT_BOOKS ? 0 : 1].push({ id: volKey + ':' + id, volKey, title, noun: 'chapter', units });
  });
  const testaments = [
    { id: volKey + '#ot', title: 'Old Testament', children: halves[0] },
    { id: volKey + '#nt', title: 'New Testament', children: halves[1] },
  ].filter((t) => t.children.length)
    .map((t) => (/** @type {TreeNode} */ ({ ...t, volKey, noun: 'chapter', units: _unitsUnder(t.children) })));
  return { id: volKey, volKey, title: edition.short || edition.label || '', noun: 'chapter', children: testaments, units: _unitsUnder(testaments) };
}

/** @param {Track} t @returns {number} */
function _chapterOf(t) {
  const m = t && typeof t.partLabel === 'string' ? t.partLabel.match(/^Chapter (\d+)$/) : null;
  return m ? Number(m[1]) : 0;
}

/** @param {any} off the store @param {Unit} unit @returns {boolean} every part of it is on the phone */
export function unitOnPhone(off, unit) {
  return unit.tracks.length > 0 && unit.tracks.every((t) => off.statusOf(t.url) === 'saved');
}

/** A track on the phone or on its way (queued or downloading). @param {any} off @param {string} url */
function _held(off, url) {
  const s = off.statusOf(url);
  return s === 'saved' || s === 'queued' || s === 'downloading';
}

/**
 * Every part of it is on the phone or on its way: a tick it already has, so Apply never asks for it twice.
 * @param {any} off @param {Unit} unit @returns {boolean}
 */
export function unitHeld(off, unit) {
  return unit.tracks.length > 0 && unit.tracks.every((t) => _held(off, t.url));
}

/** The ticks the screen opens with: what is on the phone or on its way. @param {any} off @param {Unit[]} units */
export function initialWanted(off, units) {
  return new Set(units.filter((u) => unitHeld(off, u)).map((u) => u.id));
}

/**
 * @param {{ units: Unit[] }} node
 * @param {Set<string>} wanted
 * @returns {'all' | 'some' | 'none'}
 */
export function checkState(node, wanted) {
  let n = 0;
  for (const u of node.units) if (wanted.has(u.id)) n++;
  return n === 0 ? 'none' : n === node.units.length ? 'all' : 'some';
}

/**
 * A tap on a node's box: all ticked -> none; some or none -> all (tapping a dash selects everything under it).
 * @param {{ units: Unit[] }} node @param {Set<string>} wanted @returns {Set<string>}
 */
export function toggleNode(node, wanted) {
  const next = new Set(wanted);
  const on = checkState(node, wanted) !== 'all';
  for (const u of node.units) { if (on) next.add(u.id); else next.delete(u.id); }
  return next;
}

/**
 * A range pick in the chapter grid: every unit from `fromId` to `toId` (either order) is ticked.
 * @param {Unit[]} units @param {string} fromId @param {string} toId @param {Set<string>} wanted @returns {Set<string>}
 */
export function selectRange(units, fromId, toId, wanted) {
  const a = units.findIndex((u) => u.id === fromId);
  const b = units.findIndex((u) => u.id === toId);
  const next = new Set(wanted);
  if (a < 0 || b < 0) return next;
  for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.add(units[i].id);
  return next;
}

/**
 * What Apply would do: the units to add (ticked, not all on the phone or on its way) and to remove (held, unticked:
 * its saved parts are removed and the ones on their way cancelled), with the bytes to download (parts already held
 * left out), the seconds added and the bytes freed. `addBytes` is null while any size is unknown (`addKnown` then
 * holds what is known).
 * @param {any} off the store
 * @param {Unit[]} units every unit of the tree
 * @param {Set<string>} wanted
 * @param {(url: string) => number | null} [secondsOf]
 */
export function planOf(off, units, wanted, secondsOf) {
  /** @type {Unit[]} */ const add = [];
  /** @type {Unit[]} */ const remove = [];
  let addKnown = 0; let unknown = false; let seconds = 0; let timed = true; let removeBytes = 0;
  for (const u of units) {
    const here = unitHeld(off, u);
    if (wanted.has(u.id) && !here) {
      add.push(u);
      for (const t of u.tracks) {
        const sec = secondsOf ? secondsOf(t.url) : null;
        if (sec == null) timed = false; else seconds += sec;
        if (_held(off, t.url)) continue;
        const size = off.sizeOf(t.url);
        if (size) addKnown += size; else unknown = true;
      }
    } else if (!wanted.has(u.id) && here) {
      remove.push(u);
      for (const t of u.tracks) if (off.statusOf(t.url) === 'saved') removeBytes += off.sizeOf(t.url) || 0;
    }
  }
  return {
    add, remove, addKnown, removeBytes,
    addBytes: unknown ? null : addKnown,
    addSeconds: add.length && timed ? seconds : null,
  };
}

/**
 * How much more room a plan needs past the phone's free space and the margin the store keeps (0 = it fits, or the
 * free space is unknown). Removals run first, so the room they free counts.
 * @param {number} free bytes, < 0 unknown @param {number} addBytes @param {number} removeBytes @param {number} margin
 */
export function roomShort(free, addBytes, removeBytes, margin) {
  if (!(free >= 0)) return 0;
  return Math.max(0, addBytes + margin - free - removeBytes);
}

/**
 * The confirm sheet's lines: units grouped by their collection or book, in tree order, each a label and a count.
 * A whole collection or book reads its name; part of a book reads its chapter runs ("Genesis 13-24").
 * @param {TreeNode[]} groups the collections and books (leaves of the parent level)
 * @param {Unit[]} picked
 * @returns {Array<{ id: string, label: string, units: Unit[], noun: 'recording' | 'chapter' }>}
 */
export function groupPicked(groups, picked) {
  const ids = new Set(picked.map((u) => u.id));
  const out = [];
  for (const g of groups) {
    const units = g.units.filter((u) => ids.has(u.id));
    if (!units.length) continue;
    let label = g.title;
    if (g.noun === 'chapter' && units.length < g.units.length) label += ' ' + chapterRuns(units.map((u) => u.chapter || 0));
    if (g.suffix) label += ' · ' + g.suffix;
    out.push({ id: g.id, label, units, noun: g.noun });
  }
  return out;
}

/** "1-11, 14, 20-22" @param {number[]} chapters @returns {string} */
export function chapterRuns(chapters) {
  const xs = [...new Set(chapters.filter((n) => n > 0))].sort((a, b) => a - b);
  const runs = [];
  for (let i = 0; i < xs.length;) {
    let j = i;
    while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++;
    runs.push(j > i ? xs[i] + '-' + xs[j] : String(xs[i]));
    i = j + 1;
  }
  return runs.join(', ');
}

/** "1 recording", "1,189 chapters" @param {number} n @param {string} noun @returns {string} */
export function countOf(n, noun) {
  return n.toLocaleString('en-US') + ' ' + noun + (n === 1 ? '' : 's');
}

/** "6 h 10 min", "55 min", "under a minute"; '' for unknown. @param {number | null | undefined} sec @returns {string} */
export function formatLength(sec) {
  if (sec == null || !(sec >= 0)) return '';
  const min = Math.round(sec / 60);
  if (min < 1) return 'under a minute';
  if (min < 60) return min + ' min';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? h + ' h ' + m + ' min' : h + ' h';
}
