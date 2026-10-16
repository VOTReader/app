/* Sheet - the kit's pull-up sheet on the phone and its D4 centred dialog on the laptop, over the scrim (mw5; pictures
   1c-aa-sheet, 4b-mark-paragraph). A screen renders <Sheet> where it decides to; the sheet itself goes into the shell's
   layer (App.jsx renders the host inside .v2-phone / .dk), so it covers the whole window above the tab bar and the page,
   never scrolling with the page. The scrim, Escape and Android's Back close the top sheet. */

import { Icon } from './Icon.jsx';

const g = /** @type {any} */ (globalThis);

/** The shell's layer element (App.jsx provides it). */
export const SheetLayer = React.createContext(/** @type {HTMLElement | null} */ (null));

/** Open sheets' closers, the newest last: Android's Back closes the top one before it pops a page. */
const open = [];

/** True while any sheet is open (auto-scroll stops under one, as main's under its modals). */
export function anySheetOpen() {
  return open.length > 0;
}

/** Pages' own Back steps, the newest last (the Scripture Web's: main's panels close before the page leaves). */
const steps = [];

/** Registers `step` as Back's move once no sheet is open; returns its remover. @param {() => void} step */
export function pushBackStep(step) {
  steps.push(step);
  return () => {
    const i = steps.indexOf(step);
    if (i >= 0) steps.splice(i, 1);
  };
}

/** Closes the top open sheet, else runs the top page's Back step; false when there is neither. */
export function closeTopSheet() {
  const close = open[open.length - 1];
  if (close) { close(); return true; }
  const step = steps[steps.length - 1];
  if (!step) return false;
  step();
  return true;
}

/**
 * @param {{ kind: string, label: string, onClose: () => void, desktop?: boolean, scrim?: string, closeX?: boolean,
 *   children?: any }} props
 *   kind the kit's sheet class ('aa', 'para'); scrim an extra scrim class ('light'); closeX the laptop dialog's own close
 *   button at its top right (picture desk 1e)
 */
export function Sheet({ kind, label, onClose, desktop = false, scrim = '', closeX = false, children }) {
  const layer = React.useContext(SheetLayer);
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  React.useEffect(() => {
    const close = () => closeRef.current();
    open.push(close);
    const onKey = (e) => { if (e.key === 'Escape' && open[open.length - 1] === close) close(); };
    document.addEventListener('keydown', onKey);
    return () => {
      const i = open.indexOf(close);
      if (i >= 0) open.splice(i, 1);
      document.removeEventListener('keydown', onKey);
    };
  }, []);
  const content = (
    <>
      <div className={'scrim' + (scrim ? ' ' + scrim : '')} onClick={() => closeRef.current()} />
      <div className={(desktop ? 'dlg ' : 'sheet ') + kind} role="dialog" aria-modal="true" aria-label={label}>
        {!desktop && <div className="handle" />}
        {desktop && closeX && (
          <button type="button" className="ic x" aria-label="Close" onClick={() => closeRef.current()}><Icon name="close" /></button>
        )}
        {children}
      </div>
    </>
  );
  return inLayer(layer, content);
}

/** `content` portalled into the shell's layer (inline where there is none). */
function inLayer(layer, content) {
  if (!layer || !g.ReactDOM || typeof g.ReactDOM.createPortal !== 'function') return content;
  return g.ReactDOM.createPortal(content, layer);
}

/**
 * The kit's toast over the page, above the tab bar ("Copied"); nothing when `text` is empty. `icon` draws a kit icon
 * before the words (9c's cloudOff); `act` + `onAct` the toast's own button at its end (4c's "OK").
 * @param {{ text: string | null, icon?: string, act?: string, onAct?: () => void }} props
 */
export function LayerToast({ text, icon, act, onAct }) {
  const layer = React.useContext(SheetLayer);
  if (!text) return null;
  return inLayer(layer, (
    <div className="toast-wrap" role="status">
      <div className="toast">
        {icon ? <Icon name={icon} /> : null}
        {text}
        {act ? <button type="button" className="act" onClick={onAct}>{act}</button> : null}
      </div>
    </div>
  ));
}
