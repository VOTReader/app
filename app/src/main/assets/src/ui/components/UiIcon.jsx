/* ═══════════════════════════════════════════════════════════════════════
   UiIcon — the UI pass's icon set (W1, 2026-11-11). Cluster D (bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The 61 line icons the v2 mocks draw (R/mock/v2/icons.js), on a 24 grid,
   stroked in currentColor at 1.7. Sizes come from CSS: 22 px by default
   (.ui-i), 18 px with size="sm". `filled` paints the shape instead
   (play, pause). Decorative: aria-hidden; the button around it names it.

     <UiIcon name="search" />   <UiIcon name="play" filled size="sm" />
   ═══════════════════════════════════════════════════════════════════════ */

/** @type {Record<string, Array<[string, Record<string, string>]>>} */
export const UI_ICONS = {
  back: [["path",{"d":"M15 5l-7 7 7 7"}]],
  chev: [["path",{"d":"M9 5l7 7-7 7"}]],
  down: [["path",{"d":"M6 9l6 6 6-6"}]],
  search: [["circle",{"cx":"11","cy":"11","r":"6.5"}],["path",{"d":"M16 16l4.5 4.5"}]],
  gear: [["circle",{"cx":"12","cy":"12","r":"3"}],["path",{"d":"M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"}]],
  more: [["circle",{"cx":"5.5","cy":"12","r":"1.3"}],["circle",{"cx":"12","cy":"12","r":"1.3"}],["circle",{"cx":"18.5","cy":"12","r":"1.3"}]],
  x: [["path",{"d":"M6 6l12 12M18 6L6 18"}]],
  check: [["path",{"d":"M5 12.5l4.5 4.5L19 7.5"}]],
  plus: [["path",{"d":"M12 5v14M5 12h14"}]],
  minus: [["path",{"d":"M5 12h14"}]],
  book: [["path",{"d":"M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5v13"}]],
  head: [["path",{"d":"M4.5 15v-2.5a7.5 7.5 0 0115 0V15"}],["rect",{"x":"3.5","y":"14","width":"4","height":"6","rx":"1.5"}],["rect",{"x":"16.5","y":"14","width":"4","height":"6","rx":"1.5"}]],
  mark: [["path",{"d":"M7 4h10v16l-5-4-5 4z"}]],
  share: [["path",{"d":"M12 15V4M8 7.5L12 3.5l4 4M6 12v7.5h12V12"}]],
  shuffle: [["path",{"d":"M4 7h3.5c2 0 3 .8 4.2 2.6l1.6 2.8c1.2 1.8 2.2 2.6 4.2 2.6H20M4 17h3.5c1.4 0 2.3-.4 3.1-1.3M20 7h-2.5c-1.4 0-2.3.4-3.1 1.3M17.5 4.5L20 7l-2.5 2.5M17.5 14.5L20 17l-2.5 2.5"}]],
  list: [["path",{"d":"M8.5 7H20M8.5 12H20M8.5 17H20M4.5 7h.1M4.5 12h.1M4.5 17h.1"}]],
  info: [["circle",{"cx":"12","cy":"12","r":"8.5"}],["path",{"d":"M12 11v5M12 8v.2"}]],
  help: [["circle",{"cx":"12","cy":"12","r":"8.5"}],["path",{"d":"M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.2-1.5 2.3M12 17v.2"}]],
  play: [["path",{"d":"M8 5l11 7-11 7z"}]],
  pause: [["path",{"d":"M8 5v14M16 5v14"}]],
  out: [["path",{"d":"M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"}]],
  star: [["path",{"d":"M12 4l2.5 5.2 5.5.8-4 4 1 5.6-5-2.7-5 2.7 1-5.6-4-4 5.5-.8z"}]],
  chart: [["path",{"d":"M6 19v-6M12 19V6M18 19v-9"}]],
  film: [["rect",{"x":"4","y":"5","width":"16","height":"14","rx":"2.5"}],["path",{"d":"M10 9.5v5l4.5-2.5z"}]],
  pdf: [["path",{"d":"M7 3.5h7l4 4V20.5H7zM14 3.5v4h4M9.5 13h5M9.5 16.5h5"}]],
  note: [["path",{"d":"M6 4h9l4 4v12H6zM15 4v4h4M9 13h6M9 16.5h4"}]],
  pen: [["path",{"d":"M14.5 5.5l4 4L9 19H5v-4zM4 21h16"}]],
  journal: [["rect",{"x":"6","y":"3.5","width":"13","height":"17","rx":"2"}],["path",{"d":"M9.5 3.5v17M4 8h3M4 12h3M4 16h3"}]],
  link: [["path",{"d":"M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"}]],
  cal: [["rect",{"x":"4","y":"5.5","width":"16","height":"14","rx":"2.5"}],["path",{"d":"M4 10h16M8.5 3.5v3M15.5 3.5v3"}]],
  clock: [["circle",{"cx":"12","cy":"12","r":"8.5"}],["path",{"d":"M12 7.5V12l3 2"}]],
  mic: [["rect",{"x":"9","y":"3.5","width":"6","height":"11","rx":"3"}],["path",{"d":"M5.5 11.5a6.5 6.5 0 0013 0M12 18v3"}]],
  music: [["path",{"d":"M9 18V6l10-2v12"}],["circle",{"cx":"6.5","cy":"18","r":"2.5"}],["circle",{"cx":"16.5","cy":"16","r":"2.5"}]],
  dl: [["path",{"d":"M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14"}]],
  study: [["path",{"d":"M3 9l9-4.5L21 9l-9 4.5zM7 11.5V16c1.5 1.5 3 2 5 2s3.5-.5 5-2v-4.5"}]],
  web: [["circle",{"cx":"6","cy":"6","r":"2"}],["circle",{"cx":"18","cy":"8","r":"2"}],["circle",{"cx":"11","cy":"18","r":"2"}],["path",{"d":"M8 6.5l8 1.2M7 7.8l3.3 8.3M16.8 9.7l-4.6 6.8"}]],
  spark: [["path",{"d":"M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8z"}]],
  sun: [["circle",{"cx":"12","cy":"12","r":"4"}],["path",{"d":"M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"}]],
  data: [["ellipse",{"cx":"12","cy":"6.5","rx":"7","ry":"3"}],["path",{"d":"M5 6.5v11c0 1.7 3.1 3 7 3s7-1.3 7-3v-11M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"}]],
  filter: [["path",{"d":"M4 6h16M7 12h10M10 18h4"}]],
  reset: [["path",{"d":"M5 12a7 7 0 107-7H8M8 2.5L5.5 5 8 7.5"}]],
  full: [["path",{"d":"M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"}]],
  scroll: [["path",{"d":"M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4"}]],
  copy: [["rect",{"x":"8","y":"8","width":"12","height":"12","rx":"2"}],["path",{"d":"M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"}]],
  trash: [["path",{"d":"M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13M10 11v5M14 11v5"}]],
  pin: [["path",{"d":"M9 4h6l-1 6 3 3H7l3-3zM12 13v7"}]],
  img: [["rect",{"x":"4","y":"5","width":"16","height":"14","rx":"2.5"}],["circle",{"cx":"9","cy":"10","r":"1.6"}],["path",{"d":"M5 17l4.5-4.5 3.5 3.5 2.5-2.5L20 18"}]],
  grip: [["path",{"d":"M5 9h14M5 15h14"}]],
  home: [["path",{"d":"M4 11l8-6.5 8 6.5M6.5 9.5V20h11V9.5"}]],
  heart: [["path",{"d":"M12 20s-7-4.4-7-9.6A3.9 3.9 0 0112 8a3.9 3.9 0 017 2.4C19 15.6 12 20 12 20z"}]],
  moon: [["path",{"d":"M19 14.5A7.5 7.5 0 019.5 5a7.5 7.5 0 109.5 9.5z"}]],
  wifi: [["path",{"d":"M4 9.5a12 12 0 0116 0M7 13a7.5 7.5 0 0110 0M10 16.5a3 3 0 014 0M12 19.5v.1"}]],
  up: [["path",{"d":"M6 15l6-6 6 6"}]],
  prev: [["path",{"d":"M18 5L8 12l10 7zM6 5v14"}]],
  next: [["path",{"d":"M6 5l10 7-10 7zM18 5v14"}]],
  quote: [["path",{"d":"M6 17c2-1 3-3 3-6H6V7h5v5c0 3-1.5 5-4 6zM14 17c2-1 3-3 3-6h-3V7h5v5c0 3-1.5 5-4 6z"}]],
  fwd: [["path",{"d":"M19 12a7 7 0 11-7-7h4M16 2.5L18.5 5 16 7.5"}]],
  repeat: [["path",{"d":"M17 3.5l3 3-3 3M4 11.5v-2a3 3 0 013-3h13M7 20.5l-3-3 3-3M20 12.5v2a3 3 0 01-3 3H4"}]],
  like: [["path",{"d":"M7 11v9H4v-9zM7 11l4-7c1.5 0 2.5 1 2.5 2.5V10h5a2 2 0 012 2.3l-1 6a2 2 0 01-2 1.7H7"}]],
  nope: [["path",{"d":"M7 13V4H4v9zM7 13l4 7c1.5 0 2.5-1 2.5-2.5V14h5a2 2 0 002-2.3l-1-6a2 2 0 00-2-1.7H7"}]],
  phone: [["rect",{"x":"7","y":"3","width":"10","height":"18","rx":"2.5"}],["path",{"d":"M11 17.5h2"}]],
};

/** @param {{ name: string, size?: 'sm' | 'md', filled?: boolean, className?: string }} props */
export function UiIcon({ name, size = 'md', filled = false, className = '' }) {
  const parts = UI_ICONS[name] || UI_ICONS.info;
  const cls = 'ui-i' + (size === 'sm' ? ' ui-i-sm' : '') + (filled ? ' ui-i-fill' : '') + (className ? ' ' + className : '');
  return (
    <svg className={cls} viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-icon={name}>
      {parts.map(([tag, attrs], i) => React.createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}
