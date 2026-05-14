function DisableTabsDialog({ onKeep, onDisable }) {
  return (/*#__PURE__*/
    React.createElement("div", { className: "disable-tabs-overlay", onClick: onKeep }, /*#__PURE__*/
    React.createElement("div", { className: "disable-tabs-dialog", onClick: (e) => e.stopPropagation() }, /*#__PURE__*/
    React.createElement("div", { className: "disable-tabs-eyebrow" }, "You keep closing your last tab"), /*#__PURE__*/
    React.createElement("h2", { className: "disable-tabs-title" }, "Disable tabs?"), /*#__PURE__*/
    React.createElement("div", { className: "disable-tabs-body" }, "Tabs let you juggle multiple reading places \u2014 a chapter, a letter, a study in parallel. If you only read one at a time, disabling tabs hides the switcher and this close button. You can re-enable tabs anytime in Settings \u2014 your open tabs will be waiting."
    ), /*#__PURE__*/
    React.createElement("div", { className: "disable-tabs-actions" }, /*#__PURE__*/
    React.createElement("button", {
      className: "disable-tabs-btn secondary",
      onClick: onKeep },
    "Keep Tabs On"), /*#__PURE__*/
    React.createElement("button", {
      className: "disable-tabs-btn primary",
      onClick: onDisable },
    "Disable Tabs")
    )
    )
    ));
}
