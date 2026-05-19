/* ═══════════════════════════════════════════════════════════════
   EXPANDABLE TEXT — shared collapse/expand wrapper
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Depends on: React (loaded earlier).

   A cross-feature primitive: renders text inline; if it exceeds
   `threshold` chars the trailing portion is hidden behind a
   "Show more / Show less" toggle. Used by Journal (viewer/editor
   embed cards), Bookmarks (long thoughts) and Notes (NoteRow body /
   anchor). It was previously defined inside JournalViewerScreen.js;
   promoted here so three features don't depend on a component buried
   in the journal viewer (refactor-as-we-go).

   MUST load before any consumer renders — wired in index.html ahead
   of the journal module set + BookmarksScreen.js.

   Props:
     text       — the full string
     threshold  — char count past which it truncates (default 240)
     className  — applied to the root <div>
     tapToToggle — when true AND the text is long enough to truncate,
                   the WHOLE text region toggles expand/collapse on tap
                   (not just the button), and the click is stopped from
                   bubbling so a parent card's nav handler doesn't also
                   fire. When the text is short (no toggle needed) the
                   region is inert so taps fall through to the parent
                   (e.g. navigate to source).

   Exposed globally as BOTH `ExpandableText` and `JrnExpandable`
   (back-compat alias — every existing call site keeps working).
═══════════════════════════════════════════════════════════════ */

function ExpandableText(props) {
  var useState = React.useState;
  var text = props.text || '';
  var threshold = props.threshold || 240;
  var className = props.className || '';
  var tapToToggle = !!props.tapToToggle;
  var _exp = useState(false);
  var expanded = _exp[0]; var setExpanded = _exp[1];
  if (!text || text.length <= threshold) {
    // Nothing to collapse — render plain so taps reach the parent card.
    return React.createElement('div', { className: className }, text);
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
  return React.createElement('div', divProps,
    expanded ? text : head + '…',
    ' ',
    React.createElement('button', {
      type: 'button',
      className: 'jrn-expand-toggle',
      onClick: toggle
    }, expanded ? 'Show less' : 'Show more')
  );
}

/* Back-compat alias — keep every existing `JrnExpandable` call site
   working without edits. */
var JrnExpandable = ExpandableText;
if (typeof window !== 'undefined') {
  window.ExpandableText = ExpandableText;
  window.JrnExpandable = ExpandableText;
}
