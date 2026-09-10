/* tour-steps — the tour's stops as data, and the little logic around them.
   ────────────────────────────────────────────────────────────────────
   RED first (review-tutorial, 2026-09-04). What these lock down:
     A) The shape: a welcome card, six numbered stops (the last one is the
        closing card), each with a title, plain text and — for the five
        teaching stops — a target on the real UI and a way to get there.
     B) Bounds: next/prev never run off either end.
     C) The words: no jargon an older reader has to decode, and the
        phrases the trailer uses (Creative, 2026-09-04) appear verbatim.
     D) findTarget picks the VISIBLE control, never the pager's inert
        off-screen sibling, and matches by text when the step says so.
*/
import { TOUR_LETTER } from '../hooks/use-tour.js';
import { describe, it, expect, afterEach } from 'vitest';
import { TOUR_STEPS, stepCount, nextIndex, prevIndex, findTarget, bannedWord, TOUR_WORDS } from './tour-steps.js';

afterEach(() => { document.body.innerHTML = ''; });

describe('tour-steps — shape', () => {
  it('is a welcome card plus seven numbered stops', () => {
    expect(stepCount()).toBe(8);
    expect(TOUR_STEPS[0].id).toBe('welcome');
    expect(TOUR_STEPS[0].number).toBe(0);
    expect(TOUR_STEPS.slice(1).map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(TOUR_STEPS[7].id).toBe('done');
  });

  it('every teaching stop points at a real control and knows how to get there', () => {
    for (const s of TOUR_STEPS.slice(1, 7)) {
      expect(s.target && s.target.selector, s.id).toBeTruthy();
      expect(s.screen, s.id).toBeTruthy();
      expect(typeof s.enter, s.id).toBe('string');
    }
    expect(TOUR_STEPS.map((s) => s.id)).toEqual(['welcome', 'letters', 'listen', 'highlight', 'bible', 'journal', 'backup', 'done']);
  });

  /* THE NUMBER IS WRITTEN TWICE — once as `number`, once inside the eyebrow's words — and
     nothing but this case makes the two agree. Adding a stop moved every eyebrow after it,
     and an eyebrow reading "3 of 6" on the fourth of eight stops is the kind of wrong that
     no other assertion here can see. Derived from the array, never hand-listed. */
  it('every eyebrow counts itself out of seven, and the welcome card says how many are coming', () => {
    const teaching = TOUR_STEPS.slice(1);
    for (const s of teaching) expect(s.eyebrow, s.id).toContain(`${s.number} of ${teaching.length}`);
    expect(TOUR_STEPS[0].text).toContain('seven stops');
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
    expect(nextIndex(7)).toBe(7);
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

