/* Overlap precedence — annotation-engine.
   ─────────────────────────────────────────────────────────────────
   When annotations overlap, the most-recent VISIBLE one wins in the
   overlap slice (clean override, NO alpha blend), the older one stays
   stored + painted everywhere it isn't overridden, and a note's icon
   marker survives even where its highlight is fully covered. A BLANK
   annotation has no paint to win with, so it never suppresses a color
   beneath it (blank is transparent — the layer below shows).

   Covered: the pure helpers (annVisible / annAbove / coveredSubRanges /
   renderSubRanges) + BOTH render paths (HighlightableText React sweep-line
   and applyDOMHighlights imperative DOM). renderer/ is outside the coverage-
   measured scope, so these are assertion-only (no coverage-floor effect). */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import {
  annVisible,
  annAbove,
  coveredSubRanges,
  renderSubRanges,
  HighlightableText,
  applyDOMHighlights,
  annDomSig,
  snapRangeToWords,
} from './annotation-engine.jsx';
import { AnnotationStore } from '../stores/annotation-store.js';
import { NoteStore } from '../stores/note-store.js';

describe('snapRangeToWords (A2)', () => {
  it('walks start left out of the middle of a word', () => {
    // "hello world", start mid-"world" → snaps to the word boundary (index 6)
    expect(snapRangeToWords('hello world', 8, 11).start).toBe(6);
  });
  it('treats a STRAIGHT ASCII apostrophe as a word char (A2 fix)', () => {
    // "don't" with ASCII '. Start mid-word must walk left THROUGH the apostrophe
    // to the word start, not stop at it. start=4 ('t') → 0.
    expect(snapRangeToWords("don't stop", 4, 5).start).toBe(0);
  });
  it('treats the typographic apostrophe U+2019 as a word char too', () => {
    expect(snapRangeToWords('don’t stop', 4, 5).start).toBe(0);
  });
  it('leaves a start already at a boundary untouched', () => {
    expect(snapRangeToWords('hello world', 6, 11).start).toBe(6);
  });
  it('clamps out-of-range offsets', () => {
    expect(snapRangeToWords('abc', -5, 99)).toEqual({ start: 0, end: 3 });
  });
  it('ANN-2: backs start off a lone trailing surrogate (no mid-emoji split)', () => {
    // 'ab😀cd' — the emoji is a surrogate PAIR at indices 2-3. A start of 3 (the low
    // surrogate) would splitText mid-glyph; it must back up to the codepoint boundary.
    const r = snapRangeToWords('ab😀cd', 3, 5);
    expect(r.start).toBe(2);
    const cc = 'ab😀cd'.charCodeAt(r.start);
    expect(cc >= 0xDC00 && cc <= 0xDFFF).toBe(false); // no longer a trailing surrogate
  });
});

/** Minimal annotation factory. */
const ann = (o) => ({
  id: o.id,
  groupId: o.groupId || o.id,
  kind: o.kind || 'highlight',
  color: o.color,
  start: o.start,
  end: o.end,
  created: o.created || 0,
  text: o.text || '',
});

// ── Pure helper: annVisible ────────────────────────────────────
describe('annVisible', () => {
  it('a colored highlight is visible', () => {
    expect(annVisible(ann({ id: 'a', color: 'yellow', start: 0, end: 3 }))).toBe(true);
  });
  it('a blank highlight is NOT visible', () => {
    expect(annVisible(ann({ id: 'a', color: 'blank', start: 0, end: 3 }))).toBe(false);
  });
  it('a legacy kind:note (aliases to blank) is NOT visible', () => {
    expect(annVisible(ann({ id: 'a', kind: 'note', color: 'yellow', start: 0, end: 3 }))).toBe(false);
  });
  it('a colored underline is visible', () => {
    expect(annVisible(ann({ id: 'a', kind: 'underline', color: 'blue', start: 0, end: 3 }))).toBe(true);
  });
  it('null/undefined is not visible', () => {
    expect(annVisible(null)).toBe(false);
    expect(annVisible(undefined)).toBe(false);
  });
});

// ── Pure helper: annAbove (recency order) ──────────────────────
describe('annAbove', () => {
  it('a more-recently created annotation is above an older one', () => {
    const newer = ann({ id: 'a', created: 200, start: 0, end: 1 });
    const older = ann({ id: 'b', created: 100, start: 0, end: 1 });
    expect(annAbove(newer, older)).toBe(true);
    expect(annAbove(older, newer)).toBe(false);
  });
  it('equal created falls back to a stable id tiebreak', () => {
    const z = ann({ id: 'z', created: 100, start: 0, end: 1 });
    const a = ann({ id: 'a', created: 100, start: 0, end: 1 });
    expect(annAbove(z, a)).toBe(true);
    expect(annAbove(a, z)).toBe(false);
  });
});

// ── Pure helper: coveredSubRanges ──────────────────────────────
describe('coveredSubRanges', () => {
  it('returns [] for a non-overlapped annotation', () => {
    const a = ann({ id: 'a', color: 'blue', start: 0, end: 10, created: 1 });
    expect(coveredSubRanges(a, [a])).toEqual([]);
  });
  it('a staggered older annotation is covered only where the newer visible one sits', () => {
    const blue = ann({ id: 'blue', color: 'blue', start: 5, end: 30, created: 1 });
    const yellow = ann({ id: 'yellow', color: 'yellow', start: 0, end: 12, created: 2 });
    expect(coveredSubRanges(blue, [blue, yellow])).toEqual([[5, 12]]);
    expect(coveredSubRanges(yellow, [blue, yellow])).toEqual([]); // nothing newer covers yellow
  });
  it('a newer BLANK annotation does NOT cover an older color (blank is transparent)', () => {
    const blue = ann({ id: 'blue', color: 'blue', start: 0, end: 10, created: 1 });
    const blank = ann({ id: 'blank', color: 'blank', start: 0, end: 5, created: 2 });
    expect(coveredSubRanges(blue, [blue, blank])).toEqual([]);
  });
  it('a blank annotation itself has nothing to suppress', () => {
    const blank = ann({ id: 'blank', color: 'blank', start: 0, end: 5, created: 2 });
    const blue = ann({ id: 'blue', color: 'blue', start: 0, end: 10, created: 1 });
    expect(coveredSubRanges(blank, [blank, blue])).toEqual([]);
  });
  it('an OLDER annotation never suppresses a newer one (recency, not position)', () => {
    const newer = ann({ id: 'n', color: 'yellow', start: 0, end: 10, created: 5 });
    const older = ann({ id: 'o', color: 'blue', start: 0, end: 10, created: 1 });
    expect(coveredSubRanges(newer, [newer, older])).toEqual([]);
  });
  it('merges overlapping newer ranges into one covered span', () => {
    const base = ann({ id: 'base', color: 'blue', start: 0, end: 20, created: 1 });
    const y1 = ann({ id: 'y1', color: 'yellow', start: 2, end: 8, created: 2 });
    const y2 = ann({ id: 'y2', color: 'pink', start: 6, end: 14, created: 3 });
    expect(coveredSubRanges(base, [base, y1, y2])).toEqual([[2, 14]]);
  });
});

// ── Pure helper: renderSubRanges ───────────────────────────────
describe('renderSubRanges', () => {
  it('a single full-paint range when there is no overlap', () => {
    const a = ann({ id: 'a', color: 'blue', start: 3, end: 9, created: 1 });
    expect(renderSubRanges(a, [a])).toEqual([{ s: 3, e: 9, suppress: false }]);
  });
  it('splits an older annotation into suppress + paint around a newer overlap', () => {
    const blue = ann({ id: 'blue', color: 'blue', start: 5, end: 30, created: 1 });
    const yellow = ann({ id: 'yellow', color: 'yellow', start: 0, end: 12, created: 2 });
    expect(renderSubRanges(blue, [blue, yellow])).toEqual([
      { s: 5, e: 12, suppress: true },
      { s: 12, e: 30, suppress: false },
    ]);
  });
  it('a fully-covered older annotation is entirely suppressed', () => {
    const blue = ann({ id: 'blue', color: 'blue', start: 0, end: 10, created: 1 });
    const yellow = ann({ id: 'yellow', color: 'yellow', start: 0, end: 10, created: 2 });
    expect(renderSubRanges(blue, [blue, yellow])).toEqual([{ s: 0, e: 10, suppress: true }]);
  });
});

// ── React path: HighlightableText ──────────────────────────────
describe('HighlightableText overlap precedence', () => {
  let store;
  beforeEach(() => {
    store = {};
    window.AnnotationStore = {
      get: (k) => store[k] || [],
      subscribe: () => () => {},
      getVersion: () => 0,
      getVersionForKey: () => 0,
    };
    window.NoteStore = {
      _notes: {},
      get: (gid) => window.NoteStore._notes[gid] || null,
      subscribe: () => () => {},
      getVersion: () => 0,
      getVersionForKey: () => 0,
    };
  });
  afterEach(() => {
    cleanup();
    delete window.AnnotationStore;
    delete window.NoteStore;
  });

  it('newest visible wins in the overlap; the older is suppressed to hl-blank there but still paints elsewhere', () => {
    store['k'] = [
      ann({ id: 'blue', color: 'blue', start: 0, end: 11, created: 1 }),
      ann({ id: 'yellow', color: 'yellow', start: 0, end: 5, created: 2 }),
    ];
    const { container } = render(<HighlightableText text="Hello world" hlKey="k" />);
    // Yellow (newest) paints in the [0,5] overlap.
    expect(container.querySelector('mark.hl-yellow[data-hl-id="yellow"]')).not.toBeNull();
    // Blue still paints in its non-overlapped [5,11] tail.
    expect(container.querySelector('mark.hl-blue[data-hl-id="blue"]')).not.toBeNull();
    // ...and is suppressed to hl-blank in the overlap (clean override, not a blend).
    expect(container.querySelector('mark.hl-blank[data-hl-id="blue"]')).not.toBeNull();
    // No single mark blends both colors.
    expect(container.querySelector('mark.hl-blue.hl-yellow')).toBeNull();
  });

  it('a note keeps its hl-note marker even where its highlight is fully covered', () => {
    window.NoteStore._notes['blue'] = { groupId: 'blue', text: 'memo' };
    store['k'] = [
      ann({ id: 'blue', color: 'blue', start: 0, end: 5, created: 1 }), // the note
      ann({ id: 'yellow', color: 'yellow', start: 0, end: 5, created: 2 }), // fully covers it
    ];
    const { container } = render(<HighlightableText text="Hello world" hlKey="k" />);
    const noteMark = container.querySelector('mark.hl-note[data-hl-id="blue"]');
    expect(noteMark).not.toBeNull();
    expect(noteMark.classList.contains('hl-blank')).toBe(true); // paint dropped
    expect(noteMark.classList.contains('hl-blue')).toBe(false);
    expect(container.querySelector('mark.hl-yellow[data-hl-id="yellow"]')).not.toBeNull();
  });

  it('a newer BLANK note does not suppress an older color (blank is transparent)', () => {
    window.NoteStore._notes['blanknote'] = { groupId: 'blanknote', text: 'memo' };
    store['k'] = [
      ann({ id: 'blue', color: 'blue', start: 0, end: 5, created: 1 }),
      ann({ id: 'blanknote', color: 'blank', start: 0, end: 5, created: 2 }),
    ];
    const { container } = render(<HighlightableText text="Hello world" hlKey="k" />);
    expect(container.querySelector('mark.hl-blue[data-hl-id="blue"]')).not.toBeNull();
  });
});

// ── DOM path: applyDOMHighlights ───────────────────────────────
describe('applyDOMHighlights overlap precedence', () => {
  let store;
  beforeEach(() => {
    store = {};
    window.AnnotationStore = { get: (k) => store[k] || [] };
    window.NoteStore = { _notes: {}, get: (gid) => window.NoteStore._notes[gid] || null };
  });
  afterEach(() => {
    document.body.innerHTML = '';
    delete window.AnnotationStore;
    delete window.NoteStore;
  });

  const setup = (text) => {
    document.body.innerHTML = '<span data-hl-key="k" data-hl-dom>' + text + '</span>';
    return document.querySelector('[data-hl-key="k"]');
  };

  it('newest visible wins cleanly in the overlap; older suppressed there, painted elsewhere; text intact', () => {
    store['k'] = [
      ann({ id: 'blue', color: 'blue', start: 0, end: 11, created: 1 }),
      ann({ id: 'yellow', color: 'yellow', start: 0, end: 5, created: 2 }),
    ];
    const c = setup('Hello world');
    applyDOMHighlights();
    expect(c.querySelector('mark.hl-yellow[data-hl-id="yellow"]')).not.toBeNull();
    expect(c.querySelector('mark.hl-blue[data-hl-id="blue"]')).not.toBeNull();
    expect(c.querySelector('mark.hl-blank[data-hl-id="blue"]')).not.toBeNull();
    expect(c.textContent).toBe('Hello world');
  });

  it('keeps the note marker (hl-note + first-segment) when the highlight is fully covered', () => {
    window.NoteStore._notes['blue'] = { groupId: 'blue', text: 'memo' };
    store['k'] = [
      ann({ id: 'blue', color: 'blue', start: 0, end: 5, created: 1 }),
      ann({ id: 'yellow', color: 'yellow', start: 0, end: 5, created: 2 }),
    ];
    const c = setup('Hello world');
    applyDOMHighlights();
    const noteMark = c.querySelector('mark.hl-note[data-hl-id="blue"]');
    expect(noteMark).not.toBeNull();
    expect(noteMark.classList.contains('hl-blank')).toBe(true);
    expect(noteMark.classList.contains('first-segment')).toBe(true);
  });

  it('leaves non-overlapping annotations untouched (one full-paint mark each, nothing suppressed)', () => {
    store['k'] = [
      ann({ id: 'a', color: 'yellow', start: 0, end: 5, created: 1 }),
      ann({ id: 'b', color: 'blue', start: 6, end: 11, created: 2 }),
    ];
    const c = setup('Hello world');
    applyDOMHighlights();
    expect(c.querySelectorAll('mark.hl-blank').length).toBe(0);
    expect(c.querySelector('mark.hl-yellow[data-hl-id="a"]')).not.toBeNull();
    expect(c.querySelector('mark.hl-blue[data-hl-id="b"]')).not.toBeNull();
  });

  // A7: the DOM path now clamps stored offsets to the current text length (and
  // drops empties) exactly like the React path, so a corpus edit that shortened
  // the text can't make the two paths diverge or leave a stray/oversize mark.
  it('A7: clamps an offset that runs past the end (no oversize mark, text intact)', () => {
    store['k'] = [ann({ id: 'over', color: 'yellow', start: 6, end: 999, created: 1 })];
    const c = setup('Hello world');
    applyDOMHighlights();
    const m = c.querySelector('mark.hl-yellow[data-hl-id="over"]');
    expect(m).not.toBeNull();
    expect(m.textContent).toBe('world');        // clamped to [6, 11]
    expect(c.textContent).toBe('Hello world');  // no duplication / loss
  });

  it('A7: drops an annotation whose range is entirely past the end', () => {
    store['k'] = [ann({ id: 'gone', color: 'blue', start: 50, end: 99, created: 1 })];
    const c = setup('Hello world');
    applyDOMHighlights();
    expect(c.querySelector('mark[data-hl-id="gone"]')).toBeNull(); // clamped→empty→dropped
    expect(c.textContent).toBe('Hello world');
  });
});

// ── DUAL-RENDER EQUIVALENCE (U11) ──────────────────────────────
/* The flagship invariant: the React sweep-line (HighlightableText) and the
   imperative DOM overlay (applyDOMHighlights) MUST produce VISUALLY EQUIVALENT
   annotation DOM — identical per-CHARACTER paint + tap-winner. (A3: NOT
   byte-identical structure — the two paths emit a different NUMBER of <mark>
   elements, e.g. 9 vs 7, because they split overlaps differently; signature()
   below checks only the rendered paint/tap result, which is what matters.)
   Until now every render-path test used exactly 2 annotations and asserted each
   path in isolation — "they're identical" was an untested claim. This
   parameterizes a 3+-overlap set through BOTH paths and asserts the per-CHARACTER
   signature is equal:

     { color: innermost-covering-mark's color class,
       id:    innermost-covering-mark's data-hl-id  (== the elementFromPoint
              tap winner — folds in the U19 tap-z-order sub-item),
       note:  any covering mark carries hl-note }

   Both paths nest oldest→outermost, newest→innermost, so the innermost mark
   at any char is the same annotation on both — this signature would DIVERGE
   the moment the two paths drift (the thing U8 must not break). */
describe('dual-render equivalence: HighlightableText ≡ applyDOMHighlights (U11)', () => {
  let store;
  beforeEach(() => {
    store = {};
    window.AnnotationStore = {
      get: (k) => store[k] || [],
      subscribe: () => () => {},
      getVersion: () => 0,
      getVersionForKey: () => 0,
    };
    window.NoteStore = {
      _notes: {},
      get: (gid) => window.NoteStore._notes[gid] || null,
      subscribe: () => () => {},
      getVersion: () => 0,
      getVersionForKey: () => 0,
    };
  });
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    delete window.AnnotationStore;
    delete window.NoteStore;
  });

  const COLOR_RX = /\bhl-(yellow|green|pink|red|orange|blue|purple|teal|brown|gray|cyan|blank)\b/;
  /** Per-character signature over a container's annotation DOM: the innermost
      covering mark's color + id, and whether any covering mark has a note. */
  const signature = (container) => {
    const out = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      const marks = [];
      let p = /** @type {any} */ (node.parentNode);
      while (p && p !== container) { if (p.tagName === 'MARK') marks.push(p); p = p.parentNode; }
      const inner = marks[0] || null;             // closest MARK ancestor = newest = painted = tap target
      const color = inner ? ((inner.className.match(COLOR_RX) || [])[0] || null) : null;
      const id = inner ? inner.getAttribute('data-hl-id') : null;
      const note = marks.some((m) => m.classList.contains('hl-note'));
      const t = node.nodeValue;
      for (let i = 0; i < t.length; i++) out.push({ color, id, note });
    }
    return out;
  };

  const renderReact = (text, hlKey) => {
    const { container } = render(<HighlightableText text={text} hlKey={hlKey} />);
    return container.querySelector('[data-hl-key="' + hlKey + '"]');
  };
  const renderDom = (text, hlKey) => {
    document.body.innerHTML = '<span id="domc" data-hl-key="' + hlKey + '" data-hl-dom>' + text + '</span>';
    const c = document.getElementById('domc');
    applyDOMHighlights();
    return c;
  };

  // text indices: H0 e1 l2 l3 o4 ,5 _6 w7 o8 r9 l10 d11 !12 _13 G14 o15 o16 d17 _18 d19 a20 y21 .22
  const TEXT = 'Hello, world! Good day.';

  const runScenario = (name, anns, noteGroups) => {
    it(name, () => {
      store['k'] = anns;
      window.NoteStore._notes = {};
      (noteGroups || []).forEach((g) => { window.NoteStore._notes[g] = { groupId: g, text: 'memo' }; });

      const reactC = renderReact(TEXT, 'k');
      const domC = renderDom(TEXT, 'k');

      // text is never lost or duplicated by either path
      expect(reactC.textContent).toBe(TEXT);
      expect(domC.textContent).toBe(TEXT);

      const sigReact = signature(reactC);
      const sigDom = signature(domC);
      expect(sigReact.length).toBe(TEXT.length);
      expect(sigDom.length).toBe(TEXT.length);
      // The whole point: per-character equivalence across both render paths.
      expect(sigReact).toEqual(sigDom);
    });
  };

  // The canonical 3-way staggered overlap.
  const A = ann({ id: 'A', color: 'yellow', start: 0,  end: 20, created: 1 });
  const B = ann({ id: 'B', color: 'blue',   start: 5,  end: 15, created: 2 });
  const C = ann({ id: 'C', color: 'pink',   start: 8,  end: 12, created: 3 });
  // A 4th, OLDEST annotation fully covered by the triple stack — carries a note.
  const N = ann({ id: 'N', color: 'green',  start: 8,  end: 12, created: 0 });
  // A mixed-kind variant (underline) to prove kind-class parity too.
  const U = ann({ id: 'U', kind: 'underline', color: 'red', start: 3, end: 18, created: 4 });

  runScenario('3-way color overlap', [A, B, C]);
  runScenario('3-way + a note on a fully-covered annotation', [A, B, C, N], ['N']);
  runScenario('overlap with a noted, non-covered top annotation', [A, B, C], ['C']);
  runScenario('4-way overlap mixing an underline kind', [A, B, C, U]);
  runScenario('staggered overlap with a blank (transparent) newest', [
    A, B, ann({ id: 'BL', color: 'blank', start: 8, end: 12, created: 9 }),
  ]);

  it('the triple-overlap centre [8,12] resolves to the SAME tap winner (C) on both paths', () => {
    store['k'] = [A, B, C];
    const sigReact = signature(renderReact(TEXT, 'k'));
    const sigDom = signature(renderDom(TEXT, 'k'));
    // char 8..11 are the triple overlap; newest (C) is the innermost = the
    // elementFromPoint tap target on BOTH render paths (U19 z-order fold-in).
    for (let i = 8; i < 12; i++) {
      expect(sigReact[i].id).toBe('C');
      expect(sigDom[i].id).toBe('C');
      expect(sigReact[i].color).toBe('hl-pink');
      expect(sigDom[i].color).toBe('hl-pink');
    }
  });
});

// ── F1+F2: keyed re-render fan-out (the 176→1 regression lock) ──
describe('HighlightableText — F1+F2 keyed re-render fan-out', () => {
  beforeEach(() => {
    AnnotationStore._resetForTests({ forceLoaded: true });
    NoteStore._resetForTests({ forceLoaded: true });
    /** @type {any} */ (window).AnnotationStore = AnnotationStore;
    /** @type {any} */ (window).NoteStore = NoteStore;
  });
  afterEach(() => {
    cleanup();
    AnnotationStore._resetForTests({ forceLoaded: true });
    NoteStore._resetForTests({ forceLoaded: true });
    delete (/** @type {any} */ (window)).AnnotationStore;
    delete (/** @type {any} */ (window)).NoteStore;
  });

  // HighlightableText calls AnnotationStore.get(hlKey) once per render, so a
  // re-render is observable as a fresh get(key). getSnapshot reads
  // getVersionForKey (not get), so only real RE-RENDERS land in the spy.
  it('adding an annotation to one verse re-renders ONLY that verse, not its sibling', () => {
    render(
      <div>
        <HighlightableText text="alpha alpha" hlKey="k:A" />
        <HighlightableText text="beta beta" hlKey="k:B" />
      </div>
    );
    const getSpy = vi.spyOn(AnnotationStore, 'get');
    act(() => { AnnotationStore.add('k:A', { id: 'x1', start: 0, end: 5 }); });
    const reRead = getSpy.mock.calls.map((c) => c[0]);
    expect(reRead).toContain('k:A');     // the edited verse re-rendered
    expect(reRead).not.toContain('k:B'); // the sibling did NOT (was all-verses on the old global counter)
    getSpy.mockRestore();
  });

  it('a cross-key replaceAll re-renders EVERY verse (bulk-op correctness)', () => {
    render(
      <div>
        <HighlightableText text="alpha alpha" hlKey="k:A" />
        <HighlightableText text="beta beta" hlKey="k:B" />
      </div>
    );
    const getSpy = vi.spyOn(AnnotationStore, 'get');
    act(() => {
      AnnotationStore.replaceAll({
        'k:A': [{ id: 'y1', groupId: 'y1', kind: 'highlight', color: 'yellow', start: 0, end: 5, text: 'alpha', created: 1, updated: 1 }],
      });
    });
    const reRead = getSpy.mock.calls.map((c) => c[0]);
    expect(reRead).toContain('k:A');
    expect(reRead).toContain('k:B'); // bulk op bumps _crossKeyVersion → both re-render
    getSpy.mockRestore();
  });
});

// ── A1+A5: inline note icon on the React verse path ──
describe('HighlightableText — A1+A5 inline note icon', () => {
  beforeEach(() => {
    /** @type {any} */ (window).AnnotationStore = {
      get: (k) => (k === 'k:v' ? [{ id: 'a1', groupId: 'g1', kind: 'highlight', color: 'yellow', start: 0, end: 5 }] : []),
      subscribe: () => () => {},
      getVersion: () => 0,
      getVersionForKey: () => 0,
    };
    /** @type {any} */ (window).NoteStore = {
      _notes: { g1: { groupId: 'g1', body: 'a note' } },
      get: (gid) => window.NoteStore._notes[gid] || null,
      subscribe: () => () => {},
      getVersion: () => 0,
      getVersionForKey: () => 0,
    };
  });
  afterEach(() => {
    cleanup();
    delete (/** @type {any} */ (window)).AnnotationStore;
    delete (/** @type {any} */ (window)).NoteStore;
  });

  it('renders the note icon INLINE, immediately after the highlighted phrase', () => {
    const { container } = render(<HighlightableText text="hello world" hlKey="k:v" />);
    const icon = container.querySelector('.hl-note-icon');
    const mark = container.querySelector('mark.hl-note');
    expect(icon).not.toBeNull();
    expect(mark).not.toBeNull();
    expect(icon.getAttribute('data-group-id')).toBe('g1');
    // phrase-end, not verse-end: the icon is the mark's very next sibling, with
    // the rest of the verse (" world") following it.
    expect(mark.nextElementSibling).toBe(icon);
    expect(container.textContent).toContain('world');
  });

  it('renders NO icon when the group has no NoteStore entry', () => {
    /** @type {any} */ (window).NoteStore._notes = {};
    const { container } = render(<HighlightableText text="hello world" hlKey="k:v" />);
    expect(container.querySelector('.hl-note-icon')).toBeNull();
    // ...but the highlight mark itself still renders.
    expect(container.querySelector('mark')).not.toBeNull();
  });

  it('clicking the icon opens the note', () => {
    const opened = [];
    /** @type {any} */ (window).__openNote = (gid) => opened.push(gid);
    const { container } = render(<HighlightableText text="hello world" hlKey="k:v" />);
    fireEvent.click(container.querySelector('.hl-note-icon'));
    expect(opened).toEqual(['g1']);
    delete (/** @type {any} */ (window)).__openNote;
  });
});

// ── A4: per-container signature scopes the re-apply ──
describe('applyDOMHighlights — A4 signature skip', () => {
  let store;
  beforeEach(() => {
    store = {};
    window.AnnotationStore = { get: (k) => store[k] || [] };
    window.NoteStore = { _notes: {}, get: (gid) => window.NoteStore._notes[gid] || null };
  });
  afterEach(() => {
    document.body.innerHTML = '';
    delete window.AnnotationStore;
    delete window.NoteStore;
  });
  const setup = (text) => {
    document.body.innerHTML = '<span data-hl-key="k" data-hl-dom>' + text + '</span>';
    return document.querySelector('[data-hl-key="k"]');
  };

  it('annDomSig folds the DOM-affecting fields; empty → "", changes on any field', () => {
    expect(annDomSig([])).toBe('');
    const a = [ann({ id: 'x', color: 'yellow', start: 0, end: 5, created: 1 })];
    expect(annDomSig(a)).toBe(annDomSig(a.slice()));               // deterministic
    expect(annDomSig(a)).not.toBe(annDomSig([ann({ id: 'x', color: 'blue', start: 0, end: 5, created: 1 })]));   // color
    expect(annDomSig(a)).not.toBe(annDomSig([ann({ id: 'x', color: 'yellow', start: 0, end: 6, created: 1 })])); // end
  });

  it('a re-apply with the SAME annotations skips (does not re-create the marks)', () => {
    store['k'] = [ann({ id: 'a', color: 'yellow', start: 0, end: 5, created: 1 })];
    const c = setup('Hello world');
    applyDOMHighlights();
    const mark = c.querySelector('mark.hl-yellow[data-hl-id="a"]');
    expect(mark).not.toBeNull();
    expect(c.getAttribute('data-hl-sig')).not.toBe('');
    mark.setAttribute('data-sentinel', '1'); // a re-process would replace this node
    applyDOMHighlights();                     // unchanged anns → skip
    expect(c.querySelector('mark[data-hl-id="a"]').getAttribute('data-sentinel')).toBe('1');
  });

  it('a re-apply after an annotation CHANGE re-processes (sentinel gone, new paint)', () => {
    store['k'] = [ann({ id: 'a', color: 'yellow', start: 0, end: 5, created: 1 })];
    const c = setup('Hello world');
    applyDOMHighlights();
    c.querySelector('mark[data-hl-id="a"]').setAttribute('data-sentinel', '1');
    store['k'] = [ann({ id: 'a', color: 'blue', start: 0, end: 5, created: 1 })]; // recolor → sig changes
    applyDOMHighlights();
    const m = c.querySelector('mark[data-hl-id="a"]');
    expect(m.classList.contains('hl-blue')).toBe(true);
    expect(m.getAttribute('data-sentinel')).toBeNull();
  });

  it('a re-apply after a NOTE is toggled on the group re-processes (hl-note appears)', () => {
    store['k'] = [ann({ id: 'a', color: 'yellow', groupId: 'g', start: 0, end: 5, created: 1 })];
    const c = setup('Hello world');
    applyDOMHighlights();
    expect(c.querySelector('mark.hl-note')).toBeNull();
    window.NoteStore._notes['g'] = { groupId: 'g', text: 'memo' }; // note-ness → sig changes
    applyDOMHighlights();
    expect(c.querySelector('mark.hl-note[data-hl-id="a"]')).not.toBeNull();
  });

  it('clearing the annotations re-processes once (marks removed), then skips', () => {
    store['k'] = [ann({ id: 'a', color: 'yellow', start: 0, end: 5, created: 1 })];
    const c = setup('Hello world');
    applyDOMHighlights();
    expect(c.querySelector('mark.hl-dom')).not.toBeNull();
    store['k'] = [];                       // removed
    applyDOMHighlights();
    expect(c.querySelector('mark.hl-dom')).toBeNull();
    expect(c.getAttribute('data-hl-sig')).toBe('');
    expect(c.textContent).toBe('Hello world');
  });
});
