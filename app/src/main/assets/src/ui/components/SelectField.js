/* ═══════════════════════════════════════════════════════════════════════
   SelectField — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

function SelectField({ eyebrow, title, label, desc, value, options, onChange }) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.id === value) || options[0];

  React.useEffect(() => {
    if (!open) return;
    const prev = window.__closeSheet;
    window.__closeSheet = () => setOpen(false);
    return () => {window.__closeSheet = prev || null;};
  }, [open]);

  return (/*#__PURE__*/
    React.createElement("div", { className: "settings-row", style: { flexDirection: "column", alignItems: "stretch" } }, /*#__PURE__*/
    React.createElement("div", { className: "settings-row-text", style: { marginBottom: "0.7rem" } }, /*#__PURE__*/
    React.createElement("div", { className: "settings-row-label" }, label), /*#__PURE__*/
    React.createElement("div", { className: "settings-row-desc" }, desc)
    ), /*#__PURE__*/
    React.createElement("button", { className: "select-field", onClick: (e) => {e.stopPropagation();setOpen(true);} }, /*#__PURE__*/
    React.createElement("div", { className: "select-field-body" }, /*#__PURE__*/
    React.createElement("span", { className: "select-field-label" }, selected.label),
    selected.desc ? /*#__PURE__*/React.createElement("span", { className: "select-field-caption" }, selected.desc) : null
    ), /*#__PURE__*/
    React.createElement("span", { className: "select-field-chevron" }, "\u203A")
    ),
    open && /*#__PURE__*/
    React.createElement(React.Fragment, null, /*#__PURE__*/
    React.createElement("div", { className: "select-sheet-backdrop open", onClick: () => setOpen(false) }), /*#__PURE__*/
    React.createElement("div", { className: "select-sheet", onClick: (e) => e.stopPropagation() }, /*#__PURE__*/
    React.createElement("div", { className: "select-sheet-handle" }),
    eyebrow ? /*#__PURE__*/React.createElement("div", { className: "select-sheet-eyebrow" }, eyebrow) : null, /*#__PURE__*/
    React.createElement("div", { className: "select-sheet-title" }, title || label), /*#__PURE__*/
    React.createElement("div", { className: "select-sheet-ornament" }, /*#__PURE__*/
    React.createElement("div", { className: "select-sheet-ornament-line" }), /*#__PURE__*/
    React.createElement("div", { className: "select-sheet-ornament-diamond" }, "\u2726"), /*#__PURE__*/
    React.createElement("div", { className: "select-sheet-ornament-line r" })
    ), /*#__PURE__*/
    React.createElement("div", { className: "select-sheet-options" },
    options.map((opt) => {
      const isSelected = opt.id === value;
      return (/*#__PURE__*/
        React.createElement("button", {
          key: opt.id,
          className: `select-sheet-option${isSelected ? " selected" : ""}`,
          onClick: () => {onChange(opt.id);setOpen(false);} }, /*#__PURE__*/

        React.createElement("div", { className: "select-sheet-option-main" }, /*#__PURE__*/
        React.createElement("span", { className: "select-sheet-option-label" }, opt.label),
        isSelected ? /*#__PURE__*/React.createElement("span", { className: "select-sheet-option-check" }, "\u2713") : null
        ),
        opt.desc ? /*#__PURE__*/React.createElement("div", { className: "select-sheet-option-desc" }, opt.desc) : null
        ));

    })
    )
    )
    )

    ));

}
