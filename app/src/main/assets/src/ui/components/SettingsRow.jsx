/* ═══════════════════════════════════════════════════════════════════════
   SettingsRow — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function SettingsRow({ label, desc, checked, onToggle, disabled, disabledReason }) {
  return (
    <div className={`settings-row${disabled ? " settings-row-disabled" : ""}`}>
      <div className="settings-row-text">
        <div className="settings-row-label">{label}</div>
        {desc && <div className="settings-row-desc">{desc}</div>}
        {disabled && disabledReason && (
          <div className="settings-row-disabled-hint">{disabledReason}</div>
        )}
      </div>
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={checked}
          disabled={!!disabled}
          onChange={disabled ? undefined : onToggle}
        />
        <div className="settings-toggle-track" />
        <div className="settings-toggle-thumb" />
      </label>
    </div>
  );
}
