/* v2 "Mark this paragraph" (mw5 4b; picture 4b-mark-paragraph): a letter's blocks carry main's anchors, a tap opens the
   sheet, its colours / note / Copy / Share go through main's own stores and copy rules, main's painter shows the marks,
   the sheet closes on the scrim, Escape and Android Back, and a gate boot draws the picture reading and writing nothing. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, act, fireEvent } from '@testing-library/react';
import { V2App } from './App.jsx';
import { LetterScreen } from './screens/LetterScreen.jsx';
import { NoteEditor } from './screens/NoteEditor.jsx';
import {
  wordSpan, displayText, paragraphOf, markParagraph, unmarkParagraph, paragraphNote, saveNote, copyTextOf, shareTextOf,
  resetLastColour, lastUsedColour,
} from './marks.js';
import { segmentsDomText } from '../utils/segment-dom-text.js';
import { applyDOMHighlights } from '../renderer/annotation-engine.jsx';
import { DOUBLE_TAP_MS, FULLSCREEN_GESTURE_EVENT } from '../utils/fullscreen-gesture-event.js';
import * as ReactDOM from 'react-dom';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });

const PARA = [{ t: 'bold-italic', v: 'Thus says The Lord to His servant:' }, { t: 'text', v: 'Many things, My son' }, { t: 'fn', v: '1' },
  { t: 'italic', v: 'says The Lord.' }];
const LETTER1 = {
  id: 'chosen-by-god', num: 1, title: 'Chosen by God', date: '8/31/04',
  blocks: [
    { type: 'para', segments: PARA },
    { type: 'poetry', lines: [[{ t: 'italic', v: 'For in My love' }], [{ t: 'stanza-break' }], [{ t: 'italic', v: 'Were you created' }]] },
    { type: 'heading', text: 'A heading' },
    { type: 'closing', text: 'Says The Lord.' },
  ],
};
const TEXT0 = segmentsDomText(PARA);
const KEY0 = 'letter:chosen-by-god:0';

/** main's AnnotationStore as far as marks use it (get/add/recolorGroup/removeGroup/getByGroup + version). */
function fakeAnnotations() {
  /** @type {Record<string, any[]>} */
  const data = {};
  const ls = new Set();
  let v = 0;
  const bump = () => { v += 1; ls.forEach((cb) => cb()); };
  return {
    data,
    get: vi.fn((k) => data[k] || []),
    add: vi.fn((k, a) => { (data[k] = data[k] || []).push({ ...a }); bump(); }),
    recolorGroup: vi.fn((gid, c) => { Object.values(data).forEach((arr) => arr.forEach((a) => { if (a.groupId === gid) a.color = c; })); bump(); }),
    removeGroup: vi.fn((gid) => {
      Object.keys(data).forEach((k) => { data[k] = data[k].filter((a) => a.groupId !== gid); if (!data[k].length) delete data[k]; });
      bump();
    }),
    getByGroup: (gid) => Object.entries(data).flatMap(([k, arr]) => arr.filter((a) => a.groupId === gid).map((a) => ({ key: k, ann: a }))),
    subscribe: (cb) => { ls.add(cb); return () => ls.delete(cb); },
    getVersion: () => v,
  };
}
function fakeNotes() {
  /** @type {Record<string, any>} */
  const data = {};
  const ls = new Set();
  let v = 0;
  return {
    data,
    get: vi.fn((gid) => data[gid] || null),
    set: vi.fn((gid, f) => { data[gid] = { ...(data[gid] || {}), ...f }; v += 1; ls.forEach((cb) => cb()); }),
    subscribe: (cb) => { ls.add(cb); return () => ls.delete(cb); },
    getVersion: () => v,
  };
}

let ids = 0;
beforeEach(() => {
  g.COL_BY_KEY = new Map([['one', { volKey: 'one', label: 'Volume One', globalName: 'LETTERS_V1' }]]);
  g.LETTERS_V1 = [LETTER1, { id: 'two', num: 2, title: 'Honor God', blocks: [] }];
  g.AnnotationStore = fakeAnnotations();
  g.NoteStore = fakeNotes();
  g.hlId = () => 'hl_' + (++ids);
  g.applyDOMHighlights = vi.fn(applyDOMHighlights);
  g.findEntryContext = (id, kind) => (id === 'chosen-by-god' && kind === 'letter'
    ? { title: 'Chosen by God', collection: 'Volume One', screen: 'vot-letter', kind: 'letter' } : null);
  g.ReactDOM = ReactDOM;   // index.html's global: sheets portal into the shell's layer
  resetLastColour();
});
afterEach(() => {
  cleanup();
  for (const k of ['COL_BY_KEY', 'LETTERS_V1', 'AnnotationStore', 'NoteStore', 'NoteDefaultStore', 'hlId', 'applyDOMHighlights',
    'findEntryContext', 'StateStore', 'matchMedia', 'ReactDOM']) delete g[k];
  delete html.dataset.gate;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const page = (props = {}) => render(<LetterScreen collection="one" n={1} desktop {...props} />);
const block = (c, i) => c.querySelector('[data-hl-key="letter:chosen-by-god:' + i + '"]');

describe("a letter's text carries main's anchors", () => {
  it('every block main keys has letter:<id>:<index in blocks> and data-hl-dom; a heading counts but has none', () => {
    const { container } = page();
    const keyed = [...container.querySelectorAll('.body [data-hl-key]')];
    expect(keyed.map((el) => el.getAttribute('data-hl-key'))).toEqual([KEY0, 'letter:chosen-by-god:1', 'letter:chosen-by-god:3']);
    keyed.forEach((el) => expect(el.getAttribute('data-hl-dom')).toBe('true'));
    expect(container.querySelector('p.heading').hasAttribute('data-hl-key')).toBe(false);
  });

  it('a closing keeps its words (the corpus holds them as text: "Says The Lord.")', () => {
    const { container } = page();
    expect(container.querySelector('p.closing').textContent).toBe('Says The Lord.');
    expect(container.querySelector('p.heading').textContent).toBe('A heading');
  });

  it("a poem's lines are block lines (a line break between them, as main's) and a footnote digit is main's chrome", () => {
    const { container } = page();
    const poem = block(container, 1);
    expect(poem.tagName).toBe('DIV');
    expect([...poem.children].map((c) => c.tagName + '.' + c.className)).toEqual(['DIV.poem', 'DIV.stanza-break', 'DIV.poem']);
    expect(displayText(poem, 0, poem.textContent.length)).toBe('For in My love\nWere you created');
    expect(block(container, 0).querySelector('sup').className).toBe('fn fn-ref');
    expect(block(container, 0).textContent).toBe(TEXT0);
  });
});

describe('marks.js: main\'s records', () => {
  it("a paragraph's words: leading and trailing punctuation out; its text as main records it, footnote digits out", () => {
    expect(wordSpan('"Behold, I come."')).toEqual({ start: 1, end: 15 });
    const { container } = page();
    const p = paragraphOf(block(container, 0));
    expect(p).toEqual({ key: KEY0, start: 0, end: TEXT0.length - 1,
      text: 'Thus says The Lord to His servant: Many things, My son says The Lord' });
  });

  it('a colour adds one highlight record; another colour recolours that group; the ringed one takes it off', () => {
    const A = g.AnnotationStore;
    const p = { key: KEY0, start: 0, end: 10, text: 'Thus says ' };
    const id = markParagraph(p, 'sage', { now: 5 });
    expect(A.data[KEY0]).toEqual([{ id, groupId: id, kind: 'highlight', start: 0, end: 10, color: 'green', text: 'Thus says ', created: 5 }]);
    expect(lastUsedColour()).toBe('sage');
    expect(markParagraph(p, 'plum')).toBe(id);
    expect(A.data[KEY0]).toHaveLength(1);
    expect(A.data[KEY0][0].color).toBe('purple');
    unmarkParagraph(p);
    expect(A.data[KEY0]).toBeUndefined();
  });

  it("taking the colour off a highlight with a note keeps the note (its mark goes blank), and a part-paragraph mark is not the paragraph's", () => {
    const A = g.AnnotationStore;
    const p = { key: KEY0, start: 0, end: 10, text: 'Thus says ' };
    A.add(KEY0, { id: 'part', groupId: 'part', kind: 'highlight', start: 2, end: 6, color: 'yellow', created: 9 });
    const id = markParagraph(p, 'rose');
    expect(A.data[KEY0]).toHaveLength(2);
    g.NoteStore.set(id, { body: 'mine' });
    unmarkParagraph(p);
    expect(A.removeGroup).not.toHaveBeenCalled();
    expect(A.data[KEY0].find((a) => a.id === id).color).toBe('blank');
    expect(g.NoteStore.data[id].body).toBe('mine');
  });

  it('Add a note finds a note on the paragraph, else its mark, else none yet', () => {
    const A = g.AnnotationStore;
    const p = { key: KEY0, start: 0, end: 10, text: 'Thus says ' };
    expect(paragraphNote(p)).toEqual({ groupId: null, hasNote: false });
    A.add(KEY0, { id: 'm1', groupId: 'm1', kind: 'highlight', start: 0, end: 10, color: 'yellow', created: 1 });
    expect(paragraphNote(p)).toEqual({ groupId: 'm1', hasNote: false });
    A.add(KEY0, { id: 'm2', groupId: 'm2', kind: 'highlight', start: 0, end: 10, color: 'blank', created: 2 });
    g.NoteStore.set('m2', { body: 'x' });
    expect(paragraphNote(p)).toEqual({ groupId: 'm2', hasNote: true });
  });

  it("a note's first words make its mark at main's note default, then main's note record; on a mark only the record", () => {
    g.NoteDefaultStore = { get: () => ({ style: 'underline', color: 'blue' }) };
    const A = g.AnnotationStore;
    const p = { key: KEY0, start: 0, end: 10, text: 'Thus says' };
    const id = saveNote({ ...p, groupId: null }, 'A word for me', { now: 7, excerpt: (s) => s });
    expect(A.data[KEY0][0]).toEqual({ id, groupId: id, kind: 'underline', start: 0, end: 10, color: 'blue', text: 'Thus says', created: 7 });
    expect(g.NoteStore.data[id]).toEqual({ color: 'blue', fullText: 'Thus says', keys: [KEY0], body: 'A word for me' });
    A.add.mockClear();
    expect(saveNote({ ...p, groupId: id }, 'A word for me, kept', { excerpt: (s) => s })).toBe(id);
    expect(A.add).not.toHaveBeenCalled();
    expect(g.NoteStore.data[id].body).toBe('A word for me, kept');
  });

  it("Copy says what main's does: the quoted words, the letter and its volume, its page on the site", () => {
    const { container } = page();
    const text = copyTextOf(block(container, 0));
    expect(text.startsWith('"Thus says The Lord to His servant: Many things, My son says The Lord."\n\nChosen by God (Volume One)\n')).toBe(true);
    expect(text).toContain('https://www.thevolumesoftruth.com/Chosen_by_God');
  });

  it("Share a link sends the quoted words, the letter and the app's link (the website's when Settings say so)", () => {
    const { container } = page();
    const el = block(container, 0);
    expect(shareTextOf(el, 'app')).toBe('"Thus says The Lord to His servant: Many things, My son says The Lord."\n\nChosen by God (Volume One)\n'
      + 'https://votreader.github.io/app/?p=' + encodeURIComponent(KEY0));
    expect(shareTextOf(el, 'site')).toBe(copyTextOf(el));
  });
});

describe('the sheet on the letter page', () => {
  it("a tap opens it, gold ringed; a colour writes main's record, closes, and main's painter shows the mark", async () => {
    const { container, getByRole } = page();
    click(block(container, 0).querySelector('i'));
    const dlg = getByRole('dialog', { name: 'Mark this paragraph' });
    expect(dlg.className).toBe('dlg para');
    expect(dlg.querySelector('.swatch.on').className).toBe('swatch gold on');
    expect(block(container, 0).classList.contains('tapped')).toBe(true);
    expect(container.querySelector('.body').classList.contains('marked')).toBe(true);
    click(dlg.querySelector('.swatch.sage'));
    expect(container.querySelector('[role="dialog"]')).toBe(null);
    expect(block(container, 0).classList.contains('tapped')).toBe(false);
    expect(g.AnnotationStore.data[KEY0]).toMatchObject([{ kind: 'highlight', color: 'green', start: 0, end: TEXT0.length - 1 }]);
    await waitFor(() => expect(block(container, 0).querySelector('mark.hl-green')).not.toBe(null));
    expect([...block(container, 0).querySelectorAll('mark.hl-green')].map((m) => m.textContent).join('')).toBe(TEXT0.slice(0, -1));
  });

  it('the paragraph\'s own colour is ringed and pressed; tapping it takes the highlight off', () => {
    const { container, getByRole } = page();
    click(block(container, 0));
    click(getByRole('dialog').querySelector('.swatch.blue'));
    click(block(container, 0));
    const on = getByRole('dialog').querySelector('.swatch.on');
    expect(on.className).toBe('swatch blue on');
    expect(on.getAttribute('aria-pressed')).toBe('true');
    expect(on.getAttribute('aria-label')).toBe('Remove the blue highlight');
    click(on);
    expect(g.AnnotationStore.data[KEY0]).toBeUndefined();
  });

  it('on the phone it waits out a double tap: the second tap (full screen) cancels it', () => {
    vi.useFakeTimers();
    const { container } = page({ desktop: false, waitDoubleTap: true });
    click(block(container, 0));
    expect(container.querySelector('[role="dialog"]')).toBe(null);
    act(() => { vi.advanceTimersByTime(DOUBLE_TAP_MS); });
    expect(container.querySelector('.sheet.para .handle')).not.toBe(null);
    click(container.querySelector('.cancel'));
    click(block(container, 0));
    act(() => { document.dispatchEvent(new CustomEvent(FULLSCREEN_GESTURE_EVENT)); });
    click(block(container, 0));
    act(() => { vi.advanceTimersByTime(DOUBLE_TAP_MS * 2); });
    expect(container.querySelector('[role="dialog"]')).toBe(null);
  });

  it('a selection and a tap a peer claimed (preventDefault: read-along jumping) are not paragraph taps', () => {
    const { container } = page();
    const sel = vi.spyOn(window, 'getSelection').mockReturnValue(/** @type {any} */ ({ isCollapsed: false, toString: () => 'Many things' }));
    click(block(container, 0));
    expect(container.querySelector('[role="dialog"]')).toBe(null);
    sel.mockRestore();
    const claim = (e) => e.preventDefault();
    document.addEventListener('click', claim, true);
    click(block(container, 0));
    expect(container.querySelector('[role="dialog"]')).toBe(null);
    document.removeEventListener('click', claim, true);
    click(block(container, 0));
    expect(container.querySelector('[role="dialog"]')).not.toBe(null);
  });

  it("Copy puts main's copy text on the clipboard and says Copied", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { container, getByRole, findByRole } = page();
    click(block(container, 3));
    click([...getByRole('dialog').querySelectorAll('.srow')].find((r) => r.textContent === 'Copy'));
    expect((await findByRole('status')).textContent).toBe('Copied');
    expect(writeText).toHaveBeenCalledWith(copyTextOf(block(container, 3)));
    delete /** @type {any} */ (navigator).clipboard;
  });

  it('Add a note hands the editor the paragraph and its mark (none yet)', () => {
    const onNote = vi.fn();
    const { container, getByRole } = page({ onNote });
    click(block(container, 0));
    click([...getByRole('dialog').querySelectorAll('.srow')].find((r) => r.textContent === 'Add a note'));
    expect(onNote).toHaveBeenCalledWith({ key: KEY0, start: 0, end: TEXT0.length - 1,
      text: 'Thus says The Lord to His servant: Many things, My son says The Lord', groupId: null });
    expect(g.AnnotationStore.add).not.toHaveBeenCalled();
  });
});

describe('the 4b gate and closing the sheet', () => {
  it('4b-mark-paragraph: paragraph 1 tapped, gold ringed, Back says Volume One; reads and paints nothing', async () => {
    const { container, getByRole } = render(<V2App gateId="4b-mark-paragraph" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(container.querySelector('.tb .title').textContent).toBe('Volume One');
    const sheet = getByRole('dialog', { name: 'Mark this paragraph' });
    expect(sheet.className).toBe('sheet para');
    expect(sheet.parentElement.className).toBe('v2-layer');
    expect(sheet.querySelector('.swatch.on').className).toBe('swatch gold on');
    expect([...sheet.querySelectorAll('.srow')].map((r) => r.textContent)).toEqual(['Add a note', 'Copy', 'Share a link']);
    expect(block(container, 0).classList.contains('tapped')).toBe(true);
    expect(g.AnnotationStore.get).not.toHaveBeenCalled();
    expect(g.applyDOMHighlights).not.toHaveBeenCalled();
  });

  it('the scrim, Escape and Android Back close it; Back closes the sheet first and the letter stays', async () => {
    const { container } = render(<V2App gateId="4b-mark-paragraph" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    click(container.querySelector('.v2-layer > .scrim'));
    expect(container.querySelector('[role="dialog"]')).toBe(null);
    cleanup();
    const second = render(<V2App gateId="4b-mark-paragraph" />);
    await waitFor(() => expect(second.container.querySelector('[role="dialog"]')).not.toBe(null));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(second.container.querySelector('[role="dialog"]')).toBe(null);
    cleanup();
    const third = render(<V2App gateId="4b-mark-paragraph" />);
    await waitFor(() => expect(third.container.querySelector('[role="dialog"]')).not.toBe(null));
    let r;
    act(() => { r = g.handleAndroidBack(); });
    expect(r).toBe('true');
    expect(third.container.querySelector('[role="dialog"]')).toBe(null);
    expect(third.container.querySelector('h1').textContent).toBe('Chosen by God');
  });
});

describe('the note editor', () => {
  const route = { place: 'note', key: KEY0, start: 0, end: 10, text: 'Thus says', groupId: null };

  it('writes nothing until there are words; then the mark and the note, saved as the reader types and on leaving', () => {
    vi.useFakeTimers();
    g.NoteDefaultStore = { get: () => ({ style: 'highlight', color: 'blank' }) };
    const { container, unmount } = render(<NoteEditor route={route} gate={null} onReady={vi.fn()} />);
    expect(container.querySelector('blockquote').textContent).toBe('Thus says');
    const field = container.querySelector('textarea');
    fireEvent.change(field, { target: { value: '   ' } });
    act(() => { vi.advanceTimersByTime(600); });
    expect(g.AnnotationStore.add).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: 'Be steadfast' } });
    act(() => { vi.advanceTimersByTime(600); });
    const gid = g.AnnotationStore.data[KEY0][0].groupId;
    expect(g.AnnotationStore.data[KEY0][0]).toMatchObject({ kind: 'highlight', color: 'blank', start: 0, end: 10 });
    expect(g.NoteStore.data[gid].body).toBe('Be steadfast');
    fireEvent.change(field, { target: { value: 'Be steadfast, My son' } });
    unmount();
    expect(g.NoteStore.data[gid].body).toBe('Be steadfast, My son');
    expect(g.AnnotationStore.add).toHaveBeenCalledTimes(1);
  });

  it('opens a note with its words and saves to the same group; a gate boot never writes', () => {
    g.NoteStore.set('n1', { body: 'Old words' });
    g.AnnotationStore.add(KEY0, { id: 'n1', groupId: 'n1', kind: 'highlight', start: 0, end: 10, color: 'yellow', created: 1 });
    const first = render(<NoteEditor route={{ ...route, groupId: 'n1' }} gate={null} onReady={vi.fn()} />);
    expect(first.container.querySelector('textarea').value).toBe('Old words');
    fireEvent.change(first.container.querySelector('textarea'), { target: { value: 'New words' } });
    first.unmount();
    expect(g.NoteStore.data.n1.body).toBe('New words');
    g.NoteStore.set.mockClear();
    const gated = render(<NoteEditor route={route} gate={/** @type {any} */ ({ stack: [] })} onReady={vi.fn()} />);
    fireEvent.change(gated.container.querySelector('textarea'), { target: { value: 'x' } });
    gated.unmount();
    expect(g.NoteStore.set).not.toHaveBeenCalled();
  });
});
