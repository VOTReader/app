/* ═══════════════════════════════════════════════════════════════════════
   settings-glance — each Settings group's CURRENT values, for the line
   under its name (the redesign, 2026-09-25; picture: D:/Swarm/calls/ux-0925/
   r4-settings.png take 3)
   ═══════════════════════════════════════════════════════════════════════
   The group lines used to be fixed descriptions ("Theme, text size & reading
   font"). A reader opening Settings wants to see how the app IS set before
   opening anything, so each collapsed group now says it: "Dark · Standard
   text · EB Garamond", "NKJV · Headings on · Restored names on", "Compact
   bar". Help keeps a short description; Your Data leads with when this
   device last made a backup (ds5 A09.1: notes and the journal live only
   here). Pure: the screen passes the few labels it already computes.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @param {{
 *   settings?: Record<string, any>,
 *   theme?: string,
 *   textPercent?: number,          // the clamped Text Size, in percent
 *   fontLabel?: string,            // the reading font's name
 *   readerLabel?: string | null,   // the letter voice ("Benjamin"), null for the default
 *   translationLabel?: string | null, // the Bible translation's own name ("NKJV-R"), not its id
 *   gardenLabel?: string | null,   // the Garden image tier's name
 *   lastBackupAt?: number,         // when this device last finished an export, 0 for never
 *   now?: number,                  // the clock (tests)
 * }} o
 * @returns {Record<string, string>}
 */
/** "today", "yesterday", or "N days ago" for a past time, by calendar day.
 *  @param {number} at @param {number} [now] */
export function daysAgo(at, now) {
  const day = (/** @type {number} */ t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const n = Math.round((day(now == null ? Date.now() : now) - day(at)) / 86400000);
  return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n + ' days ago';
}

export function settingsGlance(o) {
  const s = (o && o.settings) || {};
  const onOff = (v) => (v ? 'on' : 'off');
  const pct = o && Number.isFinite(o.textPercent) ? o.textPercent : 100;
  const lpm = Math.round(Number(s.autoScrollLpm)) || 16;
  const feats = [
    ['Search', s.searchEnabled !== false],
    ['tabs', !!s.tabsEnabled],
    ['history', s.historyEnabled !== false],
    ['bookmark', s.showBookmarkNav !== false],
  ];
  const names = (/** @type {string[]} */ list) => list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
  const offs = feats.filter(([, on]) => !on).map(([n]) => n);
  return {
    appearance: [
      o && o.theme === 'light' ? 'Light' : 'Dark',
      pct === 100 ? 'Standard text' : 'Text ' + pct + '%',
      (o && o.fontLabel) || 'System Serif',
    ].join(' · '),
    reading: [
      (o && o.translationLabel) || String(s.translation || 'nkjv').toUpperCase(),
      'Headings ' + onOff(s.showSectionHeadings !== false),
      // The switch is the pill on reading pages; auto-scroll itself always starts from a reader's menu.
      'Auto-scroll pill ' + onOff(!!s.autoScroll),
    ].join(' · '),
    share: 'Links point to the ' + (s.shareLink === 'app' ? 'app' : 'website') + ' · Highlight ' + onOff(!!s.linkHighlight),
    listening: [
      (o && o.readerLabel) || 'Default voice',
      'Read-along ' + onOff(s.readAlongHighlight !== false),
    ].join(' · '),
    autoscroll: lpm + ' lines a minute · Pill ' + onOff(!!s.autoScroll),
    topnav: 'Bookmark on reading pages ' + onOff(s.showBookmarkNav !== false),
    features: offs.length === 0 ? names(feats.map(([n]) => String(n))) + ' on'
      : offs.length === feats.length ? names(feats.map(([n]) => String(n))) + ' off'
        : feats.map(([n, on]) => n + ' ' + onOff(on)).join(' · '),
    garden: (o && o.gardenLabel) || 'Image quality',
    progress: s.markAsRead ? 'Marking chapters as read' : 'Off',
    data: 'Last backup: ' + (o && o.lastBackupAt ? daysAgo(o.lastBackupAt, o.now) : 'never'),
    help: 'Show me around & About',
  };
}
