/* ═══════════════════════════════════════════════════════════════════════
   InstallCard — "Keep VOTReader on your home screen" (ip1, 2026-09-25)
   ═══════════════════════════════════════════════════════════════════════
   Built to lanes/myweb/out/mockups/ip1/ip1-r2-endcard.png (two ChatGPT
   image rounds), then (UX wave 3, U01.3/U06.5) folded to one line UNDER the
   prev/next cards: "Keep VOTReader on your home screen · Install · Not now".
   The card sat between the text and Next letter, about 2,700 px tall at
   300%, so reaching the next letter meant scrolling past it. Part of the
   page, never a popup over the reading.
   utils/install-offer.js decides (installFlow, shouldOffer, dismiss):
     - browser only: never in the APK, an installed app, Firefox desktop or
       an in-app browser;
     - after a finished chapter (a read item, or the reader scrolled to
       this chapter's end with mark-as-read off: their own scroll, not a
       search jump that lands there, search200 UX B1);
     - one place a session; Not now snoozes it 21 days, three of them end
       it; an install ends it.
   Chromium that handed over beforeinstallprompt gets a real INSTALL
   VOTREADER button (the browser's own dialog). Everyone else gets SHOW ME
   HOW: numbered steps, each with a picture (install/*.jpg, cropped from
   the image rounds with the app's own icon pasted in). Per-browser state
   lives in localStorage: an install is this browser's, not the reader's
   data, so it is neither synced nor in a backup. No offline-audio promise
   (the PWA does not keep recordings the way the APK does).
   ═══════════════════════════════════════════════════════════════════════ */

import { installFlow, shouldOffer, dismiss, hasInstallPrompt, wasInstalled, subscribeInstall, promptInstall } from '../../utils/install-offer.js';
import { watchReaderScroll } from '../../utils/reader-hand.js';

const STATE_KEY = 'vot-install-offer';

/** The unit (chapter/letter) that showed the card this session; null until one has. */
let _sessionUnit = /** @type {string | null} */ (null);
/** Tests only. */
export function _resetInstallCardSession() { _sessionUnit = null; }

/* On screen (search200 UX B1): the long-press tip (AnnotationHint) waits while a card is in view, or the
   pill sits on the card's heading (both live at the bottom of a chapter's end). One id per card in view. */
const _onScreen = new Set();
const _onScreenSubs = new Set();
/** @param {string} id @param {boolean} on */
function _setOnScreen(id, on) {
  if (on === _onScreen.has(id)) return;
  if (on) _onScreen.add(id); else _onScreen.delete(id);
  _onScreenSubs.forEach((cb) => cb());
}
/** Whether an install card is on screen now. */
export function isInstallCardOnScreen() { return _onScreen.size > 0; }
/** @param {() => void} cb @returns {() => void} */
export function subscribeInstallCardOnScreen(cb) { _onScreenSubs.add(cb); return () => { _onScreenSubs.delete(cb); }; }

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

const _ua = () => (typeof navigator !== 'undefined' && navigator.userAgent) || '';
const _isAndroid = () => /Android/.test(_ua());
/** The end-of-chapter card never shows in an in-app browser; the Settings row does, to say where to go instead. */
const _cardFlow = () => { const f = _flow(); return f && /^in-app/.test(f) ? null : f; };

const IN_APP_INTRO = 'This is the browser inside another app, such as Messenger or Facebook. It cannot add VOTReader to your phone.';

/** The steps per flow: [picture or null, title, note?]. */
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
  /* Walked on Android 16, Chrome 133, Pixel launcher (2026-11-20): the menu says "Add to Home screen", Chrome then
     offers Install or Create shortcut and asks once more, and where Chrome cannot build a real app (no Google
     Play, GrapheneOS) the phone's own launcher asks last. Only that last tap puts the icon on the home screen.
     Pictures 2 to 4 are cropped from that walk. */
  'android-chrome': {
    title: 'Add to Home Screen',
    intro: 'In Chrome:',
    steps: [
      ['install/android-1.jpg', 'Tap the menu', 'The three dots at the top right.'],
      ['install/android-2.jpg', 'Tap Add to Home screen', 'Some phones say Install app.'],
      ['install/android-3.jpg', 'Tap Install', 'Not Create shortcut. If a box asks again, tap Install again.'],
      ['install/android-4.jpg', 'Tap Add to home screen', 'Your phone may ask this last. Cancel leaves no icon.'],
    ],
  },
  /* After the reader said Install in Chrome's dialog. Chrome calls that installed already, but on a phone that
     asks in a second box nothing is on the home screen until that box is answered; and a phone that installs a
     real app may put it in the list of apps only (Samsung's "Add new apps to Home screen" is off by default). */
  'android-after': {
    title: 'Almost done',
    intro: 'Your phone finishes the install:',
    steps: [
      ['install/android-4.jpg', 'Tap Add to home screen', 'If your phone shows this box. Cancel leaves no icon.'],
      [null, 'Look on your home screen', 'It can take a minute. Not there? Swipe up to your list of apps: some phones put it there. Press and hold it to drag it to the home screen.'],
      [null, 'Still not there?', 'Go to Settings and tap Install VOTReader. It shows each step with a picture.'],
    ],
  },
  /* An in-app browser cannot install anything and the browser never offers it there. The reader is told where to
     go; the menu names are the apps' own and vary, so each step says what else it may be called. */
  'in-app-android': {
    title: 'Open in Chrome first',
    intro: IN_APP_INTRO,
    steps: [
      [null, 'Tap the menu', 'The three dots at the top right of this screen.'],
      [null, 'Tap Open in Chrome', 'It may say Open in browser.'],
      [null, 'Come back here in Chrome', 'Settings, then Install VOTReader.'],
    ],
  },
  'in-app-ios': {
    title: 'Open in Safari first',
    intro: IN_APP_INTRO,
    steps: [
      [null, 'Tap the menu', 'The three dots at a corner of this screen.'],
      [null, 'Tap Open in Safari', 'It may say Open in browser or Open in external browser.'],
      [null, 'Come back here in Safari', 'Settings, then Install VOTReader.'],
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
  'ios-other': {
    title: 'Add to Home Screen',
    intro: 'In your browser:',
    steps: [
      [null, 'Tap Share', 'It may be inside the menu.'],
      [null, 'Tap Add to Home Screen', 'Scroll down the list if you do not see it.'],
      [null, 'Tap Add', null],
    ],
  },
  'firefox-android': {
    title: 'Add to Home Screen',
    intro: 'In Firefox:',
    steps: [
      [null, 'Tap the menu', 'The three dots.'],
      [null, 'Tap Add app to Home screen', 'It may say Install.'],
      [null, 'Tap Add to home screen', 'Your phone may ask this last. Cancel leaves no icon.'],
    ],
  },
  'mac-safari': {
    title: 'Add VOTReader to the Dock',
    intro: 'In Safari:',
    steps: [
      [null, 'Open the File menu', 'In the menu bar at the top of the screen.'],
      [null, 'Choose Add to Dock', null],
      [null, 'Click Add', 'VOTReader opens in its own window.'],
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
  // The unit whose end the reader scrolled to (null until one): another unit's end is not this one's.
  const [reachedEnd, setReachedEnd] = React.useState(/** @type {string | null} */ (null));
  const sentinel = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const cardRef = React.useRef(/** @type {HTMLElement | null} */ (null));
  const cardId = React.useId();

  const flow = inert ? null : _cardFlow();
  const engaged = reachedEnd === unitKey || _readCount() > 0;
  const otherUnit = _sessionUnit != null && _sessionUnit !== unitKey;
  const installed = React.useSyncExternalStore(subscribeInstall, wasInstalled);
  const show = !gone && !installed && !otherUnit && shouldOffer(state, { flow, engaged, shownThisSession: false, now: Date.now() });

  // Mark-as-read off leaves no read item: arriving at this chapter's end after scrolling is the finished chapter.
  // The scroll must be the reader's own (search200 UX B1): a search hit near the end lands the end on screen,
  // and that jump is a look, not a finished chapter. Once the reader has moved this page (utils/reader-hand.js),
  // its end counts, a fling's momentum included.
  React.useEffect(() => {
    const el = sentinel.current;
    const scroller = el && el.closest('.screen-scroll');
    if (inert || !el || !scroller || typeof IntersectionObserver === 'undefined') return undefined;
    let readerScrolled = false;
    let atEnd = false;
    const check = () => { if (atEnd && readerScrolled && scroller.scrollTop > 0) setReachedEnd(unitKey); };
    const stopWatch = watchReaderScroll(scroller, () => { readerScrolled = true; check(); });
    const io = new IntersectionObserver((entries) => {
      if (entries.length) atEnd = entries[entries.length - 1].isIntersecting;
      check();
    });
    io.observe(el);
    scroller.addEventListener('scroll', check, { passive: true });
    return () => {
      io.disconnect();
      stopWatch();
      scroller.removeEventListener('scroll', check);
    };
  }, [inert, unitKey]);

  // On screen for the long-press tip: the card in view (or, without an observer, the card shown).
  React.useEffect(() => {
    const el = cardRef.current;
    if (!show || !el) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      _setOnScreen(cardId, true);
      return () => _setOnScreen(cardId, false);
    }
    const io = new IntersectionObserver((entries) => { if (entries.length) _setOnScreen(cardId, entries[entries.length - 1].isIntersecting); });
    io.observe(el);
    return () => { io.disconnect(); _setOnScreen(cardId, false); };
  }, [show, cardId]);

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

  /* W56: an install from the browser's own menu (or the address-bar icon) fires appinstalled and nothing
     else; the card only lost its event and fell back to SHOW ME HOW for an app already installed, then asked
     again in the browser tab every session. An install this window saw hides the card at once (`show`) and
     ends the offer for good, here or on the next card to mount. */
  React.useEffect(() => {
    if (installed && !inert && !state.never) end('installed');
  }, [installed, inert, state.never, end]);

  const onPrimary = React.useCallback(async () => {
    if (flow !== 'prompt') { setStepsFor(flow); return; }
    const outcome = await promptInstall();
    if (outcome === 'accepted') end('installed');
    else if (outcome === 'dismissed') end('later');
    else setStepsFor(PROMPT_FALLBACK());
  }, [flow, end]);

  // A swipe peek keeps the sentinel's line (TABS2: the page under the finger is laid out as the page it becomes).
  if (inert) return <div className="install-card-sentinel" aria-hidden="true" />;
  const desktop = flow === 'desktop' || (flow === 'prompt' && !/Android|iPhone|iPad/.test(navigator.userAgent || ''));
  return (
    <>
      <div ref={sentinel} className="install-card-sentinel" aria-hidden="true" />
      {show && (
        <section ref={cardRef} className="install-card" aria-labelledby={'install-card-title-' + unitKey}>
          <img className="install-card-icon" src="icons/icon-192.png" alt="" width="28" height="28" />
          <span className="install-card-title" id={'install-card-title-' + unitKey}>
            {desktop ? 'Keep VOTReader on this computer' : 'Keep VOTReader on your home screen'}
          </span>
          <span className="install-card-actions">
            <button type="button" className="install-card-primary" onClick={onPrimary}>
              {flow === 'prompt' ? 'Install' : 'Show me how'}
            </button>
            <button type="button" className="install-card-later" onClick={() => end('later')}>Not now</button>
          </span>
        </section>
      )}
      {stepsFor && STEPS[/** @type {keyof typeof STEPS} */ (stepsFor)] && (
        <InstallSteps flow={/** @type {keyof typeof STEPS} */ (stepsFor)} onDone={() => end('later')} onClose={() => setStepsFor(null)} />
      )}
    </>
  );
}

/**
 * Settings > Help > "Install VOTReader" (PO2 item 19). The end-of-chapter card is gone from the reading flow;
 * this row is where a reader installs. Never in the APK or an installed app (installFlow says null).
 * A Chromium that handed over beforeinstallprompt opens the browser's own dialog; everyone else gets the steps;
 * an in-app browser (Messenger, Facebook) is told to open the page in the phone's real browser first.
 *
 * On Android "installed" is not "on the home screen" (walked 2026-11-20, see STEPS): Chrome answers accepted and
 * fires appinstalled before the phone's own "Add to home screen" box is answered, and Cancel or Back there leaves
 * no icon. So after Install the reader is told what the phone asks next and where the icon lands, and the row
 * stays: a second tap shows the steps by hand. On a computer the install is done when Chrome says so, and the
 * row goes.
 *
 * `Row` (the Settings root passes UiParts' ListRow) draws it as a root row. The Help group this row was born in
 * is not a screen the root opens (st-root, 2026-11-11), so from that day until this prop no reader could reach
 * it: the tests mounted Settings with every group open and never saw the root without it.
 * @param {{ Row?: any }} props
 */
export function InstallRow({ Row = null }) {
  React.useSyncExternalStore(subscribeInstall, hasInstallPrompt);
  const installed = React.useSyncExternalStore(subscribeInstall, wasInstalled);
  const [stepsFor, setStepsFor] = React.useState(/** @type {string | null} */ (null));
  const flow = _flow();
  const onTap = async () => {
    if (flow !== 'prompt') { setStepsFor(flow); return; }
    const outcome = await promptInstall();
    if (outcome === 'accepted') {
      _writeState(dismiss(_readState(), _isAndroid() ? 'later' : 'installed', Date.now()));
      if (_isAndroid()) setStepsFor('android-after');
    } else if (outcome !== 'dismissed') setStepsFor(PROMPT_FALLBACK());
  };
  if (!flow || (installed && !_isAndroid())) return null;
  const computer = flow === 'desktop' || (flow === 'prompt' && !/Android|iPhone|iPad/.test(_ua()));
  const meta = /^in-app/.test(flow) ? 'Open in your browser first' : computer ? 'Keep it on this computer' : 'Keep it on your home screen';
  return (
    <>
      {Row ? (
        <Row icon="phone" title="Install VOTReader" meta={meta} onClick={onTap} className="settings-help-install" />
      ) : (
        <button type="button" className="settings-help-about settings-help-install" onClick={onTap}>
          <span>Install VOTReader</span>
          <span className="settings-select-chev" aria-hidden="true">{'›'}</span>
        </button>
      )}
      {stepsFor && STEPS[/** @type {keyof typeof STEPS} */ (stepsFor)] && (
        <InstallSteps flow={/** @type {keyof typeof STEPS} */ (stepsFor)} onDone={() => setStepsFor(null)} onClose={() => setStepsFor(null)} />
      )}
    </>
  );
}

/* ── The install popup ────────────────────────────────────────────────────────────────────────────────────────
   Corbin 2026-11-20: "many apps these days or websites simply have the popup to install on home screen as app
   happen automatically", "no walkthrough's or rigamarole". Chrome draws no popup of its own (walked on Chrome 133
   that day: with beforeinstallprompt left alone, nothing appears), so the popup those sites show is their own,
   and this is ours: it comes up by itself on Home once the browser has said the app can be installed. Install
   opens the browser's own dialog, and that is the whole install. Not on a reading page (PO2 19), not over the
   tour or another dialog, once a session; Not now waits 21 days and the third one ends it (install-offer).
   In an in-app browser (Messenger, Facebook) nothing can be installed, and a link tapped in Messenger opens
   there: the same popup offers the way out, the phone's own browser, as a link and in words.
   Safari and the other browsers (Corbin, the same day: "build the same popup feature for safari and other
   browsers (not walkthroughs)"): only Chromium hands a page an install it can start. Safari, on a phone or a
   Mac, and Firefox have none (no beforeinstallprompt; the Share sheet a page can open has no Add to Home
   Screen), so there the same popup says, in one line, where that browser keeps its own. */
const ASK_HOW = {
  'ios-safari': 'In Safari, tap Share (it may be under \u2022\u2022\u2022), then Add to Home Screen.',
  'ios-other': 'In your browser, tap Share, then Add to Home Screen.',
  'android-chrome': 'Tap the three dots at the top right, then Add to Home screen, then Install.',
  samsung: 'Tap the three lines at the bottom right, then Add page to, then Home screen.',
  'firefox-android': 'Tap the three dots, then Add app to Home screen. It may say Install.',
  desktop: 'Click the install icon at the right end of the address bar, then Install.',
  'mac-safari': 'In the menu bar, choose File, then Add to Dock.',
};
const POPUP_DELAY_MS = 1500;
/* A Chromium hands its install event over some seconds after the page is up (the worker and the manifest are
   checked first). Until it has, the popup could only describe the menu; it waits this long for the button. */
const POPUP_EVENT_WAIT_MS = 8000;
const _eventMayCome = (/** @type {string | null} */ f) => f === 'android-chrome' || f === 'samsung' || f === 'desktop';
let _popupSeen = false;
/** Tests only. */
export function _resetInstallPopupSession() { _popupSeen = false; }

/** The tour or another dialog has the screen. */
function _screenTaken() {
  const g = /** @type {any} */ (globalThis);
  try { if (g.TourController && g.TourController.getState().active) return true; } catch (_e) { /* no tour on this page */ }
  try { if (g.ModalRegistry && g.ModalRegistry.isAnyOpen()) return true; } catch (_e) { /* no registry on this page */ }
  return typeof document !== 'undefined' && !!document.querySelector('[aria-modal="true"]');
}

/**
 * This page, addressed to the phone's own browser from inside another app's: Chrome by an Android intent link,
 * Safari by its x-safari-https scheme. Where the in-app browser does not follow such links, nothing happens and
 * the popup's words say what to tap instead.
 * @param {string} flow @param {string} here
 */
export function ownBrowserUrl(flow, here) {
  const url = String(here || '').split('#')[0];
  if (flow === 'in-app-ios') return 'x-safari-' + url;
  const scheme = /^http:/.test(url) ? 'http' : 'https';
  return 'intent://' + url.replace(/^https?:\/\//, '') + '#Intent;scheme=' + scheme + ';package=com.android.chrome;end';
}

/** @param {{ screen: string }} props */
export function InstallPopup({ screen }) {
  React.useSyncExternalStore(subscribeInstall, hasInstallPrompt);
  const [kind, setKind] = React.useState(/** @type {string | null} */ (null));
  const [stepsFor, setStepsFor] = React.useState(/** @type {string | null} */ (null));
  const flow = _flow();
  const offer = flow;   // every browser with a way to install: a button where the browser gives one, a line where not
  const due = !kind && !_popupSeen && screen === 'home' && !!offer
    && shouldOffer(_readState(), { flow: offer, engaged: true, shownThisSession: false, now: Date.now() });
  React.useEffect(() => {
    if (!due) return undefined;
    const t = setTimeout(() => {
      if (_popupSeen || _screenTaken()) return;   // the next arrival on Home asks instead
      _popupSeen = true;
      setKind(offer);
    }, _eventMayCome(offer) ? POPUP_EVENT_WAIT_MS : POPUP_DELAY_MS);
    return () => clearTimeout(t);
  }, [due, offer]);
  // The event arrived while the popup was describing the menu: it gets its button.
  const shown = kind && _eventMayCome(kind) && flow === 'prompt' ? 'prompt' : kind;

  const later = React.useCallback(() => { _writeState(dismiss(_readState(), 'later', Date.now())); setKind(null); }, []);
  const install = React.useCallback(async () => {
    setKind(null);
    const outcome = await promptInstall();
    if (outcome === 'accepted') {
      // A computer's yes is the install. A phone's is not yet an icon (see InstallRow): say what comes next, and
      // ask again in 21 days if this browser can still install then.
      _writeState(dismiss(_readState(), _isAndroid() ? 'later' : 'installed', Date.now()));
      if (_isAndroid()) setStepsFor('android-after');
    } else if (outcome === 'dismissed') _writeState(dismiss(_readState(), 'later', Date.now()));
    else setStepsFor(PROMPT_FALLBACK());
  }, []);

  if (stepsFor && STEPS[/** @type {keyof typeof STEPS} */ (stepsFor)]) {
    return <InstallSteps flow={/** @type {keyof typeof STEPS} */ (stepsFor)} onDone={() => setStepsFor(null)} onClose={() => setStepsFor(null)} />;
  }
  return shown ? <InstallAsk kind={shown} onInstall={install} onLater={later} /> : null;
}

/**
 * The popup itself: the app's icon, one line, and Install where the browser lets a page start one (or the way
 * out of an in-app browser) with Not now; where the browser keeps its install to itself, the line saying where,
 * and Got it.
 * @param {{ kind: string, onInstall: () => void, onLater: () => void }} props
 */
function InstallAsk({ kind, onInstall, onLater }) {
  const trapRef = useFocusTrap(true);
  const id = React.useId();
  useModalRegistry({ id: 'install-ask:' + id, dismiss: onLater, active: true });
  const inApp = /^in-app/.test(kind);
  const browser = kind === 'in-app-ios' ? 'Safari' : 'Chrome';
  const how = ASK_HOW[/** @type {keyof typeof ASK_HOW} */ (kind)] || null;
  const computer = !inApp && (kind === 'desktop' || kind === 'mac-safari' || (kind === 'prompt' && !/Android|iPhone|iPad/.test(_ua())));
  const line = inApp ? 'This is the browser inside another app, such as Messenger. It cannot install apps. Open VOTReader in ' + browser + ' and install it there.'
    : computer ? 'Keep it on this computer. It opens in its own window, like an app.'
      : 'Keep it on your home screen. It opens full screen, like an app.';
  return ReactDOM.createPortal(
    <div className="install-steps-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onLater(); }}>
      <div className="install-steps install-ask" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby={'install-ask-title-' + id} data-focus-self="">
        <img className="install-ask-icon" src="icons/icon-192.png" alt="" width="56" height="56" />
        <h2 className="install-steps-title" id={'install-ask-title-' + id}>Install VOTReader</h2>
        <p className="install-steps-intro">{line}</p>
        {how ? <p className="install-ask-how">{how}</p> : null}
        {how ? null : inApp
          ? <a className="install-ask-go" href={ownBrowserUrl(kind, typeof location !== 'undefined' ? location.href : '')}>Open in {browser}</a>
          : <button type="button" className="install-ask-go" onClick={onInstall}>Install</button>}
        {inApp ? <p className="install-ask-note">If nothing happens, tap the three dots at the top of this screen, then Open in {browser}.</p> : null}
        <button type="button" className="install-steps-done" onClick={onLater}>{how ? 'Got it' : 'Not now'}</button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The SHOW ME HOW sheet: numbered steps, a picture where there is one, Done.
 * @param {{ flow: keyof typeof STEPS, onDone: () => void, onClose: () => void }} props
 */
function InstallSteps({ flow, onDone, onClose }) {
  const s = STEPS[flow];
  const trapRef = useFocusTrap(true);
  const id = React.useId();
  useModalRegistry({ id: 'install-steps:' + id, dismiss: onClose, active: true });
  return ReactDOM.createPortal(
    <div className="install-steps-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {/* data-focus-self: focus goes to the sheet, not to Done at its foot. Focusing Done scrolled a sheet
          taller than the screen (four steps on a short phone, any sheet at large text) to its last step. */}
      <div className="install-steps" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby={'install-steps-title-' + id} data-focus-self="">
        <h2 className="install-steps-title" id={'install-steps-title-' + id}>{s.title}</h2>
        <p className="install-steps-intro">{s.intro}</p>
        <ol className="install-steps-list">
          {s.steps.map(([src, title, note], i) => (
            <li className={'install-step' + (src ? '' : ' install-step-plain')} key={i}>
              <span className="install-step-num" aria-hidden="true">{i + 1}</span>
              <div className="install-step-text">
                <div className="install-step-title">{title}</div>
                {note ? <div className="install-step-note">{note}</div> : null}
              </div>
              {src ? <img className="install-step-pic" src={src} alt="" loading="lazy" /> : null}
            </li>
          ))}
        </ol>
        <button type="button" className="install-steps-done" onClick={onDone}>Done</button>
      </div>
    </div>,
    document.body,
  );
}
