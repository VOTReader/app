/* ═══════════════════════════════════════════════════════════════════════
   FontPickerRow — Settings → Appearance → Reading Font (Cluster D)
   ═══════════════════════════════════════════════════════════════════════
   Replaces the two-state "Modern Fonts" toggle (2026-07-31). Renders the
   READING_FONTS registry as a chip grid; every chip's NAME is drawn in
   that font via the bundled ~2–4 KB preview subsets ('p-<id>' families,
   app.css @font-face). Downloadable fonts prompt a one-time size-labeled
   confirm, fetch through ensureReadingFont (Cache Storage 'vot-fonts-v1'),
   and only THEN commit the setting — a failed download changes nothing.

   Free-var globals (classic-script seam, same as SettingsScreen):
   React, READING_FONTS, readingFontById, ensureReadingFont,
   isReadingFontCached, ConfirmStrip, showToast.
   ═══════════════════════════════════════════════════════════════════════ */

/** The preview @font-face family for a chip name ('classic' has no file —
 *  the system serif IS its own preview). */
function previewFamily(id) {
  return id === 'classic' ? 'serif' : "'p-" + id + "', serif";
}

export function FontPickerRow({ value, onSelect }) {
  const current = readingFontById(value) || readingFontById('classic');
  const [open, setOpen] = React.useState(false);
  // id → true once every file of that font is in the vot-fonts cache.
  const [cached, setCached] = React.useState(/** @type {Record<string, boolean>} */ ({}));
  const [pendingId, setPendingId] = React.useState(/** @type {string | null} */ (null));
  const [confirmId, setConfirmId] = React.useState(/** @type {string | null} */ (null));

  // Probe the cache when the grid opens (and again after each download).
  const refreshCached = React.useCallback(() => {
    let alive = true;
    Promise.all(
      READING_FONTS.map(async (f) => [f.id, await isReadingFontCached(f)])
    ).then((pairs) => {
      if (alive) setCached(Object.fromEntries(pairs));
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  React.useEffect(() => {
    if (open) return refreshCached();
  }, [open, refreshCached]);

  const apply = (def) => {
    setConfirmId(null);
    setPendingId(def.id);
    ensureReadingFont(def)
      .then(() => {
        setPendingId(null);
        setCached((prev) => ({ ...prev, [def.id]: true }));
        onSelect(def.id);
      })
      .catch(() => {
        setPendingId(null);
        if (typeof showToast === 'function') {
          showToast({ id: 'vot-toast-info', className: 'vot-toast', text: 'Could not download ' + def.label + ' — check your connection and try again.', durationMs: 4000 });
        }
      });
  };

  const tapChip = (def) => {
    if (pendingId) return;               // one download at a time
    if (def.id === value) return;        // already active
    if (!def.files || cached[def.id]) { apply(def); return; }
    setConfirmId(def.id);                // needs a download — ask first
  };

  const confirmDef = confirmId ? readingFontById(confirmId) : null;

  return (
    <div className="settings-row font-picker-row">
      <button
        type="button"
        className="font-picker-head"
        aria-expanded={open}
        onClick={() => { setOpen((v) => !v); setConfirmId(null); }}
      >
        <span className="settings-row-label">Reading Font</span>
        <span className="settings-row-grow" />
        <span className="font-picker-current" style={{ fontFamily: previewFamily(current.id) }}>
          {current.label}
        </span>
        <span className={'font-picker-chevron' + (open ? ' open' : '')} aria-hidden="true">▾</span>
      </button>
      {open && (
        <>
          <div className="settings-row-desc">
            The typeface for reading text everywhere in the app. Headings keep
            the app’s own style, except with System Serif — the original
            all-device look. Downloadable fonts are fetched once (size shown),
            kept on this device, and work offline from then on.
          </div>
          <div className="font-picker-grid" role="listbox" aria-label="Reading font">
            {READING_FONTS.map((def) => {
              const active = def.id === value;
              const isPending = pendingId === def.id;
              const status = isPending ? 'Downloading…'
                : !def.files ? 'Built in'
                : cached[def.id] ? 'Downloaded'
                : '~' + def.kb + ' KB';
              return (
                <button
                  key={def.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={'font-chip' + (active ? ' active' : '') + (isPending ? ' pending' : '')}
                  onClick={() => tapChip(def)}
                >
                  <span className="font-chip-name" style={{ fontFamily: previewFamily(def.id) }}>
                    {def.label}
                  </span>
                  <span className="font-chip-sub">{def.sub}</span>
                  <span className={'font-chip-status' + (active ? ' active' : '')}>
                    {active ? '✓ Active' : status}
                  </span>
                </button>
              );
            })}
          </div>
          {confirmDef && (
            <ConfirmStrip
              question={`Download ${confirmDef.label} (~${confirmDef.kb} KB)? One-time — it stays on this device and works offline.`}
              yesLabel="Download"
              onCancel={() => setConfirmId(null)}
              onConfirm={() => apply(confirmDef)}
            />
          )}
        </>
      )}
    </div>
  );
}
