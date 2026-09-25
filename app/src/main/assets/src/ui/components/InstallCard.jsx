/* ═══════════════════════════════════════════════════════════════════════
   InstallCard — "Keep VOTReader on your home screen" (ip1, 2026-09-25)
   ═══════════════════════════════════════════════════════════════════════
   Built to lanes/myweb/out/mockups/ip1/ip1-r2-endcard.png (two ChatGPT
   image rounds). A card at the END of a chapter or letter, above the
   prev/next cards: part of the page, never a popup over the reading.
   utils/install-offer.js decides (installFlow, shouldOffer, dismiss):
     - browser only: never in the APK, an installed app, Firefox desktop or
       an in-app browser;
     - after a finished chapter (a read item, or the reader scrolled to
       this chapter's end with mark-as-read off);
     - one place a session; Maybe later (or the X) snoozes it 21 days,
       Don't ask again or three dismissals end it; an install ends it.
   Chromium that handed over beforeinstallprompt gets a real INSTALL
   VOTREADER button (the browser's own dialog). Everyone else gets SHOW ME
   HOW: numbered steps, each with a picture (install/*.jpg, cropped from
   the image rounds with the app's own icon pasted in). Per-browser state
   lives in localStorage: an install is this browser's, not the reader's
   data, so it is neither synced nor in a backup. No offline-audio promise
   (the PWA does not keep recordings the way the APK does).
   ═══════════════════════════════════════════════════════════════════════ */

import { installFlow, shouldOffer, dismiss, hasInstallPrompt, subscribeInstall, promptInstall } from '../../utils/install-offer.js';

const STATE_KEY = 'vot-install-offer';

/** The unit (chapter/letter) that showed the card this session; null until one has. */
let _sessionUnit = /** @type {string | null} */ (null);
/** Tests only. */
export function _resetInstallCardSession() { _sessionUnit = null; }

/** @returns {import('../../utils/install-offer.js').InstallOfferState} */
function _readState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null') || {}; } catch (_e) { return {}; }
}
/** @param {object} s */
function _writeState(s) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (_e) { /* storage blocked: it asks again next session */ }
}

/** Which way this browser installs, from the live environment. */
function _flow() {
  const g = /** @type {any} */ (globalThis);
  const nav = typeof navigator !== 'undefined' ? navigator : /** @type {any} */ ({});
  const ua = nav.userAgent || '';
  return installFlow(ua, {
    hasPrompt: hasInstallPrompt(),
    isApk: !!(g.PlatformBridge && g.PlatformBridge.isAndroid),
    standalone: !!(g.StorageHealth && typeof g.StorageHealth._isStandalone === 'function' && g.StorageHealth._isStandalone()),
    // iPadOS Safari says "Macintosh"; a touch screen gives it away.
    touchMac: /Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1,
  });
}

function _readCount() {
  const g = /** @type {any} */ (globalThis);
  try {
    const s = g.StateStore && g.StateStore.get();
    return s && s.readItems ? Object.keys(s.readItems).length : 0;
  } catch (_e) { return 0; }
}

/** The steps per flow: [picture, title, note?]. */
const STEPS = {
  'ios-safari': {
    title: 'Add to Home Screen',
    intro: 'In Safari:',
    steps: [
      ['install/ios-1.jpg', 'Tap the ••• button', 'At the bottom right. On an older iPhone the Share button is on the bottom bar: tap it and go to step 3.'],
      ['install/ios-2.jpg', 'Tap Share', null],
      ['install/ios-3.jpg', 'Tap Add to Home Screen', 'Scroll down the list if you do not see it.'],
      ['install/ios-4.jpg', 'Tap Add', 'VOTReader is now on your home screen.'],
    ],
  },
  'android-chrome': {
    title: 'Add to Home Screen',
    intro: 'In Chrome:',
    steps: [
      ['install/android-1.jpg', 'Tap the menu', 'The three dots at the top right.'],
      ['install/android-2.jpg', 'Tap Install app', 'Some phones say Add to Home screen.'],
      ['install/android-3.jpg', 'Tap Install', null],
    ],
  },
  samsung: {
    title: 'Add to Home Screen',
    intro: 'In Samsung Internet:',
    steps: [
      ['install/samsung-1.jpg', 'Tap the menu', 'The three lines at the bottom right.'],
      ['install/samsung-2.jpg', 'Tap Add page to', null],
      ['install/samsung-3.jpg', 'Tap Home screen', null],
      ['install/samsung-4.jpg', 'Tap Add', null],
    ],
  },
  desktop: {
    title: 'Install VOTReader on this computer',
    intro: 'In Chrome or Edge:',
    steps: [
      ['install/desktop-1.jpg', 'Click the install icon', 'At the right end of the address bar.'],
      ['install/desktop-2.jpg', 'Click Install', 'VOTReader opens in its own window.'],
    ],
  },
};
/** The browser's own dialog went away (used, or never came): show the steps for this kind of browser instead. */
const PROMPT_FALLBACK = () => (/Android/.test((typeof navigator !== 'undefined' && navigator.userAgent) || '') ? 'android-chrome' : 'desktop');

/**
 * @param {{ unitKey: string, inert?: boolean }} props
 */
export function InstallCard({ unitKey, inert = false }) {
  React.useSyncExternalStore(subscribeInstall, hasInstallPrompt);
  const [state, setState] = React.useState(_readState);
  const [stepsFor, setStepsFor] = React.useState(/** @type {string | null} */ (null));
  const [gone, setGone] = React.useState(false);
  const [reachedEnd, setReachedEnd] = React.useState(false);
  const sentinel = React.useRef(/** @type {HTMLDivElement | null} */ (null));

  const flow = inert ? null : _flow();
  const engaged = reachedEnd || _readCount() > 0;
  const otherUnit = _sessionUnit != null && _sessionUnit !== unitKey;
  const show = !gone && !otherUnit && shouldOffer(state, { flow, engaged, shownThisSession: false, now: Date.now() });

  // Mark-as-read off leaves no read item: arriving at this chapter's end after scrolling is the finished chapter.
  React.useEffect(() => {
    const el = sentinel.current;
    if (inert || !el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((entries) => {
      const scroller = el.closest('.screen-scroll');
      if (entries.some((e) => e.isIntersecting) && scroller && scroller.scrollTop > 0) setReachedEnd(true);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [inert]);

  // One place a session: the card claims the session when it is on screen (or at once without an observer).
  React.useEffect(() => {
    if (!show || _sessionUnit === unitKey) return undefined;
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') { _sessionUnit = unitKey; return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && _sessionUnit == null) _sessionUnit = unitKey;
    });
    io.observe(el);
    return () => io.disconnect();
  }, [show, unitKey]);

  const end = React.useCallback((/** @type {'later'|'never'|'installed'} */ how) => {
    const next = dismiss(_readState(), how, Date.now());
    _writeState(next);
    setState(next);
    setStepsFor(null);
    setGone(true);
  }, []);

  const onPrimary = React.useCallback(async () => {
    if (flow !== 'prompt') { setStepsFor(flow); return; }
    const outcome = await promptInstall();
    if (outcome === 'accepted') end('installed');
    else if (outcome === 'dismissed') end('later');
    else setStepsFor(PROMPT_FALLBACK());
  }, [flow, end]);

  if (inert) return null;
  const desktop = flow === 'desktop' || (flow === 'prompt' && !/Android|iPhone|iPad/.test(navigator.userAgent || ''));
  return (
    <>
      <div ref={sentinel} className="install-card-sentinel" aria-hidden="true" />
      {show && (
        <section className="install-card" aria-labelledby={'install-card-title-' + unitKey}>
          <button type="button" className="install-card-close" onClick={() => end('later')} aria-label="Not now">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
          <img className="install-card-icon" src="icons/icon-192.png" alt="" width="64" height="64" />
          <h2 className="install-card-title" id={'install-card-title-' + unitKey}>
            {desktop ? 'Keep VOTReader on this computer' : 'Keep VOTReader on your home screen'}
          </h2>
          <p className="install-card-body">
            {desktop
              ? 'Open it like an app, in its own window. Your reading and notes stay on this computer.'
              : 'Open it like an app, with one tap. Your reading and notes stay on this phone. It only takes a few taps.'}
          </p>
          <button type="button" className="install-card-primary" onClick={onPrimary}>
            {flow === 'prompt' ? 'Install VOTReader' : 'Show me how'}
          </button>
          <button type="button" className="install-card-later" onClick={() => end('later')}>Maybe later</button>
          <button type="button" className="install-card-never" onClick={() => end('never')}>{"Don't ask again"}</button>
        </section>
      )}
      {stepsFor && STEPS[/** @type {keyof typeof STEPS} */ (stepsFor)] && (
        <InstallSteps flow={/** @type {keyof typeof STEPS} */ (stepsFor)} onDone={() => end('later')} onClose={() => setStepsFor(null)} />
      )}
    </>
  );
}

/**
 * The SHOW ME HOW sheet: numbered steps, a picture each, Done.
 * @param {{ flow: keyof typeof STEPS, onDone: () => void, onClose: () => void }} props
 */
function InstallSteps({ flow, onDone, onClose }) {
  const s = STEPS[flow];
  const trapRef = useFocusTrap(true);
  const id = React.useId();
  useModalRegistry({ id: 'install-steps:' + id, dismiss: onClose, active: true });
  return ReactDOM.createPortal(
    <div className="install-steps-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="install-steps" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby={'install-steps-title-' + id}>
        <h2 className="install-steps-title" id={'install-steps-title-' + id}>{s.title}</h2>
        <p className="install-steps-intro">{s.intro}</p>
        <ol className="install-steps-list">
          {s.steps.map(([src, title, note], i) => (
            <li className="install-step" key={src}>
              <span className="install-step-num" aria-hidden="true">{i + 1}</span>
              <div className="install-step-text">
                <div className="install-step-title">{title}</div>
                {note ? <div className="install-step-note">{note}</div> : null}
              </div>
              <img className="install-step-pic" src={src} alt="" loading="lazy" />
            </li>
          ))}
        </ol>
        <button type="button" className="install-steps-done" onClick={onDone}>Done</button>
      </div>
    </div>,
    document.body,
  );
}
