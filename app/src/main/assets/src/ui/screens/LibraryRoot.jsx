/* ═══════════════════════════════════════════════════════════════════════
   LibraryRoot — the Library tab's root in the new look (rs1, overhaul
   review build, 2026-10-05). Cluster D (bundle-d.js).
   ═══════════════════════════════════════════════════════════════════════
   audit-ia.md §1: YOUR STUDY (marks, notes, links, journal), YOUR READING
   (recent, plans, progress), then Settings and Help & about. Same props as
   LibraryScreen, which renders this whenever the tab bar exists. Marks &
   notes stay separate screens here; merging them is later work.
   ═══════════════════════════════════════════════════════════════════════ */

import { RootRow } from './HomeRoot.jsx';

export function LibraryRoot({ onOpenNotes, onOpenLinks, onOpenBookmarks, onOpenJournal, onOpenHighlights, onOpenProgress,
  onOpenPlans, readingPlanCount, onOpenScriptureWeb, totalReadCount, onSearch, onHistory, onSettings, onAbout, historyEnabled }) {
  const plans = readingPlanCount > 0 ? readingPlanCount + (readingPlanCount === 1 ? ' plan' : ' plans') + ' under way' : 'The Bible in a year, or the Volumes in order';
  return (
    <ScreenLayout navChildren={LibraryNav({
      hideBack: true, showHome: false, hide: ['settings', 'history', 'theme'],
      leftExtras: <span className="nav-app-name nav-screen-title">Library</span>,
      onSearch,
    })}>
      <div className="root-page library-root">
        <h2 className="caps-label">Your study</h2>
        <ul className="root-rows">
          <RootRow title="Notes" sub="What you wrote beside the text" onClick={onOpenNotes} />
          <RootRow title="Highlights & underlines" sub="The passages you marked" onClick={onOpenHighlights} />
          <RootRow title="Bookmarks" sub="Places to come back to" onClick={onOpenBookmarks} />
          <RootRow title="Links" sub="Passages you joined together" onClick={onOpenLinks} />
          <RootRow title="Journal" sub="Your reflections" onClick={onOpenJournal} />
          {onOpenScriptureWeb ? <RootRow title="The Scripture Web" sub="Every cross-reference, drawn" onClick={onOpenScriptureWeb} /> : null}
        </ul>
        <h2 className="caps-label">Your reading</h2>
        <ul className="root-rows">
          {historyEnabled !== false && onHistory ? <RootRow title="Recent" sub="Where you have been reading" onClick={onHistory} /> : null}
          <RootRow title="Reading plans" sub={plans} onClick={onOpenPlans} />
          <RootRow title="Progress" sub={totalReadCount > 0 ? totalReadCount + ' read' : 'Chapters you read are counted here'} onClick={onOpenProgress} />
        </ul>
        <h2 className="caps-label">App</h2>
        <ul className="root-rows">
          <RootRow title="Settings" sub="Appearance, reading, listening, your data" onClick={onSettings} />
          {onAbout ? <RootRow title="Help & about" sub="Show me around, credits, version" onClick={onAbout} /> : null}
        </ul>
      </div>
    </ScreenLayout>
  );
}
