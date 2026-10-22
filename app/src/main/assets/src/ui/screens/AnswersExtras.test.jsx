// @ts-nocheck — free-var globals installed on window, same shape as AnswersHome.test.jsx
/* The AOGCG Extras on the real corpus: Saved answers (O5: the screen and the landing's Tools row). */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { AnswersHome, resetAnswersLanding } from './AnswersHome.jsx';
import { AnswersSaved } from './AnswersSaved.jsx';

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
