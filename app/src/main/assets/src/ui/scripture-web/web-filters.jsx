/* ═══════════════════════════════════════════════════════════════════════
   web-filters — the Scripture Web's filters: the legend's chips, the
   Filters sheet and the pill that names what is on.
   Cluster F (bundle-d), used by ui/screens/ScriptureWebScreen.jsx.
   ═══════════════════════════════════════════════════════════════════════

   Corbin, 2026-10-22, chose the mix of the three mockups
   (D:/Swarm/lanes/sweb/out/mockups/filters/r1-*): the legend's cues filter at
   a tap (nearby, far, cited in the Volumes, prophecy fulfilled), its
   "Filters" opens a sheet with the rest (testament, book, strength), and a
   pill at the top names what is on with one tap to clear it, there even with
   the controls hidden. What is filtered out stays as a ghost (filters.js).

   The filters are the canon's: My Web has none, and its masks are cleared
   while it is up (the filters come back with the canon). */

import { filterMasks, filterLabels, filtersOn, setFilterMasks, NO_FILTERS, DISTANCE_LABEL, TESTAMENT_LABEL }
  from '../../utils/scripture-web/filters.js';
import { prophecySet } from '../../utils/scripture-web/frame-set.js';
import { bucketDrawCount } from '../../utils/scripture-web/decode.js';

/** @typedef {import('../../utils/scripture-web/filters.js').WebFilters} WebFilters */

/**
 * A stored set of filters, kept only when every field is one the sheet can set (a saved spot from
 * an older build, or a hand-edited one, opens with none rather than a broken filter).
 * @param {any} f @returns {WebFilters | null}
 */
export function validFilters(f) {
  if (!f || typeof f !== 'object') return null;
  const one = (v, list) => list.indexOf(v) >= 0;
  const book = (v) => Number.isInteger(v) && v >= -1 && v < 66;
  if (!one(f.distance, ['all', 'near', 'middle', 'far']) || !one(f.testament, ['all', 'oo', 'on', 'nn'])
    || !one(f.strength, ['all', 'strong', 'strongest']) || typeof f.cited !== 'boolean'
    || typeof f.prophecy !== 'boolean' || !book(f.fromBook) || !book(f.toBook)) return null;
  return { distance: f.distance, cited: f.cited, prophecy: f.prophecy, testament: f.testament,
    fromBook: f.fromBook, toBook: f.toBook, strength: f.strength };
}

/**
 * How many lines a set of masks leaves lit at a density: the kept threads it draws, or with the
 * prophecy filter on the kept prophecy pairs, each drawn once.
 * @param {any} g @param {import('../../utils/scripture-web/filters.js').FilterMasks} masks
 * @param {WebFilters} f @param {import('../../utils/scripture-web/decode.js').Density} density
 */
export function keptShown(g, masks, f, density) {
  let n = 0;
  if (f.prophecy) {
    const ps = prophecySet(g);
    for (let k = 0; k < ps.count; k++) if (ps.twin[k] === k && masks.pairs[k]) n++;
    return n;
  }
  for (const b of g.buckets) {
    const end = b.off + bucketDrawCount(b, density);
    for (let i = b.off; i < end; i++) n += masks.threads[i];
  }
  return n;
}

/**
 * The filters' state, their masks in force on the graph and the count they leave.
 * @param {{ graph: any, mode: string, density: import('../../utils/scripture-web/decode.js').Density,
 *   schedule: () => void, setAnnounce: (text: string) => void, initial?: any }} p
 *   initial: the filters to open with (a resume point's or the saved spot's), checked field by field
 */
export function useWebFilters({ graph, mode, density, schedule, setAnnounce, initial }) {
  const [filters, setFilters] = React.useState(() => /** @type {WebFilters} */ (validFilters(initial) || NO_FILTERS));
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const canon = mode !== 'personal';
  const masks = React.useMemo(() => (graph ? filterMasks(graph, filters, prophecySet(graph)) : null), [graph, filters]);
  React.useEffect(() => {
    if (!graph) return undefined;
    setFilterMasks(graph, canon ? masks : null);
    schedule();
    return () => setFilterMasks(graph, null);
  }, [graph, masks, canon, schedule]);
  const shown = React.useMemo(() => (graph && masks ? keptShown(graph, masks, filters, density) : -1),
    [graph, masks, filters, density]);
  const on = canon && filtersOn(filters);
  const labels = on ? filterLabels(graph, filters) : [];

  // the live region says what the web now shows, once a change has been counted
  const said = React.useRef('');
  const words = on ? labels.map((l) => l.label).join(', ') + ': ' + shown.toLocaleString() + ' shown' : '';
  React.useEffect(() => {
    if (!graph) return;
    const line = words || (said.current ? 'Filters cleared' : '');
    if (line && line !== said.current) setAnnounce(line);
    said.current = words;
  }, [graph, words, setAnnounce]);

  /** @param {Partial<WebFilters>} part */
  const change = React.useCallback((part) => setFilters((f) => ({ ...f, ...part })), []);
  const clear = React.useCallback(() => setFilters(NO_FILTERS), []);
  /** One tap on a legend chip: on, or off when it is already the one on. @param {'near'|'far'|'cited'|'prophecy'} kind */
  /** A long press on a book name: the web keeps that book's threads, or lets it go when it is
   * already the one book kept. @param {number} book */
  const holdBook = React.useCallback((book) => setFilters((f) => (
    f.fromBook === book && f.toBook < 0 ? { ...f, fromBook: -1 } : { ...f, fromBook: book, toBook: -1 })), []);
  const toggle = React.useCallback((kind) => setFilters((f) => (
    kind === 'cited' || kind === 'prophecy' ? { ...f, [kind]: !f[kind] }
      : { ...f, distance: f.distance === kind ? 'all' : kind })), []);

  return { filters, on, labels, shown, change, clear, toggle, holdBook, sheetOpen, setSheetOpen, canon };
}

/**
 * The legend's chips (the canon's key, made of buttons): nearby and far keep a third of the threads
 * by distance, cited and prophecy keep their marks, Filters opens the sheet.
 * @param {{ web: ReturnType<typeof useWebFilters> }} p
 */
export function legendChips({ web }) {
  const f = web.filters;
  const chip = (key, pressed, onClick, children, label) => (
    <button type="button" key={key} className={'sw-key sw-chip' + (pressed ? ' is-on' : '')} aria-pressed={pressed}
      aria-label={label} onClick={onClick}>{children}</button>
  );
  return [
    <span className="sw-key sw-key-ramp" key="ramp">
      {chip('near', f.distance === 'near', () => web.toggle('near'), 'nearby', 'Show only nearby connections')}
      <i className="sw-key-gradient" aria-hidden="true" />
      {chip('far', f.distance === 'far', () => web.toggle('far'), [
        <span className="sw-key-long" key="l">across the canon</span>, <span className="sw-key-short" key="s">far</span>,
      ], 'Show only far connections')}
    </span>,
    chip('cited', f.cited, () => web.toggle('cited'),
      [<i className="sw-key-tick" aria-hidden="true" key="i" />, 'cited in the Volumes'], 'Show only verses cited in the Volumes'),
    chip('prophecy', f.prophecy, () => web.toggle('prophecy'),
      [<i className="sw-key-arc" aria-hidden="true" key="i" />, 'prophecy fulfilled'], 'Show only prophecy fulfilled'),
    <button type="button" key="filters" className={'sw-key sw-chip sw-chip-more' + (web.sheetOpen ? ' is-on' : '')}
      aria-expanded={web.sheetOpen} aria-haspopup="dialog" onClick={() => web.setSheetOpen(!web.sheetOpen)}>
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M4 6h16M7 12h10M10 18h4" />
      </svg>
      Filters
    </button>,
  ];
}

/**
 * The pill at the top that names what is on and the count it leaves: tap it for the sheet, its x
 * clears every filter. Shown with the controls hidden too.
 * @param {{ web: ReturnType<typeof useWebFilters> }} p
 */
export function FilterPill({ web }) {
  if (!web.on) return null;
  const words = web.labels.map((l) => l.label).join(' · ');
  return (
    <div className="sw-filter-pill" role="group" aria-label="Filters on">
      <button type="button" className="sw-filter-pill-body" onClick={() => web.setSheetOpen(true)}
        aria-label={'Filters: ' + words + ', ' + web.shown.toLocaleString() + ' shown. Change'}>
        <span className="sw-filter-pill-words">{words}</span>
        <span className="sw-filter-pill-count">{web.shown.toLocaleString()}</span>
      </button>
      <button type="button" className="sw-filter-pill-clear" onClick={web.clear} aria-label="Clear the filters">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

/**
 * One row of the sheet: a name and a segmented choice.
 * @param {{ name: string, value: string, options: Array<[string, string]>, onChange: (v: string) => void }} p
 */
function SegRow({ name, value, options, onChange }) {
  return (
    <div className="sw-filter-row">
      <span className="sw-filter-name" id={'sw-filter-' + name}>{name}</span>
      <div className="sw-seg sw-filter-seg" role="group" aria-labelledby={'sw-filter-' + name}>
        {options.map(([v, label]) => (
          <button type="button" key={v} className={'sw-seg-btn' + (value === v ? ' is-on' : '')} aria-pressed={value === v}
            onClick={() => onChange(v)}>{label}</button>
        ))}
      </div>
    </div>
  );
}

/**
 * The Filters sheet: every filter, combined, with the count they leave and Clear all.
 * Escape closes it (use-web-keys.js: it is a layer of the web's).
 * @param {{ web: ReturnType<typeof useWebFilters>, graph: any }} p
 */
export function FilterSheet({ web, graph }) {
  // the keyboard goes in as it opens and back where it was as it closes (use-focus-trap.js); not
  // modal: the web behind it is the point, showing what the filters leave
  const ref = useFocusTrap(true, { modal: false });
  if (!graph) return null;
  const f = web.filters;
  const books = graph.books || [];
  const bookSelect = (label, value, key) => (
    <label className="sw-filter-book">
      <span className="sw-sr-only">{label}</span>
      <select className="sw-select" value={value} aria-label={label}
        onChange={(e) => web.change({ [key]: Number(e.target.value) })}>
        <option value={-1}>Any book</option>
        {books.map((b, k) => <option key={k} value={k}>{b.title}</option>)}
      </select>
    </label>
  );
  const toggle = (label, value, key) => (
    <button type="button" className={'sw-btn sw-toggle' + (value ? ' is-on' : '')} aria-pressed={value}
      onClick={() => web.change({ [key]: !value })}>{label}</button>
  );
  const count = web.on ? web.shown : -1;
  return (
    <div className="sw-filter-sheet" ref={ref} role="dialog" aria-modal="false" aria-label="Filters" data-wheel-through="1">
      <div className="sw-filter-head">
        <h2>Filters</h2>
        <span className="sw-filter-count" aria-live="off">
          {count >= 0 ? count.toLocaleString() + ' shown' : 'Everything shown'}
        </span>
        <button type="button" className="sw-filter-clear" disabled={!web.on} onClick={web.clear}>Clear all</button>
        <button type="button" className="sw-btn sw-btn-icon sw-filter-close" aria-label="Close the filters"
          onClick={() => web.setSheetOpen(false)}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="sw-filter-body">
        <div className="sw-filter-row">
          <span className="sw-filter-name">Show only</span>
          <div className="sw-filter-toggles">
            {toggle('Prophecy fulfilled', f.prophecy, 'prophecy')}
            {toggle('Cited in the Volumes', f.cited, 'cited')}
          </div>
        </div>
        <SegRow name="Distance" value={f.distance} onChange={(v) => web.change({ distance: /** @type {any} */ (v) })}
          options={['all', 'near', 'middle', 'far'].map((k) => [k, k === 'middle' ? 'Middle' : DISTANCE_LABEL[k]])} />
        <SegRow name="Testament" value={f.testament} onChange={(v) => web.change({ testament: /** @type {any} */ (v) })}
          options={['all', 'oo', 'on', 'nn'].map((k) => [k, TESTAMENT_LABEL[k]])} />
        <SegRow name="Strength" value={f.strength} onChange={(v) => web.change({ strength: /** @type {any} */ (v) })}
          options={[['all', 'All'], ['strong', '50+ votes'], ['strongest', '100+ votes']]} />
        <div className="sw-filter-row">
          <span className="sw-filter-name">Books</span>
          <div className="sw-filter-books">
            {bookSelect('From book', f.fromBook, 'fromBook')}
            <span className="sw-filter-and" aria-hidden="true">and</span>
            {bookSelect('To book', f.toBook, 'toBook')}
          </div>
        </div>
      </div>
    </div>
  );
}
