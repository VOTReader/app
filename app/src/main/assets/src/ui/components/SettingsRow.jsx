/* ═══════════════════════════════════════════════════════════════════════
   SettingsRow — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function SettingsRow({ label, desc = null, checked, onToggle, disabled = false, disabledReason = null }) {
  // Compact layout (Settings Option B): label + toggle on a single line; the
  // (often long) description is hidden behind the ⓘ button and revealed on tap.
  const [showDesc, setShowDesc] = React.useState(false);
  // s15.9: the description, while shown, is linked to the ⓘ that opened it and describes the switch.
  const descId = `settings-desc-${React.useId()}`;
  const descShown = !!(showDesc && desc);
  return (
    <div className={`settings-row${disabled ? " settings-row-disabled" : ""}`}>
      <div className="settings-row-head">
        <span className="settings-row-label">{label}</span>
        {desc && (
          <button
            type="button"
            className="settings-info-btn"
            aria-label={(showDesc ? 'Hide description for ' : 'Show description for ') + label}
            aria-expanded={showDesc}
            aria-controls={descShown ? descId : undefined}
            onClick={(e) => { e.stopPropagation(); setShowDesc((v) => !v); }}
          >i</button>
        )}
        <span className="settings-row-grow" />
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
            aria-describedby={descShown ? descId : undefined}
            disabled={!!disabled}
            onChange={disabled ? undefined : onToggle}
          />
          <div className="settings-toggle-track" />
          <div className="settings-toggle-thumb" />
        </label>
      </div>
      {descShown && <div className="settings-row-desc" id={descId}>{desc}</div>}
      {disabled && disabledReason && (
        <div className="settings-row-disabled-hint">{disabledReason}</div>
      )}
    </div>
  );
}
