function SettingsRow({ label, desc, checked, onToggle, disabled, disabledReason }) {
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
