/* ═══════════════════════════════════════════════════════════════════════
   SettingsRow — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { useSettingsFind } from './settings-find.jsx';

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
        <span className="settings-row-text">
          {f.place ? <span className="ws2-place">{f.place}</span> : null}
          <span className="settings-row-label">{label}</span>
          {desc && <span className="settings-row-desc" id={descId}>{desc}</span>}
        </span>
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
   row is the one button. */
export function SettingsNavRow({ label, desc = null, value = null, onClick, find = '' }) {
  const f = useSettingsFind(label + ' ' + (desc || '') + ' ' + find);
  if (!f.show) return null;
  return (
    <div className="settings-row" data-found={f.place ? '' : undefined}>
      <button type="button" className="settings-row-head ws2-nav" onClick={onClick}>
        <span className="settings-row-text">
          {f.place ? <span className="ws2-place">{f.place}</span> : null}
          <span className="settings-row-label">{label}</span>
          {desc ? <span className="settings-row-desc">{desc}</span> : null}
        </span>
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
        <span className="settings-row-text">
          {f.place ? <span className="ws2-place">{f.place}</span> : null}
          <span className="settings-row-label">{label}</span>
          {desc ? <span className="settings-row-desc">{desc}</span> : null}
        </span>
        <span className="ws2-stepper">
          <button type="button" className="settings-step-btn" aria-label={lessLabel} disabled={lessDisabled} onClick={onLess}>{"−"}</button>
          {children || <span className="ws2-step-value" aria-live="polite">{value}</span>}
          <button type="button" className="settings-step-btn" aria-label={moreLabel} disabled={moreDisabled} onClick={onMore}>+</button>
        </span>
      </div>
    </div>
  );
}
