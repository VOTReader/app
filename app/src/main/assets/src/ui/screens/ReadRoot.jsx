/* ═══════════════════════════════════════════════════════════════════════
   ReadRoot — the Read tab's root in the new look (rs1, overhaul review
   build, 2026-10-05). Cluster D (bundle-d.js).
   ═══════════════════════════════════════════════════════════════════════
   audit-ia.md §1: Read is ONE table of contents: a search field, Continue,
   THE VOLUMES OF TRUTH (One to Seven), COLLECTIONS (the seven + the
   Garden), THE SCRIPTURES OF TRUTH, then Answers, Studies and the
   Scripture Web. It folds the old Volumes landing in (one level less to
   every letter), so VolumesHome renders this whenever the tab bar exists.

   Rows in the reference style (RootRow, HomeRoot.jsx): a gold roman numeral
   leads each volume. No year spans: the old landing's disagree with the
   letters' own dates (audit-ia flag 4).
   ═══════════════════════════════════════════════════════════════════════ */

import { RootRow, GoldPill } from './HomeRoot.jsx';
import { ReadingDotContext } from '../components/ResumeReadingNavBtn.jsx';
import { resetAnswersLanding } from './AnswersHome.jsx';
import { translationLabel } from '../../data/translations.js';

const VOLUMES = [
  ['volume-one', 'Volume One', 'one', 'I'], ['volume-two', 'Volume Two', 'two', 'II'],
  ['volume-three', 'Volume Three', 'three', 'III'], ['volume-four', 'Volume Four', 'four', 'IV'],
  ['volume-five', 'Volume Five', 'five', 'V'], ['volume-six', 'Volume Six', 'six', 'VI'],
  ['volume-seven', 'Volume Seven', 'seven', 'VII'],
];
const COLLECTIONS = [
  ['little-flock', 'Letters to The Little Flock', 'flock', 'letters'],
  ['letters-timothy', 'Letters from Timothy', 'timothy', 'letters'],
  ['lords-rebuke', "The Lord's Rebuke", 'rebuke', 'letters'],
  ['words-to-live-by-1', 'Words To Live By: Part One', 'wtlb1', 'entries'],
  ['words-to-live-by-2', 'Words To Live By: Part Two', 'wtlb2', 'entries'],
  ['the-blessed', 'The Blessed', 'blessed', 'entries'],
  ['holy-days', 'Regarding The Holy Days', 'holydays', 'letters'],
];

export function ReadRoot({ onSelect, onOpen, onSearch, onScriptureWeb, translation }) {
  React.useEffect(() => {
    if (typeof window.__loadVotCorpus === 'function') {
      window.__loadVotCorpus().catch((e) => console.warn('VOT corpus pre-load failed', e));
    }
  }, []);
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof window.__votCorpus !== 'undefined') ? window.__votCorpus.subscribe(cb) : () => {}, []),
    () => (typeof window.__votCorpus !== 'undefined') ? window.__votCorpus.getVersion() : 0
  );
  const dot = React.useContext(ReadingDotContext) || {};
  const count = (k, noun) => {
    const n = colLetterArr(COL_BY_KEY.get(k)).length;
    return n > 0 ? n + ' ' + noun : null;
  };
  const go = (id) => {
    if (id === 'answers') resetAnswersLanding();
    if (onOpen) onOpen(id);
  };

  return (
    <ScreenLayout navChildren={LibraryNav({
      hideBack: true, showHome: false, hide: ['settings', 'history', 'theme'],
      leftExtras: <span className="nav-app-name nav-screen-title">Read</span>,
      onSearch,
    })}>
      <div className="root-page read-root">
        {onSearch ? (
          <button type="button" className="root-search" onClick={onSearch}>
            <span className="root-search-ph">What does The Lord say about…</span>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="7.5" /><path d="m20.5 20.5-4.2-4.2" /></svg>
          </button>
        ) : null}
        {dot.hasPlace && dot.onGo ? (
          <>
            <h2 className="caps-label">Continue</h2>
            <GoldPill wide icon="arrow" onClick={dot.onGo}>Continue reading</GoldPill>
          </>
        ) : null}
        <h2 className="caps-label">The Volumes of Truth</h2>
        <ul className="root-rows root-rows-numeral">
          {VOLUMES.map(([id, title, k, numeral]) => (
            <RootRow key={id} lead={numeral} title={title} sub={count(k, 'letters')} onClick={() => onSelect(id)} />
          ))}
        </ul>
        <h2 className="caps-label">Collections</h2>
        <ul className="root-rows">
          {COLLECTIONS.map(([id, title, k, noun]) => (
            <RootRow key={id} title={title} sub={count(k, noun)} onClick={() => onSelect(id)} />
          ))}
          <RootRow title="A Return to The Garden" sub="209 pages · a visual journey" onClick={() => onSelect('garden')} />
        </ul>
        <h2 className="caps-label">The Scriptures of Truth</h2>
        <ul className="root-rows">
          <RootRow title="The Holy Bible" sub={'Genesis to Revelation · ' + translationLabel(translation)} onClick={() => go('scriptures')} />
          <RootRow title="Answers Only God Can Give" sub="The Lord sets the record straight" onClick={() => go('answers')} />
          <RootRow title="Studies" sub="Letter Studies · Matthew Study Bible" onClick={() => go('studies')} />
          {onScriptureWeb ? <RootRow title="The Scripture Web" sub="Every cross-reference, drawn" onClick={onScriptureWeb} /> : null}
        </ul>
      </div>
    </ScreenLayout>
  );
}
