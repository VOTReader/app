/* ═══════════════════════════════════════════════════════════════════════
   SelectField — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

/* Options are { id, label, desc? } plus two optional presentation fields
   added for the Reading Font picker (2026-07-31), ignored elsewhere:
   - labelStyle: inline style for the option's label span (the font picker
     renders each font's NAME in that font via its preview family);
   - meta: small right-aligned status text ("Built in" / "~77 KB" / …).
   `valueStyle` does the same for the closed row's current-value span. */
export function SelectField({ eyebrow, title, label, desc, value, options, onChange, valueStyle = null, valueLabel = null }) {
  const [open, setOpen] = React.useState(false);
  const [showDesc, setShowDesc] = React.useState(false);
  const fieldId = React.useId();
  const sheetId = `select-sheet-${fieldId}`;
  const descId = `select-desc-${fieldId}`;
  const selected = options.find((o) => o.id === value) || options[0];
  // valueLabel: the closed row may say more than the option's own label (U09.2: "WEB · NKJV until it downloads").
  const shown = valueLabel || selected.label;

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
            aria-controls={showDesc ? descId : undefined}
            onClick={(e) => { e.stopPropagation(); setShowDesc((v) => !v); }}
          >i</button>
        )}
        <span className="settings-row-grow" />
        <button type="button" className="settings-select-trigger" aria-label={label + ': ' + shown} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? sheetId : undefined}
          aria-describedby={showDesc && desc ? descId : undefined} onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
          <span className="settings-row-value" style={valueStyle}>{shown}</span>
          <span className="settings-select-chev">{"›"}</span>
        </button>
      </div>
      {showDesc && desc && <div className="settings-row-desc" id={descId}>{desc}</div>}
      <SelectSheet id={sheetId} open={open} onClose={() => setOpen(false)} eyebrow={eyebrow} title={title || label}
        value={value} options={options} onChange={onChange} />
    </div>
  );
}

/* SelectSheet — SelectField's bottom sheet on its own, for a picker opened
   from somewhere other than a Settings row (mw17, 2026-10-22: the Bible
   translation from the Scriptures home eyebrow and a chapter's ⋯ menu).
   Renders nothing while closed; picking an option calls onChange, then
   onClose. `portal` moves it to <body> for callers inside the top bar. */
/** @param {{ id?: string, open: boolean, onClose: () => void, eyebrow?: string, title: string, value: string,
     options: any[], onChange: (v: string) => void, portal?: boolean }} props */
export function SelectSheet({ id, open, onClose, eyebrow, title, value, options, onChange, portal = false }) {
  const ownId = React.useId();
  const sheetId = id || `select-sheet-${ownId}`;
  const titleId = `select-sheet-title-${ownId}`;
  useModalRegistry({ id: sheetId, dismiss: onClose, active: open });
  const trapRef = useFocusTrap(open);

  React.useEffect(() => {
    if (!open) return;
    const prev = window.__closeSheet;
    window.__closeSheet = onClose;
    return () => { window.__closeSheet = prev || null; };
  }, [open, onClose]);

  if (!open) return null;
  // s15.4: one radio group. Arrows, Home and End move between the options; Enter or Space picks, as the click always
  // has. Every option stays in the Tab order: a roving tabindex would let Tab leave the sheet, since the focus trap
  // counts a tabindex=-1 button among its stops.
  /** @param {any} e */
  const moveFocus = (e) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[/** @type {'ArrowDown'} */ (e.key)];
    if (!step && e.key !== 'Home' && e.key !== 'End') return;
    const radios = Array.from(/** @type {HTMLElement} */ (e.currentTarget).querySelectorAll('[role="radio"]'));
    if (!radios.length) return;
    const at = radios.indexOf(/** @type {any} */ (document.activeElement));
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? radios.length - 1 : (Math.max(0, at) + step + radios.length) % radios.length;
    e.preventDefault();
    /** @type {HTMLElement} */ (radios[to]).focus();
  };
  const sheet = (
    <>
      <div className="select-sheet-backdrop open" aria-hidden="true" onClick={onClose} />
      <div id={sheetId} className="select-sheet" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <SheetHandle onClose={onClose} />
        {eyebrow ? <div className="select-sheet-eyebrow">{eyebrow}</div> : null}
        <div className="select-sheet-title" id={titleId}>{title}</div>
        <div className="select-sheet-ornament">
          <div className="select-sheet-ornament-line" />
          <div className="select-sheet-ornament-diamond">{"✦"}</div>
          <div className="select-sheet-ornament-line r" />
        </div>
        <div className="select-sheet-options" role="radiogroup" aria-labelledby={titleId} onKeyDown={moveFocus}>
          {options.map((opt) => {
            const isSelected = opt.id === value;
            return (
              <button
                key={opt.id}
                type="button"
                className={`select-sheet-option${isSelected ? " selected" : ""}`}
                role="radio"
                aria-checked={isSelected}
                onClick={() => { onChange(opt.id); onClose(); }}
              >
                <div className="select-sheet-option-main">
                  <span className="select-sheet-option-label" style={opt.labelStyle}>{opt.label}</span>
                  {opt.meta ? <span className="select-sheet-option-meta">{opt.meta}</span> : null}
                  {isSelected ? <span className="select-sheet-option-check" aria-hidden="true">{"✓"}</span> : null}
                </div>
                {opt.desc ? <div className="select-sheet-option-desc">{opt.desc}</div> : null}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
  return portal ? ReactDOM.createPortal(sheet, document.body) : sheet;
}
