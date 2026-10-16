/* The journal entry as a writing surface (mw9, design dz20 3n, 3o; dz22 4g): main's block shapes for what Insert puts
   in (journal-blocks.js), where a block goes (under the cursor's paragraph, never splitting it), what each block shows,
   the picker's card and excerpt modes, the gate rows, and a real boot writing through main's JournalStore and
   JournalMediaStore. main's nav index runs for real on a small Bible (John 15) and Volume One (Letters 1 and 16). */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, waitFor, act, fireEvent } from '@testing-library/react';
import { V2App } from './App.jsx';
import { GATE_STATES } from './gate.js';
import { targetToBlock, insertBelow, blockView, newBlock, clock, waveBars, pickRows, entryParts, withTail, moveBlock, removedWords, blockName } from './journal-blocks.js';
import { LinkPicker } from './screens/LinkPicker.jsx';
import { INSERT_GROUPS, longDate } from './screens/JournalEditor.jsx';
import * as NAV from '../utils/nav-index.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const settle = (ms = 30) => act(() => new Promise((r) => { setTimeout(r, ms); }));
const texts = (root, sel) => [...root.querySelectorAll(sel)].map((n) => n.textContent);
const byText = (root, sel, t) => [...root.querySelectorAll(sel)].find((n) => n.textContent === t);

const L16_ID = 'run-from-the-forest-and-loose-all-that-binds-you';
const L16_PARA = 'Timothy, write as I speak. For the time has come, and is already upon you, when the children of God must be '
  + 'cleansed and set apart for My glory, says The Lord. Yet today the sanctified will be lashed.';
const LETTER_1 = { id: 'chosen-by-god', num: 1, title: 'Chosen by God', blocks: [{ type: 'para', segments: [{ t: 'text', v: 'Thus says The Lord.' }] }] };
const LETTER_16 = { id: L16_ID, num: 16, title: 'Run from the Forest and Loose All That Binds You',
  blocks: [{ type: 'para', segments: [{ t: 'text', v: L16_PARA }] }] };
const ONE = { volKey: 'one', label: 'Volume One', globalName: 'LETTERS_V1', letterScreen: 'vot-one-letter', kind: 'letter' };
const J15_16 = 'You did not choose Me, but I chose you and appointed you that you should go and bear fruit, and that your fruit '
  + 'should remain, that whatever you ask the Father in My name He may give you.';
const JOHN = { id: 'john', title: 'John', testament: 'new', chapters: [{ num: 15, sections: [
  { heading: '', verses: [{ n: 15, text: 'No longer do I call you servants.' }, { n: 16, text: J15_16 }, { n: 17, text: 'These things I command you.' }] },
] }] };

const NAV_FNS = ['buildNavIndex', 'searchNavIndex', 'navItemPreview', 'navItemToEndpoint', 'buildSourceEndpoint', 'contentDocToNavItem', 'buildNavTree'];
const GLOBALS = [...NAV_FNS, 'COLLECTIONS', 'COL_BY_KEY', 'LETTERS_V1', 'BOOKS', '_allBooks', '_matthew', 'colLetterArr', 'colPreface',
  'bookCategory', 'findBook', 'parseRefStr', 'findEntryContext', '__NAV_INDEX', '__NAV_INDEX_SIG', 'RecentNavStore', 'JournalStore',
  'JournalHelpers', 'JournalMediaStore', 'BookmarkStore', 'NoteStore', 'NotebookStore', 'noteSourceLabel', 'resolveVerseText',
  'StateStore', 'HistoryStore', 'matchMedia', '_collectMarks', 'LinkStore', '__votCorpus', '__loadVotCorpus', 'PlatformBridge'];

function installCorpus() {
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
    const e = (g.LETTERS_V1 || []).find((x) => x.id === id);   // main's lookup reads the loaded corpus
    return e ? { kind: 'letter', title: e.title, screen: 'vot-one-letter', collection: 'Volume One', entry: e } : null;
  };
}
beforeEach(() => { installCorpus(); });
afterEach(() => {
  cleanup();
  for (const k of GLOBALS) delete g[k];
  delete html.dataset.gate;
  try { window.getSelection().removeAllRanges(); } catch (_e) { /* none */ }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const VERSE = { type: 'bible', key: 'bible:john:15:16', bookId: 'john', chapter: 15, verse: 16, label: 'John 15:16', text: J15_16 };
const CHAPTER = { type: 'bible', key: 'bible:john:15', bookId: 'john', chapter: 15, verse: null, label: 'John 15' };
const LETTER = { type: 'letter', key: 'letter:' + L16_ID, letterId: L16_ID, collection: 'Volume One', label: LETTER_16.title };

describe('journal-blocks: what Insert puts in (main\'s targetToJournalBlock)', () => {
  it('a verse picked as an excerpt is a verse-block with its words (NKJV, the picker\'s text); as a card, its chapter', () => {
    expect(targetToBlock(VERSE, null, true)).toMatchObject({ type: 'verse-block', ref: 'John 15:16', text: J15_16, partial: false,
      bookId: 'john', chapter: 15, verse: 16, verseEnd: null, isStudy: false, translation: 'nkjv' });
    expect(targetToBlock(VERSE, null, false)).toMatchObject({ type: 'chapter-card', bookId: 'john', chapter: 15, isStudy: false });
    expect(targetToBlock(CHAPTER, null, false)).toMatchObject({ type: 'chapter-card', bookId: 'john', chapter: 15 });
    // a study place keeps main's isStudy, and no translation (main reads its own)
    const study = targetToBlock({ type: 'study', bookId: 'matthew', chapter: 5, verse: 3, label: 'Matthew 5:3', text: 'Blessed' }, null, true);
    expect(study).toMatchObject({ type: 'verse-block', isStudy: true });
    expect(study.translation).toBeUndefined();
  });

  it('a letter is a letter-card (its collection\'s volKey); its words picked are the card\'s excerpt; null when main could not show it', () => {
    expect(targetToBlock(LETTER, null, false)).toMatchObject({ type: 'letter-card', volKey: 'one', letterId: L16_ID });
    expect(targetToBlock(LETTER, null, false).excerpt).toBeUndefined();
    const words = { ...LETTER, key: 'letter:' + L16_ID + ':0:80-158', blockKey: '0', start: 80, end: 158, text: 'the children of God', partial: true };
    expect(targetToBlock(words, null, true)).toMatchObject({ type: 'letter-card', volKey: 'one', letterId: L16_ID, excerpt: 'the children of God',
      blockKey: '0', start: 80, end: 158 });
    expect(targetToBlock({ ...LETTER, collection: 'Nowhere' }, null, false)).toBe(null);
    expect(targetToBlock({ type: 'answers', key: 'x' }, null, false)).toBe(null);
    expect(targetToBlock(null, null, false)).toBe(null);
  });

  it('main\'s block ids, from JournalHelpers when it is there', () => {
    expect(newBlock('divider')).toMatchObject({ type: 'divider', id: expect.stringMatching(/^b_/) });
    g.JournalHelpers = { newBlock: (t, x) => ({ id: 'main', type: t, ...x }) };
    expect(newBlock('p', { text: '' })).toEqual({ id: 'main', type: 'p', text: '' });
  });
});

describe('journal-blocks: where a block goes (main\'s insertBlockBelow)', () => {
  const p = (id, text) => ({ id, type: 'p', text });
  const card = { id: 'c', type: 'divider' };

  it('under the paragraph the cursor is in, never splitting it; the cursor stays where it was', () => {
    const out = insertBelow([p('a', 'One two'), p('b', 'Three')], { id: 'a', caret: 3 }, card);
    expect(out.blocks.map((b) => b.id)).toEqual(['a', 'c', 'b']);
    expect(out.blocks[0].text).toBe('One two');
    expect(out.focus).toEqual({ id: 'a', caret: 3 });
  });

  it('under the last paragraph: an empty paragraph follows, so there is always somewhere to write', () => {
    const out = insertBelow([p('a', 'One')], { id: 'a', caret: 0 }, card);
    expect(out.blocks.map((b) => b.type)).toEqual(['p', 'divider', 'p']);
  });

  it('with no cursor: before the trailing empty paragraph; else at the end with a new one, the cursor in it', () => {
    const out = insertBelow([p('a', 'One'), p('z', '')], null, card);
    expect(out.blocks.map((b) => b.id)).toEqual(['a', 'c', 'z']);
    expect(out.focus).toEqual({ id: 'z', caret: 0 });
    const end = insertBelow([p('a', 'One')], null, card);
    expect(end.blocks.map((b) => b.type)).toEqual(['p', 'divider', 'p']);
    expect(end.focus.id).toBe(end.blocks[2].id);
  });
});

describe('journal-blocks: what each block shows (3n)', () => {
  it('a letter card: Letter, its title, where; Excerpt with its words when words were picked; a tap opens the letter', () => {
    expect(blockView({ type: 'letter-card', volKey: 'one', letterId: L16_ID })).toEqual({ kind: 'card', eyebrow: 'Letter',
      title: LETTER_16.title, words: '', meta: 'Volume One · Letter 16', open: { place: 'letter', collection: 'one', n: 16 } });
    expect(blockView({ type: 'letter-card', volKey: 'one', letterId: L16_ID, excerpt: 'the  children\n of God' })).toMatchObject({
      eyebrow: 'Excerpt', words: 'the children of God' });
  });

  it('a verse excerpt: its reference, its words, the translation; main\'s resolver when the block kept none; missing said', () => {
    const v = { type: 'verse-block', ref: 'John 15:16', text: J15_16, bookId: 'john', chapter: 15, verse: 16, translation: 'nkjv' };
    expect(blockView(v)).toMatchObject({ kind: 'card', eyebrow: 'Excerpt', title: 'John 15:16', words: J15_16, meta: 'NKJV', missing: false,
      open: { place: 'bible-chapter', book: 'john', chapter: 15, verse: 16 } });
    g.resolveVerseText = vi.fn(() => 'From main.');
    expect(blockView({ ...v, text: '' }).words).toBe('From main.');
    g.resolveVerseText = () => '';
    expect(blockView({ ...v, text: '' }).missing).toBe(true);
    expect(blockView({ ...v, isStudy: true, translation: undefined }).open).toEqual({ place: 'study-chapter', study: 'matthew-study', chapter: '15' });
  });

  it('a chapter card, another entry, a deleted notebook, a divider, a picture, a memo; a kind v2 does not draw is one quiet line', () => {
    expect(blockView({ type: 'chapter-card', bookId: 'john', chapter: 15 })).toMatchObject({ eyebrow: 'Bible chapter', meta: 'New Testament',
      open: { place: 'bible-chapter', book: 'john', chapter: 15, verse: null } });
    g.JournalStore = { get: (id) => (id === 'j2' ? { id: 'j2', title: 'Sunday', blocks: [{ type: 'p', text: 'With the family.' }] } : null) };
    expect(blockView({ type: 'journal-card', entryId: 'j2' })).toMatchObject({ eyebrow: 'Journal entry', title: 'Sunday',
      open: { place: 'journal-entry', id: 'j2' } });
    expect(blockView({ type: 'journal-card', entryId: 'gone' })).toMatchObject({ title: 'Deleted entry', open: null });
    expect(blockView({ type: 'notebook-card', notebookId: 'nb' })).toMatchObject({ title: 'Deleted notebook' });
    expect(blockView({ type: 'divider' })).toEqual({ kind: 'divider' });
    expect(blockView({ type: 'image', mediaId: 'm' })).toEqual({ kind: 'image', mediaId: 'm', caption: '' });
    expect(blockView({ type: 'audio', mediaId: 'a', duration: 72 })).toMatchObject({ kind: 'memo', duration: 72, samples: null });
    g.JournalHelpers = { describeBlock: () => '[Sketch]' };
    expect(blockView({ type: 'sketch' })).toEqual({ kind: 'other', line: '[Sketch]' });
  });

  it("a heading and a quote are text, as main's editor writes them (v2-gaps 40): their words, the quote's citation", () => {
    g.JournalHelpers = { describeBlock: () => '[Heading]' };
    expect(blockView({ type: 'h2', text: 'Morning' })).toEqual({ kind: 'heading', text: 'Morning' });
    expect(blockView({ type: 'quote', text: 'Be still, and know.', cite: 'Psalm 46:10' })).toEqual({ kind: 'quote', text: 'Be still, and know.', cite: 'Psalm 46:10' });
    expect(blockView({ type: 'quote' })).toEqual({ kind: 'quote', text: '', cite: '' });
  });

  it('the memo\'s clock and its bars: 5-28 px from main\'s samples, lit up to the playhead', () => {
    expect(clock(72)).toBe('1:12');
    expect(clock(18.9)).toBe('0:18');
    const bars = waveBars([0, 1, 0.5, 2], 44, 18 / 72);
    expect(bars).toHaveLength(44);
    expect(bars.filter((b) => b.played)).toHaveLength(11);
    expect(bars.slice(0, 11).every((b) => b.played)).toBe(true);
    expect(Math.min(...bars.map((b) => b.h))).toBe(5);
    expect(Math.max(...bars.map((b) => b.h))).toBe(28);
    expect(waveBars(null, 40, 0).every((b) => b.h >= 6 && b.h <= 22 && !b.played)).toBe(true);
  });
});

describe('the picker\'s Insert modes (4g)', () => {
  const type = (c, v) => act(() => { fireEvent.change(c.querySelector('.field input.q'), { target: { value: v } }); });
  const open = (mode, props = {}) => {
    const onPick = vi.fn();
    const r = render(<LinkPicker mode={mode} onPick={onPick} onClose={() => {}} {...props} />);
    return { ...r, onPick };
  };

  it('Card: "Add a card", no Linking from; a place goes in whole at once (a verse, a letter), nothing is linked', async () => {
    g.LinkStore = { add: vi.fn() };
    const { container, onPick } = open('card');
    expect(container.querySelector('.sh').textContent).toBe('Add a card');
    expect(container.querySelector('.lkf')).toBe(null);
    await type(container, 'John 15:16');
    await click(container.querySelector('.lkr'));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toMatchObject({ type: 'bible', bookId: 'john', chapter: 15, verse: 16 });
    await type(container, 'Run from');
    await click(container.querySelector('.lkr'));
    expect(onPick.mock.calls[1][0]).toMatchObject({ type: 'letter', letterId: L16_ID });
    expect(container.querySelector('.lkw')).toBe(null);
    expect(g.LinkStore.add).not.toHaveBeenCalled();
  });

  it('Excerpt: a verse opens its chapter with the verse taken; a letter opens its words, its place before the hint; Insert', async () => {
    const { container, onPick } = open('excerpt');
    expect(container.querySelector('.sh').textContent).toBe('Add an excerpt');
    await type(container, 'John 15:16');
    await click(container.querySelector('.lkr'));
    expect(onPick).not.toHaveBeenCalled();
    expect(container.querySelector('.vn.on').textContent).toBe('16');
    expect(container.querySelector('.lkh').textContent).toBe('Tap a verse number for the whole verse, or press and drag over words.');
    expect(container.querySelector('.lkfoot .pill').textContent).toBe('Insert John 15:16');
    await click(container.querySelector('.lkfoot .pill'));
    expect(onPick.mock.calls[0][0]).toMatchObject({ type: 'bible', verse: 16, text: J15_16 });
    await click(container.querySelector('.lkbk .ic'));
    await type(container, 'Run from');
    await click(container.querySelector('.lkr'));
    expect(container.querySelector('.lkh').textContent).toBe('Volume One · Letter 16. Press and drag over the words you want.');
    expect(container.querySelector('.lkfoot .pill').textContent).toBe('Choose some words');
    await click(byText(container, 'button', 'Insert the whole letter'));
    expect(onPick.mock.calls[1][0]).toMatchObject({ type: 'letter', letterId: L16_ID });
    expect(onPick.mock.calls[1][0].text).toBeUndefined();
  });
});

describe('gate pictures', () => {
  const desk = () => { g.matchMedia = vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })); };

  it('3n: the entry written in place: date, title, words, a letter card, John 15:16, the memo playing at 0:18 of 1:12', async () => {
    const { container } = render(<V2App gateId="3n-journal-entry" />);
    expect(container.querySelector('.tb .title').textContent).toBe('Journal entry');
    expect(container.querySelector('.tb .ic').getAttribute('aria-label')).toBe('Back to Notes');
    expect(container.querySelector('.tb .btn2.tbj.jins').textContent).toBe('Insert');
    const jed = container.querySelector('.g.jed');
    expect(jed.querySelector('.jdate').textContent).toBe('October 15, 2026');
    expect(/** @type {HTMLTextAreaElement} */ (jed.querySelector('textarea.jt')).value).toBe('On being set apart');
    expect(/** @type {HTMLTextAreaElement} */ (jed.querySelector('textarea.jp')).value).toBe('What “set apart for My glory” asks of me this week.');
    expect([...jed.querySelectorAll('.jcard')].map((c) => texts(c, ':scope > *'))).toEqual([
      ['Letter', 'Run from the Forest and Loose All That Binds You', 'Volume One · Letter 16'],
      ['Excerpt', 'John 15:16', J15_16, 'NKJV'],
    ]);
    const memo = jed.querySelector('.jmemo');
    expect(memo.querySelector('.jplay').getAttribute('aria-label')).toBe('Pause');
    expect(texts(memo, '.jmt > span')).toEqual(['A prayer for the week', '0:18 / 1:12']);
    expect(memo.querySelectorAll('.jwav span.p')).toHaveLength(10);   // 40 bars before a width: a quarter lit
    expect(jed.querySelector('.jdiv')).toBe(null);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
  });

  it('3n on the laptop: the column holds the whole entry, down to the divider and the picture; ready once it has loaded', async () => {
    desk();
    const { container } = render(<V2App gateId="3n-journal-entry" />);
    const jed = container.querySelector('.g.jed');
    expect([...jed.querySelectorAll('textarea.jp')].map((t) => /** @type {HTMLTextAreaElement} */ (t).value)).toEqual([
      'What “set apart for My glory” asks of me this week.', 'Read it again with the family after dinner. Leave the phone in the other room.', '']);
    expect(jed.querySelector('.jdiv').textContent).toBe('❖ ❖ ❖');
    const img = jed.querySelector('figure.jimg img');
    expect(img.getAttribute('src')).toBe('src/v2/_gate/journal-photo.jpg');
    expect(jed.querySelector('figure.jimg figcaption').textContent).toBe('The kitchen table this morning');
    await settle(200);   // well past the shell's two painted frames
    expect(html.dataset.gate).not.toBe('ready');
    await act(() => { img.dispatchEvent(new Event('load')); });
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
  });

  it('3o: Insert open: main\'s ten in its four groups; the laptop\'s dialog has its x and a picture "on this computer"', async () => {
    const { unmount } = render(<V2App gateId="3o-journal-insert" />);
    let sheet = document.querySelector('[role="dialog"][aria-label="Insert"]');
    expect(sheet.className).toBe('sheet ins');
    expect(texts(sheet, '.label.ins-l')).toEqual(['From the library', 'From your notes', 'Capture', 'Text']);
    expect(texts(sheet, '.it .itt')).toEqual(['Card', 'Excerpt', 'Bookmark', 'Note', 'Journal entry', 'Notebook', 'Picture', 'Voice memo', 'Text', 'Divider']);
    expect(texts(sheet, '.it .its')).toEqual(['A letter or a chapter', 'Words from a page', 'A saved place', 'One of your notes', 'Another entry',
      'A notebook of notes', 'From your photos', 'Record a prayer', 'A new paragraph', '❖ ❖ ❖']);
    expect(INSERT_GROUPS.flatMap((x) => x.items)).toHaveLength(10);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    unmount();
    desk();
    render(<V2App gateId="3o-journal-insert" />);
    sheet = document.querySelector('[role="dialog"][aria-label="Insert"]');
    expect(sheet.className).toBe('dlg ins');
    expect(sheet.querySelector('.ic.x').getAttribute('aria-label')).toBe('Close');
    expect(byText(sheet, '.its', 'A picture on this computer')).toBeTruthy();
  });

  it('3p: Voice memo over 3n: Recording at 0:42, the picture\'s level, 4:18 left, Cancel · Pause · Finish; the mic left alone', async () => {
    g.PlatformBridge = { requestMicPermission: vi.fn() };
    render(<V2App gateId="3p-journal-record" />);
    const rec = document.querySelector('[role="dialog"][aria-label="Voice memo"]');
    expect(rec.className).toBe('sheet rec');
    expect(texts(rec, '.sh, .recst, .rect, .recn')).toEqual(['Voice memo', 'Recording', '0:42', 'Up to 5 minutes · 4:18 left']);
    expect([...rec.querySelectorAll('.recw span.p')].map((s) => parseInt(/** @type {HTMLElement} */ (s).style.height, 10))).toEqual([4, 5, 24, 24, 13, 33, 19, 6,
      15, 40, 37, 9, 10, 16, 25, 6, 33, 28, 6, 9, 34, 41, 15, 13, 6, 23, 8, 30, 35, 13, 5, 27, 42, 22, 13, 10, 17, 13, 25, 39]);
    expect(texts(rec, '.recb .rb')).toEqual(['Cancel', 'Pause', 'Finish']);
    expect(texts(document.querySelector('.jed .jmemo'), '.jmt > span')).toEqual(['A prayer for the week', '0:18 / 1:12']);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(g.PlatformBridge.requestMicPermission).not.toHaveBeenCalled();
  });

  it('4g: Excerpt over Letter 16: its words open, the picked words washed between the handles; ready once they are drawn', async () => {
    render(<V2App gateId="4g-excerpt-words" />);
    const picker = document.querySelector('[role="dialog"][aria-label="Add an excerpt"]');
    expect([...picker.classList].sort()).toEqual(['lkp', 'sheet', 'tall']);
    expect(picker.querySelector('.lkbk .sh').textContent).toBe(LETTER_16.title);
    expect(picker.querySelector('.lkh').textContent).toBe('Volume One · Letter 16. Press and drag over the words you want.');
    expect(picker.querySelector('.lkw .selw').textContent).toBe('the children of God must be cleansed and set apart for My glory, says The Lord.');
    expect(picker.querySelectorAll('.lkw .hd.s, .lkw .hd.e')).toHaveLength(2);
    expect(picker.querySelector('.lkfoot .pill').textContent).toBe('Insert these words');
    expect(picker.querySelector('.lkfoot .lkall').textContent).toBe('Insert the whole letter');
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    // a gate boot is inert: nothing goes in
    await click(picker.querySelector('.lkfoot .pill'));
    expect(document.querySelector('[aria-label="Add an excerpt"]')).not.toBe(null);
    expect(GATE_STATES['4g-excerpt-words'].open.picker.mode).toBe('excerpt');
  });

  /** index.html's lazy VOT corpus: not here until land() (the letters' globals arrive with it). */
  function lazyLetters() {
    const letters = g.LETTERS_V1;
    delete g.LETTERS_V1;
    const subs = new Set();
    let v = 0;
    let land;
    const loading = new Promise((res) => { land = res; });
    g.__votCorpus = { loaded: false, subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); }, getVersion: () => v };
    g.__loadVotCorpus = vi.fn(() => loading);
    return async () => act(async () => {
      g.LETTERS_V1 = letters;
      g.__votCorpus.loaded = true;
      v += 1;
      subs.forEach((cb) => cb());
      land();
    });
  }

  it('3n and 4g wait for the letters\' corpus: the card is named and the words drawn before the gate says ready', async () => {
    let land = lazyLetters();
    const { container, unmount } = render(<V2App gateId="3n-journal-entry" />);
    await settle(200);
    expect(html.dataset.gate).toBe('waiting');
    expect(g.__loadVotCorpus).toHaveBeenCalled();
    await land();
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(texts(container.querySelector('.jcard'), '.jh > span:first-child')).toEqual([LETTER_16.title]);
    unmount();
    delete html.dataset.gate;
    land = lazyLetters();
    render(<V2App gateId="4g-excerpt-words" />);
    await settle(200);
    expect(html.dataset.gate).toBe('waiting');
    expect(document.querySelector('.lkw .selw')).toBe(null);
    await land();
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(document.querySelector('.lkw .selw').textContent).toBe('the children of God must be cleansed and set apart for My glory, says The Lord.');
    expect(document.querySelector('.lkh').textContent).toBe('Volume One · Letter 16. Press and drag over the words you want.');
  });

  it('the picker on its own asks for the letters on a gate boot and says it is drawn only once their words are', async () => {
    const land = lazyLetters();
    const onShown = vi.fn();
    const { container } = render(<LinkPicker mode="excerpt" gate={GATE_STATES['4g-excerpt-words'].open.picker} onPick={() => {}}
      onClose={() => {}} onShown={onShown} />);
    await settle();
    expect(g.__loadVotCorpus).toHaveBeenCalled();
    expect(onShown).not.toHaveBeenCalled();
    await land();
    await waitFor(() => expect(onShown).toHaveBeenCalled());
    expect(container.querySelector('.lkw .selw').textContent).toBe('the children of God must be cleansed and set apart for My glory, says The Lord.');
  });

  it('a gate boot never writes, whatever is typed or inserted', async () => {
    g.JournalStore = { add: vi.fn(), update: vi.fn(), get: vi.fn() };
    vi.useFakeTimers();
    const { container } = render(<V2App gateId="3n-journal-entry" />);
    fireEvent.change(container.querySelector('.jed textarea.jt'), { target: { value: 'Changed' } });
    await click(container.querySelector('.tb .jins'));
    expect(document.querySelector('[aria-label="Insert"]')).toBe(null);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(g.JournalStore.add).not.toHaveBeenCalled();
    expect(g.JournalStore.update).not.toHaveBeenCalled();
    expect(g.JournalStore.get).not.toHaveBeenCalled();
  });
});

describe('writing an entry (a real boot)', () => {
  /** main's JournalStore in memory, with one entry. */
  function journal(blocks) {
    const entry = { id: 'j1', title: 'Old', created: Date.UTC(2026, 9, 1, 15), blocks };
    let n = 0;
    g.JournalStore = { all: () => [entry], get: (id) => (id === 'j1' ? entry : null),
      add: vi.fn((seed) => ({ ...seed, id: 'new' + (++n) })), update: vi.fn() };
    g.StateStore = { isReady: () => true, get: () => ({}), set: vi.fn() };
    g.HistoryStore = { isReady: () => true, list: () => [], add: vi.fn() };
    return entry;
  }
  function openEntry() {
    const r = render(<V2App gateId={null} />);
    act(() => { [...r.container.querySelectorAll('.tabbar .tab')][2].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    act(() => { r.container.querySelector('.marks .mark[role="button"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    return r.container;
  }
  const lastPatch = () => g.JournalStore.update.mock.calls[g.JournalStore.update.mock.calls.length - 1][1];
  const insertKind = async (name) => {
    await click(document.querySelector('.tb .jins'));
    await click(byText(document.querySelector('[aria-label="Insert"]'), '.it', name + INSERT_GROUPS.flatMap((x) => x.items).find((i) => i.name === name).line));
  };

  it('the date and fields as the entry has them; an entry that ends on a card gets a paragraph to write in', () => {
    journal([{ id: 'b1', type: 'p', text: 'One' }, { id: 'b2', type: 'divider' }]);
    const c = openEntry();
    expect(c.querySelector('.jed .jdate').textContent).toBe(longDate(Date.UTC(2026, 9, 1, 15)));
    expect([...c.querySelectorAll('.jed > :not(input)')].map((n) => n.className)).toEqual(['mm jdate', 'jt', 'jp', 'jdiv', 'jp']);
    expect(c.querySelectorAll('.jed textarea.jp')[1].getAttribute('placeholder')).toBe('');
    expect(c.querySelector('.jed textarea.jp').getAttribute('placeholder')).toBe('Write here');
  });

  it('Divider goes under the paragraph the cursor was in (never splitting it), the cursor back where it was; saved', async () => {
    vi.useFakeTimers();
    journal([{ id: 'b1', type: 'p', text: 'One two' }, { id: 'b2', type: 'p', text: 'Three' }]);
    const c = openEntry();
    const first = /** @type {HTMLTextAreaElement} */ (c.querySelector('.jed textarea.jp'));
    first.focus();
    first.setSelectionRange(3, 3);
    fireEvent.select(first);
    await insertKind('Divider');
    expect(document.querySelector('[aria-label="Insert"]')).toBe(null);
    expect([...c.querySelectorAll('.jed > :not(input)')].map((n) => n.className)).toEqual(['mm jdate', 'jt', 'jp', 'jdiv', 'jp']);
    expect(document.activeElement).toBe(first);
    expect(first.selectionStart).toBe(3);
    act(() => { vi.advanceTimersByTime(600); });
    expect(lastPatch().blocks.map((b) => b.type + ':' + (b.text || ''))).toEqual(['p:One two', 'divider:', 'p:Three']);
  });

  it('Text: a new paragraph under the cursor\'s, the cursor in it; with no cursor, the trailing empty one', async () => {
    journal([{ id: 'b1', type: 'p', text: 'One' }, { id: 'b2', type: 'divider' }, { id: 'b3', type: 'p', text: '' }]);
    const c = openEntry();
    await insertKind('Text');
    expect(c.querySelectorAll('.jed textarea.jp')).toHaveLength(2);
    expect(document.activeElement).toBe(c.querySelectorAll('.jed textarea.jp')[1]);
    const first = /** @type {HTMLTextAreaElement} */ (c.querySelector('.jed textarea.jp'));
    fireEvent.focus(first);
    await insertKind('Text');
    const ps = c.querySelectorAll('.jed textarea.jp');
    expect(ps).toHaveLength(3);
    expect([...c.querySelectorAll('.jed > :not(input)')].map((n) => n.className)).toEqual(['mm jdate', 'jt', 'jp', 'jp', 'jdiv', 'jp']);
    expect(document.activeElement).toBe(ps[1]);
  });

  it('Card and Excerpt open the picker; a letter picked goes in as main\'s letter card and opens the letter when tapped', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    journal([{ id: 'b1', type: 'p', text: 'One' }]);
    const c = openEntry();
    await insertKind('Excerpt');
    let picker = document.querySelector('[role="dialog"][aria-label="Add an excerpt"]');
    await act(() => { fireEvent.change(picker.querySelector('input.q'), { target: { value: 'Run from' } }); });
    await click(picker.querySelector('.lkr'));
    await click(byText(picker, 'button', 'Insert the whole letter'));
    expect(document.querySelector('[aria-label="Add an excerpt"]')).toBe(null);
    await insertKind('Card');
    picker = document.querySelector('[role="dialog"][aria-label="Add a card"]');
    await act(() => { fireEvent.change(picker.querySelector('input.q'), { target: { value: 'John 15:16' } }); });
    await click(picker.querySelector('.lkr'));
    act(() => { vi.advanceTimersByTime(600); });
    // the letter went in at the end (no cursor yet), the cursor into the paragraph after it; the card under that one
    expect(lastPatch().blocks.map((b) => b.type)).toEqual(['p', 'letter-card', 'p', 'chapter-card', 'p']);
    expect(lastPatch().blocks[1]).toMatchObject({ volKey: 'one', letterId: L16_ID });
    expect(texts(c, '.jed .jcard .je')).toEqual(['Letter', 'Bible chapter']);
    await click(c.querySelector('.jed .jcard[role="button"]'));
    expect(c.querySelector('h1').textContent).toBe(LETTER_16.title);
    expect(c.querySelector('.tb .ic').getAttribute('aria-label')).toBe('Back to Journal entry');
  });

  it('Picture: main\'s compress and store, then the block goes in and is saved at once; a failure says so', async () => {
    journal([{ id: 'b1', type: 'p', text: 'One' }]);
    let urlOf = null;
    g.JournalMediaStore = {
      compressImage: vi.fn(async () => ({ blob: 'B', width: 4, height: 3 })),
      put: vi.fn(async () => 'm1'),
      acquireUrl: vi.fn(async (id) => urlOf && urlOf(id)), releaseUrl: vi.fn(), get: vi.fn(async () => ({ blob: 'B' })),
      subscribeUrls: () => () => {},
    };
    urlOf = (id) => 'blob:' + id;
    const c = openEntry();
    const input = /** @type {HTMLInputElement} */ (c.querySelector('.jed input[type="file"]'));
    const pick = vi.spyOn(input, 'click').mockImplementation(() => {});
    await insertKind('Picture');
    expect(pick).toHaveBeenCalledTimes(1);
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); await new Promise((r) => { setTimeout(r, 0); }); });
    expect(g.JournalMediaStore.compressImage).toHaveBeenCalledWith(file, { maxDim: 1600, quality: 0.8 });
    expect(g.JournalMediaStore.put).toHaveBeenCalledWith({ type: 'image', blob: 'B', mime: 'image/jpeg', width: 4, height: 3 });
    expect(g.JournalStore.update).toHaveBeenCalledTimes(1);   // at once, not after the half second
    expect(lastPatch().blocks.map((b) => b.type)).toEqual(['p', 'image', 'p']);
    await settle();
    expect(c.querySelector('.jed figure.jimg img').getAttribute('src')).toBe('blob:m1');
    g.JournalMediaStore.put = vi.fn(async () => { throw new Error('quota'); });
    await insertKind('Picture');
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); await new Promise((r) => { setTimeout(r, 0); }); });
    expect(document.querySelector('.toast').textContent).toBe('Could not save that image.');
    expect(lastPatch().blocks.map((b) => b.type)).toEqual(['p', 'image', 'p']);
  });

  it('Voice memo: main\'s recorder; Save puts main\'s audio block under the cursor\'s paragraph, saved at once', async () => {
    journal([{ id: 'b1', type: 'p', text: 'One' }, { id: 'b2', type: 'p', text: 'Two' }]);
    g.PlatformBridge = { isAndroid: false, requestMicPermission: vi.fn(), startAudioSession() {}, endAudioSession() {},
      nativeRecordStart: vi.fn(() => 'ok'), nativeRecordAmplitude: () => 0, nativeRecordStop: vi.fn(), nativeRecordCancel() {} };
    g.JournalMediaStore = { put: vi.fn(async () => 'm9'), markLinked: vi.fn(), delete: vi.fn(),
      acquireUrl: vi.fn(async () => null), releaseUrl() {}, get: vi.fn(async () => null), subscribeUrls: () => () => {} };
    const c = openEntry();
    fireEvent.focus(c.querySelector('.jed textarea.jp'));
    await insertKind('Voice memo');
    expect(document.querySelector('.toast')).toBe(null);
    const rec = document.querySelector('[role="dialog"][aria-label="Voice memo"]');
    expect(rec.querySelector('.recq').textContent).toBe('Requesting microphone access…');
    expect(g.PlatformBridge.requestMicPermission).toHaveBeenCalled();
    act(() => { g.__onMicPermissionResult(true); });
    await click(byText(rec, 'button', 'Finish'));
    expect(g.PlatformBridge.nativeRecordStop).toHaveBeenCalled();
    await act(async () => { g.__onNativeRecordingComplete(null, 1000, 'audio/webm', new Blob(['x'], { type: 'audio/webm' })); });
    expect(g.JournalStore.update).not.toHaveBeenCalled();   // nothing goes in before Save
    await click(byText(rec, 'button', 'Save'));
    expect(document.querySelector('[aria-label="Voice memo"]')).toBe(null);
    expect(g.JournalStore.update).toHaveBeenCalledTimes(1);   // at once, as main's immediateSave
    expect(lastPatch().blocks.map((b) => b.type)).toEqual(['p', 'audio', 'p']);
    expect(lastPatch().blocks[1]).toMatchObject({ type: 'audio', mediaId: 'm9', duration: 1, caption: '', samples: [] });
    expect(g.JournalMediaStore.markLinked).toHaveBeenCalledWith('m9');
    expect(c.querySelectorAll('.jed .jmemo')).toHaveLength(1);
    expect(g.__onNativeRecordingComplete).toBeUndefined();   // the sheet let go of main's callbacks
  });

  it("a heading and a quote written in main show their words and are written in place; the quote's citation too (v2-gaps 40)", async () => {
    journal([{ id: 'b1', type: 'h2', text: 'Morning' }, { id: 'b2', type: 'p', text: 'One' },
      { id: 'b3', type: 'quote', text: 'Be still, and know that I am God.', cite: 'Psalm 46:10' }, { id: 'b4', type: 'p', text: '' }]);
    const c = openEntry();
    expect(c.querySelector('.jed .jother')).toBe(null);
    const h = /** @type {HTMLTextAreaElement} */ (c.querySelector('.jed textarea.jh2'));
    expect(h.value).toBe('Morning');
    const q = /** @type {HTMLTextAreaElement} */ (c.querySelector('.jed .jq textarea'));
    expect(q.value).toBe('Be still, and know that I am God.');
    const cite = /** @type {HTMLInputElement} */ (c.querySelector('.jed .jq input.jqc'));
    expect(cite.value).toBe('Psalm 46:10');
    expect(cite.getAttribute('placeholder')).toBe('Citation (optional)');
    fireEvent.change(h, { target: { value: 'Evening' } });
    fireEvent.change(q, { target: { value: 'Be still.' } });
    fireEvent.change(cite, { target: { value: 'Psalm 46:10 (KJV)' } });
    await settle(600);
    expect(lastPatch().blocks.slice(0, 3)).toEqual([{ id: 'b1', type: 'h2', text: 'Evening' }, { id: 'b2', type: 'p', text: 'One' },
      { id: 'b3', type: 'quote', text: 'Be still.', cite: 'Psalm 46:10 (KJV)' }]);
  });

  it('the title is one line: Enter goes to the words; a pasted newline becomes a space', async () => {
    journal([{ id: 'b1', type: 'p', text: 'One' }]);
    const c = openEntry();
    const t = /** @type {HTMLTextAreaElement} */ (c.querySelector('.jed textarea.jt'));
    fireEvent.change(t, { target: { value: 'Two\nlines' } });
    expect(t.value).toBe('Two lines');
    t.focus();
    fireEvent.keyDown(t, { key: 'Enter' });
    expect(document.activeElement).toBe(c.querySelector('.jed textarea.jp'));
  });

  it('a memo plays in place: Play / Pause from the audio element; the arrow keys seek 5 s; a memo whose blob is gone says so', async () => {
    journal([{ id: 'b1', type: 'p', text: 'One' }, { id: 'b2', type: 'audio', mediaId: 'a1', duration: 72, caption: '' },
      { id: 'b3', type: 'audio', mediaId: 'gone', duration: 30, caption: 'Old' }, { id: 'b4', type: 'p', text: '' }]);
    g.JournalMediaStore = { acquireUrl: vi.fn(async (id) => (id === 'a1' ? 'blob:a1' : null)), releaseUrl: vi.fn(),
      get: vi.fn(async () => null), subscribeUrls: () => () => {} };
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function () { this.dispatchEvent(new Event('play')); return Promise.resolve(); });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function () { this.dispatchEvent(new Event('pause')); });
    const c = openEntry();
    await settle();
    const [memo, gone] = c.querySelectorAll('.jed .jmemo');
    expect(texts(memo, '.jmt > span')).toEqual(['Voice memo', '0:00 / 1:12']);
    expect(memo.querySelector('audio').getAttribute('src')).toBe('blob:a1');
    await click(memo.querySelector('.jplay'));
    expect(play).toHaveBeenCalledTimes(1);
    expect(memo.querySelector('.jplay').getAttribute('aria-label')).toBe('Pause');
    await click(memo.querySelector('.jplay'));
    expect(memo.querySelector('.jplay').getAttribute('aria-label')).toBe('Play');
    const wav = memo.querySelector('.jwav');
    fireEvent.keyDown(wav, { key: 'ArrowRight' });
    fireEvent.keyDown(wav, { key: 'ArrowRight' });
    expect(wav.getAttribute('aria-valuenow')).toBe('10');
    expect(memo.querySelector('audio').currentTime).toBe(10);
    expect(texts(gone, '.jmt > span')).toEqual(['Old', '0:30']);
    expect(gone.querySelector('.jmiss').textContent).toBe('Recording missing');
    expect(gone.querySelector('.jplay')).toBe(null);
    expect(g.JournalStore.update).not.toHaveBeenCalled();
  });

  // main 8d3ef6a2c (sweep v070): play() rejects on a memo this device cannot decode (a backup from another device, a broken
  // file); the 'play' event has already fired, so the button sat on Pause over silence and the reader was told nothing.
  const CANT = 'This voice memo can’t be played on this device.';
  /** A media element whose play() starts (the 'play' event) and then rejects with `name`. @param {string} name */
  const failingPlay = (name) => vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function () {
    this.dispatchEvent(new Event('play'));
    return Promise.reject(Object.assign(new Error(name), { name }));
  });

  it('a memo that cannot play goes back to Play and says so, out loud; a start cut short (AbortError) only resets', async () => {
    journal([{ id: 'b1', type: 'p', text: 'One' }, { id: 'b2', type: 'audio', mediaId: 'a1', duration: 72, caption: '' },
      { id: 'b3', type: 'p', text: '' }]);
    g.JournalMediaStore = { acquireUrl: vi.fn(async () => 'blob:a1'), releaseUrl: vi.fn(), get: vi.fn(async () => null), subscribeUrls: () => () => {} };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    failingPlay('AbortError');
    const c = openEntry();
    await settle();
    const memo = c.querySelector('.jed .jmemo');
    await click(memo.querySelector('.jplay'));
    await settle();
    expect(memo.querySelector('.jplay').getAttribute('aria-label')).toBe('Play');
    expect(document.querySelector('.toast')).toBe(null);
    failingPlay('NotSupportedError');
    await click(memo.querySelector('.jplay'));
    await settle();
    expect(memo.querySelector('.jplay').getAttribute('aria-label')).toBe('Play');
    expect(document.querySelector('.toast').textContent).toBe(CANT);
    expect(document.querySelector('.toast-wrap').getAttribute('role')).toBe('alert');
  });

  it("the recorder's review Play: a take that cannot play goes back to Play and says so", async () => {
    journal([{ id: 'b1', type: 'p', text: 'One' }]);
    g.PlatformBridge = { isAndroid: false, requestMicPermission: vi.fn(), startAudioSession() {}, endAudioSession() {},
      nativeRecordStart: vi.fn(() => 'ok'), nativeRecordAmplitude: () => 0, nativeRecordStop: vi.fn(), nativeRecordCancel() {} };
    g.JournalMediaStore = { put: vi.fn(async () => 'm9'), markLinked: vi.fn(), delete: vi.fn(),
      acquireUrl: vi.fn(async () => null), releaseUrl() {}, get: vi.fn(async () => null), subscribeUrls: () => () => {} };
    g.URL.createObjectURL = g.URL.createObjectURL || (() => 'blob:take');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    failingPlay('NotSupportedError');
    const c = openEntry();
    fireEvent.focus(c.querySelector('.jed textarea.jp'));
    await insertKind('Voice memo');
    const rec = document.querySelector('[role="dialog"][aria-label="Voice memo"]');
    act(() => { g.__onMicPermissionResult(true); });
    await click(byText(rec, 'button', 'Finish'));
    await act(async () => { g.__onNativeRecordingComplete(null, 1000, 'audio/webm', new Blob(['x'], { type: 'audio/webm' })); });
    await click(byText(rec, 'button', 'Play'));
    await settle();
    expect(byText(rec, 'button', 'Play')).toBeTruthy();
    expect(document.querySelector('.toast').textContent).toBe(CANT);
  });
});

describe('Insert from your notes (mw9b: main\'s JournalInsertSheet pickers)', () => {
  const H = { newBlock: (t, x) => ({ id: 'nb_' + t, type: t, ...x }),
    embedBlockFromJournal: (src, b) => (b.type === 'p' ? { id: 'emb', type: 'journal-excerpt', sourceJournalId: src.id, sourceBlockId: b.id,
      sourceJournalTitle: src.title, text: b.text, originType: 'p' } : { id: 'emb', type: b.type, sourceJournalId: src.id, mediaId: b.mediaId }) };

  it('bookmarks: newest first, named by their label or their place; the search reads the label, the thought and the place', () => {
    g.BookmarkStore = { all: () => [
      { id: 'k1', hlKey: 'letter:' + L16_ID + ':0', label: '', thought: 'for Sunday', created: 1 },
      { id: 'k2', hlKey: 'letter:chosen-by-god:0', label: 'My start', created: 5 }] };
    const { total, rows } = pickRows('bookmark', '');
    expect(total).toBe(2);
    expect(rows.map((r) => [r.title, r.sub])).toEqual([['My start', 'Volume One · Letter 1'], [LETTER_16.title, 'Volume One · Letter 16']]);
    expect(rows[1].make()).toMatchObject({ type: 'bookmark-card', bookmarkId: 'k1' });
    expect(pickRows('bookmark', 'SUNDAY').rows.map((r) => r.key)).toEqual(['k1']);
    expect(pickRows('bookmark', 'letter 1').rows.map((r) => r.key)).toEqual(['k2', 'k1']);
    expect(pickRows('bookmark', 'zzz')).toEqual({ total: 2, rows: [] });
    delete g.BookmarkStore;
    expect(pickRows('bookmark', '')).toEqual({ total: 0, rows: [] });
  });

  it('notes: their words as the title (else the passage), where they are from main; a note-card by its group', () => {
    g.NoteStore = { list: () => [{ groupId: 'n1', body: 'Read again', fullText: 'Thus  says', updated: 2 }, { groupId: 'n2', body: '', fullText: 'Run from', updated: 9 }] };
    g.noteSourceLabel = (n) => (n.groupId === 'n1' ? 'Chosen by God' : 'Letter 16');
    const { rows } = pickRows('note', '');
    expect(rows.map((r) => [r.title, r.sub])).toEqual([['Run from', 'Letter 16'], ['Read again', 'Chosen by God']]);
    expect(rows[1].make()).toMatchObject({ type: 'note-card', noteGroupId: 'n1' });
    expect(pickRows('note', 'thus says').rows.map((r) => r.key)).toEqual(['n1']);
  });

  it('entries: never the one being written, newest first, date and words; one opens to the whole entry or one of its parts', () => {
    const a = { id: 'a', title: 'Sunday', created: Date.UTC(2026, 9, 11, 15), blocks: [{ id: 'p1', type: 'p', text: 'With the family.' },
      { id: 'p2', type: 'p', text: '  ' }, { id: 'i1', type: 'image', mediaId: 'm', caption: 'Table' }, { id: 'a1', type: 'audio', mediaId: 'r', duration: 72, caption: '' }] };
    g.JournalStore = { all: () => [a, { id: 'self', title: 'This one', created: Date.UTC(2026, 9, 15, 15), blocks: [] }], get: () => null };
    const { total, rows } = pickRows('journal', '', 'self');
    expect(total).toBe(1);
    expect(rows.map((r) => [r.title, r.sub])).toEqual([['Sunday', 'Oct 11, 2026 · With the family.']]);
    expect(rows[0].entry).toBe(a);
    expect(entryParts(a)).toEqual([]);   // no main helper, no parts (the whole entry still goes in)
    g.JournalHelpers = H;
    expect(entryParts(a).map((r) => [r.title, r.sub])).toEqual([['Words', 'With the family.'], ['Picture', 'Table'], ['Voice memo', '1:12']]);
    expect(entryParts(a)[0].block).toMatchObject({ type: 'journal-excerpt', sourceJournalId: 'a', text: 'With the family.' });
  });

  it('notebooks: Uncategorized first, each with its notes counted once; a notebook-card', () => {
    g.NotebookStore = { list: () => [{ id: 'nb1', name: 'Prayer' }, { id: 'nb2', name: 'Study' }] };
    g.NoteStore = { list: () => [{ groupId: 'x', notebookIds: [] }, { groupId: 'y', notebookIds: ['nb1', 'nb1'] }, { groupId: 'z', notebookIds: ['nb1', 'nb2'] }] };
    const { total, rows } = pickRows('notebook', '');
    expect(total).toBe(2);
    expect(rows.map((r) => [r.title, r.sub])).toEqual([['Uncategorized', '1 note'], ['Prayer', '2 notes'], ['Study', '1 note']]);
    expect(rows[0].make()).toMatchObject({ type: 'notebook-card', notebookId: 'uncategorized' });
    expect(pickRows('notebook', 'pray').rows.map((r) => r.key)).toEqual(['nb1']);
  });

  it('words from another entry show as an excerpt card that opens it', () => {
    expect(blockView({ type: 'journal-excerpt', sourceJournalId: 'a', sourceJournalTitle: 'Sunday', text: 'With  the family.' })).toEqual({
      kind: 'card', eyebrow: 'Excerpt', title: 'Sunday', words: 'With the family.', meta: 'Journal', open: { place: 'journal-entry', id: 'a' } });
  });

  it('a move, a removal and the paragraph after the last card (main\'s moveBlock and its Undo words)', () => {
    const bl = [{ id: 'a', type: 'p', text: 'x' }, { id: 'b', type: 'divider' }, { id: 'c', type: 'p', text: '' }];
    expect(moveBlock(bl, 1, -1).map((b) => b.id)).toEqual(['b', 'a', 'c']);
    expect(moveBlock(bl, 0, -1)).toBe(bl);
    expect(moveBlock(bl, 2, 1)).toBe(bl);
    expect(withTail(bl)).toBe(bl);
    expect(withTail([bl[0], bl[1]]).map((b) => b.type)).toEqual(['p', 'divider', 'p']);
    expect([{ type: 'audio' }, { type: 'image' }, { type: 'divider' }, { type: 'p' }].map(removedWords))
      .toEqual(['Voice memo removed.', 'Image removed.', 'Block deleted.', 'Block deleted.']);
    expect([{ type: 'letter-card', volKey: 'one', letterId: L16_ID }, { type: 'image' }, { type: 'audio' }, { type: 'divider' }].map((b) => blockName(b)))
      .toEqual(['Letter', 'Picture', 'Voice memo', 'Divider']);
  });
});

describe('Insert from your notes, and a block held (a real boot)', () => {
  function journal(blocks, more = []) {
    const entry = { id: 'j1', title: 'Old', created: Date.UTC(2026, 9, 1, 15), blocks };
    const all = [entry, ...more];
    g.JournalStore = { all: () => all, get: (id) => all.find((e) => e.id === id) || null,
      add: vi.fn(), update: vi.fn(), purgeBlockMarks: vi.fn(() => 0) };
    g.StateStore = { isReady: () => true, get: () => ({}), set: vi.fn() };
    g.HistoryStore = { isReady: () => true, list: () => [], add: vi.fn() };
    return entry;
  }
  function openEntry(title = 'Old') {
    const r = render(<V2App gateId={null} />);
    act(() => { [...r.container.querySelectorAll('.tabbar .tab')][2].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const mark = [...r.container.querySelectorAll('.marks .mark[role="button"]')].find((m) => m.querySelector('.mt').textContent === title);
    act(() => { mark.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    return r.container;
  }
  const lastPatch = () => g.JournalStore.update.mock.calls[g.JournalStore.update.mock.calls.length - 1][1];
  const insertKind = async (name) => {
    await click(document.querySelector('.tb .jins'));
    const it = [...document.querySelectorAll('[aria-label="Insert"] .it')].find((x) => x.querySelector('.itt').textContent === name);
    await click(it);
  };
  const closeTop = async () => { const s = [...document.querySelectorAll('.scrim')].pop(); await click(s); };

  it('Bookmark: "Pick a bookmark" with its search; a bookmark picked goes in as its card and is saved', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    journal([{ id: 'b1', type: 'p', text: 'One' }]);
    g.BookmarkStore = { all: () => [{ id: 'k1', hlKey: 'letter:' + L16_ID + ':0', label: 'Sunday reading', created: 1 }],
      get: (id) => (id === 'k1' ? { id: 'k1', hlKey: 'letter:' + L16_ID + ':0', label: 'Sunday reading' } : null) };
    const c = openEntry();
    await insertKind('Bookmark');
    const sheet = document.querySelector('[role="dialog"][aria-label="Pick a bookmark"]');
    expect(sheet.querySelector('.sh').textContent).toBe('Pick a bookmark');
    expect(sheet.querySelector('input.q').getAttribute('placeholder')).toBe('Search bookmarks');
    await act(() => { fireEvent.change(sheet.querySelector('input.q'), { target: { value: 'nothing like it' } }); });
    expect(sheet.querySelector('.empty .t').textContent).toBe('No matches.');
    await act(() => { fireEvent.change(sheet.querySelector('input.q'), { target: { value: 'sunday' } }); });
    await click(sheet.querySelector('.srow'));
    expect(document.querySelector('[aria-label="Pick a bookmark"]')).toBe(null);
    act(() => { vi.advanceTimersByTime(600); });
    expect(lastPatch().blocks.map((b) => b.type)).toEqual(['p', 'bookmark-card', 'p']);
    expect(texts(c, '.jed .jcard .je')).toEqual(['Bookmark']);
    expect(texts(c, '.jed .jcard .jh > span:first-child')).toEqual(['Sunday reading']);
  });

  it('Notebook lists Uncategorized first; Note says when there are none', async () => {
    journal([{ id: 'b1', type: 'p', text: 'One' }]);
    g.NotebookStore = { list: () => [{ id: 'nb1', name: 'Prayer' }], get: (id) => (id === 'nb1' ? { id: 'nb1', name: 'Prayer' } : null) };
    g.NoteStore = { list: () => [] };
    openEntry();
    await insertKind('Notebook');
    expect(texts(document.querySelector('[aria-label="Pick a notebook"]'), '.srow .t')).toEqual(['Uncategorized', 'Prayer']);
    await closeTop();
    await insertKind('Note');
    expect(document.querySelector('[aria-label="Pick a note"] .empty .t').textContent).toBe('No notes yet.');
  });

  it('Journal entry: never this one; another opens to the whole entry or one of its parts; Back one level', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const other = { id: 'j2', title: 'Sunday', created: Date.UTC(2026, 9, 11, 15), blocks: [{ id: 'q1', type: 'p', text: 'With the family.' }] };
    journal([{ id: 'b1', type: 'p', text: 'One' }], [other]);
    g.JournalHelpers = { newBlock: (t, x) => ({ id: 'n' + Math.random().toString(36).slice(2, 7), type: t, ...x }),
      embedBlockFromJournal: (src, b) => ({ id: 'emb', type: 'journal-excerpt', sourceJournalId: src.id, sourceBlockId: b.id, sourceJournalTitle: src.title, text: b.text }) };
    const c = openEntry();
    await insertKind('Journal entry');
    let sheet = document.querySelector('[aria-label="Pick a journal entry"]');
    expect(texts(sheet, '.srow .t')).toEqual(['Sunday']);
    await click(sheet.querySelector('.srow'));
    expect(sheet.querySelector('.lkbk .sh').textContent).toBe('Sunday');
    expect(texts(sheet, '.srow .t')).toEqual(['The whole entry', 'Words']);
    await click(sheet.querySelector('.lkbk .ic'));
    expect(texts(sheet, '.srow .t')).toEqual(['Sunday']);
    await click(sheet.querySelector('.srow'));
    await click(byText(sheet, '.srow', 'WordsWith the family.'));
    await insertKind('Journal entry');
    sheet = document.querySelector('[aria-label="Pick a journal entry"]');
    await click(sheet.querySelector('.srow'));
    await click(byText(sheet, '.srow', 'The whole entryA card that opens it'));
    act(() => { vi.advanceTimersByTime(600); });
    // the excerpt went in at the end (no cursor yet), the cursor into the paragraph after it; the card under that one
    expect(lastPatch().blocks.map((b) => b.type)).toEqual(['p', 'journal-excerpt', 'p', 'journal-card', 'p']);
    expect(lastPatch().blocks[1]).toMatchObject({ sourceJournalId: 'j2', sourceBlockId: 'q1', text: 'With the family.' });
    expect(lastPatch().blocks[3]).toMatchObject({ entryId: 'j2' });
    expect(texts(c, '.jed .jcard .je')).toEqual(['Excerpt', 'Journal entry']);
  });

  it('a block held (the context menu): Move up / Move down / Remove; Remove says main\'s words and Undo puts it back', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    journal([{ id: 'b1', type: 'p', text: 'One' }, { id: 'c1', type: 'letter-card', volKey: 'one', letterId: L16_ID },
      { id: 'd1', type: 'divider' }, { id: 'b2', type: 'p', text: 'Two' }]);
    const c = openEntry();
    const order = () => [...c.querySelectorAll('.jed > :not(input)')].map((n) => n.className.split(' ')[0]);
    fireEvent.contextMenu(c.querySelector('.jed .jcard'));
    let sheet = document.querySelector('[role="dialog"][aria-label="Letter"]');
    expect(texts(sheet, '.srow .t')).toEqual(['Move up', 'Move down', 'Remove']);
    await click(byText(sheet, '.srow', 'Move down'));
    expect(order()).toEqual(['mm', 'jt', 'jp', 'jdiv', 'jcard', 'jp']);
    act(() => { vi.advanceTimersByTime(600); });
    expect(lastPatch().blocks.map((b) => b.id)).toEqual(['b1', 'd1', 'c1', 'b2']);
    fireEvent.contextMenu(c.querySelector('.jed .jdiv'));
    sheet = document.querySelector('[role="dialog"][aria-label="Divider"]');
    await click(byText(sheet, '.srow', 'Remove'));
    expect(order()).toEqual(['mm', 'jt', 'jp', 'jcard', 'jp']);
    expect(document.querySelector('.toast').textContent).toBe('Block deleted.Undo');
    await click(document.querySelector('.toast .act'));
    expect(order()).toEqual(['mm', 'jt', 'jp', 'jdiv', 'jcard', 'jp']);
    act(() => { vi.advanceTimersByTime(7000); });
    expect(g.JournalStore.purgeBlockMarks).not.toHaveBeenCalled();
    expect(lastPatch().blocks.map((b) => b.id)).toEqual(['b1', 'd1', 'c1', 'b2']);
    // removed for good: main's purgeBlockMarks once the window has closed, with the editor's blocks
    fireEvent.contextMenu(c.querySelector('.jed .jcard'));
    await click(byText(document.querySelector('[aria-label="Letter"]'), '.srow', 'Remove'));
    act(() => { vi.advanceTimersByTime(6600); });
    expect(g.JournalStore.purgeBlockMarks).toHaveBeenCalledWith('j1', 'c1', expect.any(Array));
    expect(lastPatch().blocks.map((b) => b.id)).toEqual(['b1', 'd1', 'b2']);
  });

  it('a long press opens the same sheet, and the tap\'s own click (on the scrim now under the finger) neither closes it nor opens the card', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    journal([{ id: 'c1', type: 'letter-card', volKey: 'one', letterId: L16_ID }, { id: 'b2', type: 'p', text: 'Two' }]);
    const c = openEntry();
    const card = c.querySelector('.jed .jcard');
    fireEvent.pointerDown(card, { clientX: 10, clientY: 10, pointerType: 'touch' });
    act(() => { vi.advanceTimersByTime(520); });
    fireEvent.pointerUp(card);
    await click([...document.querySelectorAll('.scrim')].pop());   // headless Chrome: the click after a held touch
    expect(c.querySelector('.reader h1')).toBe(null);
    const sheet = document.querySelector('[role="dialog"][aria-label="Letter"]');
    expect(sheet).not.toBe(null);
    expect(byText(sheet, '.srow', 'Move up').disabled).toBe(true);
    expect(byText(sheet, '.srow', 'Move down').disabled).toBe(false);
    await closeTop();
    expect(document.querySelector('[aria-label="Letter"]')).toBe(null);
    // a press that moves is a scroll, not a hold
    fireEvent.pointerDown(card, { clientX: 10, clientY: 10, pointerType: 'touch' });
    fireEvent.pointerMove(card, { clientX: 10, clientY: 40, pointerType: 'touch' });
    act(() => { vi.advanceTimersByTime(600); });
    expect(document.querySelector('[aria-label="Letter"]')).toBe(null);
  });
});
