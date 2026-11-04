/* ─────────────────────────────────────────────────────────────────────────
   corpus-links — every cross-reference in the corpus resolves (tools/corpus-links.js)

   The walk reads every link the corpus carries (letter links, "Also read",
   Holy Days sources, Format B source lines, footnotes and inline cites with
   their translation tags, the Matthew Study Bible's notes and cites, Hidden
   Manna's reach, verse ranges, nav-chain titles, and whether quoted words are
   in the letter a link opens) through the app's own lookups. The kinds and
   what each means are in the module's header.

   The corpus held breaks the day this landed. Each is in KNOWN_BREAKS below,
   one entry per break, naming what it points at and, when that is clear, what
   it should point at. So:
     - a NEW break fails: fix the data (or, when the lookup code is wrong, the
       code, with a test). The message prints the entry; never add it here
       without the owner's word.
     - a FIXED break fails too, until its entry is removed: the list only ever
       shrinks, and KNOWN_CEILING (the count it started at) only goes down.
   The breaks are data (a corpus byte change, so a CORPUS_VERSION bump); this
   file and the walk never edit the corpus. `node tools/corpus-links.js`
   prints the whole worklist with the reason for each.

   Owned elsewhere, so not re-checked here: schema shapes and CORP-2's exact
   collection labels (npm run validate:data), footnote verse markers (npm run
   check:footnotes), dashes and smart quotes in raw text (check_balance.py),
   bundled-translation wording (validateTaggedDictValues), Answers site URLs
   (answers-links.test.js), note footnotes' source letters
   (footnote-note.test.js), OCR attribution (misattribution_check.py).
   tools/index-link-preview.test.js is the site's Open Graph card, not a
   corpus link.
   ───────────────────────────────────────────────────────────────────────── */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, cleanup, fireEvent } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import {
  KINDS, ASSETS_DIR, loadCorpus, buildRegistry, checkCorpusLinks, attrCollectionLabel,
  finishVotInitSource, hiddenMannaTitlesIn,
} from './corpus-links.js';
import { COLLECTIONS, COL_BY_KEY } from '../app/src/main/assets/src/data/scripture-resolution.js';
import { LetterView } from '../app/src/main/assets/src/ui/screens/LetterView.jsx';
import { Segments } from '../app/src/main/assets/src/ui/components/Segments.jsx';
import { LibraryNav } from '../app/src/main/assets/src/ui/components/LibraryNav.jsx';
import { AudioPlayer } from '../app/src/main/assets/src/utils/audio-player.js';

const SRC = resolve(ASSETS_DIR, 'src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// ── the known breaks (2026-11-04): fix the data, then delete the entry ──────
// Matched on kind + where + target (as a multiset: two identical links are two
// entries). `should` is the walk's advice that day, for the person fixing it.
const KNOWN_BREAKS = [
  // (letter-link 20, letter-id 3, verse-range 4 and matthew-cite "1 John 3:2" were
  //  fixed in the data the same day, CORPUS_VERSION c76; 39 -> 11.)
  // ── excerpt (7): the study quotes words its link's letter does not hold, and
  //    another original letter does (a misattribution: the tap lands elsewhere).
  { kind: 'excerpt', where: 'bible-studies.js more-than-a-man-ch6 letter-link', target: 'Words To Live By: Part Two::Bear Fruit', should: 'Volume Two::Bear Much Fruit, the Harvest Is Near' },
  { kind: 'excerpt', where: 'bible-studies.js more-than-a-man-ch6 letter-link', target: 'Volume Five::False Miracles and Lies, Deceived and Ignorant People', should: 'Volume Seven::The Prophets Are Sent Out, True and False; the High-Minded Abased, the Lowly Uplifted... The Great and Terrible Day of The Lord Is Near, and Who Shall Stand' },
  { kind: 'excerpt', where: 'bible-studies.js more-than-a-man-ch6 letter-link', target: 'Volume Six::Deliverance', should: 'Words To Live By: Part One::Deliverance' },
  { kind: 'excerpt', where: 'bible-studies.js more-than-a-man-ch6 letter-link', target: 'Volume Seven::I Shall Remove My Hand and My Spirit Shall Be Withdrawn... And That Purposed from the Beginning Shall Be Done, It Shall Be Accomplished Swiftly', should: 'Volume Three::The Mountains Shall Crumble and Fall Upon the Desolate' },
  { kind: 'excerpt', where: 'bible-studies.js more-than-a-man-ch6 letter-link', target: 'A Testament Against The World: The Lord\'s Rebuke::Blood Pours Down', should: 'Volume Seven::Captive Children (a Lamentation)' },
  { kind: 'excerpt', where: 'bible-studies.js more-than-a-man-ch6 letter-link', target: 'Volume Seven::I Can Wait No Longer', should: 'Volume Three::The Mountains Shall Crumble and Fall Upon the Desolate' },
  // the prayer half is WTLB Two "I Am The Lord's"; the rest is in no original letter (Answers credits it to "Born Again", which lacks it too)
  { kind: 'excerpt', where: 'bible-studies.js purity-ch1 letter-link', target: 'Volume One::Know That Which Has Been Poured Out, The Word of God' },
  // ── matthew-note (3): Hidden Manna letters index.html names but hidden-manna.js
  //    never imported; the notes show the badge and no tap.
  { kind: 'matthew-note', where: 'matthew.js chapter 10 note 10:9', target: 'I Have Purged; Behold, I Shall Wipe Away and Restore::I Have Purged; Behold, I Shall Wipe Away and Restore' },
  { kind: 'matthew-note', where: 'matthew.js chapter 10 note 10:19', target: 'I Have Purged; Behold, I Shall Wipe Away and Restore::I Have Purged; Behold, I Shall Wipe Away and Restore' },
  { kind: 'matthew-note', where: 'matthew.js chapter 26 note 26:28', target: 'The Promise::The Promise' },
  // ── matthew-cite (1): a reference missing from MATTHEW_NKJV renders as untappable commentary.
  { kind: 'matthew-cite', where: 'matthew.js chapter 11 scripture 11:13-14', target: 'Malachi 4:4-6' },
];
// The count the list started at. Lower it as entries go; never raise it.
const KNOWN_CEILING = 11;

const keyOf = (b) => `${b.kind} | ${b.where} | ${b.target}`;
/** a − b, as multisets of keys. */
function minus(a, b) {
  const left = new Map();
  for (const x of b) left.set(keyOf(x), (left.get(keyOf(x)) || 0) + 1);
  return a.filter((x) => {
    const n = left.get(keyOf(x)) || 0;
    if (n > 0) { left.set(keyOf(x), n - 1); return false; }
    return true;
  });
}
const show = (b) => `{ kind: '${b.kind}', where: ${JSON.stringify(b.where)}, target: ${JSON.stringify(b.target)}${b.should ? `, should: ${JSON.stringify(b.should)}` : ''} }  // ${b.why || ''}`;

// ── a small corpus with every kind of link, all of them good ─────────────────
const ALPHA = 'The quick words of the alpha letter stand here for every reader who will find them and keep them close';
const BETA = 'Hear the beta letter now, for its words are plain and its counsel is given to all who listen with an open heart';
const TEXT = (v) => ({ type: 'para', segments: [{ t: 'text', v }] });

function cleanCorpus() {
  const A = {
    id: 'a', title: 'Alpha’s Letter',
    blocks: [{ type: 'para', segments: [{ t: 'text', v: ALPHA }, { t: 'fn', v: '1' }, { t: 'fn', v: '2' }] }],
    footnotes: { 1: { type: 'scripture', ref: 'John 3:16' }, 2: { type: 'note', text: 'Also read', link: { collection: 'Volume One', letterTitle: 'Beta' } } },
    nkjv: { 'John 3:16': 'For God so loved the world' },
    metaAddendum: '"Beta"', metaAddendumLink: { collection: 'Volume One', letterTitle: 'Beta' },
    prevLetter: null, nextLetter: { id: 'b', title: 'Beta' },
  };
  const B = {
    id: 'b', title: 'Beta', blocks: [TEXT(BETA)], footnotes: {}, nkjv: {},
    metaAddendum: '“Alpha’s Letter”', metaAddendumInternal: 'a',
    prevLetter: { id: 'a', title: 'Alpha’s Letter' }, nextLetter: null,
  };
  return {
    hiddenMannaTitles: ['Hidden One'],
    globals: {
      LETTERS_V1: [A, B],
      LETTERS_V1_PREFACE: null,
      WTLB_ONE: [{ id: 'w', title: 'Words', paragraphs: [{ align: 'justify', text: `${ALPHA} {{ref:John 3:17}} and {{nav:genesis:1}}. ~ [From “Alpha’s Letter” ~ Volume 1]` }] }],
      WTLB_SCRIPTURES: { 'John 3:17': 'For God did not send His Son' },
      THE_BLESSED: [{ id: 'introduction', title: 'The Blessed: More Declarations of Blessedness From The Lord, Our God and Savior', paragraphs: [] }],
      HOLY_DAYS: [{ id: 'beta-copy', title: 'Beta', type: 'letter', sourceLabel: 'Volume One', blocks: [TEXT(BETA)], footnotes: {}, nkjv: {} }],
      HIDDEN_MANNA: [{ id: 'hm', title: 'Hidden One', blocks: [TEXT('A word kept apart')], footnotes: {}, nkjv: {} }],
      ANSWERS: [{ id: 'topic', title: 'Topic', paragraphs: [{ align: 'justify', text: BETA }, { align: 'right', text: '~ [From “Beta” ~ Volume 1]' }] }],
      ANSWERS_META: { topic: { bareLinks: { 0: [{ kind: 'letter', collection: 'Volume 1', title: 'Beta', url: 'https://www.thevolumesoftruth.com/Beta' }] } } },
      BIBLE_STUDIES: [{
        id: 's', slug: 's', title: 'A Study',
        chapters: [{ id: 's-ch1', title: 'One', blocks: [{ type: 'para', segments: [
          { t: 'text', v: ALPHA + ' (An excerpt from ' },
          { t: 'letter-link', letterId: 'a', screen: 'vot-one-letter', label: '"Alpha’s Letter" - Volume One', link: { collection: 'Volume One', letterTitle: 'Alpha’s Letter' } },
          { t: 'text', v: ')' },
        ] }] }],
      }],
      MATTHEW: {
        id: 'matthew', title: 'Matthew', preface: { blocks: [] },
        chapters: [{
          num: 1, verses: [{ n: 1, text: 'x' }, { n: 2, text: 'y' }],
          votNotes: [{ ref: '1:1', vol: 'Volume One', letter: 'Beta', excerpt: BETA }, { ref: '1:2', vol: 'Hidden One', letter: 'Hidden One', excerpt: '' }],
          scriptures: [{ ref: '1:1', cite: 'John 3:16' }, { ref: '1:2', cite: 'A plain word of commentary' }],
        }],
      },
      MATTHEW_NKJV: { 'John 3:16': 'For God so loved the world' },
      MATTHEW_PLAIN: undefined,
      BOOKS: {
        genesis: { id: 'genesis', title: 'Genesis', chapters: [{ num: 1, sections: [{ verses: [{ n: 1, text: 'In the beginning' }] }] }] },
        john: { id: 'john', title: 'John', chapters: [{ num: 3, sections: [{ verses: [16, 17, 18].map((n) => ({ n, text: 'v' + n })) }] }] },
      },
    },
  };
}

/** Each kind's break, injected into the clean corpus: [kind, mutate, expected target, expected should]. */
const DEFECTS = [
  ['letter-link', (g) => { g.BIBLE_STUDIES[0].chapters[0].blocks[0].segments[1].link.letterTitle = "Alpha's Letter"; }, "Volume One::Alpha's Letter", 'Volume One::Alpha’s Letter'],
  ['letter-id', (g) => { g.BIBLE_STUDIES[0].chapters[0].blocks[0].segments[1].letterId = 'b'; }, 'vot-one-letter/b', 'vot-one-letter/a'],
  ['excerpt', (g) => { g.MATTHEW.chapters[0].votNotes[0].excerpt = ALPHA; }, 'Volume One::Beta', 'Volume One::Alpha’s Letter'],
  ['also-read', (g) => { g.LETTERS_V1[1].metaAddendumInternal = 'gone'; }, 'Volume One id gone', undefined],
  ['attribution', (g) => { g.WTLB_ONE[0].paragraphs[0].text = g.WTLB_ONE[0].paragraphs[0].text.replace('~ Volume 1]', '~ Letters to the Flock]'); }, 'Letters to the Flock::Alpha’s Letter', undefined],
  ['holy-days-source', (g) => { g.HOLY_DAYS[0].sourceLabel = 'Volume Two'; }, 'Volume Two::Beta', undefined],
  ['footnote', (g) => { g.LETTERS_V1[0].footnotes[1].ref = 'John 3:17 (CJB)'; }, 'John 3:17 (CJB)', undefined],
  ['inline-cite', (g) => { g.WTLB_ONE[0].paragraphs[0].text = g.WTLB_ONE[0].paragraphs[0].text.replace('{{ref:John 3:17}}', '{{ref:Genesis 1:1 (CJB)}}'); }, 'Genesis 1:1 (CJB)', undefined],
  ['bible-nav', (g) => { g.WTLB_ONE[0].paragraphs[0].text = g.WTLB_ONE[0].paragraphs[0].text.replace('{{nav:genesis:1}}', '{{nav:genesis:2}}'); }, '{{nav:genesis:2}}', undefined],
  ['matthew-note', (g) => { g.MATTHEW.chapters[0].votNotes[0].letter = 'Gamma'; }, 'Volume One::Gamma', undefined],
  ['matthew-cite', (g) => { g.MATTHEW.chapters[0].scriptures[0].cite = 'John 3:18'; }, 'John 3:18', undefined],
  ['hidden-manna', (g) => { g.LETTERS_V1[0].footnotes[2].link = { collection: 'Hidden Manna', letterTitle: 'Hidden One' }; }, 'Hidden Manna::Hidden One', undefined],
  ['verse-range', (g) => { g.WTLB_ONE[0].paragraphs[0].text = g.WTLB_ONE[0].paragraphs[0].text.replace('{{ref:John 3:17}}', '{{ref:John 3:16–17}}'); }, 'John 3:16–17', 'John 3:16-17'],
  ['nav-chain', (g) => { g.LETTERS_V1[0].nextLetter.title = 'Betta'; }, 'b "Betta"', 'Beta'],
];

describe('corpus-links on a small corpus: every kind catches its break', () => {
  it('passes a corpus whose every link resolves, and walks every kind', () => {
    const { checked, breaks } = checkCorpusLinks(cleanCorpus());
    expect(breaks).toEqual([]);
    for (const k of KINDS) expect(checked[k], k).toBeGreaterThan(0);
  });

  it.each(DEFECTS)('%s', (kind, mutate, target, should) => {
    const corpus = cleanCorpus();
    mutate(corpus.globals);
    const { breaks } = checkCorpusLinks(corpus);
    expect(breaks.map((b) => `${b.kind} → ${b.target}`)).toEqual([`${kind} → ${target}`]);
    expect(breaks[0].should).toBe(should);
    expect(breaks[0].why.length).toBeGreaterThan(10);
  });

  it('a range run backwards, and a bare tag, are breaks of their own', () => {
    const corpus = cleanCorpus();
    corpus.globals.LETTERS_V1[0].footnotes[1].ref = 'John 3:18-16';
    corpus.globals.LETTERS_V1[0].nkjv = { 'John 3:18-16': 'text' };
    corpus.globals.MATTHEW_NKJV['John 3:16 CJB'] = 'text';
    expect(checkCorpusLinks(corpus).breaks.map((b) => `${b.kind} → ${b.target} → ${b.should || ''}`)).toEqual([
      'verse-range → John 3:18-16 → ',
      'verse-range → John 3:16 CJB → John 3:16 (CJB)',
    ]);
  });

  it('a letter-link inside a poem is checked once, with the lines before it as its excerpt', () => {
    const corpus = cleanCorpus();
    corpus.globals.BIBLE_STUDIES[0].chapters[0].blocks.push({ type: 'poetry', lines: [
      [{ t: 'text', v: ALPHA.slice(0, 50) }],
      [{ t: 'text', v: ALPHA.slice(50) + ' (' }, { t: 'letter-link', letterId: 'b', screen: 'vot-one-letter', label: '"Alpha’s Letter" - Volume One', link: { collection: 'Volume One', letterTitle: 'Alpha’s Letter' } }],
    ] });
    const { breaks } = checkCorpusLinks(corpus);
    expect(breaks.map((b) => `${b.kind} → ${b.target}`)).toEqual(['letter-id → vot-one-letter/b']);
    expect(breaks[0].why).toMatch(/100% in the link's letter, 0% in letterId's/);
  });

  it('an Answers sidecar link into Hidden Manna is a public link to it', () => {
    const corpus = cleanCorpus();
    corpus.globals.ANSWERS_META.topic.bareLinks[0].push({ kind: 'letter', collection: 'Hidden Manna', title: 'Hidden One' });
    expect(checkCorpusLinks(corpus).breaks.map((b) => `${b.kind} → ${b.target}`)).toEqual(['hidden-manna → Hidden Manna::Hidden One']);
  });

  it('two items sharing a title in one collection are a break (the registry keeps only the last)', () => {
    const corpus = cleanCorpus();
    corpus.globals.LETTERS_V1.push({ ...corpus.globals.LETTERS_V1[1], id: 'b2', prevLetter: null, nextLetter: null, metaAddendum: undefined });
    expect(checkCorpusLinks(corpus).breaks.map((b) => `${b.kind} → ${b.target}`)).toEqual(['letter-link → Volume One::Beta']);
  });
});

// ── the premises the walk stands on, held to the code ────────────────────────
describe('corpus-links models the app', () => {
  it('a study chapter follows seg.link, not letterId (so seg.link must resolve)', () => {
    // LetterView renders every study chapter (BibleStudyChapterView spreads
    // sharedViewProps, which carries onInAppLink), and Segments takes path (a)
    // whenever a segment has a link: onInAppLink(seg.link), which resolves the
    // title in VOT_LETTER_REGISTRY and does nothing when it misses.
    const h = React.createElement;
    const set = {
      ReactDOM, ScreenLayout: ({ children, navChildren }) => h('div', null, navChildren, children),
      StickyChapterNav: () => null, HomeBtn: () => null, NavButtons: () => null, LibraryNav, FootnoteSheet: () => null,
      useMarkAsRead: () => {}, useModalRegistry: () => {}, Segments, ProphecyGroup: () => null, ProphecyExpandToggle: () => null,
      StaticSubtree: ({ children }) => h(React.Fragment, null, children), letterHlKey: (id, bi) => id + ':' + bi,
    };
    const realAudio = { hasAudio: AudioPlayer.hasAudio, playLetter: AudioPlayer.playLetter, prewarm: AudioPlayer.prewarm };
    Object.assign(globalThis, set);
    window.navHandoff = { peek: () => null, clear: () => {} };
    Object.assign(AudioPlayer, { hasAudio: () => false, playLetter: () => {}, prewarm: () => {} });
    try {
      const onInAppLink = vi.fn();
      const onLetterClick = vi.fn();
      const link = { collection: 'Volume One', letterTitle: 'Alpha’s Letter' };
      const letter = { id: 'study-ch', title: 'A Study Chapter', footnotes: {}, nkjv: {}, blocks: [{ type: 'para', segments: [
        { t: 'text', v: 'Words. (An excerpt from ' },
        { t: 'letter-link', letterId: 'b', screen: 'vot-one-letter', label: '"Alpha’s Letter" - Volume One', link },
      ] }] };
      const { container } = render(h(LetterView, { letter, volKey: 'study', studyMode: true, volumeLabel: 'A Study', theme: 'dark',
        markAsReadEnabled: false, onNavigate: () => {}, onHome: () => {}, onInAppLink, onLetterClick }));
      fireEvent.click(container.querySelector('.letter-link-ref'));
      expect(onInAppLink).toHaveBeenCalledTimes(1);
      expect(onInAppLink.mock.calls[0][0]).toEqual(link);
      expect(onLetterClick).not.toHaveBeenCalled();
    } finally {
      cleanup();
      Object.assign(AudioPlayer, realAudio);
      for (const k of Object.keys(set)) delete globalThis[k];
    }
  });

  it('the lookups the walk mirrors are still the ones the readers run', () => {
    // If one of these moves, re-read its new code and bring corpus-links.js in step.
    const pins = [
      ['hooks/use-tap-through.js', 'const dest = resolveVotLetter(target.collection, target.letterTitle);\n    if (!dest) return;'],
      ['ui/components/Segments.jsx', 'if (seg.link && onInAppLink) {'],
      ['ui/components/FootnoteSheet.jsx', 'nkjv?.[fn.ref] || lookupVersesFromBooks(fn.ref) || null'],
      ['ui/screens/LetterView.jsx', 'const baked = letter.nkjv && letter.nkjv[scripRef];'],
      ['ui/screens/WtlbEntryView.jsx', 'return perEntry[ref] || dict[ref] || lookupVersesFromBooks(ref) || null;'],
      ['ui/components/StudyPanels.jsx', 'const hasVerse = !!MATTHEW_NKJV[s.cite];'],
      ['ui/components/StudyPanels.jsx', 'const canTap = onVotLetterClick && !!resolveVotLetter(n.vol, n.letter);'],
      ['data/letter-linking.js', 'const key = (vol || "null") + "::" + letter;'],
    ];
    expect(pins.filter(([file, line]) => !read(file).includes(line)).map(([file, line]) => `${file}: ${line}`)).toEqual([]);
  });

  it('attrCollectionLabel answers as WtlbEntryView._attrCollectionLabel does, for every source line in the corpus', () => {
    const src = read('ui/screens/WtlbEntryView.jsx');
    const at = src.indexOf('const _attrCollectionLabel = (volStr) => {');
    const end = src.indexOf('\n  };', at);
    expect(at).toBeGreaterThan(0);
    const real = new Function('COLLECTIONS', `${src.slice(at, end + 4)}\nreturn _attrCollectionLabel;`)(COLLECTIONS);
    const words = new Set(['', '1', '7', '8', 'Seven', 'seven', 'Volume 7', 'volume  seven', 'VOLUME TWO', 'Volume Eight', 'Letters to the Flock', 'Hidden Manna']);
    for (const c of COLLECTIONS) for (const w of [c.label, c.registryLabel, c.label.toUpperCase(), c.registryLabel.toLowerCase()]) words.add(w);
    for (const e of corpus().globals.ANSWERS) for (const p of e.paragraphs) { const m = /~\s*(.+?)\]\s*$/.exec(p.text || ''); if (m) words.add(m[1]); }
    for (const w of words) expect(attrCollectionLabel(w), JSON.stringify(w)).toBe(real(w));
    expect(words.size).toBeGreaterThan(40);
  });

  it('buildRegistry builds what index.html\'s __finishVotInit builds, key for key', () => {
    const html = readFileSync(resolve(ASSETS_DIR, 'index.html'), 'utf8');
    const fn = finishVotInitSource(html);
    expect(fn).toMatch(/^function\s*\(\)\s*\{[\s\S]*VOT_LETTER_REGISTRY = reg;\s*\}$/);
    const g = corpus().globals;
    // scripture-resolution's colLetters / colPreface / colLetterArr / _studies, over the loaded corpus.
    const colLetters = (col) => (col && g[col.globalName] !== undefined ? g[col.globalName] : null);
    const colPreface = (col) => (col && col.prefaceGlobal && g[col.prefaceGlobal] !== undefined ? g[col.prefaceGlobal] : null);
    const colLetterArr = (col) => { const arr = colLetters(col); return Array.isArray(arr) ? arr : []; };
    // linkWtlbEntries / linkPreface are shadowed as undefined: steps (1) and (2)
    // rewrite prev/next on the shared corpus, and the registry does not need them.
    const run = new Function('COLLECTIONS', 'COL_BY_KEY', 'colLetters', 'colPreface', 'colLetterArr', '_studies', 'linkWtlbEntries', 'linkPreface',
      `let VOT_LETTER_REGISTRY = null;\n(${fn})();\nreturn VOT_LETTER_REGISTRY;`);
    const theirs = run(COLLECTIONS, COL_BY_KEY, colLetters, colPreface, colLetterArr, () => g.BIBLE_STUDIES || [], undefined, undefined);
    const ours = buildRegistry(g).reg;
    expect([...ours.keys()].sort()).toEqual([...theirs.keys()].sort());
    for (const [k, v] of theirs) expect([k, ours.get(k).id, ours.get(k).screen]).toEqual([k, v.id, v.screen]);
  });

  it('reads HIDDEN_MANNA_TITLES out of index.html', () => {
    expect(hiddenMannaTitlesIn(readFileSync(resolve(ASSETS_DIR, 'index.html'), 'utf8'))).toContain('Woe to Dallas');
    expect(hiddenMannaTitlesIn('no such set')).toBe(null);
  });
});

// ── the corpus ───────────────────────────────────────────────────────────────
let _corpus = null;
function corpus() { return _corpus || (_corpus = loadCorpus()); }

describe('every cross-reference in the corpus resolves', () => {
  let result;
  beforeAll(() => { result = checkCorpusLinks(corpus()); });

  it('walks every kind, at today\'s scale (a walk gone blind fails here)', () => {
    // Floors a little under the 2026-11-04 counts: a reshaped data file that the
    // walk stops seeing drops a count far below its floor.
    const FLOORS = {
      'letter-link': 850, 'letter-id': 1150, excerpt: 2800, 'also-read': 18, attribution: 1600, 'holy-days-source': 16,
      footnote: 1350, 'inline-cite': 1900, 'bible-nav': 1, 'matthew-note': 600, 'matthew-cite': 175, 'hidden-manna': 650,
      'verse-range': 14000, 'nav-chain': 690,
    };
    expect(Object.keys(FLOORS).sort()).toEqual([...KINDS].sort());
    const low = KINDS.filter((k) => result.checked[k] < FLOORS[k]).map((k) => `${k}: ${result.checked[k]} < ${FLOORS[k]}`);
    expect(low).toEqual([]);
  });

  it('finds no break that KNOWN_BREAKS does not list (a new break: fix the data, or the lookup)', () => {
    const fresh = minus(result.breaks, KNOWN_BREAKS);
    expect(fresh.map(show), 'new breaks; run `node tools/corpus-links.js` for the reasons').toEqual([]);
  });

  it('every KNOWN_BREAKS entry is still broken (a fixed one: delete its entry)', () => {
    const fixed = minus(KNOWN_BREAKS, result.breaks);
    expect(fixed.map(keyOf), 'fixed: remove these entries and lower KNOWN_CEILING').toEqual([]);
  });

  it('the known list only shrinks', () => {
    expect(KNOWN_BREAKS.length).toBeLessThanOrEqual(KNOWN_CEILING);
    expect(KNOWN_CEILING).toBeLessThanOrEqual(11);
    for (const b of KNOWN_BREAKS) expect(KINDS).toContain(b.kind);
  });
});
