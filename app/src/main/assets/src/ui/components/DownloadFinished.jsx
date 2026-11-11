/* ═══════════════════════════════════════════════════════════════════════
   DownloadFinished — what has finished downloading (dl-rework E, 2026-11-10)
   ═══════════════════════════════════════════════════════════════════════
   The On this phone tab's "Finished": each set something landed in, newest first, with how much of the set is on
   the phone ("KJV · BRM: 1,189 of 1,189 chapters"), a line of its own when a whole set is complete, and the latest
   recordings to land, newest first, a page at a time.

   Nothing new is stored: the stores already keep every recording with the time it landed (savedAt in the phone's
   index.json and the browser's index), so the list survives a restart on both platforms as the downloads do. The
   sets and their sizes come from the same trees the Choose tab ticks (useDownloadTrees), every reading of a letter
   counted, so a letter saved in any voice counts.
   ═══════════════════════════════════════════════════════════════════════ */

import { useDownloadTrees } from './DownloadChooser.jsx';
import { countOf, readingsOf, unitOnPhone, readerName } from '../../utils/download-tree.js';

/** Latest recordings shown at a time. */
const LATEST_PAGE = 8;

/** @typedef {{ id: string, title: string, noun: string, units: any[] }} FinishedSet */

/**
 * The sets a recording can belong to, and which set each URL is in.
 * @param {{ tvot: any, bibles: any[], studies: any }} trees
 * @returns {{ sets: Map<string, FinishedSet>, setOf: Map<string, string>, readerOf: Map<string, string> }}
 */
export function finishedSets(trees) {
  /** @type {Map<string, FinishedSet>} */
  const sets = new Map();
  /** @type {Map<string, string>} */
  const setOf = new Map();
  /** @type {Map<string, string>} */
  const readerOf = new Map();
  const add = (/** @type {string} */ id, /** @type {string} */ title, /** @type {string} */ noun, /** @type {any[]} */ units) => {
    if (!units.length) return;
    sets.set(id, { id, title, noun, units });
    for (const u of units) {
      for (const r of readingsOf(u)) for (const t of r.tracks) { setOf.set(t.url, id); if (r.reader) readerOf.set(t.url, r.reader); }
    }
  };
  for (const col of trees.tvot.children || []) add(col.id, col.title, 'letter', col.units);
  for (const b of trees.bibles) add(b.tree.id, b.edition.short || b.edition.label || b.tree.title, 'chapter', b.tree.units);
  for (const st of trees.studies.children || []) add(st.id, st.title, 'recording', st.units);
  return { sets, setOf, readerOf };
}

/** "today", "yesterday", "Nov 8". @param {number} at @param {number} now */
function _when(at, now) {
  if (!at) return '';
  const d = new Date(at);
  const today = new Date(now);
  const day = (/** @type {Date} */ x) => x.getFullYear() * 400 + x.getMonth() * 32 + x.getDate();
  if (day(d) === day(today)) return 'today';
  if (day(d) === day(new Date(now - 864e5))) return 'yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * @param {{ off: any, items: Array<{ url: string, key: string, title: string, savedAt: number }> }} props items = the
 *   recordings on the phone (off.items(), newest first)
 */
export function DownloadFinished({ off, items }) {
  const trees = useDownloadTrees({});
  const { sets, setOf, readerOf } = React.useMemo(() => finishedSets(trees), [trees]);
  const [shown, setShown] = React.useState(LATEST_PAGE);
  if (!items.length) return null;
  const now = Date.now();
  const newest = [...items].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  /** @type {Array<{ set: FinishedSet, k: number, at: number }>} */
  const lines = [];
  const seen = new Set();
  for (const it of newest) {
    const id = setOf.get(it.url);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const set = /** @type {FinishedSet} */ (sets.get(id));
    lines.push({ set, k: set.units.filter((u) => unitOnPhone(off, u)).length, at: it.savedAt || 0 });
  }
  const latest = newest.slice(0, shown);
  return (
    <section className="dl-finished" aria-labelledby="dl-finished-title">
      <div className="dl-queue-head">
        <div>
          <p className="dl-shelf-kicker">On this phone</p>
          <h2 id="dl-finished-title">Finished</h2>
        </div>
      </div>
      {lines.length ? (
        <ul className="dl-finished-sets">
          {lines.map(({ set, k }) => {
            const n = set.units.length;
            const whole = k === n;
            return (
              <li key={set.id} className={'dl-finished-set' + (whole ? ' is-whole' : '')}>
                {whole
                  ? <span>{'All of ' + set.title + ' is on this phone · ' + countOf(n, set.noun)}</span>
                  : <span>{set.title + ': ' + k.toLocaleString('en-US') + ' of ' + countOf(n, set.noun)}</span>}
              </li>
            );
          })}
        </ul>
      ) : null}
      <ul className="dl-finished-rows">
        {latest.map((it) => {
          const reader = readerName(readerOf.get(it.url) || '');
          const set = sets.get(setOf.get(it.url) || '');
          return (
            <li key={it.url} className="dl-finished-row">
              <span className="dl-finished-title">{it.title || it.url.split('/').pop()}</span>
              <small>{[reader, set && !it.title.startsWith(set.title) ? set.title : '', _when(it.savedAt, now)].filter(Boolean).join(' · ')}</small>
            </li>
          );
        })}
      </ul>
      {newest.length > latest.length ? (
        <button type="button" className="dl-link" onClick={() => setShown(shown + LATEST_PAGE * 3)}>
          {'Show more · ' + (newest.length - latest.length).toLocaleString('en-US') + ' earlier'}
        </button>
      ) : null}
    </section>
  );
}
