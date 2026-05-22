/* ═══════════════════════════════════════════════════════════════════════
   SrchGroup — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function SrchGroup({ gkey, items, terms, onSelect, defaultOpen }) {
  const [open, setOpen] = React.useState(defaultOpen !== false);
  const meta = SRCH_GROUP_META[gkey] || { label: gkey };
  return (
    <div className={"srch-group" + (open ? '' : ' collapsed')}>
      <button className="srch-group-header" onClick={() => setOpen((o) => !o)}>
        <span>
          {meta.label}
          <span className="srch-group-count-inline"> · {items.length} {items.length === 1 ? "match" : "matches"}</span>
        </span>
        <span className="srch-group-count">{open ? '▾' : '▸'}</span>
      </button>
      <div className="srch-group-items">
        {items.map((entry, i) => (
          <SrchCard key={i} entry={entry} terms={terms} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
