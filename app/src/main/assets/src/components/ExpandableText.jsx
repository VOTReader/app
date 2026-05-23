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
  var head = text.slice(0, threshold).trim();
  function toggle(e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    setExpanded(function(v) { return !v; });
  }
  var divProps = { className: className + (expanded ? ' is-expanded' : ' is-collapsed') };
  if (tapToToggle) {
    divProps.onClick = toggle;
    divProps.role = 'button';
    divProps.tabIndex = 0;
    divProps.onKeyDown = function(e) { if (e.key === 'Enter' || e.key === ' ') toggle(e); };
    divProps.style = { cursor: 'pointer' };
    divProps.title = expanded ? 'Tap to collapse' : 'Tap to read more';
  }
  return (
    <div {...divProps}>
      {expanded ? text : head + '…'}
      {' '}
      <button type="button" className="jrn-expand-toggle" onClick={toggle}>
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
