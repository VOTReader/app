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
import { describe, it, expect, afterEach } from 'vitest';
import { TOUR_STEPS, stepCount, nextIndex, prevIndex, findTarget, bannedWord, TOUR_WORDS } from './tour-steps.js';

afterEach(() => { document.body.innerHTML = ''; });

describe('tour-steps — shape', () => {
  it('is a welcome card plus six numbered stops', () => {
    expect(stepCount()).toBe(7);
    expect(TOUR_STEPS[0].id).toBe('welcome');
    expect(TOUR_STEPS[0].number).toBe(0);
    expect(TOUR_STEPS.slice(1).map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(TOUR_STEPS[6].id).toBe('done');
  });

  it('every teaching stop points at a real control and knows how to get there', () => {
    for (const s of TOUR_STEPS.slice(1, 6)) {
      expect(s.target && s.target.selector, s.id).toBeTruthy();
      expect(s.screen, s.id).toBeTruthy();
      expect(typeof s.enter, s.id).toBe('string');
    }
    expect(TOUR_STEPS.map((s) => s.id)).toEqual(['welcome', 'letters', 'listen', 'bible', 'journal', 'backup', 'done']);
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
});

describe('tour-steps — bounds', () => {
  it('nextIndex stops at the last stop, prevIndex at the first', () => {
    expect(nextIndex(0)).toBe(1);
    expect(nextIndex(6)).toBe(6);
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
