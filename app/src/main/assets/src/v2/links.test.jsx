/* Making a link (mw8, v2-gaps 24; design dz22 4b, 4d-4i): main's LinkStore records made from a paragraph (main's source
   endpoint, a verse at once, a chapter's or a letter's words), the picker's Search / Browse / Recent and its words level,
   "Linked to ..." with Undo, main's link icon drawn as the kit's, the Links sheet with Remove and Undo, and the gate rows.
   main's nav index runs for real on a small Bible (John 15) and Volume One (Letters 1 and 16); its reference parser and a
   few bundle-a helpers are stand-ins. */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, waitFor, act, fireEvent } from '@testing-library/react';
import { V2App, applyGateScroll } from './App.jsx';
import { GATE_STATES, GATE_NOW } from './gate.js';
import {
  sourceQuote, sourceOf, makeLink, removeLink, restoreLink, linksOn, linkCard, verseTarget, wordsTarget, snapWords,
  testamentOf, findPlaces, dressLinkIcons, gateLinkIcons, linkToast,
} from './links.js';
import { LinkPicker, selectionPick, libraryRows } from './screens/LinkPicker.jsx';
import * as NAV from '../utils/nav-index.js';
import './screens/LetterScreen.jsx';
import './screens/CollectionScreen.jsx';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const settle = (ms = 30) => act(() => new Promise((r) => { setTimeout(r, ms); }));
const texts = (root, sel) => [...root.querySelectorAll(sel)].map((n) => n.textContent);
const byText = (root, sel, t) => [...root.querySelectorAll(sel)].find((n) => n.textContent === t);

const PARA_1 = 'Thus says The Lord to His servant: Many things you must overcome in the years ahead; many things will I show you, '
  + 'many things will I teach you.';
const L16_PARA = 'Timothy, write as I speak. For the time has come, and is already upon you, when the children of God must be '
  + 'cleansed and set apart for My glory, says The Lord. Yet today the sanctified will be lashed.';
const LETTER_1 = { id: 'chosen-by-god', num: 1, title: 'Chosen by God', blocks: [{ type: 'para', segments: [{ t: 'text', v: PARA_1 }] }] };
const LETTER_16 = { id: 'run-from-the-forest-and-loose-all-that-binds-you', num: 16, title: 'Run from the Forest and Loose All That Binds You',
  blocks: [{ type: 'para', segments: [{ t: 'text', v: L16_PARA }] }, { type: 'para', segments: [{ t: 'text', v: 'Run from the forest, says The Lord.' }] }] };
const ONE = { volKey: 'one', label: 'Volume One', globalName: 'LETTERS_V1', letterScreen: 'vot-one-letter', kind: 'letter' };
const J15_16 = 'You did not choose Me, but I chose you and appointed you that you should go and bear fruit, and that your fruit '
  + 'should remain, that whatever you ask the Father in My name He may give you.';
const JOHN = { id: 'john', title: 'John', chapters: [{ num: 15, sections: [
  { heading: '', verses: [{ n: 14, text: 'You are My friends if you do whatever I command you.' },
    { n: 15, text: 'No longer do I call you servants.' }, { n: 16, text: J15_16 }, { n: 17, text: 'These things I command you, that you love one another.' }] },
  { heading: 'The World’s Hatred', verses: [{ n: 18, text: 'If the world hates you, you know that it hated Me before it hated you.' }] },
] }] };

/** main's LinkStore and persistLink (stores/link-store.js), in memory. */
function linkStore(seed = []) {
  const listeners = new Set();
  let all = seed.slice();
  const bump = () => { L.v += 1; listeners.forEach((cb) => cb()); };
  const touches = (l, key) => (l.source && l.source.key === key) || (l.target && l.target.key === key);
  const L = {
    v: 0,
    subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    getVersion: () => L.v,
    getForKey: (key) => all.filter((l) => touches(l, key)),
    getForKeyPrefix: (p) => all.filter((l) => [l.source.key, l.target.key].some((k) => k === p || k.indexOf(p + ':') === 0)),
    all: () => all.slice(),
    add: vi.fn((l) => { all.push(l); bump(); }),
    remove: vi.fn((id) => { all = all.filter((l) => l.id !== id); bump(); }),
  };
  let n = 0;
  g.LinkStore = L;
  g.persistLink = vi.fn((source, target) => {
    const dup = L.getForKey(source.key).find((l) => l.source.key === target.key || l.target.key === target.key);
    if (dup) return dup;
    const link = { id: 'lnk_' + (++n), source, target, created: Date.now() };
    L.add(link);
    return link;
  });
  return L;
}

/** The bundle-a helpers main's nav index calls by name, and the corpus it indexes. */
function installCorpus() {
  // main's nav index as bundle-d publishes it on window
  for (const k of NAV_FNS) g[k] = NAV[k];
  g.COLLECTIONS = [ONE];
  g.COL_BY_KEY = new Map([['one', ONE]]);
  g.LETTERS_V1 = [LETTER_1, LETTER_16];
  g.BOOKS = { john: JOHN };
  g._allBooks = () => ({ john: JOHN });
  g._matthew = () => null;
  g.colLetterArr = (c) => g[c.globalName] || [];
  g.colPreface = () => null;
  g.bookCategory = () => 'New Testament';
  g.findBook = (raw) => (/^j(oh)?n$|^john$/i.test(String(raw).trim()) ? 'john' : null);
  g.parseRefStr = (q) => {
    const m = /^([a-z ]+?)\s*(\d+)(?::(\d+))?$/i.exec(String(q).trim());
    return m ? { rawBook: m[1], chapter: Number(m[2]), verse: m[3] ? Number(m[3]) : null, verseEnd: null } : null;
  };
  g.findEntryContext = (id) => {
    const e = [LETTER_1, LETTER_16].find((x) => x.id === id);
    return e ? { kind: 'letter', title: e.title, screen: 'vot-one-letter', collection: 'Volume One', entry: e } : null;
  };
}

const NAV_FNS = ['buildNavIndex', 'searchNavIndex', 'navItemPreview', 'navItemToEndpoint', 'buildSourceEndpoint', 'contentDocToNavItem', 'buildNavTree'];
const GLOBALS = [...NAV_FNS, 'LinkStore', 'persistLink', 'COLLECTIONS', 'COL_BY_KEY', 'LETTERS_V1', 'BOOKS', '_allBooks', '_matthew', 'colLetterArr',
  'colPreface', 'bookCategory', 'findBook', 'parseRefStr', 'findEntryContext', '__NAV_INDEX', '__NAV_INDEX_SIG', 'RecentNavStore',
  'VotSearchMini', 'HistoryStore', 'applyDOMHighlights', 'applyDOMLinks', '__openLinkSidebar', 'AnnotationStore', 'StateStore', 'resolveVerseText', 'matchMedia'];
beforeEach(() => { installCorpus(); });
afterEach(() => {
  cleanup();
  for (const k of GLOBALS) delete g[k];
  delete html.dataset.gate;
  try { window.getSelection().removeAllRanges(); } catch (_e) { /* none */ }
  linkToast.set(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const PARA = { key: 'letter:chosen-by-god:0', start: 0, end: PARA_1.length - 1, text: PARA_1 };
const SOURCE = () => ({ endpoint: sourceOf(PARA, 'Chosen by God'), title: 'Chosen by God · Volume One, Letter 1', text: PARA_1 });
const VERSE = { type: 'bible', key: 'bible:john:15:16', bookId: 'john', chapter: 15, verse: 16, label: 'John 15:16', preview: J15_16 };

describe('links.js (main\'s records)', () => {
  it('the source: main\'s endpoint for the paragraph under the letter\'s title, its words spanned; the quote cut at 90 on a word', () => {
    expect(sourceOf(PARA, 'Chosen by God')).toMatchObject({ type: 'letter', key: 'letter:chosen-by-god:0', letterId: 'chosen-by-god',
      collection: 'Volume One', label: 'Chosen by God', start: 0, end: PARA_1.length - 1, text: PARA_1 });
    delete g.findEntryContext;
    expect(sourceOf(PARA, 'Chosen by God')).toMatchObject({ type: 'letter', key: 'letter:chosen-by-god:0', label: 'Chosen by God' });
    expect(sourceQuote(PARA_1)).toBe('“Thus says The Lord to His servant: Many things you must overcome in the years ahead; many…”');
    expect(sourceQuote('Short words.')).toBe('“Short words.”');
  });

  it('makeLink saves through main\'s persistLink; the same pair again, either way round, reuses it and is not fresh', () => {
    const L = linkStore();
    const src = sourceOf(PARA, 'Chosen by God');
    const first = makeLink(src, VERSE);
    expect(first.fresh).toBe(true);
    expect(L.all()).toEqual([first.link]);
    expect(first.link).toMatchObject({ source: { key: 'letter:chosen-by-god:0' }, target: { key: 'bible:john:15:16' } });
    const again = makeLink(src, VERSE);
    expect(again).toEqual({ link: first.link, fresh: false });
    expect(makeLink(VERSE, src)).toEqual({ link: first.link, fresh: false });
    expect(L.all()).toHaveLength(1);
    delete g.persistLink;
    expect(makeLink(src, VERSE)).toBe(null);
  });

  it('Remove takes it away; Undo puts the same record back once', () => {
    const L = linkStore();
    const { link } = makeLink(sourceOf(PARA, 'Chosen by God'), VERSE);
    removeLink(link.id);
    expect(L.all()).toEqual([]);
    restoreLink(link);
    restoreLink(link);
    expect(L.all()).toEqual([link]);
  });

  it('the links on a block: either end in it or in a range inside it, newest first; not a block whose number starts the same', () => {
    const at = (id, s, t, created) => ({ id, created, source: { key: s }, target: { key: t } });
    linkStore([at('a', 'letter:x:0', 'bible:john:15:16', 1), at('b', 'letter:y:2', 'letter:x:0:5-9', 3),
      at('c', 'letter:x:01', 'bible:john:15:17', 2), at('d', 'letter:x:1', 'bible:john:15:18', 4)]);
    // main's prefix index may hand back more than the block (a string prefix): only the block and ranges in it count
    g.LinkStore.getForKeyPrefix = () => g.LinkStore.all();
    expect(linksOn('letter:x:0').map((l) => l.id)).toEqual(['b', 'a']);
    expect(linksOn('')).toEqual([]);
  });

  it('a card: To or From, the other place\'s kind (testament, Study Bible, where it sits), its words, the day, where it opens', () => {
    const now = new Date(2026, 9, 14, 12).getTime();
    const out = { id: '1', created: now - 3600e3, source: { key: 'letter:chosen-by-god:0', label: 'Chosen by God' }, target: VERSE };
    expect(linkCard(out, 'letter:chosen-by-god:0', now)).toEqual({ id: '1', eyebrow: 'To · New Testament', title: 'John 15:16', text: J15_16,
      day: 'Linked today', open: { place: 'bible-chapter', book: 'john', chapter: 15, verse: 16 } });
    const inn = { id: '2', created: new Date(2026, 9, 9, 9).getTime(),
      source: { type: 'letter', key: 'letter:run-from-the-forest-and-loose-all-that-binds-you:0:80-158', label: LETTER_16.title, text: 'the children of God' },
      target: { key: 'letter:chosen-by-god:0' } };
    expect(linkCard(inn, 'letter:chosen-by-god:0', now)).toMatchObject({ eyebrow: 'From · Volume One · Letter 16', title: LETTER_16.title,
      text: 'the children of God', day: 'Linked Oct 9', open: { place: 'letter', collection: 'one', n: 16 } });
    const bare = { id: '3', created: now - 86400e3, source: { key: 'letter:chosen-by-god:0' },
      target: { type: 'study', key: 'study:matthew-5:3', bookId: 'matthew', chapter: 5, verse: 3, label: 'Matthew 5:3' } };
    g.resolveVerseText = vi.fn(() => 'Blessed are the poor in spirit');
    expect(linkCard(bare, 'letter:chosen-by-god:0', now)).toMatchObject({ eyebrow: 'To · Matthew Study Bible', text: 'Blessed are the poor in spirit', day: 'Linked yesterday' });
    expect(testamentOf('genesis')).toBe('Old Testament');
    expect(testamentOf('matthew')).toBe('New Testament');
    expect(testamentOf('nope')).toBe('');
  });

  it('chosen words make main\'s refined keys: a verse, a run of verses, part of one; a letter\'s words by their block', () => {
    const chapter = { type: 'bible', key: 'bible:john:15', bookId: 'john', chapter: 15, verse: null, label: 'John 15' };
    const verses = JOHN.chapters[0].sections.flatMap((s) => s.verses);
    const whole = verseTarget(chapter, { v1: 16, v2: 16, start: 0, end: J15_16.length, text: J15_16 }, verses, 'John');
    expect(whole).toMatchObject({ key: 'bible:john:15:16', verse: 16, label: 'John 15:16', text: J15_16, preview: J15_16 });
    expect(whole).not.toHaveProperty('verseEnd');
    expect(whole).not.toHaveProperty('partial');
    const run = verseTarget(chapter, { v1: 16, v2: 17, start: 0, end: verses[3].text.length, text: 'x' }, verses, 'John');
    expect(run).toMatchObject({ key: 'bible:john:15:16-17', verse: 16, verseEnd: 17, label: 'John 15:16-17' });
    const part = verseTarget(chapter, { v1: 16, v2: 16, start: 4, end: 21, text: 'did not choose Me' }, verses, 'John');
    expect(part).toMatchObject({ key: 'bible:john:15:16:4-21', charStart: 4, charEnd: 21, partial: true, label: 'John 15:16' });
    const study = verseTarget({ type: 'study', key: 'study:matthew-5:0', bookId: 'matthew', chapter: 5 }, { v1: 3, v2: 3, start: 0, end: 5, text: 'Bless' },
      [{ n: 3, text: 'Bless' }], 'Matthew');
    expect(study.key).toBe('study:matthew-5:3');
    const letter = { type: 'letter', key: 'letter:run:0', letterId: 'run', label: 'Run' };
    expect(wordsTarget(letter, { block: 'letter:run:0', start: 80, end: 158, text: 'the children' }))
      .toMatchObject({ key: 'letter:run:0:80-158', blockKey: '0', start: 80, end: 158, partial: true, text: 'the children' });
    expect(wordsTarget(letter, null)).toEqual(letter);
  });

  it('snapWords pulls a range in to whole words', () => {
    const t = ' Many things, you must';
    expect(snapWords(t, 0, t.length)).toEqual({ start: 1, end: t.length });
    expect(snapWords(t, 3, 8)).toEqual({ start: 1, end: 12 });
    expect(snapWords(t, 11, 13)).toEqual({ start: 6, end: 12 });
    expect(snapWords(t, 12, 14)).toEqual({ start: 14, end: 14 });
  });

  it('main\'s title search as Places rows: a reference with its verse (one tap links), a chapter (its words first)', () => {
    const [verse] = findPlaces('John 15:16');
    expect(verse).toMatchObject({ t: 'John 15:16', s: 'New Testament', v: J15_16, icon: 'book', direct: true });
    const [chapter] = findPlaces('John 15');
    expect(chapter).toMatchObject({ t: 'John 15', s: 'New Testament', v: '', direct: false });
    expect(findPlaces('Chosen').map((r) => r.t)).toEqual(['Chosen by God']);
    expect(findPlaces('')).toEqual([]);
  });

  it('the link icon: main\'s element dressed as the kit\'s (gold for a source, the second colour for a target); a gate draws its own', () => {
    const box = document.createElement('div');
    box.innerHTML = '<p data-hl-key="letter:a:0">Words.<span class="inline-link-icon inline-link-icon-source" role="button"></span></p>'
      + '<p data-hl-key="letter:a:1">More.<span class="inline-link-icon"></span></p><p data-hl-key="letter:a:2">None.</p>';
    dressLinkIcons(box, '<svg class="k"></svg>');
    expect([...box.querySelectorAll('.inline-link-icon')].map((e) => e.className + '|' + e.innerHTML))
      .toEqual(['inline-link-icon inline-link-icon-source lki|<svg class="k"></svg>', 'inline-link-icon lki to|<svg class="k"></svg>']);
    const page = document.createElement('div');
    page.innerHTML = '<p data-hl-key="letter:chosen-by-god:0">Words.</p><p data-hl-key="letter:chosen-by-god:1">More.</p>';
    gateLinkIcons(page, GATE_STATES['4h-link-made'].facts.links, '<svg></svg>');
    const icon = page.querySelector('.lki');
    expect(icon.parentElement.getAttribute('data-hl-key')).toBe('letter:chosen-by-god:0');
    expect(icon.className).toBe('inline-link-icon inline-link-icon-source lki');
    expect(icon.getAttribute('aria-label')).toBe('Open 2 links');
    expect(page.querySelectorAll('.lki')).toHaveLength(1);
  });
});

describe('the picker (4d-4f; main\'s LinkPicker and its words pickers)', () => {
  const open = (props = {}) => {
    const onLinked = vi.fn();
    const onClose = vi.fn();
    const r = render(<LinkPicker source={SOURCE()} onLinked={onLinked} onClose={onClose} {...props} />);
    return { ...r, onLinked, onClose };
  };
  const type = (c, v) => act(() => { fireEvent.change(c.querySelector('.field input.q'), { target: { value: v } }); });

  it('4d: Linking from the paragraph, Search | Browse | Recent, a typed reference finds its verse; one tap links it', async () => {
    const L = linkStore();
    g.RecentNavStore = { list: () => [], add: vi.fn() };
    const { container, onLinked } = open();
    expect(container.querySelector('.sh').textContent).toBe('Link to a passage');
    expect(texts(container, '.lkf > *')).toEqual(['Linking from', 'Chosen by God · Volume One, Letter 1',
      '“Thus says The Lord to His servant: Many things you must overcome in the years ahead; many…”']);
    expect(texts(container, '.seg.lkt [role="tab"]')).toEqual(['Search', 'Browse', 'Recent']);
    expect(container.querySelector('.seg.lkt .on').textContent).toBe('Search');
    expect(texts(container, '.empty .t')).toEqual(['Search to link']);
    await type(container, 'John 15:16');
    expect(texts(container, '.chips.lks .chip.on')).toEqual(['Titles and references']);
    expect(container.querySelector('.label.lkl').textContent).toBe('Places');
    const row = container.querySelector('.lkr');
    expect(texts(row, '.tx > span')).toEqual(['John 15:16', 'New Testament', J15_16]);
    expect(container.querySelector('.lkn').textContent).toBe('A verse links at once. A chapter or a letter opens first, so you can choose its words.');
    await click(row);
    expect(g.RecentNavStore.add).toHaveBeenCalledWith(expect.objectContaining({ kind: 'bible-chapter', bookId: 'john', chapter: 15, verse: 16 }));
    expect(L.all()).toHaveLength(1);
    expect(L.all()[0].target).toMatchObject({ type: 'bible', key: 'bible:john:15:16', label: 'John 15:16' });
    expect(L.all()[0].source).toMatchObject({ key: 'letter:chosen-by-god:0', label: 'Chosen by God', start: 0, text: PARA_1 });
    expect(onLinked).toHaveBeenCalledWith({ link: L.all()[0], fresh: true }, expect.objectContaining({ key: 'bible:john:15:16' }));
  });

  it('no title matches: says so and offers the words; fewer than three letters there asks for more; the engine\'s hits as rows', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const search = vi.fn(() => Promise.resolve({ results: [{ doc: { kind: 'verse', bookId: 'john', chapterNum: 15, verseNum: 16, ref: 'John 15:16', text: J15_16 } }], parsedTerms: ['fruit'] }));
    g.VotSearchMini = { getState: () => ({ ready: true }), init: vi.fn(), search, snippet: (t) => t.slice(0, 20) };
    const { container } = open();
    await type(container, 'zzz');
    expect(texts(container, '.empty .t')).toEqual(['No titles match']);
    await click(byText(container, 'button', 'Search the words instead'));
    expect(container.querySelector('.chip.on').textContent).toBe('Words in the text');
    expect(container.querySelector('.field input').getAttribute('placeholder')).toBe('Search any phrase in the text');
    expect(texts(container, '.lkc2 .chip')).toEqual(['All', 'Scriptures', 'Volumes']);
    await type(container, 'fr');
    expect(container.querySelector('.lkn').textContent).toBe('Type at least three letters to search the text.');
    await type(container, 'fruit');
    await act(async () => { vi.advanceTimersByTime(300); });
    await settle(0);
    expect(search).toHaveBeenCalledWith('fruit', { limit: 60, corpus: 'all', translation: 'nkjv' });
    expect(container.querySelector('.label.lkl').textContent).toBe('In the text');
    expect(texts(container, '.lkr .t')).toEqual(['John 15:16']);
    expect(texts(container, '.lkr .v')).toEqual([J15_16.slice(0, 20)]);
  });

  it('4f: a chapter opens its words; a verse number takes the verse whole; the footer says what it links; Back one level', async () => {
    const L = linkStore();
    const { container } = open();
    await type(container, 'John 15');
    await click(container.querySelector('.lkr'));
    expect(container.querySelector('.lkbk .sh').textContent).toBe('John 15');
    expect(container.querySelector('.lkh').textContent).toBe('From Chosen by God. Tap a verse number for the whole verse, or press and drag over words.');
    expect(texts(container, '.lkv .vn')).toEqual(['14', '15', '16', '17', '18']);
    expect(texts(container, '.lkv h3.lkvh')).toEqual(['The World’s Hatred']);
    const pill = container.querySelector('.lkfoot .pill');
    expect(pill.textContent).toBe('Choose a verse or some words');
    expect(pill.hasAttribute('disabled')).toBe(true);
    await click(container.querySelector('.vn[data-n="16"]'));
    expect(container.querySelector('.vn.on').getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('p.sel .vw.selw').textContent).toBe(J15_16);
    expect(container.querySelector('.lkfoot .pill').textContent).toBe('Link John 15:16');
    await click(container.querySelector('.lkfoot .pill'));
    expect(L.all()[0].target).toMatchObject({ key: 'bible:john:15:16', verse: 16, label: 'John 15:16', text: J15_16 });
    await click(container.querySelector('.lkbk .ic'));
    expect(container.querySelector('.sh').textContent).toBe('Link to a passage');
  });

  it('pressing and dragging over words: the system\'s selection read as verses and characters, or a letter\'s block and words', () => {
    const box = document.createElement('div');
    box.innerHTML = '<p data-verse="15"><button class="vn">15</button><span class="vw">No longer do I call you.</span></p>'
      + '<p data-verse="16"><button class="vn">16</button><span class="vw">You did not choose Me.</span></p>';
    document.body.appendChild(box);
    const sel = window.getSelection();
    const r = document.createRange();
    r.setStart(box.querySelector('[data-verse="15"] .vw').firstChild, 3);
    r.setEnd(box.querySelector('[data-verse="16"] .vw').firstChild, 6);
    sel.removeAllRanges();
    sel.addRange(r);
    expect(selectionPick(box, 'verses', sel)).toEqual({ v1: 15, v2: 16, start: 3, end: 7, text: 'longer do I call you.16You di' });
    const page = document.createElement('div');
    page.innerHTML = '<p data-hl-key="letter:run:0">Timothy, write as I speak. For the time</p>';
    document.body.appendChild(page);
    const r2 = document.createRange();
    r2.setStart(page.querySelector('p').firstChild, 10);
    r2.setEnd(page.querySelector('p').firstChild, 21);
    sel.removeAllRanges();
    sel.addRange(r2);
    expect(selectionPick(page, 'words', sel)).toEqual({ block: 'letter:run:0', start: 9, end: 25, text: 'write as I speak' });
    expect(selectionPick(box, 'words', sel)).toBe(null);
    sel.removeAllRanges();
    expect(selectionPick(page, 'words', sel)).toBe(null);
    box.remove();
    page.remove();
  });

  it('a letter opens its words as the page draws them (main\'s painter kept off); the whole letter, or words chosen', async () => {
    const L = linkStore();
    const { container } = open();
    await type(container, 'Run from');
    await click(container.querySelector('.lkr'));
    expect(container.querySelector('.lkbk .sh').textContent).toBe(LETTER_16.title);
    expect(container.querySelector('.lkh').textContent).toBe('From Chosen by God. Press and drag over the words you want.');
    const blocks = [...container.querySelectorAll('.lkw [data-hl-key]')];
    expect(blocks.map((b) => b.getAttribute('data-hl-key'))).toEqual(['letter:run-from-the-forest-and-loose-all-that-binds-you:0',
      'letter:run-from-the-forest-and-loose-all-that-binds-you:1']);
    expect(container.querySelectorAll('.lkw [data-hl-dom]')).toHaveLength(0);
    expect(container.querySelector('.lkfoot .pill').textContent).toBe('Choose some words');
    const sel = window.getSelection();
    const r = document.createRange();
    const t = blocks[0].firstChild;
    r.setStart(t, 80);
    r.setEnd(t, 158);
    sel.removeAllRanges();
    sel.addRange(r);
    await act(async () => { document.dispatchEvent(new Event('selectionchange')); await new Promise((res) => { setTimeout(res, 200); }); });
    expect(container.querySelector('.lkfoot .pill').textContent).toBe('Link these words');
    await click(container.querySelector('.lkfoot .pill'));
    expect(L.all()[0].target).toMatchObject({ type: 'letter', key: 'letter:run-from-the-forest-and-loose-all-that-binds-you:0:80-158',
      text: 'the children of God must be cleansed and set apart for My glory, says The Lord', partial: true });
    await click(byText(container, 'button', 'Link the whole letter'));
    expect(L.all()[1].target).toMatchObject({ type: 'letter', key: 'letter:run-from-the-forest-and-loose-all-that-binds-you:0', label: LETTER_16.title });
  });

  it('4e Browse: the library in Home\'s order with v2\'s counts; a book\'s chapters as numbers; a volume\'s letters as rows', async () => {
    linkStore();
    const { container } = open();
    await click(byText(container, '[role="tab"]', 'Browse'));
    expect(texts(container, '.lkrows .srow .t').slice(0, 3)).toEqual(['The Scriptures of Truth', 'Matthew Study Bible', 'Volume One']);
    expect(texts(container, '.lkrows .srow .s').slice(0, 3)).toEqual(['66 books', '28 chapters', '2 letters']);
    await click(byText(container, '.srow', 'The Scriptures of Truth66 books'));
    expect(container.querySelector('.lkbk .sh').textContent).toBe('The Scriptures of Truth');
    await click(byText(container, '.srow', 'John21 chapters'));
    expect(container.querySelector('.lkbk .sh').textContent).toBe('John');
    expect(container.querySelectorAll('.chgrid .ch')).toHaveLength(21);
    await click(byText(container, '.chgrid .ch', '15'));
    expect(container.querySelector('.lkbk .sh').textContent).toBe('John 15');
    await click(container.querySelector('.lkbk .ic'));
    await click(container.querySelector('.lkbk .ic'));
    await click(container.querySelector('.lkbk .ic'));
    await click(byText(container, '.srow', 'Volume One2 letters'));
    expect(texts(container, '.lkrows .srow .t')).toEqual(['Chosen by God', LETTER_16.title]);
    const rows = libraryRows({ bibleBooks: [], matthewChapters: [], collections: [{ label: 'Holy Days', entries: [{}, {}, {}] }],
      studies: [{ label: 'A Study', chapters: [{}, {}] }] }, { COL_BY_KEY: new Map([['holydays', { volKey: 'holydays', label: 'Holy Days Letters', globalName: 'X' }]]) });
    expect(rows.map((r) => r.t + ' ' + r.s)).toEqual(['The Scriptures of Truth 66 books', 'Matthew Study Bible 28 chapters', 'Holy Days Letters 3 entries',
      'A Study 2 chapters']);
  });

  it('Recent: none yet says so; main\'s newest links as From / To; either end links that place again as it was', async () => {
    const L = linkStore();
    const { container, unmount } = open();
    await click(byText(container, '[role="tab"]', 'Recent'));
    expect(texts(container, '.empty > *')).toEqual(['No links yet', 'Links you make show here, so you can link the same places again in one tap.']);
    unmount();
    const older = { id: 'o', created: 1, source: { key: 'letter:x:0', label: 'Letter X' }, target: { ...VERSE, key: 'bible:john:15:14', label: 'John 15:14' } };
    L.add(older);
    const again = open();
    await click(byText(again.container, '[role="tab"]', 'Recent'));
    expect(again.container.querySelector('.lkn').textContent).toBe('Tap either end of a link to use that place again.');
    expect(texts(again.container, '.lkpair .lkend')).toEqual(['FromLetter X', 'ToJohn 15:14']);
    await click(byText(again.container, '.lkend', 'ToJohn 15:14'));
    expect(L.all()[1]).toMatchObject({ source: { key: 'letter:chosen-by-god:0' }, target: { key: 'bible:john:15:14', label: 'John 15:14' } });
  });

  it('a gate draws its row and does nothing; it says when its picture is drawn', async () => {
    const L = linkStore();
    const onShown = vi.fn();
    const { container } = open({ gate: GATE_STATES['4d-link-picker'].open.picker, onShown });
    expect(container.querySelector('.field input').getAttribute('value')).toBe('John 15:16');
    expect(container.querySelector('.field').className).toBe('field focus');
    await click(container.querySelector('.lkr'));
    await click(byText(container, '[role="tab"]', 'Browse'));
    expect(container.querySelector('.seg .on').textContent).toBe('Search');
    expect(L.add).not.toHaveBeenCalled();
    expect(onShown).toHaveBeenCalledTimes(1);
  });
});

describe('on the letter (4b, 4h, 4i): a real boot', () => {
  function boot() {
    const L = linkStore();
    g.StateStore = { isReady: () => true, get: () => ({}), set: vi.fn() };
    g.HistoryStore = { isReady: () => true, list: () => [], add: vi.fn() };
    const r = render(<V2App gateId={null} />);
    return { ...r, L };
  }
  async function toLetter1(container) {
    await click(container.querySelector('.pill.block'));
    await settle();
    const p = container.querySelector('[data-hl-key="letter:chosen-by-god:0"]');
    await click(p);
    await settle(400);
    return p;
  }

  it('Link to another passage opens the picker over the lit paragraph; a verse linked closes it with Linked to ... and Undo', async () => {
    // the laptop (a tap opens the sheet at once; the phone waits out a double tap): the picker is the dialog with its x
    g.matchMedia = vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    const { container, L } = boot();
    const p = await toLetter1(container);
    await click(byText(document.body, '.srow', 'Link to another passage'));
    expect(document.querySelector('[aria-label="Mark this paragraph"]')).toBe(null);
    const picker = document.querySelector('[role="dialog"][aria-label="Link to a passage"]');
    expect(picker.className).toBe('dlg lkp');
    expect(picker.querySelector('.ic.x').getAttribute('aria-label')).toBe('Close');
    expect(picker.querySelector('.lkft').textContent).toBe('Chosen by God · Volume One, Letter 1');
    expect(p.classList.contains('tapped')).toBe(true);
    await act(() => { fireEvent.change(picker.querySelector('input.q'), { target: { value: 'John 15:16' } }); });
    await click(picker.querySelector('.lkr'));
    expect(document.querySelector('[aria-label="Link to a passage"]')).toBe(null);
    expect(p.classList.contains('tapped')).toBe(false);
    expect(L.all()).toHaveLength(1);
    const toast = document.querySelector('.toast');
    expect(toast.textContent).toBe('Linked to John 15:16Undo');
    await click(toast.querySelector('.act'));
    expect(L.all()).toEqual([]);
    expect(document.querySelector('.toast')).toBe(null);
  });

  it('main\'s painter puts the icon (after the highlights, again on each link change); it is dressed as the kit\'s and opens Links', async () => {
    const { container, L } = boot();
    const calls = [];
    g.applyDOMHighlights = vi.fn(() => calls.push('highlights'));
    g.applyDOMLinks = vi.fn(() => {
      calls.push('links');
      document.querySelectorAll('[data-hl-key][data-hl-dom]').forEach((el) => {
        el.querySelectorAll('.inline-link-icon').forEach((i) => i.remove());
        const n = L.getForKeyPrefix(el.getAttribute('data-hl-key')).length;
        if (!n) return;
        const icon = document.createElement('span');
        icon.className = 'inline-link-icon inline-link-icon-source';
        icon.addEventListener('click', (e) => { e.stopPropagation(); g.__openLinkSidebar(el.getAttribute('data-hl-key')); });
        el.appendChild(icon);
      });
    });
    await click(container.querySelector('.pill.block'));
    await settle();
    expect(calls).toEqual(['highlights', 'links']);
    const now = Date.now();
    await act(() => { L.add({ id: 'k1', created: now, source: { type: 'letter', key: 'letter:chosen-by-god:0', label: 'Chosen by God' }, target: VERSE }); });
    await settle();
    const icon = container.querySelector('[data-hl-key="letter:chosen-by-god:0"] .inline-link-icon');
    expect(icon.className).toBe('inline-link-icon inline-link-icon-source lki');
    expect(icon.querySelector('svg')).not.toBe(null);
    await click(icon);
    const sheet = document.querySelector('[role="dialog"][aria-label="Links"]');
    expect(sheet.className).toBe('sheet lks2');
    expect(sheet.querySelector('.lkct').textContent).toBe('1 link · Chosen by God');
    expect(texts(sheet, '.lkc .je')).toEqual(['To · New Testament']);
    expect(texts(sheet, '.lkc .lkcm span')).toEqual(['Linked today']);
    // links have one toast: Remove's replaces the "Linked to ..." still showing
    await act(() => { linkToast.set({ text: 'Linked to John 15:16', act: 'Undo', onAct: vi.fn() }); });
    expect(texts(document.body, '.toast')).toEqual(['Linked to John 15:16Undo']);
    await click(sheet.querySelector('.lkcm .textbtn'));
    expect(L.all()).toEqual([]);
    expect(document.querySelector('[aria-label="Links"]')).toBe(null);
    expect(texts(document.body, '.toast')).toEqual(['Link removed.Undo']);
    const toast = document.querySelector('.toast');
    await click(toast.querySelector('.act'));
    expect(L.all().map((l) => l.id)).toEqual(['k1']);
    await click(container.querySelector('.lki'));
    await click(document.querySelector('[aria-label="Open linked passage John 15:16"]'));
    expect(document.querySelector('[aria-label="Links"]')).toBe(null);
  });
});

describe('the gate rows (4b, 4d-4f, 4h, 4i)', () => {
  const boot = async (id) => {
    linkStore();
    const r = render(<V2App gateId={id} />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    await settle();
    return r;
  };

  it('4b: the paragraph sheet gains Link to another passage after Add a note', async () => {
    await boot('4b-mark-paragraph');
    expect(texts(document.body, '[aria-label="Mark this paragraph"] .srow .t')).toEqual(['Listen from here', 'Add a note', 'Link to another passage', 'Copy', 'Share a link']);
  });

  it('4d and 4e: the picker over paragraph 1 from the row; Browse\'s list', async () => {
    await boot('4d-link-picker');
    const picker = document.querySelector('[aria-label="Link to a passage"]');
    expect(picker.querySelector('.lkft').textContent).toBe('Chosen by God · Volume One, Letter 1');
    expect(texts(picker, '.lkr .tx > span')).toEqual(['John 15:16', 'New Testament', J15_16]);
    expect(document.querySelector('[data-hl-key="letter:chosen-by-god:0"]').classList.contains('tapped')).toBe(true);
    cleanup();
    delete html.dataset.gate;
    await boot('4e-link-browse');
    expect(document.querySelector('.seg.lkt .on').textContent).toBe('Browse');
    expect(texts(document.body, '.lkrows .srow .t').slice(0, 3)).toEqual(['The Scriptures of Truth', 'Matthew Study Bible', 'Volume One']);
  });

  it('4f waits for the chapter, then draws verse 16 whole and Link John 15:16; its Link does nothing', async () => {
    let land;
    const B = g.BOOKS;
    delete g.BOOKS;
    // main's loader (index.html) hands every ask the one load in flight
    const loading = new Promise((res) => { land = res; });
    g.__loadBibleCorpus = vi.fn(() => loading);
    linkStore();
    render(<V2App gateId="4f-link-verses" />);
    await settle(50);
    expect(html.dataset.gate).toBe('waiting');
    await act(async () => { g.BOOKS = B; land(); });
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(document.querySelector('.lkbk .sh').textContent).toBe('John 15');
    expect(document.querySelector('.vn.on').textContent).toBe('16');
    expect(document.querySelector('.lkfoot .pill').textContent).toBe('Link John 15:16');
    await click(document.querySelector('.lkfoot .pill'));
    expect(g.LinkStore.add).not.toHaveBeenCalled();
    delete g.__loadBibleCorpus;
  });

  it('4h: the icon from the row (two links, gold) and the toast; 4i: the Links sheet from the row, inert', async () => {
    await boot('4h-link-made');
    const icon = document.querySelector('[data-hl-key="letter:chosen-by-god:0"] .lki');
    expect(icon.getAttribute('aria-label')).toBe('Open 2 links');
    expect(document.querySelector('.toast').textContent).toBe('Linked to John 15:16Undo');
    cleanup();
    delete html.dataset.gate;
    await boot('4i-links');
    const sheet = document.querySelector('[role="dialog"][aria-label="Links"]');
    expect(sheet.querySelector('.lkct').textContent).toBe('2 links · Chosen by God');
    expect(texts(sheet, '.lkc .je')).toEqual(['To · New Testament', 'From · Volume One · Letter 16']);
    expect(texts(sheet, '.lkc .jh > span:first-child')).toEqual(['John 15:16', LETTER_16.title]);
    expect(texts(sheet, '.lkc .lkcm span')).toEqual(['Linked today', 'Linked Oct 9']);
    await click(sheet.querySelector('.lkcm .textbtn'));
    expect(g.LinkStore.remove).not.toHaveBeenCalled();
    expect(document.querySelectorAll('.lkc')).toHaveLength(2);
    expect(GATE_STATES['4i-links'].facts.now).toBe(GATE_NOW);
  });

  it('{ top, phone }: px from the top on the phone, the top on the laptop', () => {
    const el = document.createElement('div');
    applyGateScroll(el, { top: 600, phone: true }, false);
    expect(el.scrollTop).toBe(600);
    const desk = document.createElement('div');
    applyGateScroll(desk, { top: 600, phone: true }, true);
    expect(desk.scrollTop).toBe(0);
  });
});
