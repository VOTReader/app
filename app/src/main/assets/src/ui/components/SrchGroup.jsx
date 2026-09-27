/* ═══════════════════════════════════════════════════════════════════════
   SrchGroup — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

/* What a group counts, so the header says "8 letters", not "8 matches": a card is
   one letter, entry, topic, chapter or verse, and a letter can match in several
   places (SrchCard lists them), so "matches" undercounted what a group holds. */
const GROUP_UNIT = {
  bible: ['verse', 'verses'], matthew: ['verse', 'verses'],
  v1: ['letter', 'letters'], v2: ['letter', 'letters'], v3: ['letter', 'letters'], v4: ['letter', 'letters'],
  v5: ['letter', 'letters'], v6: ['letter', 'letters'], v7: ['letter', 'letters'],
  rebuke: ['letter', 'letters'], flock: ['letter', 'letters'], timothy: ['letter', 'letters'], letters: ['letter', 'letters'],
  wtlb1: ['entry', 'entries'], wtlb2: ['entry', 'entries'], blessed: ['entry', 'entries'], holydays: ['entry', 'entries'],
  answers: ['topic', 'topics'], 'bible-studies': ['chapter', 'chapters'],
};

export function SrchGroup({ gkey, items, terms, onSelect, defaultOpen }) {
  const [open, setOpen] = React.useState(defaultOpen !== false);
  const meta = SRCH_GROUP_META[gkey] || { label: gkey };
  return (
    <div className={"srch-group" + (open ? '' : ' collapsed')}>
      <button className="srch-group-header" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>
          {meta.label}
          <span className="srch-group-count-inline"> · {items.length} {(GROUP_UNIT[gkey] || ['match', 'matches'])[items.length === 1 ? 0 : 1]}</span>
        </span>
        {/* Session-5 (5): the old 0.55rem ▾/▸ glyph was a near-invisible
            affordance — a real 24px chevron that ROTATES makes the
            collapse/expand state legible at a glance. */}
        <span className={"srch-group-chevron" + (open ? " open" : "")} aria-hidden="true">▸</span>
      </button>
      {/* A closed group renders no cards: a long result set opens with every
          group closed, and each card cuts and measures a snippet. */}
      {open ? (
        <div className="srch-group-items">
          {items.map((entry, i) => (
            <SrchCard key={i} entry={entry} terms={terms} onSelect={onSelect} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
