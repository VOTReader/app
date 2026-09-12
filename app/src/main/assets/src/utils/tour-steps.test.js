/* tour-steps — the tour's stops as data, and the little logic around them.
   ────────────────────────────────────────────────────────────────────
   RED first (review-tutorial, 2026-09-04). What these lock down:
     A) The shape: a welcome card, then the numbered stops (the last one is
        the closing card), each with a title, plain text and — for the
        teaching stops — a target on the real UI and a way to get there.
        The count is hand-written in exactly one case here, on purpose.
     B) Bounds: next/prev never run off either end.
     C) The words: no jargon an older reader has to decode, and the
        phrases the trailer uses (Creative, 2026-09-04) appear verbatim.
     D) findTarget picks the VISIBLE control, never the pager's inert
        off-screen sibling, and matches by text when the step says so.
*/
import { TOUR_LETTER } from '../hooks/use-tour.js';
import { describe, it, expect, afterEach } from 'vitest';
import * as mod from './tour-steps.js';
import { TOUR_STEPS, TOUR_STOPS_WORD, stepCount, nextIndex, prevIndex, findTarget, bannedWord, TOUR_WORDS } from './tour-steps.js';

afterEach(() => { document.body.innerHTML = ''; });

describe('tour-steps — shape', () => {
  it('is a welcome card plus nine numbered stops', () => {
    expect(stepCount()).toBe(10);
    expect(TOUR_STEPS[0].id).toBe('welcome');
    expect(TOUR_STEPS[0].number).toBe(0);
    expect(TOUR_STEPS.slice(1).map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(TOUR_STEPS[9].id).toBe('done');
  });

  it('every teaching stop points at a real control and knows how to get there', () => {
    for (const s of TOUR_STEPS.slice(1, 9)) {
      expect(s.target && s.target.selector, s.id).toBeTruthy();
      expect(s.screen, s.id).toBeTruthy();
      expect(typeof s.enter, s.id).toBe('string');
    }
    expect(TOUR_STEPS.map((s) => s.id)).toEqual(['welcome', 'letters', 'listen', 'highlight', 'bible', 'scripture-web', 'journal', 'backup', 'settings', 'done']);
  });

  /* THE NUMBER IS WRITTEN TWICE — once as `number`, once inside the eyebrow's words — and
     nothing but this case makes the two agree. Adding a stop moved every eyebrow after it,
     and an eyebrow reading "3 of 6" on the fourth of eight stops is the kind of wrong that
     no other assertion here can see. Derived from the array, never hand-listed. */
  it('every eyebrow counts itself out of nine, and the welcome card says how many are coming', () => {
    const teaching = TOUR_STEPS.slice(1);
    for (const s of teaching) expect(s.eyebrow, s.id).toContain(`${s.number} of ${teaching.length}`);
    expect(TOUR_STEPS[0].text).toContain('nine stops');
  });

  /* THE COUNT IS WRITTEN ONCE (2026-09-10). Four sentences counted the stops by hand — every
     eyebrow, the welcome card, the Home strip (TourPrompt) and the Settings Help note — and the
     Home strip still said "six" after the highlight stop made it seven. The module now publishes
     the count as a word and every sentence reads it. The table here is the test's OWN reading of
     the array, so a module that published the wrong word cannot satisfy this by agreeing with
     itself; the hand-written count above is the loud line that moves when a stop lands. */
  it('publishes the gesture words the hint pill also says, as the head of the highlight stop (F2.1)', () => {
    // One sentence pair, one owner: the pill (bundle d) reads them through TourController and
    // must never hold a second copy that can drift from the stop it echoes.
    expect(typeof mod.HIGHLIGHT_GESTURE_WORDS, 'tour-steps.js must export HIGHLIGHT_GESTURE_WORDS').toBe('string');
    const stop = TOUR_STEPS.find((s) => s.id === 'highlight');
    expect(stop.text.startsWith(mod.HIGHLIGHT_GESTURE_WORDS)).toBe(true);
    expect(mod.HIGHLIGHT_GESTURE_WORDS).toContain('Highlight, or Note');
  });

  it('publishes the stop count as a word, and the welcome card counts with it', () => {
    const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    expect(TOUR_STOPS_WORD).toBe(words[TOUR_STEPS.length - 1]);
    expect(TOUR_STEPS[0].text).toContain(`${TOUR_STOPS_WORD} stops`);
  });

  it('every stop has a title and plain text under 60 words', () => {
    for (const s of TOUR_STEPS) {
      expect(s.title.length, s.id).toBeGreaterThan(3);
      expect(s.text.split(/\s+/).length, s.id).toBeLessThan(60);
    }
  });

  it('the backup stop opens the Your Data group and never presses Export for the reader', () => {
    const backup = TOUR_STEPS.find((s) => s.id === 'backup');
    expect(backup.settingsGroup).toBe('data');
    expect(backup.act).toBeNull();
  });

  it('the listen stops press the Listen pill on Next; the letters stop navigates', () => {
    expect(TOUR_STEPS.find((s) => s.id === 'listen').act).toBe('press');
    expect(TOUR_STEPS.find((s) => s.id === 'bible').act).toBe('press');
    expect(TOUR_STEPS.find((s) => s.id === 'letters').act).toBe('openLetter');
  });

  /* Corbin, 2026-09-10: "Make sure the introductory tutorial has a thing for highlighting text
     if it doesn't already." It did not — the closing card mentioned it in a sentence, which is a
     mention and not a stop. This stop rides the letter screen the Listen stop already opened, so
     it costs the reader no navigation, and it rings a real paragraph of the letter rather than a
     control: the thing being taught is the text itself. */
  it('the highlight stop rings a paragraph of the letter already open, and adds no navigation', () => {
    const hl = TOUR_STEPS.find((s) => s.id === 'highlight');
    const listen = TOUR_STEPS.find((s) => s.id === 'listen');
    expect(hl.screen).toBe('vot-one-letter');
    expect(hl.screen).toBe(listen.screen);
    expect(hl.enter).toBe('openLetter');
    expect(hl.enter).toBe(listen.enter);
    expect(hl.target.selector).toBe('.letter-para');
    expect(hl.target.text).toBeUndefined();
    expect(hl.act).toBe('highlightDemo');
    expect(hl.after).toBeTruthy();
    expect(hl.tip).toBeTruthy();
  });

  /* The tour teaches the two words the real bar shows, so the reader recognises them when it
     appears under their own finger. TOUR_WORDS is the trailer's vocabulary; these join it. */
  it("names the bar's own two words, in the copy and in TOUR_WORDS", () => {
    const hl = TOUR_STEPS.find((s) => s.id === 'highlight');
    expect(hl.text).toContain('Highlight');
    expect(hl.text).toContain('Note');
    expect(TOUR_WORDS).toContain('Highlight');
    expect(TOUR_WORDS).toContain('Note');
  });

  /* Corbin, 2026-09-11: "add the scripture web button back to the home screen … and add a stop
     about it to the tutorial … both the trailer and the tutorial should mention both halves of
     the scripture web." The stop follows the Bible stop — the reader has just watched verses
     light up; the next thing is every place one verse points to another — and it rings the Home
     shortcut the same ask restores, so `enter` is goHome (the Bible stop left the tour on
     bible-ch). Its three sentences are the trailer slide's own (Creative's cut 8 plan), so the
     app and the trailer agree, and they name BOTH halves by their on-screen names. */
  it('the scripture-web stop follows the Bible stop, returns Home, and rings the shortcut the ask restored', () => {
    const sw = TOUR_STEPS.find((s) => s.id === 'scripture-web');
    const bible = TOUR_STEPS.find((s) => s.id === 'bible');
    expect(TOUR_STEPS.indexOf(sw)).toBe(TOUR_STEPS.indexOf(bible) + 1);
    expect(sw.screen).toBe('home');
    expect(sw.enter).toBe('goHome');
    expect(sw.target).toEqual({ selector: '.home-shortcuts button', text: 'Scripture Web' });
    expect(sw.act).toBeNull();
    expect(sw.primary).toBe('Next');
  });

  it("the scripture-web stop says the trailer slide's three sentences and names both halves", () => {
    const sw = TOUR_STEPS.find((s) => s.id === 'scripture-web');
    expect(sw.title).toBe('See the Scriptures as a web');
    expect(sw.text).toBe('Every place one verse points to another is drawn as a thread. Scripture Web shows the whole Bible\'s threads. My Web holds the links you make yourself.');
    expect(sw.tip).toBe('Tap a thread to read both ends.');
    expect(TOUR_WORDS).toContain('Scripture Web');
    expect(TOUR_WORDS).toContain('My Web');
  });

  /* Corbin, 2026-09-10: "add to the tutorial a stop showing users they can toggle certain features
     on/off in settings." The stop rides the Settings screen the backup stop already opened (same
     `screen`, same `enter`, no navigation added), opens the Reading group and rings the dice row, and
     names three features by the words the reader sees on screen. It says nothing the closing card
     says, so 'done' stays the closing card. */
  it('the settings stop is the last teaching stop, on the screen the backup stop opened, and rings the dice row', () => {
    const st = TOUR_STEPS.find((s) => s.id === 'settings');
    const backup = TOUR_STEPS.find((s) => s.id === 'backup');
    expect(TOUR_STEPS.indexOf(st)).toBe(TOUR_STEPS.length - 2);
    expect(st.screen).toBe('settings');
    expect(st.screen).toBe(backup.screen);
    expect(st.enter).toBe(backup.enter);
    expect(st.settingsGroup).toBe('reading');
    expect(st.target.selector).toContain('[data-settings-group="reading"]');
    expect(st.target.text).toBe('Surprise Me');
    expect(st.act).toBeNull();
    expect(st.primary).toBe('Next');
  });

  it('the settings stop says the features can be switched on or off in Settings, and names three by their on-screen names', () => {
    const st = TOUR_STEPS.find((s) => s.id === 'settings');
    expect(st.title).toBe('Make it yours');
    expect(st.text).toMatch(/switched on or off/);
    expect(st.text).toContain('Settings');
    for (const name of ['Surprise Me', 'Reading Position Marker', 'Auto-Scroll']) expect(st.text, name).toContain(name);
  });

  /* Corbin, 2026-09-11: the stop should also say the reader can "control many UI features (like
     disabling search, history, other icons, etc) in settings". Named by the words Settings shows:
     the Search and History rows (Search, Tabs & History) and the icons of the top bar
     (Top-Nav Buttons — "Icons in the reading bar"). "UI" itself is on the banned list. */
  it('the settings stop also names Search, History and the top-bar icons as things that can be switched off', () => {
    const st = TOUR_STEPS.find((s) => s.id === 'settings');
    for (const name of ['Search', 'History']) expect(st.text, name).toMatch(new RegExp('(^|[^A-Za-z])' + name + '([^A-Za-z]|$)'));
    expect(st.text).toMatch(/icons/i);
    expect(bannedWord(st.text)).toBeNull();
    expect(st.text.split(/\s+/).length).toBeLessThan(60);
  });

  /* The closing card used to carry highlighting as a parting sentence. Now that it is a stop of
     its own, that sentence would teach it twice and the second time without showing anything.
     Asserted as ABSENCE plus a positive on the same string, so a card emptied by accident cannot
     satisfy this. */
  it('the closing card no longer teaches highlighting in a sentence', () => {
    const done = TOUR_STEPS.find((s) => s.id === 'done');
    expect(done.text).not.toMatch(/highlight/i);
    expect(done.text).toContain('Settings');
    expect(done.text).toContain('Enjoy your reading');
  });
});

describe('tour-steps — bounds', () => {
  it('nextIndex stops at the last stop, prevIndex at the first', () => {
    expect(nextIndex(0)).toBe(1);
    expect(nextIndex(9)).toBe(9);
    expect(prevIndex(0)).toBe(0);
    expect(prevIndex(3)).toBe(2);
  });
});

describe('tour-steps — words', () => {
  it('uses none of the words an older reader would have to decode', () => {
    for (const s of TOUR_STEPS) expect(bannedWord(s.title + ' ' + s.text), s.id).toBeNull();
    expect(bannedWord('Welcome to the onboarding')).toBe('onboarding');
    expect(bannedWord('tap the UI')).toBe('UI');
  });

  it("uses the trailer's phrases verbatim", () => {
    const all = TOUR_STEPS.map((s) => s.title + ' ' + s.text).join(' ');
    for (const w of ['Press Listen', 'The words light up as they are read', 'verse by verse', 'Journal', 'a backup', 'Export']) expect(all, w).toContain(w);
    expect(TOUR_WORDS).toContain('Press Listen');
  });
});

describe('tour-steps — findTarget', () => {
  it('returns the visible match, skipping a sibling parked off-screen by the pager', () => {
    document.body.innerHTML = '<button class="hero-play-pill" id="off">Listen</button><button class="hero-play-pill" id="on">Listen</button>';
    const off = document.getElementById('off'), on = document.getElementById('on');
    off.getBoundingClientRect = () => /** @type {any} */ ({ x: -331, y: 300, width: 94, height: 25, left: -331, right: -237, top: 300, bottom: 325 });
    on.getBoundingClientRect = () => /** @type {any} */ ({ x: 133, y: 271, width: 94, height: 25, left: 133, right: 227, top: 271, bottom: 296 });
    expect(findTarget({ target: { selector: '.hero-play-pill' } })).toBe(on);
  });

  it('matches by text when the step names one, so a reordered Home still finds the tile', () => {
    document.body.innerHTML = '<button class="home-nav-item">The Holy Bible</button><button class="home-nav-item">The Volumes of Truth</button>';
    for (const b of document.querySelectorAll('button')) b.getBoundingClientRect = () => /** @type {any} */ ({ x: 24, y: 263, width: 312, height: 87, left: 24, right: 336, top: 263, bottom: 350 });
    const el = findTarget({ target: { selector: '.home-nav-item', text: 'The Volumes of Truth' } });
    expect(el && el.textContent).toBe('The Volumes of Truth');
  });

  it('returns null when nothing matches or the step has no target', () => {
    expect(findTarget({ target: { selector: '.nope' } })).toBeNull();
    expect(findTarget({ target: null })).toBeNull();
  });
});

describe('the Listen stop seeks into the recording the tour actually opens', () => {
  it("the seek key names Volume One's letter that openLetter shows", () => {
    const listen = TOUR_STEPS.find((s) => s.id === 'listen');
    expect(listen.seekKey).toBe('one:' + TOUR_LETTER.id);
    expect(TOUR_STEPS.find((s) => s.id === 'bible').seekKey).toBeUndefined();
  });
});

