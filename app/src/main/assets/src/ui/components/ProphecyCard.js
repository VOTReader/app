/* ═══════════════════════════════════════════════════════════════════════
   ProphecyCard — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

function ProphecyCard({ type, tag, label, blocks, fnProps, stateKey, statesRef, onSaveStates, expandSignal }) {
  // Read initial state from persistent ref, default to expanded (true)
  const stored = statesRef && statesRef.current[stateKey];
  const [expanded, setExpandedRaw] = React.useState(stored !== undefined ? stored : true);
  // setExpanded must handle BOTH a raw boolean value AND an updater function
  // like real React setState — the toggle path at the header uses
  // `setExpanded((e) => !e)`, which would otherwise store the function itself
  // into statesRef and JSON.stringify it to `{}` → empty saved blob → all
  // cards reset to expanded on next reload. Resolve the updater first, then
  // persist the resolved boolean.
  const setExpanded = (val) => {
    setExpandedRaw((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      if (statesRef) { statesRef.current[stateKey] = next; onSaveStates && onSaveStates(); }
      return next;
    });
  };
  // React to external expand/collapse all signal
  React.useEffect(() => {
    if (expandSignal !== undefined && expandSignal !== null && expandSignal !== 0) {
      const newVal = expandSignal > 0;
      setExpandedRaw(newVal);
      if (statesRef) statesRef.current[stateKey] = newVal;
    }
  }, [expandSignal]);
  const cls = `prophecy-card pc-${type}`;
  const cardFnProps = fnProps;
  return (/*#__PURE__*/
    React.createElement("div", { className: cls }, /*#__PURE__*/
    React.createElement("div", { className: "prophecy-card-header", onClick: () => setExpanded(e => !e) }, /*#__PURE__*/
    React.createElement("span", { className: "prophecy-card-tag" }, tag), /*#__PURE__*/
    React.createElement("span", { className: `prophecy-card-chevron${expanded ? "" : " collapsed"}` }, "\u25BC")
    ), /*#__PURE__*/
    React.createElement("div", { className: `prophecy-card-body${expanded ? "" : " collapsed"}` },
    label && /*#__PURE__*/React.createElement("div", { className: "prophecy-card-sublabel" }, label),
    blocks.map((block, bi) => {
      if (block.type === "para") return (/*#__PURE__*/
        React.createElement("p", { key: bi, className: "letter-para" }, /*#__PURE__*/
        React.createElement(Segments, _extends({ segments: block.segments }, cardFnProps))
        ));

      if (block.type === "poetry") return (/*#__PURE__*/
        React.createElement("div", { key: bi, className: "letter-poetry" },
        block.lines.map((line, li) => /*#__PURE__*/
        React.createElement("div", { key: li, className: "poetry-line" }, /*#__PURE__*/
        React.createElement(Segments, _extends({ segments: line }, fnProps))
        )
        )
        ));

      if (block.type === "heading") return (/*#__PURE__*/
        React.createElement("h2", { key: bi, className: `study-heading study-heading-l${block.level || 3}` }, block.text));

      return null;
    })
    )
    ));

}
