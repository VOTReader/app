/* ═══════════════════════════════════════════════════════════════════════
   ProphecyGroup — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

export function ProphecyGroup({ block, fnProps, expandSignal, groupKey, statesRef, onSaveStates }) {
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
