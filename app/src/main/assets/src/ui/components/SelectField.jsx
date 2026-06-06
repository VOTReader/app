/* ═══════════════════════════════════════════════════════════════════════
   SelectField — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function SelectField({ eyebrow, title, label, desc, value, options, onChange }) {
  const [open, setOpen] = React.useState(false);
  const [showDesc, setShowDesc] = React.useState(false);
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
            aria-label={showDesc ? "Hide description" : "Show description"}
            aria-expanded={showDesc}
            onClick={(e) => { e.stopPropagation(); setShowDesc((v) => !v); }}
          >i</button>
        )}
        <span className="settings-row-grow" />
        <button type="button" className="settings-select-trigger" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
          <span className="settings-row-value">{selected.label}</span>
          <span className="settings-select-chev">{"›"}</span>
        </button>
      </div>
      {showDesc && desc && <div className="settings-row-desc">{desc}</div>}
      {open && (
        <>
          <div className="select-sheet-backdrop open" onClick={() => setOpen(false)} />
          <div className="select-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="select-sheet-handle" />
            {eyebrow ? <div className="select-sheet-eyebrow">{eyebrow}</div> : null}
            <div className="select-sheet-title">{title || label}</div>
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
                      <span className="select-sheet-option-label">{opt.label}</span>
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
