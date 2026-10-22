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
  ANSWERS_CARD_THEMES, ANSWERS_CARD_MAX_WORDS, ANSWERS_CARD_W, ANSWERS_CARD_H, answersCardWords, answersCardLayout,
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
  const words = answersCardWords(card.passage);
  const fits = words > 0 && words <= ANSWERS_CARD_MAX_WORDS;
  const theme = ANSWERS_CARD_THEMES.find((t) => t.id === themeId) || ANSWERS_CARD_THEMES[0];
  React.useEffect(() => { _theme = themeId; }, [themeId]);
  React.useEffect(() => {
    const c = canvasRef.current;
    if (!c || !fits) return undefined;
    const family = cardFamily();
    let live = true;
    drawAnswersCard(c, card, theme, family);
    // The serif may still be on its way: paint again once it is in.
    const fonts = typeof document !== 'undefined' ? /** @type {any} */ (document).fonts : null;
    if (fonts && typeof fonts.load === 'function') {
      fonts.load('60px ' + family).then(() => { if (live) drawAnswersCard(c, card, theme, family); }, () => {});
    }
    return () => { live = false; };
  }, [card, theme, fits]);
  const share = () => {
    const c = canvasRef.current;
    if (!c || busy || !fits) return;
    setBusy(true);
    shareCanvasImage(c, 'answer-card.png').then((outcome) => {
      setBusy(false);
      const say = outcome === 'saved' ? 'Card saved as an image.' : outcome === 'failed' ? 'Couldn’t share the card.' : '';
      if (say && typeof showToast === 'function') showToast({ id: 'vot-toast-copy', className: 'vot-toast', text: say });
      if (outcome === 'shared' || outcome === 'saved') onClose();
    });
  };
  const onKey = (/** @type {any} */ e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = ANSWERS_CARD_THEMES.indexOf(theme);
    const n = ANSWERS_CARD_THEMES.length;
    setThemeId(ANSWERS_CARD_THEMES[(i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n].id);
  };
  // The sheet fills the screen under the top bar, and the card is as large as leaves the theme control and Share in view.
  return (
    <AnsSheet label="Share as a card" tall onClose={onClose} head={<p className="ans-label">Share as a card</p>}>
      <div className="ans-tabs" role="tablist" aria-label="Card theme">
        {ANSWERS_CARD_THEMES.map((t) => (
          <button key={t.id} type="button" className="ans-tab" role="tab" aria-selected={t.id === themeId} aria-controls="ans-card"
            tabIndex={t.id === themeId ? 0 : -1} onClick={() => setThemeId(t.id)} onKeyDown={onKey}>{t.label}</button>
        ))}
      </div>
      {fits ? (
        <canvas id="ans-card" ref={canvasRef} width={ANSWERS_CARD_W} height={ANSWERS_CARD_H} role="img"
          aria-label={card.passage + ' ' + card.cite + (card.date ? ' ' + card.date : '')}
          style={{ display: 'block', width: '100%', maxWidth: 'calc((100vh - var(--dock-under-nav) - 310px) * 0.8)', height: 'auto', margin: '16px auto 0', borderRadius: 12, border: '1px solid var(--border)', boxSizing: 'border-box' }} />
      ) : (
        <div id="ans-card" role="status">
          <p className="ans-empty">Choose a shorter passage</p>
          <p className="ans-note">{'A card holds ' + ANSWERS_CARD_MAX_WORDS + ' words at most; this passage has ' + words + '.'}</p>
        </div>
      )}
      <div className="copy-fallback-actions">
        <button type="button" className="copy-fallback-btn primary" disabled={!fits || busy} style={fits ? undefined : { opacity: 0.45 }} onClick={share}>Share</button>
      </div>
    </AnsSheet>
  );
}
