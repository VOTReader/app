/* WelcomeScreen - the welcome (zv1; picture 8a-welcome) and "Show me around".

   The welcome is one bare page (no bars) a reader meets once, on a first visit (first-run-facts.js firstVisit, main's own
   flag): Begin reading goes Home; Show me around goes Home and starts the tour. The tour is an overlay over the real
   app: it rings each tab in turn, then Home's gear, with a card saying what each holds (Next / Leave; Escape leaves).
   Help's "Show me around" starts it too. Leaving the welcome or the tour sets main's own flags. A gate boot draws the
   picture and every control is inert. */
import { Icon } from '../Icon.jsx';
import { definePlace, defineStart, defineOverlay } from '../places.js';
import { here } from '../settings-pages.js';
import { TOUR, firstVisit, markWelcomed, markToured } from '../first-run-facts.js';

const g = /** @type {any} */ (globalThis);

/* ── the tour: one step at a time, -1 when off ─────────────────────────────────────────────────────────────────── */
let step = -1;
const subs = new Set();
const setStep = (n) => { step = n; subs.forEach((f) => f()); };
const subscribe = (f) => { subs.add(f); return () => { subs.delete(f); }; };

/** Starts the tour at its first stop (the welcome's and Help's Show me around). */
export function startTour() { setStep(0); }

/** Ends the tour (finished or left) and keeps main's flag. */
export function endTour() { setStep(-1); markToured(); }

/** The welcome page. @param {{ device: 'phone' | 'computer', onBegin?: () => void, onTour?: () => void, onReady?: () => void }} props */
export function WelcomeScreen({ device, onBegin, onTour, onReady }) {
  // ready once the app's mark is decoded (it is the page's first line); a picture that fails, or a page that loads no
  // pictures (no decode()), is ready at once
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => { if (shown && onReady) onReady(); }, [shown, onReady]);
  const img = React.useCallback((el) => {
    if (!el) return;
    const show = () => setShown(true);
    if (typeof el.decode === 'function') el.decode().then(show, show); else show();
  }, []);
  return (
    <>
      <img className="appicon" src="icons/icon-512.png" alt="" ref={img} />
      <span className="overline">VOTReader</span>
      <h1 className="display xl">The Volumes of Truth</h1>
      <p className="lede">Letters from The Lord, Our God and Savior, and the Scriptures of Truth, to read or to hear.</p>
      <div className="stack wel">
        <button type="button" className="pill block" onClick={onBegin}><span>Begin reading</span><Icon name="arrowR" /></button>
        <button type="button" className="btn2 block" onClick={onTour}>Show me around</button>
      </div>
      <p className="fine">{'Made by a disciple for personal study; not the canonical source. No account: what you mark stays on ' + here(device) + '.'}</p>
    </>
  );
}

/** The welcome place: bare (no bars), leaves to Home. */
function WelcomePlace({ gate, device, openTab, onReady }) {
  const leave = (tour) => () => {
    if (gate) return;
    markWelcomed();
    openTab('home');
    if (tour) startTour();
  };
  return <WelcomeScreen device={device} onBegin={leave(false)} onTour={leave(true)} onReady={onReady} />;
}

definePlace('welcome', { Screen: WelcomePlace, bare: true, contentClass: 'content welcome g', title: () => 'Welcome' });
defineStart(() => (firstVisit() ? [{ place: 'welcome' }] : null));

/** screens.css's --rail and --dlg (the laptop's rail and dialog widths). */
const RAIL = 88;
const DLG = 440;

/** A box kept 2 px inside a w x h window (a zero window leaves it as it is). */
export function clampBox(left, top, width, height, w, h) {
  if (!w || !h) return { left, top, width, height };
  const l = Math.max(2, left);
  const t = Math.max(2, top);
  return { left: l, top: t, width: Math.min(left + width, w - 2) - l, height: Math.min(top + height, h - 2) - t };
}

/**
 * The tour over the real app: a ring round the stop's control and a card beside it. A stop whose control is not on the
 * page is passed over.
 * @param {{ gate: any, desktop: boolean }} props
 */
function TourOverlay({ gate, desktop }) {
  const at = React.useSyncExternalStore(subscribe, () => step);
  const [rect, setRect] = React.useState(/** @type {DOMRect | null} */ (null));
  const on = !gate && at >= 0 && at < TOUR.length;
  React.useLayoutEffect(() => {
    if (!on) return undefined;
    let tries = 0;
    let raf = 0;
    // the page under it may still be painting (the welcome hands over to Home): look again for a few frames first
    const find = () => {
      const el = document.querySelector(TOUR[at].sel);
      if (el) { setRect(el.getBoundingClientRect()); return; }
      if (tries++ < 8 && typeof g.requestAnimationFrame === 'function') { raf = g.requestAnimationFrame(find); return; }
      if (at + 1 < TOUR.length) setStep(at + 1); else endTour();
    };
    find();
    const onKey = (e) => { if (e.key === 'Escape') endTour(); };
    g.addEventListener('resize', find);
    document.addEventListener('keydown', onKey);
    return () => {
      if (raf && typeof g.cancelAnimationFrame === 'function') g.cancelAnimationFrame(raf);
      g.removeEventListener('resize', find);
      document.removeEventListener('keydown', onKey);
    };
  }, [on, at]);
  if (!on || !rect) return null;
  const stop = TOUR[at];
  const last = at === TOUR.length - 1;
  const h = g.innerHeight || 0;
  const w = g.innerWidth || 0;
  // the card sits above a control in the lower half (the tab bar), below one in the upper half (the gear)
  const below = rect.top + rect.height / 2 < h / 2;
  const pad = 6;
  // the ring stays inside the window (a tab at the edge, the gear in the corner)
  const ring = clampBox(rect.left - pad, rect.top - pad, rect.width + pad * 2, rect.height + pad * 2, w, h);
  const cardY = below ? { top: ring.top + ring.height + 12 } : { bottom: h - ring.top + 12 };
  // on a computer the card stands under its control, inside the window past the rail
  const cardX = desktop && w ? { left: Math.max(RAIL + 16, Math.min(rect.left + rect.width / 2 - DLG / 2, w - DLG - 16)) } : {};
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Show me around">
      <div className="tour-ring" style={ring} />
      <div className="tour-card" style={{ ...cardY, ...cardX }}>
        <span className="overline">{'Show me around · ' + (at + 1) + ' of ' + TOUR.length}</span>
        <div className="t">{stop.t}</div>
        <p className="s">{stop.s}</p>
        <div className="actions">
          <button type="button" className="textbtn sm quiet" onClick={endTour}>Leave</button>
          <button type="button" className="pill sm" onClick={() => (last ? endTour() : setStep(at + 1))}>{last ? 'Done' : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}

defineOverlay('tour', TourOverlay);
