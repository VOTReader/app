/* ═══════════════════════════════════════════════════════════════════════
   LibraryRoot — the Library tab's root in the new look (rs1, overhaul
   review build, 2026-10-05; rs3 to sheet 25 and the canvas's Library
   board). Cluster D (bundle-d.js).
   ═══════════════════════════════════════════════════════════════════════
   A search field over your own marks and notes, then YOUR STUDY (Marks &
   notes: highlights, notes and bookmarks in one list; Links; Journal; the
   Scripture Web), YOUR READING (Recent, Reading plans, Progress) and YOUR
   DATA (Backup & restore, Settings, Help & about). Each row says what it
   holds now: counts, the last place read, the last backup.
   ═══════════════════════════════════════════════════════════════════════ */

import { RootRow } from './HomeRoot.jsx';
import { isMarkKind } from '../../utils/mark-kinds.js';
import { relativeDate } from '../../utils/dates.js';
import { useStoreVersionByName } from '../../hooks/use-store-version.js';

// The stores behind the counts; fixed list, stable hook order.
const COUNT_STORES = Object.freeze(['NoteStore', 'LinkStore', 'BookmarkStore', 'JournalStore', 'AnnotationStore']);

/** @param {number} n @param {string} one @param {string} many */
const plural = (n, one, many) => n.toLocaleString('en-US') + ' ' + (n === 1 ? one : many);

/** What each Library row counts, read from the stores (0 for a store not loaded). */
export function libraryCounts() {
  const g = /** @type {any} */ (globalThis);
  const highlights = (() => {
    if (!g.AnnotationStore) return 0;
    const data = g.AnnotationStore.all() || {};
    const seen = {};
    Object.keys(data).forEach((k) => (data[k] || []).forEach((a) => { if (isMarkKind(a.kind)) seen[a.groupId || a.id] = 1; }));
    return Object.keys(seen).length;
  })();
  return {
    highlights,
    notes: g.NoteStore ? g.NoteStore.count() : 0,
    bookmarks: g.BookmarkStore ? g.BookmarkStore.count() : 0,
    links: g.LinkStore ? g.LinkStore.all().length : 0,
    journal: g.JournalStore ? g.JournalStore.count() : 0,
  };
}

/** The newest history entry as "<where> · <when>", or null. @param {any[]} history */
export function recentLine(history) {
  const e = Array.isArray(history) && history.length ? history[0] : null;
  if (!e) return null;
  const where = e.type === 'letter' ? e.letterTitle
    : e.type === 'study-chapter' ? (e.chapterTitle || e.studyTitle)
      : (e.bookTitle ? e.bookTitle + ' ' + e.chapterNum : null);
  if (!where) return null;
  const when = e.ts ? relativeDate(e.ts) : '';
  return when ? where + ' · ' + when : where;
}

function lastBackupLine() {
  let at = 0;
  // backup-flow.js LAST_EXPORT_KEY (read by name: that module rides the lazy Settings bundle).
  try { at = Number(localStorage.getItem('vot-last-export')) || 0; } catch (_e) { /* no storage */ }
  return at ? 'Last backup ' + relativeDate(at) : 'Not backed up from this device yet';
}

export function LibraryRoot({ onOpenNotes: _onOpenNotes, onOpenLinks, onOpenBookmarks: _onOpenBookmarks, onOpenJournal, onOpenHighlights: _onOpenHighlights,
  onOpenProgress, onOpenPlans, readingPlanCount, onOpenScriptureWeb, totalReadCount, onSearch, onHistory, onSettings, onAbout,
  historyEnabled, history, onOpenMarks, onOpenSettingsPage }) {
  COUNT_STORES.forEach(useStoreVersionByName);
  const c = libraryCounts();
  const marksParts = [c.highlights && plural(c.highlights, 'highlight', 'highlights'), c.notes && plural(c.notes, 'note', 'notes'),
    c.bookmarks && plural(c.bookmarks, 'bookmark', 'bookmarks')].filter(Boolean);
  const plans = readingPlanCount > 0 ? plural(readingPlanCount, 'plan', 'plans') + ' under way' : 'The Bible in a year, or the Volumes in order';
  const recent = recentLine(history);
  return (
    <ScreenLayout navChildren={LibraryNav({
      hideBack: true, showHome: false, hide: ['settings', 'history', 'theme'],
      leftExtras: <span className="nav-app-name nav-screen-title">Library</span>,
      onSearch,
    })}>
      <div className="root-page library-root">
        {onOpenMarks ? (
          <button type="button" className="root-search" onClick={() => onOpenMarks(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
            <span className="root-search-ph">Search your marks and notes…</span>
          </button>
        ) : null}
        <h2 className="caps-label">Your study</h2>
        <ul className="root-list">
          {onOpenMarks ? <RootRow title="Marks & notes" sub={marksParts.length ? marksParts.join(' · ') : 'Highlights, notes and bookmarks'} onClick={() => onOpenMarks(false)} /> : null}
          <RootRow title="Links" sub={c.links ? plural(c.links, 'link', 'links') : 'Passages you joined together'} onClick={onOpenLinks} />
          <RootRow title="Journal" sub={c.journal ? plural(c.journal, 'entry', 'entries') : 'Your reflections'} onClick={onOpenJournal} />
          {onOpenScriptureWeb ? <RootRow title="The Scripture Web" sub="Every cross-reference, drawn" onClick={onOpenScriptureWeb} /> : null}
        </ul>
        <h2 className="caps-label">Your reading</h2>
        <ul className="root-list">
          {historyEnabled !== false && onHistory ? <RootRow title="Recent" sub={recent || 'Where you have been reading'} onClick={onHistory} /> : null}
          <RootRow title="Reading plans" sub={plans} onClick={onOpenPlans} />
          <RootRow title="Progress" sub={totalReadCount > 0 ? plural(totalReadCount, 'chapter or letter', 'chapters and letters') + ' read' : 'Chapters you read are counted here'} onClick={onOpenProgress} />
        </ul>
        <h2 className="caps-label">Your data</h2>
        <ul className="root-list">
          {onOpenSettingsPage ? <RootRow title="Backup & restore" sub={lastBackupLine()} onClick={() => onOpenSettingsPage('data')} /> : null}
          <RootRow title="Settings" sub="Appearance, reading, listening, storage" onClick={onSettings} />
          {onOpenSettingsPage ? <RootRow title="Help & about" sub="Show me around, credits, privacy, version" onClick={() => onOpenSettingsPage('help')} />
            : onAbout ? <RootRow title="Help & about" sub="Show me around, credits, version" onClick={onAbout} /> : null}
        </ul>
      </div>
    </ScreenLayout>
  );
}
