// @ts-nocheck — free-var globals, same shape as screen-routes.dead-letter.test.jsx
/* The Bible-audio prop is resolved ONCE for every screen, with no bookId.
   ═══════════════════════════════════════════════════════════════════════
   screen-routes.jsx:274 builds

       const _bibleAudioEd = resolveBibleAudio({ settings }).offer;

   and hands the SAME object to four screens (:1006, :1062, :1090, :1147).
   `offer`'s whole job is the per-book fallback — "one partial edition must not
   blank 65 books" — and it cannot do it without a bookId, so the fallback arm
   is unreachable from the app. Its own comment says so: "Per-book resolution
   lands with the first partial edition, where it can be bitten." c48's
   tsot-matthew is that edition, so the trigger has arrived.

   THE BRIEF NAMED THE WRONG CONSEQUENCE, so this measures both halves.
   Three of the four consumers guard the prop with
   `AudioPlayer.hasAudio(volKey, book.id)` (ChapterIndex.jsx:95,
   BibleChapterView.jsx:195, and MatthewChapterView which passes it down), so a
   volKey with no row for that book merely HIDES the Listen pill. But
   BibleChapterView.jsx:320 mounts ReadAlongHighlight with
   `volKey={bibleAudio.volKey}` and NOTHING guards it — that is the site where
   the volKey actually selects a timings file. A gate on the pill alone would
   pass a fix that leaves the read-along reading from the wrong edition.

   These read the ELEMENT'S PROPS rather than mounting, because the defect is
   which value is passed and not what a consumer does with it. Mounting would
   drag in four screens' worth of globals to measure one object.
*/
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildScreenRoutes } from './screen-routes.jsx';

/* A manifest where the SELECTED edition is partial: web carries john and not
   genesis; the default (brm-kjv) carries both. That asymmetry is the whole
   fixture — a manifest where every edition carries every book cannot tell a
   per-book resolution from a global one. */
const MANIFEST = {
  'bible-brm-kjv:genesis': [['brm1_genesis_001', '', 'Chapter 1']],
  'bible-brm-kjv:john': [['brm2_john_001', '', 'Chapter 1']],
  'bible-web:john': [['web2_john_001', '', 'Chapter 1']],
};

const BOOK = (id) => ({ id, title: id, chapters: [{ num: 1, verses: [] }] });

function makeRoutes(bookId, bibleAudio = 'web-ebible') {
  const props = {
    screen: 'bible-ch', book: BOOK(bookId), chapter: { num: 1, verses: [] },
    bookId, chapterNum: 1,
    settings: { bibleAudio },
    activeVolKey: null, activeLetter: null,
    boundaryConfig: vi.fn(() => ({})),
    readHistory: [],
    goNavOrigin: vi.fn(), goSearch: vi.fn(), goSettings: vi.fn(), goHistory: vi.fn(),
    getStudyById: vi.fn(() => null),
    studyReadKey: (slug) => 'study:' + slug,
    setActiveReadKey: vi.fn(),
    setLastReadChapters: vi.fn(), setLastReadForVol: vi.fn(),
    setGenreId: vi.fn(), navigateToLink: vi.fn(),
    clearHistory: vi.fn(), pruneHistoryDay: vi.fn(),
    theme: 'dark', setTheme: vi.fn(),
    setScreen: vi.fn(), setBookId: vi.fn(), setChapterNum: vi.fn(), setLetterId: vi.fn(),
    setStudyId: vi.fn(), setStudyChapterId: vi.fn(),
    setNavOrigin: vi.fn(), navOrigin: null, pushFromLetter: vi.fn(),
    fromSearch: false, setFromSearch: vi.fn(),
    fromStudies: false, setFromStudies: vi.fn(),
    genreId: null, setSurpriseAnchor: vi.fn(),
    audioColKey: null, setAudioColKey: vi.fn(),
    goStudiesHome: vi.fn(), goScripturesHome: vi.fn(), goHome: vi.fn(),
    goBibleIdx: vi.fn(),
    selectMatthewCh: vi.fn(), selectBibleCh: vi.fn(),
    activeReadKey: null, lastReadChapters: {},
    getReadKey: vi.fn(() => 'bible:genesis'), readKeyFor: vi.fn(() => 'bible:genesis'),
    isRead: vi.fn(() => false),
    setFromWtlb: vi.fn(),
    gardenPage: 1, setGardenPage: vi.fn(),
    toggleSetting: vi.fn(), updateSetting: vi.fn(), setSettings: vi.fn(),
    titleFocusHidden: false, setTitleFocusHidden: vi.fn(),
    headingsFocusHidden: false, setHeadingsFocusHidden: vi.fn(),
    mode: 'read', setMode: vi.fn(), showStudy: false, setShowStudy: vi.fn(),
    surpriseAnchor: null,
  };
  return buildScreenRoutes(props);
}

/** The bibleAudio prop the chapter view is actually handed, or null. */
const audioPropFor = (bookId, bibleAudio) => {
  const el = makeRoutes(bookId, bibleAudio)['bible-ch']();
  // _wrapVot and friends may nest; walk to the first element carrying the prop.
  const find = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 6) return undefined;
    if (node.props && 'bibleAudio' in node.props) return node.props.bibleAudio;
    if (node.props && node.props.children) {
      const kids = [].concat(node.props.children);
      for (const k of kids) {
        const hit = find(k, depth + 1);
        if (hit !== undefined) return hit;
      }
    }
    return undefined;
  };
  return find(el);
};

describe('the Bible-audio prop is resolved per BOOK, not once per app', () => {
  beforeEach(() => {
    globalThis.BIBLE_AUDIO_MANIFEST = MANIFEST;
    // The screens are free-var globals from a lazily-loaded bundle. A stub is
    // enough here because nothing is mounted — the assertions read the element's
    // props. Without it every case throws ReferenceError, which the CONTROL
    // caught on the first run: three reds read like a missing fix, and the
    // control is what said the harness could not reach the code.
    globalThis.BibleChapterView = function BibleChapterView() { return null; };
    globalThis.ChapterIndex = function ChapterIndex() { return null; };
    globalThis.MatthewChapterView = function MatthewChapterView() { return null; };
  });
  afterEach(() => {
    delete globalThis.BIBLE_AUDIO_MANIFEST;
    delete globalThis.BibleChapterView;
    delete globalThis.ChapterIndex;
    delete globalThis.MatthewChapterView;
  });

  it('CONTROL: a book the selected edition carries keeps that edition', () => {
    // Passes before and after ON PURPOSE. Without it, "genesis falls back" is
    // satisfied by a wiring that always returns the default and never honours
    // the reader's choice at all.
    expect(audioPropFor('john').volKey).toBe('bible-web');
  });

  it('a book the selected edition LACKS falls back to the default', () => {
    // Today: one prop for every screen, resolved with no bookId, so genesis is
    // handed 'bible-web' — an edition with no row for it.
    expect(audioPropFor('genesis').volKey).toBe('bible-brm-kjv');
  });

  it('PRECONDITION: the fixture can tell the two apart', () => {
    // If the manifest ever gains 'bible-web:genesis' the case above passes for
    // the wrong reason, because both editions would then carry the book.
    expect(MANIFEST['bible-web:john'], 'web must carry john').toBeTruthy();
    expect(MANIFEST['bible-web:genesis'], 'web must NOT carry genesis').toBeFalsy();
    expect(MANIFEST['bible-brm-kjv:genesis'], 'the default must carry it').toBeTruthy();
  });

  it('and Bible audio off still yields nothing, per book or otherwise', () => {
    expect(audioPropFor('genesis', 'off')).toBeNull();
    expect(audioPropFor('john', 'off')).toBeNull();
  });
});
