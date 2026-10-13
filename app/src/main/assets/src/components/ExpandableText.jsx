/* ═══════════════════════════════════════════════════════════════════════
   ExpandableText — Cluster B (esbuild bundle-b.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function ExpandableText(props) {
  var useState = React.useState;
  var text = props.text || '';
  var threshold = props.threshold || 240;
  var className = props.className || '';
  var tapToToggle = !!props.tapToToggle;
  var _exp = useState(false);
  var expanded = _exp[0]; var setExpanded = _exp[1];
  if (!text || text.length <= threshold) {
    // Nothing to collapse — render plain so taps reach the parent card.
    return <div className={className}>{text}</div>;
  }
  // Never cut between the two halves of an emoji (a lone half draws as a replacement glyph).
  var end = threshold;
  var last = text.charCodeAt(end - 1);
  if (last >= 0xD800 && last <= 0xDBFF) end--;
  var head = text.slice(0, end).trim();
  function toggle(e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    setExpanded(function(v) { return !v; });
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
  return (
    <div {...divProps}>
      {expanded ? text : head + '…'}
      {' '}
      <button type="button" className="jrn-expand-toggle" aria-expanded={expanded} onClick={toggle}>
        {expanded ? 'Show less' : 'Show more'}
      </button>
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
