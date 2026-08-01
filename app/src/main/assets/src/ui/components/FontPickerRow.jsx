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

export function FontPickerRow({ value, onSelect }) {
  const current = readingFontById(value) || readingFontById('classic');
  const options = READING_FONTS.map((def) => ({
    id: def.id,
    label: def.label,
    desc: def.sub,
    // 'classic' has no family — the system serif IS its own preview.
    labelStyle: { fontFamily: def.css || 'serif', fontSize: '1.08rem', letterSpacing: 0 },
  }));
  return (
    <SelectField
      eyebrow="Appearance"
      title="Reading Font"
      label="Reading Font"
      desc="The typeface for reading text everywhere in the app. Headings keep the app’s own style, except with System Serif — the original all-device look. Every font is built in and works offline."
      value={current.id}
      options={options}
      onChange={(id) => { if (id !== value && readingFontById(id)) onSelect(id); }}
      valueStyle={{ fontFamily: current.css || 'serif', fontSize: '1rem', fontStyle: 'normal' }}
    />
  );
}
