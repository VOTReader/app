function StickyChapterNav({ onPrev, onNext, prevDisabled, nextDisabled, prevLabel, nextLabel }) {
  return (/*#__PURE__*/
    React.createElement("div", { className: "chapter-nav-sticky" }, /*#__PURE__*/
    React.createElement("button", {
      className: "chapter-nav-sticky-arrow",
      disabled: !!prevDisabled,
      onClick: onPrev,
      title: prevLabel || "Previous",
      "aria-label": prevLabel || "Previous" },
    "\u2039"), /*#__PURE__*/
    React.createElement("button", {
      className: "chapter-nav-sticky-arrow",
      disabled: !!nextDisabled,
      onClick: onNext,
      title: nextLabel || "Next",
      "aria-label": nextLabel || "Next" },
    "\u203A")
    ));
}
