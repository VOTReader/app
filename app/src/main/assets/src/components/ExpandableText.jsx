/* ═══════════════════════════════════════════════════════════════════════
   ExpandableText — Cluster B (esbuild bundle-b.js)
   ═══════════════════════════════════════════════════════════════════════

   Two optional props turn on WHOLE-TEXT mode (journal quote blocks, sweep v047):
     renderText(text) → nodes   draws the text (inline markup, ref chips);
     bodyProps                  go on the element that holds it (an annotation
                                container's data-hl-key / data-hl-dom).
   In that mode the body always holds the whole text and collapsing is visual
   (a line clamp), so Show more / Show less never rewrites text the annotation
   layer has split into marks, and a highlight's offsets read the same text
   either way. The toggle shows only when the clamp actually hides something.
   Without either prop the component cuts the plain string, as before. */

import { cutAtWord } from '../utils/cut-at-word.js';

export function ExpandableText(props) {
  var useState = React.useState;
  var text = props.text || '';
  var threshold = props.threshold || 240;
  var className = props.className || '';
  var tapToToggle = !!props.tapToToggle;
  var renderText = props.renderText;
  var bodyProps = props.bodyProps;
  var whole = !!(renderText || bodyProps);
  var isLong = !!text && text.length > threshold;
  var _exp = useState(false);
  var expanded = _exp[0]; var setExpanded = _exp[1];
  // Whole-text mode: does the collapsed clamp hide anything? Assumed yes until
  // measured (before paint), so a long text never flashes without its toggle.
  var _clip = useState(true);
  var clipped = _clip[0]; var setClipped = _clip[1];
  var bodyRef = React.useRef(null);
  React.useLayoutEffect(function() {
    if (!whole || !isLong || expanded) return undefined;
    var live = true;
    function measure() {
      var el = bodyRef.current;
      if (live && el) setClipped(el.scrollHeight > el.clientHeight + 1);
    }
    measure();
    window.addEventListener('resize', measure);
    // The book face can land after first layout and change the line count.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure, function() {});
    return function() { live = false; window.removeEventListener('resize', measure); };
  }, [whole, isLong, expanded, text, setClipped]);

  function toggle(e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    setExpanded(function(v) { return !v; });
  }

  if (!isLong) {
    // Nothing to collapse — render plain so taps reach the parent card.
    if (whole) return <div className={className} {...bodyProps}>{renderText ? renderText(text) : text}</div>;
    return <div className={className}>{text}</div>;
  }
  var divProps = { className: className + (expanded ? ' is-expanded' : ' is-collapsed') };
  if (tapToToggle) {
    // A tap anywhere on the text toggles it, but the wrapper is no control of its own: the Show more
    // button is the one keyboard / screen-reader control (a role=button wrapper around it was a nested
    // control, sweep mw10).
    divProps.onClick = toggle;
    divProps.style = { cursor: 'pointer' };
    divProps.title = expanded ? 'Tap to collapse' : 'Tap to read more';
  }
  var toggleBtn = (
    <button type="button" className="jrn-expand-toggle" aria-expanded={expanded} onClick={toggle}>
      {expanded ? 'Show less' : 'Show more'}
    </button>
  );
  if (whole) {
    return (
      <div {...divProps}>
        <div ref={bodyRef} className={'jrn-expand-body' + (expanded ? '' : ' is-clamped')} {...bodyProps}>
          {renderText ? renderText(text) : text}
        </div>
        {(expanded || clipped) ? toggleBtn : null}
      </div>
    );
  }
  // Cut between words, never inside one or between the two halves of an emoji (s01.9; utils/cut-at-word.js).
  var head = cutAtWord(text, threshold).trim();
  return (
    <div {...divProps}>
      {expanded ? text : head + '…'}
      {' '}
      {toggleBtn}
    </div>
  );
}

/* Back-compat alias — keep every existing `JrnExpandable` call site
   working without edits. */
export var JrnExpandable = ExpandableText;
if (typeof window !== 'undefined') {
  window.ExpandableText = ExpandableText;
  window.JrnExpandable = ExpandableText;
}
