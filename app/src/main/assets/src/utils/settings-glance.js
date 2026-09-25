/* ═══════════════════════════════════════════════════════════════════════
   settings-glance — each Settings group's CURRENT values, for the line
   under its name (the redesign, 2026-09-25; picture: D:/Swarm/calls/ux-0925/
   r4-settings.png take 3)
   ═══════════════════════════════════════════════════════════════════════
   The group lines used to be fixed descriptions ("Theme, text size & reading
   font"). A reader opening Settings wants to see how the app IS set before
   opening anything, so each collapsed group now says it: "Dark · Standard
   text · EB Garamond", "NKJV · Headings on · Restored names on", "Compact
   bar". Groups with nothing to summarise (Your Data, Help) keep a short
   description. Pure: the screen passes the few labels it already computes.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @param {{
 *   settings?: Record<string, any>,
 *   theme?: string,
 *   textPercent?: number,          // the clamped Text Size, in percent
 *   fontLabel?: string,            // the reading font's name
 *   readerLabel?: string | null,   // the letter voice ("Benjamin"), null for the default
 *   gardenLabel?: string | null,   // the Garden image tier's name
 * }} o
 * @returns {Record<string, string>}
 */
export function settingsGlance(o) {
  const s = (o && o.settings) || {};
  const onOff = (v) => (v ? 'on' : 'off');
  const pct = o && Number.isFinite(o.textPercent) ? o.textPercent : 100;
  const lpm = Math.round(Number(s.autoScrollLpm)) || 16;
  const feats = [
    ['Search', s.searchEnabled !== false],
    ['tabs', !!s.tabsEnabled],
    ['history', s.historyEnabled !== false],
  ];
  const offs = feats.filter(([, on]) => !on).map(([n]) => n);
  return {
    appearance: [
      o && o.theme === 'light' ? 'Light' : 'Dark',
      pct === 100 ? 'Standard text' : 'Text ' + pct + '%',
      (o && o.fontLabel) || 'System Serif',
    ].join(' · '),
    reading: [
      String(s.translation || 'nkjv').toUpperCase(),
      'Headings ' + onOff(s.showSectionHeadings !== false),
      'Restored names ' + onOff(s.restoredNames !== false),
    ].join(' · '),
    listening: [
      (o && o.readerLabel) || 'Default voice',
      'Read-along ' + onOff(s.readAlongHighlight !== false),
    ].join(' · '),
    autoscroll: s.autoScroll ? 'On · ' + lpm + ' lines a minute' : 'Off',
    topnav: s.compactTopBar !== false ? 'Compact bar with the ⋯ menu' : 'Every icon in the bar',
    features: offs.length === 0 ? 'Search, tabs and history on'
      : offs.length === feats.length ? 'Search, tabs and history off'
        : feats.map(([n, on]) => n + ' ' + onOff(on)).join(' · ').replace(/^search/, 'Search'),
    garden: (o && o.gardenLabel) || 'Image quality',
    progress: s.markAsRead ? 'Marking chapters as read' : 'Off',
    data: 'Back up, restore & storage',
    help: 'Show me around & About',
  };
}
