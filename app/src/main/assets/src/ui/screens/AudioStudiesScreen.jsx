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

/* Cluster H (esbuild bundle-h.js, lazy), with the other Listening Library
   screens. AudioPlayer, CoverageBadge, ArrowIcon and the COVERAGE_* states
   stay in bundle-d and are read here as free globals at call time — one
   player, one shelf (see _entry-h.js). */

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
export function studyRecordedCount(study) {
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
export function studyCountLine(study) {
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
 *   onSearch: () => void,
 *   onHistory: () => void,
 *   onSettings: () => void,
 *   theme: any,
 *   onThemeChange: (theme: any) => void,
 * }} props
 */
export function AudioStudiesScreen({ onBack, backLabel = 'Listening Library', onOpenStudy, onReadStudy, onSearch, onHistory, onSettings, theme, onThemeChange }) {
  React.useSyncExternalStore(AudioPlayer.subscribe, AudioPlayer.getVersion);
  // The recordings ride the lazy VOT corpus (the manifest) and the studies are
  // their own lazy file: warm both, and re-render as each lands.
  React.useEffect(() => {
    if (typeof window.__loadVotCorpus === 'function') void window.__loadVotCorpus();
  }, []);
  React.useSyncExternalStore(
    React.useCallback((callback) => typeof window.__votCorpus !== 'undefined' ? window.__votCorpus.subscribe(callback) : () => {}, []),
    () => typeof window.__votCorpus !== 'undefined' ? window.__votCorpus.getVersion() : 0
  );
  const [, setStudiesLanded] = React.useState(0);
  React.useEffect(() => {
    let live = true;
    const load = /** @type {any} */ (window).loadBibleStudies;
    if (typeof load === 'function') Promise.resolve(load()).then(() => { if (live) setStudiesLanded((n) => n + 1); }, () => {});
    return () => { live = false; };
  }, []);

  const studies = studiesList();
  const withAudio = studies.filter((study) => studyRecordedCount(study) > 0).length;
  const state = AudioPlayer.getState();
  const current = Array.isArray(state.queue) ? state.queue[state.qi] : null;
  const currentKey = current && typeof current.key === 'string' ? current.key : '';

  return (
    <ScreenLayout
      navChildren={LibraryNav({ onBack, backLabel, showHome: false, onSearch, onHistory, onSettings, theme, onThemeChange })}
    >
      <div className="audio-library-screen">
        <header className="audio-library-hero">
          <div className="audio-library-eyebrow">Listening Library</div>
          <h1>Bible/Letter Studies</h1>
          {/* Codex critique 2 (2026-09-23): the old 'Choose a study to hear it'
              promised audio for all seven while two had any. */}
          <p className="audio-library-intro">Listen to a recorded study chapter by chapter, in reading order. The others open to read.</p>
        </header>

        <section className="audio-library-section" aria-labelledby="audio-studies-list">
          <div className="audio-library-section-head">
            <div><span>Study by study</span><h2 id="audio-studies-list">Studies</h2></div>
            <strong aria-label={studies.length + ' studies'}>{studies.length}</strong>
          </div>
          {studies.length ? (
            <p className="audio-studies-split">{withAudio + ' with audio · ' + (studies.length - withAudio) + ' to read'}</p>
          ) : null}
          {studies.length ? (
            <div className="audio-library-shelf">
              {studies.map((study) => {
                const recorded = studyRecordedCount(study);
                const playing = !!currentKey && (study.chapters || []).find((chapter) => chapter && currentKey === 'study:' + chapter.id);
                // Codex critique 1 (2026-09-23): a study with nothing to hear
                // opened an empty recordings page; it opens its text instead.
                const open = recorded || typeof onReadStudy !== 'function' ? () => onOpenStudy(study.id) : () => onReadStudy(study.id);
                return (
                  <button key={study.id} type="button" className="audio-library-shelf-row" onClick={open}>
                    <span className="audio-library-shelf-mark" aria-hidden="true">{recorded ? '♪' : '○'}</span>
                    <span className="audio-library-shelf-copy">
                      <strong>{study.title}</strong>
                      <small>{studyCountLine(study) + (playing ? ' · Playing chapter ' + (playing.num != null ? playing.num : '') : '')}</small>
                      {recorded ? <CoverageBadge state={COVERAGE_READ_ALONG} /> : (
                        <span className="coverage-badge-wrap">
                          <span className="coverage-badge coverage-badge-read-study" title="Not recorded yet: opens the study to read">Read study</span>
                        </span>
                      )}
                    </span>
                    <span className="audio-library-shelf-tail"><ArrowIcon /></span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="audio-library-empty">Loading the studies…</div>
          )}
        </section>
      </div>
    </ScreenLayout>
  );
}
