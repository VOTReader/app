/* ═══════════════════════════════════════════════════════════════
   DOM LINK ICONS — inline chain icon injection for [data-hl-dom] containers
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html; no import/export.
   Depends on: LinkStore (defined in src/stores/link-store.js).

   applyDOMLinks() is called from the post-render useEffect in
   useDomAnnotationSync whenever the annotation stores change (W7.3). It:
     1. Removes any existing .inline-link-icon elements
     2. Finds all links that touch each [data-hl-dom] container
     3. Inserts a chain icon at (or near) each linked text range endpoint
     4. Applies visual distinction: source icons (user originated the link)
        render at --gold; target icons (destination of a link from elsewhere)
        render at --gold-dim.

   Icon placement logic ("slide-off" rules):
     1. Mid-word → slide forward to word boundary
     2. Closing punctuation → slide past (., ; : ! ? etc.)
     3. Adjacent skip elements (fn-ref, tap-ref, letter-link-ref, note-icon,
        verse-link-icon) → jump past to keep their tap targets clear

   CSS: .inline-link-icon and .inline-link-icon-source are defined in
   the main index.html CSS block (part of the const CSS template literal).
═══════════════════════════════════════════════════════════════ */

import { chromeAwareView, refindRange } from './anchor-view.js';
import { makeIconButton } from './icon-button.js';
import { insertIconAt, ICON_SKIP_RX } from './icon-placement.js';

/* Inject inline chain icons at the end of each linked text range inside
   [data-hl-dom] containers. Re-runs on store changes. Click → onLinkOpen(blockKey)
   which opens the sidebar showing all links touching that block. */
/* Inline link icons — placed at (or as close as possible to) the END
   of each linked text range. The icon "slides off" three kinds of bad
   placement so it never interrupts content:

     1. Mid-word — slide forward to the end of the current word.
        (Defensive: snapRangeToWords now snaps BOTH ends to word
        boundaries — and trims trailing punctuation — so a fresh mark
        won't end mid-word; this stays as belt-and-suspenders for any
        range that bypassed the snap or predates it.)
     2. Closing punctuation — slide past `.,;:!?)...` and friends so
        the icon reads as belonging to the word, not splitting the
        punctuation off ("word."[icon] instead of "word"[icon]".").
     3. Adjacent fn-ref / scripture-ref / letter-link / note-icon /
        verse-link-icon — slide PAST these inline elements so the
        icon never lands directly before one (where, on Android, the
        icon would block the tap target — the original bug that drove
        the parallel session to end-of-paragraph placement).

   Multiple links ending at the same offset merge into one icon with
   a `title` count; tapping any icon opens the link sidebar for the
   block, which lists every link touching it.

   CSS: `.inline-link-icon` no longer sets `user-select: none` — the
   span is empty (SVG paths can't be selected anyway), and dropping
   the `none` lets drag-selection pass across the icon on Android
   without breaking. */
export function applyDOMLinks() {
  document.querySelectorAll('[data-hl-key][data-hl-dom]').forEach(function(container) {
    var hlKey = container.getAttribute('data-hl-key');
    container.querySelectorAll('.inline-link-icon').forEach(function(el) { el.remove(); });
    container.normalize();
    var view = null;   // chromeAwareView(container), built for the first end with words

    var links = LinkStore.getForKeyPrefix(hlKey);
    if (!links.length) return;

    // Collect end positions for endpoints attached to this container
    // (either the block itself or a more-specific subkey), merging
    // duplicates so two links ending at the same offset become one
    // icon with count=2.
    //
    // End position can live in two places depending on how the endpoint
    // was built:
    //   (a) A `:N-M` suffix on the key — used by target endpoints that
    //       went through verse-picker / excerpt-picker refinement
    //       (e.g. "letter:foo:2:42-87" or "bible:genesis:1:1").
    //   (b) Separate `start`/`end` fields on the endpoint object — used
    //       by SOURCE endpoints, which carry the user's selection range
    //       but keep the key bare (e.g. key="letter:workers:1",
    //       start=42, end=87, text="...sentence...").
    //
    // Without the (b) fallback, the icon for the source side of an
    // excerpt-to-excerpt link couldn't find its position and slid all
    // the way to end-of-paragraph — the regression the user reported.
    var keyPrefix = hlKey + ':';
    // byEndPos tracks { count, anySource } per character offset.
    // anySource=true means at least one link has THIS container as its origin
    // (source side) — icon renders at full gold. False means container is
    // only ever a destination (target side) — renders dimmer (gold-dim).
    var byEndPos = {};
    links.forEach(function(link) {
      // s06.9: one malformed link is skipped; it never aborts the icons
      // for the rest of the page.
      try {
      if (!link) return;
      // isSourceHere = the source endpoint belongs to this container
      var srcKey = link.source && typeof link.source.key === 'string' ? link.source.key : null;
      var isSourceHere = srcKey && (srcKey === hlKey || srcKey.indexOf(keyPrefix) === 0);

      [link.source, link.target].forEach(function(ep) {
        if (!ep || typeof ep.key !== 'string' || !ep.key) return;
        if (ep.key !== hlKey && ep.key.indexOf(keyPrefix) !== 0) return;
        var startPos = null, endPos = null;
        var m = ep.key.match(/:(\d+)-(\d+)$/);
        if (m) {
          startPos = parseInt(m[1], 10);
          endPos = parseInt(m[2], 10);
        } else if (typeof ep.end === 'number') {
          startPos = typeof ep.start === 'number' ? ep.start : ep.end;
          endPos = ep.end;
        }
        if (endPos == null) return;
        // W48: an end that recorded its words follows them, as a highlight
        // does, when text before it was edited; otherwise the stored offset.
        if (typeof ep.text === 'string' && ep.text) {
          if (!view) view = chromeAwareView(container);
          var found = refindRange(view, startPos, endPos, ep.text);
          if (found) endPos = found.end;
        }
        var prev = byEndPos[endPos] || { count: 0, anySource: false };
        byEndPos[endPos] = {
          count: prev.count + 1,
          // Once any link marks this position as source, keep it source.
          anySource: prev.anySource || !!isSourceHere
        };
      });
      } catch (_e) { /* malformed link: skip it */ }
    });
    if (Object.keys(byEndPos).length === 0) {
      // Legacy link (no :start-end suffix) — fall back to one icon at
      // end of block, same as the prior end-of-paragraph behavior.
      // For the legacy path, check if any link is sourced from this container.
      var legacyAnySource = links.some(function(l) {
        var k = l && l.source && l.source.key;
        return typeof k === 'string' && (k === hlKey || k.indexOf(keyPrefix) === 0);
      });
      container.appendChild(_buildLinkIcon(hlKey, links.length, legacyAnySource));
      return;
    }

    // Process highest position first so each insertion doesn't shift the
    // character offsets of earlier (lower-offset) insertions still pending.
    var positions = Object.keys(byEndPos).map(Number).sort(function(a, b) { return b - a; });
    positions.forEach(function(endPos) {
      _insertLinkIconAt(container, hlKey, endPos, byEndPos[endPos].count, byEndPos[endPos].anySource);
    });
  });
}

/* Build an inline chain icon span.
   isSource=true  -> this container originated the link; render at full gold (--gold).
   isSource=false -> this container is a link destination; render dimmer (--gold-dim).
   The visual distinction lets the user see at a glance "I anchored this" vs
   "something else points here". Both icons are still fully tappable. */
function _buildLinkIcon(hlKey, count, isSource) {
  var icon = document.createElement('span');
  // Apply source/target distinction via CSS class; default is dim (target role).
  icon.className = 'inline-link-icon' + (isSource ? ' inline-link-icon-source' : '') + (count > 1 ? ' inline-link-icon-badge' : '');
  // s06.4: two or more links ending here are one icon; it says how many, with the note icon's badge
  if (count > 1) icon.setAttribute('data-count', String(count));
  icon.title = count + ' link' + (count > 1 ? 's' : '');
  icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  var openSidebar = function(e) {
    e.preventDefault(); e.stopPropagation();
    if (window.__openLinkSidebar) window.__openLinkSidebar(hlKey);
  };
  icon.addEventListener('click', openSidebar);
  // W65: a named button, Enter/Space opening what a tap opens (renderer/icon-button.js).
  makeIconButton(icon, count === 1 ? 'Open link' : 'Open ' + count + ' links', openSidebar);
  return icon;
}

function _insertLinkIconAt(container, hlKey, endPos, count, isSource) {
  // renderer/icon-placement.js: slide to the end of the phrase, past footnote bubbles and references (s06.2)
  insertIconAt(container, endPos, ICON_SKIP_RX, _buildLinkIcon(hlKey, count, isSource));
}
