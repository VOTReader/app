function ClearProgressRow({ label, total, count, stage, onTap }) {
  if (count === 0) return (/*#__PURE__*/
    React.createElement("div", { className: "progress-row" }, /*#__PURE__*/
    React.createElement("span", { className: "progress-row-label" }, label), /*#__PURE__*/
    React.createElement("span", { className: "progress-row-tally" }, "0 / ", total), /*#__PURE__*/
    React.createElement("button", { className: "settings-clear-btn", disabled: true }, "Clear")
    ));

  return (/*#__PURE__*/
    React.createElement("div", { className: "progress-row" }, /*#__PURE__*/
    React.createElement("span", { className: "progress-row-label" }, label), /*#__PURE__*/
    React.createElement("span", { className: "progress-row-tally" }, count, " / ", total), /*#__PURE__*/
    React.createElement("button", { className: CLEAR_CLASSES[stage], onClick: onTap }, CLEAR_LABELS[stage])
    ));
}
