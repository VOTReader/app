/* ═══════════════════════════════════════════════════════════════════════
   SettingsRow — Cluster D (esbuild bundle-d.js)
   The settings row kit: every row on the Settings screen is built from these parts (vot-ui 11-15; DataRow,
   DataNavRow and RadioRows lived in SettingsScreen.jsx and each drew the name block by hand).
   ═══════════════════════════════════════════════════════════════════════ */

import { useSettingsFind } from './settings-find.jsx';
import { UiIcon } from './UiIcon.jsx';

/* The name block every settings row shares: its place while finding ("Reading · The page"), its name, its line.
   children: anything that belongs under the line inside the block (a More button, a live status line). */
export function SetRowText({ place = null, label, labelId = undefined, desc = null, descId = undefined, children = null }) {
  return (
    <span className="settings-row-text">
      {place ? <span className="ws2-place">{place}</span> : null}
      <span className="settings-row-label" id={labelId}>{label}</span>
      {desc ? <span className="settings-row-desc" id={descId}>{desc}</span> : null}
      {children}
    </span>
  );
}

/* WS1 settings (U 8.7, 2026-11-11): a settings row is its name, its plain line, and the control. The line is
   always shown (no "i" button to open it) and describes the switch.
   WS2 settings (st-find): while the Settings find holds words, a row whose name, line and `find` words do not
   match draws nothing, and one that does draws its place ("Reading · The page") above its name. */
export function SettingsRow({ label, desc = null, checked, onToggle, disabled = false, disabledReason = null, find = '' }) {
  const descId = `settings-desc-${React.useId()}`;
  const f = useSettingsFind(label + ' ' + (typeof desc === 'string' ? desc : '') + ' ' + find);
  if (!f.show) return null;
  return (
    <div className={`settings-row${disabled ? " settings-row-disabled" : ""}`} data-found={f.place ? '' : undefined}>
      <div className="settings-row-head">
        <SetRowText place={f.place} label={label} desc={desc} descId={descId} />
        <label className="settings-toggle">
          {/* P1-9 (Wave 0): the text label is a SIBLING span, so this
              wrapping <label> gives the input no accessible name — TalkBack
              announced "checkbox, checked" with no name on every settings
              toggle. aria-label supplies the name; role="switch" +
              aria-checked supply the on/off semantics (the native checkbox
              stays underneath — app.css styles the track off input:checked,
              and the focus-visible ring lands on the track via the
              input:focus-visible ~ .settings-toggle-track rule). */}
          <input
            type="checkbox"
            role="switch"
            checked={checked}
            aria-checked={!!checked}
            aria-label={label}
            aria-describedby={desc ? descId : undefined}
            disabled={!!disabled}
            onChange={disabled ? undefined : onToggle}
          />
          <div className="settings-toggle-track" />
          <div className="settings-toggle-thumb" />
        </label>
      </div>
      {disabled && disabledReason && (
        <div className="settings-row-disabled-hint">{disabledReason}</div>
      )}
    </div>
  );
}

/* WS2 settings (st-read2, st-listen): a row that opens somewhere else: name, line, its value, a chevron. The whole
   row is the one button. With an icon (WS3 st-data, st-prog: Restore, Check a backup, See your progress) it leads
   with the icon chip and the button carries the row's name. */
export function SettingsNavRow({ label, desc = null, value = null, onClick, find = '', icon = null, disabled = false }) {
  const f = useSettingsFind(label + ' ' + (desc || '') + ' ' + find);
  if (!f.show) return null;
  return (
    <div className="settings-row" data-found={f.place ? '' : undefined}>
      <button type="button" className={'settings-row-head ws2-nav' + (icon ? ' ws3-nav' : '')} aria-label={icon ? label : undefined}
        disabled={icon ? disabled : undefined} onClick={onClick}>
        {icon ? <span className="ws2-opt-lead" aria-hidden="true"><UiIcon name={icon} size="sm" /></span> : null}
        <SetRowText place={f.place} label={label} desc={desc} />
        {value ? <span className="settings-row-value">{value}</span> : null}
        <span className="settings-select-chev" aria-hidden="true">{"›"}</span>
      </button>
    </div>
  );
}

/* WS2 settings (st-listen Skip length, st-auto Wait before going on): name, line, then − value + . */
export function SettingsStepRow({ label, desc = null, value, onLess, onMore, lessDisabled = false, moreDisabled = false, lessLabel, moreLabel, find = '', children = null }) {
  const f = useSettingsFind(label + ' ' + (desc || '') + ' ' + find);
  if (!f.show) return null;
  return (
    <div className="settings-row" data-found={f.place ? '' : undefined}>
      <div className="settings-row-head">
        <SetRowText place={f.place} label={label} desc={desc} />
        <span className="ws2-stepper">
          <button type="button" className="settings-step-btn" aria-label={lessLabel} disabled={lessDisabled} onClick={onLess}>{"−"}</button>
          {children || <span className="ws2-step-value" aria-live="polite">{value}</span>}
          <button type="button" className="settings-step-btn" aria-label={moreLabel} disabled={moreDisabled} onClick={onMore}>+</button>
        </span>
      </div>
    </div>
  );
}

/* WS3 settings (st-data): a row that states something: name, line, and a value or a pill (Protected) at the end;
   children are its own controls. */
export function DataRow({ label, desc = null, value = null, pill = false, children = null, className = '', find = '' }) {
  const f = useSettingsFind(label + ' ' + (typeof desc === 'string' ? desc : '') + ' ' + find);
  if (!f.show) return null;
  return (
    <div className={'settings-row ws3-data-row' + (className ? ' ' + className : '')} data-found={f.place ? '' : undefined}>
      <div className="settings-row-head">
        <SetRowText place={f.place} label={label} desc={desc} />
        {value != null && value !== '' ? <span className={pill ? 'ws3-pill' : 'settings-row-value'}>{value}</span> : null}
        {children}
      </div>
    </div>
  );
}

/** WS2 settings (st-share): a short choice drawn as rows with a radio each, right on the screen (no sheet). */
export function RadioRows({ label, value, options, onChange, find = '' }) {
  const f = useSettingsFind(label + ' ' + find + ' ' + options.map((/** @type {any} */ o) => o.label + ' ' + o.desc).join(' '));
  if (!f.show) return null;
  return (
    <div role="radiogroup" aria-label={label} className="ws2-radios" data-found={f.place ? '' : undefined}>
      {f.place ? <span className="ws2-place ws2-place-pad">{f.place}</span> : null}
      {options.map((/** @type {any} */ o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className="settings-row ws2-radio" onClick={() => onChange(o.id)}>
          <SetRowText label={o.label} desc={o.desc} />
          <span className={'ws2-radio-dot' + (value === o.id ? ' is-on' : '')} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
