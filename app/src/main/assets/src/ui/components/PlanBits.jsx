/* ═══════════════════════════════════════════════════════════════════════
   PlanBits — small pieces the reading-plan screens share (plans2)
   ═══════════════════════════════════════════════════════════════════════
   The progress ring, the round tick, the bottom sheet the plan settings,
   Adjust and the day sheet open in (the app's select-sheet grammar: grab
   handle, a title, worded actions, U rule 13), the bar title, a section
   title with its link, chips, the seven day toggles, a switch, and the
   date and count words every plan screen says the same way.
   Free globals: React, ReactDOM.
   ═══════════════════════════════════════════════════════════════════════ */

import { useModalRegistry } from '../../hooks/use-modal-registry.js';
import { useFocusTrap } from '../../hooks/use-focus-trap.js';
import { SheetHandle } from './SheetHandle.jsx';
import { dayNum } from '../../data/plan-engine.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** The seven day toggles' letters and spoken names, Sunday first. */
export const WEEK_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const WEEK_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** 'YYYY-MM-DD' as "Wed Nov 11". @param {string} key */
export function dayDate(key) {
  const n = dayNum(key);
  if (n == null) return '';
  const d = new Date(n * 86400000);
  return DAYS[d.getUTCDay()] + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate();
}

/** 'YYYY-MM-DD' as "Nov 11". @param {string} key */
export function monthDay(key) {
  const n = dayNum(key);
  if (n == null) return '';
  const d = new Date(n * 86400000);
  return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate();
}

/** "1 min", "12 min". @param {number} n */
export const minText = (n) => Math.max(1, Math.round(n)) + ' min';

/** "1 day", "4 days" (also "1 chapter", "2 letters": any noun with a plain plural). @param {number} n @param {string} one */
export const countOf = (n, one) => n.toLocaleString('en-US') + ' ' + (n === 1 ? one : one + 's');

/** The progress ring with its percent. @param {{ percent: number, size?: 'big' | 'small' }} props */
export function PlanRing({ percent, size = 'small' }) {
  const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
  const c = 2 * Math.PI * 34;
  return (
    <span className={'plan-ring plan-ring-' + size} role="img" aria-label={p + ' percent read'}>
      <svg viewBox="0 0 80 80" aria-hidden="true">
        <circle className="plan-ring-bg" cx="40" cy="40" r="34" />
        <circle className="plan-ring-fg" cx="40" cy="40" r="34" strokeDasharray={c.toFixed(1)} strokeDashoffset={(c * (1 - p / 100)).toFixed(1)} />
      </svg>
      <b aria-hidden="true">{p + '%'}</b>
    </span>
  );
}

/** The round tick (filled when read). @param {{ on: boolean }} props */
export function PlanTick({ on }) {
  return (
    <span className="plan-tick" data-done={on ? '1' : '0'} aria-hidden="true">
      {on ? <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12.5l4.2 4.2L19 7" /></svg> : null}
    </span>
  );
}

export const CHEVRON = <svg className="plan-chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>;

export const GEAR = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

/**
 * A bottom sheet over the plan screens, in the app's select-sheet grammar: the phone's Back, Escape, the backdrop,
 * a drag on the handle and the worded close all close it. `actions` (worded buttons) sit at its foot beside the close.
 * @param {{ id: string, title: string, onClose: () => void, closeLabel?: string, actions?: any, children: any }} props
 */
export function PlanSheet({ id, title, onClose, closeLabel = 'Cancel', actions, children }) {
  useModalRegistry({ id, dismiss: onClose });
  const trapRef = useFocusTrap(true);
  const node = (
    <div className="plan-sheet-layer">
      <div className="select-sheet-backdrop open" aria-hidden="true" onClick={onClose} />
      <section id={id} className="select-sheet plan-sheet" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby={id + '-t'}>
        <SheetHandle onClose={onClose} />
        <h2 className="plan-sheet-title" id={id + '-t'}>{title}</h2>
        <div className="plan-sheet-body">{children}</div>
        <div className="plan-sheet-foot">
          <button type="button" className="plan-text-btn" onClick={onClose}>{closeLabel}</button>
          {actions || null}
        </div>
      </section>
    </div>
  );
  return typeof ReactDOM !== 'undefined' && typeof document !== 'undefined' && document.body ? ReactDOM.createPortal(node, document.body) : node;
}

/** The title in the top bar (U rule 10/11: back, title, at most two actions). @param {{ title: string }} props */
export function PlanBarTitle({ title }) {
  return <h1 className="root-title plan-bar-title">{title}</h1>;
}

/** A section title with an optional link at its right ("Whole schedule"). @param {{ title: string, link?: string, onLink?: () => void, id?: string }} props */
export function PlanSec({ title, link, onLink, id }) {
  return (
    <div className="plan-sec">
      <h2 className="root-section plan-sec-title" id={id}>{title}</h2>
      {link && onLink ? <button type="button" className="root-link plan-sec-link" onClick={onLink}>{link}</button> : null}
    </div>
  );
}

/**
 * A row of chips, one chosen (role radiogroup). @param {{ label: string, options: { id: string, label: string }[],
 *   value: string, onChange: (id: string) => void }} props
 */
export function PlanChips({ label, options, value, onChange }) {
  return (
    <div className="plan-chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={o.id === value} className="plan-chip" onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

/** The seven reading-day toggles (at least one stays on). @param {{ value: boolean[], onChange: (v: boolean[]) => void }} props */
export function PlanDays({ value, onChange }) {
  return (
    <div className="plan-days" role="group" aria-label="Reading days">
      {WEEK_LETTERS.map((l, i) => (
        <button key={i} type="button" className="plan-day-toggle" aria-pressed={!!value[i]} aria-label={WEEK_NAMES[i]}
          onClick={() => { const next = value.map((v, j) => (j === i ? !v : !!v)); if (next.some(Boolean)) onChange(next); }}>
          <span aria-hidden="true">{l}</span>
        </button>
      ))}
    </div>
  );
}

/** A switch (role switch) with its label. @param {{ on: boolean, label: string, onChange: (on: boolean) => void }} props */
export function PlanSwitch({ on, label, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="plan-switch" onClick={() => onChange(!on)}>
      <span className="plan-switch-knob" aria-hidden="true" />
    </button>
  );
}

/** One labelled row of the Make it yours / settings card. @param {{ label: string, children: any }} props */
export function PlanOptRow({ label, children }) {
  return (
    <div className="plan-opt">
      <span className="plan-opt-label">{label}</span>
      <div className="plan-opt-body">{children}</div>
    </div>
  );
}

/** '07:30' as '7:30 AM'. @param {string} t */
export const clockTime = (t) => { const [h, m] = String(t || '07:30').split(':').map(Number); return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + (h < 12 ? ' AM' : ' PM'); };

/** The paces a plan offers as chips: the catalog's, else ones in its own measure. @param {any} def @param {any} run */
export function paceChoices(def, run) {
  const label = (/** @type {any} */ p) => (p.mode === 'minutes' ? p.n + ' min a day'
    : p.mode === 'items' ? p.n + ' a day' : p.n === 365 ? '1 year' : p.n === 730 ? '2 years' : countOf(p.n, 'day'));
  /** @type {any[]} */
  let list = def && def.paces ? def.paces.filter((/** @type {any} */ p) => p.mode !== 'by') : [];
  if (!list.length) {
    const pace = (run && run.pace) || (def && def.pace) || { mode: 'days', n: 30 };
    const mode = pace.mode === 'by' ? 'days' : pace.mode;
    if (mode === 'minutes') list = [5, 10, 15].map((n) => ({ mode, n }));
    else if (mode === 'items') list = [1, 2, 3].map((n) => ({ mode, n }));
    else { const t = Math.max(2, Number(pace.n) || 30); list = [Math.max(1, Math.round(t / 2)), t, t * 2].map((n) => ({ mode: 'days', n })); }
  }
  return list.map((p) => ({ ...p, id: p.mode + ':' + p.n, label: label(p) }));
}
