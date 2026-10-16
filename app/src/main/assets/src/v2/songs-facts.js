/* songs-facts.js - what Songs of the Letters says (zones v2p6; pictures 6d-songs and 6e-song-page, design's dz14).

   v2's Songs pages are main's (ui/screens/AudioSongsScreen.jsx, SongPage.jsx, ReadWithMusic.jsx) in the kit. Main's one
   song catalog, keep store, library and player live in bundle-d and are read here as globals, never imported: a second
   bundled copy of utils/song-catalog.js or song-keep.js would be a second store (more-menu.jsx says the same).

   Every page draws from a plain view (HubView, ListView, SongView): a real boot builds it from the catalog (hubView,
   listView, songView), a gate boot takes the one gate.js pinned, so a picture never drifts as the flock adds songs.
   Sizes use v2's one size formatter (Settings > Downloads says the same number for the same songs). Kept songs are on
   "this phone" or, on the laptop, "this computer" (the kit's device word; `device` is the place's). */

import { sizeLabel } from './settings-facts.js';
import { liveSongs, songsLine } from './downloads-facts.js';
import { here } from './settings-pages.js';

const g = /** @type {any} */ (globalThis);

/** The first chips after All, in the pictures' order; the rest go under More (main's PRIMARY_STYLES). */
export const PRIMARY_STYLES = ['worship', 'pop', 'hip-hop', 'cinematic', 'folk'];
/** Rows of New from the flock on the hub; See all opens the ten. */
export const NEW_ON_HUB = 2;
export const NEW_TOTAL = 10;
/** Collection tiles before "Show all": the four with the most songs. */
export const TILES_FIRST = 4;
/** On a song's page: version rows before "Show all", lyric lines before "Show all lyrics", more songs of its letter. */
export const VERSIONS_SHOWN = 4;
export const LYRIC_PREVIEW = 4;
export const MORE_SHOWN = 3;
/** The letter collections, in reading order, as tiles under From the letters. */
export const LETTER_COLS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'rebuke', 'wtlb1', 'wtlb2', 'blessed', 'flock', 'timothy'];
export const SHELVES = [
  { v: 'shelf:inspired', title: 'Inspired by the letters', cols: ['inspired'] },
  { v: 'shelf:bible', title: 'Bible songs', cols: ['bible'] },
  { v: 'shelf:originals', title: 'Flock originals and prayers', cols: ['originals', 'prayers'] },
];
export const HUB_TITLE = 'Songs of the Letters';
export const READINGS_TITLE = 'Letters read with music';
/** Main's Safari line (utils/song-keep.js IOS_TAB_TEXT). */
const IOS_TAB_TEXT = 'Add VOTReader to your Home Screen to keep songs';

/** A length in seconds as the pictures print it: 4:12 (1:02:05 past an hour). Main's songClock. */
export function songClock(value) {
  const total = Math.max(0, Math.round(Number(value) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = (s < 10 ? '0' : '') + s;
  return h ? h + ':' + (m < 10 ? '0' : '') + m + ':' + ss : m + ':' + ss;
}

/** "1 song", "1,082 songs". Main's songCountLabel. */
export function songCountLabel(n, one = 'song', many = 'songs') {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  return count.toLocaleString('en-US') + ' ' + (count === 1 ? one : many);
}

/** The square cover the publisher cuts for every song (main's songThumbUrl; stable by id). */
export function thumbUrl(id, px = 256) {
  return /^[0-9a-f]{12}$/.test(String(id || '')) ? 'https://votreader.github.io/songs/thumbs/' + (px === 512 ? 512 : 256) + '/' + id + '.webp' : '';
}

/** @param {any} song */
const visible = (song) => !!song && !song.hid && !!song.sh;

/** A collection's label from the registry, or the catalog's own word. */
export function colLabel(col, gl = g) {
  const reg = gl.COL_BY_KEY;
  const entry = reg && typeof reg.get === 'function' ? reg.get(col) : null;
  return (entry && entry.label) || col;
}

/** @returns {any[]} a collection's letters in reading order */
function lettersOf(volKey, gl = g) {
  const reg = gl.COL_BY_KEY;
  const col = reg && typeof reg.get === 'function' ? reg.get(volKey) : null;
  const list = col && typeof gl.colLetterArr === 'function' ? gl.colLetterArr(col) : null;
  return Array.isArray(list) ? list : [];
}

/**
 * The letter a song or family was made from, linked with medium or high confidence (low is never shown): main's
 * songLetterOf, plus the letter's place in v2 once the letters are here.
 * @returns {{ key: string, title: string, colLabel: string, route: any } | null}
 */
export function letterOf(item, gl = g) {
  const src = item && item.src;
  if (!src || src.k !== 'letter' || !src.id || (src.c !== 'h' && src.c !== 'm')) return null;
  const at = src.id.indexOf(':');
  if (at < 1) return null;
  const volKey = src.id.slice(0, at);
  const id = src.id.slice(at + 1);
  const letter = lettersOf(volKey, gl).find((l) => l && l.id === id) || null;
  const route = letter && typeof letter.num === 'number' ? { place: 'letter', collection: volKey, n: letter.num } : null;
  return { key: src.id, title: (letter && letter.title) || '', colLabel: colLabel(volKey, gl) === volKey ? '' : colLabel(volKey, gl), route };
}

/** Visible songs of these families, one count. */
function songsIn(cat, fams) {
  let n = 0;
  for (const fam of fams) n += cat.versionsOf(fam).length;
  return n;
}

/** A letter collection's families in the order its letters are read, then by first-seen date (main's letterOrder). */
export function letterOrder(cat, fams, col, gl = g) {
  /** @type {Map<string, number>} */
  const at = new Map();
  lettersOf(col, gl).forEach((l, i) => { if (l && l.id) at.set(col + ':' + l.id, i); });
  const firstSeen = (fam) => { const s = cat.featuredOf(fam); return (s && s.fs) || ''; };
  const idx = (fam) => { const k = fam.src && fam.src.id; return at.has(k) ? /** @type {number} */ (at.get(k)) : 1e6; };
  return fams.slice().sort((a, b) => {
    const d = idx(a) - idx(b);
    if (d) return d;
    const fa = firstSeen(a), fb = firstSeen(b);
    return fa < fb ? -1 : fa > fb ? 1 : 0;
  });
}

/** The newest visible songs by first-seen date, one per family (a tie keeps the later catalog row first). */
export function newestSongs(cat, n) {
  const all = cat.songs();
  const list = [];
  for (let i = all.length - 1; i >= 0; i--) if (visible(all[i])) list.push({ s: all[i], i });
  list.sort((a, b) => (a.s.fs < b.s.fs ? 1 : a.s.fs > b.s.fs ? -1 : b.i - a.i));
  const seen = new Set();
  const out = [];
  for (const x of list) {
    const fam = x.s.f || x.s.id;
    if (seen.has(fam)) continue;
    seen.add(fam);
    out.push(x.s);
    if (out.length >= n) break;
  }
  return out;
}

/** Saved or recent ids as the songs they name: a hidden duplicate stands in for its kept twin. */
export function songsOfIds(cat, ids) {
  const out = [];
  const seen = new Set();
  for (const id of ids || []) {
    let s = cat.songById(id);
    if (s && s.hid && s.dup) s = cat.songById(s.dup);
    if (visible(s) && !seen.has(s.id)) { seen.add(s.id); out.push(s); }
  }
  return out;
}

/** The italic line of a single song: its maker, else its shelf. */
const songLine = (cat, song) => song.cr || cat.songAlbumLabel(song);

/**
 * One row as every Songs page draws it.
 * @typedef {{ id: string, fam: string, title: string, line: string, len: string, versions: number }} SongRow
 * `id` is the song the row plays (its cover too).
 */

/** A single song's row (New, Saved, Recent, Kept): its maker or shelf; on Kept its version and size, no length. */
export function songRow(cat, song, { kept = false } = {}) {
  const fam = cat.familyById(song.f);
  return {
    id: song.id, fam: song.f, title: song.t,
    line: kept ? (song.v || songLine(cat, song)) + ' · ' + sizeLabel(song.b) : songLine(cat, song),
    len: kept ? '' : songClock(song.d), versions: fam ? cat.versionsOf(fam).length : 1,
  };
}

/**
 * A family's row, led by `lead` (its featured version unless a list says otherwise): "N versions" stands where the line
 * would be; in its own list the line names the version, not the collection again.
 */
export function familyRow(cat, fam, lead, { inList = false } = {}) {
  const song = lead || cat.featuredOf(fam);
  if (!song) return null;
  const count = cat.versionsOf(fam).length;
  return {
    id: song.id, fam: fam.id, title: fam.t, len: songClock(song.d), versions: count,
    line: count > 1 ? '' : inList ? song.cr || song.v || songLine(cat, song) : songLine(cat, song),
  };
}

/** The style chips: main's first five that the catalog has, then the rest by how many songs they hold. */
export function styleChips(cat) {
  const styles = cat.styles() || {};
  /** @type {Record<string, number>} */
  const counts = {};
  for (const key of Object.keys(styles)) counts[key] = cat.familiesFor({ style: key }).length;
  return {
    primary: PRIMARY_STYLES.filter((k) => styles[k]).map((key) => ({ key, label: styles[key] })),
    more: Object.keys(styles).filter((k) => PRIMARY_STYLES.indexOf(k) < 0 && counts[k] > 0)
      .sort((a, b) => counts[b] - counts[a]).map((key) => ({ key, label: styles[key], n: counts[key] })),
    counts,
  };
}

/**
 * Letters read over music (main's readingLetters): the catalog's readings with every letter shipped with a reader-M
 * recording, in reading order.
 * @returns {Array<{ key: string, volKey: string, id: string, title: string, colLabel: string, d: number }>}
 */
export function readingLetters(cat, gl = g) {
  /** @type {string[]} */
  const keys = [];
  /** @type {Record<string, number>} */
  const dur = {};
  const add = (key, d) => {
    if (typeof key !== 'string' || key.indexOf(':') < 1) return;
    if (keys.indexOf(key) < 0) { keys.push(key); dur[key] = 0; }
    dur[key] += Number(d) || 0;
  };
  if (cat && cat.loaded) for (const r of cat.readings() || []) add(r.key, r.d);
  const alternates = gl.AUDIO_ALTERNATES || {};
  for (const key of Object.keys(alternates)) {
    const list = alternates[key];
    if (Array.isArray(list) && list.some((r) => Array.isArray(r) && r[0] === 'M')) add(key, 0);
  }
  const manifest = gl.AUDIO_MANIFEST || {};
  for (const key of Object.keys(manifest)) {
    const rows = manifest[key];
    if (Array.isArray(rows) && rows.length && rows.every((r) => Array.isArray(r) && r[1] === 'M')) add(key, 0);
  }
  const slug = (id) => id.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
  return keys.map((key) => {
    const at = key.indexOf(':');
    const volKey = key.slice(0, at);
    const id = key.slice(at + 1);
    const letters = lettersOf(volKey, gl);
    const index = letters.findIndex((l) => l && l.id === id);
    const letter = index >= 0 ? letters[index] : null;
    const label = colLabel(volKey, gl);
    return { key, volKey, id, title: (letter && letter.title) || slug(id), colLabel: label === volKey ? '' : label, index, d: dur[key] };
  }).filter((r) => LETTER_COLS.indexOf(r.volKey) >= 0)
    .sort((a, b) => LETTER_COLS.indexOf(a.volKey) - LETTER_COLS.indexOf(b.volKey) || a.index - b.index)
    .map(({ index: _i, ...r }) => r);
}

/**
 * What the hub (6d) shows when nothing is typed or picked.
 * @typedef {{ primary: Array<{ key: string, label: string }>, more: Array<{ key: string, label: string, n: number }> }} Chips
 * @typedef {{ chips: Chips, newest: SongRow[], saved: number, recent: number, kept: string | null,
 *   tiles: Array<{ col: string, label: string, n: string, covers: string[] }>, shelves: Array<{ v: string, title: string, n: string }>,
 *   readings: number }} HubView
 * A tile's covers are the song ids of its first four families.
 * @returns {HubView}
 */
export function hubView(cat, { library = null, gl = g } = {}) {
  const chips = styleChips(cat);
  const tiles = LETTER_COLS.map((col, i) => {
    const fams = letterOrder(cat, cat.familiesFor({ col }), col, gl);
    return { col, fams, n: songsIn(cat, fams), i };
  }).filter((t) => t.fams.length).sort((a, b) => b.n - a.n || a.i - b.i);
  const shelves = SHELVES.map((shelf) => {
    /** @type {any[]} */
    let fams = [];
    for (const col of shelf.cols) fams = fams.concat(cat.familiesFor({ col }));
    return { v: shelf.v, title: shelf.title, fams };
  }).filter((x) => x.fams.length);
  const kept = liveSongs(gl);
  return {
    chips: { primary: chips.primary, more: chips.more },
    newest: newestSongs(cat, NEW_TOTAL).map((s) => songRow(cat, s)),
    saved: library ? songsOfIds(cat, library.songSaved()).length : 0,
    recent: library ? songsOfIds(cat, library.songRecent()).length : 0,
    // main's Kept row: "2 · 7.6 MB", or "Download again" after a restore, or 0; none where songs cannot be kept
    kept: kept ? (kept.count ? songsLine(kept) : kept.missing ? 'Download again' : '0') : null,
    tiles: tiles.map((t) => ({
      col: t.col, label: colLabel(t.col, gl), n: songCountLabel(t.n),
      covers: [0, 1, 2, 3].map((i) => { const s = t.fams[i] ? cat.featuredOf(t.fams[i]) : null; return s ? s.id : ''; }),
    })),
    shelves: shelves.map((x) => ({ v: x.v, title: x.title, n: songCountLabel(songsIn(cat, x.fams)) })),
    readings: readingLetters(cat, gl).length,
  };
}

/** A style's song: the first version in it (a family listed under a style leads with that style's version). */
export function leadInStyle(cat, fam, style) {
  return (style ? cat.versionsOf(fam).find((s) => (s.st || []).indexOf(style) >= 0 || s.dl === style || (style === 'spanish' && s.lang === 'es')) : null)
    || cat.featuredOf(fam);
}

/**
 * A list (Saved, Recent, Kept, New, a collection, a shelf, a letter's songs): its words, its rows and what Play all plays.
 * @typedef {{ eyebrow: string, title: string, line: string, rows: SongRow[], ids: string[], allIds: string[],
 *   empty: string, families: boolean }} ListView
 * @returns {ListView}
 */
export function listView(cat, v, { library = null, keep = null, device = 'phone', gl = g } = {}) {
  /** @type {{ eyebrow: string, title: string, families: any[] | null, songs: any[] | null, empty: string }} */
  let c;
  if (v === 'saved' || v === 'recent') {
    const ids = library ? (v === 'saved' ? library.songSaved() : library.songRecent()) : [];
    c = { eyebrow: 'Your songs', title: v === 'saved' ? 'Saved songs' : 'Recently played songs', families: null, songs: songsOfIds(cat, ids),
      empty: v === 'saved' ? 'Tap Save on any song and it will wait here.' : 'Songs you play will appear here.' };
  } else if (v === 'kept') {
    // newest kept first; a kept song the catalog has since hidden still shows, so it can be removed
    const ids = keep ? keep.keptIds() || [] : [];
    c = { eyebrow: 'Your songs', title: 'Kept on ' + here(device), families: null, songs: ids.map((id) => cat.songById(id)).filter(Boolean),
      empty: 'Songs you keep play here with no signal. Tap Keep on a song, a collection or the songs of a letter.' };
  } else if (v === 'new') {
    c = { eyebrow: 'New from the flock', title: 'New from the flock', families: null, songs: newestSongs(cat, NEW_TOTAL), empty: 'No songs yet.' };
  } else if (v.indexOf('sung:') === 0 || v.indexOf('letter:') === 0) {
    // 'sung:' only the families that sing the letter's own words (the verbatim gate); 'letter:' every song made from it
    const sung = v.indexOf('sung:') === 0;
    const key = v.slice(sung ? 5 : 7);
    /** @type {any[]} */
    const fams = [];
    for (const s of cat.songsForLetter(key, { verbatim: sung })) {
      const fam = cat.familyById(s.f);
      if (fam && fams.indexOf(fam) < 0) fams.push(fam);
    }
    const letter = letterOf({ src: { k: 'letter', id: key, c: 'h' } }, gl);
    c = { eyebrow: 'Songs from this letter', title: (letter && letter.title) || 'Songs from this letter', families: fams, songs: null, empty: 'No songs from this letter yet.' };
  } else {
    const shelf = SHELVES.find((x) => x.v === v);
    if (shelf) {
      /** @type {any[]} */
      let fams = [];
      for (const col of shelf.cols) fams = fams.concat(cat.familiesFor({ col }));
      c = { eyebrow: HUB_TITLE, title: shelf.title, families: fams, songs: null, empty: 'No songs here yet.' };
    } else {
      const col = v.indexOf('col:') === 0 ? v.slice(4) : '';
      c = { eyebrow: 'From the letters', title: col ? colLabel(col, gl) : 'Songs', families: col ? letterOrder(cat, cat.familiesFor({ col }), col, gl) : [], songs: null, empty: 'No songs here yet.' };
    }
  }
  const kept = v === 'kept';
  const letterKey = v.indexOf('letter:') === 0 ? v.slice(7) : '';
  const sungKey = v.indexOf('sung:') === 0 ? v.slice(5) : '';
  const sungSongs = sungKey ? cat.songsForLetter(sungKey, { verbatim: true }) : null;
  const versionsHere = (fam) => (sungSongs ? sungSongs.filter((s) => s.f === fam.id) : cat.versionsOf(fam));
  const leadFor = (fam) => (sungSongs ? versionsHere(fam)[0] || null
    : (letterKey ? cat.versionsOf(fam).find((s) => s.src && s.src.id === letterKey) : null) || cat.featuredOf(fam));
  const fams = c.families;
  const leads = fams ? fams.map(leadFor).filter(Boolean) : c.songs || [];
  const count = fams ? (sungSongs ? sungSongs.length : songsIn(cat, fams)) : leads.length;
  const seconds = fams ? fams.reduce((sum, fam) => sum + versionsHere(fam).reduce((a, s) => a + (s.d || 0), 0), 0) : leads.reduce((a, s) => a + (s.d || 0), 0);
  const length = seconds >= 3600 ? Math.round(seconds / 360) / 10 + ' h' : Math.max(1, Math.round(seconds / 60)) + ' min';
  const ids = leads.map((s) => s.id);
  // the Kept list's size is what the keep store holds (Settings > Downloads says the same)
  const bytes = !kept ? 0 : keep && typeof keep.bytesOf === 'function' ? Number(keep.bytesOf(ids)) || 0 : leads.reduce((n, s) => n + (s.b || 0), 0);
  // Play all plays one version per song, so the songs and their versions are counted apart
  const counted = fams && count > fams.length ? songCountLabel(fams.length) + ' · ' + songCountLabel(count, 'version', 'versions') : songCountLabel(count);
  const rows = fams
    ? fams.map((fam) => familyRow(cat, fam, leadFor(fam), { inList: true })).filter(Boolean)
    : (c.songs || []).map((s) => songRow(cat, s, { kept }));
  return {
    eyebrow: c.eyebrow, title: c.title, empty: c.empty, families: !!fams,
    line: count ? counted + ' · ' + (kept ? sizeLabel(bytes) + ' · they play with no signal' : length) : '',
    rows: /** @type {SongRow[]} */ (rows), ids,
    allIds: fams ? fams.reduce((out, fam) => out.concat(versionsHere(fam).map((s) => s.id)), /** @type {string[]} */ ([])) : ids,
  };
}

/** What a list is called (Back on the page above it), before the catalog is here too. */
export function listTitle(cat, v, gl = g, device = 'phone') {
  if (v === 'saved') return 'Saved songs';
  if (v === 'recent') return 'Recently played songs';
  if (v === 'kept') return 'Kept on ' + here(device);
  if (v === 'new') return 'New from the flock';
  if (v === 'readings') return READINGS_TITLE;
  const shelf = SHELVES.find((x) => x.v === v);
  if (shelf) return shelf.title;
  if (v.indexOf('col:') === 0) return colLabel(v.slice(4), gl);
  if (v.indexOf('sung:') === 0 || v.indexOf('letter:') === 0) {
    const letter = letterOf({ src: { k: 'letter', id: v.slice(v.indexOf(':') + 1), c: 'h' } }, gl);
    return (letter && letter.title) || 'Songs from this letter';
  }
  return cat && cat.loaded ? listView(cat, v, { gl }).title : 'Songs';
}

/** Version names as design wants them: a repeated name gets a number ("Cinematic", "Cinematic · 2"). */
export function versionLabels(versions) {
  /** @type {Record<string, number>} */
  const seen = {};
  return versions.map((s) => {
    const name = s.v || 'Version';
    seen[name] = (seen[name] || 0) + 1;
    return seen[name] > 1 ? name + ' · ' + seen[name] : name;
  });
}

/** "Made with Suno · by hmarie777", "... and others", or "... by members of the flock" (main's makersLine). */
export function makersLine(versions) {
  const makers = [];
  for (const s of versions) if (s.cr && makers.indexOf(s.cr) < 0) makers.push(s.cr);
  if (!makers.length) return 'Made with Suno · by members of the flock';
  const others = versions.some((s) => !s.cr) || makers.length > 2;
  return 'Made with Suno · by ' + makers.slice(0, 2).join(' and ') + (others ? (makers.length > 1 ? ', and others' : ' and others') : '');
}

/** What a song without a letter is, in the words of its shelf (main's shelfWords). */
function shelfWords(col) {
  if (col === 'bible') return 'A Bible song';
  if (col === 'originals') return 'A flock original';
  if (col === 'prayers') return 'A flock prayer';
  return 'Inspired by the letters';
}

/** The line under a song's lyrics: only a song that sings the letter's own words names the letter (main's songLyricsFoot). */
export function lyricsFoot(verbatim, letter) {
  if (!verbatim) return 'Lyrics transcribed from the song';
  return letter && letter.title ? 'Words from the letter “' + letter.title + '” · lyrics transcribed' : 'Lyrics transcribed';
}

/**
 * One song's page (6e).
 * @typedef {{ fam: string, title: string, eyebrow: string, from: string, letter: { key: string, title: string, route: any } | null,
 *   shelf: string, makers: string, lead: string, versions: Array<{ id: string, label: string, len: string }>,
 *   worded: string, instrumental: boolean, foot: string, more: SongRow[], moreAll: number }} SongView
 * @returns {SongView | null} null when the song is no longer shared
 */
export function songView(cat, famId, gl = g) {
  const fam = cat.familyById(famId);
  const versions = fam ? cat.versionsOf(fam) : [];
  const lead = versions[0];
  if (!fam || !lead) return null;
  const worded = versions.find((s) => s.lyr > 0) || null;
  const letter = letterOf(fam, gl) || letterOf(lead, gl);
  /** @type {any[]} */
  const more = [];
  if (letter) {
    for (const s of cat.songsForLetter(letter.key)) {
      const other = cat.familyById(s.f);
      if (other && other.id !== fam.id && more.indexOf(other) < 0) more.push(other);
    }
  }
  const labels = versionLabels(versions);
  return {
    fam: fam.id, title: fam.t, eyebrow: versions.length > 1 ? 'Song · ' + versions.length + ' versions' : 'Song',
    lead: lead.id,
    // the verbatim gate: only a song that sings the letter's own words says it is "from the letter"
    from: cat.isVerbatimSong(lead) ? 'From the letter:' : 'Inspired by the letter:',
    letter: letter ? { key: letter.key, title: letter.title, route: letter.route } : null,
    shelf: letter ? letter.colLabel : shelfWords(fam.col), makers: makersLine(versions),
    versions: versions.map((s, i) => ({ id: s.id, label: labels[i], len: songClock(s.d) })),
    worded: worded ? worded.id : '', instrumental: lead.dl === 'instrumental',
    foot: lyricsFoot(!!worded && cat.isVerbatimSong(worded), letter),
    more: more.slice(0, MORE_SHOWN).map((f) => familyRow(cat, f, null)).filter(Boolean), moreAll: more.length ? more.length + 1 : 0,
  };
}

/**
 * The keep row (main's SongKeepCard and SongKeepAction in design's one hairline row), from the keep store's progressOf.
 * `unit` counts what is kept: 'versions' on a song's page and on a list that holds more versions than songs, else 'songs'
 * (the list's line says the same); only a song's page offers Remove once all are kept (`canRemove`).
 * @param {{ avail: string, p: { total: number, kept: number, busy: number, failed: number, bytes: number, needBytes: number } | null,
 *   unit: 'versions' | 'songs', online: boolean, waiting: boolean, device?: string, canRemove?: boolean }} k
 * @returns {{ kind: 'ios' | 'kept' | 'busy' | 'keep', t: string, s: string, act: string, off?: boolean, pct?: number, note?: string } | null}
 */
export function keepRow({ avail, p, unit, online, waiting, device = 'phone', canRemove = false }) {
  if (avail === 'none' || !p || !p.total) return null;
  if (avail === 'ios-tab') return { kind: 'ios', t: 'Keep for offline listening', s: IOS_TAB_TEXT + '. An iPhone clears songs kept in Safari after about a week.', act: '' };
  const many = (n) => n.toLocaleString('en-US') + ' ' + unit;
  if (p.kept === p.total) {
    return { kind: 'kept', t: 'Available offline', s: (p.total > 1 ? many(p.total) + ' · ' : 'On ' + here(device) + ' · ') + sizeLabel(p.bytes), act: canRemove ? 'Remove' : '' };
  }
  if (p.busy) {
    const s = waiting ? 'Waiting for Wi-Fi' : p.total > 1 ? 'Keeping ' + Math.min(p.total, p.kept + 1) + ' of ' + p.total + '…' : 'Keeping…';
    return { kind: 'busy', t: waiting ? 'Waiting for Wi-Fi' : 'Keeping…', s, act: 'Cancel', pct: Math.max(4, Math.min(100, Math.round((p.kept / p.total) * 100))) };
  }
  const what = p.total > 1 ? (p.kept ? 'The other ' + many(p.total - p.kept) : 'All ' + many(p.total)) : 'This song';
  const note = !online ? 'Needs a connection' : p.failed ? (p.failed === 1 ? 'One did not keep. Try again.' : p.failed + ' did not keep. Try again.') : '';
  return { kind: 'keep', t: 'Keep for offline listening', s: what + ' · ' + sizeLabel(p.needBytes), act: 'Keep', off: !online, note };
}
