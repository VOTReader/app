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
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

describe('TourController — the words bundles d and e reach only through here', () => {
  it('hands out the highlight gesture words the hint pill says (F2.1), the same string tour-steps owns', async () => {
    const steps = await import('./tour-steps.js');
    expect(typeof TourController.highlightWords, 'TourController.highlightWords must exist').toBe('function');
    expect(TourController.highlightWords()).toBe(steps.HIGHLIGHT_GESTURE_WORDS);
    expect(TourController.stopsWord()).toBe(steps.TOUR_STOPS_WORD);      // the sibling it mirrors
    expect(TourController.minutesWord()).toBe(steps.TOUR_MINUTES_WORD);  // and the minutes beside it
  });
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
    // Three stops on, through the highlight demonstration, and the pill is still not clicked.
    TourController.next();                            // → highlight
    TourController.next(); TourController.next();      // demonstrate, stay; then → scripture-web
    expect(onClick).not.toHaveBeenCalled();
    expect(TourController.getState().step.id).toBe('scripture-web');
    expect(n.goHome).toHaveBeenCalledTimes(3);        // the welcome card's enter, the letters stop's, and this stop's
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
    TourController.next();                            // → highlight
    TourController.next(); TourController.next();      // demonstrate, stay; then → scripture-web
    expect(onClick).toHaveBeenCalledTimes(1);         // once, and only on the stop that asked for it
    expect(TourController.getState().step.id).toBe('scripture-web');
    // Four stops on, at the Bible stop, the pill on this page is pressed again — and only then.
    TourController.next(); TourController.next(); TourController.next(); TourController.next();
    expect(TourController.getState().step.id).toBe('bible');
    expect(n.openBible).toHaveBeenCalledTimes(1);     // the bible stop's enter
    expect(onClick).toHaveBeenCalledTimes(1);
    TourController.next();
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('back() re-enters the previous stop', () => {
    const n = nav();
    TourController.attachNav(n);
    TourController.start('prompt');
    // welcome → letters → listen (press, stay) → highlight (demonstrate, stay) → scripture-web.
    // A count is the wrong unit here — the press-style stops take two next()s each — so the walk
    // is asserted at its destination rather than trusted.
    for (let i = 0; i < 6; i++) TourController.next();
    expect(TourController.getState().step.id).toBe('scripture-web');
    const entered = n.openLetter.mock.calls.length;
    TourController.back();
    expect(TourController.getState().step.id).toBe('highlight');
    // Re-entering means the stop's own `enter` runs again, which is what keeps the picture matching
    // the words. Measured as a delta so it does not encode how many stops share openLetter.
    expect(n.openLetter.mock.calls.length).toBe(entered + 1);
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
    // Every stop takes one Next, the three that stay (press / highlightDemo) take two; the walk
    // is bounded so a tour that never reaches the closing card fails here rather than spinning.
    for (let i = 0; i < 40 && TourController.getState().step.id !== 'done'; i++) TourController.next();
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
    expect(TourController.getState().step.id).toBe('highlight');
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
    TourController.next(); TourController.next();   // press Listen, → highlight: stopped once
    TourController.next(); TourController.next();   // demonstrate, → scripture-web: the demonstration starts no audio
    expect(audio.stop).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 4; i++) TourController.next();                    // journal, backup, settings → bible
    expect(TourController.getState().step.id).toBe('bible');
    expect(audio.stop).toHaveBeenCalledTimes(1);
  });
});

/* THE LISTENING SPAN (Corbin, 2026-09-12; the reorder of 2026-09-13). The tour ends over the Bible:
   the Bible stop presses Listen, the player stop and the back-to-words stop teach the player over that
   playback, and the closing card sits over the verses. So the playback the Bible press started is KEPT
   while the tour moves inside the span (bible → player → back-to-words → done) and STOPPED — with the
   sheet closed — when the tour leaves the span for any other stop (Back to the Bible stop, which presses
   Listen afresh and would otherwise pause it) or ends by Skip, Escape or Android Back. Only Done keeps
   it: the reader is left listening. */
describe('TourController — the listening span keeps the Bible playback, and the tour ends it by every door but Done', () => {
  const bibleScreen = () => {
    document.body.innerHTML = '<button class="hero-play-pill">Listen</button>';
    const el = /** @type {HTMLElement} */ (document.querySelector('.hero-play-pill'));
    el.getBoundingClientRect = () => /** @type {any} */ ({ x: 133, y: 271, width: 94, height: 25, left: 133, right: 227, top: 271, bottom: 296 });
    return el;
  };
  const sheetOpen = () => {
    document.body.insertAdjacentHTML('beforeend', '<div class="audio-manager-sheet"><button class="sheet-handle-back">‹</button></div>');
    const close = vi.fn(() => { const s = document.querySelector('.audio-manager-sheet'); if (s) s.remove(); });
    /** @type {any} */ (window).__closeSheet = close;
    return close;
  };
  /** Walk to the Bible stop from the start (every earlier stop pressed by the reader, so nothing plays yet). */
  const toBible = () => {
    TourController.attachNav(nav());
    TourController.start('settings');
    for (let i = 0; i < 20 && TourController.getState().step.id !== 'bible'; i++) TourController.targetPressed();
    expect(TourController.getState().step.id).toBe('bible');
    audio.stop.mockClear();
  };
  let audio;
  beforeEach(() => {
    audio = { stop: vi.fn(), syncKeepAlive: vi.fn(), getState: vi.fn(() => ({ status: 'playing', queue: [{ key: 'bible-brm-kjv:john' }], qi: 0 })) };
    /** @type {any} */ (globalThis).AudioPlayer = audio;
  });
  afterEach(() => { delete /** @type {any} */ (window).__closeSheet; });

  it('leaving the pressed Bible stop for the player stop keeps the playback; so does moving on to back-to-words and to the closing card', () => {
    bibleScreen(); toBible();
    TourController.next();                                   // press Listen: playing, the tour's
    expect(TourController.getState().pressed).toBe(true);
    TourController.next();                                   // → player
    expect(TourController.getState().step.id).toBe('player');
    expect(audio.stop).not.toHaveBeenCalled();
    TourController.next(); TourController.next();            // press the bar (nothing here to click), → back-to-words
    expect(TourController.getState().step.id).toBe('back-to-words');
    TourController.next(); TourController.next();            // press ‹ (nothing here), → done
    expect(TourController.getState().step.id).toBe('done');
    expect(audio.stop).not.toHaveBeenCalled();
  });

  it('Done on the closing card ends the tour and LEAVES the reading running; the flag is recorded', () => {
    bibleScreen(); toBible();
    TourController.next(); TourController.next(); TourController.next(); TourController.next(); TourController.next(); TourController.next();
    expect(TourController.getState().step.id).toBe('done');
    TourController.next();                                   // Done
    expect(TourController.getState().active).toBe(false);
    expect(audio.stop).not.toHaveBeenCalled();
    expect(TourDoneFlagStore.is()).toBe(true);
    expect(audio.syncKeepAlive).toHaveBeenCalledTimes(1);
  });

  it('Skip from inside the span stops the playback and closes the sheet the player stop opened', () => {
    bibleScreen(); toBible();
    TourController.next(); TourController.next();            // playing, → player
    const close = sheetOpen();                               // the press opened the sheet
    TourController.next();                                   // press the bar: pressed
    TourController.skip();
    expect(audio.stop).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.audio-manager-sheet')).toBeNull();
  });

  it('Skip from the closing card stops it too (only Done keeps it)', () => {
    bibleScreen(); toBible();
    for (let i = 0; i < 6; i++) TourController.next();
    expect(TourController.getState().step.id).toBe('done');
    TourController.skip();
    expect(audio.stop).toHaveBeenCalledTimes(1);
  });

  it('Back from the player stop to the Bible stop stops the playback — the Bible stop presses Listen afresh', () => {
    bibleScreen(); toBible();
    TourController.next(); TourController.next();            // playing, → player
    const close = sheetOpen();
    TourController.back();
    expect(TourController.getState().step.id).toBe('bible');
    expect(TourController.getState().pressed).toBe(false);
    expect(audio.stop).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('Back from the closing card to back-to-words, and from there to the player stop, keeps it (inside the span)', () => {
    bibleScreen(); toBible();
    for (let i = 0; i < 6; i++) TourController.next();
    expect(TourController.getState().step.id).toBe('done');
    TourController.back(); expect(TourController.getState().step.id).toBe('back-to-words');
    TourController.back(); expect(TourController.getState().step.id).toBe('player');
    expect(audio.stop).not.toHaveBeenCalled();
  });

  it('a sheet left open outside the span is closed by Skip as well (the reader opened it; the tour tidies)', () => {
    TourController.attachNav(nav()); TourController.start('settings'); TourController.next();   // letters
    const close = sheetOpen();
    TourController.skip();
    expect(close).toHaveBeenCalledTimes(1);
    expect(audio.stop).not.toHaveBeenCalled();               // the tour pressed nothing: not its playback
  });

  it('a Settings select sheet is not the listening sheet: with no .audio-manager-sheet on the page, __closeSheet is left alone', () => {
    TourController.attachNav(nav()); TourController.start('settings'); TourController.next();
    const close = vi.fn(); /** @type {any} */ (window).__closeSheet = close;
    TourController.skip();
    expect(close).not.toHaveBeenCalled();
  });
});

/* ensureListening's second half. The listening stops' `enter` (hooks/use-tour.js) opens John 3 and asks
   the controller to press the Bible screen's own Listen pill — the very press the Bible stop makes —
   unless the tour's book is already up. The pill may mount a frame after the screen is asked for, so
   the press waits for it (bounded), and it is FENCED like next()'s own press: the overlay's listener on
   the pill must not read it as the reader's tap. */
describe('TourController.pressListenIfIdle — the listening span starts John 3 when nothing of the tour\'s is up', () => {
  const pill = () => {
    document.body.innerHTML = '<button class="hero-play-pill">Listen</button>';
    const el = /** @type {HTMLElement} */ (document.querySelector('.hero-play-pill'));
    el.getBoundingClientRect = () => /** @type {any} */ ({ x: 133, y: 271, width: 94, height: 25, left: 133, right: 227, top: 271, bottom: 296 });
    return el;
  };
  const frame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));
  let audio, state;
  beforeEach(() => {
    state = { status: 'idle', queue: [], qi: 0 };
    audio = { stop: vi.fn(), syncKeepAlive: vi.fn(), getState: vi.fn(() => state) };
    /** @type {any} */ (globalThis).AudioPlayer = audio;
  });

  it('presses the pill once when nothing plays, and reports isPressing() during the click (the fence)', async () => {
    const el = pill();
    const seen = [];
    el.addEventListener('click', () => seen.push(TourController.isPressing()));
    TourController.pressListenIfIdle('john');
    expect(seen).toEqual([]);                                // the press waits for a frame: the screen may be mounting
    await frame(); await frame();
    expect(seen).toEqual([true]);
    await frame(); await frame();
    expect(seen).toEqual([true]);                            // once
  });

  it('presses nothing when the tour\'s book is already up — playing, paused or loading', async () => {
    const el = pill(); const clicks = vi.fn(); el.addEventListener('click', clicks);
    for (const status of ['playing', 'paused', 'loading']) {
      state = { status, queue: [{ key: 'bible-wop-nkjv:john' }], qi: 0 };
      TourController.pressListenIfIdle('john');
      await frame(); await frame();
    }
    expect(clicks).not.toHaveBeenCalled();
  });

  it('a letter, or another book, playing is not the tour\'s: the pill is pressed (the press replaces it, as the Bible stop\'s does)', async () => {
    const el = pill(); const clicks = vi.fn(); el.addEventListener('click', clicks);
    state = { status: 'playing', queue: [{ key: 'one:chosen-by-god' }], qi: 0 };
    TourController.pressListenIfIdle('john');
    await frame(); await frame();
    state = { status: 'playing', queue: [{ key: 'bible-brm-kjv:genesis' }], qi: 0 };
    TourController.pressListenIfIdle('john');
    await frame(); await frame();
    expect(clicks).toHaveBeenCalledTimes(2);
  });

  it('waits for a pill that mounts late, and gives up quietly after the wait', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      TourController.pressListenIfIdle('john');
      await frame(); await frame();                          // no pill yet
      const el = pill(); const clicks = vi.fn(); el.addEventListener('click', clicks);
      await frame(); await frame();
      expect(clicks).toHaveBeenCalledTimes(1);
      // And a press still waiting past the bound presses nothing that appears later.
      document.body.innerHTML = '';
      TourController.pressListenIfIdle('john');
      vi.setSystemTime(Date.now() + 4000);
      await frame(); await frame();
      const late = pill(); const lateClicks = vi.fn(); late.addEventListener('click', lateClicks);
      await frame(); await frame();
      expect(lateClicks).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('leaving the span cancels a press still waiting (Back to the Bible stop must not press Listen twice)', async () => {
    TourController.attachNav(nav()); TourController.start('settings');
    for (let i = 0; i < 20 && TourController.getState().step.id !== 'player'; i++) TourController.targetPressed();
    expect(TourController.getState().step.id).toBe('player');
    TourController.pressListenIfIdle('john');                // waiting: no pill on the page
    TourController.back();                                   // → bible, outside the span
    const el = pill(); const clicks = vi.fn(); el.addEventListener('click', clicks);
    await frame(); await frame();
    expect(clicks).not.toHaveBeenCalled();
  });
});

/* Corbin's device walk (2026-09-04): he pressed Listen on the tour's word and nothing lit up, because
   "Chosen by God" opens with 26.75 s of lead-in before its first clause. The press now seeks into the
   first lit clause, from AUDIO_SYNC, once the player knows the track's duration. */
describe('TourController — the letter Listen stop seeks to the first lit clause', () => {
  const pill = () => { document.body.innerHTML = '<button class="hero-play-pill">Listen</button>'; };
  const toListen = () => { TourController.attachNav(nav()); TourController.start('prompt'); TourController.next(); TourController.next(); };
  let audio, listeners, state;
  beforeEach(() => {
    listeners = new Set();
    state = { time: 0, duration: 0 };
    audio = {
      stop: vi.fn(), syncKeepAlive: vi.fn(), seek: vi.fn(),
      getState: () => state,
      subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    };
    /** @type {any} */ (globalThis).AudioPlayer = audio;
    /** @type {any} */ (globalThis).AUDIO_SYNC = { 'one:chosen-by-god': [[26.75, 0, 0, 34, 0], [29.96, 0, 35, 84, 0]] };
  });
  afterEach(() => { delete (/** @type {any} */ (globalThis)).AUDIO_SYNC; });
  const notify = () => { for (const cb of [...listeners]) cb(); };

  it('seeks 0.4 s into the first clause once the duration is known, and only once', () => {
    pill(); toListen();
    TourController.next();                              // press
    expect(audio.seek).not.toHaveBeenCalled();          // no metadata yet: a seek now would be discarded
    state = { time: 0, duration: 312.4 }; notify();
    expect(audio.seek).toHaveBeenCalledTimes(1);
    expect(audio.seek.mock.calls[0][0]).toBeCloseTo(27.15, 5);
    state = { time: 27, duration: 312.4 }; notify();
    expect(audio.seek).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);                     // unsubscribed after the seek
  });

  it('does not rewind a resumed recording that is already past the first clause', () => {
    pill(); toListen();
    TourController.next();
    state = { time: 140, duration: 312.4 }; notify();
    expect(audio.seek).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });

  it('without timing rows there is nothing to seek to, and no guess is made', () => {
    delete (/** @type {any} */ (globalThis)).AUDIO_SYNC;
    pill(); toListen();
    TourController.next();
    state = { time: 0, duration: 312.4 }; notify();
    expect(audio.seek).not.toHaveBeenCalled();
  });

  it('the Bible stop has no seek key: John 3 starts where it starts', () => {
    pill(); toListen();
    TourController.next(); TourController.next();      // press Listen, → highlight
    TourController.next(); TourController.next();      // demonstrate, → scripture-web
    for (let i = 0; i < 4; i++) TourController.next(); // journal, backup, settings → bible
    expect(TourController.getState().step.id).toBe('bible');
    TourController.next();                              // press
    state = { time: 0, duration: 200 }; notify();
    expect(audio.seek).not.toHaveBeenCalled();
  });
});

