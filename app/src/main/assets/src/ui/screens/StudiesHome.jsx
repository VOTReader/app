/* ═══════════════════════════════════════════════════════════════════════
   StudiesHome — Cluster G (bundle-d since lz1; lazy bundle-g before)
   ═══════════════════════════════════════════════════════════════════════
   studyCoverage and studyCoverageDetail are bundle-d globals, read at call
   time rather than imported (in lazy bundle-g a bundled copy would have
   shipped twice).

   The list in the UI pass's parts (second studies pass, 2026-11-12): a
   centred hero as Answers has, then one grouped list as The Scriptures of
   Truth has. A row is the study's name, the rest of its title under it, and
   one line of facts: how big it is and whether it can be read along with. */

import { ListGroup, ListRow, UiButton } from '../components/UiParts.jsx';
import { countOf } from '../../utils/download-tree.js';
import { coverageCopy } from '../../utils/audio-coverage.js';
import { studyTitleParts } from '../../utils/study-titles.js';

export function StudiesHome({ studies, studiesLoading, studiesError, onRetry, onSelectStudy, onBack, onSearch, onHistory, onSettings, theme, onThemeChange }) {
  // Q8.2: pre-fire the Matthew Study Bible corpus load. By the time the
  // user picks a study from the list, the 618 KB corpus is already
  // downloading in parallel.
  React.useEffect(() => {
    if (typeof window.__loadMatthewCorpus === 'function') {
      window.__loadMatthewCorpus().catch((e) => console.warn('Matthew corpus pre-load failed', e));
    }
  }, []);
  // `studies` is the pre-ordered UNIFIED_CHAIN from App — heavy → light,
  // Matthew Study Bible already inserted at its weighted position.
  // studiesLoading is true while bible-studies.js is fetched the first time.
  const list = studies || [];

  /** How big the study is, in the words its row uses. */
  const sizeOf = (s) => {
    const chCount = s.chapters ? s.chapters.length : 0;
    const displayCount = s.parts ? s.parts.length : chCount;
    if (s.isMatthewStudy) return countOf(chCount, 'chapter') + ' · Inline commentary';
    if (s.singlePage) return 'Reference';
    return displayCount > 0 ? countOf(displayCount, 'part') : 'Coming soon';
  };

  /* Hub order 2026-09-22: the row says whether it can be read along with
     BEFORE the tap. 52 study chapters have no recording at all (align's
     census), which nothing on the way in used to admit. The word carries the
     sentence behind it in its title. A locked study promises nothing yet. */
  const factsOf = (s) => {
    if (s.locked) return 'Coming soon';
    const coverage = studyCoverage(s);
    const copy = coverageCopy(coverage.state);
    const detail = studyCoverageDetail(coverage, s.parts ? 'chapters' : 'parts');
    return <>{sizeOf(s)}{' · '}<span className="sty-cov" title={copy.title}>{detail ? copy.label + ' for ' + detail : copy.label}</span></>;
  };

  return (
    <ScreenLayout
      navChildren={LibraryNav({
        onBack, backLabel: 'Home', showHome: false,
        onSettings, onHistory, onSearch, theme, onThemeChange,
      })}
    >
      <div className="sty">
        <header className="sty-hero">
          <div className="root-eyebrow">In-Depth Bible Studies</div>
          <h1>Studies</h1>
          <p>Bible/Letter Studies & The VOT Matthew Study Bible</p>
        </header>
        {list.length === 0 && studiesLoading && (
          <div className="sty-note" role="status">Loading studies…</div>
        )}
        {list.length === 0 && !studiesLoading && !studiesError && (
          <div className="sty-note">Letter Studies coming soon.</div>
        )}
        {list.length > 0 && (
          <ListGroup label="All studies" aside={String(list.length)}>
            {list.map((s) => {
              const t = studyTitleParts(s.title, s.subtitle);
              return (
                <ListRow key={s.id} noLead className="sty-row"
                  title={<>{t.head}{t.tail ? <span className="sty-sub">{t.tail}</span> : null}</>}
                  meta={factsOf(s)}
                  onClick={s.locked ? undefined : () => onSelectStudy(s.slug || s.id)} />
              );
            })}
          </ListGroup>
        )}
        {studiesError && !studiesLoading && (
          <div className="sty-note">
            <div role="alert">{list.length === 0 ? "Couldn’t load studies." : "Some studies couldn’t load."}</div>
            <UiButton onClick={onRetry}>Try again</UiButton>
          </div>
        )}
      </div>
    </ScreenLayout>
  );
}
