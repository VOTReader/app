function ProphecyCard({ type, tag, label, blocks, fnProps, stateKey, statesRef, onSaveStates, expandSignal }) {
  const stored = statesRef && statesRef.current[stateKey];
  const [expanded, setExpandedRaw] = useState(stored !== undefined ? stored : true);
  const setExpanded = (val) => {
    setExpandedRaw((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      if (statesRef) { statesRef.current[stateKey] = next; onSaveStates && onSaveStates(); }
      return next;
    });
  };
  useEffect(() => {
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
    React.createElement("div", { className: "prophecy-card-header", onClick: () => setExpanded((e) => !e) }, /*#__PURE__*/
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

function ProphecyGroup({ block, fnProps, expandSignal, groupKey, statesRef, onSaveStates }) {
  return (/*#__PURE__*/
    React.createElement("div", { className: "prophecy-group" },
    block.label && /*#__PURE__*/React.createElement("div", { className: "prophecy-group-label" }, block.label),
    block.intro && block.intro.length > 0 && /*#__PURE__*/
    React.createElement(ProphecyCard, { type: "intro", tag: "Introduction", blocks: block.intro, fnProps: fnProps, expandSignal: expandSignal, stateKey: groupKey + ":intro", statesRef: statesRef, onSaveStates: onSaveStates }),

    block.ot && block.ot.blocks && block.ot.blocks.length > 0 && /*#__PURE__*/
    React.createElement(ProphecyCard, { type: "ot", tag: "Old Testament Prophecy", label: block.ot.label, blocks: block.ot.blocks, fnProps: fnProps, expandSignal: expandSignal, stateKey: groupKey + ":ot", statesRef: statesRef, onSaveStates: onSaveStates }),

    block.nt && block.nt.blocks && block.nt.blocks.length > 0 && /*#__PURE__*/
    React.createElement(ProphecyCard, { type: "nt", tag: "Fulfilled in the New Testament", label: block.nt.label, blocks: block.nt.blocks, fnProps: fnProps, expandSignal: expandSignal, stateKey: groupKey + ":nt", statesRef: statesRef, onSaveStates: onSaveStates }),

    block.vot && block.vot.blocks && block.vot.blocks.length > 0 && /*#__PURE__*/
    React.createElement(ProphecyCard, { type: "vot", tag: "Fulfillment in the Volumes of Truth", label: block.vot.label, blocks: block.vot.blocks, fnProps: fnProps, expandSignal: expandSignal, stateKey: groupKey + ":vot", statesRef: statesRef, onSaveStates: onSaveStates })

    ));
}

function ProphecyExpandToggle({ allExpanded, onToggle }) {
  return (/*#__PURE__*/
    React.createElement("div", { className: "mode-toggle-wrap" }, /*#__PURE__*/
    React.createElement("div", { className: "mode-toggle" }, /*#__PURE__*/
    React.createElement("button", {
      className: "mode-btn active",
      onClick: () => onToggle(!allExpanded),
      title: allExpanded ? "Collapse all cards" : "Expand all cards" }, /*#__PURE__*/

    React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8" }, /*#__PURE__*/
    allExpanded ?
    React.createElement("polyline", { points: "6 15 12 9 18 15" }) :
    React.createElement("polyline", { points: "6 9 12 15 18 9" })
    ), allExpanded ? "Collapse" : "Expand"

    )
    )
    ));
}
