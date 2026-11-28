// @ts-nocheck — free-var globals stubbed per test
/* ReadingTip (newcomer 2026-11-27): the one press-and-hold line at a finished reading's end, once, only when the
   session is free (utils/unasked.js). */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { ReadingTip, _resetReadingTip } from './ReadingTip.jsx';
import { _resetUnasked, note, claim, markFirstRunSession, spokeThisSession } from '../../utils/unasked.js';

let flags;
const store = () => ({ getVersion: () => 0, subscribe: () => () => {} });
beforeEach(() => {
  _resetUnasked(); _resetReadingTip();
  flags = { tour: false, hint: false };
  globalThis.StateStore = { get: () => ({ readItems: { a: 1 } }) };
  globalThis.TourController = { highlightWords: () => 'Hold your finger on any line' };
  globalThis.TourDoneFlagStore = { is: () => flags.tour, ...store() };
  globalThis.AnnHintDismissedFlagStore = { is: () => flags.hint, set: () => { flags.hint = true; }, ...store() };
  globalThis.AnnotationStore = { all: () => ({}), ...store() };
  globalThis.NoteStore = { count: () => 0, ...store() };
  globalThis.BookmarkStore = { count: () => 0, ...store() };
});
afterEach(() => {
  cleanup();
  ['StateStore', 'TourController', 'TourDoneFlagStore', 'AnnHintDismissedFlagStore', 'AnnotationStore', 'NoteStore', 'BookmarkStore'].forEach((k) => { delete globalThis[k]; });
  _resetUnasked();
});
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const tip = () => document.querySelector('.reading-tip');

describe('ReadingTip', () => {
  it('a finished reading, a reader who skipped the tour and has saved nothing: one line, "Tip", under the read mark', async () => {
    render(<ReadingTip unitKey="L1" finished />);
    await tick();
    expect(tip().querySelector('.tour-prompt-kicker').textContent).toBe('Tip');
    expect(tip().querySelector('.tour-prompt-title').textContent).toBe('Press and hold any line');
    expect(tip().querySelector('.tour-prompt-meta').textContent).toBe('to highlight it, or to write a note beside it.');
    expect([...tip().querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Got it']);
    expect(spokeThisSession()).toBe('tip');
  });
  it('not before the reading is finished, not after the tour, not once something is saved', async () => {
    let v = render(<ReadingTip unitKey="L1" finished={false} />); await tick(); expect(tip()).toBeNull(); v.unmount();
    flags.tour = true; v = render(<ReadingTip unitKey="L1" finished />); await tick(); expect(tip()).toBeNull(); v.unmount(); flags.tour = false;
    globalThis.NoteStore.count = () => 1; v = render(<ReadingTip unitKey="L1" finished />); await tick(); expect(tip()).toBeNull();
  });
  it('Got it ends it for good; so does leaving the page it came up on', async () => {
    let v = render(<ReadingTip unitKey="L1" finished />); await tick();
    fireEvent.click(tip().querySelector('button'));
    expect(tip()).toBeNull();
    expect(flags.hint).toBe(true);
    v.unmount(); flags.hint = false; _resetUnasked(); _resetReadingTip();
    v = render(<ReadingTip unitKey="L1" finished />); await tick();
    expect(tip()).not.toBeNull();
    v.unmount();
    expect(flags.hint).toBe(true);
  });
  it('once: another page in the same session does not show it again', async () => {
    const a = render(<ReadingTip unitKey="L1" finished />); await tick();
    expect(tip()).not.toBeNull();
    a.unmount(); flags.hint = false;   // even were the flag lost
    render(<ReadingTip unitKey="L2" finished />); await tick();
    expect(tip()).toBeNull();
  });
  it('not in a session something else spoke in, nor the welcome\'s', async () => {
    note('whats-new');
    let v = render(<ReadingTip unitKey="L1" finished />); await tick(); expect(tip()).toBeNull(); v.unmount();
    _resetUnasked(); markFirstRunSession();
    v = render(<ReadingTip unitKey="L1" finished />); await tick(); expect(tip()).toBeNull();
  });
  it('while the tip is due, the plan offer waits for it', () => {
    expect(claim('plan', { pause: true })).toBe(false);
  });
  it('not on a swipe preview', async () => {
    render(<ReadingTip unitKey="L1" finished inert />); await tick();
    expect(tip()).toBeNull();
  });
});
