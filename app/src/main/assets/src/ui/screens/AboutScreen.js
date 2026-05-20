/* ═══════════════════════════════════════════════════════════════════════
   AboutScreen — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

function AboutScreen({ onContinue, onBack, onSearch, onHistory, theme, onThemeChange }) {
  return (/*#__PURE__*/
    React.createElement(ScreenLayout, { navChildren: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/
      React.createElement("button", { className: "nav-home nav-back-icon", onClick: onBack, title: "Back", "aria-label": "Back" }, "‹"), /*#__PURE__*/
      React.createElement(HomeBtn, null), /*#__PURE__*/
      React.createElement("button", { className: "nav-search-btn", onClick: onHistory, title: "History", style: { marginLeft: 'auto' } }, /*#__PURE__*/
      React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" }, /*#__PURE__*/React.createElement("polyline", { points: "1 4 1 10 7 10" }), /*#__PURE__*/React.createElement("path", { d: "M3.51 15a9 9 0 1 0 .49-5.01" }))
      ), /*#__PURE__*/
      React.createElement("button", { className: "nav-search-btn", onClick: onSearch, title: "Search" }, /*#__PURE__*/
      React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" }, /*#__PURE__*/React.createElement("circle", { cx: "11", cy: "11", r: "8" }), /*#__PURE__*/React.createElement("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" }))
      ), /*#__PURE__*/
      React.createElement(ThemeBtn, { theme: theme, onThemeChange: onThemeChange })
      ) }, /*#__PURE__*/
    React.createElement("div", { className: "about-screen" }, /*#__PURE__*/
    React.createElement("div", { className: "about-card" }, /*#__PURE__*/
    React.createElement("div", { className: "about-diamonds", "aria-hidden": "true" }, /*#__PURE__*/
    React.createElement("span", { className: "about-diamond" }), /*#__PURE__*/
    React.createElement("span", { className: "about-diamond" }), /*#__PURE__*/
    React.createElement("span", { className: "about-diamond" })
    ), /*#__PURE__*/
    React.createElement("h1", { className: "about-heading" }, "About VOTReader"), /*#__PURE__*/
    React.createElement("div", { className: "about-body" }, /*#__PURE__*/
    React.createElement("p", null,
      "The Volumes of Truth are the Word of The Lord, given through His servant Timothy."
    ), /*#__PURE__*/
    React.createElement("p", null,
      "This reader was made by a disciple for personal study and reflection. It is not the canonical source."
    ), /*#__PURE__*/
    React.createElement("p", null,
      "Your notes, journal, and highlights stay on this device. Use Settings → Export to save them to a file you control."
    ), /*#__PURE__*/
    React.createElement("p", null,
      "For the canonical text, audio, video, and PDF files, visit ",
      /*#__PURE__*/React.createElement("a", { href: "https://www.thevolumesoftruth.com", target: "_blank", rel: "noopener noreferrer" }, /*#__PURE__*/React.createElement("em", null, "thevolumesoftruth.com")),
      "."
    )
    ), /*#__PURE__*/
    React.createElement("div", { className: "about-diamonds", "aria-hidden": "true" }, /*#__PURE__*/
    React.createElement("span", { className: "about-diamond" }), /*#__PURE__*/
    React.createElement("span", { className: "about-diamond" }), /*#__PURE__*/
    React.createElement("span", { className: "about-diamond" })
    ), /*#__PURE__*/
    React.createElement("button", { className: "about-continue", onClick: onContinue, "aria-label": "Continue" }, "Continue")
    )
    )
    ));
}
