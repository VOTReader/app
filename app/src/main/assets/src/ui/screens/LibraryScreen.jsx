/* ═══════════════════════════════════════════════════════════════════════
   LibraryScreen — the LIBRARY tab's root (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The layout pass (2026-11-10, mock library.png): Reading plans and
   Progress as rows; "Yours": Notes, Highlights, Bookmarks, Journal and
   Links as tiles, each with a live count from its store ("None yet" while
   it is empty); "Recently read": the three newest
   History rows and See all (gone with History switched off). Scripture Web
   left for Read > Explore; Settings is the gear in the top bar.

   The tiles no longer drag to reorder: the old grid's long-press gesture
   and LibraryOrderStore order belonged to one list of eight, and the page
   is now three short sections (LibraryOrderStore keeps what it holds).
   ═══════════════════════════════════════════════════════════════════════ */

import { runName } from '../../data/plan-catalog.js';
import { runRow, shortDate } from '../../utils/plan-runs-view.js';
import { countMarks } from '../../utils/mark-kinds.js';
import { useStoreVersionByName } from '../../hooks/use-store-version.js';
import { rootNavStart, RootGear } from '../components/RootNav.jsx';
import { continueLabel } from './HomeScreen.jsx';

// The stores behind the Notes, Links, Bookmarks, Journal, Highlights and plan lines.
const LIBRARY_COUNT_STORES = Object.freeze(['NoteStore', 'LinkStore', 'BookmarkStore', 'JournalStore', 'AnnotationStore', 'ReadingPlanStore']);

/** How many History rows the page shows. */
export const RECENT_ROWS = 3;

/** "23 notes" / "1 note", or null for none. @param {number} n @param {string} one @param {string} many */
const counted = (n, one, many) => (n > 0 ? n.toLocaleString('en-US') + ' ' + (n === 1 ? one : many) : null);

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
  const place = lab.place || (entry.type === 'study-chapter' ? 'Studies' : entry.type === 'letter' ? '' : 'The Scriptures of Truth');
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

const ICON = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: /** @type {const} */ ('round'), strokeLinejoin: /** @type {const} */ ('round'), 'aria-hidden': true };
const PLANS_ICON = <svg {...ICON}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>;
const PROGRESS_ICON = <svg {...ICON}><path d="M5 19V9M10 19V5M15 19v-7M20 19v-4" /></svg>;

/**
 * @param {{ onOpenNotes: () => void, onOpenLinks: () => void, onOpenBookmarks: () => void, onOpenJournal: () => void,
 *   onOpenHighlights: () => void, onOpenProgress: () => void, onOpenPlans: () => void, readingPlanCount?: number,
 *   totalReadCount?: number, onSearch: () => void, onSettings: () => void, historyEnabled?: boolean, history?: any[],
 *   onOpenHistory?: () => void, onOpenHistoryEntry?: (entry: any) => void, isRead?: any }} props
 */
export function LibraryScreen({ onOpenNotes, onOpenLinks, onOpenBookmarks, onOpenJournal, onOpenHighlights, onOpenProgress, onOpenPlans, onSearch, onSettings, historyEnabled, history, onOpenHistory, onOpenHistoryEntry }) {
  // The lines below read these stores directly; subscribing to each one is what keeps a count live while the
  // Library stays open (a note saved in a sheet, a bookmark removed). Fixed list — stable hook order.
  const storeVersions = LIBRARY_COUNT_STORES.map(useStoreVersionByName);
  const annVer = storeVersions[LIBRARY_COUNT_STORES.indexOf('AnnotationStore')];
  const planStore = /** @type {any} */ (globalThis).ReadingPlanStore;
  /** @type {any[]} */
  const runningPlans = planStore && typeof planStore.active === 'function' ? planStore.active() : [];

  const g = /** @type {any} */ (globalThis);
  const noteCount = typeof g.NoteStore !== 'undefined' ? g.NoteStore.count() : 0;
  const linkCount = typeof g.LinkStore !== 'undefined' ? g.LinkStore.all().length : 0;
  const bookmarkCount = typeof g.BookmarkStore !== 'undefined' ? g.BookmarkStore.count() : 0;
  const journalCount = typeof g.JournalStore !== 'undefined' ? g.JournalStore.count() : 0;
  // The mark walk runs once per AnnotationStore version, not on every render.
  const highlightCount = React.useMemo(
    () => (typeof g.AnnotationStore === 'undefined' ? 0 : countMarks(g.AnnotationStore.all())),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the store version: all() is the live object
    [annVer],
  );

  // Live counts (the hub, 2026-11-10): "23 notes", "118 marked passages"; "None yet" while a tile is empty.
  const TILES = [
    { id: 'notes', title: 'Notes', line: counted(noteCount, 'note', 'notes') || 'None yet', onClick: onOpenNotes },
    { id: 'highlights', title: 'Highlights', line: counted(highlightCount, 'marked passage', 'marked passages') || 'None yet', onClick: onOpenHighlights },
    { id: 'bookmarks', title: 'Bookmarks', line: counted(bookmarkCount, 'place', 'places') || 'None yet', onClick: onOpenBookmarks },
    { id: 'journal', title: 'Journal', line: counted(journalCount, 'entry', 'entries') || 'None yet', onClick: onOpenJournal },
    { id: 'links', title: 'Links', line: counted(linkCount, 'link', 'links') || 'None yet', onClick: onOpenLinks },
  ];

  const recent = historyEnabled !== false && Array.isArray(history)
    ? history.map((entry) => ({ entry, lab: continueLabel(entry) })).filter((r) => r.lab).slice(0, RECENT_ROWS)
    : [];

  return (
    <ScreenLayout root navChildren={rootNavStart({ title: 'Library', onSearch })} navEnd={<RootGear onSettings={onSettings} />}>
      <div className="root-screen library-root">
        <div className="root-list">
          <button type="button" className="root-row" onClick={onOpenPlans}>
            <span className="root-row-icon" aria-hidden="true">{PLANS_ICON}</span>
            <span className="root-row-text"><span className="root-row-title">Reading plans</span><span className="root-row-sub">{plansLine(runningPlans)}</span></span>
            <span className="root-row-chev" aria-hidden="true">›</span>
          </button>
          <button type="button" className="root-row" onClick={onOpenProgress}>
            <span className="root-row-icon" aria-hidden="true">{PROGRESS_ICON}</span>
            <span className="root-row-text"><span className="root-row-title">Progress</span><span className="root-row-sub">Your reading at a glance</span></span>
            <span className="root-row-chev" aria-hidden="true">›</span>
          </button>
        </div>

        <h2 className="root-section">Yours</h2>
        <div className="root-tiles lib-tiles">
          {TILES.map((t) => (
            <button key={t.id} type="button" className="root-tile lib-tile" data-tile={t.id} onClick={t.onClick}>
              <span className="root-tile-title">{t.title}</span>
              <span className="root-tile-detail">{t.line}</span>
            </button>
          ))}
        </div>

        {recent.length ? (
          <section aria-labelledby="library-recent">
            <div className="root-section-row">
              <h2 className="root-section" id="library-recent">Recently read</h2>
              {onOpenHistory ? <button type="button" className="root-link" onClick={onOpenHistory}>See all</button> : null}
            </div>
            <div className="root-list">
              {recent.map(({ entry, lab }, i) => (
                <button key={(entry.ts || 0) + ':' + i} type="button" className="root-row root-row-plain"
                  onClick={() => { if (onOpenHistoryEntry) onOpenHistoryEntry(entry); }}>
                  <span className="root-row-text"><span className="root-row-title">{lab.title}</span><span className="root-row-sub">{recentLine(entry, lab)}</span></span>
                  <span className="root-row-chev" aria-hidden="true">›</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </ScreenLayout>
  );
}
