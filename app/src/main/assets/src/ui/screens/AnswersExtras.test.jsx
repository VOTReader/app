// @ts-nocheck — free-var globals installed on window, same shape as AnswersHome.test.jsx
/* The AOGCG Extras on the real corpus: Saved answers (O5: the screen and the landing's Tools row) and
   Share as a card (O6: the Answer of the day's share button, the sheet, the 80-word rule). */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, act, within } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { AnswersHome, resetAnswersLanding } from './AnswersHome.jsx';
import { AnswersSaved } from './AnswersSaved.jsx';
import { AnswersCardSheet } from '../sheets/AnswersCardSheet.jsx';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
const ctx = {};
runInNewContext(readFileSync(resolve(DATA, 'answers.js'), 'utf8') + ';this.SITE=ANSWERS_SITE_META;', ctx);
runInNewContext(readFileSync(resolve(DATA, 'answers-meta.js'), 'utf8') + ';this.META=ANSWERS_META;', ctx);
const ANSWERS = ctx.ANSWERS;
const SITE = ctx.SITE;
const NB = (s) => s.replace(/\u00a0/g, ' ');

/* AnnotationStore / NoteStore as the screens read them: all(), get(), subscribe(), getVersion(). */
function stores(marks, notes = {}) {
  let v = 1; const subs = new Set();
  const ann = { all: () => marks, subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); }, getVersion: () => v };
  const ns = { get: (g) => (notes[g] ? { body: notes[g] } : null), subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); }, getVersion: () => v };
  window.AnnotationStore = ann; window.NoteStore = ns;
  return { set(next) { marks = next; v++; subs.forEach((cb) => cb()); } };
}
const mark = (gid, start, text, kind = 'highlight') => ({ id: gid + start, groupId: gid, kind, color: 'yellow', start, end: start + text.length, text });

const GLOBALS = ['ScreenLayout', 'LibraryNav', 'SheetHandle', 'useFocusTrap', 'ReactDOM', 'ANSWERS_META', 'AnnotationStore', 'NoteStore', 'PlatformBridge', 'showToast'];
beforeEach(() => {
  resetAnswersLanding();
  try { localStorage.clear(); } catch (_e) { /* */ }
  window.ScreenLayout = ({ navChildren, children }) => <div>{navChildren}{children}</div>;
  window.LibraryNav = (p) => <button type="button" data-testid="nav-back" onClick={p.onBack}>{p.backLabel}</button>;
  window.SheetHandle = ({ onClose, glyph }) => <button type="button" onClick={onClose} aria-label="Close">{glyph || '‹'}</button>;
  window.useFocusTrap = () => ({ current: null });
  window.ReactDOM = ReactDOM;
  window.ANSWERS_META = ctx.META;
});
afterEach(() => { cleanup(); for (const g of GLOBALS) delete window[g]; delete window.__closeSheet; });

const noop = () => {};
const nav = { onBack: noop, onSearch: noop, onHistory: noop, onSettings: noop, theme: 'dark', onThemeChange: noop };
const MARKS = {
  'wtlb:god-speaks-about-the-sabbath:2': [mark('g1', 0, '“Thus says The Lord'), mark('n1', 30, 'My Sabbaths', 'note')],
  'wtlb:there-is-no-other:5': [mark('g2', 0, 'there is no other', 'underline')],
  'letter:the-wide-path:3': [mark('x', 0, 'a letter, not Answers')],
};

describe('Saved answers (O5)', () => {
  it('lists the reader\'s Answers marks by topic in the site\'s order, with the note, the source, and a tap to the paragraph', () => {
    stores(MARKS, { n1: 'Read this again on the Sabbath.' });
    const onOpenTopic = vi.fn();
    render(<AnswersSaved {...nav} entries={ANSWERS} onOpenTopic={onOpenTopic} />);
    expect(document.querySelector('.ans-label').textContent).toBe('Answers Only God Can Give');
    expect(document.querySelector('h1').textContent).toBe('Saved answers');
    expect(NB(document.querySelector('.ans-lede').textContent)).toBe('3 highlights and notes in 2 topics, in the site’s order.');
    expect([...document.querySelectorAll('.ans-sechead .ans-h2')].map((n) => n.textContent)).toEqual(['THERE IS NO OTHER', 'God Speaks About The Sabbath']);
    const hits = [...document.querySelectorAll('.ans-hit')];
    expect(hits.map((h) => h.querySelector('.ans-hit-snip').textContent)).toEqual(['there is no other', '“Thus says The Lord', 'My Sabbaths']);
    expect(hits[2].querySelector('.ans-hit-note').textContent).toBe('Read this again on the Sabbath.');
    expect(NB(hits[1].querySelector('.ans-hit-src:last-child').textContent)).toBe('“You Shall Not Desecrate the Sabbath” · Volume 3 · 3/29/06');
    expect(document.body.textContent).not.toContain('a letter, not Answers');
    fireEvent.click(hits[1]);
    const sabbath = ANSWERS.find((e) => e.id === 'god-speaks-about-the-sabbath');
    expect(onOpenTopic).toHaveBeenCalledWith('god-speaks-about-the-sabbath', sabbath.paragraphs[2].text, 'Saved answers', null, null, 2);
  });

  it('empty: says how to save one; a mark made elsewhere appears at once', () => {
    const s = stores({});
    render(<AnswersSaved {...nav} entries={ANSWERS} onOpenTopic={noop} />);
    expect(screen.getByText('No saved answers yet. Hold your finger on any line to highlight it.')).toBeTruthy();
    expect(document.querySelector('.ans-lede')).toBeNull();
    act(() => s.set({ 'wtlb:there-is-no-other:5': [mark('g2', 0, 'there is no other')] }));
    expect(NB(document.querySelector('.ans-lede').textContent)).toBe('1 highlight in 1 topic, in the site’s order.');
    expect(document.querySelector('.ans-empty')).toBeNull();
  });

  it('the landing\'s Tools row shows the live counts only when there are any, and opens the screen', () => {
    const s = stores({});
    const onOpenSaved = vi.fn();
    render(<AnswersHome {...nav} entries={ANSWERS} site={SITE} isRead={() => false} onOpenTopic={noop} onOpenMedia={noop} onOpenSaved={onOpenSaved} />);
    const row = () => [...document.querySelectorAll('.ans-tools .ans-row')].find((r) => r.querySelector('.ans-row-title').textContent === 'Saved answers');
    expect(row()).toBeUndefined();
    act(() => s.set(MARKS));
    expect(NB(row().querySelector('.ans-row-sub').textContent)).toBe('3 highlights and notes in 2 topics');
    expect(row().previousElementSibling.querySelector('.ans-row-title').textContent).toBe('Charts & videos');
    fireEvent.click(row());
    expect(onOpenSaved).toHaveBeenCalledTimes(1);
  });
});

describe('Share as a card (O6)', () => {
  it('the Answer of the day\'s share button opens the card: Parchment · Ink · Night, the preview, Share', () => {
    stores({});
    render(<AnswersHome {...nav} entries={ANSWERS} site={SITE} isRead={() => false} onOpenTopic={noop} now={new Date(2026, 4, 17, 12)} />);
    const daily = document.querySelector('.ans-daily');
    fireEvent.click(within(daily.querySelector('.ans-daily-head')).getByLabelText('Share as a card'));
    const sheet = screen.getByRole('dialog', { name: 'Share as a card' });
    // One choice of three that repaints the card: a radio group (a tablist would want panels to show).
    const group = within(sheet).getByRole('radiogroup', { name: 'Card theme' });
    expect([...group.querySelectorAll('[role="radio"]')].map((t) => [t.textContent, t.getAttribute('aria-checked')]))
      .toEqual([['Parchment', 'true'], ['Ink', 'false'], ['Night', 'false']]);
    const card = sheet.querySelector('canvas');
    expect([card.width, card.height]).toEqual([1080, 1350]);
    // Sized by its class (app.css .ans-card), so the token and theme checks see it.
    expect(card.className).toBe('ans-card');
    expect(card.getAttribute('style')).toBeNull();
    // The preview names what it shows: the excerpt verbatim, its source, its date.
    expect(card.getAttribute('aria-label')).toMatch(/^"For I am a Great King!.*God Eternal!" “The Alarm of War” · Volume \w+ 7\/5\/10$/);
    fireEvent.keyDown(group.querySelector('[role="radio"]'), { key: 'ArrowLeft' });
    expect(group.querySelector('[aria-checked="true"]').textContent).toBe('Night');
    fireEvent.keyDown(group.querySelector('[aria-checked="true"]'), { key: 'Home' });
    expect(group.querySelector('[aria-checked="true"]').textContent).toBe('Parchment');
    fireEvent.keyDown(group.querySelector('[aria-checked="true"]'), { key: 'End' });
    expect(group.querySelector('[aria-checked="true"]').textContent).toBe('Night');
    // An Answers button, on the Answers type scale (the kit's copy button grew to 42px at Text Size 3).
    const share = within(sheet).getByText('Share');
    expect(share.className).toBe('ans-btn');
    expect(share.disabled).toBe(false);
  });

  it('every face the card draws in is loaded before the repaint: the passage, the italic citation and date, the site line', async () => {
    const load = vi.fn(() => Promise.resolve([]));
    const had = Object.getOwnPropertyDescriptor(document, 'fonts');
    Object.defineProperty(document, 'fonts', { value: { load }, configurable: true });
    try {
      render(<AnswersCardSheet card={{ passage: 'I AM The Lord.', cite: '“Title” · Volume 1', date: '1/2/03' }} onClose={noop} />);
      await act(async () => {});
      // Each with the words it draws, so a face split by unicode-range (the app's glyph subset) loads every part.
      expect(load.mock.calls.map((c) => c.join(' | ')).sort()).toEqual([
        '30px serif | answersonlygodcangive.com', '60px serif | I AM The Lord.', 'italic 34px serif | “Title” · Volume 1 1/2/03']);
    } finally {
      if (had) Object.defineProperty(document, 'fonts', had); else delete document.fonts;
    }
  });

  it('on the web the PNG is made when the card is painted, so Share opens the share sheet inside the tap', () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    const ctx2d = { fillRect: vi.fn(), fillText: vi.fn(), measureText: (s) => ({ width: s.length * 10 }) };
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx2d);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(blob));
    const share = vi.fn(() => new Promise(() => {}));
    Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true, writable: true });
    try {
      render(<AnswersCardSheet card={{ passage: 'I AM The Lord.', cite: '“Title” · Volume 1', date: '' }} onClose={noop} />);
      const made = toBlob.mock.calls.length;
      expect(made).toBeGreaterThan(0);
      fireEvent.click(screen.getByText('Share'));
      // Called in the click itself, not after a toBlob callback: the tap's activation is still live.
      expect(share).toHaveBeenCalledTimes(1);
      expect(share.mock.calls[0][0].files[0].type).toBe('image/png');
      expect(toBlob.mock.calls.length).toBe(made);
    } finally {
      getContext.mockRestore(); toBlob.mockRestore();
      delete navigator.share; delete navigator.canShare;
    }
  });

  it('a passage over 80 words is refused, never cut', () => {
    const passage = Array(81).fill('word').join(' ');
    render(<AnswersCardSheet card={{ passage, cite: '“Title” · Volume 1', date: '' }} onClose={noop} />);
    expect(screen.getByText('Choose a shorter passage')).toBeTruthy();
    expect(screen.getByText('A card holds 80 words at most; this passage has 81.')).toBeTruthy();
    expect(document.querySelector('canvas')).toBeNull();
    // No card to theme, so no theme control; the dimmed look is the class's :disabled rule, not inline.
    expect(document.querySelector('[role="radiogroup"]')).toBeNull();
    expect(screen.getByText('Share').disabled).toBe(true);
    expect(screen.getByText('Share').getAttribute('style')).toBeNull();
  });

  it('Share hands the drawn card to the phone and closes; a refusal says so and stays open', async () => {
    const shareImage = vi.fn(() => true);
    window.PlatformBridge = { isAndroid: true, shareImage };
    window.showToast = vi.fn();
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,iVBORw0KGgo=');
    const onClose = vi.fn();
    render(<AnswersCardSheet card={{ passage: 'I AM The Lord.', cite: '“Title” · Volume 1', date: '1/2/03' }} onClose={onClose} />);
    await act(async () => { fireEvent.click(screen.getByText('Share')); });
    expect(shareImage).toHaveBeenCalledWith('iVBORw0KGgo=');
    expect(onClose).toHaveBeenCalledTimes(1);
    shareImage.mockReturnValue(false);
    await act(async () => { fireEvent.click(screen.getByText('Share')); });
    expect(window.showToast).toHaveBeenCalledWith(expect.objectContaining({ text: 'Couldn’t share the card.' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    toDataURL.mockRestore();
  });
});
