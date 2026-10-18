// @ts-nocheck
/* My Web's colour law, pinned to its numbers (w3, the r2-05 picture; spec §4.2).
 * ═══════════════════════════════════════════════════════════════════════
 * w3 rewrote this file to the law's intent (digest §5, "My Web colour"): the
 * 2026-09-11 cool family of four hues 0.07 apart, brightest first, and the
 * gold / amber / coral warm one are retired by the w3 picture, which draws
 * Timothy's notes in ONE teal-silver family (sw-ink's myWeb* rows, a step of
 * lightness per source) and the reader's links in ONE gold (#E0B25A). What
 * the old pins protected is kept: the two families split on the axis every
 * colour deficiency keeps, the sources stay apart in lightness, the reader's
 * link reads at 4.5:1, a corridor at 3:1, the plateau and the 0.70 bound.
 * The oracle is the exported tables, never a retyped copy: WCAG luminance,
 * Lab b*, and the Machado 2009 severity-1.0 matrices are computed here from
 * MY_WEB_SOURCES / MY_WEB_LINK_KINDS, so a retune that breaks a step, a
 * family split or a contrast floor is red before anyone looks at a picture.
 * Alpha composites in sRGB space, as Canvas2D does.
 */
import { describe, it, expect } from 'vitest';
import {
  MY_WEB_SOURCES, MY_WEB_LINK_KINDS, CONTEXT_BINS, myWebSourceIndex, myWebLinkColor, LINK_KIND_NAMES,
} from './palette.js';
import { buildCuratedUnderlay, buildVotRail } from './personal-graph.js';
import { personalInk } from '../../ui/scripture-web/rail-renderer.js';
import { ink } from './sw-ink.js';

const rgb = (s) => s.split(',').map(Number);
const rgb255 = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const s2l = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const l2s = (v) => Math.round(255 * (Math.max(0, Math.min(1, v)) <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(0, Math.min(1, v)) ** (1 / 2.4) - 0.055));
const lum = (c) => 0.2126 * s2l(c[0]) + 0.7152 * s2l(c[1]) + 0.0722 * s2l(c[2]);
const onBlack = (c) => (lum(c) + 0.05) / 0.05;
const over = (c, a) => c.map((v) => Math.round(v * a));   // over #000, sRGB space
function labB(c) {
  const [r, g, b] = c.map(s2l);
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return 200 * (f(y) - f(z));
}
const CVD = {
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
const sim = (c, m) => { const l = c.map(s2l); return CVD[m].map((row) => l2s(row[0] * l[0] + row[1] * l[1] + row[2] * l[2])); };

const T = MY_WEB_SOURCES.map((s) => rgb(s.rgb));
const R = MY_WEB_LINK_KINDS.map((k) => rgb(k.rgb));

describe("Timothy's family: one teal-silver family, a lightness step per source", () => {
  it('four sources, one bin each, in storage-key order, each its own sw-ink row', () => {
    expect(MY_WEB_SOURCES.map((s) => s.key)).toEqual(['footnote', 'votNote', 'wtlb', 'study']);
    expect(CONTEXT_BINS).toBe(4);
    expect(MY_WEB_SOURCES.map((s) => s.rgb)).toEqual(
      ['myWebFootnote', 'myWebStudyNote', 'myWebWtlb', 'myWebStudy'].map((n) => rgb255(ink(n).hex).join(',')));
  });
  it('no two sources share a lightness: sorted, the steps are at least 0.025 in WCAG luminance', () => {
    const L = T.map(lum).sort((a, b) => b - a);
    for (let i = 1; i < L.length; i++) expect(L[i - 1] - L[i]).toBeGreaterThanOrEqual(0.025);
  });
  it('the families split on Lab b* under normal vision and all three deficiencies: every source cool, the reader warm, 14 apart', () => {
    for (const m of [null, 'deutan', 'protan', 'tritan']) {
      const tb = T.map((c) => labB(m ? sim(c, m) : c)), rb = R.map((c) => labB(m ? sim(c, m) : c));
      for (const b of tb) expect(b, `source ${m}`).toBeLessThan(0);
      for (const b of rb) expect(b, `link ${m}`).toBeGreaterThan(10);
      expect(Math.min(...rb) - Math.max(...tb), `gap ${m}`).toBeGreaterThanOrEqual(14);
    }
  });
  it('myWebSourceIndex maps the four kinds and sends an unknown kind to the studies bin', () => {
    expect(['footnote', 'votNote', 'wtlb', 'study'].map(myWebSourceIndex)).toEqual([0, 1, 2, 3]);
    expect(myWebSourceIndex('studyLetter')).toBe(3);
    expect(myWebSourceIndex(undefined)).toBe(3);
  });
});

describe("the reader's family: one gold, pin by shape", () => {
  it('three kinds, three names, three distinct pins, in the personal-graph order (within scripture, within the Volumes, across)', () => {
    expect(LINK_KIND_NAMES).toEqual(['Within scripture', 'Within the Volumes', 'Scripture ↔ Volumes']);
    expect(new Set(MY_WEB_LINK_KINDS.map((k) => k.pin)).size).toBe(3);
    expect(MY_WEB_LINK_KINDS.map((k) => k.pin)).toEqual(['ring', 'dot', 'ring-dot']);
    for (const k of [0, 1, 2]) expect(myWebLinkColor(k)).toBe('224,178,90');   // sw-ink myWebReader, #E0B25A
    expect(ink('myWebReader').hex).toBe('#E0B25A');
    expect(myWebLinkColor(7)).toBe(myWebLinkColor(2));
  });
  it('no reader hue is a Timothy hue', () => {
    for (const k of MY_WEB_LINK_KINDS) for (const s of MY_WEB_SOURCES) expect(k.rgb).not.toBe(s.rgb);
  });
});

describe('contrast on the black canvas (WCAG 1.4.11, 3:1 where a thread is meant to read alone; 4.5 for the reader link)', () => {
  it('a reader link at full ink clears 4.5:1 and selected clears more', () => {
    for (const c of R) {
      expect(onBlack(over(c, 0.95))).toBeGreaterThanOrEqual(4.5);
      expect(onBlack(c)).toBeGreaterThan(onBlack(over(c, 0.95)));
    }
  });
  it('a corridor at the overview (40 layers at the overview alpha) clears 3:1 for every source', () => {
    const a0 = personalInk(1).context.alpha;
    const coverage = 1 - Math.pow(1 - a0, 40);
    expect(coverage).toBeGreaterThan(0.79);
    for (const c of T) expect(onBlack(over(c, coverage))).toBeGreaterThanOrEqual(3);
  });
  it('a lone thread at depth sits on the 0.30 plateau (call 07, Corbin 2026-09-12): 1.4-1.9:1 per source, in the lightness order, and width carries the rest', () => {
    // The 3:1 that justified 0.70 is given up on Corbin's word ("brighter and brighter ... odd";
    // "a little clearer lines as you zoom in is fine"): at depth the ink stays at the plateau and the
    // stroke widens to 1.6 px. Recorded so the next reader knows the number was chosen, not missed.
    const top = personalInk(1e6).context.alpha;
    expect(top).toBeCloseTo(0.30, 3);
    const ratios = T.map((c) => onBlack(over(c, top)));
    for (const r of ratios) { expect(r).toBeGreaterThan(1.4); expect(r).toBeLessThan(1.9); }
    // the plateau keeps the lightness ladder: a brighter source reads brighter there too
    const byLum = T.map((c, i) => i).sort((a, b) => lum(T[b]) - lum(T[a]));
    for (let i = 1; i < byLum.length; i++) expect(ratios[byLum[i]]).toBeLessThan(ratios[byLum[i - 1]]);
    expect(personalInk(1e6).context.width).toBeCloseTo(1.6, 3);
  });
  it('the 0.70 bound keeps its property for the walk\'s knob: every source clears 3:1 there and the darkest did not at 0.45', () => {
    const bound = personalInk(1e6, 0.70).context.alpha;
    expect(bound).toBeCloseTo(0.70, 2);
    for (const c of T) expect(onBlack(over(c, bound)), `source ${c}`).toBeGreaterThanOrEqual(3);
    expect(onBlack(over(T[3], 0.45))).toBeLessThan(3);   // the studies, the darkest source
  });
  it('the brightest source at the bound stays under the reader’s gold at full ink', () => {
    const bound = personalInk(1e6, 0.70).context.alpha;
    const brightest = T.reduce((a, c) => (lum(c) > lum(a) ? c : a));
    expect(lum(over(brightest, bound))).toBeLessThan(lum(over(R[0], 0.95)));
  });
});

describe('buildCuratedUnderlay carries the source bin per edge', () => {
  it('kinds map to bins at build time; an edge with no verse is skipped as before', () => {
    const votRail = buildVotRail([{ volKey: 'one', label: 'Vol I', items: [{ id: 'a', title: 'A' }] },
      { volKey: 'study-s1', label: 'Study', items: [{ id: 'ch1', title: 'Ch 1' }] }]);
    const edges = [
      { v: 10, kind: 'footnote', volKey: 'one', letterId: 'a' },
      { v: 11, kind: 'votNote', volKey: 'one', letterId: 'a' },
      { v: 12, kind: 'wtlb', volKey: 'one', entryId: 'a' },
      { v: 13, kind: 'study', studyId: 's1', chapterId: 'ch1' },
      { kind: 'studyLetter', studyId: 's1', chapterId: 'ch1', volKey: 'one', letterId: 'a' },   // no v: skipped
    ];
    const u = buildCuratedUnderlay(edges, { votRail });
    expect(u.count).toBe(4);
    expect(Array.from(u.source)).toEqual([0, 1, 2, 3]);
    expect(u.source).toBeInstanceOf(Uint8Array);
  });
});
