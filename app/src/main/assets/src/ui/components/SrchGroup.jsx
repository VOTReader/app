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

/* Cards render a page at a time: a group can hold hundreds now that each
   collection keeps its own 400 (Answers holds about 600 topics for "the"), and
   every card cuts and measures a snippet. */
export const SRCH_GROUP_PAGE = 50;

/* A card's key is its doc, not its index: Book order re-sorts a group in place,
   and an index key handed each card another result (its snippet centred on the
   old one's hit, its opened "more places" list moved to a stranger). The fields
   are the engine's own dedup key plus the unit ids. */
function cardKey(entry, i) {
  const d = entry && entry.doc;
  if (!d) return 'i' + i;
  return [d.kind, d.volumeId, d.letterId, d.ref, d.title, String(d.text || '').slice(0, 60)].join('|');
}

export function SrchGroup({ gkey, items, terms, onSelect, defaultOpen, capped = false }) {
  const [open, setOpen] = React.useState(defaultOpen !== false);
  const [shown, setShown] = React.useState(SRCH_GROUP_PAGE);
  const meta = SRCH_GROUP_META[gkey] || { label: gkey };
  const unit = (GROUP_UNIT[gkey] || ['match', 'matches'])[items.length === 1 && !capped ? 0 : 1];
  const left = items.length - shown;
  return (
    <div className={"srch-group" + (open ? '' : ' collapsed')}>
      <button className="srch-group-header" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>
          {meta.label}
          <span className="srch-group-count-inline"> · {items.length.toLocaleString('en-US')}{capped ? '+' : ''} {unit}</span>
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
          {items.slice(0, shown).map((entry, i) => (
            <SrchCard key={cardKey(entry, i)} entry={entry} terms={terms} onSelect={onSelect} />
          ))}
          {left > 0 ? (
            <button type="button" className="srch-group-more" onClick={() => setShown((n) => n + SRCH_GROUP_PAGE)}>
              {left <= SRCH_GROUP_PAGE ? 'Show ' + left + ' more' : 'Show ' + SRCH_GROUP_PAGE + ' more of ' + left.toLocaleString('en-US')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
