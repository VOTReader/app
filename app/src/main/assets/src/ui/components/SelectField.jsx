/* ═══════════════════════════════════════════════════════════════════════
   SelectField — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

/* Options are { id, label, desc? } plus two optional presentation fields
   added for the Reading Font picker (2026-07-31), ignored elsewhere:
   - labelStyle: inline style for the option's label span (the font picker
     renders each font's NAME in that font via its preview family);
   - meta: small right-aligned status text ("Built in" / "~77 KB" / …).
   `valueStyle` does the same for the closed row's current-value span. */
export function SelectField({ eyebrow, title, label, desc, value, options, onChange, valueStyle = null }) {
  const [open, setOpen] = React.useState(false);
  const [showDesc, setShowDesc] = React.useState(false);
  const fieldId = React.useId();
  const sheetId = `select-sheet-${fieldId}`;
  const titleId = `select-sheet-title-${fieldId}`;
  useModalRegistry({ id: sheetId, dismiss: () => setOpen(false), active: open });
  const trapRef = useFocusTrap(open);
  const selected = options.find((o) => o.id === value) || options[0];

  React.useEffect(() => {
    if (!open) return;
    const prev = window.__closeSheet;
    window.__closeSheet = () => setOpen(false);
    return () => { window.__closeSheet = prev || null; };
  }, [open]);

  return (
    <div className="settings-row">
      <div className="settings-row-head">
        <span className="settings-row-label">{label}</span>
        {desc && (
          <button
            type="button"
            className="settings-info-btn"
            aria-label={(showDesc ? 'Hide description for ' : 'Show description for ') + label}
            aria-expanded={showDesc}
            onClick={(e) => { e.stopPropagation(); setShowDesc((v) => !v); }}
          >i</button>
        )}
        <span className="settings-row-grow" />
        <button type="button" className="settings-select-trigger" aria-label={label + ': ' + selected.label} aria-haspopup="dialog" aria-expanded={open} aria-controls={sheetId} onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
          <span className="settings-row-value" style={valueStyle}>{selected.label}</span>
          <span className="settings-select-chev">{"›"}</span>
        </button>
      </div>
      {showDesc && desc && <div className="settings-row-desc">{desc}</div>}
      {open && (
        <>
          <div className="select-sheet-backdrop open" aria-hidden="true" onClick={() => setOpen(false)} />
          <div id={sheetId} className="select-sheet" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
            <SheetHandle onClose={() => setOpen(false)} />
            {eyebrow ? <div className="select-sheet-eyebrow">{eyebrow}</div> : null}
            <div className="select-sheet-title" id={titleId}>{title || label}</div>
            <div className="select-sheet-ornament">
              <div className="select-sheet-ornament-line" />
              <div className="select-sheet-ornament-diamond">{"✦"}</div>
              <div className="select-sheet-ornament-line r" />
            </div>
            <div className="select-sheet-options">
              {options.map((opt) => {
                const isSelected = opt.id === value;
                return (
                  <button
                    key={opt.id}
                    className={`select-sheet-option${isSelected ? " selected" : ""}`}
                    onClick={() => { onChange(opt.id); setOpen(false); }}
                  >
                    <div className="select-sheet-option-main">
                      <span className="select-sheet-option-label" style={opt.labelStyle}>{opt.label}</span>
                      {opt.meta ? <span className="select-sheet-option-meta">{opt.meta}</span> : null}
                      {isSelected ? <span className="select-sheet-option-check">{"✓"}</span> : null}
                    </div>
                    {opt.desc ? <div className="select-sheet-option-desc">{opt.desc}</div> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
