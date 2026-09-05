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
    TourController.targetPressed();                   // the reader pressed Listen: the stop stays, marked pressed
    expect(onClick).not.toHaveBeenCalled();
    expect(TourController.getState().step.id).toBe('listen');
    expect(TourController.getState().pressed).toBe(true);
    TourController.next();                            // → bible, without a second click
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
    TourController.next();                            // press Listen, stay
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(TourController.getState().step.id).toBe('listen');
    TourController.next();                            // → bible
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(TourController.getState().step.id).toBe('bible');
    expect(n.openBible).toHaveBeenCalledTimes(1);     // the bible stop's enter
  });

  it('back() re-enters the previous stop', () => {
    const n = nav();
    TourController.attachNav(n);
    TourController.start('prompt');
    TourController.next(); TourController.next(); TourController.next(); TourController.next();   // bible (listen takes two)
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
    for (let i = 0; i < 8; i++) TourController.next();   // the two Listen stops take two each
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

/* Device run (emulator-5554, 2026-09-04): the tour pressed Listen and moved on at once, so the
   reader never saw the words light up, and the playback it started ran on into the Journal and
   Settings, where the player bar hid the New Entry button under the ring. The rule now: a Listen
   stop stays until the reader has heard it, and the tour ends what the tour started. */
describe('TourController — a Listen stop stays, and the tour ends what it started', () => {
  const pill = () => {
    document.body.innerHTML = '<button class="hero-play-pill">Listen</button>';
    const el = /** @type {HTMLElement} */ (document.querySelector('.hero-play-pill'));
    el.getBoundingClientRect = () => /** @type {any} */ ({ x: 133, y: 271, width: 94, height: 25, left: 133, right: 227, top: 271, bottom: 296 });
    return el;
  };
  const toListen = () => { TourController.attachNav(nav()); TourController.start('prompt'); TourController.next(); TourController.next(); };
  let audio;
  beforeEach(() => { audio = { stop: vi.fn(), syncKeepAlive: vi.fn() }; /** @type {any} */ (globalThis).AudioPlayer = audio; });

  it('ending the tour asks the player to raise the keep-alive edge it held back', () => {
    TourController.attachNav(nav()); TourController.start('settings');
    TourController.skip();
    expect(audio.syncKeepAlive).toHaveBeenCalledTimes(1);
  });

  it('next() on a Listen stop presses the control and STAYS, marked pressed; the second next() moves on', () => {
    const el = pill(); const clicks = vi.fn(); el.addEventListener('click', clicks);
    toListen();
    expect(TourController.getState().step.id).toBe('listen');
    TourController.next();
    expect(clicks).toHaveBeenCalledTimes(1);
    expect(TourController.getState().step.id).toBe('listen');
    expect(TourController.getState().pressed).toBe(true);
    TourController.next();
    expect(TourController.getState().step.id).toBe('bible');
    expect(TourController.getState().pressed).toBe(false);
    expect(clicks).toHaveBeenCalledTimes(1);
  });

  it("the reader's own tap on the ringed Listen also stays, marked pressed", () => {
    pill(); toListen();
    TourController.targetPressed();
    expect(TourController.getState().step.id).toBe('listen');
    expect(TourController.getState().pressed).toBe(true);
  });

  it('leaving a pressed Listen stop stops the playback the tour started: next, back, skip', () => {
    pill(); toListen();
    TourController.next(); expect(audio.stop).not.toHaveBeenCalled();   // pressed: still playing, on purpose
    TourController.next(); expect(audio.stop).toHaveBeenCalledTimes(1);  // → bible: stopped
    TourController.back(); expect(audio.stop).toHaveBeenCalledTimes(1);  // nothing was started at bible
    TourController.next(); TourController.back(); expect(audio.stop).toHaveBeenCalledTimes(2);
    TourController.next(); TourController.next();                          // → listen, press again
    TourController.skip(); expect(audio.stop).toHaveBeenCalledTimes(3);
  });

  it('playback the READER started before the tour is never stopped by it', () => {
    // Settings › Help › Show me around while a letter plays: the tour pressed nothing, so it
    // owns nothing. (If a press at a Listen stop then REPLACES the reader's track, that
    // replacement is the press itself, and leaving the stop stops the tour's track; the reader's
    // was already gone, so there is nothing left to protect.) Only a press at a Listen stop (the tour's or the reader's tap on the ringed
    // control) makes the playback the tour's to end.
    pill();
    TourController.attachNav(nav()); TourController.start('settings');
    TourController.next();                 // letters
    TourController.back(); TourController.next();
    TourController.skip();
    expect(audio.stop).not.toHaveBeenCalled();
    TourController.start('settings'); TourController.next(); TourController.next();   // listen, not pressed
    TourController.next();                 // pressed: the tour now owns it
    TourController.skip();
    expect(audio.stop).toHaveBeenCalledTimes(1);
  });

  it('a stop the tour did not press is left alone', () => {
    pill(); toListen();
    TourController.next(); TourController.next();   // → bible, stopped once
    TourController.next(); TourController.next();   // press John 3, → journal: stopped twice
    expect(audio.stop).toHaveBeenCalledTimes(2);
    TourController.next(); TourController.next(); TourController.next();  // backup, done, end
    expect(audio.stop).toHaveBeenCalledTimes(2);
  });
});
