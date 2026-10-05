/* ═══════════════════════════════════════════════════════════════════════
   HomeRoot — the Home tab's root in the new look (rs1, overhaul review
   build, 2026-10-05). Cluster D (bundle-d.js).
   ═══════════════════════════════════════════════════════════════════════
   Corbin's reference, phone 1 (lanes/hub/out/overhaul-2026-10-05/ref): the
   app name in the top bar, a display title, one gold "Continue reading"
   pill, then hairline rows (title, subtitle, chevron) with no cards, and a
   YOUR LIBRARY section. audit-ia.md §1 adds the Today card and a "Surprise
   me" row; the tile reordering, the quick-chip row and the dice go.

   HomeScreen renders this whenever the tab bar exists (BottomTabs, the
   overhaul build); without it (tests, a page with no bundle-b) the classic
   Home stays as it was. Same props as HomeScreen.

   Continue reading goes where the resume dot goes (ReadingDotContext's
   onGo = App's goToLastRead) and shows while there is a last place.
   ═══════════════════════════════════════════════════════════════════════ */

import { resetAnswersLanding } from './AnswersHome.jsx';
import { TodayCard, useTodayRows } from '../components/TodayCard.jsx';
import { translationLabel } from '../../data/translations.js';
import { ReadingDotContext } from '../components/ResumeReadingNavBtn.jsx';

/** @param {{ title: string, sub?: string | null, onClick?: any, lead?: string }} props */
export function RootRow({ title, sub, onClick, lead }) {
  return (
    <li className="root-item">
      <button type="button" className="root-row" onClick={onClick}>
        {/* The numeral is drawn from data-lead (CSS ::before), so the row's text still starts with its title. */}
        {lead ? <span className="root-row-lead" data-lead={lead} aria-hidden="true" /> : null}
        <span className="root-row-text">
          <span className="root-row-title">{title}</span>
          {sub ? <span className="root-row-sub">{sub}</span> : null}
        </span>
        <svg className="root-row-chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
          fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
      </button>
    </li>
  );
}

/** @param {{ children?: any, onClick?: any, wide?: boolean, icon?: 'play' | 'arrow' }} props */
export function GoldPill({ children, onClick, wide, icon }) {
  return (
    <button type="button" className={'gold-pill' + (wide ? ' gold-pill-wide' : '')} onClick={onClick}>
      {icon === 'play' ? <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor"><path d="M7 4.5v15l12.5-7.5z" /></svg> : null}
      <span className="gold-pill-label">{children}</span>
      {icon === 'arrow' ? (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
      ) : null}
    </button>
  );
}

export function HomeRoot({ onSelect, onSurprise, showSurprise, onSearch, onNotes, onScriptureWeb, translation,
  readingPlans, isRead, markAsReadEnabled, onPlanRead, onPlanListen, onOpenPlans }) {
  const todayRows = useTodayRows(readingPlans, isRead);
  const dot = React.useContext(ReadingDotContext) || {};
  const [status, setStatus] = React.useState('');
  const busy = React.useRef(false);
  const mounted = React.useRef(true);
  React.useEffect(() => () => { mounted.current = false; }, []);

  const open = (id) => {
    if (id === 'answers') resetAnswersLanding();
    onSelect(id);
  };
  // Surprise me needs the corpora in memory before it can pick (same preparation as the classic Home's dice).
  const surprise = async () => {
    if (busy.current) return;
    busy.current = true;
    setStatus('Preparing a reading…');
    try {
      await Promise.all([
        window.__loadVotCorpus, window.__loadBibleCorpus, window.__loadMatthewCorpus,
        typeof loadBibleStudies === 'function' ? loadBibleStudies : null,
      ].filter((load) => typeof load === 'function').map((load) => load()));
      if (mounted.current) { setStatus(''); onSurprise(); }
    } catch (_e) {
      if (mounted.current) setStatus('Could not prepare a reading. Check your connection and try again.');
    } finally {
      busy.current = false;
    }
  };

  return (
    <ScreenLayout navChildren={LibraryNav({
      hideBack: true, showHome: false, hide: ['settings', 'history', 'theme'],
      leftExtras: <span className="nav-app-name">VOTReader</span>,
      onSearch,
    })}>
      <div className="root-page home-root">
        <h1 className="root-display">The Volumes of Truth</h1>
        <p className="root-sub">Letters from The Lord, Our God and Savior</p>
        {dot.hasPlace && dot.onGo ? <GoldPill wide icon="arrow" onClick={dot.onGo}>Continue reading</GoldPill> : null}
        <TodayCard rows={todayRows} markAsReadEnabled={markAsReadEnabled}
          onRead={(next) => onPlanRead && onPlanRead(next)} onListen={(next) => onPlanListen && onPlanListen(next)}
          onOpenPlans={() => onOpenPlans && onOpenPlans()} />
        <ul className="root-list">
          <RootRow title="The Scriptures of Truth" sub={'Genesis to Revelation · ' + translationLabel(translation)} onClick={() => open('scriptures')} />
          <RootRow title="Answers Only God Can Give" sub="The Lord sets the record straight" onClick={() => open('answers')} />
          <RootRow title="Listening Library" sub="Hear the letters read aloud" onClick={() => BottomTabs.select('listen')} />
          <RootRow title="Studies" sub="Letter Studies · Matthew Study Bible" onClick={() => open('studies')} />
        </ul>
        <h2 className="caps-label">Your library</h2>
        <ul className="root-list">
          {onNotes ? <RootRow title="Notes & bookmarks" sub="Your personal collection" onClick={onNotes} /> : null}
          {onScriptureWeb ? <RootRow title="The Scripture Web" sub="Every cross-reference, drawn" onClick={onScriptureWeb} /> : null}
          {showSurprise ? <RootRow title="Surprise me" sub="Open a random chapter or letter" onClick={surprise} /> : null}
        </ul>
        <p className="home-status" role="status">{status}</p>
      </div>
    </ScreenLayout>
  );
}
