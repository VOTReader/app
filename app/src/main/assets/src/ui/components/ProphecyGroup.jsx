/* ═══════════════════════════════════════════════════════════════════════
   ProphecyGroup — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

const CARD_TAGS = { intro: 'Introduction', ot: 'Old Testament Prophecy', nt: 'Fulfilled in the New Testament', vot: 'Fulfillment in the Volumes of Truth' };

/**
 * The cards a prophecy group renders, in order: a part makes a card when it has content (s15.6: the one rule, read
 * here and by LetterView's prophecyCardKeysOf, W44's expand/collapse-all, which saves every card).
 * @param {any} block a "prophecy-group" block
 * @returns {{ type: 'intro' | 'ot' | 'nt' | 'vot', tag: string, label?: string, blocks: any[] }[]}
 */
export function prophecyCardsOf(block) {
  /** @type {{ type: 'intro' | 'ot' | 'nt' | 'vot', tag: string, label?: string, blocks: any[] }[]} */
  const cards = [];
  if (!block) return cards;
  if (block.intro && block.intro.length > 0) cards.push({ type: 'intro', tag: CARD_TAGS.intro, blocks: block.intro });
  for (const type of /** @type {const} */ (['ot', 'nt', 'vot'])) {
    const part = block[type];
    if (part && part.blocks && part.blocks.length > 0) cards.push({ type, tag: CARD_TAGS[type], label: part.label, blocks: part.blocks });
  }
  return cards;
}

export function ProphecyGroup({ block, fnProps, expandSignal, groupKey, statesRef, onSaveStates }) {
  return (
    <div className="prophecy-group">
      {block.label && <div className="prophecy-group-label">{block.label}</div>}
      {prophecyCardsOf(block).map((c) => (
        <ProphecyCard key={groupKey + ":" + c.type} type={c.type} tag={c.tag} label={c.label} blocks={c.blocks} fnProps={fnProps} expandSignal={expandSignal} stateKey={groupKey + ":" + c.type} statesRef={statesRef} onSaveStates={onSaveStates} />
      ))}
    </div>
  );
}
