/* v2 Studies (zones v2p5; pictures 2d-studies, 2e-study-index): main's study chain under design's title rule, the label
   and coverage words each row says, a study's Preface + Parts + chapters with main's read marks and the chapter you are
   on (read only), and the gate drawing both pictures from memory. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { V2App } from './App.jsx';
import { StudyChapterScreen } from './screens/StudyChapterScreen.jsx';
import { StudyScreen, StudiesScreen } from './screens/StudiesScreen.jsx';
import { defineStart } from './places.js';
import { visitOf } from './reading-record.js';
import {
  splitStudyTitle, studyChain, studyRow, coverageWords, studyEntries, studyHead, studyRoute, savedStudyPlace, partHolding,
  curly, chapterOf, chapterEyebrow, chapterNext, groupCards, chapterCardKeys, passagesWords, cardOpen,
} from './studies-facts.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });

const ch = (id, num, title, extra = {}) => ({ id, num, title, blocks: [], ...extra });
/** main's studies as bible-studies.js ships them (titles verbatim; chapters cut down). */
function studies() {
  const mtam = Array.from({ length: 31 }, (_x, i) => ch('more-than-a-man-ch' + i, i, i === 0 ? 'Preface'
    : ['Section One: YahuShua The Messiah, God With Us', 'Section Two: YahuShua The Messiah, The Son of God',
      'Section Three: The Lineage of YahuShua The Messiah'][i - 1] || 'Section ' + i));
  const ids = (a, b) => Array.from({ length: b - a + 1 }, (_x, i) => 'more-than-a-man-ch' + (a + i));
  return [
    { id: 'more-than-a-man', slug: 'more-than-a-man', title: 'YAHUSHUA More Than a Man: YahuShua Is The Fulfillment of All Messianic Prophecy (Extensive Bible/Letter Study)',
      prefaceId: 'more-than-a-man-ch0', chapters: mtam,
      parts: [
        { num: 1, title: 'The Fulfillment of All Things', subtitle: 'YahuShua The Messiah', chapterIds: ids(1, 12) },
        { num: 2, title: 'God in the Flesh', subtitle: 'YahuShua The Messiah', chapterIds: ids(13, 19) },
        { num: 3, title: 'The Lamb of God', subtitle: 'YahuShua The Messiah', chapterIds: ids(20, 30) },
      ] },
    { id: 'odds-chart', slug: 'odds-chart', title: 'Odds Chart - YahuShua Fulfills Over 200 Messianic Prophecies', singlePage: true,
      chapters: [ch('odds-chart-ch1', 1, 'Odds Chart')] },
    { id: 'lamb-of-god', slug: 'lamb-of-god', title: 'YahuShua The Messiah, The Lamb of God',
      subtitle: "The True Chronology of The Messiah's Crucifixion and Resurrection", prefaceId: 'lamb-of-god-ch0',
      chapters: Array.from({ length: 16 }, (_x, i) => ch('lamb-of-god-ch' + i, i, i ? 'Chapter ' + i : 'Preface')) },
    { id: 'state-of-the-dead', slug: 'state-of-the-dead', title: 'The State of the Dead and The Fate of the Wicked: The False Doctrine of Hell and Eternal Torment Exposed',
      chapters: Array.from({ length: 5 }, (_x, i) => ch('sotd-ch' + (i + 1), i + 1, 'Part ' + (i + 1))) },
    { id: 'grace-and-the-law', slug: 'grace-and-the-law', title: 'Grace AND The Law (Bible/Letter Study)',
      chapters: Array.from({ length: 7 }, (_x, i) => ch('gl-ch' + (i + 1), i + 1, 'Part ' + (i + 1))) },
    { id: 'trinity-exposed', slug: 'trinity-exposed', title: 'The False Doctrine of "The Trinity" Exposed - The Holy Spirit is Not a Person',
      chapters: Array.from({ length: 6 }, (_x, i) => ch('tr-ch' + (i + 1), i + 1, 'Part ' + (i + 1))) },
    { id: 'purity', slug: 'purity', title: 'Purity - Bible/Letter Study',
      chapters: Array.from({ length: 6 }, (_x, i) => ch('purity-ch' + (i + 1), i + 1, 'Purity Part ' + (i + 1))) },
  ];
}
const MATTHEW = { chapters: Array.from({ length: 28 }, (_x, i) => ({ num: i + 1, title: 'Matthew ' + (i + 1), verses: [] })) };

/** main's lazy loaders as index.html + translations.js give them: the studies and Matthew land on the first ask. */
function installLoaders({ fail = false, make = studies } = {}) {
  g.loadBibleStudies = vi.fn(() => {
    if (fail) return Promise.resolve(false);
    g.BIBLE_STUDIES = make();
    return Promise.resolve(true);
  });
  g.__loadMatthewCorpus = vi.fn(() => { g.MATTHEW = MATTHEW; return Promise.resolve(); });
}

/** @type {Array<() => void>} */
const undo = [];

afterEach(() => {
  cleanup();
  for (const k of ['BIBLE_STUDIES', 'MATTHEW', 'loadBibleStudies', '__loadMatthewCorpus', 'StateStore', 'AUDIO_MANIFEST', 'matchMedia',
    'ProphecyCardsStore', 'COL_BY_KEY', 'V2_LETTERS', 'findEntryContext']) delete g[k];
  while (undo.length) undo.pop()();
  delete html.dataset.gate;
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("design's title rule over main's long study titles", () => {
  it('splits at the first ": " or " - ", drops a trailing (Bible/Letter Study), keeps the rest for the lede', () => {
    const cases = /** @type {Array<[string, string, string | null]>} */ ([
      ['YAHUSHUA More Than a Man: YahuShua Is The Fulfillment of All Messianic Prophecy (Extensive Bible/Letter Study)',
        'YAHUSHUA More Than a Man', 'YahuShua Is The Fulfillment of All Messianic Prophecy (Extensive Bible/Letter Study)'],
      ['The Volumes of Truth New Testament Study Bible - The Book of Matthew', 'The Volumes of Truth New Testament Study Bible', 'The Book of Matthew'],
      ['Purity - Bible/Letter Study', 'Purity', null],
      ['The State of the Dead and The Fate of the Wicked: The False Doctrine of Hell and Eternal Torment Exposed',
        'The State of the Dead and The Fate of the Wicked', 'The False Doctrine of Hell and Eternal Torment Exposed'],
      ['Grace AND The Law (Bible/Letter Study)', 'Grace AND The Law', null],
      ['YahuShua The Messiah, The Lamb of God', 'YahuShua The Messiah, The Lamb of God', null],
      ['The False Doctrine of "The Trinity" Exposed - The Holy Spirit is Not a Person', 'The False Doctrine of “The Trinity” Exposed', 'The Holy Spirit is Not a Person'],
      ['Odds Chart - YahuShua Fulfills Over 200 Messianic Prophecies', 'Odds Chart', 'YahuShua Fulfills Over 200 Messianic Prophecies'],
    ]);
    for (const [full, title, rest] of cases) expect(splitStudyTitle(full)).toEqual({ title, rest });
    expect(curly("The Messiah's \"Son\"")).toBe('The Messiah’s “Son”');
  });
});

describe('the Studies list (2d)', () => {
  it("main's chain order with Matthew second; each row's label and coverage words", () => {
    const chain = studyChain(studies(), MATTHEW);
    expect(chain.map((s) => s.id)).toEqual(['more-than-a-man', 'matthew-study', 'purity', 'state-of-the-dead',
      'grace-and-the-law', 'lamb-of-god', 'trinity-exposed', 'odds-chart']);
    const rows = chain.map((s, i) => studyRow(s, i, null));
    expect(rows.map((r) => r.label)).toEqual(['3 parts · Bible study', 'Matthew · 28 chapters with notes', '6 parts · Bible study',
      '5 parts · Bible study', '7 parts · Bible study', '16 parts · Bible study', '6 parts · Bible study', 'Reference · one page']);
    expect(rows[7]).toMatchObject({ no: '8', title: 'Odds Chart' });
    expect(coverageWords({ state: 'read-along', recorded: 14, total: 16 })).toBe('Read-along · 14 of 16');
    expect(coverageWords({ state: 'read-along', recorded: 6, total: 6 })).toBe('Read-along');
    expect(coverageWords({ state: 'listening-only' })).toBe('Listening only');
    expect(coverageWords({ state: 'no-recording', recorded: 0, total: 5 })).toBe(null);
    // a study main has not loaded is left out; Matthew stays (main's filter)
    expect(studyChain([], null).map((s) => s.id)).toEqual(['matthew-study']);
  });

  it('a one-page study opens its chapter; the rest open their own page', () => {
    const chain = studyChain(studies(), MATTHEW);
    expect(studyRoute(chain[7])).toEqual({ place: 'study-chapter', study: 'odds-chart', chapter: 'odds-chart-ch1' });
    expect(studyRoute(chain[0])).toEqual({ place: 'study', study: 'more-than-a-man' });
    expect(studyRoute(chain[1])).toEqual({ place: 'study', study: 'matthew-study' });
  });

  it('the gate draws the picture: every row, the pinned marks, the website row; Back says Home', async () => {
    installLoaders();
    const { container } = render(<V2App gateId="2d-studies" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    const rows = [...container.querySelectorAll('.row.stu')];
    expect(rows.map((r) => r.querySelector('.t').textContent)).toEqual(['YAHUSHUA More Than a Man',
      'The Volumes of Truth New Testament Study Bible', 'Purity', 'The State of the Dead and The Fate of the Wicked',
      'Grace AND The Law', 'YahuShua The Messiah, The Lamb of God', 'The False Doctrine of “The Trinity” Exposed',
      'Odds Chart', 'AnswersOnlyGodCanGive.com']);
    expect(rows[1].querySelector('.s').textContent).toBe('Matthew · 28 chapters with notes · Read-along');
    expect(rows[5].querySelector('.s').textContent).toBe('16 parts · Bible study · Read-along · 14 of 16');
    expect(rows[0].querySelector('.st.cov')).toBe(null);
    expect(rows[8].getAttribute('href')).toBe('https://answersonlygodcangive.com/');
    expect(container.querySelector('.tb .ic').getAttribute('aria-label')).toBe('Back to Home');
    expect(container.querySelector('.tb [aria-label="More"]')).toBe(null);
    expect(localStorage.length).toBe(0);
  });

  it("a load that fails says main's words and Try again asks again", async () => {
    installLoaders({ fail: true });
    const { container, findByText } = render(<V2App gateId="2d-studies" />);
    await findByText('Some studies couldn’t load.');
    // Matthew alone is listed (main's virtual entry) until the studies load
    expect(container.querySelectorAll('.row.stu').length).toBe(2);
    g.loadBibleStudies.mockImplementation(() => { g.BIBLE_STUDIES = studies(); return Promise.resolve(true); });
    await click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Try again'));
    await waitFor(() => expect(container.querySelectorAll('.row.stu').length).toBe(9));
    expect(g.loadBibleStudies).toHaveBeenCalledTimes(2);
  });
});

describe("a study's page (2e)", () => {
  it('the Preface first as P, then each Part with its chapters; a flat study lists its chapters, preface first', () => {
    const [mtam, , lamb] = studies();
    const e = studyEntries(mtam);
    expect(e[0]).toEqual({ kind: 'chapter', id: 'more-than-a-man-ch0', no: 'P', title: 'Preface' });
    expect(e[1]).toMatchObject({ kind: 'part', num: 1, title: 'The Fulfillment of All Things', sub: 'YahuShua The Messiah · 12 chapters' });
    expect(e[1].chapters[1]).toEqual({ kind: 'chapter', id: 'more-than-a-man-ch2', no: '2', title: 'Section Two: YahuShua The Messiah, The Son of God' });
    expect(e.length).toBe(4);
    expect(studyEntries(lamb).map((c) => c.no).slice(0, 3)).toEqual(['P', '1', '2']);
    expect(studyHead(mtam)).toEqual({ eyebrow: 'Bible and letter study', title: 'YAHUSHUA More Than a Man', size: 'long',
      lede: 'YahuShua Is The Fulfillment of All Messianic Prophecy (Extensive Bible/Letter Study)' });
    expect(studyHead(lamb).lede).toBe('The True Chronology of The Messiah’s Crucifixion and Resurrection');
    expect(partHolding(mtam, 'more-than-a-man-ch14')).toBe(2);
  });

  it("main's read marks and place, read only: the chapter you are on only while the study is the active read", () => {
    const [mtam] = studies();
    const state = { activeReadKey: 'bible-study-more-than-a-man', lastReadChapters: { 'bible-study-more-than-a-man': 'more-than-a-man-ch2' },
      readItems: { 'v1:bible-study-more-than-a-man:more-than-a-man-ch0': 1, 'v1:bible-study-more-than-a-man:more-than-a-man-ch1': 3, 'v1:matthew:4': 1 } };
    g.StateStore = { isReady: () => true, get: vi.fn(() => state), set: vi.fn(), update: vi.fn() };
    expect(savedStudyPlace(mtam)).toEqual({ current: 'more-than-a-man-ch2', read: ['more-than-a-man-ch0', 'more-than-a-man-ch1'] });
    state.activeReadKey = 'john';
    expect(savedStudyPlace(mtam).current).toBe(null);
    // the Matthew Study Bible keys its chapters by number, as main's Matthew index does
    expect(savedStudyPlace(studyChain([], MATTHEW)[0]).read).toEqual(['4']);
    state.settings = { markAsRead: false };
    expect(savedStudyPlace(mtam).read).toEqual([]);
    expect(g.StateStore.set).not.toHaveBeenCalled();
    g.StateStore = { isReady: () => false, get: () => { throw new Error('not ready'); } };
    expect(savedStudyPlace(mtam)).toEqual({ current: null, read: [] });
  });

  it('the gate draws the picture: Preface read, Part 1 open with chapter 1 read and chapter 2 current; Back says Studies', async () => {
    installLoaders();
    const { container } = render(<V2App gateId="2e-study-index" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(container.querySelector('h1.display.long').textContent).toBe('YAHUSHUA More Than a Man');
    expect(container.querySelector('.tb .ic').getAttribute('aria-label')).toBe('Back to Studies');
    const rows = [...container.querySelectorAll('.sti > .row, .pch > .row')];
    expect(rows[0].querySelector('.no').textContent).toBe('P');
    expect(rows[0].querySelector('.rd')).not.toBe(null);
    const part1 = container.querySelector('.row.part.open');
    expect(part1.getAttribute('aria-expanded')).toBe('true');
    const pch = [...container.querySelectorAll('.pch .row.stc')];
    expect(pch.length).toBe(12);
    expect(pch[0].querySelector('.rd')).not.toBe(null);
    expect(pch[1].classList.contains('cur')).toBe(true);
    expect(pch[1].querySelector('.rd')).toBe(null);
    expect(container.querySelectorAll('.row.part:not(.open)').length).toBe(2);
    expect(localStorage.length).toBe(0);
  });

  it('a part opens and closes in place; a chapter opens the chapter page', async () => {
    installLoaders();
    const { container } = render(<V2App gateId="2e-study-index" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    const part2 = container.querySelectorAll('.row.part')[1];
    await click(part2);
    expect(part2.classList.contains('open')).toBe(true);
    expect(container.querySelectorAll('.pch').length).toBe(2);
    await click(container.querySelector('.row.part.open'));
    expect(container.querySelectorAll('.pch').length).toBe(1);
    await click(container.querySelectorAll('.pch .row.stc')[2]);
    await waitFor(() => expect(container.querySelector('.tb .ic').getAttribute('aria-label')).toBe('Back to YAHUSHUA More Than a Man'));
  });
});

const sg = (v, t = 'text') => ({ t, v });
const para = (...segments) => ({ type: 'para', segments });
const named = (title, col) => ({ t: 'letter-link', letterId: 'x-' + title.length, label: '"' + title + '" - ' + col,
  link: { collection: col, letterTitle: title } });
/** main's chapter 2, cut down: its section intro and source, its first prophecy group as shipped (Old Testament with
 *  {{ref}}s, New Testament with a heading, Volumes of Truth naming a letter), a heading, a paragraph and a poem kept a
 *  line a segment (as chapter 13's). */
function chapter2() {
  return ch('more-than-a-man-ch2', 2, 'Section Two: YahuShua The Messiah, The Son of God', {
    sectionIntro: [para(sg('Therefore, remember My words and have peace, says The Lord. (An excerpt from '),
      named('The Truth Absolute', 'Volume Three'), sg(')'))],
    blocks: [
      { type: 'prophecy-group', label: 'YahuShua Is The Son of God', intro: [],
        ot: { label: 'The Messiah Would Be The Son of God', blocks: [
          para(sg('"Yet I have set My King on My holy hill of Zion." - {{ref:Psalm 2:6-8}}')),
          para(sg('Also I will make him '), sg('My Firstborn,', 'bold-italic'), sg(' the highest of the kings of the earth. - {{ref:Psalm 89:27}}')),
        ] },
        nt: { label: 'YahuShua Is The Son of God', blocks: [
          para(sg('And suddenly a voice came from Heaven. - {{ref:Matthew 3:17}}')),
          { type: 'heading', text: 'YAHUSHUA' },
          para(sg('Truly You are The Son of God. - {{ref:Matthew 14:33}}')),
        ] },
        vot: { label: 'YahuShua Is The Son of God', blocks: [para(sg('For I had sent to you My Son ('), named('Hearts Changed', 'Volume Two'), sg(')'))] } },
      { type: 'heading', level: 2, text: 'The Son of God' },
      para(sg('Thus says The Lord.')),
      { type: 'poetry', segments: [sg('I carried the weight of the world’s sin to the cross,', 'italic'),
        sg('\nAnd crucified sin through My suffering;', 'italic')] },
    ],
  });
}
const withChapter2 = () => { const s = studies(); s[0].chapters[2] = chapter2(); return s; };
const CH2 = 'more-than-a-man-ch2';

/**
 * main's ProphecyCardsStore as v2 reads it. `keepsClosed: false` is main's store today: setAll drops every false, so a
 * closed card is never kept.
 */
function cardStore(init = {}, { keepsClosed = true } = {}) {
  let map = { ...init };
  let v = 0;
  const subs = new Set();
  return {
    getAll: () => ({ ...map }),
    setAll: vi.fn((m) => {
      map = Object.fromEntries(Object.entries(m).filter(([, x]) => keepsClosed || x));
      v++;
      subs.forEach((f) => f());
    }),
    subscribe: (f) => { subs.add(f); return () => subs.delete(f); },
    getVersion: () => v,
  };
}

/** The chapter's page on a real boot, with what it was handed. */
function openChapter(chapter = CH2, store = cardStore()) {
  g.BIBLE_STUDIES = withChapter2();
  g.ProphecyCardsStore = store;
  const go = vi.fn();
  const replace = vi.fn();
  const r = render(<StudyChapterScreen route={{ place: 'study-chapter', study: 'more-than-a-man', chapter }} gate={null}
    go={go} replace={replace} pop={vi.fn()} openTab={vi.fn()} onReady={() => {}} desktop={false} device="phone"
    facts={{ doubleTapFullscreen: false }} />);
  return { ...r, go, replace, store };
}
const cardsOf = (root) => [...root.querySelectorAll('.pgrp .pcard')].map((c) => ({
  kind: c.className.replace(/^pcard /, '').replace(/ open$/, ''), open: c.classList.contains('open'),
  n: c.querySelector('.pc-n') ? c.querySelector('.pc-n').textContent : null }));
/** The ... 's rows (more-menu.jsx MoreButton: the phone's sheet). */
const menuRows = () => [...document.querySelectorAll('.srow.act .t')].map((t) => t.textContent);
const menuRow = (t) => [...document.querySelectorAll('.srow.act')].find((b) => b.querySelector('.t').textContent === t);

describe("a study's chapter (5d) and its prophecy cards (5f)", () => {
  it("the chapter's facts: by id, its eyebrow, main's cards in main's order, what Collapse all changes", () => {
    const [mtam] = withChapter2();
    const c = chapterOf(mtam, CH2);
    expect(c.title).toBe('Section Two: YahuShua The Messiah, The Son of God');
    expect(chapterOf(mtam, 'nope')).toBe(null);
    expect(chapterEyebrow(mtam, c)).toBe('YAHUSHUA More Than a Man · Chapter 2');
    expect(chapterEyebrow(mtam, mtam.chapters[0])).toBe('YAHUSHUA More Than a Man · Preface');
    const group = c.blocks[0];
    expect(groupCards(group).map((x) => [x.kind, x.tag])).toEqual([['ot', 'Old Testament Prophecy'],
      ['nt', 'Fulfilled in the New Testament'], ['vot', 'Fulfillment in the Volumes of Truth']]);
    // an Introduction card only when it has words
    expect(groupCards({ ...group, intro: [para(sg('First.'))] })[0]).toMatchObject({ kind: 'intro', tag: 'Introduction' });
    expect(chapterCardKeys(c)).toEqual([CH2 + ':0:ot', CH2 + ':0:nt', CH2 + ':0:vot']);
    expect(passagesWords(group.nt.blocks)).toBe('2 passages');
    expect(passagesWords(group.vot.blocks)).toBe('1 passage');
    // none saved = open (main's default); a saved false closes it
    expect(cardOpen({}, CH2 + ':0:nt')).toBe(true);
    expect(cardOpen({ [CH2 + ':0:nt']: false }, CH2 + ':0:nt')).toBe(false);
    expect(cardOpen({ [CH2 + ':0:nt']: true }, CH2 + ':0:nt')).toBe(true);
  });

  it("Next: the study's next chapter in place; after its last, the next study's first chapter (Matthew's by number) as a new page", () => {
    const list = withChapter2();
    const [mtam, , lamb] = list;
    expect(chapterNext(mtam, mtam.chapters[2], list, MATTHEW)).toEqual({ k: 'Next · Chapter 3',
      t: 'Section Three: The Lineage of YahuShua The Messiah', route: { place: 'study-chapter', study: 'more-than-a-man', chapter: 'more-than-a-man-ch3' },
      replace: true });
    expect(chapterNext(mtam, mtam.chapters[0], list, MATTHEW).k).toBe('Next · Chapter 1');
    expect(chapterNext(mtam, mtam.chapters[30], list, MATTHEW)).toEqual({ k: 'Next · The Volumes of Truth New Testament Study Bible',
      t: 'Chapter 1', route: { place: 'study-chapter', study: 'matthew-study', chapter: '1' }, replace: false });
    expect(chapterNext(lamb, lamb.chapters[15], list, MATTHEW)).toMatchObject({ k: 'Next · The False Doctrine of “The Trinity” Exposed',
      route: { place: 'study-chapter', study: 'trinity-exposed', chapter: 'tr-ch1' }, replace: false });
    const odds = list.find((s) => s.id === 'odds-chart');
    expect(chapterNext(odds, odds.chapters[0], list, MATTHEW)).toBe(null);
  });

  it("5d from the gate: the eyebrow, the title, the intro's source set apart, no Listen; Back names the study", async () => {
    installLoaders({ make: withChapter2 });
    const store = cardStore();
    g.ProphecyCardsStore = store;
    const { container } = render(<V2App gateId="5d-study-chapter" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(container.querySelector('.reader-head .eyebrow').textContent).toBe('YAHUSHUA More Than a Man · Chapter 2');
    expect(container.querySelector('.reader-head h1.display.longer').textContent).toBe('Section Two: YahuShua The Messiah, The Son of God');
    expect(container.querySelector('.tb .ic').getAttribute('aria-label')).toBe('Back to YAHUSHUA More Than a Man');
    expect(container.querySelector('.pill.play')).toBe(null);
    const intro = container.querySelector('.body.study .sintro p');
    // the DOM text is main's; only a span sets the source apart
    expect(intro.textContent).toBe('Therefore, remember My words and have peace, says The Lord. (An excerpt from "The Truth Absolute" - Volume Three)');
    const src = intro.querySelector('span.src');
    expect(src.textContent).toBe('(An excerpt from "The Truth Absolute" - Volume Three)');
    const cite = src.querySelector('a.cite');
    expect([cite.getAttribute('data-col'), cite.getAttribute('data-title')]).toEqual(['Volume Three', 'The Truth Absolute']);
    // the cards as 5f draws them: the Old Testament open, the other two closed with their counts; nothing saved
    expect(cardsOf(container)).toEqual([{ kind: 'ot', open: true, n: null }, { kind: 'nt', open: false, n: '2 passages' },
      { kind: 'vot', open: false, n: '1 passage' }]);
    expect(container.querySelector('.pcard.ot .pc-sub').textContent).toBe('The Messiah Would Be The Son of God');
    expect(store.setAll).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it("a gate's ... holds Find, Auto-scroll and the cards row; a tap there closes it and changes nothing", async () => {
    installLoaders({ make: withChapter2 });
    const store = cardStore();
    g.ProphecyCardsStore = store;
    const { container } = render(<V2App gateId="5f-prophecy-cards" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    const before = cardsOf(container);
    await click(container.querySelector('.tb [aria-label="More"]'));
    expect(document.querySelector('.sheet.mor .sh').textContent).toBe(curly(chapterOf(withChapter2()[0], CH2).title));
    expect(menuRows()).toEqual(['Find in this chapter', 'Auto-scroll', 'Open all cards']);
    await click(menuRow('Open all cards'));
    expect(document.querySelector('.sheet.mor')).toBe(null);
    expect(cardsOf(container)).toEqual(before);
    expect(store.setAll).not.toHaveBeenCalled();
  });

  it("main's page for the study: Copy website link after Auto-scroll, before the cards", async () => {
    installLoaders({ make: withChapter2 });
    g.ProphecyCardsStore = cardStore();
    // main's lookup behind its pageSiteLink (data/scripture-resolution.js): a study's chapter is a 'study-letter'
    g.findEntryContext = vi.fn((id, kind) => (id === CH2 && kind === 'letter'
      ? { kind: 'study-letter', screen: 'bible-study-chapter', collection: 'YAHUSHUA More Than a Man', title: 'Section Two' } : null));
    const writeText = vi.fn((/** @type {string} */ _text) => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    undo.push(defineStart(() => [{ place: 'home' }, { place: 'study', study: 'more-than-a-man' },
      { place: 'study-chapter', study: 'more-than-a-man', chapter: CH2 }]));
    const { container } = render(<V2App gateId={null} />);
    await waitFor(() => expect(container.querySelector('.pgrp')).not.toBe(null));
    await click(container.querySelector('.tb [aria-label="More"]'));
    expect(menuRows()).toEqual(['Find in this chapter', 'Auto-scroll', 'Copy website link', 'Collapse all cards']);
    expect(menuRow('Copy website link').querySelector('.s').textContent).toBe('thevolumesoftruth.com');
    await click(menuRow('Copy website link'));
    await act(() => new Promise((r) => { setTimeout(r, 30); }));
    expect(writeText.mock.calls[0][0]).toContain('YAHUSHUA_More_Than_a_Man');
    expect(document.querySelector('.toast').textContent).toBe('Link copied: Section Two (YAHUSHUA More Than a Man)');
  });

  it("a real boot: every card open with none saved, a saved false closed; a tap saves it as main does", () => {
    const { container, store } = openChapter(CH2, cardStore({ [CH2 + ':0:vot']: false, other: true }));
    expect(cardsOf(container).map((c) => c.open)).toEqual([true, true, false]);
    const nt = container.querySelector('.pcard.nt .pc-h');
    expect(nt.getAttribute('aria-expanded')).toBe('true');
    // an open card's paragraphs keep main's mark keys; a closed card's text is not drawn (Find does not count it)
    expect([...container.querySelectorAll('.pcard.nt [data-hl-key]')].map((p) => p.getAttribute('data-hl-key')))
      .toEqual(['letter:' + CH2 + ':0:nt:0', 'letter:' + CH2 + ':0:nt:2']);
    expect(container.querySelector('.pcard.nt h3.sec-h').textContent).toBe('YAHUSHUA');
    expect(container.querySelector('.pcard.vot .pc-b')).toBe(null);
    click(nt);
    expect(store.setAll).toHaveBeenLastCalledWith({ [CH2 + ':0:vot']: false, other: true, [CH2 + ':0:nt']: false });
    expect(cardsOf(container)[1]).toEqual({ kind: 'nt', open: false, n: '2 passages' });
    click(container.querySelector('.pcard.vot .pc-h'));
    expect(store.setAll).toHaveBeenLastCalledWith({ [CH2 + ':0:vot']: true, other: true, [CH2 + ':0:nt']: false });
    expect(container.querySelector('.pcard.vot').textContent).toContain('For I had sent to you My Son (');
  });

  it("with main's store as it is (it keeps no closed card), a closed card stays closed and the ... offers Open all cards", async () => {
    installLoaders({ make: withChapter2 });
    const store = cardStore({}, { keepsClosed: false });
    g.ProphecyCardsStore = store;
    undo.push(defineStart(() => [{ place: 'home' }, { place: 'study', study: 'more-than-a-man' },
      { place: 'study-chapter', study: 'more-than-a-man', chapter: CH2 }]));
    const { container } = render(<V2App gateId={null} />);
    await waitFor(() => expect(container.querySelector('.pgrp')).not.toBe(null));
    await click(container.querySelector('.pcard.ot .pc-h'));
    expect(store.getAll()).toEqual({});
    expect(cardsOf(container).map((c) => c.open)).toEqual([false, true, true]);
    await click(container.querySelector('.tb [aria-label="More"]'));
    expect(menuRows()).toEqual(['Find in this chapter', 'Auto-scroll', 'Open all cards']);
    await click(menuRow('Open all cards'));
    expect(cardsOf(container).map((c) => c.open)).toEqual([true, true, true]);
    expect(store.setAll).toHaveBeenLastCalledWith({ [CH2 + ':0:ot']: true, [CH2 + ':0:nt']: true, [CH2 + ':0:vot']: true });
    await click(container.querySelector('.tb [aria-label="More"]'));
    await click(menuRow('Collapse all cards'));
    expect(cardsOf(container).map((c) => c.open)).toEqual([false, false, false]);
  });

  it("references and named letters as main draws them: {{ref}} a gold cite with main's words; a named letter opens it", () => {
    g.COL_BY_KEY = new Map([['two', { volKey: 'two', globalName: 'V2_LETTERS', prefaceGlobal: null, label: 'Volume Two' }]]);
    g.V2_LETTERS = [{ id: 'hearts-changed', num: 5, title: 'Hearts Changed', blocks: [] }];
    const { container, go } = openChapter();
    const ot = container.querySelector('.pcard.ot [data-hl-key="letter:' + CH2 + ':0:ot:0"]');
    expect(ot.textContent).toBe('"Yet I have set My King on My holy hill of Zion." - Psalm 2:6-8');
    expect(ot.querySelector('a.cite').getAttribute('data-ref')).toBe('Psalm 2:6-8');
    const named2 = container.querySelector('.pcard.vot a.cite[data-col]');
    expect(named2.textContent).toBe('"Hearts Changed" - Volume Two');
    click(named2);
    expect(go).toHaveBeenCalledWith({ place: 'letter', collection: 'two', n: 5 });
    // a poem kept a line a segment: each its own line, its leading break dropped
    expect([...container.querySelectorAll('.body .poetry .poem')].map((p) => p.textContent)).toEqual([
      'I carried the weight of the world’s sin to the cross,', 'And crucified sin through My suffering;']);
    expect(container.querySelector('.body h2.st-h').textContent).toBe('The Son of God');
  });

  it('the Next card: the next chapter in place; after the last, the next study as a new page', () => {
    const one = openChapter();
    const card = one.container.querySelector('.nextcard');
    expect(card.textContent).toBe('Next · Chapter 3Section Three: The Lineage of YahuShua The Messiah');
    click(card);
    expect(one.replace).toHaveBeenCalledWith({ place: 'study-chapter', study: 'more-than-a-man', chapter: 'more-than-a-man-ch3' });
    expect(one.go).not.toHaveBeenCalled();
    cleanup();
    const last = openChapter('more-than-a-man-ch30');
    click(last.container.querySelector('.nextcard'));
    expect(last.go).toHaveBeenCalledWith({ place: 'study-chapter', study: 'matthew-study', chapter: '1' });
    expect(last.replace).not.toHaveBeenCalled();
  });

  it("main's reading record for a study chapter: the study's read key, its chapter, main's history entry", () => {
    const gl = { BIBLE_STUDIES: withChapter2() };
    expect(visitOf({ place: 'study-chapter', study: 'more-than-a-man', chapter: CH2 }, gl)).toEqual({
      key: 'st:more-than-a-man:' + CH2, active: 'bible-study-more-than-a-man', slot: 'lastReadChapters',
      at: 'bible-study-more-than-a-man', value: CH2, read: 'v1:bible-study-more-than-a-man:' + CH2,
      entry: { type: 'study-chapter', studyId: 'more-than-a-man', studyChapterId: CH2,
        studyTitle: withChapter2()[0].title, studySlug: 'more-than-a-man',
        chapterTitle: 'Section Two: YahuShua The Messiah, The Son of God', chapterNum: 2 } });
    expect(visitOf({ place: 'study-chapter', study: 'more-than-a-man', chapter: 'nope' }, gl)).toBe(null);
    expect(visitOf({ place: 'study-chapter', study: 'more-than-a-man', chapter: CH2 }, {})).toBe(null);
  });
});

describe('auto-scroll on a study chapter (main reads it as a letter)', () => {
  /** A real boot on a study's chapter with main's Auto-scroll setting on and no pause before the next page. */
  function autoAt(study, chapter) {
    g.BIBLE_STUDIES = withChapter2();
    let st = { settings: { autoScroll: true, autoScrollEndMs: '0' } };
    g.StateStore = { isReady: () => true, get: () => st, set: (next) => { st = next; } };
    undo.push(defineStart(() => [{ place: 'home' }, { place: 'study', study }, { place: 'study-chapter', study, chapter }]));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    const view = render(<V2App gateId={null} />);
    const pill = () => view.container.querySelector('.v2-phone > .asp');
    const play = () => click(pill().querySelector('.pp'));
    const wait = (ms) => act(async () => { vi.advanceTimersByTime(ms); });
    return { ...view, pill, play, wait };
  }
  afterEach(() => { vi.useRealTimers(); });

  it("the pill waits on the chapter; at the end it turns to the next chapter on the Next card and runs on", async () => {
    const v = autoAt('more-than-a-man', CH2);
    await v.wait(50);
    expect(v.pill().querySelector('.pp').getAttribute('aria-label')).toBe('Start auto-scroll');
    await v.play();
    await v.wait(200);
    expect(v.pill().querySelector('.asp-r').textContent).toMatch(/^Next in [34]$/);
    await v.wait(4500);
    expect(v.container.querySelector('.reader-head h1').textContent).toBe('Section Three: The Lineage of YahuShua The Messiah');
    expect(v.container.querySelector('.tb .ic').getAttribute('aria-label')).toBe('Back to YAHUSHUA More Than a Man');
    expect(v.pill().querySelector('.pp').getAttribute('aria-label')).toBe('Pause auto-scroll');
  });

  it('the last chapter of the last study has no Next card: the pill stops at "End of text"', async () => {
    const v = autoAt('odds-chart', 'odds-chart-ch1');
    await v.wait(50);
    expect(v.container.querySelector('.nextcard')).toBe(null);
    await v.play();
    await v.wait(6000);
    expect(v.pill().querySelector('.asp-r').textContent).toBe('End of text');
    expect(v.pill().querySelector('.pp').getAttribute('aria-label')).toBe('Start auto-scroll');
  });
});

describe("a study chapter's foot (main's LetterView in studyMode: the letter's groups, no songs)", () => {
  const AQ = 'https://answersonlygodcangive.com/';
  const ANSWERS = { volKey: 'answers', label: 'Answers Only God Can Give', globalName: 'ANSWERS_TOPICS' };
  /** main's bible-studies.js rows for the last chapter of The State of the Dead and of Purity (cut down, verbatim). */
  const withFeet = () => {
    const s = studies();
    const sotd = s.find((x) => x.id === 'state-of-the-dead');
    Object.assign(sotd.chapters[4], {
      blocks: [{ type: 'p', text: 'The wicked shall be no more.' }],
      relatedTopics: [{ label: 'Regarding Hell and Eternal Torment', url: AQ + 'Regarding_Hell_and_Eternal_Torment' },
        { label: 'Theological Myth - Unending conscious torture', url: 'https://graceheadentries.wordpress.com/2013/07/18/theological-myth-unending-conscious-torture/' }],
      videos: [{ url: 'https://www.youtube.com/watch?v=YA3YSAK_WGM', label: 'Proclaim NOT the Hell of the Churches of Men' }],
    });
    Object.assign(s.find((x) => x.id === 'purity').chapters[5], {
      audioUrl: 'https://www.dropbox.com/scl/fo/jsm4srx3rt46f97xjf2ci/h?rlkey=nh44jcxbqa8g402lwr9xaajls&dl=0',
      soundcloudUrl: 'https://soundcloud.com/the-volumes-of-truth/sets/bibleletter-studies',
      videoVoiceUrl: 'https://www.youtube.com/playlist?list=PLSVchFJ22QYLMlW-oUVi_HPOm9R33Z2Ve', videoVoiceLabel: 'Purity - Video Playlist',
    });
    return s;
  };
  /** Globals this block sets that the file's afterEach does not clear. */
  const own = (k, v) => { g[k] = v; undo.push(() => { delete g[k]; }); };
  function footAt(study, chapter) {
    g.BIBLE_STUDIES = withFeet();
    // a catalog that would sing anything it is asked: main shows no songs on a study (LetterView's !studyMode)
    own('SongCatalog', { loaded: true, error: null, load: vi.fn(), subscribe: () => () => {}, getVersion: () => 0,
      songsForLetter: vi.fn(() => [{ id: 'song-1', t: 'A Song', f: 'song-1', v: 'Hymn', d: 200, b: 3e6 }]) });
    own('__answersIdForUrl', (url) => (url === AQ + 'Regarding_Hell_and_Eternal_Torment' ? 'regarding-hell-and-eternal-torment' : null));
    const go = vi.fn();
    const r = render(<StudyChapterScreen route={{ place: 'study-chapter', study, chapter }} gate={null}
      go={go} replace={vi.fn()} pop={vi.fn()} openTab={vi.fn()} onReady={() => {}} desktop={false} device="phone"
      facts={{ doubleTapFullscreen: false }} />);
    return { ...r, go };
  }
  const texts = (root, sel) => [...root.querySelectorAll(sel)].map((n) => n.textContent);
  const settle = () => act(() => new Promise((r) => { setTimeout(r, 30); }));

  it("The State of the Dead's last part ends with Related topics and Videos before the Next card; no song is asked for", async () => {
    const { container } = footAt('state-of-the-dead', 'sotd-ch5');
    await settle();
    const kids = [...container.querySelector('.body').children].map((n) => n.className);
    expect(kids.slice(-2)).toEqual(['lft', 'nextcard']);
    expect(texts(container, '.lfg > .label')).toEqual(['Related topics', 'Videos']);
    expect(texts(container, 'button.lfr')).toEqual(['Regarding Hell and Eternal Torment']);
    expect([...container.querySelectorAll('a.lfr.out')].map((a) => a.getAttribute('aria-label'))).toEqual([
      'Theological Myth - Unending conscious torture, opens outside the app',
      'Proclaim NOT the Hell of the Churches of Men, opens outside the app', 'Official YouTube channel, opens outside the app']);
    expect(container.querySelector('[data-foot="songs"]')).toBe(null);
    expect(g.SongCatalog.songsForLetter).not.toHaveBeenCalled();
    expect(g.SongCatalog.load).not.toHaveBeenCalled();
  });

  it('its Answers row opens the topic in the app once that corpus is in', async () => {
    const { container, go } = footAt('state-of-the-dead', 'sotd-ch5');
    g.COL_BY_KEY = new Map([['answers', ANSWERS]]);
    own('__answersCorpus', { loaded: false, subscribe: () => () => {}, getVersion: () => 0 });
    own('__loadAnswersCorpus', vi.fn(() => Promise.resolve().then(() => {
      g.ANSWERS_TOPICS = [{ id: 'regarding-hell-and-eternal-torment', num: 33, title: 'Regarding Hell and Eternal Torment' }];
      g.__answersCorpus.loaded = true;
    })));
    undo.push(() => { delete g.ANSWERS_TOPICS; });
    await settle();
    await click(container.querySelector('button.lfr'));
    await waitFor(() => expect(go).toHaveBeenCalledWith({ place: 'letter', collection: 'answers', n: 33 }));
  });

  it("Purity's last part: Audio (Dropbox, SoundCloud) and its playlist under Videos; a chapter with none ends as before", async () => {
    const { container } = footAt('purity', 'purity-ch6');
    await settle();
    expect(texts(container, '.lfg > .label')).toEqual(['Audio', 'Videos']);
    expect(texts(container, 'a.lfr .tx')).toEqual(['Audio recording', 'Listen on SoundCloud', 'Purity - Video Playlist', 'Official YouTube channel']);
    expect(texts(container, 'a.lfr .host')).toEqual(['Dropbox', 'YouTube']);
    cleanup();
    const none = footAt('purity', 'purity-ch5');
    await settle();
    expect(none.container.querySelector('.lft')).toBe(null);
  });
});

// v2-gaps 39: main's _deadStudy offers Try again when the studies did not load; v2's study pages only said so.
describe('a study page whose studies did not load', () => {
  const tryAgain = (root) => [...root.querySelectorAll('button')].find((b) => b.textContent === 'Try again');
  const props = { gate: null, go: vi.fn(), replace: vi.fn(), pop: vi.fn(), openTab: vi.fn(), onReady: () => {}, desktop: false,
    device: /** @type {'phone'} */ ('phone'), facts: { doubleTapFullscreen: false } };

  it("a study's page says it could not be opened, with Try again; Try again asks again and the study opens", async () => {
    installLoaders({ fail: true });
    const { container } = render(<StudyScreen route={{ place: 'study', study: 'more-than-a-man' }} {...props} />);
    await waitFor(() => expect(container.querySelector('.empty .t').textContent).toBe('This study could not be opened.'));
    g.loadBibleStudies.mockImplementation(() => { g.BIBLE_STUDIES = studies(); return Promise.resolve(true); });
    await click(tryAgain(container));
    await waitFor(() => expect(container.textContent).not.toContain('could not be opened'));
    expect(g.loadBibleStudies).toHaveBeenCalledTimes(2);
  });

  it("a study's chapter says it could not be opened, with Try again; Try again asks again and the chapter opens", async () => {
    installLoaders({ fail: true });
    g.ProphecyCardsStore = cardStore();
    const { container } = render(<StudyChapterScreen route={{ place: 'study-chapter', study: 'more-than-a-man', chapter: CH2 }} {...props} />);
    await waitFor(() => expect(container.querySelector('.empty .t').textContent).toBe('This chapter could not be opened.'));
    g.loadBibleStudies.mockImplementation(() => { g.BIBLE_STUDIES = withChapter2(); return Promise.resolve(true); });
    await click(tryAgain(container));
    await waitFor(() => expect(container.textContent).not.toContain('could not be opened'));
    expect(g.loadBibleStudies).toHaveBeenCalledTimes(2);
  });

  it('a study the loaded studies do not have offers no Try again', async () => {
    installLoaders();
    const { container } = render(<StudyScreen route={{ place: 'study', study: 'nope' }} {...props} />);
    await waitFor(() => expect(container.querySelector('.empty .t').textContent).toBe('This study could not be opened.'));
    expect(tryAgain(container)).toBe(undefined);
  });

  // zs30: the studies loaded but main's MATTHEW corpus did not (offline before it was kept): useStudies said 'ready'
  /** main's Matthew loader failing once (index.html rejects a bundle that did not load or run), then landing */
  const matthewFailsOnce = () => {
    installLoaders();
    g.__loadMatthewCorpus = vi.fn(() => Promise.reject(new Error('offline')));
    return () => g.__loadMatthewCorpus.mockImplementation(() => { g.MATTHEW = MATTHEW; return Promise.resolve(); });
  };

  it('a Matthew chapter whose Matthew corpus did not load says so, with Try again; Try again opens it', async () => {
    const land = matthewFailsOnce();
    const { container } = render(<StudyChapterScreen route={{ place: 'study-chapter', study: 'matthew-study', chapter: '5' }} {...props} />);
    await waitFor(() => expect(container.querySelector('.empty .t').textContent).toBe('This chapter could not be opened.'));
    land();
    await click(tryAgain(container));
    await waitFor(() => expect(container.textContent).not.toContain('could not be opened'));
    expect(g.__loadMatthewCorpus).toHaveBeenCalledTimes(2);
  });

  it('the Matthew index whose Matthew corpus did not load says so, with Try again; Try again opens it', async () => {
    const land = matthewFailsOnce();
    const { container } = render(<StudyScreen route={{ place: 'study', study: 'matthew-study' }} {...props} />);
    await waitFor(() => expect(container.querySelector('.empty .t').textContent).toBe('This study could not be opened.'));
    land();
    await click(tryAgain(container));
    await waitFor(() => expect(container.textContent).not.toContain('could not be opened'));
    expect(g.__loadMatthewCorpus).toHaveBeenCalledTimes(2);
  });

  it('a Matthew failure leaves the Studies list as it was (its rows, no "couldn\'t load")', async () => {
    matthewFailsOnce();
    const { container } = render(<StudiesScreen {...props} route={{ place: 'studies' }} />);
    await waitFor(() => expect(container.querySelectorAll('.rows .stu').length).toBeGreaterThan(1));
    expect(container.textContent).not.toContain('load');
  });
});
