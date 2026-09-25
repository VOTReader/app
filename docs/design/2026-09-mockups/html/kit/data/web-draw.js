// Draw the real Scripture Web (OpenBible cross-references, CC-BY) as arches over the canon.
// Shared by web.html, web-thread.html and web-prophecy.html. mode: 'all' | 'thread' | 'prophecy'.
import { decodeGraph } from '../../../../../../app/src/main/assets/src/utils/scripture-web/decode.js';

const G = decodeGraph(window.SCRIPTURE_WEB_DATA);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export function verseIndex(bookIdx, chapter, verse) {
  const c = G.chapters.find(r => r[0] === bookIdx && r[1] === chapter);
  return c[2] + verse - 1;
}

export function draw(canvas, opts) {
  const { mode = 'all', top = 70, baseline = 330, left = 18, right = 18, sel = null, dim = 1 } = opts;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  const light = document.documentElement.dataset.theme === 'light';
  const span = W - left - right, total = G.total, maxH = baseline - top;
  const X = v => left + (v / total) * span;
  const ramp = light ? [[123, 45, 38], [150, 105, 40], [60, 92, 125]] : [[212, 175, 90], [201, 132, 143], [134, 169, 201]];
  const mix = (t) => {
    const [a, b, u] = t < 0.5 ? [ramp[0], ramp[1], t / 0.5] : [ramp[1], ramp[2], (t - 0.5) / 0.5];
    return a.map((c, i) => Math.round(c + (b[i] - c) * u));
  };
  ctx.globalCompositeOperation = 'source-over';
  const arch = (a, b) => {
    const x1 = X(a), x2 = X(b), s = Math.abs(b - a) / total;
    const h = Math.min(maxH, maxH * Math.pow(s, 0.55) * 1.02);
    ctx.beginPath(); ctx.moveTo(x1, baseline);
    ctx.bezierCurveTo(x1, baseline - h * 1.33, x2, baseline - h * 1.33, x2, baseline);
    return s;
  };
  // 'Essential' density: the 20+-vote threads carry the picture; everything else is a faint haze.
  const haze = (light ? 0.005 : 0.005) * dim, core = (light ? 0.032 : 0.04) * dim;
  for (const pass of [0, 1]) {
    ctx.lineWidth = pass ? 0.7 : 0.5;
    for (let i = 0; i < G.count; i++) {
      const strong = G.votes[i] >= 20;
      if (strong !== !!pass) continue;
      const a = G.from[i], b = G.to[i];
      const s = Math.abs(b - a) / total;
      const [r, g, bl] = mix(Math.min(1, s * 1.6));
      ctx.strokeStyle = `rgba(${r},${g},${bl},${pass ? core : haze})`;
      arch(a, b); ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  if (mode === 'prophecy') {
    ctx.lineWidth = 1.6; ctx.strokeStyle = css('--accent');
    for (const p of G.prophecy) { ctx.globalAlpha = 0.85; arch(p.a, p.b); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  if (sel) {
    ctx.lineWidth = 2.4; ctx.strokeStyle = css('--accent');
    ctx.shadowColor = css('--accent'); ctx.shadowBlur = light ? 0 : 10;
    arch(sel[0], sel[1]); ctx.stroke(); ctx.shadowBlur = 0;
    for (const v of sel) { ctx.beginPath(); ctx.arc(X(v), baseline, 3.6, 0, Math.PI * 2); ctx.fillStyle = css('--accent'); ctx.fill(); }
  }
  // chapter-length bars under the baseline
  ctx.fillStyle = css('--text-3');
  for (const c of G.chapters) {
    const x = X(c[2]), w = Math.max(0.6, (c[3] / total) * span - 0.4), h = Math.min(14, 2 + c[3] / 12);
    ctx.globalAlpha = 0.55; ctx.fillRect(x, baseline + 3, w, h);
  }
  ctx.globalAlpha = 1;
  // book labels where there is room
  ctx.font = `700 8.5px 'Atkinson Hyperlegible', sans-serif`; ctx.fillStyle = css('--text-3'); ctx.textAlign = 'center';
  let lastX = -99;
  G.books.forEach((bk, i) => {
    const end = i < 65 ? G.books[i + 1].start : total;
    const cx = X((bk.start + end) / 2), w = X(end) - X(bk.start);
    const lbl = bk.abbr.toUpperCase();
    const tw = ctx.measureText(lbl).width;
    if (cx - lastX > tw + 6) {
      ctx.fillText(lbl, cx, baseline + 30); lastX = cx;
    }
  });
  return { X, baseline };
}

export { G };
