/* ═══════════════════════════════════════════════════════════════════════
   LinkCard — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

function LinkCard({ lnk, hlKey, isBlockScope, onNavigate, setHlTick }) {
  const [expanded, setExpanded] = React.useState(false);
  // confirmRemove: false | true — governs the tap-confirm strip (§11.1: no instant delete).
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const matchesSide = (k) => isBlockScope ? (k === hlKey || k.startsWith(hlKey + ':')) : k === hlKey;
  // Determine which side is "us" (this container) and which is "other" (the linked passage).
  // source = where the user originated the link; target = the destination they picked.
  const isSource = matchesSide(lnk.source.key);
  const other = isSource ? lnk.target : lnk.source;
  const thisSide = isSource ? lnk.source : lnk.target;
  // isOutbound = true when THIS container is the source of the link.
  // Shown as a subtle directional eyebrow in the card header.
  const isOutbound = isSource;
  const preview = resolveVerseText(other);
  // Preview chain: prefer the OTHER side's text (what we linked TO),
  // then resolveVerseText (Bible/study lookup), then fall back to
  // THIS side's text (what we linked FROM) so the card never appears
  // empty when one side has an excerpt and the other doesn't —
  // e.g. user selects a sentence here, links to a whole letter
  // without refining excerpt → other.text empty → fall back to
  // showing what they linked FROM, prefixed with "From: ".
  const otherText = other.text || preview || '';
  const usingFromFallback = !otherText && !!thisSide.text;
  const rawText = otherText || thisSide.text || '';
  const isLong = rawText.length > 150;
  const chainSvg = React.createElement("svg", { className: "link-card-chain", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }),
    React.createElement("path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" })
  );
  const doRemove = (e) => { e.stopPropagation(); LinkStore.remove(lnk.id); setHlTick(t => t + 1); };
  return React.createElement("div", { className: "link-card", onClick: confirmRemove ? undefined : (() => onNavigate && onNavigate(other)) },
    React.createElement("div", { className: "link-card-header" },
      React.createElement("div", { className: "link-card-ref" },
        React.createElement("span", { className: "link-card-direction" }, isOutbound ? "to " : "from "),
        other.label
      ),
      chainSvg
    ),
    React.createElement("div", { className: "link-card-cat" },
      other.type === 'bible' ? bookCategory(other.bookId) :
      other.type === 'study' ? 'Matthew Study Bible' :
      other.type === 'study-letter' ? (other.collection || 'Bible Study') :
      other.type === 'letter' ? (other.collection || 'Letter') :
      other.type === 'wtlb' ? (other.collection || 'Words To Live By') :
      other.type === 'blessed' ? 'The Blessed' :
      other.type === 'holy-days' ? 'Holy Days' :
      ''
    ),
    // Created-date row — subtle Cinzel caps so the user can see when they
    // anchored the link without having to open the full Links browser.
    lnk.created && React.createElement("div", { className: "link-card-date" },
      relativeDate(lnk.created)
    ),
    React.createElement("div", {
      className: "link-card-preview",
      style: expanded ? { display: 'block', WebkitLineClamp: 'unset', overflow: 'visible' } : undefined
    },
      ((other.type === 'bible' || other.type === 'study') && other.verse) && React.createElement("strong", null, other.verse + " "),
      usingFromFallback && React.createElement("em", { className: "link-card-from-label" }, "From: "),
      rawText
    ),
    // Actions row: show-more toggle + remove (with tap-confirm per §11.1)
    !confirmRemove && React.createElement("div", { className: "link-card-actions" },
      isLong && React.createElement("span", {
        className: "link-card-show-more",
        onClick: (e) => { e.stopPropagation(); setExpanded(x => !x); }
      }, expanded ? "Show less" : "Show more"),
      React.createElement("span", {
        className: "link-card-remove",
        onClick: (e) => { e.stopPropagation(); setConfirmRemove(true); }
      }, "Remove link")
    ),
    // Tap-confirm strip — replaces the actions row when confirmRemove=true.
    // First tap on "Remove link" → strip morphs into this. Second tap on
    // "Yes, remove" → actually deletes. Cancel returns to the normal view.
    confirmRemove && React.createElement("div", {
      className: "ann-chip-confirm",
      style: { padding: '10px 12px' },
      onClick: (e) => e.stopPropagation()
    },
      React.createElement("span", { className: "ann-chip-confirm-q" }, "Remove this link?"),
      React.createElement("button", {
        className: "ann-chip-confirm-btn ann-chip-confirm-cancel",
        onClick: (e) => { e.stopPropagation(); setConfirmRemove(false); }
      }, "Cancel"),
      React.createElement("button", {
        className: "ann-chip-confirm-btn ann-chip-confirm-yes",
        onClick: doRemove
      }, "Yes, remove")
    )
  );
}
