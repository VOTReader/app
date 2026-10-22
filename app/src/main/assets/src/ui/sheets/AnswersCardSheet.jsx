/* ═══════════════════════════════════════════════════════════════════════
   AnswersCardSheet — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   Share as a card (AOGCG final design O6), from the long-press menu on an
   Answers topic (SelectionToolbar) and the Answer of the day's share
   button (AnswersHome): a theme control (Parchment · Ink · Night), the
   card itself as a 4:5 preview in the app serif (the passage verbatim,
   then its citation, its date and answersonlygodcangive.com), and Share.

   The card is drawn on the device, on a 1080 x 1350 canvas, and leaves it
   only when the reader shares it: the phone's share sheet (the APK's
   PlatformBridge.shareImage, the web's navigator.share with the file), or,
   where there is no share sheet for images, a download of the PNG
   (utils/copy-share.js shareCanvasImage). No photos, nothing fetched.

   A passage of more than 80 words is refused with "Choose a shorter
   passage" and never cut (answers-extras.js).
   ═══════════════════════════════════════════════════════════════════════ */

import { AnsSheet } from './AnswersSheets.jsx';
import {
  ANSWERS_CARD_THEMES, ANSWERS_CARD_MAX_WORDS, ANSWERS_CARD_W, ANSWERS_CARD_H, ANSWERS_CARD_SITE, answersCardWords, answersCardLayout,
} from '../../utils/answers-extras.js';
import { shareCanvasImage } from '../../utils/copy-share.js';

/** The last theme picked, for the next card this session. */
let _theme = ANSWERS_CARD_THEMES[0].id;

/** The app serif as the reader has it (Settings › Reading Font writes --font-body on <html>). */
function cardFamily() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--font-body').trim();
    if (v) return v;
  } catch (_e) { /* no computed style (a test host): the generic serif */ }
  return 'serif';
}

/**
 * Paint the card. False when the host has no 2D canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {import('../../utils/answers-extras.js').AnswersCard} card
 * @param {{ bg: string, text: string, gold: string }} theme
 * @param {string} family
 */
export function drawAnswersCard(canvas, card, theme, family) {
  let ctx = null;
  try { ctx = canvas.getContext('2d'); } catch (_e) { ctx = null; }
  if (!ctx) return false;
  const c2 = ctx;
  const measurer = (/** @type {string} */ font) => (/** @type {string} */ s) => { c2.font = font; return c2.measureText(s).width; };
  const L = answersCardLayout(card, measurer, family);
  c2.fillStyle = theme.bg;
  c2.fillRect(0, 0, L.W, L.H);
  c2.textAlign = 'left';
  c2.textBaseline = 'alphabetic';
  c2.fillStyle = theme.text;
  c2.font = L.font;
  for (const l of L.lines) c2.fillText(l.text, L.pad, l.y);
  c2.fillStyle = theme.gold;
  c2.fillRect(L.pad, L.rule, 64, 3);
  for (const f of L.foot) {
    c2.font = f.font;
    c2.fillStyle = f.gold ? theme.gold : theme.text;
    c2.fillText(f.text, L.pad, f.y);
  }
  return true;
}

/**
 * @param {{ card: import('../../utils/answers-extras.js').AnswersCard, onClose: () => void }} props
 */
export function AnswersCardSheet({ card, onClose }) {
  const [themeId, setThemeId] = React.useState(_theme);
  const [busy, setBusy] = React.useState(false);
  const canvasRef = React.useRef(/** @type {HTMLCanvasElement | null} */ (null));
  // The PNG of what the preview shows, made as it is painted, so Share hands it over inside the tap.
  const pngRef = React.useRef(/** @type {Blob | null} */ (null));
  const words = answersCardWords(card.passage);
  const fits = words > 0 && words <= ANSWERS_CARD_MAX_WORDS;
  const theme = ANSWERS_CARD_THEMES.find((t) => t.id === themeId) || ANSWERS_CARD_THEMES[0];
  React.useEffect(() => { _theme = themeId; }, [themeId]);
  React.useEffect(() => {
    const c = canvasRef.current;
    pngRef.current = null;
    if (!c || !fits) return undefined;
    const family = cardFamily();
    let live = true;
    const paint = () => {
      pngRef.current = null;
      if (!drawAnswersCard(c, card, theme, family)) return;
      try { c.toBlob((b) => { if (live) pngRef.current = b; }, 'image/png'); } catch (_e) { /* Share makes it then */ }
    };
    paint();
    // The faces may still be on their way: the passage's, the citation and date's italic, the site
    // line's. Paint again once all three are in (a face never shown yet would draw as the fallback).
    // Each is asked for with the words it draws, so a face split by unicode-range loads every part used.
    const fonts = typeof document !== 'undefined' ? /** @type {any} */ (document).fonts : null;
    if (fonts && typeof fonts.load === 'function') {
      const faces = [['60px ', card.passage], ['italic 34px ', card.cite + ' ' + card.date], ['30px ', ANSWERS_CARD_SITE]]
        .map(([f, text]) => Promise.resolve(fonts.load(f + family, text || ' ')).catch(() => null));
      Promise.all(faces).then(() => { if (live) paint(); });
    }
    return () => { live = false; };
  }, [card, theme, fits]);
  const share = () => {
    const c = canvasRef.current;
    if (!c || busy || !fits) return;
    setBusy(true);
    shareCanvasImage(c, 'answer-card.png', pngRef.current).then((outcome) => {
      setBusy(false);
      const say = outcome === 'saved' ? 'Card saved as an image.' : outcome === 'failed' ? 'Couldn’t share the card.' : '';
      if (say && typeof showToast === 'function') showToast({ id: 'vot-toast-copy', className: 'vot-toast', text: say });
      if (outcome === 'shared' || outcome === 'saved') onClose();
    });
  };
  // A radio group (one of three, repainting the one card): arrows step and wrap, Home and End jump, focus follows.
  const onKey = (/** @type {any} */ e) => {
    const n = ANSWERS_CARD_THEMES.length;
    const i = ANSWERS_CARD_THEMES.indexOf(theme);
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: n - 1, ArrowUp: n - 1 }[/** @type {'ArrowRight'} */ (e.key)];
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : step ? (i + step) % n : -1;
    if (j < 0) return;
    e.preventDefault();
    setThemeId(ANSWERS_CARD_THEMES[j].id);
    const next = e.currentTarget.parentNode && e.currentTarget.parentNode.children[j];
    if (next && typeof next.focus === 'function') next.focus();
  };
  // The sheet fills the screen under the top bar, and the card is as large as leaves the theme control and Share in
  // view (app.css .ans-card); on a short screen (a phone held sideways) it keeps a readable size and the sheet scrolls.
  // Over 80 words there is no card: no theme control, and the sheet only as tall as its message.
  return (
    <AnsSheet label="Share as a card" tall={fits} onClose={onClose} head={<p className="ans-label">Share as a card</p>}>
      {fits ? (
        <div className="ans-tabs" role="radiogroup" aria-label="Card theme">
          {ANSWERS_CARD_THEMES.map((t) => (
            <button key={t.id} type="button" className="ans-tab" role="radio" aria-checked={t.id === themeId}
              tabIndex={t.id === themeId ? 0 : -1} onClick={() => setThemeId(t.id)} onKeyDown={onKey}>{t.label}</button>
          ))}
        </div>
      ) : null}
      {fits ? (
        <canvas ref={canvasRef} className="ans-card" width={ANSWERS_CARD_W} height={ANSWERS_CARD_H} role="img"
          aria-label={card.passage + ' ' + card.cite + (card.date ? ' ' + card.date : '')} />
      ) : (
        <div role="status">
          <p className="ans-empty">Choose a shorter passage</p>
          <p className="ans-note">{'A card holds ' + ANSWERS_CARD_MAX_WORDS + ' words at most; this passage has ' + words + '.'}</p>
        </div>
      )}
      <button type="button" className="ans-btn" disabled={!fits || busy} onClick={share}>Share</button>
    </AnsSheet>
  );
}
