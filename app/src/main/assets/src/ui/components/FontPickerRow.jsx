/* ═══════════════════════════════════════════════════════════════════════
   FontPickerRow — Settings → Appearance → Reading Font (Cluster D)
   ═══════════════════════════════════════════════════════════════════════
   A standard SelectField dropdown (the Bible-Translation/Image-Quality
   sheet pattern — owner call) over the READING_FONTS registry, in
   registry order (scripture-and-classic faces first). Every option's
   NAME renders in that font — all fonts are vendored locally and
   @font-face'd in app.css (2026-07-31 owner call: predownloaded, no
   download step), so selection applies instantly and works offline.

   Free-var globals (classic-script seam, same as SettingsScreen):
   React, READING_FONTS, readingFontById, SelectField.
   ═══════════════════════════════════════════════════════════════════════ */

/* A09.4 (mockup B-fontsheet A, 2026-10-23): the two faces built for easy reading open the sheet under their own
   heading (they were cards 24 and 25, about 9,500 px down), the serifs follow in registry order, and every card
   carries a sample line set in its own face. */
const FONT_SAMPLE = 'In the beginning was the Word';

export function FontPickerRow({ value, onSelect }) {
  const current = readingFontById(value) || readingFontById('classic');
  /** @param {any} def @param {string} group */
  const toOption = (def, group) => ({
    id: def.id,
    label: def.label,
    desc: def.sub,
    group,
    // 'classic' has no family — the system serif IS its own preview.
    labelStyle: { fontFamily: def.css || 'serif', fontSize: 'var(--fs-18)', letterSpacing: 0 },
  });
  const options = [
    ...READING_FONTS.filter((def) => def.easy).map((def) => toOption(def, 'Easy to read')),
    ...READING_FONTS.filter((def) => !def.easy).map((def) => toOption(def, 'Serif faces')),
  ];
  return (
    <SelectField
      eyebrow="Appearance"
      title="Reading font"
      label="Reading font"
      desc="Every font is built in and works offline"
      find="typeface font letters serif sans"
      /* WS2 settings (st-font): one preview on top, in the face now chosen, instead of the same line under every name. */
      sheetTop={(
        <div className="ws2-font-preview">
          <p className="ws2-font-sample" style={{ fontFamily: current.css || 'serif' }}>{FONT_SAMPLE}</p>
          <p className="ws2-font-name">{current.label + ' · ' + (current.sub || '')}</p>
        </div>
      )}
      value={current.id}
      options={options}
      onChange={(id) => { if (id !== value && readingFontById(id)) onSelect(id); }}
      valueStyle={{ fontFamily: current.css || 'serif', fontSize: 'var(--fs-16)', fontStyle: 'normal' }}
    />
  );
}
