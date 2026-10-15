/* SafariNotice - "Keep your notes safe" (mw6, v2-gaps 4; picture 8d-safari-notice), an overlay over every page: main's
   Safari7DayModal in the kit (the install sheet's look with Safari's own two steps). It shows while main's StorageHealth
   says the first save of the session in a Safari tab is waiting (safari-gate.js); Got it, the scrim and Escape dismiss it
   as main's "I understand the risk" does, and the next save goes through. On a Mac the step is File > Add to Dock. A gate
   boot draws it when its state opens 'safari-7day' (8d fakes the Safari tab), and Got it does nothing there. */
import { Sheet } from '../Sheet.jsx';
import { defineOverlay } from '../places.js';
import { useSafariNotice, dismissSafariNotice } from '../safari-gate.js';

const g = /** @type {any} */ (globalThis);

/** Safari's Share icon (iOS), drawn as the picture draws it. */
const SHARE = (
  <svg className="ios" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M8.5 10H6.5a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5h-2" />
  </svg>
);
/** Add to Home Screen's icon (iOS). */
const ADD = (
  <svg className="ios" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="3.5" /><path d="M12 8.5v7M8.5 12h7" />
  </svg>
);

/** True on a Mac's Safari (main's test: navigator.platform names Mac). */
function onMac() {
  const nav = g.navigator;
  return !!nav && /Mac/.test(nav.platform || '') && !/iPhone|iPad/.test(nav.userAgent || '');
}

/**
 * The notice: why, the steps, Got it.
 * @param {{ mac: boolean, desktop: boolean, onDone: () => void }} props
 */
export function SafariSheet({ mac, desktop, onDone }) {
  return (
    <Sheet kind="inst safari" label="Keep your notes safe" desktop={desktop} onClose={onDone}>
      <div className="inst-h">
        <img className="appicon sm" src="icons/icon-512.png" alt="" />
        <div className="sh">Keep your notes safe</div>
      </div>
      <p className="inst-p">
        {'Safari may delete your highlights, notes and journal if you don’t open VOTReader for 7 days. '}
        {mac ? 'Add it to your Dock and they stay.' : 'Add it to your Home Screen and they stay.'}
      </p>
      <ol className="howto">
        {mac ? (
          <li><span className="sn">1</span>{'In Safari, choose File > Add to Dock'}</li>
        ) : (
          <>
            <li><span className="sn">1</span>Tap Share {SHARE}</li>
            <li><span className="sn">2</span>Choose Add to Home Screen {ADD}</li>
          </>
        )}
      </ol>
      <button type="button" className="pill block done" onClick={onDone}>Got it</button>
    </Sheet>
  );
}

/** The overlay: the live notice, or a gate's picture. @param {{ gate: import('../gate.js').GateState | null, desktop: boolean }} props */
function SafariNotice({ gate, desktop }) {
  const live = useSafariNotice(!gate);
  const shown = gate ? !!(gate.open && gate.open.sheet === 'safari-7day') : live;
  if (!shown) return null;
  return <SafariSheet mac={!gate && onMac()} desktop={desktop} onDone={gate ? () => {} : dismissSafariNotice} />;
}

defineOverlay('safari-7day', SafariNotice);
