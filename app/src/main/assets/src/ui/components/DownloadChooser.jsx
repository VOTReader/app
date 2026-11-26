/* ═══════════════════════════════════════════════════════════════════════
   DownloadChooser — the Downloads screen's Choose tab (downloads brief 2026-10-23, D3; 3b, 3c, 3e)
   ═══════════════════════════════════════════════════════════════════════
   Built to the dl-mock pictures (D:/Swarm/calls/downloads-mockups/ 03-07, 20): The Volumes of Truth by collection
   and letter, the Bible by edition, testament, book and a chapter grid; a tick means "on this phone after Apply",
   so what is on the phone starts ticked and an untick reads "Will be removed". The footer totals what Apply does;
   Apply asks once with what is added and removed, and over 100 MB on mobile data it asks about Wi-Fi first.

   The tree logic is utils/download-tree.js. Globals read at call time, as the other Cluster H screens do:
   OfflineAudio's store comes in as `off`; AudioPlayer, COLLECTIONS, colPreface/colLetterArr (the lazy VOT
   corpus), BIBLE_AUDIO_EDITIONS/BOOKS, AudioLengths, useFocusTrap and useModalRegistry.

   Voices (dl-rework B and C, 2026-11-10): the Letter voice at the top IS Settings > Letter Voice (one saved setting;
   changing either changes both), above the groups so it stays in view when they fold. With a voice chosen, a line
   says from the data how many letters it reads and what the rest download in, with a switch for only its letters;
   each letter row names the reading Apply fetches, and a letter with more than one reading has a tick per reading.
   ═══════════════════════════════════════════════════════════════════════ */

import { formatBytes, DownloadIcon, SPACE_MARGIN } from './OfflineAudioControls.jsx';
import { SheetHandle } from './SheetHandle.jsx';
import { SelectSheet } from './SelectField.jsx';
import { ListGroup, ListRow, SectionLabel, Chip } from './UiParts.jsx';
import { downloadVoiceOptions } from './CollectionDownload.jsx';
import { formatClock } from './AudioSeekSlider.jsx';
import { networkType } from '../../utils/download-gate.js';
import {
  buildTvot, buildBible, buildStudies, checkState, toggleNode, selectRange, initialWanted, planOf, roomShort, groupPicked,
  countOf, formatLength, unitOnPhone, unitHeld, readerName, readingsOf, readingId, readingOnPhone, readingHeld,
  toggleReading, voiceSplit, byReaderWords, partsOnPhone,
} from '../../utils/download-tree.js';
import { useStoreVersion } from '../../hooks/use-store-version.js';

/** On mobile data, an Apply past this asks first (brief 3e). */
const MOBILE_ASK_BYTES = 100e6;
/** A press this long on a chapter starts a range from it (brief 3c). */
const LONG_PRESS_MS = 500;

/** The lazy VOT corpus's version (letters and their audio arrive with it). */
function useCorpusVersion() {
  // Called as methods: the corpus's subscribe keeps its listeners on `this`.
  return React.useSyncExternalStore(
    React.useCallback((/** @type {() => void} */ cb) => { const c = /** @type {any} */ (window).__votCorpus; return c ? c.subscribe(cb) : () => {}; }, []),
    () => { const c = /** @type {any} */ (window).__votCorpus; return c ? c.getVersion() : 0; },
  );
}

/** @param {string} url @returns {number | null} */
function _secondsOf(url) {
  return typeof AudioLengths !== 'undefined' ? AudioLengths.secondsOf(url) : null;
}

/**
 * The trees the Choose tab ticks, built from the player's catalog: The Volumes of Truth (in `voice`, or each letter's
 * default reading), each offered Bible edition, and the Studies. Shared with the Finished list (sets and their sizes).
 * @param {{ voice?: string, only?: boolean }} o
 */
export function useDownloadTrees({ voice = '', only = false }) {
  const corpus = useCorpusVersion();
  const player = typeof AudioPlayer !== 'undefined' && AudioPlayer && typeof AudioPlayer.playbackTracks === 'function' ? AudioPlayer : _noPlayer;
  React.useEffect(() => {
    const w = /** @type {any} */ (window);
    if (typeof w.__loadVotCorpus === 'function') void w.__loadVotCorpus();
  }, []);
  const editions = React.useMemo(() => (typeof BIBLE_AUDIO_EDITIONS !== 'undefined'
    ? Object.entries(BIBLE_AUDIO_EDITIONS).filter(([, e]) => typeof bibleAudioOffered !== 'function' || bibleAudioOffered(e)) : []), []);
  const tvot = React.useMemo(() => buildTvot({
    collections: typeof COLLECTIONS !== 'undefined' ? COLLECTIONS.filter((/** @type {any} */ c) => c.cardId) : [],
    itemsOf: (col) => {
      const pre = typeof colPreface === 'function' ? colPreface(col) : null;
      const letters = typeof colLetterArr === 'function' ? colLetterArr(col) || [] : [];
      return pre ? [pre, ...letters] : letters;
    },
    player,
    voice,
    only,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- corpus: the letters arrive with the lazy corpus, read from globals
  }), [corpus, voice, only]);
  const bibles = React.useMemo(() => editions.map(([id, e]) => ({
    id, edition: e, tree: buildBible({ edition: e, books: typeof BIBLE_AUDIO_BOOKS !== 'undefined' ? BIBLE_AUDIO_BOOKS : [], player }),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- corpus: the Bible manifest is read from globals too
  })).filter((b) => b.tree.units.length), [editions, corpus]);
  // The studies registry is its own lazy file: asked for here, the branch fills in when it lands.
  const [studiesIn, setStudiesIn] = React.useState(0);
  React.useEffect(() => {
    let live = true;
    const load = /** @type {any} */ (window).loadBibleStudies;
    if (typeof load === 'function') Promise.resolve(load()).then(() => { if (live) setStudiesIn((n) => n + 1); }, () => {});
    return () => { live = false; };
  }, []);
  const studies = React.useMemo(() => buildStudies({
    studies: typeof BIBLE_STUDIES !== 'undefined' && Array.isArray(BIBLE_STUDIES) ? BIBLE_STUDIES : [], player,
  // eslint-disable-next-line react-hooks/exhaustive-deps -- studiesIn, corpus: the registry and manifest are read from globals
  }), [studiesIn, corpus]);
  return { tvot, bibles, studies };
}

/** A player with no catalog (an older shell, a test): every tree is empty. */
const _noPlayer = { playbackTracks: () => [] };

/** The reader a Bible edition's recordings carry ('B' for The Scriptures of Truth), or ''. @param {any} tree */
function _editionReader(tree) {
  const u = tree && tree.units && tree.units[0];
  return u && u.reader ? String(u.reader) : '';
}

/**
 * Count, size, length and how much of it is on the phone, for one row.
 * @param {any} off @param {import('../../utils/download-tree.js').Unit[]} units
 */
function statsOf(off, units) {
  let bytes = 0; let known = true; let seconds = 0; let timed = true; let here = 0;
  for (const u of units) {
    if (unitOnPhone(off, u)) here++;
    for (const t of u.tracks) {
      const size = off.sizeOf(t.url);
      if (size) bytes += size; else known = false;
      const sec = _secondsOf(t.url);
      if (sec == null) timed = false; else seconds += sec;
    }
  }
  return { count: units.length, here, bytes: known ? bytes : null, seconds: timed && units.length ? seconds : null };
}

/** "30 recordings · 232 MB" (listen.html au-dl: count and size, the length only where asked)
 * @param {ReturnType<typeof statsOf>} s @param {string} noun @param {boolean} [length] */
function statsLine(s, noun, length = false) {
  return [countOf(s.count, noun), s.bytes ? formatBytes(s.bytes) : '', length ? formatLength(s.seconds) : ''].filter(Boolean).join(' · ');
}

/** The download list item for one track, named as the rows' own Download names it ("Christmas · Part 2"). */
function _item(/** @type {any} */ t, /** @type {string} */ name) {
  return { url: t.url, key: t.key || '', title: name + (t.partLabel ? ' · ' + t.partLabel : '') };
}

/**
 * A plan held for Wi-Fi ("Wait for Wi-Fi", brief 3e). h1104-19: it goes to the store at once as Wi-Fi-only items
 * (wifi: true), the same saved queue the plan's automatic downloads use: it outlives a close (on the phone it starts
 * with the app closed), and a second plan adds to it. It used to wait in this variable, so a close or a second Wait
 * lost it and nothing ever downloaded. What stays here is only what the chooser says: how many of the plan's
 * recordings still wait while the connection is mobile data. Whichever chooser is open subscribes (subscribeHeld),
 * never the Apply's own callback (#60, item 4: a reopened chooser said "Waiting for Wi-Fi" after they had started).
 */
let _held = /** @type {null | { off: any, urls: Set<string> }} */ (null);
/** @type {Set<() => void>} */
const _heldSubs = new Set();
function _heldChanged() {
  for (const cb of [..._heldSubs]) { try { cb(); } catch (_e) { /* one listener never stops the rest */ } }
}
/** @param {() => void} cb @returns {() => void} unsubscribe */
function subscribeHeld(cb) {
  _heldSubs.add(cb);
  return () => { _heldSubs.delete(cb); };
}
function _connection() {
  const n = typeof navigator !== 'undefined' ? /** @type {any} */ (navigator) : null;
  return n ? n.connection || n.mozConnection || n.webkitConnection || null : null;
}
/** The connection changed: the store starts the plan on Wi-Fi itself; the line re-reads. */
function _onConnection() { _heldChanged(); }
/** @param {any} off @param {any[]} items */
function holdForWifi(off, items) {
  off.download(items.map((i) => ({ ...i, wifi: true })));
  const urls = new Set(_held && _held.off === off ? _held.urls : []);
  for (const i of items) urls.add(i.url);
  _held = { off, urls };
  const c = _connection();
  if (c && typeof c.addEventListener === 'function') {
    if (typeof c.removeEventListener === 'function') c.removeEventListener('change', _onConnection);
    c.addEventListener('change', _onConnection);
  }
  _heldChanged();
}
/** @returns {number} the held plan's recordings still waiting for Wi-Fi now */
export function heldForWifi() {
  if (!_held || networkType() !== 'cellular') return 0;
  let n = 0;
  for (const u of _held.urls) if (_held.off.statusOf(u) === 'queued') n += 1;
  return n;
}

function CheckGlyph() { return <path d="M6.5 12.5l3.8 3.8 7.2-8.3" />; }

/**
 * The tri-state box (README: 22 px rounded square in a 48 px target): ticked, dash, empty, or empty in brick when
 * its rows on the phone are marked for removal.
 * @param {{ state: 'all' | 'some' | 'none', removing?: boolean, label: string, onClick: () => void }} props
 */
function Box({ state, removing, label, onClick }) {
  return (
    <button type="button" role="checkbox" aria-checked={state === 'all' ? true : state === 'some' ? 'mixed' : false}
      aria-label={label} className={'dl-box is-' + state + (removing && state === 'none' ? ' is-remove' : '')} onClick={onClick}>
      <span className="ui-check" data-state={state === 'all' ? 'on' : state === 'some' ? 'some' : 'off'} aria-hidden="true">
        {state === 'all' ? <svg viewBox="0 0 24 24"><CheckGlyph /></svg> : state === 'some' ? <svg viewBox="0 0 24 24"><path d="M7 12h10" /></svg> : null}
      </span>
    </button>
  );
}

/** The on-phone mark: a check in a thin circle, or a circle with a gold arc for part of it. */
function PhoneMark({ here, count }) {
  if (!here) return null;
  const all = here === count;
  const arc = Math.max(0.08, here / count) * 56.5;
  return (
    <span className={'dl-mark' + (all ? ' is-all' : ' is-some')}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" className="dl-mark-ring" />
        {all ? <CheckGlyph /> : <circle cx="12" cy="12" r="9" className="dl-mark-arc" strokeDasharray={arc + ' 56.5'} transform="rotate(-90 12 12)" />}
      </svg>
      <span>{all ? 'On this phone' : here + ' of ' + count + ' on this phone'}</span>
    </span>
  );
}

function Chevron({ open }) {
  return <svg className={'dl-chevron' + (open ? ' is-open' : '')} viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5l6 6 6-6" /></svg>;
}

/**
 * A parent row: box, title, its line, its on-phone mark, and the disclosure.
 * @param {{ node: any, noun: string, wanted: Set<string>, off: any, open: boolean, onOpen: () => void,
 *   onBox: () => void, sub?: string, level: number, children?: any }} props
 */
function GroupRow({ node, noun, wanted, off, open, onOpen, onBox, sub, level, children }) {
  const s = statsOf(off, node.units);
  const state = checkState(node, wanted);
  // listen.html au-dlpick: a collection ticked whole says "All 29 recordings · 238 MB".
  const line = sub != null ? sub : (state === 'all' && s.count > 1 && noun === 'recording' ? 'All ' : '') + statsLine(s, noun);
  const removing = node.units.filter((u) => !wanted.has(u.id) && unitHeld(off, u)).length;
  const panel = 'dl-panel-' + node.id.replace(/[^a-z0-9]+/gi, '-');
  return (
    <div className={'dl-group dl-level-' + level + (open ? ' is-open' : '')}>
      <div className="dl-row">
        <Box state={state} removing={removing > 0} label={node.title} onClick={onBox} />
        <button type="button" className="dl-row-main" onClick={onOpen} aria-expanded={open} aria-controls={panel}>
          <span className="dl-row-copy">
            <strong>{node.title}</strong>
            <small>{line}</small>
            {state === 'none' && removing && removing === s.here ? <em className="dl-remove-note">Will be removed</em>
              : removing ? <em className="dl-remove-note">{removing + ' will be removed'}</em>
              : <PhoneMark here={s.here} count={s.count} />}
          </span>
          <Chevron open={open} />
        </button>
      </div>
      {open ? <div className="dl-children" id={panel}>{children}</div> : null}
    </div>
  );
}

/** "Will be removed", or "Will be cancelled" for one only on its way (defect 28). @param {any} off @param {any[]} tracks */
function _leaveWords(off, tracks) {
  return tracks.some((t) => off.statusOf(t.url) === 'saved') ? 'Will be removed' : 'Will be cancelled';
}

/** Where one reading's tracks stand: the bytes on their way, Waiting, Will try again, or ''. @param {any} off @param {any[]} tracks */
function _movingOf(off, tracks) {
  let moving = '';
  for (const t of tracks) {
    const st = off.statusOf(t.url);
    const p = st === 'downloading' && typeof off.progressOf === 'function' ? off.progressOf(t.url) : null;
    if (p && p.total > 0) return 'Downloading ' + Math.floor((p.bytes / p.total) * 100) + '%';
    if (st === 'downloading' || st === 'queued') moving = moving || 'Waiting';
    if (st === 'failed') moving = moving || 'Will try again';
  }
  return moving;
}

/**
 * A reader's name as a small label: the reading Apply fetches, in brick-free gold; one the chosen voice did not read
 * says so. @param {{ reader: string, fallback?: boolean, voice?: string }} props
 */
function ReaderTag({ reader, fallback, voice }) {
  const name = readerName(reader);
  if (!name) return null;
  return (
    <span className={'dl-reader' + (fallback ? ' is-fallback' : '')}
      title={fallback && voice ? 'No ' + readerName(voice) + ' reading of this letter' : undefined}>
      {name}{fallback && voice ? <span className="sr-only">{', no ' + readerName(voice) + ' reading'}</span> : null}
    </span>
  );
}

/**
 * One letter: box, title, the reader of the reading Apply fetches, "1 of 2 parts · 14 min · 11 MB" or "Will be
 * removed"; with more than one reading, a tick per reading (dl-rework A: one can be added or removed by itself).
 * @param {{ unit: any, wanted: Set<string>, off: any, onBox: () => void, onReading: (reader: string) => void, voice: string, num?: number }} props
 */
function UnitRow({ unit, wanted, off, onBox, onReading, voice, num }) {
  const on = wanted.has(unit.id);
  const removing = !on && unitHeld(off, unit);
  const s = statsOf(off, [unit]);
  const readings = readingsOf(unit);
  const held = readings.filter((r) => readingOnPhone(off, r)).map((r) => r.reader);
  // A tick per reading where it matters: a voice is chosen, or a reading is on the phone already (au-dlpick shows
  // plain rows in the one Listen plays).
  const many = readings.length > 1 && !!unit.reader && (!!voice || held.length > 0);
  const part = partsOnPhone(off, unit);
  const parts = part.n > 1 ? (part.k && part.k < part.n ? part.k + ' of ' + part.n + ' parts on this phone' : part.n + ' parts') : '';
  // On its way (picture 08's row states): the bytes it has, or Waiting - never "Downloading 0%".
  const moving = _movingOf(off, readings.flatMap((r) => r.tracks));
  // The row's right side: its length ("2:10"), or where it stands while it moves (au-dlpick).
  const meta = [parts, moving || (s.seconds ? formatClock(s.seconds) : s.bytes ? formatBytes(s.bytes) : '')].filter(Boolean).join(' · ');
  return (
    <div className="dl-unit">
      <div className="dl-row">
        <Box state={on ? 'all' : 'none'} removing={removing} label={unit.title} onClick={onBox} />
        <button type="button" className="dl-row-main" onClick={onBox} tabIndex={-1} aria-hidden="true">
          {num ? <span className="dl-unit-num">{num}</span> : null}
          <span className="dl-unit-title">{unit.title}</span>
          {unit.reader && (voice || held.length) ? <ReaderTag reader={held.length && !on ? held[0] : unit.reader} fallback={unit.fallback && !held.length} voice={voice} /> : null}
          {removing ? <em className="dl-remove-note">{_leaveWords(off, readings.flatMap((r) => r.tracks))}</em> : <span className="dl-unit-meta">{meta}</span>}
        </button>
      </div>
      {many ? (
        <div className="dl-readings" role="group" aria-label={unit.title + ' readings'}>
          {readings.map((r) => {
            const id = readingId(unit, r.reader);
            const ticked = wanted.has(id) || (on && !readings.some((x) => wanted.has(readingId(unit, x.reader))) && r.tracks === unit.tracks);
            const here = readingHeld(off, r);
            const cls = here ? (ticked ? 'is-kept' : 'is-remove') : ticked ? 'is-add' : 'is-none';
            const said = here ? (ticked ? ', on this phone' : ', will be removed') : ticked ? ', to download' : '';
            return (
              <button key={id} type="button" className={'dl-reading ' + cls + (r.tracks === unit.tracks ? ' is-fetch' : '')}
                aria-pressed={ticked} aria-label={readerName(r.reader) + said} onClick={() => onReading(r.reader)}>
                {here && ticked ? <svg className="dl-reading-tick" viewBox="0 0 24 24" aria-hidden="true"><CheckGlyph /></svg> : null}
                {readerName(r.reader)}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A book's chapters as a chip grid (brief 3c): a tap toggles one; Range, then the first and last, ticks a run; a long
 * press starts a range too. On the phone = a tick on a quiet fill; picked to add = the strong gold (hub 03:14).
 * @param {{ book: any, wanted: Set<string>, setWanted: (next: Set<string>) => void, off: any }} props
 */
function ChapterGrid({ book, wanted, setWanted, off }) {
  const [ranging, setRanging] = React.useState(false);
  const [from, setFrom] = React.useState(/** @type {string | null} */ (null));
  const timer = React.useRef(/** @type {any} */ (null));
  const pressed = React.useRef(false);
  const n = book.units.length;
  const all = checkState(book, wanted) === 'all';
  const start = (/** @type {string} */ id) => {
    pressed.current = false;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { pressed.current = true; setRanging(true); setFrom(id); }, LONG_PRESS_MS);
  };
  const stop = () => clearTimeout(timer.current);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const tap = (/** @type {any} */ u) => {
    if (pressed.current) { pressed.current = false; return; }
    if (!ranging) { setWanted(toggleNode({ units: [u] }, wanted)); return; }
    if (!from) { setFrom(u.id); return; }
    setWanted(selectRange(book.units, from, u.id, wanted));
    setRanging(false);
    setFrom(null);
  };
  return (
    <div className="dl-chapters">
      <div className="dl-chapters-head">
        <button type="button" className={'dl-range' + (ranging ? ' is-on' : '')} aria-pressed={ranging}
          onClick={() => { setRanging(!ranging); setFrom(null); }}>Range</button>
        <span className="dl-chapters-hint" aria-live="polite">
          {ranging ? (from ? 'Now tap the last chapter' : 'Tap the first and last chapter') : 'Tap a chapter to tick it'}
        </span>
        <button type="button" className="dl-link" onClick={() => setWanted(toggleNode(book, wanted))}>
          {all ? 'Untick all ' + n : 'Select all ' + n}
        </button>
      </div>
      <div className="dl-chip-grid" role="group" aria-label={book.title + ' chapters'}>
        {book.units.map((/** @type {any} */ u) => {
          const on = wanted.has(u.id);
          const here = unitHeld(off, u);
          const cls = here ? (on ? 'is-kept' : 'is-remove') : on ? 'is-add' : 'is-none';
          const said = here ? (on ? ', on this phone' : ', will be removed') : on ? ', to download' : '';
          return (
            <button key={u.id} type="button" className={'dl-chip ' + cls + (from === u.id ? ' is-from' : '')}
              aria-pressed={on} aria-label={'Chapter ' + u.chapter + said}
              onClick={() => tap(u)} onPointerDown={() => start(u.id)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
              onContextMenu={(e) => e.preventDefault()}>
              {u.chapter}
              {here && on ? <svg className="dl-chip-tick" viewBox="0 0 24 24" aria-hidden="true"><CheckGlyph /></svg> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TrashIcon() {
  return <svg className="offline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14" /><path d="M9 7V5h6v2" /><path d="M7 7l1 12h8l1-12" /><path d="M10.5 10.5v5.5" /><path d="M13.5 10.5v5.5" /></svg>;
}

/**
 * A bottom sheet in the app's select-sheet grammar (both Downloads tabs).
 * @param {{ id: string, title: string, onClose: () => void, children: any }} props
 */
export function Sheet({ id, title, onClose, children }) {
  useModalRegistry({ id, dismiss: onClose, active: true });
  const trapRef = useFocusTrap(true);
  return (
    <>
      <div className="select-sheet-backdrop open" aria-hidden="true" onClick={onClose} />
      <div id={id} className="select-sheet dl-sheet" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby={id + '-t'}>
        <SheetHandle onClose={onClose} />
        <div className="select-sheet-title dl-sheet-title" id={id + '-t'}>{title}</div>
        {children}
      </div>
    </>
  );
}

/** @param {any[]} units @param {any} off bytes still to download (or held to free, for removals) */
function _bytesOf(units, off, saved) {
  let n = 0;
  for (const u of units) for (const t of u.tracks) if ((off.statusOf(t.url) === 'saved') === saved) n += off.sizeOf(t.url) || 0;
  return n;
}

/**
 * "41 in Benjamin's voice · 709 in another reading (67 Timothy, 642 text-to-speech)": what a voice does to the letters
 * being added (dl-rework C). '' with no voice chosen or no letters among them.
 * @param {any[]} add the plan's entries @param {string} voice
 */
export function splitWords(add, voice) {
  const letters = add.filter((u) => u && typeof u.id === 'string' && !u.chapter && u.reader);
  if (!voice || !letters.length) return '';
  const s = voiceSplit(letters, voice);
  const mine = s.voice ? s.voice.toLocaleString('en-US') + ' in ' + readerName(voice) + '’s voice' : 'None in ' + readerName(voice) + '’s voice';
  return s.other ? mine + ' · ' + s.other.toLocaleString('en-US') + ' in another reading (' + byReaderWords(s.byReader) + ')' : mine;
}

/**
 * The one confirm before anything is added or removed (brief 3c, picture 06).
 * @param {{ plan: any, groups: any[], off: any, free: number, voice: string, onCancel: () => void, onApply: () => void }} props
 */
function ApplySheet({ plan, groups, off, free, voice, onCancel, onApply }) {
  const add = groupPicked(groups, plan.add);
  const remove = groupPicked(groups, plan.remove);
  const split = splitWords(plan.add, voice);
  const title = add.length && remove.length ? 'Download and remove?' : add.length ? 'Download these?' : 'Remove these?';
  const size = plan.addBytes != null ? formatBytes(plan.addBytes) : plan.addKnown ? 'at least ' + formatBytes(plan.addKnown) : '';
  const after = free >= 0 && plan.addBytes != null ? free - plan.addBytes + plan.removeBytes : -1;
  const summary = [
    add.length && size ? 'Downloads ' + size : '',
    remove.length && plan.removeBytes ? 'frees ' + formatBytes(plan.removeBytes) : '',
    after > 0 ? formatBytes(after) + ' left after' : '',
  ].filter(Boolean).join(' · ');
  const line = (/** @type {any} */ g, /** @type {boolean} */ saved) => {
    const bytes = _bytesOf(g.units, off, saved);
    // Removing what is only on its way cancels it (defect 28: it read as a removal of something on the phone).
    const onItsWay = saved && !bytes ? 'on their way: cancelled' : '';
    return [countOf(g.units.length, g.noun), formatBytes(bytes), onItsWay].filter(Boolean).join(' · ');
  };
  return (
    <Sheet id="dl-apply-sheet" title={title} onClose={onCancel}>
      <div className="dl-sheet-body">
        {split ? <p className="dl-sheet-split">{split}</p> : null}
        {add.length ? <div className="dl-sheet-kicker">Add</div> : null}
        {add.map((g) => (
          <div key={'a' + g.id} className="dl-sheet-row"><DownloadIcon /><span><strong>{g.label}</strong><small>{line(g, false)}</small></span></div>
        ))}
        {remove.length ? <div className="dl-sheet-kicker is-remove">Remove</div> : null}
        {remove.map((g) => (
          <div key={'r' + g.id} className="dl-sheet-row is-remove"><TrashIcon /><span><strong>{g.label}</strong><small>{line(g, true)}</small></span></div>
        ))}
      </div>
      {summary ? <p className="dl-sheet-summary">{summary}</p> : null}
      <div className="dl-sheet-actions">
        <button type="button" className="ui-btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="ui-btn is-primary" onClick={onApply} data-autofocus>Apply</button>
      </div>
    </Sheet>
  );
}

/**
 * Over 100 MB on mobile data (brief 3e, picture 07).
 * @param {{ size: string, onWait: () => void, onNow: () => void, onCancel: () => void }} props
 */
function MobileSheet({ size, onWait, onNow, onCancel }) {
  return (
    <Sheet id="dl-mobile-sheet" title={'Download ' + size + ' on mobile data?'} onClose={onCancel}>
      <p className="dl-sheet-summary">The phone is not on Wi-Fi. Waiting starts it by itself once it is.</p>
      <div className="dl-sheet-actions">
        <button type="button" className="ui-btn" onClick={onWait} data-autofocus>Wait for Wi-Fi</button>
        <button type="button" className="ui-btn is-primary" onClick={onNow}>Download now</button>
      </div>
    </Sheet>
  );
}

/**
 * The sticky footer (brief 3c, picture 05): what Apply adds and removes, the free space, and the one button.
 * @param {{ plan: any, free: number, onApply: () => void }} props
 */
function Footer({ plan, free, onApply }) {
  const nounOf = (/** @type {any[]} */ us) => (us.length && us.every((u) => u.chapter) ? 'chapter' : 'recording');
  const adding = plan.add.length > 0;
  const removing = plan.remove.length > 0;
  const size = plan.addBytes != null ? formatBytes(plan.addBytes) : plan.addKnown ? 'at least ' + formatBytes(plan.addKnown) : '';
  const short = plan.addBytes != null ? roomShort(free, plan.addBytes, plan.removeBytes, SPACE_MARGIN) : 0;
  const freeText = free >= 0 ? formatBytes(free) + ' free' : '';
  const both = adding && removing;
  // listen.html au-dlpick: "29 recordings · 238 MB" over "10.7 GB free on this phone", and Download.
  const addLine = adding
    ? [both ? 'Add ' + plan.add.length.toLocaleString('en-US') : countOf(plan.add.length, nounOf(plan.add)), size].filter(Boolean).join(' · ')
    : '';
  const removeLine = removing
    ? ['Remove ' + (both ? plan.remove.length.toLocaleString('en-US') : countOf(plan.remove.length, nounOf(plan.remove))),
      plan.removeBytes ? formatBytes(plan.removeBytes) : ''].filter(Boolean).join(' · ')
    : '';
  const line1 = addLine || removeLine;
  /** @type {any} */
  let line2 = freeText ? freeText + ' on this phone' : '';
  if (short) line2 = <span className="dl-footer-warn">{'Needs ' + formatBytes(short) + ' more room. Untick some, or remove downloads you’ve finished.'}</span>;
  else if (both) line2 = <><span className="dl-footer-warn">{removeLine}</span>{freeText ? ' · ' + freeText : ''}</>;
  const label = short || removing ? 'Apply' : 'Download';
  return (
    <div className="dl-footer" role="region" aria-label="What Apply does">
      <div className="dl-footer-text"><p>{line1}</p>{line2 ? <p className="dl-footer-sub">{line2}</p> : null}</div>
      <button type="button" className="dl-footer-go" disabled={!!short} onClick={onApply}>{label}</button>
    </div>
  );
}

/**
 * The letter voice: Settings > Letter Voice itself (one saved setting), and what it does to the letters, said before
 * any tap from the data. Above the groups, so it stays in view when they fold (dl-rework B, C).
 * @param {{ voice: string, pick: string, onPick: (code: string) => void, units: any[], only: boolean, onOnly: (on: boolean) => void }} props
 *   units = every letter as the tree builds it in this voice (the "only" switch off); pick = the sheet's choice
 */
function VoiceBar({ voice, pick, onPick, units, only, onOnly }) {
  const s = voiceSplit(units, voice);
  const name = readerName(voice);
  let line = '';
  if (units.length) {
    if (!voice) {
      line = 'Each letter downloads in its default reading: ' + byReaderWords(s.byReader) + '.';
    } else {
      line = (s.voice ? name + ' reads ' + countOf(s.voice, 'letter') + '.' : name + ' reads none of these letters.')
        + (s.other ? ' The other ' + s.other.toLocaleString('en-US') + ' will download in their default reading (' + byReaderWords(s.byReader) + ').' : '');
    }
  }
  // listen.html au-dl / au-dlvoice: one row, "Voice to download · The one Listen plays", its own short sheet. The
  // choice is this download's ('' = the Letter voice setting, W3 decision); what it does is said once a voice is named.
  const [picking, setPicking] = React.useState(false);
  const options = downloadVoiceOptions(null);
  const shown = (options.find((o) => o.id === pick) || options[0]).label;
  return (
    <>
      <ListGroup className="dl-voice-group" ariaLabel="Voice to download">
        <ListRow noLead one title="Voice to download" value={shown} onClick={() => setPicking(true)} />
        {voice && s.voice && s.other ? (
          <ListRow noLead one title={'Only letters ' + name + ' reads'} switchOn={only} onClick={() => onOnly(!only)} />
        ) : null}
      </ListGroup>
      {voice && line ? <p className="dl-voice-line" id="dl-voice-line">{line}</p> : null}
      <SelectSheet open={picking} onClose={() => setPicking(false)} title="Voice to download" value={pick}
        options={options} onChange={(id) => { onPick(id); setPicking(false); }} />
    </>
  );
}

/**
 * The Choose tab.
 * @param {{ off: any, bibleAudio?: string, focus?: string | null, letterReader?: string, after?: any }} props
 *   bibleAudio = Settings' Bible Audio choice (the edition chip picked first); focus = a collection or edition volKey
 *   to open the tree at (a header's "Choose…"); letterReader = Settings' Letter Voice, the voice a download takes
 *   unless its own sheet names another (W3b); after = what sits above the foot bar (the By themselves group)
 */
export function DownloadChooser({ off, bibleAudio, focus, letterReader, after = null }) {
  const lengthsStore = typeof AudioLengths !== 'undefined' ? AudioLengths.lengthsStore : null;
  useStoreVersion(lengthsStore);
  React.useEffect(() => {
    if (typeof AudioLengths !== 'undefined' && typeof AudioLengths.lengthsReady === 'function') void AudioLengths.lengthsReady();
  }, []);
  // The sheet's voice, else the one Listen plays (the Letter voice setting).
  const [pick, setPick] = React.useState('');
  const voice = pick || (letterReader && letterReader !== 'auto' && readerName(letterReader) ? letterReader : '');
  const [onlyVoice, setOnlyVoice] = React.useState(false);
  const only = !!voice && onlyVoice;
  const { tvot: tvotAll, bibles, studies } = useDownloadTrees({ voice });
  const tvotOnly = React.useMemo(() => (only ? {
    ...tvotAll,
    children: (tvotAll.children || []).map((c) => ({ ...c, units: c.units.filter((u) => !u.fallback) })).filter((c) => c.units.length),
    units: tvotAll.units.filter((u) => !u.fallback),
  } : tvotAll), [tvotAll, only]);
  const tvot = tvotOnly;
  const editions = bibles;
  const firstEdition = () => {
    const byFocus = editions.find((b) => b.edition.volKey === focus);
    const bySetting = editions.find((b) => b.id === bibleAudio);
    return (byFocus || bySetting || editions[0] || { id: '' }).id || bibleAudio || '';
  };
  const [editionId, setEditionId] = React.useState(firstEdition);
  const allUnits = React.useMemo(() => [...tvot.units, ...bibles.flatMap((b) => b.tree.units), ...studies.units], [tvot, bibles, studies]);
  // The leaves the confirm sheet groups by: collections and books. A book names its edition when more than one is offered.
  const groups = React.useMemo(() => [
    ...tvot.children || [],
    ...bibles.flatMap((b) => (b.tree.children || []).flatMap((tm) => (tm.children || []).map((book) => (
      bibles.length > 1 ? { ...book, suffix: b.edition.short || '' } : book)))),
    ...studies.children || [],
  ], [tvot, bibles, studies]);

  // The ticks: what is held now, with the listener's changes over it (so a download finishing keeps its tick, and an
  // edit the phone has caught up with changes nothing).
  const [edits, setEdits] = React.useState(() => /** @type {Map<string, boolean>} */ (new Map()));
  const base = initialWanted(off, allUnits);
  const wanted = new Set(base);
  for (const [id, on] of edits) { if (on) wanted.add(id); else wanted.delete(id); }
  // An edit the phone has caught up with is over (an Apply carried it out): dropped, so taking that letter off the
  // phone later does not bring the old tick back.
  const settled = [...edits].some(([id, on]) => on === base.has(id));
  React.useEffect(() => {
    if (settled) setEdits((prev) => new Map([...prev].filter(([id, on]) => on !== base.has(id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- base is rebuilt every render; `settled` says when it matters
  }, [settled]);
  // Letter ids and reading ids (`<letter>@<reader>`) alike: every id either side holds.
  const setWanted = (/** @type {Set<string>} */ next) => {
    const e = new Map();
    for (const id of new Set([...base, ...next])) { const on = next.has(id); if (on !== base.has(id)) e.set(id, on); }
    setEdits(e);
  };

  const [open, setOpen] = React.useState(() => {
    const s = new Set(['tvot', 'bible']);
    if (focus) {
      s.add(focus);
      const b = bibles.find((x) => x.edition.volKey === focus);
      if (b) s.delete('tvot');
      else if (focus.lastIndexOf('study:', 0) === 0) { s.add('studies'); s.delete('tvot'); s.delete('bible'); }
      else s.delete('bible');
    }
    return s;
  });
  const flip = (/** @type {string} */ id) => setOpen((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  const focusRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  React.useEffect(() => {
    const el = focusRef.current && focus ? focusRef.current.querySelector('[data-node="' + focus + '"]') : null;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, at the opening the focus came with
  }, []);

  const plan = planOf(off, allUnits, wanted, _secondsOf, voice);
  const free = off.freeBytes();
  const [asking, setAsking] = React.useState(/** @type {'' | 'apply' | 'mobile'} */ (''));

  const run = (/** @type {boolean} */ now) => {
    const removeUrls = [];
    const cancelUrls = [];
    for (const u of plan.remove) for (const t of u.tracks) {
      const s = off.statusOf(t.url);
      if (s === 'saved') removeUrls.push(t.url); else if (s === 'queued' || s === 'downloading' || s === 'failed') cancelUrls.push(t.url);
    }
    if (cancelUrls.length) off.cancel(cancelUrls);
    if (removeUrls.length) off.remove(removeUrls);
    const items = [];
    for (const u of plan.add) for (const t of u.tracks) {
      const s = off.statusOf(t.url);
      if (s !== 'saved' && s !== 'queued' && s !== 'downloading') items.push(_item(t, u.name));
    }
    if (items.length) {
      // One letter or chapter by itself goes ahead of a set already downloading (dl-rework D).
      if (now) off.download(items, { priority: plan.add.length === 1 ? 'tap' : 'bulk' });
      else holdForWifi(off, items);
    }
    if (!now) setEdits(new Map());
    setAsking('');
  };
  const apply = () => {
    if (plan.add.length && (plan.addBytes || 0) > MOBILE_ASK_BYTES && networkType() === 'cellular') setAsking('mobile');
    else run(true);
  };

  const shownBible = bibles.find((b) => b.id === editionId) || bibles[0] || null;
  const held = React.useSyncExternalStore(subscribeHeld, heldForWifi);
  const unitRow = (/** @type {any} */ u, /** @type {number} */ num = 0) => (
    <UnitRow key={u.id} unit={u} wanted={wanted} off={off} voice={voice} num={num}
      onBox={() => setWanted(toggleNode({ units: [u] }, wanted))} onReading={(r) => setWanted(toggleReading(u, r, wanted))} />
  );
  const chipName = (/** @type {any} */ b) => {
    const r = readerName(_editionReader(b.tree));
    return (b.edition.short || b.edition.label) + (r ? ' · ' + r : '');
  };
  // listen.html au-dlbible: a testament says how much of it is ticked ("1 of 39 books · 206 MB").
  const testamentLine = (/** @type {any} */ tm) => {
    const books = tm.children || [];
    const picked = books.filter((b) => checkState(b, wanted) !== 'none').length;
    if (!picked) return countOf(books.length, 'book') + ' · ' + countOf(tm.units.length, 'chapter');
    const s = statsOf(off, tm.units.filter((u) => wanted.has(u.id)));
    return [picked + ' of ' + countOf(books.length, 'book'), s.bytes ? formatBytes(s.bytes) : ''].filter(Boolean).join(' · ');
  };
  const tvotAll2 = checkState(tvot, wanted) === 'all';
  const bibleWhole = shownBible ? checkState(shownBible.tree, wanted) : 'none';

  return (
    <div className="dl-choose" ref={focusRef}>
      {held ? <p className="dl-held">{'Waiting for Wi-Fi · ' + countOf(held, 'recording')}</p> : null}

      {tvotAll.units.length ? (
        <VoiceBar voice={voice} pick={pick} onPick={setPick} units={tvotAll.units} only={only} onOnly={setOnlyVoice} />
      ) : null}

      {/* W3b listen (au-dl, au-dlpick): the eyebrow and Select all, then one card of collections; a collection opens
          to its letters, each ticked by itself. */}
      {tvot.units.length ? (
        <section className="dl-part" aria-label="The Volumes of Truth">
          <SectionLabel aside={tvotAll2 ? 'Untick all' : only ? 'Select all ' + readerName(voice) + ' reads' : 'Select all'}
            onAside={() => setWanted(toggleNode(tvot, wanted))}>The Volumes of Truth</SectionLabel>
          <div className="ui-group dl-tree">
            {(tvot.children || []).map((col) => {
              const pre = _prefaceId(col.volKey);
              const at = pre && col.units[0] && col.units[0].id === pre ? 0 : 1;
              return (
                <div key={col.id} data-node={col.id}>
                  <GroupRow node={col} noun="recording" wanted={wanted} off={off} level={1}
                    open={open.has(col.id)} onOpen={() => flip(col.id)} onBox={() => setWanted(toggleNode(col, wanted))}>
                    {col.units.map((u, i) => unitRow(u, i + at))}
                  </GroupRow>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <p className="dl-loading">Loading the Volumes of Truth…</p>
      )}

      {shownBible ? (
        <section className="dl-part" aria-label="The Bible">
          <SectionLabel>The Bible</SectionLabel>
          {bibles.length > 1 ? (
            <div className="ui-chips dl-editions" role="group" aria-label="Bible edition">
              {bibles.map((b) => <Chip key={b.id} on={b.id === shownBible.id} onClick={() => setEditionId(b.id)}>{chipName(b)}</Chip>)}
            </div>
          ) : null}
          <div className="ui-group dl-tree" data-node={shownBible.edition.volKey}>
            <div className="dl-group dl-level-1">
              <div className="dl-row">
                <Box state={bibleWhole} label="Whole edition" onClick={() => setWanted(toggleNode(shownBible.tree, wanted))} />
                <button type="button" className="dl-row-main" onClick={() => setWanted(toggleNode(shownBible.tree, wanted))} tabIndex={-1} aria-hidden="true">
                  <span className="dl-row-copy"><strong>Whole edition</strong>
                    <small>{countOf((shownBible.tree.children || []).reduce((n, tm) => n + (tm.children || []).length, 0), 'book')}</small></span>
                </button>
              </div>
            </div>
            {(shownBible.tree.children || []).map((tm) => (
              <GroupRow key={tm.id} node={tm} noun="chapter" wanted={wanted} off={off} level={1}
                open={open.has(tm.id)} onOpen={() => flip(tm.id)} onBox={() => setWanted(toggleNode(tm, wanted))}
                sub={testamentLine(tm)}>
                {(tm.children || []).map((book) => (
                  <GroupRow key={book.id} node={book} noun="chapter" wanted={wanted} off={off} level={2}
                    open={open.has(book.id)} onOpen={() => flip(book.id)} onBox={() => setWanted(toggleNode(book, wanted))}>
                    <ChapterGrid book={book} wanted={wanted} setWanted={setWanted} off={off} />
                  </GroupRow>
                ))}
              </GroupRow>
            ))}
          </div>
        </section>
      ) : null}

      {studies.units.length ? (
        <section className="dl-part" aria-label="Studies">
          <SectionLabel>Studies</SectionLabel>
          <div className="ui-group dl-tree">
            {(studies.children || []).map((st) => (
              <div key={st.id} data-node={st.id}>
                <GroupRow node={st} noun="recording" wanted={wanted} off={off} level={1}
                  open={open.has(st.id)} onOpen={() => flip(st.id)} onBox={() => setWanted(toggleNode(st, wanted))}>
                  {st.units.map((u) => unitRow(u))}
                </GroupRow>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {after}
      {/* listen.html au-dl: no bar until something is ticked or unticked */}
      {plan.add.length || plan.remove.length ? <Footer plan={plan} free={free} onApply={() => setAsking('apply')} /> : null}
      {asking === 'apply' ? (
        <ApplySheet plan={plan} groups={groups} off={off} free={free} voice={voice} onCancel={() => setAsking('')} onApply={apply} />
      ) : null}
      {asking === 'mobile' ? (
        <MobileSheet size={formatBytes(plan.addBytes || plan.addKnown)} onCancel={() => setAsking('')}
          onWait={() => run(false)} onNow={() => run(true)} />
      ) : null}
    </div>
  );
}

/** A collection's preface as a unit id ('' when it has none): the preface carries no number (au-dlpick). @param {string} volKey */
function _prefaceId(volKey) {
  const c = typeof COLLECTIONS !== 'undefined' ? COLLECTIONS.find((/** @type {any} */ x) => x && x.volKey === volKey) : null;
  const pre = c && typeof colPreface === 'function' ? colPreface(c) : null;
  return pre && pre.id ? volKey + ':' + pre.id : '';
}
