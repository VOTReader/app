/* ═══════════════════════════════════════════════════════════════════════
   InAppLinkButton — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { UiIcon } from './UiIcon.jsx';

export function InAppLinkButton({ link, onActivate, compact, label }) {
  if (!link || !onActivate) return null;
  // r-foot (the UI pass): the door says what it is and where it opens, in place of the old "Open in App" eyebrow.
  const where = (link.answers ? 'A topic' : 'A letter') + ' \u00B7 opens here in the app';
  const title = link.letterTitle || label || "Open in App";
  if (compact) {
    return (
      <button
        type="button"
        className="footnote-list-link-btn fn-list-rich"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onActivate(link); }}
      >
        <span className="fn-list-rich-body">
          <span className="fn-list-rich-eyebrow">{where}</span>
          <span className="fn-list-rich-title">{title}</span>
        </span>
        <UiIcon name="chev" size="sm" className="chev" />
      </button>
    );
  }
  return (
    <button
      type="button"
      className="fn-sheet-link-btn"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onActivate(link); }}
    >
      <span className="ui-row-lead fn-sheet-link-lead" aria-hidden="true"><UiIcon name="note" /></span>
      <span className="fn-sheet-link-body">
        <span className="fn-sheet-link-title">{title}</span>
        <span className="fn-sheet-link-eyebrow">{where}</span>
      </span>
      <UiIcon name="chev" size="sm" />
    </button>
  );
}
