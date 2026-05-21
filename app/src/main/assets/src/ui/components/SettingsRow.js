/* ═══════════════════════════════════════════════════════════════════════
   SettingsRow — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

export function SettingsRow({ label, desc, checked, onToggle, disabled, disabledReason }) {
  return (/*#__PURE__*/
    React.createElement("div", { className: `settings-row${disabled ? " settings-row-disabled" : ""}` }, /*#__PURE__*/
    React.createElement("div", { className: "settings-row-text" }, /*#__PURE__*/
    React.createElement("div", { className: "settings-row-label" }, label),
    desc && /*#__PURE__*/React.createElement("div", { className: "settings-row-desc" }, desc),
    disabled && disabledReason && /*#__PURE__*/
    React.createElement("div", { className: "settings-row-disabled-hint" }, disabledReason)

    ), /*#__PURE__*/
    React.createElement("label", { className: "settings-toggle" }, /*#__PURE__*/
    React.createElement("input", {
      type: "checkbox",
      checked: checked,
      disabled: !!disabled,
      onChange: disabled ? undefined : onToggle }
    ), /*#__PURE__*/
    React.createElement("div", { className: "settings-toggle-track" }), /*#__PURE__*/
    React.createElement("div", { className: "settings-toggle-thumb" })
    )
    ));

}
