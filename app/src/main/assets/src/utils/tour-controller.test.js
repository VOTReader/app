/* tour-controller — the one object that runs the tour.
   ──────────────────────────────────────────────────────
   RED first (review-tutorial, 2026-09-04). Locks down:
     A) start() makes the tour active at the welcome card, asks the lazy
        bundle-e loader for the overlay, and runs the stop's `enter`
        through the nav the app attached.
     B) next() performs the stop's act (press the target / navigate) and
        moves on; targetPressed() moves on WITHOUT acting again (the reader
        already tapped the control); back() re-enters the previous stop;
        Next on the closing card finishes.
     C) skip() and finish() both end the tour and record the durable
        flag; "Maybe later" on the prompt is session-only.
     D) shouldPrompt(): Home only, after About, never once the flag is set,
        never while the tour runs, and not again this session after Maybe
        later.
     E) subscribe/getVersion notify on every state change (React reads it
        with useSyncExternalStore like every other store).
*/
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TourController } from './tour-controller.js';
import { TourDoneFlagStore, AboutSeenFlagStore } from '../stores/app-flag-stores.js';

const nav = () => ({ goHome: vi.fn(), openLetter: vi.fn(), openBible: vi.fn(), goJournalHub: vi.fn(), openSettingsData: vi.fn() });

beforeEach(() => {
  localStorage.clear();
  TourDoneFlagStore._resetForTests({ forceLoaded: true });
  AboutSeenFlagStore._resetForTests({ forceLoaded: true });
  TourController._resetForTests();
  document.body.innerHTML = '';
  delete window.__loadScreensE;
});

describe('TourController — start', () => {
  it('starts inactive; start() activates at the welcome card and notifies', () => {
    const cb = vi.fn();
    TourController.subscribe(cb);
    expect(TourController.getState().active).toBe(false);
    const v0 = TourController.getVersion();
    TourController.attachNav(nav());
    TourController.start('prompt');
    const s = TourController.getState();
    expect(s.active).toBe(true);
    expect(s.index).toBe(0);
    expect(s.step.id).toBe('welcome');
    expect(s.from).toBe('prompt');
    expect(TourController.getVersion()).toBeGreaterThan(v0);
    expect(cb).toHaveBeenCalled();
  });

  it('asks the lazy screens-e loader for the overlay and is ready when it resolves', async () => {
    let resolve;
    window.__loadScreensE = vi.fn(() => new Promise((r) => { resolve = r; }));
    TourController.attachNav(nav());
    TourController.start('settings');
    expect(window.__loadScreensE).toHaveBeenCalledTimes(1);
    expect(TourController.getState().ready).toBe(false);
    resolve();
    await Promise.resolve(); await Promise.resolve();
    expect(TourController.getState().ready).toBe(true);
  });

  it('is ready at once when there is no loader (tests, or the bundle already present)', () => {
    TourController.attachNav(nav());
    TourController.start('settings');
    expect(TourController.getState().ready).toBe(true);
  });

  it('runs the welcome stop\'s enter (go Home) so a tour started from Settings begins on Home', () => {
    const n = nav();
    TourController.attachNav(n);
    TourController.start('settings');
    expect(n.goHome).toHaveBeenCalledTimes(1);
  });
});

describe('TourController — moving', () => {
  it('next() from welcome goes to the letters stop (still Home, no act)', () => {
    const n = nav();
    TourController.attachNav(n);
    TourController.start('prompt');
    TourController.next();
    expect(TourController.getState().step.id).toBe('letters');
    expect(n.openLetter).not.toHaveBeenCalled();
  });

  it('next() on the letters stop opens a letter for the reader, then the listen stop is current', () => {
    const n = nav();
    TourController.attachNav(n);
    TourController.start('prompt');
    TourController.next(); TourController.next();
    expect(n.openLetter).toHaveBeenCalledTimes(1);
    expect(TourController.getState().step.id).toBe('listen');
  });

  it('targetPressed() on the letters stop still opens the letter (the tile only reaches the Volumes index)', () => {
    const n = nav();
    TourController.attachNav(n);
    TourController.start('prompt');
    TourController.next();
    TourController.targetPressed();          // the reader tapped the tile
    expect(n.openLetter).toHaveBeenCalledTimes(1);   // the listen stop's enter, not the act
    expect(TourController.getState().step.id).toBe('listen');
  });

  it('targetPressed() on a press stop never clicks the control a second time', () => {
    document.body.innerHTML = '<button class="hero-play-pill">Listen</button>';
    const pill = document.querySelector('.hero-play-pill');
    pill.getBoundingClientRect = () => /** @type {any} */ ({ x: 133, y: 271, width: 94, height: 25, left: 133, right: 227, top: 271, bottom: 296 });
    const onClick = vi.fn();
    pill.addEventListener('click', onClick);
    const n = nav();
    TourController.attachNav(n);
    TourController.start('prompt');
    TourController.next(); TourController.next();     // → listen
    TourController.targetPressed();                   // the reader pressed Listen
    expect(onClick).not.toHaveBeenCalled();
    expect(TourController.getState().step.id).toBe('bible');
    expect(n.openBible).toHaveBeenCalledTimes(1);
  });

  it('next() on a press stop clicks the visible target once, then moves on', () => {
    document.body.innerHTML = '<button class="hero-play-pill">Listen</button>';
    const pill = document.querySelector('.hero-play-pill');
    pill.getBoundingClientRect = () => /** @type {any} */ ({ x: 133, y: 271, width: 94, height: 25, left: 133, right: 227, top: 271, bottom: 296 });
    const onClick = vi.fn();
    pill.addEventListener('click', onClick);
    const n = nav();
    TourController.attachNav(n);
    TourController.start('prompt');
    TourController.next(); TourController.next();     // → listen
    TourController.next();                            // press Listen, → bible
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(TourController.getState().step.id).toBe('bible');
    expect(n.openBible).toHaveBeenCalledTimes(1);     // the bible stop's enter
  });

  it('back() re-enters the previous stop', () => {
    const n = nav();
    TourController.attachNav(n);
    TourController.start('prompt');
    TourController.next(); TourController.next(); TourController.next();   // bible
    TourController.back();
    expect(TourController.getState().step.id).toBe('listen');
    expect(n.openLetter).toHaveBeenCalledTimes(2);   // once on the way there, once coming back
  });

  it('back() on the welcome card stays put', () => {
    TourController.attachNav(nav());
    TourController.start('prompt');
    TourController.back();
    expect(TourController.getState().index).toBe(0);
  });

  it('next() on the closing card finishes and records the flag', () => {
    TourController.attachNav(nav());
    TourController.start('prompt');
    for (let i = 0; i < 6; i++) TourController.next();
    expect(TourController.getState().step.id).toBe('done');
    TourController.next();
    expect(TourController.getState().active).toBe(false);
    expect(TourDoneFlagStore.is()).toBe(true);
  });
});

describe('TourController — leaving', () => {
  it('skip() ends the tour and records the durable flag', () => {
    TourController.attachNav(nav());
    TourController.start('prompt');
    TourController.skip();
    expect(TourController.getState().active).toBe(false);
    expect(TourDoneFlagStore.is()).toBe(true);
  });

  it('dismissPrompt("later") is session-only; dismissPrompt("never") is durable', () => {
    TourController.dismissPrompt('later');
    expect(TourDoneFlagStore.is()).toBe(false);
    expect(TourController.getState().promptDismissed).toBe(true);
    TourController._resetForTests();
    TourController.dismissPrompt('never');
    expect(TourDoneFlagStore.is()).toBe(true);
  });
});

describe('TourController — shouldPrompt', () => {
  it('prompts on Home after About, and nowhere else', () => {
    AboutSeenFlagStore.set();
    expect(TourController.shouldPrompt({ screen: 'home' })).toBe(true);
    expect(TourController.shouldPrompt({ screen: 'settings' })).toBe(false);
  });
  it('never before About is seen, never after the flag, never while running, not after Maybe later', () => {
    expect(TourController.shouldPrompt({ screen: 'home' })).toBe(false);
    AboutSeenFlagStore.set();
    TourController.dismissPrompt('later');
    expect(TourController.shouldPrompt({ screen: 'home' })).toBe(false);
    TourController._resetForTests();
    TourDoneFlagStore.set();
    expect(TourController.shouldPrompt({ screen: 'home' })).toBe(false);
    TourDoneFlagStore.clear();
    TourController.attachNav(nav());
    TourController.start('prompt');
    expect(TourController.shouldPrompt({ screen: 'home' })).toBe(false);
  });
});
