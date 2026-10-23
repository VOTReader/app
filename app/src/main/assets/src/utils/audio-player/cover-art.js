// @ts-check
/* audio-player/cover-art — the picture a lock screen, notification, watch or car shows for a reading (pl-l5): a
   512 px square per collection, gold type on dark ("Volume One", a short rule, VOTREADER), drawn here in the page
   so every collection has one, offline, in the app's own fonts. The web Media Session takes it as its artwork; the
   APK's native player takes the same picture over the bridge, so the two never look different. Songs keep their
   own cover (media-session.js). */

const SIZE = 512;
const BG = '#0b0a08';
const GOLD = '#d6b35f';
const GOLD_DIM = '#c29f57';
const SERIF = "'EB Garamond', 'Cormorant Garamond', Georgia, serif";
const CAPS = "'Cinzel', 'EB Garamond', Georgia, serif";
/** Width the title may fill, and the sizes it steps down through until it fits in 3 lines. */
const TEXT_W = 380;
const TITLE_PX = [92, 80, 68, 58, 50];
const MAX_LINES = 3;
const FALLBACK = 'The Volumes of Truth';

/** label -> data url. A reader moves between a handful of collections; the cap keeps a long session small. */
/** @type {Map<string, string>} */
const _cache = new Map();
const CACHE_MAX = 12;

/**
 * The cover for a collection, as a PNG data url; '' where nothing can draw (no canvas, as in tests). Drawn once per
 * label, after the fonts are in: a cover drawn before them is used once and not kept, so the next asks again.
 * @param {string | null | undefined} label the collection ("Volume One", "Words to Live By", a Bible edition)
 * @returns {string}
 */
export function coverArt(label) {
  const text = (typeof label === 'string' && label.trim()) || FALLBACK;
  const hit = _cache.get(text);
  if (hit) return hit;
  let url = '';
  try {
    if (typeof document === 'undefined') return '';
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    _draw(ctx, text);
    url = canvas.toDataURL('image/png');
  } catch (_e) { return ''; }
  if (!url.startsWith('data:image/')) return '';
  if (_fontsReady()) {
    if (_cache.size >= CACHE_MAX) _cache.delete(/** @type {string} */ (_cache.keys().next().value));
    _cache.set(text, url);
  }
  return url;
}

/** @returns {boolean} true once both cover fonts are loaded (or the page cannot say: then it is as good as it gets) */
function _fontsReady() {
  try {
    const fonts = /** @type {any} */ (document).fonts;
    if (!fonts || typeof fonts.check !== 'function') return true;
    const ready = fonts.check("64px 'EB Garamond'") && fonts.check("20px 'Cinzel'");
    if (!ready && typeof fonts.load === 'function') {
      fonts.load("64px 'EB Garamond'").catch(() => {});
      fonts.load("20px 'Cinzel'").catch(() => {});
    }
    return ready;
  } catch (_e) { return true; }
}

/**
 * Greedy word wrap at `font`; a word wider than the line stands alone.
 * @param {CanvasRenderingContext2D} ctx @param {string} text @returns {string[]}
 */
function _wrap(ctx, text) {
  /** @type {string[]} */
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? line + ' ' + word : word;
    if (line && ctx.measureText(next).width > TEXT_W) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** @param {CanvasRenderingContext2D} ctx @param {string} text */
function _draw(ctx, text) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, SIZE, SIZE);
  // The frame: a fine outer line and a heavier inner one, as on the app's own cards.
  ctx.strokeStyle = GOLD_DIM;
  ctx.lineWidth = 2;
  ctx.strokeRect(22, 22, SIZE - 44, SIZE - 44);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 4;
  ctx.strokeRect(38, 38, SIZE - 76, SIZE - 76);

  // The title: the largest size that fits in three lines (a long name steps down; one that never fits is cut).
  let px = TITLE_PX[TITLE_PX.length - 1];
  let lines = [text];
  for (const size of TITLE_PX) {
    ctx.font = `500 ${size}px ${SERIF}`;
    lines = _wrap(ctx, text);
    px = size;
    const fits = lines.length <= MAX_LINES && lines.length * Math.round(size * 1.08) <= 240;   // clear of the rule
    if (fits && lines.every((l) => ctx.measureText(l).width <= TEXT_W)) break;
  }
  if (lines.length > MAX_LINES) lines = [...lines.slice(0, MAX_LINES - 1), lines[MAX_LINES - 1] + '…'];
  ctx.font = `500 ${px}px ${SERIF}`;
  ctx.fillStyle = GOLD;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const lead = Math.round(px * 1.08);
  const blockH = lead * (lines.length - 1);
  const firstY = 236 - blockH / 2 + px * 0.34;
  lines.forEach((l, i) => ctx.fillText(l, SIZE / 2, firstY + i * lead, TEXT_W));

  // The rule and the name of the app.
  const ruleY = Math.round(firstY + blockH + px * 0.5);
  ctx.fillRect(SIZE / 2 - 44, ruleY, 88, 3);
  ctx.font = `400 26px ${CAPS}`;
  ctx.fillStyle = GOLD_DIM;
  /** @type {any} */ (ctx).letterSpacing = '7px';
  ctx.fillText('VOTREADER', SIZE / 2 + 3.5, 432);
}

/** Tests: forget the drawn covers. */
export function _resetCoverArt() { _cache.clear(); }
