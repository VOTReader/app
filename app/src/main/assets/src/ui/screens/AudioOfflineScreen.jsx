/*
   AudioOfflineScreen -- the Downloads screen (downloads brief 2026-10-23, D3): two tabs, Choose (the tree, the
   DownloadChooser) and On this phone (below; listening item 8).

   On this phone is built to the dl-mock pictures 11-13 (D:/Swarm/calls/downloads-mockups/): a storage bar, the
   downloads grouped like the tree (The Volumes of Truth by collection, the Bible by edition and book), a × per
   recording with a 5 s Undo, a ⋯ per group whose Remove asks first, and Remove all downloads, which asks too. A tap
   on a recording plays it (with no signal too). The Listening Library's Downloads card opens the screen; it exists
   where downloads are possible (the Android app, or a browser that keeps recordings: cf1).

   dl-rework (2026-11-10): a reading is a row of its own, named by its reader (A: removing one removes only it); the
   strip and "Didn't download yet" show on both tabs, and On this phone lists the queue (paged, each waiting one with a
   ×) and what has Finished (E). Choose's Letter voice is Settings > Letter Voice itself (B).
*/

/* Cluster H (the Listening Library) - bundle-d since lz1 (2026-10-13), lazy bundle-h before. OfflineAudio and AudioPlayer
   live in bundle-d too and are read as free globals at call time - one store, one player (see _entry-d.js). */

import { EmptyState, ListGroup, ListRow, UiButton } from '../components/UiParts.jsx';
import { UiIcon } from '../components/UiIcon.jsx';
import { ActionSheet } from '../components/SelectField.jsx';
import { canTell } from '../../utils/download-gate.js';
import { useOfflineAudio, useOnline, formatBytes, isLeaving, removeWithUndo, REMOVED_TOAST_ID } from '../components/OfflineAudioControls.jsx';
import { DownloadChooser } from '../components/DownloadChooser.jsx';
import { DownloadStrip, stripModel } from '../components/DownloadStrip.jsx';
import { DownloadQueue } from '../components/DownloadQueue.jsx';
import { countOf, readerName } from '../../utils/download-tree.js';

export { REMOVED_TOAST_ID };
/** Rows an opened group shows before "Show all 30". */
const ROWS_SHOWN = 3;

/** @typedef {{ url: string, key: string, title: string, bytes: number, savedAt: number, stale?: boolean }} ShelfItem */
/**
 * @typedef {{ id: string, key: string, reader: string, parts: number, lead: string, title: string, items: ShelfItem[],
 *   bytes: number, savedAt: number }} ShelfGroup  one reading of a recording; parts = how many files that reading has
 *   (0 unknown)
 */
/** @typedef {{ id: string, title: string, items: ShelfItem[], bytes: number, order: number, reader?: string, parts?: number }} ShelfRow  one reading */
/** @typedef {(it: ShelfItem) => { reader: string, parts: number }} ReaderOf  whose reading a saved recording is */

/**
 * Whose reading each saved recording is, from the player's catalog (its readings of the letter the recording's key
 * names). Nothing stored changes: a recording saved before readings were rows is found by its URL (dl-rework F).
 * @returns {ReaderOf}
 */
export function readerLookup() {
  /** @type {Map<string, Array<{ reader: string, urls: string[] }>>} */
  const byKey = new Map();
  const player = typeof AudioPlayer !== 'undefined' ? AudioPlayer : null;
  return (it) => {
    const key = it && it.key;
    const colon = key ? key.indexOf(':') : -1;
    if (!player || typeof player.renditionsFor !== 'function' || colon <= 0) return { reader: '', parts: 0 };
    let rs = byKey.get(key);
    if (!rs) {
      let list = [];
      try { list = player.renditionsFor(key.slice(0, colon), { id: key.slice(colon + 1), title: '' }, '') || []; } catch (_e) { list = []; }
      rs = list.map((/** @type {any} */ r) => ({ reader: String((r && r.reader) || ''), urls: ((r && r.tracks) || []).map((/** @type {any} */ t) => t && t.url) }));
      byKey.set(key, rs);
    }
    const hit = rs.find((r) => r.urls.includes(it.url));
    return hit ? { reader: hit.reader, parts: hit.urls.length } : { reader: '', parts: 0 };
  };
}
/**
 * @typedef {{ id: string, title: string, noun: 'recording' | 'chapter', rows: ShelfRow[], bytes: number, order: number,
 *   edition?: string }} ShelfBranch
 *   a collection or a book
 */
/** @typedef {{ id: string, title: string, branches: ShelfBranch[], order: number }} ShelfSection */

/** The edition of a Bible volKey, or null. @param {string} volKey */
function _edition(volKey) {
  if (!volKey.startsWith('bible-') || typeof BIBLE_AUDIO_EDITIONS === 'undefined') return null;
  return Object.values(BIBLE_AUDIO_EDITIONS).find((x) => x && x.volKey === volKey) || null;
}

/** Where a Bible edition's recording comes from, for a book's heading ("Genesis · KJV · BRM"). @param {string} key */
function _editionOf(key) {
  const e = _edition(key.slice(0, key.indexOf(':')));
  return e && e.short ? String(e.short) : '';
}

/** The words a group's titles share, cut at a " · " ("Genesis · Chapter 1", "Genesis · Chapter 2" -> "Genesis"). */
function _sharedTitle(/** @type {string[]} */ titles) {
  const parts = titles.map((t) => t.split(' · '));
  const first = parts[0] || [];
  let n = first.length;
  for (const p of parts) { let i = 0; while (i < n && i < p.length && p[i] === first[i]) i++; n = i; }
  return first.slice(0, n).join(' · ');
}

/**
 * The shelf by reading (n2-04; dl-rework A, defect 2): a letter's parts and a Bible book's chapters are one group, in
 * their own order (chapter 2 before chapter 10), the group last added to first; each reading of a letter is a group
 * of its own (Benjamin's and Timothy's are two rows). A download without a key stands alone.
 * @param {ShelfItem[]} items
 * @param {ReaderOf} [readerOf] whose reading each is (none: one group per key, as before)
 * @returns {ShelfGroup[]}
 */
export function groupShelf(items, readerOf) {
  /** @type {Map<string, { key: string, reader: string, parts: number, list: ShelfItem[] }>} */
  const byKey = new Map();
  for (const it of items) {
    const key = it.key || it.url;
    const who = readerOf && it.key ? readerOf(it) : { reader: '', parts: 0 };
    const id = key + (who.reader ? '@' + who.reader : '');
    const g = byKey.get(id);
    if (g) g.list.push(it); else byKey.set(id, { key, reader: who.reader, parts: who.parts, list: [it] });
  }
  const order = (/** @type {ShelfItem} */ a, /** @type {ShelfItem} */ b) =>
    a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }) || a.url.localeCompare(b.url);
  const groups = [...byKey.entries()].map(([id, { key, reader, parts, list }]) => {
    list.sort(order);
    const shared = list.length > 1 ? _sharedTitle(list.map((x) => x.title)) : '';
    const base = shared || list[0].title;
    const edition = key.includes(':') ? _editionOf(key) : '';
    return {
      id,
      key,
      reader,
      parts,
      lead: shared,
      title: edition && !base.includes(edition) ? base + ' · ' + edition : base,
      items: list,
      bytes: list.reduce((n, x) => n + (x.bytes || 0), 0),
      savedAt: list.reduce((n, x) => Math.max(n, x.savedAt || 0), 0),
    };
  });
  return groups.sort((a, b) => b.savedAt - a.savedAt);
}

/** @param {ShelfItem[]} list @returns {ShelfRow} */
function _row(list, /** @type {string} */ id, /** @type {string} */ title, /** @type {number} */ order, /** @type {string} */ reader = '', /** @type {number} */ parts = 0) {
  return { id, title, items: list, bytes: list.reduce((n, x) => n + (x.bytes || 0), 0), order, reader, parts };
}

/**
 * The shelf grouped like the Choose tree (picture 11): The Volumes of Truth › collection › letter (its parts one row),
 * The Bible · edition › book › chapter, then Studies and anything else. Sections, branches and rows in library order.
 * @param {ShelfItem[]} items
 * @param {ReaderOf} [readerOf] whose reading each is: a letter's readings are rows of their own
 * @returns {ShelfSection[]}
 */
export function shelfSections(items, readerOf) {
  const cols = typeof COLLECTIONS !== 'undefined' ? COLLECTIONS : [];
  const books = typeof BIBLE_AUDIO_BOOKS !== 'undefined' && Array.isArray(BIBLE_AUDIO_BOOKS) ? BIBLE_AUDIO_BOOKS : [];
  /** @type {Map<string, ShelfSection>} */
  const sections = new Map();
  /** @type {Map<string, ShelfBranch>} */
  const branches = new Map();
  const branch = (/** @type {string} */ secId, /** @type {string} */ secTitle, /** @type {number} */ secOrder,
    /** @type {string} */ id, /** @type {string} */ title, /** @type {'recording' | 'chapter'} */ noun, /** @type {number} */ order) => {
    let sec = sections.get(secId);
    if (!sec) { sec = { id: secId, title: secTitle, branches: [], order: secOrder }; sections.set(secId, sec); }
    let b = branches.get(id);
    if (!b) { b = { id, title, noun, rows: [], bytes: 0, order }; branches.set(id, b); sec.branches.push(b); }
    return b;
  };
  groupShelf(items, readerOf).forEach((g) => {
    const colon = g.key.indexOf(':');
    const volKey = colon > 0 ? g.key.slice(0, colon) : '';
    const edition = volKey ? _edition(volKey) : null;
    if (edition) {
      const bookId = g.key.slice(colon + 1);
      const at = books.findIndex((b) => b[0] === bookId);
      const name = at >= 0 ? books[at][1] : g.lead || g.items[0].title.split(' · ')[0];
      const b = branch('bible', 'The Bible', 1, g.key, name, 'chapter', at < 0 ? 999 : at);
      b.edition = String(edition.short || edition.label || '');
      for (const it of g.items) {
        const title = it.title.startsWith(name + ' · ') ? it.title.slice(name.length + 3) : it.title;
        const ch = /(\d+)$/.exec(title);
        b.rows.push(_row([it], it.url, title, ch ? Number(ch[1]) : 0));
      }
      return;
    }
    const colAt = volKey ? cols.findIndex((/** @type {any} */ c) => c && c.volKey === volKey) : -1;
    const title = g.lead || g.title;
    if (colAt >= 0) {
      const col = cols[colAt];
      const b = branch('tvot', 'The Volumes of Truth', 0, volKey, col.label || volKey, 'recording', colAt);
      // In the collection's own order (the preface first); a letter the corpus does not list yet goes last.
      const letters = typeof colLetterArr === 'function' ? colLetterArr(col) || [] : [];
      const pre = typeof colPreface === 'function' ? colPreface(col) : null;
      const itemId = g.key.slice(colon + 1);
      const at = pre && pre.id === itemId ? -1 : letters.findIndex((/** @type {any} */ l) => l && l.id === itemId);
      b.rows.push(_row(g.items, g.id, title, at === -1 && !(pre && pre.id === itemId) ? 1e6 : at, g.reader, g.parts));
    } else if (volKey === 'study') {
      branch('study', 'Studies', 2, 'study', 'Bible/Letter Studies', 'recording', 0).rows.push(_row(g.items, g.id, title, 0, g.reader, g.parts));
    } else {
      branch('other', 'Other recordings', 3, 'other', 'Recordings', 'recording', 0).rows.push(_row(g.items, g.id, title, 0, g.reader, g.parts));
    }
  });
  for (const b of branches.values()) b.bytes = b.rows.reduce((n, r) => n + r.bytes, 0);
  for (const sec of sections.values()) sec.branches.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  return [...sections.values()].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

/** Where the next opening of the screen lands: a header's "Choose…" opens the tree at its collection (D3b). */
let _openAt = /** @type {null | { tab: 'choose' | 'phone', focus?: string | null }} */ (null);
/** @param {{ tab: 'choose' | 'phone', focus?: string | null }} at */
export function openDownloadsAt(at) { _openAt = at; }

/** What is on its way, by the shelf branch it lands in (a collection's volKey, a Bible book's key, 'study'): what is
 *  still to come, as that branch's rows count it (a book's chapters by url, a collection's letters by key).
 *  @param {any[]} queue @returns {Map<string, Set<string>>} */
function onItsWay(queue) {
  /** @type {Map<string, Set<string>>} */
  const by = new Map();
  for (const t of queue) {
    const key = (t && t.key) || '';
    const colon = key.indexOf(':');
    if (colon <= 0) continue;
    const volKey = key.slice(0, colon);
    const book = !!_edition(volKey);
    const id = volKey === 'study' ? 'study' : book ? key : volKey;
    if (!by.has(id)) by.set(id, new Set());
    /** @type {Set<string>} */ (by.get(id)).add(book ? String(t.url || '') : key);
  }
  return by;
}

/** A collection's name by volKey, for a set that is only on its way. @param {string} volKey */
function _collectionLabel(volKey) {
  const cols = typeof COLLECTIONS !== 'undefined' ? COLLECTIONS : [];
  const c = cols.find((/** @type {any} */ x) => x && x.volKey === volKey);
  return c ? String(c.label || volKey) : '';
}

/**
 * The storage card on top of both tabs (listen.html au-dl, au-dlphone): what is on the phone, the free space, a bar.
 * @param {{ used: number, songs: number, free: number }} props
 */
function StorageCard({ used, songs, free }) {
  const all = used + Math.max(0, free);
  return (
    <div className="ui-card dl-store">
      <div className="dl-store-top">
        <strong className="dl-store-big">{used ? formatBytes(used) : 'Nothing yet'}</strong>
        {free >= 0 ? <span className="dl-store-free">{formatBytes(free) + ' free'}</span> : null}
      </div>
      <p className="dl-store-line">{used ? ['On this phone · plays with no signal', songs ? 'songs ' + formatBytes(songs) : ''].filter(Boolean).join(' · ') : 'On this phone'}</p>
      <div className="ui-progress dl-store-bar" aria-hidden="true">
        {used && all > 0 ? <span style={{ width: Math.max(1.5, (used / all) * 100) + '%' }} /> : null}
      </div>
    </div>
  );
}

/**
 * @param {{
 *   onBack: () => void,
 *   backLabel?: string,
 *   bibleAudio?: string,
 *   letterReader?: string,
 *   onLetterReader?: (code: string) => void,
 *   onSearch?: () => void,
 *   onHistory?: () => void,
 *   onSettings?: () => void,
 *   theme?: any,
 *   onThemeChange?: (theme: any) => void,
 *   keepStarred?: boolean,
 *   keepNextReady?: boolean,
 *   wifiOnly?: boolean,
 *   onToggleSetting?: (key: string) => void,
 * }} props
 */
export function AudioOfflineScreen({ onBack, backLabel = 'Back to Listen', bibleAudio, letterReader,
  keepStarred = false, keepNextReady = false, wifiOnly = false, onToggleSetting }) {
  const off = useOfflineAudio();
  const online = useOnline();
  // Nothing on the phone or on its way opens Choose; else what is there (an entry point may say which: openDownloadsAt).
  const [at] = React.useState(() => { const a = _openAt; _openAt = null; return a; });
  const [tab, setTab] = React.useState(() => {
    if (at) return at.tab;
    const p = off && typeof off.pending === 'function' ? off.pending() : { busy: 0, failed: [] };
    return off && (off.items().length || p.busy || p.failed.length) ? 'phone' : 'choose';
  });
  const [focus] = React.useState(() => (at && at.focus) || null);
  const [asking, setAsking] = React.useState(/** @type {null | { kind: 'all' } | { kind: 'branch', id: string }} */ (null));
  const [open, setOpen] = React.useState(() => /** @type {Set<string>} */ (new Set()));
  const [showAll, setShowAll] = React.useState(() => new Set());
  // A single Remove waits out its Undo (removeWithUndo, brief section 7 item 14): the row steps aside at once.
  const items = off ? off.items().filter((it) => !isLeaving(it.url)) : [];
  const readerOf = React.useMemo(() => readerLookup(), []);
  const sections = shelfSections(items, readerOf);
  const total = off ? off.totalBytes() : 0;
  const songs = off && typeof off.songItems === 'function' ? off.songItems().reduce((n, it) => n + (it.bytes || 0), 0) : 0;
  const free = off ? off.freeBytes() : -1;
  const many = (/** @type {number} */ n) => countOf(n, 'recording');
  const recordings = sections.reduce((n, s) => n + s.branches.reduce((m, b) => m + b.rows.length, 0), 0);
  // Opening the shelf asks whether any recording on it was uploaded again (n2-01): its read-along timings follow the
  // new bytes, so the old file would drift.
  React.useEffect(() => { if (off && typeof off.checkForUpdates === 'function') off.checkForUpdates(); }, [off]);
  const stale = items.filter((it) => it.stale);
  const way = onItsWay(off && typeof off.queue === 'function' ? off.queue() : []);
  const strip = off ? stripModel(off, online) : null;
  const running = !!strip && strip.reason == null;
  // A set only on its way still has its row (au-dlrun: "12 of 29 recordings · the rest are on their way").
  for (const id of way.keys()) {
    if (sections.some((sec) => sec.branches.some((b) => b.id === id))) continue;
    // A Bible book with no chapter here yet has its row too.
    const colon = id.indexOf(':');
    const edition = colon > 0 ? _edition(id.slice(0, colon)) : null;
    if (edition) {
      const books = typeof BIBLE_AUDIO_BOOKS !== 'undefined' && Array.isArray(BIBLE_AUDIO_BOOKS) ? BIBLE_AUDIO_BOOKS : [];
      const bookAt = books.findIndex((b) => b[0] === id.slice(colon + 1));
      if (bookAt < 0) continue;
      let bible = sections.find((x) => x.id === 'bible');
      if (!bible) { bible = { id: 'bible', title: 'The Bible', branches: [], order: 1 }; sections.push(bible); sections.sort((a, b) => a.order - b.order); }
      bible.branches.push({ id, title: books[bookAt][1], noun: 'chapter', rows: [], bytes: 0, order: bookAt, edition: String(edition.short || edition.label || '') });
      continue;
    }
    const label = _collectionLabel(id);
    if (!label) continue;
    let sec = sections.find((x) => x.id === 'tvot');
    if (!sec) { sec = { id: 'tvot', title: 'The Volumes of Truth', branches: [], order: 0 }; sections.unshift(sec); }
    sec.branches.push({ id, title: label, noun: 'recording', rows: [], bytes: 0, order: 1e6 });
  }
  const branchesAll = sections.flatMap((sec) => sec.branches);
  const setName = way.size === 1 ? ((branchesAll.find((b) => way.has(b.id)) || { title: '' }).title) : '';
  const removeRow = (/** @type {ShelfRow} */ row, /** @type {string} */ label) => {
    if (off) removeWithUndo(off, row.items.map((it) => it.url), 'Removed ' + label + (row.bytes ? ' · ' + formatBytes(row.bytes) : ''));
  };
  const play = (/** @type {ShelfItem} */ it, /** @type {string} */ reader = '') => {
    if (typeof AudioPlayer !== 'undefined' && typeof AudioPlayer.playTrack === 'function') {
      AudioPlayer.playTrack({ key: it.key, title: it.title, url: it.url, sub: null, readerCode: reader, partLabel: null });
    }
  };
  const tabs = (
    <div className="ui-seg dl-tabs" role="tablist" aria-label="Downloads">
      {/** @type {Array<['choose' | 'phone', string]>} */ ([['choose', 'Choose'], ['phone', 'On this phone']]).map(([id, name]) => (
        <button key={id} type="button" role="tab" id={'dl-tab-' + id} aria-selected={tab === id} aria-controls="dl-tabpanel"
          className={'ui-seg-item dl-tab' + (tab === id ? ' is-on' : '')} onClick={() => setTab(id)}>{name}</button>
      ))}
    </div>
  );
  // W3b listen (au-dlrun): while a set downloads its card takes the storage card's place, with the one line on keeping
  // the app open; otherwise the storage card (au-dl, au-dlphone).
  const runsClosed = !!off && typeof off.runsClosed === 'function' && off.runsClosed();
  const top = off ? (
    <>
      {strip ? <DownloadStrip off={off} name={setName} onMakeRoom={() => setTab('phone')} /> : <StorageCard used={total + songs} songs={songs} free={free} />}
      {running ? <p className="listen-dl-note dl-run-note">{(runsClosed ? 'It goes on with VOTReader closed.' : 'Keep VOTReader open until it finishes.') + ' You can read and listen meanwhile.'}</p> : null}
      {tabs}
    </>
  ) : null;
  // listen.html au-dl: the title in the bar, never "Listening Library" (U 8.6).
  const utility = { title: 'Downloads', onBack, backLabel };
  // au-dlauto: what downloads by itself, beside what you choose. The last two are Settings' own switches, shown here
  // because this is where you look for them; all three wait for Wi-Fi (auto-download.js), so they show only where the
  // phone can tell Wi-Fi from mobile data (as in Settings).
  const byThemselves = onToggleSetting && canTell() ? (
    <>
      <ListGroup label="By themselves" className="dl-auto">
        <ListRow noLead title="Keep what I star on this phone" meta="Saved recordings download by themselves, on Wi-Fi"
          switchOn={keepStarred} onClick={() => onToggleSetting('keepStarred')} />
        <ListRow noLead title="Keep the next 3 ready" meta="While you listen, the next three download ahead"
          switchOn={keepNextReady} onClick={() => onToggleSetting('keepNextReady')} />
        <ListRow noLead title="Download only on Wi-Fi" meta="On mobile data a download waits for Wi-Fi"
          switchOn={wifiOnly} onClick={() => onToggleSetting('downloadWifiOnly')} />
      </ListGroup>
      <p className="listen-dl-note">The last two are the same switches as in Settings, shown here because this is where you look for them.</p>
    </>
  ) : null;
  if (tab === 'choose' && off) {
    return (
      <ScreenLayout utility={utility}>
        <div className="audio-library-screen dl-screen">
          {top}
          <div role="tabpanel" id="dl-tabpanel" aria-labelledby="dl-tab-choose">
            <DownloadQueue off={off} only="failed" />
            <DownloadChooser key={focus || ''} off={off} bibleAudio={bibleAudio} focus={focus}
              letterReader={letterReader} after={byThemselves} />
          </div>
        </div>
      </ScreenLayout>
    );
  }

  const flip = (/** @type {string} */ id) => { const x = new Set(open); if (x.has(id)) x.delete(id); else x.add(id); setOpen(x); };
  const byOrder = (/** @type {{ order: number, title: string }} */ a, /** @type {{ order: number, title: string }} */ b) =>
    a.order - b.order || a.title.localeCompare(b.title, undefined, { numeric: true });
  const askedBranch = asking && asking.kind === 'branch' ? branchesAll.find((b) => b.id === asking.id) || null : null;
  const lineOf = (/** @type {ShelfBranch} */ b) => {
    // A letter with a part here and a part coming is one row already: it is not counted again.
    const here = new Set(b.noun === 'chapter' ? [] : b.rows.map((r) => (r.items[0] && r.items[0].key) || ''));
    const coming = way.has(b.id) ? [.../** @type {Set<string>} */ (way.get(b.id))].filter((k) => !here.has(k)).length : 0;
    if (coming) return b.rows.length + ' of ' + countOf(b.rows.length + coming, b.noun) + ' · the rest are on their way';
    return [b.edition || '', countOf(b.rows.length, b.noun), formatBytes(b.bytes)].filter(Boolean).join(' · ');
  };
  const branchRow = (/** @type {ShelfBranch} */ b) => {
    const isOpen = open.has(b.id);
    const coming = way.has(b.id);
    const rows = [...b.rows].sort(byOrder);
    const shown = showAll.has(b.id) ? rows : rows.slice(0, ROWS_SHOWN);
    return (
      <div key={b.id} className={'dl-kept' + (isOpen ? ' is-open' : '')}>
        <div className="ui-row">
          <button type="button" className="ui-row-main" onClick={() => flip(b.id)} aria-expanded={isOpen} disabled={!rows.length}>
            <span className="ui-row-text"><span className="ui-row-title">{b.title}</span><span className="ui-row-meta">{lineOf(b)}</span></span>
          </button>
          {coming ? <span className="dl-spin" role="img" aria-label="On its way" /> : (
            <button type="button" className="ui-row-menu dl-bin" onClick={() => setAsking({ kind: 'branch', id: b.id })}
              aria-label={'Remove ' + b.title + ' from this phone'}><UiIcon name="trash" size="sm" /></button>
          )}
        </div>
        {isOpen ? (
          <div className="dl-shelf-rows">
            {shown.map((r) => {
              const updating = r.items.some((it) => off.isUpdating && off.isUpdating(it.url));
              const isStale = !updating && r.items.some((it) => it.stale);
              const who = b.noun === 'chapter' ? '' : readerName(r.reader);
              const named = r.title + (who ? ' · ' + who : '');
              // Part of a reading on the phone says so: "1 of 2 parts" (defect 21).
              const part = r.parts > 1 && r.items.length < r.parts ? r.items.length + ' of ' + r.parts + ' parts' : '';
              return (
                <div key={r.id} className="dl-shelf-row">
                  <button type="button" className="dl-shelf-play" onClick={() => play(r.items[0], r.reader)} aria-label={'Play ' + named}>
                    <span className="dl-shelf-title">{r.title}{who ? <span className="dl-reader">{who}</span> : null}</span>
                    <span className="dl-shelf-size">{[part, formatBytes(r.bytes)].filter(Boolean).join(' · ') + (updating ? ' · Updating' : isStale ? ' · Update available' : '')}</span>
                  </button>
                  {isStale ? (
                    <button type="button" className="ui-link" onClick={() => off.update(r.items)} aria-label={'Update ' + named + ' on this phone'}>Update</button>
                  ) : null}
                  <button type="button" className="ui-row-menu" onClick={() => removeRow(r, b.noun === 'chapter' ? b.title + ' · ' + r.title : named)}
                    aria-label={'Remove ' + named + ' from this phone'}><UiIcon name="x" size="sm" /></button>
                </div>
              );
            })}
            {rows.length > ROWS_SHOWN && !showAll.has(b.id) ? (
              <button type="button" className="ui-link dl-shelf-more" onClick={() => setShowAll((p) => new Set(p).add(b.id))}>{'Show all ' + rows.length}</button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };
  const asked = asking && asking.kind === 'all' ? { title: 'Remove everything?', n: recordings, noun: 'recording', bytes: total }
    : askedBranch ? { title: 'Remove ' + askedBranch.title + '?', n: askedBranch.rows.length, noun: askedBranch.noun, bytes: askedBranch.bytes } : null;
  const doRemove = () => {
    if (!off || !asking) return;
    if (asking.kind === 'all') off.removeAll();
    else if (askedBranch) off.remove(askedBranch.rows.flatMap((r) => r.items.map((it) => it.url)));
    setAsking(null);
  };

  return (
    <ScreenLayout utility={utility}>
      <div className="audio-library-screen dl-screen">
        {top}
        <div role={off ? 'tabpanel' : undefined} id="dl-tabpanel" aria-labelledby={off ? 'dl-tab-phone' : undefined}>
          {off ? <DownloadQueue off={off} /> : null}
          {/* The browser refused persistent storage (brief section 7 item 3): say plainly what that can mean. */}
          {items.length && off.evictable && off.evictable() ? (
            <p className="listen-dl-note audio-offline-evictable">This browser may clear downloads when the phone runs low on space. Adding VOTReader to the Home Screen helps keep them.</p>
          ) : null}
          {stale.length > 1 ? (
            <p className="listen-dl-note dl-updates">
              <span>{'Updates available · ' + many(stale.length)}</span>
              <button type="button" className="ui-link" onClick={() => off.update(stale)}>Update all</button>
            </p>
          ) : null}

          {branchesAll.length ? (
            <>
              {running ? (
                <ListGroup label="On this phone so far" aside={formatBytes(total) || '0 MB'} className="dl-phone">
                  {[...branchesAll].sort(byOrder).map(branchRow)}
                </ListGroup>
              ) : sections.map((sec) => (
                <ListGroup key={sec.id} label={sec.title} className="dl-phone">
                  {[...sec.branches].sort(byOrder).map(branchRow)}
                </ListGroup>
              ))}
              {/* With one recording its own bin is the whole job (Codex critique of the built screens, 2026-09-24). */}
              {recordings > 1 && !running ? (
                <div className="dl-remove-all">
                  <UiButton kind="text" danger icon="trash" onClick={() => setAsking({ kind: 'all' })}>Remove everything</UiButton>
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState icon="phone" title="Nothing is on this phone yet"
              text="In Choose, tick what you want and tap Download. It then plays with no signal."
              action={off ? { label: 'Choose downloads', onClick: () => setTab('choose') } : null} />
          )}
        </div>
      </div>
      {/* au-dlremove: asks once and says what it frees. */}
      <ActionSheet id="dl-remove-sheet" open={!!asked} onClose={() => setAsking(null)} title={asked ? asked.title : ''}
        cancelLabel="Keep" confirm={{ label: 'Remove', danger: true, onConfirm: doRemove }}>
        {asked ? countOf(asked.n, asked.noun) + (asked.n === 1 ? ' comes' : ' come') + ' off this phone'
          + (asked.bytes ? (asked.n === 1 ? ' and frees ' : ' and free ') + formatBytes(asked.bytes) : '') + (asked.n === 1 ? '. It still plays' : '. They still play')
          + ' whenever you have a signal.' : ''}
      </ActionSheet>
    </ScreenLayout>
  );
}
