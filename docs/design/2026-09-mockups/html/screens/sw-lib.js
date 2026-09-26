// sw- area drawing. The canon overview is kit/data/web-draw.js's own draw(). What web-draw cannot
// draw (the web past the overview and its sky; My Web's two rails) is drawn here with the app's own
// laws, ported from src/utils/scripture-web/geometry.js, pick.js and src/ui/scripture-web/rail-renderer.js,
// in web-draw's colour ramp so every canvas reads as one system.
import { draw as webDraw, verseIndex, G } from '../kit/data/web-draw.js';
import { fansOf } from '../../../../../app/src/main/assets/src/utils/scripture-web/decode.js';
export { verseIndex, G };

const root = document.documentElement;
/* The web stays dark in both themes (KIT.md). A board follows the theme while its phones carry
   data-theme="dark", so a drawing takes the theme of the element it draws into, never the page's. */
export const themeOf = (el) => ((el && el.closest && el.closest('[data-theme]')) || root).getAttribute('data-theme');
export const isLight = (el) => themeOf(el) === 'light';
export const tok = (n, el) => getComputedStyle(el || root).getPropertyValue(n).trim();
export const done = () => { root.dataset.drawn = '1'; };
/** Run a drawing with the root set to the canvas's own theme: web-draw.js and the laws below read
 *  their tokens from the root. Synchronous, so the page never paints the swapped root. */
function inTheme(el, fn) {
  const want = themeOf(el), had = root.getAttribute('data-theme');
  if (!want || want === had) return fn();
  root.setAttribute('data-theme', want);
  try { return fn(); } finally { root.setAttribute('data-theme', had); }
}
export const drawOverview = (canvas, opts) => inTheme(canvas, () => webDraw(canvas, opts));
const RAMP_D = [[212, 175, 90], [201, 132, 143], [134, 169, 201]];
const RAMP_L = [[123, 45, 38], [150, 105, 40], [60, 92, 125]];
/** web-draw's three-stop ramp (near -> across the canon), t in 0..1 */
export function rampRGB(t) {
  const r = isLight() ? RAMP_L : RAMP_D;
  const u0 = Math.min(1, Math.max(0, t));
  const [a, b, u] = u0 < 0.5 ? [r[0], r[1], u0 / 0.5] : [r[1], r[2], (u0 - 0.5) / 0.5];
  return a.map((c, i) => Math.round(c + (b[i] - c) * u));
}
/** the app's distance law for a span: pow(span / total, 0.40) (web-renderer.js) */
export const spanT = (span) => Math.pow(Math.min(1, span / G.total), 0.40);

/* ── references ─────────────────────────────────────────────────────────── */
export function ref(v) {
  const ci = G.chapterOfVerse[v], ch = G.chapters[ci], b = G.books[ch[0]];
  const verse = v - ch[2] + 1;
  return { bookId: b.id, bookTitle: b.title, abbr: b.abbr, chapter: ch[1], verse, ci, label: `${b.title} ${ch[1]}:${verse}` };
}
export function vid(label) {
  const m = /^(.+) (\d+):(\d+)$/.exec(label);
  const bi = G.books.findIndex((b) => b.title === m[1]);
  return verseIndex(bi, +m[2], +m[3]);
}
export function chapterOf(bookTitle, n) {
  const bi = G.books.findIndex((b) => b.title === bookTitle);
  return G.chapters.findIndex((c) => c[0] === bi && c[1] === n);
}
export const chapterRange = (ci) => [G.chapters[ci][2], G.chapters[ci][2] + G.chapters[ci][3] - 1];
export const fmt = (n) => n.toLocaleString('en-US');

function hiDPI(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  return { ctx, W, H };
}

/* ── the overview: extra threads on web-draw's canvas, drawn with web-draw's own arch ── */
export function overviewArch(ctx, X, baseline, top, a, b) {
  const maxH = baseline - top, x1 = X(a), x2 = X(b), s = Math.abs(b - a) / G.total;
  const h = Math.min(maxH, maxH * Math.pow(s, 0.55) * 1.02);
  ctx.beginPath(); ctx.moveTo(x1, baseline);
  ctx.bezierCurveTo(x1, baseline - h * 1.33, x2, baseline - h * 1.33, x2, baseline);
}
/** a point on web-draw's arch at parameter u (0..1), for anchoring cards to a thread */
export function overviewPoint(X, baseline, top, a, b, u) {
  const maxH = baseline - top, x1 = X(a), x2 = X(b), s = Math.abs(b - a) / G.total;
  const h = Math.min(maxH, maxH * Math.pow(s, 0.55) * 1.02), cy = baseline - h * 1.33, v = 1 - u;
  return { x: v * v * v * x1 + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x2,
    y: v * v * v * baseline + 3 * v * v * u * cy + 3 * v * u * u * cy + u * u * u * baseline };
}
/** a set of threads over web-draw's overview in its own ink (a tapped chapter's whole web) */
export function overviewThreads(canvas, res, top, indices, o = {}) {
  return inTheme(canvas, () => {
    const ctx = canvas.getContext('2d');
    ctx.save(); ctx.lineWidth = o.width || 1;
    for (const i of indices) {
      const a = G.from[i], b = G.to[i], s = Math.abs(b - a) / G.total;
      const [r, g, bl] = rampRGB(Math.min(1, s * 1.6));
      ctx.strokeStyle = `rgba(${r},${g},${bl},${o.alpha || 0.55})`;
      overviewArch(ctx, res.X, res.baseline, top, a, b); ctx.stroke();
    }
    ctx.restore();
  });
}
export function touching(lo, hi, minVotes = 0) {
  const out = [];
  for (let i = 0; i < G.count; i++) { if (G.votes[i] < minVotes) continue; const a = G.from[i], b = G.to[i]; if ((a >= lo && a <= hi) || (b >= lo && b <= hi)) out.push(i); }
  return out;
}
export function findThread(aLabel, bLabel) {
  const a = vid(aLabel), b = vid(bLabel);
  for (let i = 0; i < G.count; i++) if ((G.from[i] === a && G.to[i] === b) || (G.from[i] === b && G.to[i] === a)) return i;
  return -1;
}
/** web-draw's selection look for any number of threads (its own `sel` takes one) */
export function highlight(canvas, res, top, pairs, o = {}) {
  return inTheme(canvas, () => {
    const ctx = canvas.getContext('2d');
    const acc = tok('--accent');
    ctx.save();
    ctx.lineWidth = o.width || 2.4; ctx.strokeStyle = acc; ctx.globalAlpha = o.alpha || 1;
    ctx.shadowColor = acc; ctx.shadowBlur = isLight() || o.noGlow ? 0 : 10;
    for (const [a, b] of pairs) { overviewArch(ctx, res.X, res.baseline, top, a, b); ctx.stroke(); }
    ctx.shadowBlur = 0; ctx.fillStyle = acc;
    if (o.dots !== false) for (const [a, b] of pairs) for (const v of [a, b]) { ctx.beginPath(); ctx.arc(res.X(v), res.baseline, 3.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  });
}
/** a chapter's span on the overview's baseline, marked in the accent (a tapped chapter or bundle) */
export function markRange(canvas, res, lo, hi, o = {}) {
  return inTheme(canvas, () => {
    const ctx = canvas.getContext('2d');
    ctx.save(); ctx.fillStyle = tok('--accent');
    const x0 = res.X(lo), x1 = Math.max(res.X(hi + 1), x0 + (o.min || 3));
    ctx.fillRect(x0, res.baseline - 1.5, x1 - x0, 3);
    ctx.restore();
  });
}

/* ── the web past the overview (geometry.js: the structure law, the lens, the sky) ── */
const LOCALIZE_START = 6, LOCALIZE_END = 24, FLYOVER_FLOOR = 0.35, FLYOVER_MARGIN = 24, LENS_CONTEXT = 0.35;
const ALPHA_DEEP = 0.90, DENSITY_K = 0.20, DENSITY_EXP = 0.57, STROKE_DEEP = 2.4, STROKE_MIN = 1.4;
export const ALTITUDE_MARKS = [
  { span: 30, name: 'a chapter' }, { span: 1000, name: 'a book' },
  { span: 15000, name: 'a testament' }, { span: 31102, name: 'the canon' },
];
const smooth = (e0, e1, x) => { let t = (x - e0) / (e1 - e0); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
function localizeFactor(z) {
  if (!(z > LOCALIZE_START)) return 0;
  const t = (Math.log2(z) - Math.log2(LOCALIZE_START)) / (Math.log2(LOCALIZE_END) - Math.log2(LOCALIZE_START));
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
let MAXSPAN = 0;
for (let i = 0; i < G.count; i++) { const s = Math.abs(G.to[i] - G.from[i]); if (s > MAXSPAN) MAXSPAN = s; }

/**
 * o: { camX (verse at the centre), ppv (CSS px a verse), camY (CSS px lifted), base (the ruler line, CSS y),
 *      inset (where the sky starts under the chrome), density, focus (thread index), labels, pills,
 *      altitude, elevator, lensMark }
 * Returns what was drawn, so the page can place its DOM around it.
 */
export const drawZoom = (canvas, o) => inTheme(canvas, () => zoomDraw(canvas, o));
function zoomDraw(canvas, o) {
  const { ctx, W, H } = hiDPI(canvas);
  const light = isLight();
  const base = o.base, camY = o.camY || 0, baseY = base + camY, inset = o.inset == null ? 72 : o.inset;
  const ceil = o.ceil || base - 14;
  const squash = Math.min(2.2, ceil / (W / 2));
  const ppv = o.ppv, camX = o.camX;
  const X = (v) => (v - camX) * ppv + W / 2;
  const zoom = ppv / (W / G.total);
  const localize = localizeFactor(zoom);
  const vm = smooth(0.55, 1, localize);
  const focusing = o.focus != null || !!o.focusRange;
  const lensCi = zoom >= LOCALIZE_START && !focusing ? G.chapterOfVerse[Math.floor(camX)] : -1;
  const inR = (v, r) => r && v >= r[0] && v <= r[1];
  const lens = lensCi >= 0 ? chapterRange(lensCi) : null;
  const inLens = (v) => lens && v >= lens[0] && v <= lens[1];
  const { fanA, fanB } = fansOf(G);
  const minVotes = o.density === 'essential' ? 20 : 0;
  const bg = tok('--bg'), acc = tok('--accent'), t2 = tok('--text-2'), t3 = tok('--text-3');
  const ink = light ? '58,37,16' : '235,231,222';

  // the style law (geometry.ribbonStyle), crowding counted over the anchored threads
  let anchored = 0;
  const fx = new Float32Array(G.count * 2);
  for (let i = 0; i < G.count; i++) {
    const x0 = X(G.from[i] + 0.5 + fanA[i]), x1 = X(G.to[i] + 0.5 + fanB[i]);
    fx[2 * i] = x0; fx[2 * i + 1] = x1;
    if (G.votes[i] < minVotes) continue;
    if ((x0 >= -FLYOVER_MARGIN && x0 <= W + FLYOVER_MARGIN) || (x1 >= -FLYOVER_MARGIN && x1 <= W + FLYOVER_MARGIN)) anchored++;
  }
  const l2 = Math.log2(zoom > 0 ? zoom : 1);
  const alpha0 = Math.min(0.075 + l2 * 0.028, light ? 0.42 : 0.19);
  const width0 = Math.min(0.9 + l2 * 0.16, STROKE_DEEP);
  const crowd = Math.max(1, Math.pow((anchored / W) / DENSITY_K, DENSITY_EXP));
  const alpha = alpha0 + (ALPHA_DEEP / crowd - alpha0) * vm;
  const width = width0 + (STROKE_DEEP - width0) * vm;
  const skyLoc = localize * (1 - Math.min(1, camY / ceil));
  const hAt = (x, x0, rx, A) => { const u = (x - x0 - rx) / rx; return u <= -1 || u >= 1 ? 0 : A * Math.sqrt(1 - u * u); };

  // which threads cross the sky, and how each is inked
  const vis = [];
  for (let i = 0; i < G.count; i++) {
    if (G.votes[i] < minVotes) continue;
    const x0 = fx[2 * i], x1 = fx[2 * i + 1];
    if (x1 < -40 || x0 > W + 40) continue;
    const rx = (x1 - x0) / 2; if (rx <= 0.25) continue;
    const A = rx * squash, cx = x0 + rx;
    const wl = Math.max(x0, -32), wr = Math.min(x1, W + 32);
    const hmax = hAt(Math.min(Math.max(cx, wl), wr), x0, rx, A);
    const hmin = Math.min(hAt(wl, x0, rx, A), hAt(wr, x0, rx, A));
    if (hmax < camY - 2 || hmin > baseY + 2) continue;
    const a = G.from[i], b = G.to[i];
    const anch = (x0 >= -FLYOVER_MARGIN && x0 <= W + FLYOVER_MARGIN) || (x1 >= -FLYOVER_MARGIN && x1 <= W + FLYOVER_MARGIN);
    let dim = 1;
    if (o.focus != null) dim = i === o.focus ? 1 : 0.05;
    else if (o.focusRange) {
      // a tapped chapter, verse or bundle; with a chosen group, only the pairs (one foot in each) stay lit
      const lit = o.group ? ((inR(a, o.focusRange) && inR(b, o.group)) || (inR(b, o.focusRange) && inR(a, o.group)))
        : (inR(a, o.focusRange) || inR(b, o.focusRange));
      dim = lit ? 1 : 0.05;
    }
    else if (lens) dim = inLens(a) || inLens(b) ? 1 : LENS_CONTEXT;
    dim *= anch ? 1 : 1 + (FLYOVER_FLOOR - 1) * skyLoc;
    const strength = Math.min(1, Math.max(0.3, G.votes[i] / 70));
    const aS = strength + (1 - strength) * vm;
    const wS = 1 + ((STROKE_MIN / STROKE_DEEP + (1 - STROKE_MIN / STROKE_DEEP) * (strength - 0.3) / 0.7) - 1) * vm;
    // Vesper's ink: the app's law, calmed (thinner, lighter) so a sheaf reads as hatching, not a bar
    vis.push({ i, x0, x1, rx, A, wl, wr, a: Math.min(1, alpha * dim * aS * (o.ink || 0.8) * (dim < 1 ? 0.75 : 1)), w: width * wS * (o.thin || 0.5), lit: dim >= 1 });
  }
  vis.sort((p, q) => (p.lit - q.lit) || (p.a - q.a));
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, base); ctx.clip();   // the ruler is the horizon: the web stands above it
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const tau = (x, x0, rx) => Math.acos(Math.min(1, Math.max(-1, 1 - (x - x0) / rx)));
  for (const t of vis) {
    if (t.i === o.focus) continue;
    const span = Math.abs(G.to[t.i] - G.from[t.i]);
    const [r, g, bl] = rampRGB(spanT(span));
    ctx.strokeStyle = `rgba(${r},${g},${bl},${t.a.toFixed(3)})`;
    ctx.lineWidth = t.w;
    const ta = tau(t.wl, t.x0, t.rx), tb = tau(t.wr, t.x0, t.rx), n = 40;
    ctx.beginPath();
    for (let k = 0; k <= n; k++) {
      const th = ta + (tb - ta) * k / n;
      const x = t.x0 + t.rx * (1 - Math.cos(th)), y = baseY - t.A * Math.sin(th);
      if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  if (o.focus != null) {
    const t = vis.find((v) => v.i === o.focus);
    if (t) {
      ctx.strokeStyle = acc; ctx.lineWidth = 2.6; ctx.shadowColor = acc; ctx.shadowBlur = light ? 0 : 8;
      const ta = tau(t.wl, t.x0, t.rx), tb = tau(t.wr, t.x0, t.rx), n = 80;
      ctx.beginPath();
      for (let k = 0; k <= n; k++) { const th = ta + (tb - ta) * k / n; const x = t.x0 + t.rx * (1 - Math.cos(th)), y = baseY - t.A * Math.sin(th); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke(); ctx.shadowBlur = 0;
    }
  }
  // the web thins out under the top bar, so the chrome reads over black as it does on the overview
  if (inset > 0 && o.fadeTop !== false) {
    ctx.globalCompositeOperation = 'destination-out';
    const gr = ctx.createLinearGradient(0, inset - 22, 0, inset + 2);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, inset + 2);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();

  // ── the ruler: fixed at the frame's base whatever the camera's height ──
  const out = { X, base, baseY, lens, visible: vis.length, anchored };
  ctx.save();
  ctx.strokeStyle = light ? 'rgba(123,45,38,0.30)' : 'rgba(212,175,90,0.30)';
  ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, base + 0.5); ctx.lineTo(W, base + 0.5); ctx.stroke();
  const v0 = Math.max(0, Math.floor((0 - W / 2) / ppv + camX) - 1), v1 = Math.min(G.total - 1, Math.ceil((W - W / 2) / ppv + camX) + 1);
  if (ppv < 8) {
    ctx.fillStyle = t3;
    for (const c of G.chapters) {
      const x = X(c[2]), x2 = X(c[2] + c[3]);
      if (x2 < -4 || x > W + 4) continue;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x, base + 3, Math.max((x2 - x) * 0.8, 0.7), Math.min(14, 2 + c[3] / 12));
    }
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = `rgba(${ink},0.45)`;
    for (let v = v0; v <= v1; v++) ctx.fillRect(X(v) - 0.6, base + 2, 1.2, 7);
    if (ppv > 30) {
      ctx.font = `400 10.5px 'VOT Digits', 'Atkinson Hyperlegible', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let v = v0; v <= v1; v++) {
        const r = ref(v);
        ctx.fillStyle = inLens(v) ? t2 : t3;
        ctx.fillText(String(r.verse), X(v) + ppv / 2, base + 12);
      }
    }
  }
  // the lens: the lit chapter's own stretch of the baseline, and its numeral, in the accent
  if (lens && o.lensMark !== false) {
    ctx.fillStyle = acc;
    const lx0 = Math.max(0, X(lens[0])), lx1 = Math.min(W, X(lens[1] + 1));
    if (lx1 > lx0) ctx.fillRect(lx0, base - 1, lx1 - lx0, 2.5);
  }
  if (ppv > 2.4) {
    ctx.font = `500 13px 'EB Garamond', Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    for (let ci = 0; ci < G.chapters.length; ci++) {
      const c = G.chapters[ci];
      const x0 = Math.max(X(c[2]), 0), x1 = Math.min(X(c[2] + c[3]), W);
      if (x1 - x0 < 22) continue;
      const lit = lens && ci === lensCi;
      ctx.fillStyle = lit ? acc : t2;
      ctx.globalAlpha = lit ? 1 : 0.8;
      ctx.lineWidth = 3; ctx.strokeStyle = bg; ctx.strokeText(String(c[1]), (x0 + x1) / 2, base - 6);
      ctx.fillText(String(c[1]), (x0 + x1) / 2, base - 6);
    }
    ctx.globalAlpha = 1;
  }
  // books: web-draw's label face; the full title when it fits its span, else the abbreviation
  const bookY = o.bookY || (base + 52);
  ctx.font = `700 8.5px 'Atkinson Hyperlegible', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let lastR = -99;
  G.books.forEach((bk, bi) => {
    const end = bi < 65 ? G.books[bi + 1].start : G.total;
    const x0 = X(bk.start), x1 = X(end);
    if (x1 < -34 || x0 > W + 34) return;
    ctx.strokeStyle = light ? 'rgba(123,45,38,0.22)' : 'rgba(212,175,90,0.22)';
    if (x0 >= 0 && x0 <= W) { ctx.beginPath(); ctx.moveTo(x0, base + 2); ctx.lineTo(x0, base + 9); ctx.stroke(); }
    const full = bk.title.toUpperCase(), abbr = bk.abbr.toUpperCase();
    const lbl = ctx.measureText(full).width <= (x1 - x0) - 8 ? full : ctx.measureText(abbr).width <= (x1 - x0) * 2 ? abbr : null;
    if (!lbl) return;
    const w = ctx.measureText(lbl).width;
    const cx = Math.max(Math.min((x0 + x1) / 2, W - w / 2 - 8), w / 2 + 8);
    if (cx - w / 2 < lastR + 6) return;
    ctx.fillStyle = t3; ctx.fillText(lbl, cx, bookY); lastR = cx + w / 2;
  });
  ctx.restore();

  // ── the count pills: how many drawn threads stand on each cell (they ride the web's own baseline) ──
  const boxes = [];
  // lifted into the sky, the web's own baseline (and its pills) sinks below the horizon
  if (o.pills && localize > 0 && camY <= 0) {
    const cells = [];
    if (ppv >= 26) for (let v = v0; v <= v1; v++) cells.push({ lo: v, hi: v, n: 0 });
    else {
      let ci = G.chapterOfVerse[Math.max(0, v0)];
      while (ci < G.chapters.length && G.chapters[ci][2] <= v1) {
        const start = G.chapters[ci][2]; let end = ci;
        while (G.chapters[end][2] + G.chapters[end][3] - start < 34 / ppv && end + 1 < G.chapters.length) end++;
        cells.push({ lo: start, hi: G.chapters[end][2] + G.chapters[end][3] - 1, n: 0 }); ci = end + 1;
      }
    }
    const first = cells.length ? cells[0].lo : 0, span = cells.length ? cells[cells.length - 1].hi - first + 1 : 0;
    const cellOf = new Int32Array(Math.max(0, span)).fill(-1);
    cells.forEach((c, k) => { for (let v = c.lo; v <= c.hi; v++) cellOf[v - first] = k; });
    for (let i = 0; i < G.count; i++) {
      if (G.votes[i] < minVotes) continue;
      const a = G.from[i], b = G.to[i];
      const ca = a - first >= 0 && a - first < span ? cellOf[a - first] : -1;
      const cb = b - first >= 0 && b - first < span ? cellOf[b - first] : -1;
      if (ca < 0 && cb < 0) continue;
      const x0 = fx[2 * i], x1 = fx[2 * i + 1];
      if (!((x0 >= -24 && x0 <= W + 24) || (x1 >= -24 && x1 <= W + 24))) continue;
      if (ca >= 0) cells[ca].n++;
      if (cb >= 0 && cb !== ca) cells[cb].n++;
    }
    const cy = (o.pillY || base + 33) + camY;
    ctx.save();
    ctx.font = `700 10.5px 'VOT Digits', 'Atkinson Hyperlegible', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const c of cells) {
      if (!(c.n > 1)) continue;
      const cx = ((c.lo + c.hi + 1) / 2 - camX) * ppv + W / 2, wCell = (c.hi - c.lo + 1) * ppv;
      const text = String(c.n), w = ctx.measureText(text).width + 12, h = 17;
      if (w > wCell - 2 || cx + w / 2 < 0 || cx - w / 2 > W || cy + h / 2 > H) continue;
      const lit = !lens || (c.hi >= lens[0] && c.lo <= lens[1]);
      ctx.globalAlpha = lit ? 1 : 0.45;
      ctx.fillStyle = tok('--surface-2');
      ctx.beginPath(); ctx.roundRect(cx - w / 2, cy - h / 2, w, h, h / 2); ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = lit ? acc : t3; ctx.globalAlpha = lit ? 0.7 : 0.35; ctx.stroke();
      ctx.globalAlpha = lit ? 1 : 0.5; ctx.fillStyle = lit ? tok('--text') : t3;
      ctx.fillText(text, cx, cy + 0.5);
      boxes.push({ x: cx, y: cy, n: c.n, lo: c.lo, hi: c.hi });
    }
    ctx.restore();
  }
  out.pills = boxes;

  // ── the sky's chrome: the height ruler (left) and the height bar (right) ──
  const reserved = [];
  const marks = [];
  if (o.altitude && camY > 0) {
    ctx.save();
    ctx.font = `700 11.5px 'VOT Digits', 'Atkinson Hyperlegible', sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const fs = 11.5;
    for (const m of ALTITUDE_MARKS) {
      const y = baseY - (m.span * ppv / 2) * squash;
      if (y < inset + fs || y > base - fs) continue;
      const [r, g, bl] = rampRGB(spanT(m.span));
      const text = fmt(m.span) + ' · ' + m.name;
      ctx.strokeStyle = `rgba(${r},${g},${bl},0.9)`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(14, y); ctx.stroke();
      ctx.lineWidth = 4; ctx.strokeStyle = bg; ctx.strokeText(text, 20, y);
      ctx.fillStyle = `rgb(${r},${g},${bl})`; ctx.fillText(text, 20, y);
      reserved.push({ x0: 0, x1: 24 + ctx.measureText(text).width, y0: y - 10, y1: y + 10 });
      marks.push({ span: m.span, y });
    }
    const yMid = (inset + base) / 2;
    const spanMid = 2 * (baseY - yMid) / (ppv * squash);
    if (spanMid >= 1 && !marks.some((m) => Math.abs(m.y - yMid) < fs * 1.6)) {
      const [r, g, bl] = rampRGB(spanT(Math.min(spanMid, G.total)));
      const text = '~' + fmt(Math.round(spanMid)) + ' verses';
      ctx.font = `400 11.5px 'VOT Digits', 'Atkinson Hyperlegible', sans-serif`;
      ctx.strokeStyle = `rgba(${r},${g},${bl},0.7)`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, yMid); ctx.lineTo(8, yMid); ctx.stroke();
      ctx.lineWidth = 4; ctx.strokeStyle = bg; ctx.strokeText(text, 14, yMid);
      ctx.fillStyle = `rgba(${r},${g},${bl},0.85)`; ctx.fillText(text, 14, yMid);
      reserved.push({ x0: 0, x1: 18 + ctx.measureText(text).width, y0: yMid - 10, y1: yMid + 10 });
      out.readout = Math.round(spanMid);
    }
    ctx.restore();
  }
  out.marks = marks;
  const apexMax = (MAXSPAN * ppv / 2) * squash, maxY = apexMax - base;
  if (o.elevator && maxY > 0) {
    const y0 = inset + 8, y1 = base - 8, x = W - 10;
    const at = Math.min(1, camY / maxY);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(${ink},0.26)`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    for (const m of ALTITUDE_MARKS) {
      const f = ((m.span * ppv / 2) * squash) / maxY;
      if (!(f > 0.005) || f > 1) continue;
      const [r, g, bl] = rampRGB(spanT(m.span));
      ctx.strokeStyle = `rgba(${r},${g},${bl},0.95)`; ctx.lineWidth = 1.5;
      const my = y1 - f * (y1 - y0);
      ctx.beginPath(); ctx.moveTo(x - 5, my); ctx.lineTo(x + 5, my); ctx.stroke();
    }
    const th = 22, tw = 6, cy = y1 - at * (y1 - y0);
    const ty0 = Math.max(y0, Math.min(y1 - th, cy - th / 2));
    ctx.fillStyle = camY > 0 ? acc : `rgba(${ink},0.55)`;
    ctx.beginPath(); ctx.roundRect(x - tw / 2, ty0, tw, th, tw / 2); ctx.fill();
    ctx.restore();
    reserved.push({ x0: W - 24, x1: W, y0, y1 });
    out.elevator = { at, maxY };
  }

  // ── the references beside the lines: an off-screen foot is named on the body, arrow toward it ──
  if (o.labels && (ppv >= 30 || o.focus != null)) {
    const placed = reserved.slice();
    ctx.save();
    ctx.font = `400 11px 'VOT Digits', 'Atkinson Hyperlegible', sans-serif`; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const fs = 11;
    let drawn = 0;
    const order = vis.filter((t) => (o.focus == null || t.i === o.focus)).sort((p, q) => (q.lit - p.lit) || (G.votes[q.i] - G.votes[p.i])).slice(0, 400);
    for (const t of order) {
      const yAt = (x) => baseY - hAt(x, t.x0, t.rx, t.A);
      const inSky = (x) => { const y = yAt(x); return y >= inset && y <= base; };
      const xa = Math.max(0, t.x0), xb = Math.min(W, t.x1);
      if (!(xb > xa)) continue;
      const point = (x, dir) => { const d = Math.max(1, (xb - xa) / 512) * dir; const y = yAt(x), y2 = yAt(x + d); return { x, y, angle: Math.atan2((y2 - y) * dir, Math.abs(d)) }; };
      const nearest = (dir) => {
        let prev = dir > 0 ? xa : xb;
        if (inSky(prev)) return point(prev, dir);
        for (let k = 1; k <= 64; k++) {
          const x = dir > 0 ? xa + (xb - xa) * k / 64 : xb - (xb - xa) * k / 64;
          if (inSky(x)) { let off = prev, on = x; for (let bb = 0; bb < 10; bb++) { const mid = (off + on) / 2; if (inSky(mid)) on = mid; else off = mid; } return point(on, dir); }
          prev = x;
        }
        return null;
      };
      for (const side of ['from', 'to']) {
        const fx0 = side === 'from' ? t.x0 : t.x1;
        const on = fx0 >= 0 && fx0 <= W;
        if (on) continue;
        const at = nearest(side === 'from' ? 1 : -1);
        if (!at) continue;
        const r = ref(side === 'from' ? G.from[t.i] : G.to[t.i]);
        const text = side === 'from' ? '← ' + r.abbr + ' ' + r.chapter + ':' + r.verse : r.abbr + ' ' + r.chapter + ':' + r.verse + ' →';
        const w = ctx.measureText(text).width;
        const dir = side === 'from' ? 1 : -1;
        const steep = Math.abs(at.angle) > Math.PI / 4;
        const rot = steep ? 0 : at.angle;
        const along = 4 + w / 2, off = steep ? fs * 0.95 : -fs * 0.75;
        const cx = at.x + Math.cos(rot) * along * dir - Math.sin(rot) * off;
        const cy = at.y + Math.sin(rot) * along * dir + Math.cos(rot) * off;
        const hw = (Math.abs(Math.cos(rot)) * w + Math.abs(Math.sin(rot)) * fs) / 2;
        const hh = (Math.abs(Math.sin(rot)) * w + Math.abs(Math.cos(rot)) * fs) / 2;
        const box = { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh };
        if (box.y0 < inset - 2 || box.y1 > base - 2 || box.x0 < 2 || box.x1 > W - 26) continue;
        const m = 6;
        if (placed.some((q) => box.x0 < q.x1 + m && box.x1 > q.x0 - m && box.y0 < q.y1 + m && box.y1 > q.y0 - m)) continue;
        placed.push(box);
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = bg; ctx.strokeText(text, 0, 0);
        ctx.fillStyle = t.i === o.focus ? acc : t2; ctx.fillText(text, 0, 0);
        ctx.restore();
        drawn++;
      }
    }
    ctx.restore();
    out.labels = drawn;
  }
  return out;
}

/* ── My Web: the Volumes rail on top, the Bible rail below (rail-renderer.js) ── */
const EDGE_MARGIN = 24, REACH_MARGIN = 0.12, REACH_GAPS = 1.4, RUN_ALPHA = 0.3, RIBBON_BOW = 0.42;
function threadPath(a, b, crossRail, o) {
  const W = o.width;
  const on = (p) => p[0] >= -EDGE_MARGIN && p[0] <= W + EDGE_MARGIN;
  const onA = on(a), onB = on(b);
  if (!onA && !onB) return null;
  const adx = Math.abs(b[0] - a[0]), n = o.n || 24;
  const vis = onA ? a : b, far = onA ? b : a;
  const sign = far[0] >= vis[0] ? 1 : -1;
  const distToEdge = sign > 0 ? (W + EDGE_MARGIN) - vis[0] : vis[0] + EDGE_MARGIN;
  const capEdge = distToEdge + W * REACH_MARGIN * (1 + Math.log10(1 + adx / W));
  const capGap = Math.min(capEdge, (o.gap || W) * REACH_GAPS);
  const sf = Math.min(1, Math.max(0, (adx - W) / (2 * W)));
  const far3 = sf * sf * (3 - 2 * sf);
  const reach = (onA && onB) ? adx : Math.min(adx, capEdge + (capGap - capEdge) * far3);
  let pts, rise = -1;
  if (crossRail) {
    const ex = vis[0] + sign * reach, ey = far[1], dy = ey - vis[1];
    const c1 = [vis[0], vis[1] + dy * RIBBON_BOW], c2 = [ex, ey - dy * RIBBON_BOW];
    pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      pts.push([u * u * u * vis[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * ex,
        u * u * u * vis[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * ey]);
    }
    if (reach < adx) { rise = pts.length - 1; pts.push([far[0], far[1]]); }
  } else {
    const rxFull = adx / 2, rx = Math.min(rxFull, reach), dir = o.up === false ? 1 : -1;
    const ry = Math.min(rxFull, o.maxRy || rxFull), half = Math.ceil(n / 2);
    pts = [];
    for (let i = 0; i <= half; i++) { const th = (Math.PI / 2) * (i / half); pts.push([vis[0] + sign * rx * (1 - Math.cos(th)), vis[1] + dir * ry * Math.sin(th)]); }
    if (rx < rxFull) { rise = pts.length - 1; pts.push([far[0] - sign * rx, vis[1] + dir * ry]); }
    for (let i = 1; i <= half; i++) { const th = (Math.PI / 2) * (1 - i / half); pts.push([far[0] - sign * rx * (1 - Math.cos(th)), vis[1] + dir * ry * Math.sin(th)]); }
  }
  if (!onA) { pts.reverse(); if (rise >= 0) rise = pts.length - 1 - rise; }
  pts[0] = [a[0], a[1]]; pts[pts.length - 1] = [b[0], b[1]];
  pts.rise = rise; pts.fromA = onA;
  return pts;
}
/** the four sources of Timothy's threads (a cool family) and the reader's three shapes (a warm one) */
export function myWebColours() {
  const L = isLight();
  return {
    sources: [tok('--dot-sky'), tok('--dot-sage'), tok('--dot-lavender'), L ? '#6e7a8c' : '#9aa3b1'],
    kinds: [tok('--accent'), tok('--dot-clay'), tok('--dot-rose')],
  };
}
const rgba = (hex, a) => { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
export { rgba };

/**
 * o: { topY, bottomY, left, right, bible: {camX, ppv}|null (fit), vol: {camX, ppv}|null (fit),
 *      links, under (flat [v,pos,bin]), rail, showUnder, focus, underFocus, dimUnder, labels }
 */
export const drawMyWeb = (canvas, o) => inTheme(canvas, () => myWebDraw(canvas, o));
function myWebDraw(canvas, o) {
  const { ctx, W } = hiDPI(canvas);
  const light = isLight();
  const L = o.left == null ? 18 : o.left, R = o.right == null ? 18 : o.right, span = W - L - R;
  const topY = o.topY, botY = o.bottomY, gap = botY - topY;
  const vt = o.rail.total;
  const X = o.bible ? (v) => (v - o.bible.camX) * o.bible.ppv + W / 2 : (v) => L + (v / G.total) * span;
  const V = o.vol ? (p) => (p - o.vol.camX) * o.vol.ppv + W / 2 : (p) => L + (p / vt) * span;
  const col = myWebColours();
  const bg = tok('--bg'), acc = tok('--accent'), t3 = tok('--text-3');
  const zB = o.bible ? (G.total * o.bible.ppv) / span : 1, zV = o.vol ? (vt * o.vol.ppv) / span : 1;
  const z = Math.max(zB, zV, 1);
  const tz = Math.min(1, Math.log(z) / Math.log(40));
  const ctxAlpha = Math.min(light ? 0.14 : 0.11, (light ? 0.085 : 0.065) * Math.pow(z, 0.75)) * (o.dimUnder || 1);
  const out = { X, V, topY, botY };

  // the two rails
  ctx.save();
  ctx.strokeStyle = light ? 'rgba(123,45,38,0.30)' : 'rgba(212,175,90,0.30)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, botY + 0.5); ctx.lineTo(W, botY + 0.5); ctx.moveTo(0, topY - 0.5); ctx.lineTo(W, topY - 0.5); ctx.stroke();
  // the Volumes: a tick per collection, its short name where it fits (two rows, rail-labels.js)
  ctx.font = `700 8.5px 'Atkinson Hyperlegible', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const rowEnd = [-Infinity, -Infinity], names = [];
  for (const seg of o.rail.segments) {
    const x0 = V(seg.start), x1 = V(seg.start + seg.count);
    if (x1 < 0 || x0 > W) continue;
    ctx.strokeStyle = light ? 'rgba(123,45,38,0.35)' : 'rgba(212,175,90,0.35)';
    if (x0 >= 0) { ctx.beginPath(); ctx.moveTo(x0, topY - 7); ctx.lineTo(x0, topY); ctx.stroke(); }
    const l = Math.max(x0, 0), r = Math.min(x1, W), room = r - l;
    const label = seg.short.toUpperCase(), w = ctx.measureText(label).width;
    if (w > room * 2) continue;
    const cx = Math.max(Math.min((l + r) / 2, W - 30), 30);
    names.push({ label, cx, left: cx - w / 2, right: cx + w / 2, fits: w <= room - 6 });
  }
  for (const nm of names) {
    let row = -1;
    for (let k = 0; k < 2; k++) if (nm.left >= rowEnd[k] + 5) { rowEnd[k] = nm.right; row = k; break; }
    if (row < 0) continue;
    ctx.fillStyle = t3; ctx.globalAlpha = nm.fits && row === 0 ? 1 : 0.8;
    ctx.fillText(nm.label, nm.cx, topY - (row ? 21 : 10));
  }
  ctx.globalAlpha = 1;
  // the Bible: web-draw's book face under the rail
  ctx.textBaseline = 'middle';
  let lastR = -99;
  G.books.forEach((bk, bi) => {
    const end = bi < 65 ? G.books[bi + 1].start : G.total;
    const x0 = X(bk.start), x1 = X(end);
    if (x1 < -34 || x0 > W + 34) return;
    ctx.strokeStyle = light ? 'rgba(123,45,38,0.22)' : 'rgba(212,175,90,0.22)';
    if (x0 >= 0 && x0 <= W && o.bible) { ctx.beginPath(); ctx.moveTo(x0, botY + 2); ctx.lineTo(x0, botY + 9); ctx.stroke(); }
    const full = bk.title.toUpperCase(), abbr = bk.abbr.toUpperCase();
    const lbl = o.bible && ctx.measureText(full).width <= (x1 - x0) - 8 ? full : abbr;
    const w = ctx.measureText(lbl).width;
    const cx = o.bible ? Math.max(Math.min((x0 + x1) / 2, W - w / 2 - 8), w / 2 + 8) : (x0 + x1) / 2;
    if (cx - w / 2 < lastR + 6 || cx + w / 2 > W - 4) return;
    ctx.fillStyle = t3; ctx.fillText(lbl, cx, botY + (o.bookDy || 22)); lastR = cx + w / 2;
  });
  ctx.restore();

  // Timothy's threads: the Volumes' own citations, faint, beneath
  const chosen = [];
  if (o.showUnder !== false) {
    ctx.save();
    ctx.lineWidth = 0.8 + 0.8 * tz; ctx.lineCap = 'round';
    const U = o.under;
    for (let k = 0; k < U.length; k += 3) {
      const a = [X(U[k]), botY], b = [V(U[k + 1] + 0.5), topY];
      const pts = threadPath(a, b, true, { width: W, gap, n: 16 });
      if (!pts) continue;
      const focusMe = o.underFocus && o.underFocus.includes(k / 3);
      if (focusMe) { chosen.push([pts, col.sources[U[k + 2]]]); continue; }
      const c = col.sources[U[k + 2]];
      const al = o.underFocus ? ctxAlpha * 0.4 : ctxAlpha;
      const seg = (i0, i1, alpha) => { ctx.strokeStyle = rgba(c, alpha); ctx.beginPath(); ctx.moveTo(pts[i0][0], pts[i0][1]); for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); };
      if (pts.rise < 0) seg(0, pts.length - 1, al);
      else if (pts.fromA) { seg(0, pts.rise, al); seg(pts.rise, pts.length - 1, al * RUN_ALPHA); }
      else { seg(0, pts.rise, al * RUN_ALPHA); seg(pts.rise, pts.length - 1, al); }
    }
    ctx.restore();
  }

  // the reader's links: warm, pinned at both ends; a knockout in the ground keeps them off the context
  const links = o.links || [];
  const P = (e) => (e.rail === 1 ? [V(e.pos + 0.5), topY] : [X(e.pos), botY]);
  const paths = links.map((l) => {
    const a = P(l.a), b = P(l.b), cross = l.a.rail !== l.b.rail;
    const pts = threadPath(a, b, cross, { width: W, gap, n: 32, up: l.a.rail === 0, maxRy: gap * 0.78 });
    return { a, b, pts, kind: l.kind };
  });
  const lw = 2.0 + 0.6 * tz;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const line = (pts) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]); ctx.stroke(); };
  paths.forEach((p, i) => { if (!p.pts) return; ctx.strokeStyle = rgba(bg, 0.85); ctx.lineWidth = lw + 4; line(p.pts); });
  paths.forEach((p, i) => {
    if (!p.pts) return;
    const hot = i === o.focus;
    const dim = (o.focus != null && o.focus >= 0 && !hot) || o.dimLinks ? 0.22 : 1;
    const c = col.kinds[p.kind];
    ctx.strokeStyle = rgba(c, 0.95 * dim); ctx.lineWidth = hot ? lw + 1 : lw;
    if (hot && !light) { ctx.shadowColor = c; ctx.shadowBlur = 8; }
    line(p.pts); ctx.shadowBlur = 0;
    ctx.lineWidth = 1.3;
    for (const q of [p.a, p.b]) {
      if (q[0] < -EDGE_MARGIN || q[0] > W + EDGE_MARGIN) continue;
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(q[0], q[1], 6.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(c, dim); ctx.fillStyle = rgba(c, dim);
      if (p.kind !== 1) { ctx.beginPath(); ctx.arc(q[0], q[1], 5.2, 0, Math.PI * 2); ctx.stroke(); }
      if (p.kind !== 0) { ctx.beginPath(); ctx.arc(q[0], q[1], p.kind === 1 ? 4.2 : 2.4, 0, Math.PI * 2); ctx.fill(); }
    }
  });
  // a chosen Timothy thread comes forward over everything
  for (const [pts, c] of chosen) {
    const line = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); };
    ctx.strokeStyle = rgba(bg, 0.9); ctx.lineWidth = 6; line();
    ctx.strokeStyle = rgba(c, 1); ctx.lineWidth = 2.4; line();
  }
  ctx.restore();
  out.paths = paths;
  return out;
}

/* ── chrome, shared by every web page (web*.html and sw-*): Back, the title, the Scripture / My Web
      switch, then the strip in the source's order (ScriptureWebScreen.jsx .sw-controls): Nearby, the
      density (or Corpus context in My Web), Reset; then ? and Hide controls ── */
export function iconize(scope = document) {
  scope.querySelectorAll('i[data-i]').forEach((el) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'i ' + (el.className || ''));
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-' + el.dataset.i); svg.appendChild(use);
    if (el.style.cssText) svg.style.cssText = el.style.cssText;
    el.replaceWith(svg);
  });
}
/**
 * mode: 'canon' | 'myweb'; meta: the count line; two: let it wrap to two lines;
 * density: 'Famous' (the default, 63,418) | 'Essential' (15,402); densityOpen: its menu showing;
 * corpus: Corpus context on/off; nearby: the Nearby list open; guide: the ? pressed;
 * tool: HTML standing in the density's place (a concept's own toggle)
 * Nearby is its own button, never a third web: the switch only ever says which web is showing.
 */
export function chromeHTML(o = {}) {
  const mode = o.mode || 'canon';
  const title = mode === 'myweb' ? 'My Web' : 'Scripture Web';
  const meta = o.meta || (mode === 'myweb' ? '27 links you have made' : '63,418 connections');
  const tool = o.tool != null ? o.tool : mode === 'myweb'
    ? (o.corpus === false
      ? `<span class="chip">Corpus context · 2,095</span>`
      : `<span class="chip on"><i data-i="check" class="xs"></i> Corpus context · 2,095</span>`)
    : `<span class="chip${o.densityOpen ? ' open' : ''}">${o.density || 'Famous'} <i data-i="chevron-down" class="xs"></i></span>`;
  return `<div class="chrome">
    <span class="iconbtn back"><i data-i="chevron-left"></i></span>
    <div class="brand"><div class="h2">${title}</div><div class="meta ${o.two ? 'two' : 'one'}">${meta}</div></div>
    <div class="seg" role="group" aria-label="Which web"><span${mode === 'myweb' ? '' : ' class="on"'}>Scripture</span><span${mode === 'myweb' ? ' class="on"' : ''}>My Web</span></div>
    <div class="right"><span class="chip${o.nearby ? ' on' : ''}" aria-expanded="${o.nearby ? 'true' : 'false'}">Nearby</span>${tool}<span class="chip"><i data-i="rotate-ccw" class="xs"></i> Reset</span>
      <span class="sepv"></span><span class="chip ic${o.guide ? ' on' : ''}"><i data-i="sw-help"></i></span><span class="chip ic"><i data-i="sw-hide"></i></span></div>
  </div>`;
}
/** The key along the bottom. No credit line: the OpenBible CC-BY credit lives on About (owner, 2026-09-11). */
export function footHTML(mode = 'canon') {
  if (mode === 'myweb') {
    return `<div class="mkey">
      <div class="kr"><span class="fam">yours</span><i class="pin k-scr"></i>within scripture<span class="sep">·</span><i class="pin fill k-vol"></i>within the Volumes<span class="sep">·</span><i class="pin ringdot k-x"></i>across</div>
      <div class="kr"><span class="fam">Timothy’s</span><i class="sline s-fn"></i>footnotes<span class="sep">·</span><i class="sline s-sn"></i>study notes<span class="sep">·</span><i class="sline s-wt"></i>Words To Live By<span class="sep">·</span><i class="sline s-st"></i>studies</div>
    </div>`;
  }
  return `<div class="foot"><span class="legend"><span>nearby</span><i class="ramp"></i><span>across the canon</span><span class="gap"></span><span class="hist"><b></b><b></b><b></b></span><span>bars below — chapter length</span></span></div>`;
}
