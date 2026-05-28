/* ═══════════════════════════════════════════════════════════════════════
   LinkCard — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function LinkCard({ lnk, hlKey, isBlockScope, onNavigate }) {
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
  // empty when one side has an excerpt and the other doesn't.
  const otherText = other.text || preview || '';
  const usingFromFallback = !otherText && !!thisSide.text;
  const rawText = otherText || thisSide.text || '';
  const isLong = rawText.length > 150;
  const chainSvg = (
    <svg className="link-card-chain" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
  const doRemove = (e) => { e.stopPropagation(); LinkStore.remove(lnk.id); if (window.__bumpHlTick) window.__bumpHlTick(); };
  return (
    <div className="link-card" onClick={confirmRemove ? undefined : (() => onNavigate && onNavigate(other))}>
      <div className="link-card-header">
        <div className="link-card-ref">
          <span className="link-card-direction">{isOutbound ? "to " : "from "}</span>
          {other.label}
        </div>
        {chainSvg}
      </div>
      <div className="link-card-cat">
        {other.type === 'bible' ? bookCategory(other.bookId) :
          other.type === 'study' ? 'Matthew Study Bible' :
          other.type === 'study-letter' ? (other.collection || 'Bible Study') :
          other.type === 'letter' ? (other.collection || 'Letter') :
          other.type === 'wtlb' ? (other.collection || 'Words To Live By') :
          other.type === 'blessed' ? 'The Blessed' :
          other.type === 'holy-days' ? 'Holy Days' :
          ''}
      </div>
      {/* Created-date row — subtle Cinzel caps so the user can see when they
          anchored the link without having to open the full Links browser. */}
      {lnk.created && (
        <div className="link-card-date">{relativeDate(lnk.created)}</div>
      )}
      <div
        className="link-card-preview"
        style={expanded ? { display: 'block', WebkitLineClamp: 'unset', overflow: 'visible' } : undefined}
      >
        {((other.type === 'bible' || other.type === 'study') && other.verse) && <strong>{other.verse + " "}</strong>}
        {usingFromFallback && <em className="link-card-from-label">From: </em>}
        {rawText}
      </div>
      {/* Actions row: show-more toggle + remove (with tap-confirm per §11.1) */}
      {!confirmRemove && (
        <div className="link-card-actions">
          {isLong && (
            <span
              className="link-card-show-more"
              onClick={(e) => { e.stopPropagation(); setExpanded(x => !x); }}
            >
              {expanded ? "Show less" : "Show more"}
            </span>
          )}
          <span
            className="link-card-remove"
            onClick={(e) => { e.stopPropagation(); setConfirmRemove(true); }}
          >
            Remove link
          </span>
        </div>
      )}
      {/* Tap-confirm strip — replaces the actions row when confirmRemove=true.
          stopPropagation wraps each handler so taps don't bubble to the
          parent .link-card (which navigates on tap). */}
      {confirmRemove && (
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmStrip
            question="Remove this link?"
            yesLabel="Yes, remove"
            onCancel={() => setConfirmRemove(false)}
            onConfirm={doRemove}
          />
        </div>
      )}
    </div>
  );
}
