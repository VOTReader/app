/* ═══════════════════════════════════════════════════════════════════════
   DownloadChooser — the Downloads screen's Choose tab (downloads brief 2026-10-23, D3; 3b, 3c, 3e)
   ═══════════════════════════════════════════════════════════════════════
   Built to the dl-mock pictures (D:/Swarm/calls/downloads-mockups/ 03-07, 20): The Volumes of Truth by collection
   and letter, the Bible by edition, testament, book and a chapter grid; a tick means "on this phone after Apply",
   so what is on the phone starts ticked and an untick reads "Will be removed". The footer totals what Apply does;
   Apply asks once with what is added and removed, and over 100 MB on mobile data it asks about Wi-Fi first.

   The tree logic is utils/download-tree.js. Globals read at call time, as the other Cluster H screens do:
   OfflineAudio's store comes in as `off`; AudioPlayer, COLLECTIONS, colPreface/colLetterArr (the lazy VOT
   corpus), BIBLE_AUDIO_EDITIONS/BOOKS, AUDIO_READERS, AudioLengths, useFocusTrap and useModalRegistry.
   ═══════════════════════════════════════════════════════════════════════ */

import { formatBytes, DownloadIcon, SPACE_MARGIN } from './OfflineAudioControls.jsx';
import { SheetHandle } from './SheetHandle.jsx';
import { networkType } from '../../utils/download-gate.js';
import {
  buildTvot, buildBible, buildStudies, checkState, toggleNode, selectRange, initialWanted, planOf, roomShort, groupPicked,
  countOf, formatLength, unitOnPhone, unitHeld,
} from '../../utils/download-tree.js';

/** On mobile data, an Apply past this asks first (brief 3e). */
const MOBILE_ASK_BYTES = 100e6;
/** Letters a collection shows before "Show all 30" (picture 03). */
const LETTERS_SHOWN = 4;
/** A press this long on a chapter starts a range from it (brief 3c). */
const LONG_PRESS_MS = 500;

const _noSub = () => () => {};
const _zero = () => 0;

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

/** "30 recordings · 232 MB · 6 h 10 min" @param {ReturnType<typeof statsOf>} s @param {string} noun */
function statsLine(s, noun) {
  return [countOf(s.count, noun), s.bytes ? formatBytes(s.bytes) : '', formatLength(s.seconds)].filter(Boolean).join(' · ');
}

/** The download list item for one track, named as the rows' own Download names it ("Christmas · Part 2"). */
function _item(/** @type {any} */ t, /** @type {string} */ name) {
  return { url: t.url, key: t.key || '', title: name + (t.partLabel ? ' · ' + t.partLabel : '') };
}

/**
 * A plan held for Wi-Fi ("Wait for Wi-Fi", brief 3e): in a browser that reports its connection, it starts once the
 * connection is no longer mobile data. One at a time; a newer plan replaces it.
 */
let _held = /** @type {null | { off: any, items: any[], onChange: () => void }} */ (null);
function _connection() {
  const n = typeof navigator !== 'undefined' ? /** @type {any} */ (navigator) : null;
  return n ? n.connection || n.mozConnection || n.webkitConnection || null : null;
}
function _onConnection() {
  if (!_held || networkType() === 'cellular') return;
  const h = _held;
  _held = null;
  const c = _connection();
  if (c && typeof c.removeEventListener === 'function') c.removeEventListener('change', _onConnection);
  h.off.download(h.items);
  h.onChange();
}
/** @param {any} off @param {any[]} items @param {() => void} onChange */
function holdForWifi(off, items, onChange) {
  const c = _connection();
  _held = { off, items, onChange };
  if (c && typeof c.addEventListener === 'function') c.addEventListener('change', _onConnection);
}
/** @returns {number} recordings held for Wi-Fi now */
export function heldForWifi() {
  return _held ? _held.items.length : 0;
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
      <span className="dl-box-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24">{state === 'all' ? <CheckGlyph /> : state === 'some' ? <path d="M7 12h10" /> : null}</svg>
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
  const removing = node.units.filter((u) => !wanted.has(u.id) && unitHeld(off, u)).length;
  const panel = 'dl-panel-' + node.id.replace(/[^a-z0-9]+/gi, '-');
  return (
    <div className={'dl-group dl-level-' + level + (open ? ' is-open' : '')}>
      <div className="dl-row">
        <Box state={state} removing={removing > 0} label={node.title} onClick={onBox} />
        <button type="button" className="dl-row-main" onClick={onOpen} aria-expanded={open} aria-controls={panel}>
          <span className="dl-row-copy">
            <strong>{node.title}</strong>
            <small>{sub != null ? sub : statsLine(s, noun)}</small>
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

/**
 * One letter: box, title, "2 parts · 14 min · 11 MB" or "Will be removed".
 * @param {{ unit: any, wanted: Set<string>, off: any, onBox: () => void }} props
 */
function UnitRow({ unit, wanted, off, onBox }) {
  const on = wanted.has(unit.id);
  const removing = !on && unitHeld(off, unit);
  const s = statsOf(off, [unit]);
  const parts = unit.tracks.length > 1 ? unit.tracks.length + ' parts' : '';
  // On its way (picture 08's row states): the bytes it has, or Waiting - never "Downloading 0%".
  let moving = '';
  for (const t of unit.tracks) {
    const st = off.statusOf(t.url);
    const p = st === 'downloading' && typeof off.progressOf === 'function' ? off.progressOf(t.url) : null;
    if (p && p.total > 0) { moving = 'Downloading ' + Math.floor((p.bytes / p.total) * 100) + '%'; break; }
    if (st === 'downloading' || st === 'queued') moving = moving || 'Waiting';
  }
  const meta = [parts, moving, formatLength(s.seconds), s.bytes ? formatBytes(s.bytes) : ''].filter(Boolean).join(' · ');
  return (
    <div className="dl-row dl-unit">
      <Box state={on ? 'all' : 'none'} removing={removing} label={unit.title} onClick={onBox} />
      <button type="button" className="dl-row-main" onClick={onBox} tabIndex={-1} aria-hidden="true">
        <span className="dl-unit-title">{unit.title}</span>
        {removing ? <em className="dl-remove-note">Will be removed</em> : <span className="dl-unit-meta">{meta}</span>}
      </button>
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
 * The one confirm before anything is added or removed (brief 3c, picture 06).
 * @param {{ plan: any, groups: any[], off: any, free: number, onCancel: () => void, onApply: () => void }} props
 */
function ApplySheet({ plan, groups, off, free, onCancel, onApply }) {
  const add = groupPicked(groups, plan.add);
  const remove = groupPicked(groups, plan.remove);
  const title = add.length && remove.length ? 'Download and remove?' : add.length ? 'Download these?' : 'Remove these?';
  const size = plan.addBytes != null ? formatBytes(plan.addBytes) : plan.addKnown ? 'at least ' + formatBytes(plan.addKnown) : '';
  const after = free >= 0 && plan.addBytes != null ? free - plan.addBytes + plan.removeBytes : -1;
  const summary = [
    add.length && size ? 'Downloads ' + size : '',
    remove.length && plan.removeBytes ? 'frees ' + formatBytes(plan.removeBytes) : '',
    after > 0 ? formatBytes(after) + ' left after' : '',
  ].filter(Boolean).join(' · ');
  const line = (/** @type {any} */ g, /** @type {boolean} */ saved) =>
    [countOf(g.units.length, g.noun), formatBytes(_bytesOf(g.units, off, saved))].filter(Boolean).join(' · ');
  return (
    <Sheet id="dl-apply-sheet" title={title} onClose={onCancel}>
      <div className="dl-sheet-body">
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
        <button type="button" className="offline-confirm-cancel" onClick={onCancel}>Cancel</button>
        <button type="button" className="offline-confirm-go" onClick={onApply} data-autofocus>Apply</button>
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
        <button type="button" className="offline-confirm-cancel" onClick={onWait} data-autofocus>Wait for Wi-Fi</button>
        <button type="button" className="offline-confirm-go" onClick={onNow}>Download now</button>
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
  const addLine = adding
    ? ['Add ' + (both ? plan.add.length.toLocaleString('en-US') : countOf(plan.add.length, nounOf(plan.add))), size,
      short ? '' : formatLength(plan.addSeconds)].filter(Boolean).join(' · ')
    : '';
  const removeLine = removing
    ? ['Remove ' + (both ? plan.remove.length.toLocaleString('en-US') : countOf(plan.remove.length, nounOf(plan.remove))),
      plan.removeBytes ? formatBytes(plan.removeBytes) : ''].filter(Boolean).join(' · ')
    : '';
  let line1 = addLine || removeLine || 'Tick what you want on this phone';
  /** @type {any} */
  let line2 = freeText ? freeText + ' on this phone' : '';
  if (short) line2 = <span className="dl-footer-warn">{'Needs ' + formatBytes(short) + ' more room. Untick some, or remove downloads you’ve finished.'}</span>;
  else if (both) line2 = <><span className="dl-footer-warn">{removeLine}</span>{freeText ? ' · ' + freeText : ''}</>;
  const label = short || removing ? 'Apply' : adding ? 'Download' + (plan.addBytes ? ' ' + formatBytes(plan.addBytes) : '') : 'Download';
  return (
    <div className="dl-footer" role="region" aria-label="What Apply does">
      <div className="dl-footer-text"><p>{line1}</p>{line2 ? <p className="dl-footer-sub">{line2}</p> : null}</div>
      <button type="button" className="dl-footer-go" disabled={!!short || !(adding || removing)} onClick={onApply}>{label}</button>
    </div>
  );
}

/**
 * The Choose tab.
 * @param {{ off: any, bibleAudio?: string, focus?: string | null }} props
 *   bibleAudio = Settings' Bible Audio choice (the edition chip picked first); focus = a collection or edition volKey
 *   to open the tree at (a header's "Choose…")
 */
export function DownloadChooser({ off, bibleAudio, focus }) {
  const corpus = useCorpusVersion();
  const lengthsStore = typeof AudioLengths !== 'undefined' ? AudioLengths.lengthsStore : null;
  React.useSyncExternalStore(lengthsStore ? lengthsStore.subscribe : _noSub, lengthsStore ? lengthsStore.getVersion : _zero);
  React.useEffect(() => {
    const w = /** @type {any} */ (window);
    if (typeof w.__loadVotCorpus === 'function') void w.__loadVotCorpus();
    if (typeof AudioLengths !== 'undefined' && typeof AudioLengths.lengthsReady === 'function') void AudioLengths.lengthsReady();
  }, []);
  const [voice, setVoice] = React.useState('');
  const editions = React.useMemo(() => (typeof BIBLE_AUDIO_EDITIONS !== 'undefined'
    ? Object.entries(BIBLE_AUDIO_EDITIONS).filter(([, e]) => typeof bibleAudioOffered !== 'function' || bibleAudioOffered(e)) : []), []);
  const firstEdition = () => {
    const byFocus = editions.find(([, e]) => e.volKey === focus);
    const bySetting = editions.find(([id]) => id === bibleAudio);
    return (byFocus || bySetting || editions[0] || [''])[0];
  };
  const [editionId, setEditionId] = React.useState(firstEdition);

  const tvot = React.useMemo(() => buildTvot({
    collections: typeof COLLECTIONS !== 'undefined' ? COLLECTIONS.filter((/** @type {any} */ c) => c.cardId) : [],
    itemsOf: (col) => {
      const pre = typeof colPreface === 'function' ? colPreface(col) : null;
      const letters = typeof colLetterArr === 'function' ? colLetterArr(col) || [] : [];
      return pre ? [pre, ...letters] : letters;
    },
    player: AudioPlayer,
    voice,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- corpus: the letters arrive with the lazy corpus, read from globals
  }), [corpus, voice]);
  const bibles = React.useMemo(() => editions.map(([id, e]) => ({
    id, edition: e, tree: buildBible({ edition: e, books: typeof BIBLE_AUDIO_BOOKS !== 'undefined' ? BIBLE_AUDIO_BOOKS : [], player: AudioPlayer }),
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
    studies: typeof BIBLE_STUDIES !== 'undefined' && Array.isArray(BIBLE_STUDIES) ? BIBLE_STUDIES : [], player: AudioPlayer,
  // eslint-disable-next-line react-hooks/exhaustive-deps -- studiesIn, corpus: the registry and manifest are read from globals
  }), [studiesIn, corpus]);
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
  const setWanted = (/** @type {Set<string>} */ next) => {
    const e = new Map();
    for (const u of allUnits) { const on = next.has(u.id); if (on !== base.has(u.id)) e.set(u.id, on); }
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
  const [showAll, setShowAll] = React.useState(() => new Set());
  const focusRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  React.useEffect(() => {
    const el = focusRef.current && focus ? focusRef.current.querySelector('[data-node="' + focus + '"]') : null;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, at the opening the focus came with
  }, []);

  const plan = planOf(off, allUnits, wanted, _secondsOf);
  const free = off.freeBytes();
  const [asking, setAsking] = React.useState(/** @type {'' | 'apply' | 'mobile'} */ (''));
  const [, setHeldTick] = React.useState(0);

  const run = (/** @type {boolean} */ now) => {
    const removeUrls = [];
    const cancelUrls = [];
    for (const u of plan.remove) for (const t of u.tracks) {
      const s = off.statusOf(t.url);
      if (s === 'saved') removeUrls.push(t.url); else if (s === 'queued' || s === 'downloading') cancelUrls.push(t.url);
    }
    if (cancelUrls.length) off.cancel(cancelUrls);
    if (removeUrls.length) off.remove(removeUrls);
    const items = [];
    for (const u of plan.add) for (const t of u.tracks) {
      const s = off.statusOf(t.url);
      if (s !== 'saved' && s !== 'queued' && s !== 'downloading') items.push(_item(t, u.name));
    }
    if (items.length) {
      if (now) off.download(items);
      else holdForWifi(off, items, () => setHeldTick((n) => n + 1));
    }
    if (!now) setEdits(new Map());
    setAsking('');
  };
  const apply = () => {
    if (plan.add.length && (plan.addBytes || 0) > MOBILE_ASK_BYTES && networkType() === 'cellular') setAsking('mobile');
    else run(true);
  };

  const shownBible = bibles.find((b) => b.id === editionId) || bibles[0] || null;
  const tvotHere = statsOf(off, tvot.units).here;
  const bibleHere = bibles.reduce((n, b) => n + statsOf(off, b.tree.units).here, 0);
  const studiesHere = statsOf(off, studies.units).here;
  const readerNames = /** @type {any} */ (globalThis).AUDIO_READERS;
  const readers = readerNames ? Object.entries(readerNames) : [];
  const held = heldForWifi();

  return (
    <div className="dl-choose" ref={focusRef}>
      {held ? <p className="dl-held">{'Waiting for Wi-Fi · ' + countOf(held, 'recording')}</p> : null}

      {tvot.units.length ? (
        <GroupRow node={{ ...tvot, title: 'The Volumes of Truth' }} noun="recording" wanted={wanted} off={off} level={0}
          open={open.has('tvot')} onOpen={() => flip('tvot')} onBox={() => setWanted(toggleNode(tvot, wanted))}
          sub={countOf((tvot.children || []).length, 'collection') + (tvotHere ? ' · ' + tvotHere + ' on this phone' : '')}>
          <div className="dl-tools">
            <label className="dl-voice">
              <span className="sr-only">Voice</span>
              <select value={voice} onChange={(e) => setVoice(e.target.value)}>
                <option value="">Voice: the one Listen plays</option>
                {readers.map(([code, name]) => <option key={code} value={code}>{'Voice: ' + String(name).replace(/^Read by /, '')}</option>)}
              </select>
            </label>
            <button type="button" className="dl-link" onClick={() => setWanted(toggleNode(tvot, wanted))}>
              {checkState(tvot, wanted) === 'all' ? 'Untick all of TVOT' : 'Select all of TVOT'}
            </button>
          </div>
          {(tvot.children || []).map((col) => {
            const many = showAll.has(col.id) ? col.units : col.units.slice(0, LETTERS_SHOWN);
            return (
              <div key={col.id} data-node={col.id}>
                <GroupRow node={col} noun="recording" wanted={wanted} off={off} level={1}
                  open={open.has(col.id)} onOpen={() => flip(col.id)} onBox={() => setWanted(toggleNode(col, wanted))}>
                  {many.map((u) => <UnitRow key={u.id} unit={u} wanted={wanted} off={off} onBox={() => setWanted(toggleNode({ units: [u] }, wanted))} />)}
                  {col.units.length > LETTERS_SHOWN && !showAll.has(col.id) ? (
                    <button type="button" className="dl-link dl-show-all" onClick={() => setShowAll((p) => new Set(p).add(col.id))}>{'Show all ' + col.units.length}</button>
                  ) : null}
                </GroupRow>
              </div>
            );
          })}
        </GroupRow>
      ) : (
        <p className="dl-loading">Loading the Volumes of Truth…</p>
      )}

      {shownBible ? (
        <GroupRow node={{ ...shownBible.tree, id: 'bible', title: 'The Bible' }} noun="chapter" wanted={wanted} off={off} level={0}
          open={open.has('bible')} onOpen={() => flip('bible')} onBox={() => setWanted(toggleNode(shownBible.tree, wanted))}
          sub={'Old and New Testament' + (bibleHere ? ' · ' + countOf(bibleHere, 'chapter') + ' on this phone' : '')}>
          {bibles.length > 1 ? (
            <div className="dl-editions" role="radiogroup" aria-label="Bible edition">
              {bibles.map((b) => (
                <button key={b.id} type="button" role="radio" aria-checked={b.id === shownBible.id}
                  className={'dl-edition' + (b.id === shownBible.id ? ' is-on' : '')} onClick={() => setEditionId(b.id)}>{b.edition.short || b.edition.label}</button>
              ))}
            </div>
          ) : null}
          <div className="dl-tools">
            <button type="button" className="dl-link" onClick={() => setWanted(toggleNode(shownBible.tree, wanted))}>
              {checkState(shownBible.tree, wanted) === 'all' ? 'Untick whole edition' : 'Select whole edition'}
            </button>
          </div>
          <div data-node={shownBible.edition.volKey} />
          {(shownBible.tree.children || []).map((tm) => (
            <GroupRow key={tm.id} node={tm} noun="chapter" wanted={wanted} off={off} level={1}
              open={open.has(tm.id)} onOpen={() => flip(tm.id)} onBox={() => setWanted(toggleNode(tm, wanted))}
              sub={countOf((tm.children || []).length, 'book') + ' · ' + statsLine(statsOf(off, tm.units), 'chapter')}>
              {(tm.children || []).map((book) => (
                <GroupRow key={book.id} node={book} noun="chapter" wanted={wanted} off={off} level={2}
                  open={open.has(book.id)} onOpen={() => flip(book.id)} onBox={() => setWanted(toggleNode(book, wanted))}>
                  <ChapterGrid book={book} wanted={wanted} setWanted={setWanted} off={off} />
                </GroupRow>
              ))}
            </GroupRow>
          ))}
        </GroupRow>
      ) : null}

      {studies.units.length ? (
        <GroupRow node={studies} noun="recording" wanted={wanted} off={off} level={0}
          open={open.has('studies')} onOpen={() => flip('studies')} onBox={() => setWanted(toggleNode(studies, wanted))}
          sub={((studies.children || []).length === 1 ? '1 study' : (studies.children || []).length + ' studies') + (studiesHere ? ' · ' + studiesHere + ' on this phone' : '')}>
          {(studies.children || []).map((st) => (
            <div key={st.id} data-node={st.id}>
              <GroupRow node={st} noun="recording" wanted={wanted} off={off} level={1}
                open={open.has(st.id)} onOpen={() => flip(st.id)} onBox={() => setWanted(toggleNode(st, wanted))}>
                {st.units.map((u) => <UnitRow key={u.id} unit={u} wanted={wanted} off={off} onBox={() => setWanted(toggleNode({ units: [u] }, wanted))} />)}
              </GroupRow>
            </div>
          ))}
        </GroupRow>
      ) : null}

      <Footer plan={plan} free={free} onApply={() => setAsking('apply')} />
      {asking === 'apply' ? (
        <ApplySheet plan={plan} groups={groups} off={off} free={free} onCancel={() => setAsking('')} onApply={apply} />
      ) : null}
      {asking === 'mobile' ? (
        <MobileSheet size={formatBytes(plan.addBytes || plan.addKnown)} onCancel={() => setAsking('')}
          onWait={() => run(false)} onNow={() => run(true)} />
      ) : null}
    </div>
  );
}
