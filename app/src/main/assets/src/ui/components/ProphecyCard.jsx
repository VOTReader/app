/* ═══════════════════════════════════════════════════════════════════════
   ProphecyCard — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function ProphecyCard({ type, tag, label, blocks, fnProps, stateKey, statesRef, onSaveStates, expandSignal }) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally fires only on expandSignal change. statesRef is a parent-owned useRef (stable object identity, .current freshness is exempt); stateKey is identity-stable per card (parent keys the list by it, so a different stateKey = different mounted instance). Adding either would either spuriously re-fire or no-op.
  }, [expandSignal]);
  const cls = `prophecy-card pc-${type}`;
  const cardFnProps = fnProps;
  return (
    <div className={cls}>
      <div className="prophecy-card-header" onClick={() => setExpanded(e => !e)}>
        <span className="prophecy-card-tag">{tag}</span>
        <span className={`prophecy-card-chevron${expanded ? "" : " collapsed"}`}>{"▼"}</span>
      </div>
      <div className={`prophecy-card-body${expanded ? "" : " collapsed"}`}>
        {label && <div className="prophecy-card-sublabel">{label}</div>}
        {blocks.map((block, bi) => {
          if (block.type === "para") return (
            <p key={bi} className="letter-para">
              <Segments {..._extends({ segments: block.segments }, cardFnProps)} />
            </p>
          );

          if (block.type === "poetry") return (
            <div key={bi} className="letter-poetry">
              {block.lines.map((line, li) => (
                <div key={li} className="poetry-line">
                  <Segments {..._extends({ segments: line }, fnProps)} />
                </div>
              ))}
            </div>
          );

          if (block.type === "heading") return (
            <h2 key={bi} className={`study-heading study-heading-l${block.level || 3}`}>{block.text}</h2>
          );

          return null;
        })}
      </div>
    </div>
  );

}
