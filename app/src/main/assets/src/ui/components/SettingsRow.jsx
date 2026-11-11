/* ═══════════════════════════════════════════════════════════════════════
   SettingsRow — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

/* WS1 settings (U 8.7, 2026-11-11): a settings row is its name, its plain line, and the control. The line is
   always shown (no "i" button to open it) and describes the switch. */
export function SettingsRow({ label, desc = null, checked, onToggle, disabled = false, disabledReason = null }) {
  const descId = `settings-desc-${React.useId()}`;
  return (
    <div className={`settings-row${disabled ? " settings-row-disabled" : ""}`}>
      <div className="settings-row-head">
        <span className="settings-row-text">
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
