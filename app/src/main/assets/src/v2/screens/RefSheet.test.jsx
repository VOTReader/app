/* v2 references and footnotes (mw6, v2-gaps 1-4; design's dz13 pictures 1d-1g and 8d): a Format B entry's head, stanza gaps
   and tappable cites; one sheet for a reference and a footnote; footnote numbers anywhere in a 44 px square; the Footnotes
   list; Safari's 7-day notice before the first save. Fixtures copy the corpus's own shapes (wtlb-one.js entry 46,
   volume-one.js Letter 9's footnotes and nkjv). */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { LetterScreen, footnoteNear, entryEyebrow } from './LetterScreen.jsx';
import { SafariSheet } from './SafariNotice.jsx';
import { formatBDomText, formatBRefScan } from '../../utils/format-b-dom-text.js';
import { footnoteItems, passages, translationOf, findChapterRoute } from '../footnotes.js';
import { OVERLAYS, placeFor } from '../places.js';
import { GATE_STATES } from '../gate.js';
import { applyGateScroll, holdGateScroll } from '../App.jsx';
import './CollectionScreen.jsx';

const g = /** @type {any} */ (globalThis);
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const key = (el, k) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
const SEEDED = ['COL_BY_KEY', 'WTLB_ONE', 'LETTERS_V1', 'LETTERS_V3', 'HOLY_DAYS', 'WTLB_SCRIPTURES', 'splitCompoundRef', 'findBook',
  'lookupVersesFromBooks', 'StorageHealth', 'AnnotationStore', '__loadVotCorpus', '__loadBibleCorpus', 'BOOKS'];

afterEach(() => {
  cleanup();
  for (const k of SEEDED) delete g[k];
});

/** @type {Array<[string, any]>} */
const COLS = [
  ['one', { volKey: 'one', globalName: 'LETTERS_V1', prefaceGlobal: null, label: 'Volume One' }],
  ['three', { volKey: 'three', globalName: 'LETTERS_V3', prefaceGlobal: null, label: 'Volume Three' }],
  ['wtlb1', { volKey: 'wtlb1', globalName: 'WTLB_ONE', prefaceGlobal: null, label: 'Words To Live By: Part One', kind: 'wtlb' }],
  ['holydays', { volKey: 'holydays', globalName: 'HOLY_DAYS', prefaceGlobal: null, label: 'Regarding The Holy Days', kind: 'holy-days' }],
];

/** wtlb-one.js entry 46 as the corpus keeps it. */
const GALLOWS = { id: 'building-the-gallows', num: 46, title: 'Building the Gallows', paragraphs: [
  { align: 'center', text: 'Vanity is a rope, and pride builds the gallows;\n\nEnvy leads to hate, and jealousy\n\nBrings forth evil thoughts.' },
  { align: 'center', text: 'Therefore, beware of the thoughts of your heart,\n\nLest you follow in Haman’s error {{nav:esther:7}}\n\nAnd walk in the way of Cain, {{ref:1 John 3:12}} · {{ref:Genesis 4:8}}\n\nTo your own demise, says The Lord.' },
] };
const CAIN = 'not as Cain who was of the wicked one and murdered his brother. And why did he murder him? Because his works were evil and his brother’s righteous.';

/** volume-one.js Letter 9's footnotes and nkjv, as the corpus keeps them. */
const NAME = { id: 'whats-in-a-name', num: 9, title: "What's In a Name", date: '10/29/04', blocks: [
  { type: 'para', segments: [{ t: 'text', v: 'There is only one name under Heaven by which you must be saved.' }, { t: 'fn', v: '1' }, { t: 'fn', v: '2' },
    { t: 'text', v: 'And oh how blessed are those who put their trust in Him.' }] },
  { type: 'poetry', lines: [[{ t: 'italic', v: 'Is written in The Book of Life;' }, { t: 'fn', v: '3' }]] },
], footnotes: {
  1: { type: 'note', text: 'See: "Death and Deliverance" (first paragraph)', url: 'https://www.thevolumesoftruth.com/Death_and_Deliverance',
    link: { collection: 'Volume Three', letterTitle: 'Death and Deliverance', excerpt: 'For they have called upon The Name' } },
  2: { type: 'note', text: 'See: "Death and Deliverance" (last paragraph)', url: 'https://www.thevolumesoftruth.com/Death_and_Deliverance',
    link: { collection: 'Volume Three', letterTitle: 'Death and Deliverance', excerpt: 'Yet understand this' } },
  3: { type: 'scripture', ref: 'Revelation 3:5' },
}, nkjv: { 'Revelation 3:5': 'He who overcomes shall be clothed in white garments, and I will not blot out his name from the Book of Life; but I will confess his name before My Father and before His angels.' } };

/** Main's Bible helpers as bundle-b publishes them, enough for these references. */
function bible() {
  const BOOK = { '1 John': '1-john', Genesis: 'genesis', Revelation: 'revelation', Psalm: 'psalms', Isaiah: 'isaiah' };
  const parse = (ref) => {
    const m = /^(.+?) (\d+)(?::(\d+))?$/.exec(ref.trim());
    return m ? { rawBook: m[1], chapter: Number(m[2]), verse: m[3] ? Number(m[3]) : null } : null;
  };
  g.splitCompoundRef = (ref) => ref.split(';').map((r) => r.trim()).filter(Boolean).map((r) => ({ ref: r, parsed: parse(r) })).filter((p) => p.parsed);
  g.findBook = (raw) => BOOK[raw] || null;
}

function seed() {
  g.COL_BY_KEY = new Map(COLS);
  g.WTLB_ONE = [{ id: 'glad-service', num: 45, title: 'Glad Service', paragraphs: [{ align: 'left', text: 'x' }] }, GALLOWS,
    { id: 'walking-together', num: 47, title: 'Walking Together in The Father’s Joy', paragraphs: [{ align: 'left', text: 'y' }] }];
  g.LETTERS_V1 = [NAME, { id: 'i-am', num: 10, title: 'And He Shall Be Called I AM', blocks: [] }];
  g.LETTERS_V3 = [{ id: 'death-and-deliverance', num: 2, title: 'Death and Deliverance', blocks: [] }];
  g.WTLB_SCRIPTURES = { '1 John 3:12': CAIN, 'Genesis 4:8': 'Now Cain talked with Abel his brother.' };
  bible();
}

describe('a Format B entry (Words To Live By: picture 1d)', () => {
  it('says its part and number above the title ("Part One · Entry 46"), no header lines, and Next names the entry', () => {
    seed();
    const { container } = render(<LetterScreen collection="wtlb1" n={46} />);
    const head = container.querySelector('.page-head');
    expect(head.classList.contains('fb-head')).toBe(true);
    expect(head.querySelector('.eyebrow').textContent).toBe('Part One · Entry 46');
    expect(head.querySelector('.meta')).toBeNull();
    expect(container.querySelector('.nextcard .k').textContent).toBe('Next · Entry 47');
    expect(container.querySelector('.body').classList.contains('fb')).toBe(true);
  });

  it('Back on the entry says "Words To Live By" (the collection page as it heads itself), Volume One still "Volume One"', () => {
    seed();
    const title = /** @type {any} */ (placeFor('collection')).title;
    expect(title({ place: 'collection', collection: 'wtlb1' })).toBe('Words To Live By');
    expect(title({ place: 'collection', collection: 'one' })).toBe('Volume One');
    expect(entryEyebrow({ volKey: 'holydays', label: 'Regarding The Holy Days' }, 3)).toBe('Regarding The Holy Days · Entry 3');
  });

  it("a blank line is a stanza's next line (a small gap, .pb), with no character added: the DOM text stays main's", () => {
    seed();
    const { container } = render(<LetterScreen collection="wtlb1" n={46} />);
    const ps = [...container.querySelectorAll('.body p[data-hl-key]')];
    expect(ps.map((p) => p.querySelectorAll(':scope > .pb').length)).toEqual([2, 3]);
    expect(ps.map((p) => p.querySelectorAll('br').length)).toEqual([0, 0]);
    ps.forEach((p, i) => expect(p.textContent).toBe(formatBDomText(GALLOWS.paragraphs[i].text, { bookTitle: () => 'Esther' })));
  });

  it('a reference is a gold cite that opens its sheet (Scripture, the verse, NKJV, Go to): picture 1e', async () => {
    seed();
    const onGo = vi.fn();
    const { container } = render(<LetterScreen collection="wtlb1" n={46} onGo={onGo} />);
    const cite = container.querySelector('a.cite[data-ref="1 John 3:12"]');
    expect(cite.textContent).toBe('(1 John 3:12)');
    click(cite);
    const sheet = document.querySelector('[role="dialog"].ref');
    expect(sheet.querySelector('.overline').textContent).toBe('Scripture');
    expect(sheet.querySelector('.ref-h').textContent).toBe('1 John 3:12');
    expect(sheet.querySelector('.ref-v').textContent).toBe(CAIN);
    expect(sheet.querySelector('.ref-tr').textContent).toBe('NKJV');
    expect(cite.classList.contains('on')).toBe(true);
    // no paragraph sheet under it: the tap was the cite's
    expect(document.querySelector('.sheet.para')).toBeNull();
    const go = sheet.querySelector('button.pill.block');
    expect(go.textContent).toBe('Go to 1 John 3:12');
    click(go);
    await act(async () => {});
    expect(onGo).toHaveBeenLastCalledWith({ place: 'bible-chapter', book: '1-john', chapter: 3, verse: 12 });
    expect(document.querySelector('[role="dialog"].ref')).toBeNull();
    expect(cite.classList.contains('on')).toBe(false);
  });

  it('a chapter link [Esther 7] opens the chapter straight away (no sheet); Escape closes a sheet', () => {
    seed();
    const onGo = vi.fn();
    const { container } = render(<LetterScreen collection="wtlb1" n={46} onGo={onGo} />);
    const nav = container.querySelector('a.cite.nav');
    expect(nav.textContent).toBe('[Esther 7]');
    click(nav);
    expect(onGo).toHaveBeenLastCalledWith({ place: 'bible-chapter', book: 'esther', chapter: 7 });
    expect(document.querySelector('[role="dialog"].ref')).toBeNull();
    key(container.querySelector('a.cite[data-ref="Genesis 4:8"]'), 'Enter');
    expect(document.querySelector('[role="dialog"].ref .ref-h').textContent).toBe('Genesis 4:8');
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(document.querySelector('[role="dialog"].ref')).toBeNull();
  });

  it('on the laptop the sheet is the centred dialog with its own close x', () => {
    seed();
    const { container } = render(<LetterScreen collection="wtlb1" n={46} desktop />);
    click(container.querySelector('a.cite[data-ref="1 John 3:12"]'));
    const dlg = document.querySelector('.dlg.ref');
    expect(dlg).not.toBeNull();
    click(dlg.querySelector('button.x[aria-label="Close"]'));
    expect(document.querySelector('.dlg.ref')).toBeNull();
  });

  it('in a footnotes-mode collection (Holy Days) a reference inside the text is its number, listed at the foot', () => {
    seed();
    const paragraphs = [{ align: 'left', text: 'Keep My feasts {{ref:Leviticus 23:2}} and rest {{ref:Exodus 20:8}} always.' },
      { align: 'left', text: 'Remember the day. {{ref:Leviticus 23:2}} Then rest. {{ref:Psalm 118:14; Isaiah 12:2}}' }];
    g.HOLY_DAYS = [{ id: 'feasts', num: 1, title: 'The Feasts', paragraphs }];
    const { container } = render(<LetterScreen collection="holydays" n={1} />);
    const scan = formatBRefScan(paragraphs, true);
    const ps = [...container.querySelectorAll('.body p[data-hl-key]')];
    ps.forEach((p, i) => expect(p.textContent).toBe(formatBDomText(paragraphs[i].text, { refs: scan.perParagraph[i], footnotesMode: true })));
    expect([...container.querySelectorAll('.body sup.fn-ref')].map((s) => s.textContent)).toEqual(['1', '2', '1']);
    // the last reference ends its paragraph: it stays a cite, as main
    expect(container.querySelector('a.cite').getAttribute('data-ref')).toBe('Psalm 118:14; Isaiah 12:2');
    expect([...container.querySelectorAll('.fnl .fni .t')].map((t) => t.textContent)).toEqual(['Leviticus 23:2', 'Exodus 20:8']);
  });
});

describe("a letter's footnotes (Volume One, Letter 9: pictures 1f, 1g)", () => {
  it('lists them at the foot of the letter, before the Next card: notes with Read, Scripture with its verse and Go to', () => {
    seed();
    const { container } = render(<LetterScreen collection="one" n={9} />);
    const list = container.querySelector('.body .fnl');
    expect(list.nextElementSibling.classList.contains('nextcard')).toBe(true);
    expect(list.querySelector('.label').textContent).toBe('Footnotes');
    const items = [...list.querySelectorAll('.fni')];
    expect(items.map((it) => it.querySelector('.n').textContent)).toEqual(['1', '2', '3']);
    expect(items[0].querySelector('.t').textContent).toBe('See: "Death and Deliverance" (first paragraph)');
    expect(items[0].querySelector('button').textContent).toBe('Read Death and Deliverance');
    expect(items[2].querySelector('.t').textContent).toBe('Revelation 3:5');
    expect(items[2].querySelector('.v').textContent).toBe(NAME.nkjv['Revelation 3:5']);
    expect(items[2].querySelector('button').textContent).toBe('Go to Revelation 3:5');
  });

  it('a footnote number opens "Footnote n of N": its note, its collection, Read <letter>; < > step and the ring follows', () => {
    seed();
    const onGo = vi.fn();
    const { container } = render(<LetterScreen collection="one" n={9} onGo={onGo} />);
    const one = container.querySelector('.body sup.fn-ref[data-fn-num="1"]');
    expect(one.getAttribute('role')).toBe('button');
    click(one);
    let sheet = document.querySelector('[role="dialog"].ref');
    expect(sheet.querySelector('.ref-top .overline').textContent).toBe('Footnote 1 of 3');
    expect(/** @type {HTMLButtonElement} */ (sheet.querySelector('[aria-label="Previous footnote"]')).disabled).toBe(true);
    expect(sheet.querySelector('.ref-note').textContent).toBe('See: "Death and Deliverance" (first paragraph)');
    expect(sheet.querySelector('.ref-src').textContent).toBe('Volume Three');
    expect(one.classList.contains('on')).toBe(true);
    click(sheet.querySelector('[aria-label="Next footnote"]'));
    click(document.querySelector('[aria-label="Next footnote"]'));
    sheet = document.querySelector('[role="dialog"].ref');
    expect(sheet.querySelector('.ref-top .overline').textContent).toBe('Footnote 3 of 3');
    expect(/** @type {HTMLButtonElement} */ (sheet.querySelector('[aria-label="Next footnote"]')).disabled).toBe(true);
    expect(sheet.querySelector('.ref-h').textContent).toBe('Revelation 3:5');
    expect(one.classList.contains('on')).toBe(false);
    expect(container.querySelector('sup.fn-ref[data-fn-num="3"]').classList.contains('on')).toBe(true);
    click(sheet.querySelector('[aria-label="Previous footnote"]'));
    click(document.querySelector('[aria-label="Previous footnote"]'));
    click(document.querySelector('[role="dialog"].ref button.pill.block'));
    expect(onGo).toHaveBeenLastCalledWith({ place: 'letter', collection: 'three', n: 2 });
    expect(document.querySelector('[role="dialog"].ref')).toBeNull();
  });

  it("a footnote number in the header lines opens too (Timothy's From line), wears the ring, and the title opens nothing", () => {
    seed();
    // letters-timothy.js 'The Shadow of The Almighty' keeps its From line as segments with a footnote
    g.LETTERS_V1 = [{ id: 'shadow', num: 1, title: 'The Shadow of The Almighty', date: '6/18/06',
      from: [{ t: 'text', v: 'The Interpretation of the Vision Given to Timothy' }, { t: 'fn', v: '1' }],
      blocks: [{ type: 'para', segments: [{ t: 'text', v: 'Behold, the shadow.' }] }],
      footnotes: { 1: { type: 'scripture', ref: 'Revelation 3:5' } }, nkjv: NAME.nkjv }];
    const { container } = render(<LetterScreen collection="one" n={1} onGo={() => {}} />);
    const mark = container.querySelector('.page-head .meta sup.fn-ref[data-fn-num="1"]');
    expect(mark).toBeTruthy();
    click(container.querySelector('.page-head h1'));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    click(mark);
    expect(document.querySelector('[role="dialog"].ref .ref-top .overline').textContent).toBe('Footnote 1');
    expect(mark.classList.contains('on')).toBe(true);
    key(document, 'Escape');
    expect(document.querySelector('[role="dialog"].ref')).toBeNull();
    key(mark, 'Enter');
    expect(document.querySelector('[role="dialog"].ref .ref-h').textContent).toBe('Revelation 3:5');
  });

  it('a footnote number answers a tap anywhere in its 44 px square, the nearest when two are close', () => {
    const root = document.createElement('div');
    const box = (left, top, w, h) => () => /** @type {DOMRect} */ (/** @type {any} */ ({ left, top, right: left + w, bottom: top + h, width: w, height: h }));
    root.innerHTML = '<sup class="fn-ref" data-fn-num="1">1</sup><sup class="fn-ref" data-fn-num="2">2</sup><sup class="fn-ref" data-fn-num="9">9</sup>';
    const [a, b, c] = root.querySelectorAll('sup');
    a.getBoundingClientRect = box(100, 200, 8, 12);   // centre 104, 206
    b.getBoundingClientRect = box(112, 200, 8, 12);   // centre 116, 206
    c.getBoundingClientRect = box(0, 0, 0, 0);   // not laid out
    expect(footnoteNear(root, 104 - 20, 206 + 20)).toBe(a);   // 20 px off both ways: inside 1's square
    expect(footnoteNear(root, 111, 206)).toBe(b);              // between them: the nearer
    expect(footnoteNear(root, 104, 206 - 23)).toBeNull();      // just outside every square
    expect(footnoteNear(root, 0, 0)).toBeNull();                // the unlaid number never answers
  });
});

describe('footnotes.js', () => {
  it('orders a letter\'s footnotes as main ("2" before "10"); a Format B entry outside footnotes mode has none', () => {
    const items = footnoteItems({ blocks: [], footnotes: { 10: { text: 'b' }, 2: { text: 'a' } } }, 'one');
    expect(items.map((i) => i.num)).toEqual(['2', '10']);
    expect(footnoteItems(GALLOWS, 'wtlb1')).toEqual([]);
  });

  it("a compound cite is each passage under its own heading; an edition tag names the edition", () => {
    bible();
    g.lookupVersesFromBooks = (ref) => ({ 'Psalm 118:14': 'The LORD is my strength and song.', 'Isaiah 12:2': 'Behold, God is my salvation.' }[ref] || null);
    const list = passages('Psalm 118:14; Isaiah 12:2');
    expect(list.map((p) => [p.label, p.text, !!p.parsed])).toEqual([
      ['Psalm 118:14', 'The LORD is my strength and song.', true], ['Isaiah 12:2', 'Behold, God is my salvation.', true]]);
    expect(translationOf('John 14:6 (KJV)')).toBe('KJV');
    expect(translationOf('John 14:6')).toBe('NKJV');
  });

  it('"Go to" waits for main\'s Bible when it has not loaded, then names the book', async () => {
    bible();
    const findBook = g.findBook;
    g.findBook = () => null;
    g.__loadBibleCorpus = () => { g.findBook = findBook; return Promise.resolve(); };
    const route = await findChapterRoute({ rawBook: 'Genesis', chapter: 4, verse: 8 });
    expect(route).toEqual({ place: 'bible-chapter', book: 'genesis', chapter: 4, verse: 8 });
  });
});

describe("Safari's 7-day notice (picture 8d)", () => {
  /** main's StorageHealth gate, in memory: the first save of the session in a Safari tab trips it. */
  function health() {
    let blocked = false, dismissed = false, version = 0, first = true;
    const subs = new Set();
    const bump = () => { version++; subs.forEach((cb) => cb()); };
    return {
      checkFirstDataCreation: vi.fn(() => {
        if (!first || dismissed) return { shouldBlock: false };
        first = false; blocked = true; bump();
        return { shouldBlock: true, reason: 'safari-7day' };
      }),
      getReport: () => ({ safariGateBlocked: blocked }),
      isDismissed: () => dismissed,
      dismissScenario: vi.fn(() => { dismissed = true; blocked = false; bump(); }),
      subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); },
      getVersion: () => version,
    };
  }

  it('the first mark waits: nothing is saved, the paragraph stays lit under the notice; Got it lets the next one through', () => {
    seed();
    g.StorageHealth = health();
    g.AnnotationStore = { get: () => [], add: vi.fn(), recolorGroup: vi.fn(), removeGroup: vi.fn() };
    const Notice = OVERLAYS['safari-7day'];
    const { container } = render(<><LetterScreen collection="one" n={9} /><Notice route={{}} gate={null} desktop={false} go={() => {}} openTab={() => {}} /></>);
    expect(document.querySelector('.sheet.safari')).toBeNull();
    const p = container.querySelector('.body [data-hl-key]');
    click(p);
    click(document.querySelector('.sheet.para .swatch.gold'));
    expect(g.StorageHealth.checkFirstDataCreation).toHaveBeenCalledTimes(1);
    expect(g.AnnotationStore.add).not.toHaveBeenCalled();
    expect(document.querySelector('.sheet.para')).toBeNull();
    expect(p.classList.contains('tapped')).toBe(true);
    const notice = document.querySelector('.sheet.safari');
    expect(notice.querySelector('.sh').textContent).toBe('Keep your notes safe');
    expect([...notice.querySelectorAll('.howto li')].map((li) => li.textContent.trim())).toEqual(['1Tap Share', '2Choose Add to Home Screen']);
    click(notice.querySelector('button.done'));
    expect(g.StorageHealth.dismissScenario).toHaveBeenCalledWith('safari-7day');
    expect(document.querySelector('.sheet.safari')).toBeNull();
    expect(p.classList.contains('tapped')).toBe(false);
  });

  it("on a Mac the step is Safari's File > Add to Dock", () => {
    render(<SafariSheet mac desktop={false} onDone={() => {}} />);
    expect(document.querySelector('.howto').textContent).toBe('1In Safari, choose File > Add to Dock');
  });
});

describe('the gate rows for dz13', () => {
  it('names every new picture; 1d/1e/1f sit at the end of the page, 1g at footnote 1, 8d as 4b under the notice', () => {
    for (const id of ['1d-wtlb-entry', '1e-ref-sheet', '1f-footnotes', '1g-footnote-sheet', '8d-safari-notice']) expect(GATE_STATES[id]).toBeTruthy();
    expect(GATE_STATES['1e-ref-sheet'].open).toEqual({ sheet: 'ref', ref: '1 John 3:12' });
    expect(GATE_STATES['8d-safari-notice'].open).toEqual({ sheet: 'safari-7day', para: 0 });
    const el = /** @type {any} */ ({ scrollTop: 0, scrollHeight: 2400 });
    applyGateScroll(el, 'end');
    expect(el.scrollTop).toBe(2400);
  });

  it("'end' stays the end when the phone's bars land after the gate's scroll (S22: the scroller shrinks ~80 px)", () => {
    const realRO = globalThis.ResizeObserver;
    /** @type {(() => void)[]} */
    const fire = [];
    const watched = [];
    globalThis.ResizeObserver = /** @type {any} */ (class {
      constructor(cb) { fire.push(cb); }
      observe(t) { watched.push(t); }
      disconnect() { fire.length = 0; }
    });
    try {
      const page = {};
      // a browser clamps scrollTop to scrollHeight - clientHeight
      const el = /** @type {any} */ ({ children: [page], scrollHeight: 2400, clientHeight: 700, top: 0,
        get scrollTop() { return this.top; }, set scrollTop(v) { this.top = Math.min(v, this.scrollHeight - this.clientHeight); } });
      const after = vi.fn();
      const stop = holdGateScroll(el, 'end', false, after);
      expect(el.scrollTop).toBe(1700);
      expect(watched).toEqual([el, page]);
      el.clientHeight = 620;                  // the insets arrive: the scroller is 80 px shorter, the page left 80 px short
      fire.forEach((cb) => cb());
      expect(el.scrollTop).toBe(1780);
      expect(after).toHaveBeenCalledTimes(2);
      stop();
      expect(fire).toHaveLength(0);
      // a number or a selector is not held: the system moved every line with the edge
      holdGateScroll(el, 300, false, after);
      expect(fire).toHaveLength(0);
    } finally {
      globalThis.ResizeObserver = realRO;
    }
  });

  it('a gate boot draws the open sheet and the mark, and a tap acts on nothing', () => {
    seed();
    const onGo = vi.fn();
    const { container } = render(<LetterScreen collection="one" n={9} gate={GATE_STATES['1g-footnote-sheet']} onGo={onGo} />);
    expect(document.querySelector('[role="dialog"].ref .ref-top .overline').textContent).toBe('Footnote 1 of 3');
    expect(container.querySelector('sup.fn-ref[data-fn-num="1"]').classList.contains('on')).toBe(true);
    click(container.querySelector('sup.fn-ref[data-fn-num="2"]'));
    expect(document.querySelector('[role="dialog"].ref .ref-top .overline').textContent).toBe('Footnote 1 of 3');
    click(document.querySelector('[role="dialog"].ref button.pill.block'));
    expect(onGo).not.toHaveBeenCalled();
  });
});
