/* RED for w-marker-icon — Corbin (2026-09-11): "The bookmark icon that replaced the
 * resume dot needs to be a different icon. You shouldn't have the same icon for two
 * different features."
 * ═══════════════════════════════════════════════════════════════════════
 * Two controls sit in the same top bar: the Reading Position Marker (ResumeReadingNavBtn,
 * "go back to where you were") and the chapter Bookmark button (ChapterBookmarkBtn, "keep
 * this chapter"). Since 2026-09-10 both draw a bookmark ribbon — one square-topped and
 * filled, one round-topped and outlined — and at 16 px on a phone that is one icon.
 *
 * The property is about SHAPE, not about the path string: the two `d` attributes already
 * differ today, so "different d" would be green on the very tree Corbin is looking at. This
 * file rasterises each glyph's SILHOUETTE on the 16 × 16 grid the phone draws it on (closed
 * subpaths filled, open subpaths stroked; the outline-vs-fill difference between the two
 * ribbons is deliberately erased, because it is what the eye erases) and measures their
 * overlap as intersection-over-union. Pre-registered: the two ribbons read ≥ 0.6 today; a
 * distinct glyph reads < 0.4. Two controls guard the instrument: the same bookmark path on
 * two sites must read 1.0 (the rasteriser sees sameness), and every mask must carry ink
 * (an empty glyph would pass the distinctness check for free).
 *
 * The rasteriser understands M/L/H/V/Z and their relative forms, and treats an elliptical
 * arc as a straight line to its endpoint (the bookmark's corners are 2 units on a 24 grid).
 * Anything else THROWS (every letter is tokenised, so an unknown command reaches the throw rather
 * than being dropped — verifier-2 found C/S/Q/T falling through as lineTo), so a future glyph the
 * instrument cannot read fails loudly instead of
 * reading as "distinct".
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ReadingDotContext, ResumeReadingNavBtn } from './ResumeReadingNavBtn.jsx';
import { ChapterBookmarkBtn } from './ChapterBookmarkBtn.jsx';
import { BookmarkIcon } from './BookmarkIcon.jsx';

const GRID = 16;   // the phone's 16 px glyph box
const DISTINCT_BELOW = 0.4;
const SAME_ABOVE = 0.6;

/** Flatten one SVG path `d` into subpaths: [{ points:[[x,y]...], closed }]. */
function flatten(d) {
  // EVERY letter is a token, so a command the switch does not handle reaches its throw. A
  // class listing only the handled letters dropped C/S/Q/T silently (verifier-2, 09-11).
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  const subs = [];
  let cur = null, x = 0, y = 0, sx = 0, sy = 0, cmd = null, i = 0;
  const num = () => { const t = tokens[i++]; if (t === undefined || /[A-Za-z]/.test(t)) throw new Error('path: number expected in ' + d); return parseFloat(t); };
  const start = (nx, ny) => { cur = { points: [[nx, ny]], closed: false }; subs.push(cur); x = sx = nx; y = sy = ny; };
  const lineTo = (nx, ny) => { if (!cur) start(nx, ny); else { cur.points.push([nx, ny]); x = nx; y = ny; } };
  while (i < tokens.length) {
    const t = tokens[i];
    if (/[A-Za-z]/.test(t)) { cmd = t; i++; if (cmd === 'Z' || cmd === 'z') { if (cur) cur.closed = true; x = sx; y = sy; cur = null; } continue; }
    switch (cmd) {
      case 'M': { const nx = num(), ny = num(); start(nx, ny); cmd = 'L'; break; }
      case 'm': { const nx = x + num(), ny = y + num(); start(nx, ny); cmd = 'l'; break; }
      case 'L': lineTo(num(), num()); break;
      case 'l': { const dx = num(), dy = num(); lineTo(x + dx, y + dy); break; }
      case 'H': lineTo(num(), y); break;
      case 'h': lineTo(x + num(), y); break;
      case 'V': lineTo(x, num()); break;
      case 'v': lineTo(x, y + num()); break;
      case 'A': { num(); num(); num(); num(); num(); lineTo(num(), num()); break; }
      case 'a': { num(); num(); num(); num(); num(); const dx = num(), dy = num(); lineTo(x + dx, y + dy); break; }
      default: throw new Error('path: unsupported command ' + cmd + ' in ' + d);
    }
  }
  return subs;
}

const inside = (pts, px, py) => {      // even-odd point-in-polygon
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const segDist = (px, py, ax, ay, bx, by) => {
  const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L)) : 0;
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
};

/** The silhouette of an <svg> on a GRID×GRID grid as a Set of "x,y". */
function silhouette(svg) {
  const [vx0, vy0, vw, vh] = (svg.getAttribute('viewBox') || '0 0 24 24').split(/\s+/).map(Number);
  const mask = new Set();
  const paths = [...svg.querySelectorAll('path')];
  if (!paths.length) throw new Error('silhouette: the svg has no <path>');
  for (const p of paths) {
    const subs = flatten(p.getAttribute('d') || '');
    const sw = parseFloat(p.getAttribute('stroke-width') || svg.getAttribute('stroke-width') || '2');
    for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
      const px = vx0 + ((gx + 0.5) / GRID) * vw, py = vy0 + ((gy + 0.5) / GRID) * vh;
      for (const s of subs) {
        // A closed subpath is its FILLED region, whatever its stroke — the silhouette the eye
        // reads at 16 px; only an open subpath (a line) is its stroke.
        let ink = false;
        if (s.closed && s.points.length >= 3) ink = inside(s.points, px, py);
        else for (let k = 1; k < s.points.length && !ink; k++) ink = segDist(px, py, s.points[k - 1][0], s.points[k - 1][1], s.points[k][0], s.points[k][1]) <= Math.max(sw, 1.2) / 2;
        if (ink) { mask.add(gx + ',' + gy); break; }
      }
    }
  }
  return mask;
}
const iou = (a, b) => { let inter = 0; for (const k of a) if (b.has(k)) inter++; return inter / (a.size + b.size - inter); };

function markerSvg() {
  const { container } = render(
    <ReadingDotContext.Provider value={{ screen: 'home', enabled: true, onGo: vi.fn() }}>
      <ResumeReadingNavBtn />
    </ReadingDotContext.Provider>
  );
  const svg = container.querySelector('.reading-dot-nav svg');
  if (!svg) throw new Error('the Reading Position Marker did not render its svg — nothing below is about the glyph');
  return svg;
}
function navBookmarkSvg() {
  const { container } = render(<ChapterBookmarkBtn chapterBookmark={{ hlKey: 'bible:genesis:1', label: 'Genesis 1' }} />);
  const svg = container.querySelector('.nav-bookmark-btn svg');
  if (!svg) throw new Error('the chapter Bookmark button did not render its svg');
  return svg;
}
function inlineBookmarkSvg() {
  const { container } = render(<BookmarkIcon hlKey="bible:genesis:1:1" />);
  const svg = container.querySelector('.inline-bookmark-icon svg');
  if (!svg) throw new Error('the inline bookmark icon did not render its svg');
  return svg;
}

describe('the Reading Position Marker does not wear the Bookmark glyph', () => {
  beforeEach(() => {
    /** @type {any} */ (globalThis).LETTER_SCREEN_SET = new Set(['vot-letter', 'wtlb-entry']);
    /** @type {any} */ (globalThis).BookmarkStore = {
      subscribe: () => () => {}, getVersion: () => 1,
      getForKey: () => [], getForKeyPrefix: () => [{ id: 'b1' }],
    };
  });
  afterEach(() => {
    cleanup();
    delete (/** @type {any} */ (globalThis).LETTER_SCREEN_SET);
    delete (/** @type {any} */ (globalThis).BookmarkStore);
  });

  it('CONTROL — the instrument reads sameness: the bookmark path on its two sites overlaps 1.0, and every mask carries ink', () => {
    const a = silhouette(navBookmarkSvg()), b = silhouette(inlineBookmarkSvg()), m = silhouette(markerSvg());
    expect(iou(a, b), 'nav bookmark vs inline bookmark (same path)').toBe(1);
    for (const [name, mask] of /** @type {[string, Set<string>][]} */ ([['nav bookmark', a], ['inline bookmark', b], ['marker', m]])) {
      expect(mask.size, name + ' ink cells of ' + GRID * GRID).toBeGreaterThanOrEqual(0.08 * GRID * GRID);
    }
  });

  it('the marker and the top-bar Bookmark button are distinct at 16 px — silhouette IoU below ' + DISTINCT_BELOW + ' (two ribbons today)', () => {
    const marker = silhouette(markerSvg()), bookmark = silhouette(navBookmarkSvg());
    const overlap = iou(marker, bookmark);
    expect(overlap, 'marker vs bookmark silhouette IoU = ' + overlap.toFixed(3)).toBeLessThan(DISTINCT_BELOW);
  });

  it('CONTROL — putting the ribbon back reads as the same icon: the pre-fix marker path against the bookmark is above ' + SAME_ABOVE, () => {
    /* The path the marker carried from 2026-09-10 until this branch (a square-topped filled
       ribbon). Rendered here as a bare svg so this stays true after the fix: it is the
       instrument's positive control for "same icon", the reading Corbin gave the old pair. */
    const host = document.createElement('div');
    host.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12v18l-6-4.5L6 21z" /></svg>';
    const oldRibbon = silhouette(host.querySelector('svg'));
    const overlap = iou(oldRibbon, silhouette(navBookmarkSvg()));
    expect(overlap, 'old ribbon vs bookmark IoU = ' + overlap.toFixed(3)).toBeGreaterThan(SAME_ABOVE);
  });

  it('CONTROL — a command the rasteriser does not know THROWS instead of flattening: a cubic (C) path', () => {
    // verifier-2, 09-11: the tokenizer's class admitted only the letters the switch handles, so
    // `C`/`S`/`Q`/`T` were dropped and their numbers fell through as implicit lineTo — this path
    // silhouetted as a polyline through its control points and passed as "distinct" with nothing
    // saying so. Red on that tokenizer (it returned a shape); green once every letter reaches the
    // switch and the unknown ones hit its throw.
    expect(() => flatten('M2 12C6 2 18 2 22 12')).toThrow(/unsupported command C/);
    expect(() => flatten('M2 12S6 2 22 12')).toThrow(/unsupported command S/);
    expect(() => flatten('M2 12Q12 2 22 12')).toThrow(/unsupported command Q/);
    expect(() => flatten('M2 12T22 12')).toThrow(/unsupported command T/);
  });
});
