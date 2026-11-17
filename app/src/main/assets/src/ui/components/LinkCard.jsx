/* ═══════════════════════════════════════════════════════════════════════
   LinkCard — Cluster D (esbuild bundle-d.js)
   r-links (the UI pass, mock v2 readers): one link in "Links here". A card on surface-2 says which way
   it runs (To / From), the place, where it sits and when, and its words; under it Open <place> (gold),
   My Web, and Remove (asks first, then offers Undo).
   ═══════════════════════════════════════════════════════════════════════ */

import { relativeDate } from '../../utils/dates.js';
import { keyTouchesVerse } from '../../utils/hl-keys.js';
import { removeLinkWithUndo } from '../../utils/annotation-undo.js';
import { UiIcon } from './UiIcon.jsx';

export function LinkCard({ lnk, hlKey, isBlockScope, onNavigate, onMyWeb }) {
  const [expanded, setExpanded] = React.useState(false);
  // confirmRemove: false | true — governs the tap-confirm strip (§11.1: no instant delete).
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const matchesSide = (k) => isBlockScope ? (k === hlKey || k.startsWith(hlKey + ':')) : keyTouchesVerse(k, hlKey);
  // Determine which side is "us" (this container) and which is "other" (the linked passage).
  // source = where the user originated the link; target = the destination they picked.
  const isSource = matchesSide(lnk.source.key);
  const other = isSource ? lnk.target : lnk.source;
  const thisSide = isSource ? lnk.source : lnk.target;
  const preview = resolveVerseText(other);
  // Preview chain: prefer the OTHER side's text (what we linked TO),
  // then resolveVerseText (Bible/study lookup), then fall back to
  // THIS side's text (what we linked FROM) so the card never appears
  // empty when one side has an excerpt and the other doesn't.
  const otherText = other.text || preview || '';
  const usingFromFallback = !otherText && !!thisSide.text;
  const rawText = otherText || thisSide.text || '';
  const isLong = rawText.length > 150;
  const where = other.type === 'bible' ? bookCategory(other.bookId) :
    other.type === 'study' ? 'Matthew Study Bible' :
    other.type === 'study-letter' ? (other.collection || 'Bible Study') :
    other.type === 'letter' ? (other.collection || 'Letter') :
    other.type === 'wtlb' ? (other.collection || 'Words To Live By') :
    other.type === 'blessed' ? 'The Blessed' :
    other.type === 'holy-days' ? 'Holy Days' : '';
  const meta = [where, lnk.created ? relativeDate(lnk.created) : ''].filter(Boolean).join(' · ');
  const open = () => onNavigate && onNavigate(other);
  const doRemove = (e) => { e.stopPropagation(); removeLinkWithUndo(lnk.id); };   // A06.6; 0610: back at its old index
  return (
    <div className="link-card">
      <div className="link-card-box">
        <div className="link-card-direction">{isSource ? 'To' : 'From'}</div>
        <div className="link-card-ref">{other.label}</div>
        {meta && <div className="link-card-cat">{meta}</div>}
        {rawText && (
          <div className={'rd-quote link-card-preview' + (expanded ? ' is-open' : '')}>
            {usingFromFallback && <span className="link-card-from-label">From: </span>}
            {rawText}
          </div>
        )}
        {isLong && (
          <button type="button" className="ui-btn is-text is-small link-card-show-more" aria-expanded={expanded}
            onClick={() => setExpanded(x => !x)}>{expanded ? 'Show less' : 'Show more'}</button>
        )}
      </div>
      {/* Tap-confirm strip in place of the buttons while Remove asks: nothing here navigates meanwhile. */}
      {confirmRemove ? (
        <ConfirmStrip
          question="Remove this link?"
          yesLabel="Yes, remove"
          onCancel={() => setConfirmRemove(false)}
          onConfirm={doRemove}
        />
      ) : (
        <div className={'link-card-actions' + (onMyWeb ? '' : ' is-2')}>
          <button type="button" className="ui-btn is-primary is-small link-card-open" onClick={open}
            aria-label={'Open ' + other.label}><span className="link-card-open-label">Open {other.label}</span></button>
          {onMyWeb && (
            <button type="button" className="ui-btn is-small link-card-web" onClick={onMyWeb}>
              <UiIcon name="web" size="sm" />My Web
            </button>
          )}
          <button type="button" className="ui-btn is-small link-card-remove" onClick={() => setConfirmRemove(true)}
            aria-label="Remove link">Remove</button>
        </div>
      )}
    </div>
  );
}
