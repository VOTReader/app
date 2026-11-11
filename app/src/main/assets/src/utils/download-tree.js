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

   Readings (dl-rework A and C, 2026-11-10). A letter may have several readings (Benjamin, Timothy, text-to-speech,
   with music); each is its own download. A unit carries them all (`readings`, the primary first) and the one Apply
   fetches (`tracks`, `reader`): the chosen voice where the letter has it, else its default reading (`fallback`
   says so). A letter is on the phone when ANY reading is: never because of which voice is chosen. A letter with
   more than one reading takes a tick per reading too (`<unit id>@<reader>`), so one reading can be added or removed
   by itself; with none of those ticked, a ticked letter means its fetched reading. Nothing here is stored: saved
   recordings stay keyed by their URL, so what was downloaded before is recognised as it was.
   ═══════════════════════════════════════════════════════════════════════ */

/** @typedef {{ url: string, key?: string, title?: string, partLabel?: string | null, readerCode?: string }} Track */
/** @typedef {{ reader: string, tracks: Track[] }} Reading */
/**
 * @typedef {{ id: string, title: string, name: string, tracks: Track[], chapter?: number, reader?: string,
 *   readings?: Reading[], fallback?: boolean }} Unit  name = what a download is called (the letter, or the chapter's
 *   book); reader = whose reading `tracks` is; fallback = a voice was chosen and this letter has no reading by it
 */

/** One set of reader names everywhere (dl-rework C, defect 8). */
export const READER_NAMES = Object.freeze({ B: 'Benjamin', T: 'Timothy', V: 'Text-to-speech', M: 'With music' });

/** "Benjamin", "Text-to-speech"; '' for no reader or an unknown one. @param {string | null | undefined} code */
export function readerName(code) {
  return code && Object.prototype.hasOwnProperty.call(READER_NAMES, code) ? READER_NAMES[/** @type {keyof typeof READER_NAMES} */ (code)] : '';
}

/** A reading's own tick: `<unit id>@<reader>`. @param {Unit} unit @param {string} reader */
export function readingId(unit, reader) {
  return unit.id + '@' + reader;
}

/** Every reading of a unit (one for a unit that knows only its tracks). @param {Unit} unit @returns {Reading[]} */
export function readingsOf(unit) {
  return unit.readings && unit.readings.length ? unit.readings : [{ reader: unit.reader || '', tracks: unit.tracks }];
}
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

/** @param {any[] | null | undefined} tracks @returns {Track[]} */
const _playable = (tracks) => (Array.isArray(tracks) ? tracks : []).filter((t) => t && typeof t.url === 'string');

/**
 * The Volumes of Truth branch: each collection with a recording, its letters in reading order.
 * @param {{ collections: any[], itemsOf: (col: any) => any[], player: any, voice?: string, only?: boolean }} o
 *   itemsOf = the collection's preface and letters (colPreface + colLetterArr); voice = the chosen reader code (the
 *   Letter Voice setting), or '' for each letter's default reading (the manifest's primary); only = leave out the
 *   letters the chosen voice did not read
 * @returns {TreeNode}
 */
export function buildTvot({ collections, itemsOf, player, voice = '', only = false }) {
  /** @type {TreeNode[]} */
  const children = [];
  for (const col of collections || []) {
    if (!col || !col.volKey) continue;
    const label = col.label || '';
    /** @type {Unit[]} */
    const units = [];
    for (const item of itemsOf(col) || []) {
      if (!item || !item.id) continue;
      /** @type {Reading[]} */
      let readings = typeof player.renditionsFor === 'function'
        ? (player.renditionsFor(col.volKey, item, label) || []).map((/** @type {any} */ r) => ({ reader: String((r && r.reader) || ''), tracks: _playable(r && r.tracks) }))
        : [];
      readings = readings.filter((r) => r.tracks.length);
      if (!readings.length) {
        const tracks = _playable(player.playbackTracks(col.volKey, item, label));
        if (tracks.length) readings = [{ reader: String(tracks[0].readerCode || ''), tracks }];
      }
      if (!readings.length) continue;
      const chosen = (voice && readings.find((r) => r.reader === voice)) || readings[0];
      const fallback = !!voice && chosen.reader !== voice;
      if (only && fallback) continue;
      units.push({
        id: col.volKey + ':' + item.id, title: item.title || '', name: item.title || '',
        tracks: chosen.tracks, reader: chosen.reader, readings, fallback,
      });
    }
    if (units.length) children.push({ id: col.volKey, volKey: col.volKey, title: label, noun: 'recording', units });
  }
  return { id: 'tvot', title: 'The Volumes of Truth', noun: 'recording', children, units: _unitsUnder(children) };
}

/**
 * What a chosen voice does to a set of letters, counted from the data (dl-rework C): how many it reads, and how many
 * download in their default reading instead, by that reading's reader.
 * @param {Unit[]} units @param {string} voice
 * @returns {{ voice: number, other: number, byReader: Array<[string, number]>, total: number }}
 */
export function voiceSplit(units, voice) {
  let mine = 0;
  /** @type {Map<string, number>} */
  const by = new Map();
  for (const u of units) {
    if (voice && u.reader === voice) { mine++; continue; }
    const r = u.reader || '';
    by.set(r, (by.get(r) || 0) + 1);
  }
  const order = ['B', 'T', 'V', 'M'];
  const byReader = [...by.entries()].sort((a, b) => (order.indexOf(a[0]) + 1 || 9) - (order.indexOf(b[0]) + 1 || 9));
  return { voice: mine, other: units.length - mine, byReader, total: units.length };
}

/** "67 Timothy, 642 text-to-speech" @param {Array<[string, number]>} byReader */
export function byReaderWords(byReader) {
  return byReader.map(([r, n]) => n.toLocaleString('en-US') + ' ' + (readerName(r) || 'other').replace(/^Text-to-speech$/, 'text-to-speech').replace(/^With music$/, 'with music')).join(', ');
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
    const units = tracks.map((t, n) => ({
      id: t.url, title: t.title || title, name: title, tracks: [t], chapter: _chapterOf(t) || n + 1, reader: String(t.readerCode || ''),
    }));
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

/** @param {any} off @param {Reading} r @returns {boolean} every part of this reading is on the phone */
export function readingOnPhone(off, r) {
  return r.tracks.length > 0 && r.tracks.every((t) => off.statusOf(t.url) === 'saved');
}

/**
 * Some reading of it is wholly on the phone (whichever voice is chosen: dl-rework A, defect 3).
 * @param {any} off the store @param {Unit} unit @returns {boolean}
 */
export function unitOnPhone(off, unit) {
  return readingsOf(unit).some((r) => readingOnPhone(off, r));
}

/**
 * A track on the phone or on its way (queued, downloading, or on the store's "will try again" list: the store still
 * means to finish it). @param {any} off @param {string} url
 */
function _held(off, url) {
  const s = off.statusOf(url);
  return s === 'saved' || s === 'queued' || s === 'downloading' || s === 'failed';
}

/** @param {any} off @param {Reading} r @returns {boolean} every part on the phone or on its way */
export function readingHeld(off, r) {
  return r.tracks.length > 0 && r.tracks.every((t) => _held(off, t.url));
}

/** The readers whose reading is on the phone or on its way. @param {any} off @param {Unit} unit @returns {string[]} */
export function heldReaders(off, unit) {
  return readingsOf(unit).filter((r) => readingHeld(off, r)).map((r) => r.reader);
}

/**
 * Some reading of it is on the phone or on its way: a tick it already has, so Apply never asks for it twice.
 * @param {any} off @param {Unit} unit @returns {boolean}
 */
export function unitHeld(off, unit) {
  return readingsOf(unit).some((r) => readingHeld(off, r));
}

/**
 * How much of its best reading is on the phone: "1 of 2 parts" (defect 21). k = the most parts any one reading has
 * saved, n = that reading's parts.
 * @param {any} off @param {Unit} unit @returns {{ k: number, n: number }}
 */
export function partsOnPhone(off, unit) {
  let best = { k: 0, n: unit.tracks.length };
  for (const r of readingsOf(unit)) {
    const k = r.tracks.filter((t) => off.statusOf(t.url) === 'saved').length;
    if (k > best.k) best = { k, n: r.tracks.length };
  }
  return best;
}

/**
 * The ticks the screen opens with: what is on the phone or on its way, and for a letter with more than one reading,
 * each reading that is. @param {any} off @param {Unit[]} units
 */
export function initialWanted(off, units) {
  const out = new Set();
  for (const u of units) {
    const held = heldReaders(off, u);
    if (!held.length) continue;
    out.add(u.id);
    if (readingsOf(u).length > 1) for (const r of held) out.add(readingId(u, r));
  }
  return out;
}

/**
 * A tap on one reading's tick: on adds it (and ticks its letter); off takes it away, and the letter's tick with the
 * last one. A letter ticked for the reading it fetches has that reading ticked as its own first, so a tap on another
 * adds to it rather than replacing it. @param {Unit} unit @param {string} reader @param {Set<string>} wanted
 * @returns {Set<string>}
 */
export function toggleReading(unit, reader, wanted) {
  const next = new Set(wanted);
  const all = readingsOf(unit);
  if (next.has(unit.id) && !all.some((r) => next.has(readingId(unit, r.reader)))) {
    const fetched = all.find((r) => r.tracks === unit.tracks);
    if (fetched) next.add(readingId(unit, fetched.reader));
  }
  const id = readingId(unit, reader);
  if (next.has(id)) {
    next.delete(id);
    if (!readingsOf(unit).some((r) => next.has(readingId(unit, r.reader)))) next.delete(unit.id);
  } else {
    next.add(id);
    next.add(unit.id);
  }
  return next;
}

/**
 * The readings a unit should have after Apply: none when its letter is unticked; the ticked readings when any is;
 * else the one it fetches. @param {Unit} unit @param {Set<string>} wanted @returns {Reading[]}
 */
function _target(unit, wanted) {
  if (!wanted.has(unit.id)) return [];
  const all = readingsOf(unit);
  if (all.length > 1) {
    const picked = all.filter((r) => wanted.has(readingId(unit, r.reader)));
    if (picked.length) return picked;
  }
  return [all.find((r) => r.tracks === unit.tracks) || { reader: unit.reader || '', tracks: unit.tracks }];
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
  for (const u of node.units) {
    if (on) next.add(u.id);
    else { next.delete(u.id); for (const r of readingsOf(u)) next.delete(readingId(u, r.reader)); }
  }
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
 * What Apply would do, reading by reading: the readings to add (wanted, not all on the phone or on its way) and to
 * remove (held, not wanted: saved parts are removed and the ones on their way cancelled), with the bytes to download
 * (parts already held left out), the seconds added and the bytes freed. Each entry is its unit with that reading's
 * `tracks` and `reader` (`fallback`: the chosen voice did not read it). `addBytes` is null while any size is unknown
 * (`addKnown` then holds what is known).
 * @param {any} off the store
 * @param {Unit[]} units every unit of the tree
 * @param {Set<string>} wanted
 * @param {(url: string) => number | null} [secondsOf]
 * @param {string} [voice] the chosen voice: an entry in another reading is marked `fallback`
 */
export function planOf(off, units, wanted, secondsOf, voice = '') {
  /** @type {Unit[]} */ const add = [];
  /** @type {Unit[]} */ const remove = [];
  let addKnown = 0; let unknown = false; let seconds = 0; let timed = true; let removeBytes = 0;
  for (const u of units) {
    const target = _target(u, wanted);
    for (const r of readingsOf(u)) {
      const here = readingHeld(off, r);
      const want = target.some((x) => x.reader === r.reader && x.tracks === r.tracks) || target.some((x) => x.tracks === r.tracks);
      /** @type {Unit} */
      const entry = { ...u, tracks: r.tracks, reader: r.reader, fallback: !!voice && r.reader !== voice };
      if (want && !here) {
        add.push(entry);
        for (const t of r.tracks) {
          const sec = secondsOf ? secondsOf(t.url) : null;
          if (sec == null) timed = false; else seconds += sec;
          if (_held(off, t.url)) continue;
          const size = off.sizeOf(t.url);
          if (size) addKnown += size; else unknown = true;
        }
      } else if (!want && here) {
        remove.push(entry);
        for (const t of r.tracks) if (off.statusOf(t.url) === 'saved') removeBytes += off.sizeOf(t.url) || 0;
      }
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
  /** @type {Map<string, Unit[]>} */
  const byId = new Map();
  for (const u of picked) { const l = byId.get(u.id); if (l) l.push(u); else byId.set(u.id, [u]); }
  const out = [];
  for (const g of groups) {
    const units = g.units.flatMap((u) => byId.get(u.id) || []);
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
