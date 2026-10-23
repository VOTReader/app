/*
   AudioOfflineScreen -- the Downloads screen (downloads brief 2026-10-23, D3): two tabs, Choose (the tree, the
   DownloadChooser) and On this phone (below; listening item 8).

   Built to Codex's mockup round 1, option 1 (lanes/readalong/out/mockups/offline/r1-1.png): each download with its
   size, a tap on it plays it (with no signal too), a Remove per row, and Remove all, which asks first. The Listening
   Library hub's "On this phone" row opens it; it exists where downloads are possible (the Android app, or a browser that keeps recordings: cf1).
*/

/* Cluster H (the Listening Library) - bundle-d since lz1 (2026-10-13), lazy bundle-h before. OfflineAudio and AudioPlayer
   live in bundle-d too and are read as free globals at call time - one store, one player (see _entry-d.js). */

import { useOfflineAudio, formatBytes } from '../components/OfflineAudioControls.jsx';
import { DownloadChooser } from '../components/DownloadChooser.jsx';
import { hideToast, showToast } from '../../utils/toast.js';

export const REMOVED_TOAST_ID = 'vot-toast-offline-removed';
/** How long a single Remove can be taken back (brief section 7 item 14). */
const REMOVE_UNDO_MS = 5000;

/** @typedef {{ url: string, key: string, title: string, bytes: number, savedAt: number, stale?: boolean }} ShelfItem */
/** @typedef {{ id: string, lead: string, title: string, items: ShelfItem[], bytes: number, savedAt: number }} ShelfGroup */

/** Where a Bible edition's recording comes from, for a book's heading ("Genesis · KJV · BRM"). @param {string} key */
function _editionOf(key) {
  const volKey = key.slice(0, key.indexOf(':'));
  if (!volKey.startsWith('bible-') || typeof BIBLE_AUDIO_EDITIONS === 'undefined') return '';
  const e = Object.values(BIBLE_AUDIO_EDITIONS).find((x) => x && x.volKey === volKey);
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

/** Where the next opening of the screen lands: a header's "Choose…" opens the tree at its collection (D3b). */
let _openAt = /** @type {null | { tab: 'choose' | 'phone', focus?: string | null }} */ (null);
/** @param {{ tab: 'choose' | 'phone', focus?: string | null }} at */
export function openDownloadsAt(at) { _openAt = at; }

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
  const [askingAll, setAskingAll] = React.useState(false);
  const [askingGroup, setAskingGroup] = React.useState(/** @type {string | null} */ (null));
  // A single Remove waits out its Undo (brief section 7 item 14): the row steps aside at once and the file goes when
  // the toast does, so Undo keeps the very file rather than downloading it again.
  const [leaving, setLeaving] = React.useState(() => new Set());
  const items = off ? off.items().filter((it) => !leaving.has(it.url)) : [];
  // By recording, the one last added to first: the one just downloaded is the one looked for.
  const groups = groupShelf(items);
  const pending = off && typeof off.pending === 'function' ? off.pending() : { busy: 0, failed: [] };
  const total = off ? off.totalBytes() : 0;
  const count = items.length === 1 ? '1 recording' : items.length + ' recordings';
  const many = (/** @type {number} */ n) => (n === 1 ? '1 recording' : n + ' recordings');
  // Opening the shelf asks whether any recording on it was uploaded again (n2-01): its read-along timings follow the
  // new bytes, so the old file would drift.
  React.useEffect(() => { if (off && typeof off.checkForUpdates === 'function') off.checkForUpdates(); }, [off]);
  const stale = items.filter((it) => it.stale);
  const removeOne = (/** @type {any} */ it) => {
    if (!off) return;
    let undone = false;
    setLeaving((prev) => new Set(prev).add(it.url));
    const back = () => setLeaving((prev) => { const next = new Set(prev); next.delete(it.url); return next; });
    // Toasts share one spot; this one carries an action, so the others step aside.
    document.querySelectorAll('.vot-toast.show').forEach((el) => { if (el.id && el.id !== REMOVED_TOAST_ID) hideToast(el.id); });
    showToast({
      id: REMOVED_TOAST_ID, className: 'vot-toast vot-toast-undo', durationMs: REMOVE_UNDO_MS,
      text: 'Removed “' + it.title + '”',
      onHide: () => { if (!undone) off.remove([it.url]); back(); },
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
  const play = (/** @type {any} */ it) => {
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
  if (tab === 'choose' && off) {
    return (
      <ScreenLayout navChildren={nav}>
        <div className="audio-library-screen dl-screen">
          <header className="audio-library-hero dl-hero">
            <div className="audio-library-eyebrow">Listening Library</div>
            <h1>Downloads</h1>
          </header>
          {tabs}
          <div role="tabpanel" id="dl-tabpanel" aria-labelledby="dl-tab-choose">
            <DownloadChooser off={off} bibleAudio={bibleAudio} focus={at ? at.focus : null} />
          </div>
        </div>
      </ScreenLayout>
    );
  }
  return (
    <ScreenLayout navChildren={nav}>
      <div className="audio-library-screen dl-screen">
        <header className="audio-library-hero dl-hero">
          <div className="audio-library-eyebrow">Listening Library</div>
          <h1>Downloads</h1>
        </header>
        {off ? tabs : null}
        <div role={off ? 'tabpanel' : undefined} id="dl-tabpanel" aria-labelledby={off ? 'dl-tab-phone' : undefined}>
        <header className="dl-phone-head">
          <p className="audio-library-intro">
            {items.length ? count + ' · ' + formatBytes(total) + '. They play with no signal.' : 'Recordings you download play with no signal.'}
          </p>
          {/* The browser refused persistent storage (brief section 7 item 3): say plainly what that can mean. */}
          {items.length && off.evictable && off.evictable() ? (
            <p className="audio-library-intro audio-offline-evictable">This browser may clear downloads when the phone runs low on space. Adding VOTReader to the Home Screen helps keep them.</p>
          ) : null}
        </header>

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

        <section className="audio-library-section" aria-labelledby="audio-offline-list">
          <div className="audio-library-section-head">
            <div><span>Downloaded</span><h2 id="audio-offline-list">Recordings</h2></div>
            <strong aria-label={count}>{items.length}</strong>
          </div>
          {items.length ? (
            <div className="audio-library-list">
              {groups.map((g) => (
                <article key={g.id} className={'audio-offline-item' + (g.items.length > 1 ? ' audio-offline-group' : '')}>
                  {g.items.length > 1 ? (
                    <div className="audio-library-row audio-offline-group-head">
                      <button type="button" className="audio-library-row-play" onClick={() => play(g.items[0])} aria-label={'Play ' + g.items[0].title}>
                        {typeof PlayIcon !== 'undefined' ? <PlayIcon /> : null}
                      </button>
                      <div className="audio-library-row-copy">
                        <strong>{g.title}</strong>
                        <small>{many(g.items.length) + ' · ' + formatBytes(g.bytes)}</small>
                      </div>
                      <div className="audio-library-row-actions">
                        <button type="button" className="audio-offline-remove" onClick={() => setAskingGroup(g.id)} aria-expanded={askingGroup === g.id}
                          aria-label={'Remove ' + g.title + ', ' + many(g.items.length) + ', from this phone'}>{g.id.startsWith('bible-') ? 'Remove book' : 'Remove all parts'}</button>
                      </div>
                    </div>
                  ) : null}
                  {askingGroup === g.id ? (
                    <div className="offline-confirm" role="group" aria-label={'Remove ' + g.title}>
                      <p className="offline-confirm-title">{'Remove ' + g.title + ' (' + many(g.items.length) + ', ' + formatBytes(g.bytes) + ') from this phone?'}</p>
                      <p className="offline-confirm-line">They can be downloaded again.</p>
                      <div className="offline-confirm-actions">
                        <button type="button" className="offline-confirm-cancel" onClick={() => setAskingGroup(null)}>Keep them</button>
                        <button type="button" className="offline-confirm-go" onClick={() => { off.remove(g.items.map((it) => it.url)); setAskingGroup(null); }}>Yes, remove</button>
                      </div>
                    </div>
                  ) : null}
                  {g.items.map((it) => (
                    <div key={it.url} className="audio-library-row">
                      <button type="button" className="audio-library-row-play" onClick={() => play(it)} aria-label={'Play ' + it.title}>
                        {typeof PlayIcon !== 'undefined' ? <PlayIcon /> : null}
                      </button>
                      <div className="audio-library-row-copy">
                        <strong>{g.lead && it.title.startsWith(g.lead + ' · ') ? it.title.slice(g.lead.length + 3) : it.title}</strong>
                        <small>{formatBytes(it.bytes) + (off.isUpdating && off.isUpdating(it.url) ? ' · Updating' : it.stale ? ' · Update available' : '')}</small>
                      </div>
                      <div className="audio-library-row-actions">
                        {it.stale && !(off.isUpdating && off.isUpdating(it.url)) ? (
                          <button type="button" className="audio-offline-remove" onClick={() => off.update([it])} aria-label={'Update ' + it.title + ' on this phone'}>Update</button>
                        ) : null}
                        <button type="button" className="audio-offline-remove" onClick={() => removeOne(it)} aria-label={'Remove ' + it.title + ' from this phone'}>Remove</button>
                      </div>
                    </div>
                  ))}
                </article>
              ))}
            </div>
          ) : (
            <div className="audio-library-empty">Nothing is on this phone yet. In Choose, tick what you want and tap Download; it then plays with no signal.</div>
          )}
          {/* With one recording its own Remove is the whole job (Codex critique of the built screens, 2026-09-24). */}
          {items.length > 1 ? (
            askingAll ? (
              <div className="offline-confirm" role="group" aria-label="Remove all downloads">
                <p className="offline-confirm-title">{'Remove all ' + count + ' (' + formatBytes(total) + ') from this phone?'}</p>
                <p className="offline-confirm-line">They can be downloaded again.</p>
                <div className="offline-confirm-actions">
                  <button type="button" className="offline-confirm-cancel" onClick={() => setAskingAll(false)}>Keep them</button>
                  <button type="button" className="offline-confirm-go" onClick={() => { off.removeAll(); setAskingAll(false); }}>Yes, remove all</button>
                </div>
              </div>
            ) : (
              <button type="button" className="audio-library-secondary-action audio-offline-remove-all" onClick={() => setAskingAll(true)}>Remove all</button>
            )
          ) : null}
        </section>
        </div>
      </div>
    </ScreenLayout>
  );
}
