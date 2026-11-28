/* ═══════════════════════════════════════════════════════════════════════
   InstallCard.jsx — installing VOTReader from the browser
   ═══════════════════════════════════════════════════════════════════════
   InstallPopup   the offer, on Home, once it is earned (utils/install-offer.js earned/shouldOffer) and the session
                  is its to speak in (utils/unasked.js). Never over a reading page.
   InstallRow     Settings > Install VOTReader, always there where this browser can install.
   InstallSteps   numbered steps with a picture each (install/*.jpg), for a browser that keeps its install to itself.
   The end-of-chapter card (ip1, 2026-09-25) left the reading flow in 814baf2f6 and was deleted with the newcomer
   work (2026-11-27). Per-browser state lives in localStorage ('vot-install-offer'): an install is this browser's,
   not the reader's data, so it is neither synced nor in a backup. Never in the APK, an installed app, Firefox on a
   computer; an in-app browser is told to open the page in the phone's own browser.
   ═══════════════════════════════════════════════════════════════════════ */

import { want, claim, canShow, finishedReadings, readOnEarlierDay, isFirstRunSession, subscribeUnasked, unaskedVersion } from '../../utils/unasked.js';
import { installFlow, shouldOffer, earned, noteShown, dismiss, seemsInstalled, markStandalone, hasInstallPrompt, wasInstalled, subscribeInstall, promptInstall } from '../../utils/install-offer.js';

const STATE_KEY = 'vot-install-offer';

/** Whether this session has shown "Almost done" (one sheet, whoever saw the install first). */
let _afterTold = false;
/** Whether this session has written down that the browser said "installed" (once, whoever heard it first). */
let _installNoted = false;
/** Tests only. */
export function _resetInstallCardSession() { _afterTold = false; _installNoted = false; }

/** @returns {import('../../utils/install-offer.js').InstallOfferState} */
function _readState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null') || {}; } catch (_e) { return {}; }
}
/** @param {object} s */
function _writeState(s) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (_e) { /* storage blocked: it asks again next session */ }
}

/**
 * The browser said the app was installed (our button, or its own menu): the offer waits 21 days and then looks
 * again, since on a phone that yes is not yet an icon. Written once a session.
 * @returns {import('../../utils/install-offer.js').InstallOfferState}
 */
function _noteInstalled() {
  if (_installNoted) return _readState();
  _installNoted = true;
  const next = dismiss(_readState(), 'installed', Date.now());
  _writeState(next);
  return next;
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

const _ua = () => (typeof navigator !== 'undefined' && navigator.userAgent) || '';
const _isAndroid = () => /Android/.test(_ua());

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
      ['install/android-4.jpg', 'Tap Add to home screen', 'Your phone may ask this last. Cancel leaves no icon. You can also press and hold the icon in the box and drag it to your home screen.'],
    ],
  },
  /* After the reader said Install in Chrome's dialog. Chrome calls that installed already, but on a phone that
     asks in a second box nothing is on the home screen until that box is answered; and a phone that installs a
     real app may put it in the list of apps only (Samsung's "Add new apps to Home screen" is off by default).
     Walked again on Android 17 with the Pixel launcher (2026-11-20, Chrome 145): the box's button puts the icon
     on the SECOND home-screen page, with the first page half empty. And launchers built on Android 16 QPR1 and
     later, GrapheneOS's among them, are reported to hold the button's icon back until the launcher restarts
     (GrapheneOS forum, threads 28708 and 28641); dragging the icon out of the box places it at once. */
  'android-after': {
    title: 'Almost done',
    intro: 'Your phone finishes the install:',
    steps: [
      ['install/android-4.jpg', 'Tap Add to home screen', 'If your phone shows this box. Cancel leaves no icon.'],
      [null, 'Look on your home screen', 'Swipe sideways too: many phones put a new icon on the second page. It can take a minute.'],
      [null, 'Not there?', 'Swipe up to your list of apps and look for VOTReader. Press and hold it to drag it to the home screen.'],
      [null, 'Still not there?', 'Install again: Settings, then Install VOTReader. When the box in the picture comes up, press and hold the icon in it and drag it onto your home screen.'],
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
      if (_isAndroid()) _tellAfter(setStepsFor);
      else _noteInstalled();
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
   tour or another dialog. When (newcomer, Corbin 2026-11-27: "Move the PWA install icon to a popup that shows
   after using the app for an hour, instead of immediately, or whatever is most professional"): never in the first
   session; after that, a later-day return with one finished reading, or three finished readings; and only in a
   session nothing else has spoken in (utils/unasked.js). A showing counts when it shows, answered or not: the offer
   then waits 21 days, and after two showings not ended by an install it stops (install-offer's DECLINES_TO_STOP;
   Settings > Install VOTReader stays). What a page can know of "installed" is install-offer's seemsInstalled.
   A computer's Chrome or Edge is asked only with the button in hand: no install event from it means the app is
   there already, so it is not told about the address bar.
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
  'mac-safari': 'In the menu bar, choose File, then Add to Dock.',
};
/* Corbin 2026-11-21: "Be careful with firefox and safari, we don't want to install over a preexisting pwa". Looked
   up that day (caniuse and MDN for getInstalledRelatedApps; WebKit's Safari 17.2 notes on Home Screen storage): only
   Chromium tells a page that the app is installed. Safari and Firefox have no such call and no install event, and an
   iPhone's or a Mac's installed copy keeps storage of its own (cookies are copied once, when it is added), so a
   Safari tab cannot even leave itself a note. Adding it again there makes a second copy, and that copy starts
   empty. So wherever the popup can only say where the browser keeps its install, it also says what to do if the
   app is there already, and takes the reader's word for it ("I already have it", 180 days). */
const ASK_HAVE = {
  'ios-safari': 'Already on your Home Screen? Open it there. Adding it again makes a second copy that starts empty.',
  'ios-other': 'Already on your Home Screen? Open it there. Adding it again makes a second copy that starts empty.',
  'mac-safari': 'Already in your Dock? Open it there. Adding it again makes a second copy that starts empty.',
  'android-chrome': 'Already on your Home screen? Open it there.',
  samsung: 'Already on your Home screen? Open it there.',
  'firefox-android': 'Already on your Home screen? Open it there.',
};
const POPUP_DELAY_MS = 1500;
/* A Chromium hands its install event over some seconds after the page is up (the worker and the manifest are
   checked first). Until it has, the popup could only describe the menu; it waits this long for the button. */
const POPUP_EVENT_WAIT_MS = 8000;
/* A driven browser (the walks' headless Chrome says navigator.webdriver, as use-web-renderer's walkOn reads it)
   is nobody to ask: the popup would lie over the screens a walk photographs (rel33: e2e-tabs' cards came out
   dimmed by its backdrop). A walk that wants the popup sets window.__votInstallPopup = true first. */
const _driven = () => typeof navigator !== 'undefined' && navigator.webdriver === true
  && /** @type {any} */ (globalThis).__votInstallPopup !== true;
/* What the browser says of an installed app here (see install-offer's seemsInstalled): null until it answers. */
let _related = /** @type {boolean | null} */ (null);
function _askRelated() {
  const nav = /** @type {any} */ (typeof navigator !== 'undefined' ? navigator : null);
  if (!nav || typeof nav.getInstalledRelatedApps !== 'function') return Promise.resolve(null);
  try {
    return Promise.resolve(nav.getInstalledRelatedApps()).then(
      (/** @type {any} */ apps) => { _related = Array.isArray(apps) ? apps.length > 0 : null; return _related; },
      () => null,
    );
  } catch (_e) { return Promise.resolve(null); }
}
const _standalone = () => {
  const g = /** @type {any} */ (globalThis);
  return !(g.PlatformBridge && g.PlatformBridge.isAndroid)
    && !!(g.StorageHealth && typeof g.StorageHealth._isStandalone === 'function' && g.StorageHealth._isStandalone());
};
const _eventMayCome = (/** @type {string | null} */ f) => f === 'android-chrome' || f === 'samsung' || f === 'desktop';
let _popupSeen = false;
/** Tests only. */
export function _resetInstallPopupSession() { _popupSeen = false; _related = null; _afterTold = false; _installNoted = false; }

/**
 * After Install on a phone, however it was started (our popup, the Settings row, or Chrome's own menu): say once
 * what the phone asks next and where the icon lands, and do not ask again for 21 days. A phone's yes is not yet
 * an icon (see InstallRow): after the 21 days a tab asks again unless the icon has been used.
 * @param {(flow: string) => void} show the caller's own setStepsFor
 */
function _tellAfter(show) {
  if (_afterTold) return;
  _afterTold = true;
  _popupSeen = true;
  _noteInstalled();
  show('android-after');
}

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
  React.useSyncExternalStore(subscribeUnasked, unaskedVersion);
  const flow = _flow();
  const offer = flow;   // every browser with a way to install: a button where the browser gives one, a line where not
  // Due this session (wherever the reader is): the offer is earned and not resting. Shown only on Home, and only
  // when the session is the popup's to speak in; while it is due, the plan offer and the tip wait their turn.
  const engaged = earned({ firstRun: isFirstRunSession(), finished: finishedReadings(), laterDay: readOnEarlierDay() });
  const wanted = !kind && !_popupSeen && !!offer && !_driven()
    && shouldOffer(_readState(), { flow: offer, engaged, shownThisSession: false, now: Date.now() });
  const due = wanted && screen === 'home' && canShow('install', { pause: true });
  React.useEffect(() => { want('install', wanted); }, [wanted]);
  // Ask the browser once whether the app is installed here; a run from the app's own icon is written down, so a
  // tab of the same browser knows not to ask a reader who has it.
  React.useEffect(() => {
    let live = true;
    _askRelated().then((related) => {
      if (live && _standalone()) _writeState(markStandalone(_readState(), Date.now(), related == null ? undefined : related));
    });
    return () => { live = false; };
  }, []);
  React.useEffect(() => {
    if (!due) return undefined;
    const t = setTimeout(() => {
      if (_popupSeen || _screenTaken()) return;   // the next arrival on Home asks instead
      if (seemsInstalled(_readState(), { now: Date.now(), related: _related, hasPrompt: hasInstallPrompt(), android: _isAndroid(), flow: offer })) { want('install', false); return; }
      if (!claim('install', { pause: true })) return;
      _popupSeen = true;
      _writeState(noteShown(_readState(), Date.now()));
      setKind(offer);
    }, _eventMayCome(offer) ? POPUP_EVENT_WAIT_MS : POPUP_DELAY_MS);
    return () => clearTimeout(t);
  }, [due, offer]);
  // The popup belongs to Home: if the screen changes under it (a link, the back key), it goes, and that is no
  // answer from the reader.
  React.useEffect(() => { if (screen !== 'home') setKind(null); }, [screen]);
  /* Corbin 2026-11-20: "if I try to install via chrome, the app icon doesn't appear". An install made from
     Chrome's own menu fires appinstalled and nothing else, and where the phone then leaves no icon the page said
     nothing at all. On a phone it gets the same "Almost done" as an install started here. A computer's install is
     done when Chrome says so. */
  const installed = React.useSyncExternalStore(subscribeInstall, wasInstalled);
  React.useEffect(() => {
    if (!installed || _standalone()) return;
    setKind(null);
    if (_isAndroid()) _tellAfter(setStepsFor);
    else _noteInstalled();
  }, [installed]);
  // The event arrived while the popup was describing the menu: it gets its button.
  const shown = kind && _eventMayCome(kind) && flow === 'prompt' ? 'prompt' : kind;

  const later = React.useCallback(() => { _writeState(dismiss(_readState(), 'later', Date.now())); setKind(null); }, []);
  const have = React.useCallback(() => { _writeState(dismiss(_readState(), 'have', Date.now())); setKind(null); }, []);
  const install = React.useCallback(async () => {
    setKind(null);
    const outcome = await promptInstall();
    if (outcome === 'accepted') {
      // A computer's yes is the install. A phone's is not yet an icon (see InstallRow): say what comes next. Either
      // way the offer waits 21 days and then looks again.
      if (_isAndroid()) _tellAfter(setStepsFor);
      else _noteInstalled();
    } else if (outcome === 'dismissed') _writeState(dismiss(_readState(), 'later', Date.now()));
    else setStepsFor(PROMPT_FALLBACK());
  }, []);

  if (stepsFor && STEPS[/** @type {keyof typeof STEPS} */ (stepsFor)]) {
    return <InstallSteps flow={/** @type {keyof typeof STEPS} */ (stepsFor)} onDone={() => setStepsFor(null)} onClose={() => setStepsFor(null)} />;
  }
  return shown ? <InstallAsk kind={shown} onInstall={install} onLater={later} onHave={have} /> : null;
}

/**
 * The popup itself: the app's icon, one line, and Install where the browser lets a page start one (or the way
 * out of an in-app browser) with Not now; where the browser keeps its install to itself, the line saying where,
 * and Got it, with what to do if the app is there already and "I already have it".
 * @param {{ kind: string, onInstall: () => void, onLater: () => void, onHave: () => void }} props
 */
function InstallAsk({ kind, onInstall, onLater, onHave }) {
  const trapRef = useFocusTrap(true);
  const id = React.useId();
  useModalRegistry({ id: 'install-ask:' + id, dismiss: onLater, active: true });
  const inApp = /^in-app/.test(kind);
  const browser = kind === 'in-app-ios' ? 'Safari' : 'Chrome';
  const how = ASK_HOW[/** @type {keyof typeof ASK_HOW} */ (kind)] || null;
  const haveNote = how ? ASK_HAVE[/** @type {keyof typeof ASK_HAVE} */ (kind)] || null : null;
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
        {haveNote ? <p className="install-ask-note install-ask-have-note">{haveNote}</p> : null}
        {inApp ? <p className="install-ask-note">If the button does nothing, tap the three dots at the top of this screen, then Open in {browser}.</p> : null}
        {/* The buttons stay at the foot of the sheet while its words scroll: at the largest text the words alone
            are taller than a small screen. */}
        <div className="install-ask-actions">
          {how ? null : inApp
            ? <a className="install-ask-go" href={ownBrowserUrl(kind, typeof location !== 'undefined' ? location.href : '')}>Open in {browser}</a>
            : <button type="button" className="install-ask-go" onClick={onInstall}>Install</button>}
          <button type="button" className="install-steps-done" onClick={onLater}>{how ? 'Got it' : 'Not now'}</button>
          {haveNote ? <button type="button" className="install-ask-have" onClick={onHave}>I already have it</button> : null}
        </div>
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
