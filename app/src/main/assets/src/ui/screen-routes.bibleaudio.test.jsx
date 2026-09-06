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
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildScreenRoutes } from './screen-routes.jsx';

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

/* ONE PROP, FOUR ROUTES, AND ONLY ONE OF THEM WAS EVER MEASURED.
   ----------------------------------------------------------------------
   `bibleAudioFor` is one closure and every route calls it, so the four cases
   this file used to carry were written against 'bible-ch' alone and read as
   though they covered the behaviour. They covered ONE CALLER. The finding
   named two sites; the file has FOUR - 'matthew-idx' and 'matthew-ch' resolve
   `bibleAudioFor(MATTHEW.id)`, a FIXED book rather than a missing one, and
   c48's tsot-matthew is exactly the partial edition that makes a fixed book
   interesting.

   So the site list is DERIVED from screen-routes.jsx rather than written here.
   A fifth call site added tomorrow fails the gate below instead of quietly
   joining the three that nothing drives.

   LIMIT, stated so nobody trusts it further than it goes: the derivation reads
   the source as TEXT and pairs each `bibleAudioFor(` with the nearest preceding
   route key at the factory's own indentation. It would miss a call written
   through an alias or built at runtime. Same deliberate trade as the other
   source-text gates in this repo, and every case below is behavioural anyway.
*/
const ROUTES_SRC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'screen-routes.jsx'), 'utf8');

/** Every route key whose body calls bibleAudioFor(, read out of the source. */
function derivedSites() {
  const out = new Set();
  let route = null;
  for (const line of ROUTES_SRC.split(/\r?\n/)) {
    const m = /^ {4}'([a-z0-9-]+)': \(\) =>/.exec(line);
    if (m) route = m[1];
    if (line.includes('bibleAudioFor(') && route) out.add(route);
  }
  return out;
}

/* Each route, and the book it actually resolves audio FOR. The bible routes
   take it from props; the Matthew routes hard-code MATTHEW.id, which is why a
   loop over books alone would never reach them. */
const COVERED = [
  { route: 'bible-idx', book: 'genesis' },
  { route: 'bible-ch', book: 'genesis' },
  { route: 'matthew-idx', book: 'matthew' },
  { route: 'matthew-ch', book: 'matthew' },
];

const ROW = (id) => [[id, '', 'Chapter 1']];
/* The selected edition (web) CARRIES the book: the reader's choice must stand. */
const CARRIES = (book) => ({
  ['bible-brm-kjv:' + book]: ROW('brm_' + book),
  ['bible-web:' + book]: ROW('web_' + book),
});
/* The selected edition LACKS it, but is a real edition with rows elsewhere, so
   the per-book fallback must reach the default rather than blank the book. */
const LACKS = (book) => ({
  ['bible-brm-kjv:' + book]: ROW('brm_' + book),
  'bible-web:john': ROW('web_john'),
});

/** The bibleAudio prop a given ROUTE hands its screen, or null. */
const audioPropFor = (route, book, bibleAudio = 'web-ebible') => {
  const el = makeRoutes(book, bibleAudio)[route]();
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

function installGlobals(manifest) {
  globalThis.BIBLE_AUDIO_MANIFEST = manifest;
  // The screens are free-var globals from a lazily-loaded bundle. A stub is
  // enough here because nothing is mounted - the assertions read the element's
  // props. Without it every case throws ReferenceError, which the CONTROL
  // caught on the first run: three reds read like a missing fix, and the
  // control is what said the harness could not reach the code.
  globalThis.BibleChapterView = function BibleChapterView() { return null; };
  globalThis.ChapterIndex = function ChapterIndex() { return null; };
  globalThis.MatthewChapterView = function MatthewChapterView() { return null; };
  // The two matthew-* routes short-circuit to a loading view while MATTHEW is
  // undefined, so without this they never reach bibleAudioFor at all and the
  // prop walk returns `undefined`. That is not null and would fail loudly, but
  // the REACHABILITY case below is what says so rather than leaving it to luck.
  globalThis.MATTHEW = { id: 'matthew', title: 'Matthew', chapters: [{ num: 1, verses: [] }] };
}
function dropGlobals() {
  delete globalThis.BIBLE_AUDIO_MANIFEST;
  delete globalThis.BibleChapterView;
  delete globalThis.ChapterIndex;
  delete globalThis.MatthewChapterView;
  delete globalThis.MATTHEW;
}

describe('the Bible-audio prop is resolved per BOOK, at every route that resolves one', () => {
  afterEach(dropGlobals);

  it('THE SITE LIST IS DERIVED: every route that calls bibleAudioFor is driven below', () => {
    /* The gate a hand-written list cannot give. If a fifth site appears, or one
       of these four is renamed, this fails instead of the coverage silently
       shrinking to whatever the list still names. */
    const derived = derivedSites();
    const covered = new Set(COVERED.map((c) => c.route));
    expect([...derived].sort()).toEqual([...covered].sort());
    // FLOOR: a derivation that matched nothing would agree with an empty list.
    expect(derived.size).toBeGreaterThanOrEqual(4);
  });

  for (const { route, book } of COVERED) {
    describe(route, () => {
      it('PRECONDITION: the two manifests differ in exactly the selected edition row for this book', () => {
        /* If they ever stopped differing there, "falls back" and "keeps the
           choice" would be the same question asked twice. */
        expect(CARRIES(book)['bible-web:' + book], 'web must carry it').toBeTruthy();
        expect(LACKS(book)['bible-web:' + book], 'web must NOT carry it').toBeFalsy();
        expect(CARRIES(book)['bible-brm-kjv:' + book], 'the default must carry it').toBeTruthy();
        expect(LACKS(book)['bible-brm-kjv:' + book], 'the default must carry it').toBeTruthy();
      });

      it('REACHABILITY: this route really does hand a prop down', () => {
        /* An assertion about a prop is worthless if the route returned a loading
           view instead. `undefined` means the walk found no element carrying
           bibleAudio at all; null is a real answer and passes here. */
        installGlobals(CARRIES(book));
        expect(audioPropFor(route, book)).not.toBe(undefined);
      });

      it('CONTROL: a book the selected edition carries keeps that edition', () => {
        /* Passes before and after ON PURPOSE. Without it, "it falls back" is
           satisfied by a wiring that always returns the default and never
           honours the reader's choice at all. */
        installGlobals(CARRIES(book));
        expect(audioPropFor(route, book).volKey).toBe('bible-web');
      });

      it('a book the selected edition LACKS falls back to the default', () => {
        installGlobals(LACKS(book));
        expect(audioPropFor(route, book).volKey).toBe('bible-brm-kjv');
      });

      it('and Bible audio off still yields nothing, per book or otherwise', () => {
        installGlobals(CARRIES(book));
        expect(audioPropFor(route, book, 'off')).toBeNull();
      });
    });
  }
});
