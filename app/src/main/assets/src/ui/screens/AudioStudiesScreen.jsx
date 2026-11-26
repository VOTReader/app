/*
   AudioStudiesScreen -- the Bible/Letter Studies as ONE listening source family.

   The hub's Browse offers one doorway per source family (owner directive
   2026-08-09). The studies had recordings (Lamb of God, Purity) and no
   doorway at all: a listener could reach them only from inside the study
   reader, and the 2026-09-22 walk looked for one and did not find it. This is
   that doorway's inside: every study in its reading order — recorded or not,
   so a title never moves as Tim's recordings arrive — with an honest count,
   each opening the recordings screen a collection opens ('study:<id>').
*/

/* Cluster H (the Listening Library) - bundle-d since lz1 (2026-10-13); it
   rode lazy bundle-h before. AudioPlayer, CoverageBadge, ArrowIcon and the
   COVERAGE_* states live in bundle-d too and are read here as free globals at
   call time — one player, one shelf (see _entry-d.js). */

import { EmptyState, ListGroup, ListRow, RowPlay } from '../components/UiParts.jsx';
import { studyTitleParts } from '../../utils/study-titles.js';
import { useStoreVersionByName } from '../../hooks/use-store-version.js';

/** @returns {Array<any>} the loaded studies registry, [] until bible-studies.js lands */
function studiesList() {
  return typeof BIBLE_STUDIES !== 'undefined' && Array.isArray(BIBLE_STUDIES) ? BIBLE_STUDIES : [];
}

/**
 * How many of a study's chapters have a recording. The study recordings ride
 * the VOT audio manifest under "study:<chapterId>".
 * @param {any} study
 * @returns {number}
 */
function studyRecordedCount(study) {
  const manifest = typeof AUDIO_MANIFEST !== 'undefined' && AUDIO_MANIFEST ? AUDIO_MANIFEST : null;
  if (!manifest || !study || !Array.isArray(study.chapters)) return 0;
  return study.chapters.filter((chapter) => chapter && manifest['study:' + chapter.id]).length;
}

/**
 * The hub row's numbers: how many studies, and how many have a recording.
 * @returns {{ count: number, recorded: number }}
 */
export function studiesSummary() {
  const studies = studiesList();
  return { count: studies.length, recorded: studies.filter((study) => studyRecordedCount(study) > 0).length };
}

/**
 * "16 chapters · 14 recorded", "6 chapters · all recorded", or, for a study
 * with no recording yet, just "31 chapters": its Read study badge already
 * says there is nothing to hear (Codex critique 5, 2026-09-23), and nobody
 * has promised when there will be.
 * @param {any} study
 * @returns {string}
 */
function studyCountLine(study) {
  const total = study && Array.isArray(study.chapters) ? study.chapters.length : 0;
  const recorded = studyRecordedCount(study);
  const noun = total === 1 ? ' chapter' : ' chapters';
  if (recorded === 0) return total + noun;
  return total + noun + ' · ' + (recorded === total ? 'all recorded' : recorded + ' recorded');
}

/**
 * @param {{
 *   onBack: () => void,
 *   backLabel?: string,
 *   onOpenStudy: (studyId: string) => void,
 *   onReadStudy?: (studyId: string) => void,
 * }} props
 */
/** A study's row title: its name, and the rest of its title on the line under it (the Studies list's own split). */
function studyRowTitle(study) {
  const t = studyTitleParts(study.title, study.subtitle);
  return <>{t.head}{t.tail ? <span className="sty-sub">{t.tail}</span> : null}</>;
}

export function AudioStudiesScreen({ onBack, backLabel = 'Back to Listen', onOpenStudy, onReadStudy }) {
  // Not the 1 Hz clock: nothing here draws it (s18.3).
  React.useSyncExternalStore(React.useCallback((cb) => AudioPlayer.subscribe(cb), []), AudioPlayer.getShape);
  // The recordings ride the lazy VOT corpus (the manifest) and the studies are
  // their own lazy file: warm both, and re-render as each lands.
  React.useEffect(() => {
    if (typeof window.__loadVotCorpus === 'function') void window.__loadVotCorpus();
  }, []);
  useStoreVersionByName('__votCorpus');
  const [, setStudiesLanded] = React.useState(0);
  // n6-09: loadBibleStudies resolves false when the fetch failed; say so, and
  // let the reader try again (as StudiesHome does), not "Loading..." for good.
  const [studiesFailed, setStudiesFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    let live = true;
    const load = /** @type {any} */ (window).loadBibleStudies;
    if (typeof load === 'function') {
      Promise.resolve(load()).then((ok) => {
        if (!live) return;
        setStudiesFailed(ok === false);
        setStudiesLanded((n) => n + 1);
      }, () => { if (live) setStudiesFailed(true); });
    }
    return () => { live = false; };
  }, [attempt]);

  const studies = studiesList();
  const heard = studies.filter((study) => studyRecordedCount(study) > 0);
  const toRead = studies.filter((study) => studyRecordedCount(study) === 0);
  const state = AudioPlayer.getState();
  const current = Array.isArray(state.queue) ? state.queue[state.qi] : null;
  const currentKey = current && typeof current.key === 'string' ? current.key : '';
  const live = state.status === 'playing' || state.status === 'loading';
  const studiesWord = (/** @type {number} */ n) => n + (n === 1 ? ' study' : ' studies');

  // listen.html au-studies: "With audio" first (play, title, "16 chapters · 14 recorded", opens the study's
  // recordings), then "To read" (a book chip; opens the study in the reader).
  return (
    <ScreenLayout utility={{ title: 'Studies', onBack, backLabel }}>
      <div className="root-screen listen-studies">
        {heard.length ? (
          <ListGroup label="With audio" aside={studiesWord(heard.length)}>
            {heard.map((study) => {
              const chapters = Array.isArray(study.chapters) ? study.chapters : [];
              const here = !!currentKey && chapters.some((chapter) => chapter && currentKey === 'study:' + chapter.id);
              const playing = here && live;
              return (
                <ListRow key={study.id} current={here}
                  lead={<RowPlay label={(playing ? 'Pause ' : 'Play ') + study.title} playing={playing}
                    onClick={() => (here ? AudioPlayer.toggle() : AudioPlayer.playCollection({ volKey: 'study', items: chapters, collectionLabel: study.title }))} />}
                  title={studyRowTitle(study)} meta={studyCountLine(study)} onClick={() => onOpenStudy(study.id)}
                  ariaLabel={'Open ' + study.title} chevron />
              );
            })}
          </ListGroup>
        ) : null}
        {toRead.length ? (
          <ListGroup label="To read" aside={studiesWord(toRead.length)}>
            {toRead.map((study) => (
              <ListRow key={study.id} icon="book" title={studyRowTitle(study)} meta={studyCountLine(study)}
                onClick={() => (typeof onReadStudy === 'function' ? onReadStudy(study.id) : onOpenStudy(study.id))} />
            ))}
          </ListGroup>
        ) : null}
        {!studies.length ? (
          studiesFailed ? (
            <EmptyState icon="info" title="Couldn’t load the studies" text="They come with the app; try once more."
              action={{ label: 'Try again', onClick: () => { setStudiesFailed(false); setAttempt((n) => n + 1); } }} />
          ) : <p className="listen-saved-note">Loading the studies…</p>
        ) : null}
      </div>
    </ScreenLayout>
  );
}
