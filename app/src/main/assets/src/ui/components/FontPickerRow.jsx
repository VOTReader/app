/* ═══════════════════════════════════════════════════════════════════════
   FontPickerRow — Settings → Appearance → Reading Font (Cluster D)
   ═══════════════════════════════════════════════════════════════════════
   Replaces the two-state "Modern Fonts" toggle (2026-07-31). A standard
   SelectField dropdown (the app's Bible-Translation/Arrows/Image-Quality
   sheet pattern — owner call: fonts belong behind a dropdown, not an
   inline grid): every option's NAME renders in that font via the bundled
   ~2–4 KB preview subsets ('p-<id>' families, app.css @font-face), with
   its style blurb underneath and a right-aligned status ("Built in" /
   "Downloaded" / "~77 KB" / "Downloading…").

   Picking a downloadable font closes the sheet and asks below the row
   with a size-labeled ConfirmStrip; only a CONFIRMED, SUCCESSFUL fetch
   (ensureReadingFont → Cache Storage 'vot-fonts-v1') commits the setting.
   Built-in / already-downloaded fonts apply immediately.

   Free-var globals (classic-script seam, same as SettingsScreen):
   React, READING_FONTS, readingFontById, ensureReadingFont,
   isReadingFontCached, SelectField, ConfirmStrip, showToast.
   ═══════════════════════════════════════════════════════════════════════ */

/** The preview @font-face family for a font name ('classic' has no file —
 *  the system serif IS its own preview). */
function previewFamily(id) {
  return id === 'classic' ? 'serif' : "'p-" + id + "', serif";
}

export function FontPickerRow({ value, onSelect }) {
  const current = readingFontById(value) || readingFontById('classic');
  // id → true once every file of that font is in the vot-fonts cache.
  const [cached, setCached] = React.useState(/** @type {Record<string, boolean>} */ ({}));
  const [pendingId, setPendingId] = React.useState(/** @type {string | null} */ (null));
  const [confirmId, setConfirmId] = React.useState(/** @type {string | null} */ (null));

  // Probe the cache once on mount (statuses in the sheet) and again after
  // each download — the only two events that change it in-session.
  React.useEffect(() => {
    let alive = true;
    Promise.all(
      READING_FONTS.map(async (f) => [f.id, await isReadingFontCached(f)])
    ).then((pairs) => {
      if (alive) setCached(Object.fromEntries(pairs));
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

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

  const handleChange = (id) => {
    if (pendingId) return;               // one download at a time
    if (id === value) { setConfirmId(null); return; }
    const def = readingFontById(id);
    if (!def) return;
    if (!def.files || cached[def.id]) { apply(def); return; }
    setConfirmId(def.id);                // needs a download — ask first
  };

  const statusFor = (def) => {
    if (pendingId === def.id) return 'Downloading…';
    if (!def.files) return 'Built in';
    if (cached[def.id]) return 'Downloaded';
    return '~' + def.kb + ' KB';
  };

  const options = READING_FONTS.map((def) => ({
    id: def.id,
    label: def.label,
    desc: def.sub,
    labelStyle: { fontFamily: previewFamily(def.id), fontSize: '1.08rem', letterSpacing: 0 },
    meta: statusFor(def),
  }));

  const confirmDef = confirmId ? readingFontById(confirmId) : null;
  const pendingDef = pendingId ? readingFontById(pendingId) : null;

  return (
    <>
      <SelectField
        eyebrow="Appearance"
        title="Reading Font"
        label="Reading Font"
        desc="The typeface for reading text everywhere in the app. Headings keep the app’s own style, except with System Serif — the original all-device look. Downloadable fonts are fetched once (size shown), kept on this device, and work offline from then on."
        value={current.id}
        options={options}
        onChange={handleChange}
        valueStyle={{ fontFamily: previewFamily(current.id), fontSize: '1rem', fontStyle: 'normal' }}
      />
      {confirmDef && (
        <ConfirmStrip
          question={`Download ${confirmDef.label} (~${confirmDef.kb} KB)? One-time — it stays on this device and works offline.`}
          yesLabel="Download"
          onCancel={() => setConfirmId(null)}
          onConfirm={() => apply(confirmDef)}
        />
      )}
      {pendingDef && (
        <div className="settings-row-desc font-picker-downloading" aria-live="polite">
          Downloading {pendingDef.label}…
        </div>
      )}
    </>
  );
}
