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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import {
  annVisible,
  annAbove,
  coveredSubRanges,
  renderSubRanges,
  HighlightableText,
  applyDOMHighlights,
} from './annotation-engine.jsx';

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
    };
    window.NoteStore = {
      _notes: {},
      get: (gid) => window.NoteStore._notes[gid] || null,
      subscribe: () => () => {},
      getVersion: () => 0,
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
});
