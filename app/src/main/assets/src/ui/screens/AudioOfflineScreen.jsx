/*
   AudioOfflineScreen -- the Downloads screen (downloads brief 2026-10-23, D3): two tabs, Choose (the tree, the
   DownloadChooser) and On this phone (below; listening item 8).

   On this phone is built to the dl-mock pictures 11-13 (D:/Swarm/calls/downloads-mockups/): a storage bar, the
   downloads grouped like the tree (The Volumes of Truth by collection, the Bible by edition and book), a × per
   recording with a 5 s Undo, a ⋯ per group whose Remove asks first, and Remove all downloads, which asks too. A tap
   on a recording plays it (with no signal too). The Listening Library's Downloads card opens the screen; it exists
   where downloads are possible (the Android app, or a browser that keeps recordings: cf1).
*/

/* Cluster H (the Listening Library) - bundle-d since lz1 (2026-10-13), lazy bundle-h before. OfflineAudio and AudioPlayer
   live in bundle-d too and are read as free globals at call time - one store, one player (see _entry-d.js). */

import { useOfflineAudio, formatBytes } from '../components/OfflineAudioControls.jsx';
import { DownloadChooser, Sheet, TrashIcon } from '../components/DownloadChooser.jsx';
import { countOf } from '../../utils/download-tree.js';
import { hideToast, showToast } from '../../utils/toast.js';

export const REMOVED_TOAST_ID = 'vot-toast-offline-removed';
/** How long a single Remove can be taken back (brief section 7 item 14). */
const REMOVE_UNDO_MS = 5000;
/** Rows a group shows before "Show all 30" (picture 11). */
const ROWS_SHOWN = 3;

/** @typedef {{ url: string, key: string, title: string, bytes: number, savedAt: number, stale?: boolean }} ShelfItem */
/** @typedef {{ id: string, lead: string, title: string, items: ShelfItem[], bytes: number, savedAt: number }} ShelfGroup */
/** @typedef {{ id: string, title: string, items: ShelfItem[], bytes: number, order: number }} ShelfRow  one recording */
/**
 * @typedef {{ id: string, title: string, noun: 'recording' | 'chapter', rows: ShelfRow[], bytes: number, order: number }} ShelfBranch
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
 * The shelf by recording (n2-04): a letter's parts and a Bible book's chapters are one group, in their own order
 * (chapter 2 before chapter 10), the group last added to first. A download without a key stands alone.
 * @param {ShelfItem[]} items
 * @returns {ShelfGroup[]}
 */
export function groupShelf(items) {
  /** @type {Map<string, ShelfItem[]>} */
  const byKey = new Map();
  for (const it of items) {
    const id = it.key || it.url;
    const g = byKey.get(id);
    if (g) g.push(it); else byKey.set(id, [it]);
  }
  const order = (/** @type {ShelfItem} */ a, /** @type {ShelfItem} */ b) =>
    a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }) || a.url.localeCompare(b.url);
  const groups = [...byKey.entries()].map(([id, list]) => {
    list.sort(order);
    const shared = list.length > 1 ? _sharedTitle(list.map((x) => x.title)) : '';
    const base = shared || list[0].title;
    const edition = id.includes(':') ? _editionOf(id) : '';
    return {
      id,
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
function _row(list, /** @type {string} */ id, /** @type {string} */ title, /** @type {number} */ order) {
  return { id, title, items: list, bytes: list.reduce((n, x) => n + (x.bytes || 0), 0), order };
}

/**
 * The shelf grouped like the Choose tree (picture 11): The Volumes of Truth › collection › letter (its parts one row),
 * The Bible · edition › book › chapter, then Studies and anything else. Sections, branches and rows in library order.
 * @param {ShelfItem[]} items
 * @returns {ShelfSection[]}
 */
export function shelfSections(items) {
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
  groupShelf(items).forEach((g) => {
    const colon = g.id.indexOf(':');
    const volKey = colon > 0 ? g.id.slice(0, colon) : '';
    const edition = volKey ? _edition(volKey) : null;
    if (edition) {
      const bookId = g.id.slice(colon + 1);
      const at = books.findIndex((b) => b[0] === bookId);
      const name = at >= 0 ? books[at][1] : g.lead || g.items[0].title.split(' · ')[0];
      const b = branch(volKey, 'The Bible · ' + (edition.short || edition.label || ''), 1, g.id, name, 'chapter', at < 0 ? 999 : at);
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
      const itemId = g.id.slice(colon + 1);
      const at = pre && pre.id === itemId ? -1 : letters.findIndex((/** @type {any} */ l) => l && l.id === itemId);
      b.rows.push(_row(g.items, g.id, title, at === -1 && !(pre && pre.id === itemId) ? 1e6 : at));
    } else if (volKey === 'study') {
      branch('study', 'Studies', 2, 'study', 'Bible/Letter Studies', 'recording', 0).rows.push(_row(g.items, g.id, title, 0));
    } else {
      branch('other', 'Other recordings', 3, 'other', 'Recordings', 'recording', 0).rows.push(_row(g.items, g.id, title, 0));
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

function CheckCircle() {
  return <svg className="dl-shelf-mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M7.8 12.3l2.9 2.9 5.5-6.2" /></svg>;
}
function CloseGlyph() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11" /><path d="M17.5 6.5l-11 11" /></svg>;
}
function MoreGlyph() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18.5" cy="12" r="1.6" /></svg>;
}

/**
 * "Remove Volume One from this phone?" (picture 12): the one confirm for a group and for everything.
 * @param {{ label: string, line: string, onCancel: () => void, onRemove: () => void }} props
 */
function RemoveSheet({ label, line, onCancel, onRemove }) {
  return (
    <Sheet id="dl-remove-sheet" title={'Remove ' + label + ' from this phone?'} onClose={onCancel}>
      <p className="dl-sheet-summary dl-remove-line"><TrashIcon /><span>{line + '. You can download them again any time.'}</span></p>
      <div className="dl-sheet-actions">
        <button type="button" className="offline-confirm-cancel" onClick={onCancel} data-autofocus>Cancel</button>
        <button type="button" className="offline-confirm-go dl-remove-go" onClick={onRemove}>Remove</button>
      </div>
    </Sheet>
  );
}

/**
 * A group's ⋯: play it, choose more of it, or remove it (which asks next).
 * @param {{ branch: ShelfBranch, onPlay: () => void, onChoose: () => void, onRemove: () => void, onClose: () => void }} props
 */
function BranchSheet({ branch, onPlay, onChoose, onRemove, onClose }) {
  return (
    <Sheet id="dl-branch-sheet" title={branch.title} onClose={onClose}>
      <div className="dl-menu">
        <button type="button" className="dl-menu-item" onClick={onPlay} data-autofocus>Play</button>
        <button type="button" className="dl-menu-item" onClick={onChoose}>Choose more…</button>
        <button type="button" className="dl-menu-item is-remove" onClick={onRemove}>{'Remove · ' + formatBytes(branch.bytes)}</button>
      </div>
    </Sheet>
  );
}

/**
 * @param {{
 *   onBack: () => void,
 *   backLabel?: string,
 *   bibleAudio?: string,
 *   onSearch?: () => void,
 *   onHistory?: () => void,
 *   onSettings?: () => void,
 *   theme?: any,
 *   onThemeChange?: (theme: any) => void,
 * }} props
 */
export function AudioOfflineScreen({ onBack, backLabel = 'Listening Library', bibleAudio, onSearch, onHistory, onSettings, theme, onThemeChange }) {
  const off = useOfflineAudio();
  // Nothing on the phone or on its way opens Choose; else what is there (an entry point may say which: openDownloadsAt).
  const [at] = React.useState(() => { const a = _openAt; _openAt = null; return a; });
  const [tab, setTab] = React.useState(() => {
    if (at) return at.tab;
    const p = off && typeof off.pending === 'function' ? off.pending() : { busy: 0, failed: [] };
    return off && (off.items().length || p.busy || p.failed.length) ? 'phone' : 'choose';
  });
  const [focus, setFocus] = React.useState(() => (at && at.focus) || null);
  const [asking, setAsking] = React.useState(/** @type {null | { kind: 'all' } | { kind: 'branch', id: string } | { kind: 'menu', id: string }} */ (null));
  const [sort, setSort] = React.useState(/** @type {'order' | 'size'} */ ('order'));
  const [open, setOpen] = React.useState(() => /** @type {Set<string> | null} */ (null));
  const [showAll, setShowAll] = React.useState(() => new Set());
  // A single Remove waits out its Undo (brief section 7 item 14): the row steps aside at once and the file goes when
  // the toast does, so Undo keeps the very file rather than downloading it again.
  const [leaving, setLeaving] = React.useState(() => new Set());
  const items = off ? off.items().filter((it) => !leaving.has(it.url)) : [];
  const sections = shelfSections(items);
  const pending = off && typeof off.pending === 'function' ? off.pending() : { busy: 0, failed: [] };
  const total = off ? off.totalBytes() : 0;
  const songs = off && typeof off.songItems === 'function' ? off.songItems().reduce((n, it) => n + (it.bytes || 0), 0) : 0;
  const free = off ? off.freeBytes() : -1;
  const many = (/** @type {number} */ n) => countOf(n, 'recording');
  const recordings = sections.reduce((n, s) => n + s.branches.reduce((m, b) => m + b.rows.length, 0), 0);
  // Opening the shelf asks whether any recording on it was uploaded again (n2-01): its read-along timings follow the
  // new bytes, so the old file would drift.
  React.useEffect(() => { if (off && typeof off.checkForUpdates === 'function') off.checkForUpdates(); }, [off]);
  const stale = items.filter((it) => it.stale);
  const removeRow = (/** @type {ShelfRow} */ row, /** @type {string} */ label) => {
    if (!off) return;
    let undone = false;
    const urls = row.items.map((it) => it.url);
    setLeaving((prev) => { const next = new Set(prev); for (const u of urls) next.add(u); return next; });
    const back = () => setLeaving((prev) => { const next = new Set(prev); for (const u of urls) next.delete(u); return next; });
    // Toasts share one spot; this one carries an action, so the others step aside.
    document.querySelectorAll('.vot-toast.show').forEach((el) => { if (el.id && el.id !== REMOVED_TOAST_ID) hideToast(el.id); });
    showToast({
      id: REMOVED_TOAST_ID, className: 'vot-toast vot-toast-undo', durationMs: REMOVE_UNDO_MS,
      text: 'Removed ' + label + (row.bytes ? ' · ' + formatBytes(row.bytes) : ''),
      onHide: () => { if (!undone) off.remove(urls); back(); },
    });
    const el = document.getElementById(REMOVED_TOAST_ID);
    if (!el) return;
    const undo = document.createElement('button');
    undo.type = 'button';
    undo.className = 'vot-undo-btn';
    undo.textContent = 'Undo';
    undo.addEventListener('click', () => { undone = true; hideToast(REMOVED_TOAST_ID); }, { once: true });
    el.appendChild(undo);
  };
  const play = (/** @type {ShelfItem} */ it) => {
    if (typeof AudioPlayer !== 'undefined' && typeof AudioPlayer.playTrack === 'function') {
      AudioPlayer.playTrack({ key: it.key, title: it.title, url: it.url, sub: null, readerCode: '', partLabel: null });
    }
  };
  const tabs = (
    <div className="dl-tabs" role="tablist" aria-label="Downloads">
      {/** @type {Array<['choose' | 'phone', string]>} */ ([['choose', 'Choose'], ['phone', 'On this phone']]).map(([id, name]) => (
        <button key={id} type="button" role="tab" id={'dl-tab-' + id} aria-selected={tab === id} aria-controls="dl-tabpanel"
          className={'dl-tab' + (tab === id ? ' is-on' : '')} onClick={() => setTab(id)}>{name}</button>
      ))}
    </div>
  );
  const nav = LibraryNav({ onBack, backLabel, showHome: false, onSearch, onHistory, onSettings, theme, onThemeChange });
  const head = (
    <header className="audio-library-hero dl-hero">
      <div className="audio-library-eyebrow">Listening Library</div>
      <h1>Downloads</h1>
    </header>
  );
  if (tab === 'choose' && off) {
    return (
      <ScreenLayout navChildren={nav}>
        <div className="audio-library-screen dl-screen">
          {head}
          {tabs}
          <div role="tabpanel" id="dl-tabpanel" aria-labelledby="dl-tab-choose">
            <DownloadChooser key={focus || ''} off={off} bibleAudio={bibleAudio} focus={focus} />
          </div>
        </div>
      </ScreenLayout>
    );
  }

  const branchesAll = sections.flatMap((s) => s.branches);
  // The first group opens by itself (picture 11); after that the listener decides.
  const opened = open || new Set(branchesAll.length ? [branchesAll[0].id] : []);
  const flip = (/** @type {string} */ id) => { const s = new Set(opened); if (s.has(id)) s.delete(id); else s.add(id); setOpen(s); };
  const bySize = (/** @type {{ bytes: number, order: number, title: string }} */ a, /** @type {{ bytes: number, order: number, title: string }} */ b) =>
    (sort === 'size' ? b.bytes - a.bytes : 0) || a.order - b.order || a.title.localeCompare(b.title, undefined, { numeric: true });
  const askedBranch = asking && asking.kind !== 'all' ? branchesAll.find((b) => b.id === asking.id) || null : null;
  const used = total + songs;
  const barTotal = used + Math.max(0, free);

  return (
    <ScreenLayout navChildren={nav}>
      <div className="audio-library-screen dl-screen">
        {head}
        {off ? tabs : null}
        <div role={off ? 'tabpanel' : undefined} id="dl-tabpanel" aria-labelledby={off ? 'dl-tab-phone' : undefined}>
          {items.length || songs ? (
            <div className="dl-storage">
              {barTotal > 0 ? (
                <div className="dl-storage-bar" aria-hidden="true">
                  <span className="dl-storage-rec" style={{ width: Math.max(1.5, (total / barTotal) * 100) + '%' }} />
                  {songs ? <span className="dl-storage-songs" style={{ width: Math.max(1, (songs / barTotal) * 100) + '%' }} /> : null}
                </div>
              ) : null}
              <p className="dl-storage-line">
                {['Recordings ' + (formatBytes(total) || '0 MB'), songs ? 'Songs ' + formatBytes(songs) : '', free >= 0 ? formatBytes(free) + ' free on this phone' : ''].filter(Boolean).join(' · ')}
              </p>
            </div>
          ) : null}
          {/* The browser refused persistent storage (brief section 7 item 3): say plainly what that can mean. */}
          {items.length && off.evictable && off.evictable() ? (
            <p className="audio-library-intro audio-offline-evictable">This browser may clear downloads when the phone runs low on space. Adding VOTReader to the Home Screen helps keep them.</p>
          ) : null}

          {stale.length > 1 ? (
            <div className="offline-collection offline-shelf-status">
              <p className="offline-collection">
                <span>{'Updates available · ' + many(stale.length)}</span>
                <button type="button" className="offline-row-link" onClick={() => off.update(stale)}>Update all</button>
              </p>
            </div>
          ) : null}
          {pending.busy || pending.failed.length ? (
            <div className="offline-collection offline-shelf-status">
              {pending.busy ? (
                <p className="offline-collection is-busy">
                  <span>{'Downloading · ' + many(pending.busy) + ' to go'}</span>
                  <button type="button" className="offline-row-link" onClick={() => off.cancelAll()}>Cancel all</button>
                </p>
              ) : null}
              {pending.failed.length ? (
                <p className="offline-collection is-failed">
                  <span>{'Did not download · ' + many(pending.failed.length)}</span>
                  <button type="button" className="offline-row-link" onClick={() => off.download(pending.failed)}>Retry all</button>
                </p>
              ) : null}
            </div>
          ) : null}

          {items.length ? (
            <>
              {branchesAll.length > 1 ? (
                <div className="dl-sort">
                  <label>
                    <span className="sr-only">Sort</span>
                    <select value={sort} onChange={(e) => setSort(e.target.value === 'size' ? 'size' : 'order')}>
                      <option value="order">Sort: Library order</option>
                      <option value="size">Sort: Size</option>
                    </select>
                  </label>
                </div>
              ) : null}
              {sections.map((sec) => (
                <section key={sec.id} className="dl-shelf-section" aria-label={sec.title}>
                  <h2 className="dl-shelf-kicker">{sec.title}</h2>
                  {[...sec.branches].sort(bySize).map((b) => {
                    const isOpen = opened.has(b.id);
                    const rows = [...b.rows].sort(bySize);
                    const shown = showAll.has(b.id) ? rows : rows.slice(0, ROWS_SHOWN);
                    const line = countOf(b.rows.length, b.noun) + ' · ' + formatBytes(b.bytes);
                    return (
                      <article key={b.id} className={'dl-shelf-branch' + (isOpen ? ' is-open' : '')}>
                        <div className="dl-shelf-head">
                          <CheckCircle />
                          <button type="button" className="dl-row-main" onClick={() => flip(b.id)} aria-expanded={isOpen}>
                            <span className="dl-row-copy"><strong>{b.title}</strong><small>{line}</small></span>
                            <svg className={'dl-chevron' + (isOpen ? ' is-open' : '')} viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5l6 6 6-6" /></svg>
                          </button>
                          <button type="button" className="dl-icon-btn" onClick={() => setAsking({ kind: 'menu', id: b.id })}
                            aria-label={'More for ' + b.title}><MoreGlyph /></button>
                        </div>
                        {isOpen ? (
                          <div className="dl-shelf-rows">
                            {shown.map((r) => {
                              const updating = r.items.some((it) => off.isUpdating && off.isUpdating(it.url));
                              const isStale = !updating && r.items.some((it) => it.stale);
                              return (
                                <div key={r.id} className="dl-shelf-row">
                                  <button type="button" className="dl-shelf-play" onClick={() => play(r.items[0])} aria-label={'Play ' + r.title}>
                                    <span className="dl-shelf-title">{r.title}</span>
                                    <span className="dl-shelf-size">{formatBytes(r.bytes) + (updating ? ' · Updating' : isStale ? ' · Update available' : '')}</span>
                                  </button>
                                  {isStale ? (
                                    <button type="button" className="offline-row-link" onClick={() => off.update(r.items)} aria-label={'Update ' + r.title + ' on this phone'}>Update</button>
                                  ) : null}
                                  <button type="button" className="dl-icon-btn" onClick={() => removeRow(r, b.noun === 'chapter' ? b.title + ' · ' + r.title : r.title)} aria-label={'Remove ' + r.title + ' from this phone'}><CloseGlyph /></button>
                                </div>
                              );
                            })}
                            {rows.length > ROWS_SHOWN && !showAll.has(b.id) ? (
                              <button type="button" className="dl-link dl-shelf-more" onClick={() => setShowAll((p) => new Set(p).add(b.id))}>{'Show all ' + rows.length}</button>
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </section>
              ))}
              {/* With one recording its own × is the whole job (Codex critique of the built screens, 2026-09-24). */}
              {recordings > 1 ? (
                <button type="button" className="dl-remove-all" onClick={() => setAsking({ kind: 'all' })}>Remove all downloads</button>
              ) : null}
            </>
          ) : (
            <div className="audio-library-empty">Nothing is on this phone yet. In Choose, tick what you want and tap Download; it then plays with no signal.</div>
          )}
        </div>
      </div>
      {asking && asking.kind === 'all' ? (
        <RemoveSheet label="all downloads" line={many(recordings) + ' · ' + formatBytes(total)}
          onCancel={() => setAsking(null)} onRemove={() => { off.removeAll(); setAsking(null); }} />
      ) : null}
      {asking && asking.kind === 'menu' && askedBranch ? (
        <BranchSheet branch={askedBranch} onClose={() => setAsking(null)}
          onPlay={() => { play(askedBranch.rows[0].items[0]); setAsking(null); }}
          onChoose={() => { setAsking(null); setFocus(askedBranch.id.startsWith('bible-') ? askedBranch.id.slice(0, askedBranch.id.indexOf(':')) : askedBranch.id); setTab('choose'); }}
          onRemove={() => setAsking({ kind: 'branch', id: askedBranch.id })} />
      ) : null}
      {asking && asking.kind === 'branch' && askedBranch ? (
        <RemoveSheet label={askedBranch.title} line={countOf(askedBranch.rows.length, askedBranch.noun) + ' · ' + formatBytes(askedBranch.bytes)}
          onCancel={() => setAsking(null)}
          onRemove={() => { off.remove(askedBranch.rows.flatMap((r) => r.items.map((it) => it.url))); setAsking(null); }} />
      ) : null}
    </ScreenLayout>
  );
}
