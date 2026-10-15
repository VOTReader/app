/* InstallOffer - "Keep VOTReader on your home screen" (zv1; picture 8b-install), an overlay over every page.

   In a browser only (never in the APK or an installed app), from the second visit, once a session, a moment after the
   reader has moved off the first page, and never over a reading page or the welcome (first-run-facts.js offerNow, over
   main's own rules and per-browser state). A browser that handed over its install event gets Install VOTReader (the
   browser's own dialog); every other gets Show me how: main's steps, a picture each. Maybe later snoozes it 21 days,
   Don't ask again ends it, as does an install this window sees. A gate boot draws the picture and every control is
   inert. */
import { Icon } from '../Icon.jsx';
import { Sheet } from '../Sheet.jsx';
import { defineOverlay } from '../places.js';
import { hasInstallPrompt, wasInstalled, subscribeInstall, promptInstall } from '../../utils/install-offer.js';
import { liveFlow, visitNumber, readOffer, offerNow, offerWords, endOffer, STEPS } from '../first-run-facts.js';

const g = /** @type {any} */ (globalThis);

/** How long a page has to be open before the offer comes up over it (it never lands mid-move). */
const SETTLE_MS = 1500;

/** The offer has opened this session (main's rule: one place a session). */
let shownThisSession = false;

/** Tests only. */
export function _resetOfferSession() { shownThisSession = false; }

/** The browser's own dialog went away (used, or never came): main shows this kind of browser's steps instead. */
const promptFallback = () => (/Android/.test((g.navigator && g.navigator.userAgent) || '') ? 'android-chrome' : 'desktop');

/** A computer's words: the desktop steps, or Chromium's own dialog off a phone. @param {string | null} flow */
const onComputer = (flow) => flow === 'desktop' || (flow === 'prompt' && !/Android|iPhone|iPad/.test((g.navigator && g.navigator.userAgent) || ''));

/**
 * The offer sheet (the picture). `computer` picks the words (a computer's window, or a phone's home screen).
 * @param {{ flow: string | null, desktop: boolean, computer: boolean, onPrimary: () => void, onLater: () => void, onNever: () => void }} props
 */
export function OfferSheet({ flow, desktop, computer, onPrimary, onLater, onNever }) {
  const words = offerWords(computer);
  return (
    <Sheet kind="inst" label={words.title} desktop={desktop} onClose={onLater}>
      <div className="inst-h">
        <img className="appicon sm" src="icons/icon-512.png" alt="" />
        <div className="sh">{words.title}</div>
      </div>
      <p className="inst-p">{words.body}</p>
      {flow === 'prompt'
        ? <button type="button" className="pill block" onClick={onPrimary}><span>Install VOTReader</span><Icon name="down" /></button>
        : <button type="button" className="pill block" onClick={onPrimary}><span>Show me how</span><Icon name="arrowR" /></button>}
      <div className="inst-a">
        <button type="button" className="textbtn" onClick={onLater}>Maybe later</button>
        <button type="button" className="textbtn quiet" onClick={onNever}>{'Don’t ask again'}</button>
      </div>
    </Sheet>
  );
}

/**
 * Show me how: main's numbered steps for this browser, a picture each; Done snoozes the offer as Maybe later does.
 * @param {{ flow: keyof typeof STEPS, desktop: boolean, onDone: () => void, onClose: () => void }} props
 */
function StepsSheet({ flow, desktop, onDone, onClose }) {
  const s = STEPS[flow];
  return (
    <Sheet kind={'inst-steps' + (desktop ? '' : ' tall')} label={s.title} desktop={desktop} onClose={onClose}>
      <div className="sh">{s.title}</div>
      <p className="inst-p">{s.intro}</p>
      <ol className="inst-steps">
        {s.steps.map(([src, title, note], i) => (
          <li key={src}>
            <span className="n" aria-hidden="true">{i + 1}</span>
            <div className="w">
              <div className="t">{title}</div>
              {note ? <div className="s">{note}</div> : null}
            </div>
            <img src={src} alt="" loading="lazy" />
          </li>
        ))}
      </ol>
      <button type="button" className="pill block done" onClick={onDone}><span>Done</span></button>
    </Sheet>
  );
}

/** @param {{ route: any, gate: any, desktop: boolean }} props */
function InstallOverlay({ route, gate, desktop }) {
  const gateOpen = !!(gate && gate.open && gate.open.sheet === 'install');
  if (gate) {
    if (!gateOpen) return null;
    const flow = (gate.facts && gate.facts.install && gate.facts.install.flow) || 'prompt';
    const inert = () => {};
    // the gate's words follow the layout it draws (the picture is a phone's), not the browser that draws it
    return <OfferSheet flow={flow} desktop={desktop} computer={desktop} onPrimary={inert} onLater={inert} onNever={inert} />;
  }
  return <LiveOffer route={route} desktop={desktop} />;
}

/** @param {{ route: any, desktop: boolean }} props */
function LiveOffer({ route, desktop }) {
  React.useSyncExternalStore(subscribeInstall, hasInstallPrompt);
  const installed = React.useSyncExternalStore(subscribeInstall, wasInstalled);
  const [open, setOpen] = React.useState(false);
  const [stepsFor, setStepsFor] = React.useState(/** @type {string | null} */ (null));
  // the first page this load opened on; the offer waits until the reader has moved off it (Back to it still counts)
  const first = React.useRef(route);
  const movedRef = React.useRef(false);
  if (route !== first.current) movedRef.current = true;
  const moved = movedRef.current;
  const flow = liveFlow();

  // a page the reader stays on for a moment, where the rules say yes, opens the offer
  React.useEffect(() => {
    if (open || shownThisSession || !flow || installed) return undefined;
    const ok = offerNow({ flow, visit: visitNumber(), state: readOffer(), place: route.place, moved, shown: shownThisSession, now: Date.now() });
    if (!ok) return undefined;
    const t = setTimeout(() => { shownThisSession = true; setOpen(true); }, SETTLE_MS);
    return () => clearTimeout(t);
  }, [route, moved, flow, open, installed]);

  const end = React.useCallback((/** @type {'later' | 'never' | 'installed'} */ how) => {
    endOffer(how);
    setStepsFor(null);
    setOpen(false);
  }, []);

  // an install this window saw (the browser's own menu, its address-bar icon) ends the offer for good
  React.useEffect(() => {
    if (installed && !readOffer().never) end('installed');
  }, [installed, end]);

  const onPrimary = React.useCallback(async () => {
    if (flow !== 'prompt') { setStepsFor(flow); return; }
    const outcome = await promptInstall();
    if (outcome === 'accepted') end('installed');
    else if (outcome === 'dismissed') end('later');
    else setStepsFor(promptFallback());
  }, [flow, end]);

  if (stepsFor && STEPS[/** @type {keyof typeof STEPS} */ (stepsFor)]) {
    return <StepsSheet flow={/** @type {keyof typeof STEPS} */ (stepsFor)} desktop={desktop} onDone={() => end('later')} onClose={() => setStepsFor(null)} />;
  }
  if (!open || installed) return null;
  return <OfferSheet flow={flow} desktop={desktop} computer={onComputer(flow)} onPrimary={onPrimary} onLater={() => end('later')} onNever={() => end('never')} />;
}

defineOverlay('install', InstallOverlay);
