/* v2 Studies (zones v2p5; pictures 2d-studies, 2e-study-index): main's study chain under design's title rule, the label
   and coverage words each row says, a study's Preface + Parts + chapters with main's read marks and the chapter you are
   on (read only), and the gate drawing both pictures from memory. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { V2App } from './App.jsx';
import {
  splitStudyTitle, studyChain, studyRow, coverageWords, studyEntries, studyHead, studyRoute, savedStudyPlace, partHolding,
  curly,
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
function installLoaders({ fail = false } = {}) {
  g.loadBibleStudies = vi.fn(() => {
    if (fail) return Promise.resolve(false);
    g.BIBLE_STUDIES = studies();
    return Promise.resolve(true);
  });
  g.__loadMatthewCorpus = vi.fn(() => { g.MATTHEW = MATTHEW; return Promise.resolve(); });
}

afterEach(() => {
  cleanup();
  for (const k of ['BIBLE_STUDIES', 'MATTHEW', 'loadBibleStudies', '__loadMatthewCorpus', 'StateStore', 'AUDIO_MANIFEST', 'matchMedia']) delete g[k];
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
