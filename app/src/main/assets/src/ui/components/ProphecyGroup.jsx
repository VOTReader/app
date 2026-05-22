/* ═══════════════════════════════════════════════════════════════════════
   ProphecyGroup — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function ProphecyGroup({ block, fnProps, expandSignal, groupKey, statesRef, onSaveStates }) {
  return (
    <div className="prophecy-group">
      {block.label && <div className="prophecy-group-label">{block.label}</div>}
      {block.intro && block.intro.length > 0 && (
        <ProphecyCard type="intro" tag="Introduction" blocks={block.intro} fnProps={fnProps} expandSignal={expandSignal} stateKey={groupKey + ":intro"} statesRef={statesRef} onSaveStates={onSaveStates} />
      )}
      {block.ot && block.ot.blocks && block.ot.blocks.length > 0 && (
        <ProphecyCard type="ot" tag="Old Testament Prophecy" label={block.ot.label} blocks={block.ot.blocks} fnProps={fnProps} expandSignal={expandSignal} stateKey={groupKey + ":ot"} statesRef={statesRef} onSaveStates={onSaveStates} />
      )}
      {block.nt && block.nt.blocks && block.nt.blocks.length > 0 && (
        <ProphecyCard type="nt" tag="Fulfilled in the New Testament" label={block.nt.label} blocks={block.nt.blocks} fnProps={fnProps} expandSignal={expandSignal} stateKey={groupKey + ":nt"} statesRef={statesRef} onSaveStates={onSaveStates} />
      )}
      {block.vot && block.vot.blocks && block.vot.blocks.length > 0 && (
        <ProphecyCard type="vot" tag="Fulfillment in the Volumes of Truth" label={block.vot.label} blocks={block.vot.blocks} fnProps={fnProps} expandSignal={expandSignal} stateKey={groupKey + ":vot"} statesRef={statesRef} onSaveStates={onSaveStates} />
      )}
    </div>
  );
}
