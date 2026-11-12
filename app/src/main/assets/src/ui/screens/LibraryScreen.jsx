/* ═══════════════════════════════════════════════════════════════════════
   LibraryScreen — the LIBRARY tab's root (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The UI pass (W2, 2026-11-11, mock v2 library.html l-root): one card with
   Reading plans and Progress (its line live: read count, days in a row);
   "Yours": Notes, Highlights, Bookmarks, Journal and Links as one list of
   rows with the live count at the right ("None yet" while empty); "History":
   the three newest places, one row each, and See all (gone with History
   switched off). Scripture Web is in Read > Explore; Settings is the gear.

   The rows do not drag to reorder: the old grid's long-press gesture
   and LibraryOrderStore order belonged to one list of eight, and the page
   is now three short sections (LibraryOrderStore keeps what it holds).
   ═══════════════════════════════════════════════════════════════════════ */

import { runName } from '../../data/plan-catalog.js';
import { runRow, shortDate } from '../../utils/plan-runs-view.js';
import { countMarks } from '../../utils/mark-kinds.js';
import { useStoreVersionByName } from '../../hooks/use-store-version.js';
import { rootNavStart, RootGear } from '../components/RootNav.jsx';
import { ListGroup, ListRow } from '../components/UiParts.jsx';
import { countOf } from '../../utils/download-tree.js';
import { readWords } from '../../utils/read-kind.js';
import { continueLabel } from './HomeScreen.jsx';

// The stores behind the Notes, Links, Bookmarks, Journal, Highlights and plan lines.
const LIBRARY_COUNT_STORES = Object.freeze(['NoteStore', 'LinkStore', 'BookmarkStore', 'JournalStore', 'AnnotationStore', 'ReadingPlanStore', 'ReadingStreakStore']);

/** How many History rows the page shows. */
export const RECENT_ROWS = 3;


/**
 * When a History row was read, in a word: "today", "yesterday", or the date.
 * @param {any} ts @param {Date} [now] @returns {string}
 */
export function readWhen(ts, now = new Date()) {
  if (typeof ts !== 'number' || !isFinite(ts)) return '';
  const day = (/** @type {Date} */ d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(new Date(ts))) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** The second line of a History row: its place ("Volume Two, Letter 14", or the Bible) and when. @param {any} entry @param {any} lab */
function recentLine(entry, lab) {
  // "Volume One · Letter 1 · today" (mock v2 l-root): the place's own comma reads as one more dot.
  const place = (lab.place || (entry.type === 'study-chapter' ? 'Studies' : entry.type === 'letter' ? '' : 'The Scriptures of Truth')).replace(', ', ' · ');
  return [place, readWhen(entry.ts)].filter(Boolean).join(' · ');
}

/** The Reading plans row's line: the plan that runs and its day, or what plans there are. @param {any[]} runs */
export function plansLine(runs) {
  if (!runs.length) return 'The Bible, the letters, short starts';
  let first = runName(runs[0], null);
  try {
    const row = runRow(runs[0], new Date());
    // plans2: one phrase per state, the same as the plan's own page (paused, a later start, the day).
    if (row.paused) first += ' · paused';
    else if (row.notStarted) first += ' · starts ' + shortDate(row.start).replace(/, \d{4}$/, '');
    else if (!row.finished) first += ' · day ' + (row.day + 1) + ' of ' + row.totalDays;
  } catch (_e) { /* a Volumes plan before the letters load: its name alone */ }
  return runs.length > 1 ? first + ' · and ' + (runs.length - 1) + ' more' : first;
}

/**
 * The Progress row's line: what has been read and the reading streak, in plain units ("12 read · 3 days in a row"),
 * or what the screen holds while nothing is read yet.
 * POL5: the mock's words ("1 letter read") when every mark is a letter (or every one a chapter); a mix stays "12 read".
 * @param {number} read @param {number} streak @param {'letter' | 'chapter' | null} [kind] @returns {string}
 */
export function progressLine(read, streak, kind = null) {
  const parts = [];
  if (read > 0) parts.push(read.toLocaleString('en-US') + ' ' + readWords(read, kind, 'read', 'read'));
  if (streak > 0) parts.push(countOf(streak, 'day') + ' in a row');
  return parts.length ? parts.join(' · ') : 'Your reading at a glance';
}

/**
 * The History rows: newest first, ONE row per place (a letter read three times today is one row, its newest visit;
 * W2, bug "Recently read lists one row per visit"). `key` is HistoryStore's per-reading key; a legacy row without
 * one falls back to its title and place.
 * @param {any[]} history @param {number} [max] @returns {Array<{ entry: any, lab: any }>}
 */
export function recentPlaces(history, max = RECENT_ROWS) {
  /** @type {Array<{ entry: any, lab: any }>} */
  const out = [];
  const seen = new Set();
  for (const entry of history) {
    const lab = continueLabel(entry);
    if (!lab) continue;
    const id = entry.key || lab.title + '|' + (lab.place || '');
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ entry, lab });
    if (out.length >= max) break;
  }
  return out;
}

/**
 * @param {{ onOpenNotes: () => void, onOpenLinks: () => void, onOpenBookmarks: () => void, onOpenJournal: () => void,
 *   onOpenHighlights: () => void, onOpenProgress: () => void, onOpenPlans: () => void, readingPlanCount?: number,
 *   totalReadCount?: number, readKind?: 'letter' | 'chapter' | null, onSearch: () => void, onSettings: () => void, historyEnabled?: boolean, history?: any[],
 *   onOpenHistory?: () => void, onOpenHistoryEntry?: (entry: any) => void, isRead?: any }} props
 */
export function LibraryScreen({ onOpenNotes, onOpenLinks, onOpenBookmarks, onOpenJournal, onOpenHighlights, onOpenProgress, onOpenPlans, totalReadCount = 0, readKind = null, onSearch, onSettings, historyEnabled, history, onOpenHistory, onOpenHistoryEntry }) {
  // The lines below read these stores directly; subscribing to each one is what keeps a count live while the
  // Library stays open (a note saved in a sheet, a bookmark removed). Fixed list — stable hook order.
  const storeVersions = LIBRARY_COUNT_STORES.map(useStoreVersionByName);
  const annVer = storeVersions[LIBRARY_COUNT_STORES.indexOf('AnnotationStore')];
  const g = /** @type {any} */ (globalThis);
  const planStore = g.ReadingPlanStore;
  /** @type {any[]} */
  const runningPlans = planStore && typeof planStore.active === 'function' ? planStore.active() : [];

  const noteCount = typeof g.NoteStore !== 'undefined' ? g.NoteStore.count() : 0;
  const linkCount = typeof g.LinkStore !== 'undefined' ? g.LinkStore.all().length : 0;
  const bookmarkCount = typeof g.BookmarkStore !== 'undefined' ? g.BookmarkStore.count() : 0;
  const journalCount = typeof g.JournalStore !== 'undefined' ? g.JournalStore.count() : 0;
  const streak = g.ReadingStreakStore && typeof g.ReadingStreakStore.get === 'function' ? (g.ReadingStreakStore.get().currentStreak || 0) : 0;
  // The mark walk runs once per AnnotationStore version, not on every render.
  const highlightCount = React.useMemo(
    () => (typeof g.AnnotationStore === 'undefined' ? 0 : countMarks(g.AnnotationStore.all())),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the store version: all() is the live object
    [annVer],
  );

  // "Yours" (mock v2 l-root): five one-line rows, the live count at the right, "None yet" while one is empty.
  const ROWS = [
    { id: 'notes', icon: 'note', title: 'Notes', n: noteCount, onClick: onOpenNotes },
    { id: 'highlights', icon: 'pen', title: 'Highlights', n: highlightCount, onClick: onOpenHighlights },
    { id: 'bookmarks', icon: 'mark', title: 'Bookmarks', n: bookmarkCount, onClick: onOpenBookmarks },
    { id: 'journal', icon: 'journal', title: 'Journal', n: journalCount, onClick: onOpenJournal },
    { id: 'links', icon: 'link', title: 'Links', n: linkCount, onClick: onOpenLinks },
  ];

  const recent = historyEnabled !== false && Array.isArray(history) ? recentPlaces(history) : [];

  return (
    <ScreenLayout root navChildren={rootNavStart({ title: 'Library', onSearch })} navEnd={<RootGear onSettings={onSettings} />}>
      <div className="root-screen library-root">
        <ListGroup ariaLabel="Plans and progress">
          <ListRow icon="cal" title="Reading plans" meta={plansLine(runningPlans)} onClick={onOpenPlans} />
          <ListRow icon="chart" title="Progress" meta={progressLine(totalReadCount, streak, readKind)} onClick={onOpenProgress} />
        </ListGroup>

        <ListGroup label="Yours" className="lib-yours">
          {ROWS.map((r) => (
            <ListRow key={r.id} one icon={r.icon} title={r.title} className="lib-row"
              value={r.n > 0 ? r.n.toLocaleString('en-US') : 'None yet'} valueNone={!(r.n > 0)} onClick={r.onClick} />
          ))}
        </ListGroup>

        {recent.length ? (
          <ListGroup label="History" aside={onOpenHistory ? 'See all' : undefined} onAside={onOpenHistory} className="lib-recent">
            {recent.map(({ entry, lab }, i) => (
              <ListRow key={(entry.key || entry.ts || 0) + ':' + i} noLead title={lab.title} meta={recentLine(entry, lab)}
                onClick={() => { if (onOpenHistoryEntry) onOpenHistoryEntry(entry); }} />
            ))}
          </ListGroup>
        ) : null}
      </div>
    </ScreenLayout>
  );
}
