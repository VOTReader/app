function ModeToggle({ mode, onChange, showStudy, onShowStudyChange }) {
  if (!showStudy) {
    return (/*#__PURE__*/
      React.createElement("div", { className: "mode-toggle-wrap" }, /*#__PURE__*/
      React.createElement("div", { className: "mode-toggle" }, /*#__PURE__*/
      React.createElement("button", {
        className: "mode-btn active",
        onClick: () => onShowStudyChange(true),
        title: "Show study notes, references, and further reading" }, /*#__PURE__*/

      React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8" }, /*#__PURE__*/
      React.createElement("circle", { cx: "12", cy: "12", r: "9" }), /*#__PURE__*/
      React.createElement("path", { d: "M9 12l2 2 4-4" })
      ), "On"

      )
      )
      ));

  }
  const isPdf = mode === "pdf";
  return (/*#__PURE__*/
    React.createElement("div", { className: "mode-toggle-wrap" }, /*#__PURE__*/
    React.createElement("div", { className: "mode-toggle" }, /*#__PURE__*/
    React.createElement("button", {
      className: "mode-btn active",
      onClick: () => onChange(isPdf ? "inline" : "pdf"),
      title: isPdf ? "PDF Mode \u2014 tap to switch to Inline" : "Inline Mode \u2014 tap to switch to PDF" }, /*#__PURE__*/

    React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8" },
    isPdf ? /*#__PURE__*/React.createElement("path", { d: "M2 6h20M2 12h20M2 18h12" }) : /*#__PURE__*/React.createElement("path", { d: "M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" })
    ), isPdf ? "PDF" : "Inline"

    ), /*#__PURE__*/
    React.createElement("div", { className: "mode-divider" }), /*#__PURE__*/
    React.createElement("button", {
      className: "mode-btn",
      onClick: () => onShowStudyChange(false),
      title: "Hide study notes, references, and further reading" }, /*#__PURE__*/

    React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8" }, /*#__PURE__*/
    React.createElement("circle", { cx: "12", cy: "12", r: "9" }), /*#__PURE__*/
    React.createElement("line", { x1: "4.5", y1: "4.5", x2: "19.5", y2: "19.5" })
    ), "Off"

    )
    )
    ));
}
