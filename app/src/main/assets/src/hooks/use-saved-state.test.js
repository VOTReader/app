/* Q5.2 first real test — _validateTabState screen-coercion table.
   ─────────────────────────────────────────────────────────────────
   _validateTabState is the perfect test target: pure function, zero
   external deps (no React, no localStorage, no window), 13 rules that
   take a state object and rewrite stale `screen` values to safe defaults.

   The failure mode this catches: one rule is wrong (typo, wrong fallback,
   missing field check) and the app silently opens to a slightly-wrong
   screen on reload. No crash, no error log — just a quiet UX papercut
   nobody notices. Table-driven tests make every rule's intent explicit.

   Pattern: for each rule (13 total), test:
     • the TRIGGER case — input that matches the rule's condition;
       expect the screen rewritten to the documented target
     • the PASS-THROUGH case — input that doesn't match; expect the
       screen unchanged

   Note: _validateTabState MUTATES its input AND returns it. Tests
   call it with a fresh object each time so previous rules don't
   shadow this rule's input.
*/

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { _validateTabState, useSavedState } from './use-saved-state.js';

/** Run _validateTabState on a fresh copy of the input and return the result. */
function validate(/** @type {Record<string, any>} */ input) {
  return _validateTabState({ ...input });
}

describe('_validateTabState — 13 coercion rules', () => {
  // ── Rule 1: matthew-ch / bible-ch require chapterNum ─────────────
  describe('Rule 1: matthew-ch / bible-ch + no chapterNum → home', () => {
    it('coerces matthew-ch without chapterNum to home', () => {
      expect(validate({ screen: 'matthew-ch' }).screen).toBe('home');
      expect(validate({ screen: 'matthew-ch', chapterNum: null }).screen).toBe('home');
    });
    it('coerces bible-ch without chapterNum to home', () => {
      expect(validate({ screen: 'bible-ch' }).screen).toBe('home');
    });
    it('passes matthew-ch + chapterNum through unchanged', () => {
      expect(validate({ screen: 'matthew-ch', chapterNum: 1 }).screen).toBe('matthew-ch');
    });
    it('passes bible-ch + chapterNum through unchanged', () => {
      expect(validate({ screen: 'bible-ch', chapterNum: 5, bookId: 'genesis' }).screen).toBe('bible-ch');
    });
  });

  // ── Rule 2: vot-(legacy-volume)-letter require letterId ──────────
  describe('Rule 2: vot-X-letter (volumes one/three..seven/timothy/flock/rebuke) + no letterId → home', () => {
    const screens = [
      'vot-one-letter', 'vot-three-letter', 'vot-four-letter', 'vot-five-letter',
      'vot-six-letter', 'vot-seven-letter', 'vot-timothy-letter', 'vot-flock-letter',
      'vot-rebuke-letter',
    ];
    for (const screen of screens) {
      it(`coerces ${screen} without letterId to home`, () => {
        expect(validate({ screen }).screen).toBe('home');
      });
      it(`passes ${screen} + letterId through unchanged`, () => {
        expect(validate({ screen, letterId: 'the-wide-path' }).screen).toBe(screen);
      });
    }
  });

  // ── Rule 3: vot-letter (Volume Two) requires letterId ────────────
  describe('Rule 3: vot-letter (Volume Two) + no letterId → home', () => {
    it('coerces vot-letter without letterId to home', () => {
      expect(validate({ screen: 'vot-letter' }).screen).toBe('home');
    });
    it('passes vot-letter + letterId through', () => {
      expect(validate({ screen: 'vot-letter', letterId: 'x' }).screen).toBe('vot-letter');
    });
  });

  // ── Rule 4: hm-letter (Hidden Manna) requires letterId ───────────
  describe('Rule 4: hm-letter + no letterId → home', () => {
    it('coerces hm-letter without letterId to home', () => {
      expect(validate({ screen: 'hm-letter' }).screen).toBe('home');
    });
    it('passes hm-letter + letterId through', () => {
      expect(validate({ screen: 'hm-letter', letterId: 'woe-to-dallas' }).screen).toBe('hm-letter');
    });
  });

  // ── Rule 5: wtlb / blessed / holy-days entries require letterId ──
  describe('Rule 5: wtlb-one/two-entry / blessed-entry / holy-days-entry + no letterId → home', () => {
    const screens = ['wtlb-one-entry', 'wtlb-two-entry', 'blessed-entry', 'holy-days-entry'];
    for (const screen of screens) {
      it(`coerces ${screen} without letterId to home`, () => {
        expect(validate({ screen }).screen).toBe('home');
      });
      it(`passes ${screen} + letterId through unchanged`, () => {
        expect(validate({ screen, letterId: 'matters-of-the-heart' }).screen).toBe(screen);
      });
    }
  });

  // ── Rule 6: garden-view requires gardenPage ──────────────────────
  describe('Rule 6: garden-view + no gardenPage → home', () => {
    it('coerces garden-view without gardenPage to home', () => {
      expect(validate({ screen: 'garden-view' }).screen).toBe('home');
      expect(validate({ screen: 'garden-view', gardenPage: null }).screen).toBe('home');
    });
    it('passes garden-view + gardenPage through unchanged (including 0? — implementation uses != null)', () => {
      expect(validate({ screen: 'garden-view', gardenPage: 1 }).screen).toBe('garden-view');
      // gardenPage === 0 is non-null per `gardenPage == null` check, so passes
      expect(validate({ screen: 'garden-view', gardenPage: 0 }).screen).toBe('garden-view');
    });
  });

  // ── Rule 7: vot-X-index ALWAYS → volumes-home (unconditional) ────
  describe('Rule 7: vot-X-index → volumes-home (always; no field check)', () => {
    const indexScreens = [
      'vot-one-index', 'vot-three-index', 'vot-four-index', 'vot-five-index',
      'vot-six-index', 'vot-seven-index', 'vot-timothy-index', 'vot-flock-index',
      'vot-rebuke-index',
    ];
    for (const screen of indexScreens) {
      it(`coerces ${screen} to volumes-home unconditionally`, () => {
        expect(validate({ screen }).screen).toBe('volumes-home');
        // Even with all the fields, the index screens always coerce
        expect(validate({ screen, letterId: 'x', bookId: 'y' }).screen).toBe('volumes-home');
      });
    }
  });

  // ── Rule 8: matthew-idx / bible-idx require bookId ───────────────
  describe('Rule 8: matthew-idx / bible-idx + no bookId → home', () => {
    it('coerces matthew-idx without bookId to home', () => {
      expect(validate({ screen: 'matthew-idx' }).screen).toBe('home');
    });
    it('coerces bible-idx without bookId to home', () => {
      expect(validate({ screen: 'bible-idx' }).screen).toBe('home');
    });
    it('passes matthew-idx + bookId through unchanged', () => {
      expect(validate({ screen: 'matthew-idx', bookId: 'matthew' }).screen).toBe('matthew-idx');
    });
    it('passes bible-idx + bookId through unchanged', () => {
      expect(validate({ screen: 'bible-idx', bookId: 'genesis' }).screen).toBe('bible-idx');
    });
  });

  // ── Rule 9: search ALWAYS → home ─────────────────────────────────
  describe('Rule 9: search → home (always; search state isn\'t restored)', () => {
    it('coerces search to home unconditionally', () => {
      expect(validate({ screen: 'search' }).screen).toBe('home');
    });
  });

  // ── Rule 10: scripture-genre requires genreId ────────────────────
  describe('Rule 10: scripture-genre + no genreId → scriptures-home', () => {
    it('coerces scripture-genre without genreId to scriptures-home', () => {
      expect(validate({ screen: 'scripture-genre' }).screen).toBe('scriptures-home');
    });
    it('passes scripture-genre + genreId through unchanged', () => {
      expect(validate({ screen: 'scripture-genre', genreId: 'gospels' }).screen).toBe('scripture-genre');
    });
  });

  // ── Rule 11: bible-study-chapter requires studyId AND studyChapterId
  describe('Rule 11: bible-study-chapter + missing studyId or studyChapterId → studies-home', () => {
    it('coerces missing both to studies-home', () => {
      expect(validate({ screen: 'bible-study-chapter' }).screen).toBe('studies-home');
    });
    it('coerces missing studyChapterId to studies-home', () => {
      expect(validate({ screen: 'bible-study-chapter', studyId: 'matthew-study' }).screen).toBe('studies-home');
    });
    it('coerces missing studyId to studies-home', () => {
      expect(validate({ screen: 'bible-study-chapter', studyChapterId: 'ch-1' }).screen).toBe('studies-home');
    });
    it('passes complete bible-study-chapter through unchanged', () => {
      expect(validate({ screen: 'bible-study-chapter', studyId: 'matthew-study', studyChapterId: 'ch-1' }).screen).toBe('bible-study-chapter');
    });
  });

  // ── Rule 12: bible-study-index requires studyId ──────────────────
  describe('Rule 12: bible-study-index + no studyId → studies-home', () => {
    it('coerces bible-study-index without studyId to studies-home', () => {
      expect(validate({ screen: 'bible-study-index' }).screen).toBe('studies-home');
    });
    it('passes bible-study-index + studyId through unchanged', () => {
      expect(validate({ screen: 'bible-study-index', studyId: 'matthew-study' }).screen).toBe('bible-study-index');
    });
  });

  // ── Rule 13: journal-viewer/editor ALWAYS → journal-home ─────────
  describe('Rule 13: journal-viewer / journal-editor → journal-home (entryId lives in local state, not tab state)', () => {
    it('coerces journal-viewer to journal-home unconditionally', () => {
      expect(validate({ screen: 'journal-viewer' }).screen).toBe('journal-home');
      // Even with entryId set, the rule fires — the comment explains why
      expect(validate({ screen: 'journal-viewer', letterId: 'some-id' }).screen).toBe('journal-home');
    });
    it('coerces journal-editor to journal-home unconditionally', () => {
      expect(validate({ screen: 'journal-editor' }).screen).toBe('journal-home');
    });
  });

  // ── Pass-through cases ────────────────────────────────────────────
  describe('Valid screens pass through unchanged', () => {
    const validInputs = [
      { screen: 'home' },
      { screen: 'scriptures-home' },
      { screen: 'volumes-home' },
      { screen: 'studies-home' },
      { screen: 'journal-home' },
      { screen: 'library' },
      { screen: 'settings' },
      { screen: 'history' },
      { screen: 'notes-index' },
      { screen: 'bookmarks-index' },
      { screen: 'highlights-index' },
      { screen: 'links-index' },
      { screen: 'matthew-ch', chapterNum: 1 },
      { screen: 'bible-ch', chapterNum: 1, bookId: 'genesis' },
      { screen: 'vot-letter', letterId: 'x' },
      { screen: 'matthew-idx', bookId: 'matthew' },
      { screen: 'bible-idx', bookId: 'genesis' },
      { screen: 'scripture-genre', genreId: 'gospels' },
      { screen: 'bible-study-chapter', studyId: 's', studyChapterId: 'c' },
      { screen: 'bible-study-index', studyId: 's' },
      { screen: 'garden-view', gardenPage: 1 },
    ];
    for (const input of validInputs) {
      it(`passes ${JSON.stringify(input)} through unchanged`, () => {
        const out = validate(input);
        expect(out.screen).toBe(input.screen);
      });
    }
  });

  // ── Mutation contract ─────────────────────────────────────────────
  describe('mutation contract', () => {
    it('mutates the input object AND returns it (same reference)', () => {
      const input = { screen: 'search' };
      const output = _validateTabState(input);
      expect(output).toBe(input);            // same reference
      expect(input.screen).toBe('home');     // mutated in place
    });

    it('does not throw on minimal input (just screen)', () => {
      expect(() => _validateTabState({ screen: 'home' })).not.toThrow();
    });

    it('handles unknown screen strings — passes through unchanged', () => {
      // No rule matches → screen preserved verbatim. Defensive against
      // future screens added at the producer side before this function
      // is updated. (Tests guard the "default = passthrough" invariant.)
      expect(validate({ screen: 'some-new-screen' }).screen).toBe('some-new-screen');
    });
  });

  // ── Q5.6: FIELD PRESERVATION (silent write-loss guard) ───────────
  // The validator only touches `screen`. Every other field — bookId,
  // letterId, studyId, chapterNum, custom future fields — must survive
  // unchanged. A bug here is a silent data-loss: the user's saved
  // reading position dropped because the validator over-mutated.
  describe('field preservation when screen is coerced (silent write-loss guard)', () => {
    it('preserves bookId/letterId/chapterNum/etc when coercing matthew-ch → home', () => {
      // matthew-ch without chapterNum coerces to home. But the LETTER/
      // STUDY fields should still survive — they may be relevant to
      // future navigation. The validator must NOT drop them.
      const input = {
        screen: 'matthew-ch',
        chapterNum: null,
        bookId: 'matthew',
        letterId: 'the-wide-path',
        studyId: 'matthew-study',
        studyChapterId: 'mt-22',
        genreId: 'gospels',
      };
      const out = _validateTabState({ ...input });

      expect(out.screen).toBe('home');  // coerced
      expect(out.bookId).toBe('matthew');
      expect(out.letterId).toBe('the-wide-path');
      expect(out.studyId).toBe('matthew-study');
      expect(out.studyChapterId).toBe('mt-22');
      expect(out.genreId).toBe('gospels');
    });

    it('preserves unknown / custom fields (forward-compat)', () => {
      // The validator must not strip fields it doesn't recognize.
      // A producer that adds a new persisted field shouldn't lose it
      // just because the validator hasn't been updated yet.
      const input = /** @type {any} */ ({
        screen: 'search',  // → home
        customFutureField: 'preserve me',
        nestedObject: { value: 42 },
        anArray: [1, 2, 3],
      });
      const out = _validateTabState(input);

      expect(out.screen).toBe('home');
      expect(out.customFutureField).toBe('preserve me');
      expect(out.nestedObject).toEqual({ value: 42 });
      expect(out.anArray).toEqual([1, 2, 3]);
    });

    it('preserves tabs[] array when coercing top-level screen', () => {
      // useSavedState calls _validateTabState ONCE on the top-level
      // state, then loops s.tabs.forEach(_validateTabState) for each
      // tab. This test checks the top-level call doesn't disturb tabs[].
      const input = {
        screen: 'search',
        tabs: [
          { screen: 'home' },
          { screen: 'matthew-ch', chapterNum: 5, bookId: 'matthew' },
        ],
      };
      const out = _validateTabState({ ...input });

      expect(out.screen).toBe('home');
      expect(out.tabs).toEqual(input.tabs);  // tabs untouched
    });
  });

  // ── Q5.6: tabs[] processing (per-tab validation) ─────────────────
  describe('per-tab validation — every entry in s.tabs[] gets the same rules', () => {
    it('a tab with stale screen + no chapterNum is independently coerced', () => {
      // _validateTabState ITSELF doesn't recurse into tabs[] — that's
      // useSavedState's job (calls forEach). But the validator must
      // work correctly when called per-tab.
      const tab = { screen: 'bible-ch' };  // missing chapterNum
      const out = _validateTabState({ ...tab });
      expect(out.screen).toBe('home');
    });

    it('two tabs in the same array get independently validated', () => {
      const tabs = [
        { screen: 'matthew-ch', chapterNum: 1 },           // valid
        { screen: 'bible-ch' },                            // stale (no chapterNum)
        { screen: 'vot-one-index' },                       // always coerces
        { screen: 'journal-viewer', letterId: 'irrelevant' }, // always coerces
      ];

      const out = tabs.map(t => _validateTabState({ ...t }));

      expect(out[0].screen).toBe('matthew-ch');   // passed
      expect(out[1].screen).toBe('home');         // coerced
      expect(out[2].screen).toBe('volumes-home'); // coerced
      expect(out[3].screen).toBe('journal-home'); // coerced
    });
  });

  // ── Q5.6: useSavedState (the actual hook) ────────────────────────
  describe('useSavedState — load + validate localStorage[vot-state]', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('returns the parsed + validated state from localStorage on mount', () => {
      const persisted = {
        screen: 'home',
        theme: 'dark',
        tabs: [{ screen: 'home' }],
        settings: { keepScreenOn: true },
      };
      localStorage.setItem('vot-state', JSON.stringify(persisted));

      const { result } = renderHook(() => useSavedState());

      expect(result.current.screen).toBe('home');
      expect(result.current.theme).toBe('dark');
      expect(result.current.settings).toEqual({ keepScreenOn: true });
      expect(result.current.tabs).toEqual([{ screen: 'home' }]);
    });

    it('coerces stale screens at BOTH top-level AND inside tabs[]', () => {
      // The critical silent-loss case: a tab persisted with screen:
      // 'search' (unrestoreable) should be coerced to 'home', but
      // its OTHER fields must survive.
      const persisted = {
        screen: 'search',  // top-level stale
        bookId: 'genesis',
        tabs: [
          { screen: 'matthew-ch', chapterNum: 1 },                       // valid
          { screen: 'search', bookId: 'preserve-me' },                   // stale → home
          { screen: 'journal-viewer', letterId: 'preserve-me-too' },     // stale → journal-home
        ],
      };
      localStorage.setItem('vot-state', JSON.stringify(persisted));

      const { result } = renderHook(() => useSavedState());

      // Top-level coerced.
      expect(result.current.screen).toBe('home');
      expect(result.current.bookId).toBe('genesis');  // preserved

      // Per-tab coerced.
      expect(result.current.tabs[0].screen).toBe('matthew-ch');
      expect(result.current.tabs[1].screen).toBe('home');
      expect(result.current.tabs[1].bookId).toBe('preserve-me');     // preserved
      expect(result.current.tabs[2].screen).toBe('journal-home');
      expect(result.current.tabs[2].letterId).toBe('preserve-me-too'); // preserved
    });

    it('returns {} when localStorage is empty', () => {
      const { result } = renderHook(() => useSavedState());
      // _validateTabState gets called on {} — every rule checks
      // s.screen against specific strings, so undefined screen passes
      // all rules through unchanged.
      expect(result.current).toEqual({});
    });

    it('returns {} when localStorage[vot-state] is malformed JSON', () => {
      localStorage.setItem('vot-state', '{not valid json{{');

      const { result } = renderHook(() => useSavedState());

      expect(result.current).toEqual({});
    });

    it('does NOT throw when tabs is not an array (e.g. legacy data)', () => {
      localStorage.setItem('vot-state', JSON.stringify({
        screen: 'home',
        tabs: 'not-an-array',  // legacy data shape
      }));

      // The hook's `if (Array.isArray(s.tabs)) s.tabs.forEach(...)`
      // guard is what makes this safe — verify it works.
      expect(() => renderHook(() => useSavedState())).not.toThrow();
    });

    it('memoizes — calling useSavedState twice in one render returns the same object', () => {
      localStorage.setItem('vot-state', JSON.stringify({ screen: 'home' }));

      const { result, rerender } = renderHook(() => useSavedState());
      const firstResult = result.current;

      rerender();

      // useMemo with [] deps — same object reference across renders.
      expect(result.current).toBe(firstResult);
    });
  });
});
