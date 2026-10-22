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
    expect([...sheet.querySelectorAll('[role="tab"]')].map((t) => [t.textContent, t.getAttribute('aria-selected')]))
      .toEqual([['Parchment', 'true'], ['Ink', 'false'], ['Night', 'false']]);
    const card = sheet.querySelector('canvas');
    expect([card.width, card.height]).toEqual([1080, 1350]);
    // The preview names what it shows: the excerpt verbatim, its source, its date.
    expect(card.getAttribute('aria-label')).toMatch(/^"For I am a Great King!.*God Eternal!" “The Alarm of War” · Volume \w+ 7\/5\/10$/);
    fireEvent.keyDown(sheet.querySelector('[role="tab"]'), { key: 'ArrowLeft' });
    expect(sheet.querySelector('[aria-selected="true"]').textContent).toBe('Night');
    expect(within(sheet).getByText('Share').disabled).toBe(false);
  });

  it('a passage over 80 words is refused, never cut', () => {
    const passage = Array(81).fill('word').join(' ');
    render(<AnswersCardSheet card={{ passage, cite: '“Title” · Volume 1', date: '' }} onClose={noop} />);
    expect(screen.getByText('Choose a shorter passage')).toBeTruthy();
    expect(screen.getByText('A card holds 80 words at most; this passage has 81.')).toBeTruthy();
    expect(document.querySelector('canvas')).toBeNull();
    expect(screen.getByText('Share').disabled).toBe(true);
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
