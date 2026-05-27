/* ═══════════════════════════════════════════════════════════════════════
   useBibleStudies — Bible Studies domain + UNIFIED_CHAIN (P7d)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   ## TDZ-BLOCKER PRIORITY ##

   This hook exists for a structural reason as much as a code-organization
   one: before P7d, getStudyById / getStudyChapter were const arrow helpers
   defined ~line 755 in App(). Any hook that needed them as PARAMS had to
   be CALLED AFTER that line — useAndroidBack (P6l), useNavHistoryTracking
   (P7a), and useSearch (P7c) all sit below the Bible Studies block for
   exactly this reason. Each one inherits the call-site-ordering
   constraint.

   Once those helpers are hook RETURNS (this file), the constraint lifts.
   useBibleStudies can be called very early in App() (right after the
   AppShell-level hooks); downstream hooks can then move up freely.
   Same principle as typing CachedStore before individual stores in Q4 —
   clear the structural blocker first, downstream work parallelizes.

   The "move downstream hooks up" reorganization is intentionally NOT
   done in P7d — that would mix two refactors. P7d extracts only; the
   freedom-to-move is the dividend that subsequent extractions can spend.

   ## OWNS ##

   - STUDIES                  Result of _studies() (cross-bundle global)
                              — the array of all Bible Letter Studies.
   - MATTHEW_CHAIN_ENTRY      Virtual entry that lets the Matthew Study
                              Bible appear inline alongside the 7 Bible
                              Letter Studies in StudiesHome / chain nav.
                              Reads _matthew() (cross-bundle global).
   - CHAIN_ORDER              The display order across the 8 entries
                              (7 studies + Matthew), tuned heavy → light
                              by content weight.
   - UNIFIED_CHAIN            CHAIN_ORDER → resolved entries (skipping
                              missing/locked studies, KEEPING Matthew
                              even though it has no isLocked flag).
   - chainIdx                 UNIFIED_CHAIN.findIndex helper (internal —
                              not returned; consumers use prev/next).

   ## OWNED HELPERS (pure data / lookup) ##

   - getStudyById(id)         → study | null. STUDIES.find by id.
   - getStudyChapter(study,   → chapter | null. study.chapters.find by id.
                      chId)
   - studyReadKey(slug)       → `bible-study-${slug}` formatted read-key.
                              Used both internally AND by 5 render-tree
                              consumers (last-read lookups, isRead, etc.)
                              so it's returned.
   - prevChainEntry(slug)     → adjacent UNIFIED_CHAIN entry or null.
   - nextChainEntry(slug)     → same.

   ## OWNED HELPERS (side-effects — call nav setters) ##

   - selectStudy(id)          Smart router: single-chapter / singlePage
                              studies go directly to bible-study-chapter
                              (with chapter pre-selected); multi-chapter
                              go to bible-study-index. Sets studyId,
                              optionally studyChapterId, activeReadKey,
                              and screen. Early-returns on locked /
                              empty / unknown.
   - selectStudyChapter(sid,  Direct chapter selection. Sets studyId,
                       chId)  studyChapterId, activeReadKey, screen.
                              Early-returns when study not found.
   - goToChainEntryFirst(slug) Returns a curried () → void that nav into
                              a chain entry's first chapter. Special-cases
                              'matthew-study' (sets fromStudies + book/
                              chapter/screen for the Matthew Study Bible).
   - goToChainEntryLast(slug)  Same shape, last chapter.

   ## DOES NOT OWN ##

   - The render of StudiesHome / BibleStudyIndex / BibleStudyChapter
     components — those live in ui/screens/. This hook returns the data
     + handlers they consume as props.
   - The nav state itself (studyId, studyChapterId) — those are tabFields
     owned by useTabs; this hook receives the setters as PARAMS.
   - The last-read coordination (setLastReadChapters) — owned by App() as
     a useState; passed as PARAM.

   ## PARAMS (single object, flat) ##

   - setScreen, setBookId, setChapterNum  Standard nav setters.
   - setStudyId, setStudyChapterId        Study-specific nav setters.
   - setActiveReadKey                     From useReadingDwell — sets the
                                          dwell-timer's active key + a
                                          last-read commit callback.
   - setLastReadChapters                  App() useState — the
                                          per-collection chapter cursor
                                          map. selectStudy + chain
                                          helpers write through this.
   - setFromStudies                       From useTabs tabField — set
                                          true when nav reaches the
                                          Matthew Study Bible via the
                                          chain (so back-from-matthew
                                          knows to return to studies).

   ## RETURNS ##

   {
     getStudyById, getStudyChapter, studyReadKey,
     selectStudy, selectStudyChapter,
     UNIFIED_CHAIN, prevChainEntry, nextChainEntry,
     goToChainEntryFirst, goToChainEntryLast,
   }

   ## READS FROM GLOBAL SCOPE (cross-bundle) ##

   - _studies()    Function returning the (lazy-loaded) Bible Studies
                   array. Bundled in cluster A.
   - _matthew()    Function returning the Matthew Study Bible data.
                   Bundled in cluster A.
   - MATTHEW       Module-global Matthew Study Bible data — used directly
                   for the last-chapter lookup in goToChainEntryLast.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Bible Studies domain hook. Owns STUDIES + UNIFIED_CHAIN data + the
 * lookup / nav helpers around them. Defining these as a hook (rather
 * than const arrows in App()) lifts the TDZ ordering constraint that
 * previously forced useAndroidBack / useNavHistoryTracking / useSearch
 * to sit below the Bible Studies block — the structural blocker that
 * made this the priority extraction.
 *
 * @param {{
 *   setScreen: (v: any) => void,
 *   setBookId: (v: any) => void,
 *   setChapterNum: (v: any) => void,
 *   setStudyId: (v: any) => void,
 *   setStudyChapterId: (v: any) => void,
 *   setActiveReadKey: (key: string, commitFn?: (() => void) | null) => void,
 *   setLastReadChapters: (updater: (prev: any) => any) => void,
 *   setFromStudies: (v: any) => void
 * }} args
 * @returns {{
 *   getStudyById: (id: string) => any,
 *   getStudyChapter: (study: any, chId: string) => any,
 *   studyReadKey: (slug: string) => string,
 *   selectStudy: (id: string) => void,
 *   selectStudyChapter: (sid: string, chId: string) => void,
 *   UNIFIED_CHAIN: any[],
 *   prevChainEntry: (slug: string) => any,
 *   nextChainEntry: (slug: string) => any,
 *   goToChainEntryFirst: (slug: string) => () => void,
 *   goToChainEntryLast: (slug: string) => () => void
 * }}
 */
export function useBibleStudies({
  setScreen, setBookId, setChapterNum,
  setStudyId, setStudyChapterId,
  setActiveReadKey, setLastReadChapters, setFromStudies,
}) {
  // ── Data ──────────────────────────────────────────────────────────────
  const STUDIES = _studies();
  const studyReadKey = (slug) => `bible-study-${slug}`;

  // ── Pure lookups ──────────────────────────────────────────────────────
  const getStudyById = (id) => STUDIES.find((s) => s.id === id) || null;
  const getStudyChapter = (study, chId) =>
    study && study.chapters ? study.chapters.find((c) => c.id === chId) : null;

  // ── selectStudy: smart single-vs-multi-chapter router ────────────────
  const selectStudy = (id) => {
    const study = getStudyById(id);
    if (!study || study.locked || !study.chapters?.length) return;
    setStudyId(id);
    if (study.chapters.length === 1 || study.singlePage) {
      const ch = study.chapters[0];
      setStudyChapterId(ch.id);
      setActiveReadKey(studyReadKey(study.slug), () => setLastReadChapters((prev) => ({ ...prev, [studyReadKey(study.slug)]: ch.id })));
      setScreen('bible-study-chapter');
    } else {
      setStudyChapterId(null);
      setActiveReadKey(studyReadKey(study.slug));
      setScreen('bible-study-index');
    }
  };

  // ── selectStudyChapter: direct chapter selection ─────────────────────
  const selectStudyChapter = (sid, chId) => {
    const study = getStudyById(sid);
    if (!study) return;
    setStudyId(sid);
    setStudyChapterId(chId);
    setActiveReadKey(studyReadKey(study.slug), () => setLastReadChapters((prev) => ({ ...prev, [studyReadKey(study.slug)]: chId })));
    setScreen('bible-study-chapter');
  };

  // ─── UNIFIED STUDY CHAIN ──────────────────────────────────────────────
  // Includes the 7 Bible Letter Studies AND the Matthew Study Bible as a
  // virtual entry, ordered heavy → light by content weight. Matthew is
  // ~389 KB so it lands at position 2 (after More Than a Man). Cross-chain
  // prev/next, StudiesHome rendering, and matthew-ch boundary nav all
  // consume this one list so everything stays in sync.
  const MATTHEW_CHAIN_ENTRY = {
    id: 'matthew-study', slug: 'matthew-study',
    title: 'The Volumes of Truth New Testament Study Bible - The Book of Matthew',
    isMatthewStudy: true,
    chapters: (_matthew() || {}).chapters || [],
  };
  const CHAIN_ORDER = [
    'more-than-a-man',
    'matthew-study',
    'purity',
    'state-of-the-dead',
    'grace-and-the-law',
    'lamb-of-god',
    'trinity-exposed',
    'odds-chart',
  ];

  const UNIFIED_CHAIN = CHAIN_ORDER.
    map((slug) => slug === 'matthew-study' ? MATTHEW_CHAIN_ENTRY : STUDIES.find((s) => s.id === slug)).
    filter((e) => e && (e.isMatthewStudy || !e.locked && e.chapters && e.chapters.length > 0));

  const chainIdx = (slug) => UNIFIED_CHAIN.findIndex((e) => e.slug === slug);
  const prevChainEntry = (slug) => { const i = chainIdx(slug); return i > 0 ? UNIFIED_CHAIN[i - 1] : null; };
  const nextChainEntry = (slug) => { const i = chainIdx(slug); return i >= 0 && i < UNIFIED_CHAIN.length - 1 ? UNIFIED_CHAIN[i + 1] : null; };

  // ── Chain entry navigation ───────────────────────────────────────────
  // Returns a curried () → void so the render tree can wire these as
  // onPrevBoundary / onNextBoundary directly (no extra arrow at the
  // call site). Special-cases 'matthew-study' to route into the
  // Matthew Study Bible's bible-ch screen rather than via
  // selectStudyChapter (which would route to bible-study-chapter, the
  // wrong renderer for Matthew).
  const goToChainEntryFirst = (slug) => () => {
    if (slug === 'matthew-study') {
      setFromStudies(true);
      setBookId('matthew'); setChapterNum(1); setScreen('matthew-ch');
      setActiveReadKey('matthew', () => setLastReadChapters((prev) => ({ ...prev, matthew: 1 })));
      return;
    }
    const s = getStudyById(slug);
    if (!s || !s.chapters?.length) return;
    selectStudyChapter(slug, s.chapters[0].id);
  };
  const goToChainEntryLast = (slug) => () => {
    if (slug === 'matthew-study') {
      // Q8.2: MATTHEW is lazy-loaded via bundle-a-matthew. Bare MATTHEW
      // ref would throw ReferenceError if this handler fires before
      // __loadMatthewCorpus resolves (race: saved-tab cold-boot inside
      // a different study chain → user taps "go to last chapter" before
      // HomeScreen / StudiesHome's pre-fire effect resolved). Use the
      // window-prefixed access so the typeof check is safe; silently
      // no-op until the corpus loads (the user can retry).
      const _MATTHEW = (typeof window !== 'undefined') ? window.MATTHEW : null;
      if (!_MATTHEW) return;
      setFromStudies(true);
      const lastNum = _MATTHEW.chapters[_MATTHEW.chapters.length - 1].num;
      setBookId('matthew'); setChapterNum(lastNum); setScreen('matthew-ch');
      setActiveReadKey('matthew', () => setLastReadChapters((prev) => ({ ...prev, matthew: lastNum })));
      return;
    }
    const s = getStudyById(slug);
    if (!s || !s.chapters?.length) return;
    selectStudyChapter(slug, s.chapters[s.chapters.length - 1].id);
  };

  return {
    getStudyById, getStudyChapter, studyReadKey,
    selectStudy, selectStudyChapter,
    UNIFIED_CHAIN, prevChainEntry, nextChainEntry,
    goToChainEntryFirst, goToChainEntryLast,
  };
}
