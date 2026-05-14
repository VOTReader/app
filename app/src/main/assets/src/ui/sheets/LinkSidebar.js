function LinkCard({ lnk, hlKey, isBlockScope, onNavigate, setHlTick }) {
  const [expanded, setExpanded] = useState(false);
  const matchesSide = (k) => isBlockScope ? (k === hlKey || k.startsWith(hlKey + ':')) : k === hlKey;
  const other = matchesSide(lnk.a.key) ? lnk.b : lnk.a;
  const thisSide = matchesSide(lnk.a.key) ? lnk.a : lnk.b;
  const preview = resolveVerseText(other);
  const otherText = other.text || preview || '';
  const usingFromFallback = !otherText && !!thisSide.text;
  const rawText = otherText || thisSide.text || '';
  const isLong = rawText.length > 150;
  const chainSvg = React.createElement("svg", { className: "link-card-chain", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }),
    React.createElement("path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" })
  );
  return React.createElement("div", { className: "link-card", onClick: () => onNavigate && onNavigate(other) },
    React.createElement("div", { className: "link-card-header" },
      React.createElement("div", { className: "link-card-ref" }, other.label),
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
    React.createElement("div", {
      className: "link-card-preview",
      style: expanded ? { display: 'block', WebkitLineClamp: 'unset', overflow: 'visible' } : undefined
    },
      ((other.type === 'bible' || other.type === 'study') && other.verse) && React.createElement("strong", null, other.verse + " "),
      usingFromFallback && React.createElement("em", { className: "link-card-from-label" }, "From: "),
      rawText
    ),
    React.createElement("div", { className: "link-card-actions" },
      isLong && React.createElement("span", {
        className: "link-card-show-more",
        onClick: (e) => { e.stopPropagation(); setExpanded(x => !x); }
      }, expanded ? "Show less" : "Show more"),
      React.createElement("span", {
        className: "link-card-remove",
        onClick: (e) => {
          e.stopPropagation();
          LinkStore.remove(lnk.id);
          setHlTick(t => t + 1);
        }
      }, "Remove link")
    )
  );
}

function LinkSidebar({ hlKey, hlTick, setHlTick, onClose, onNavigate }) {
  const isBlockScope = hlKey && (hlKey.startsWith('letter:') || hlKey.startsWith('wtlb:') || hlKey.startsWith('blessed:') || hlKey.startsWith('holy-days:'));
  const links = useMemo(
    () => isBlockScope ? LinkStore.getForKeyPrefix(hlKey) : LinkStore.getForKey(hlKey),
    [hlKey, hlTick, isBlockScope]
  );
  useEffect(() => {
    if (!hlKey) return;
    const prev = window.__closeSheet;
    window.__closeSheet = onClose;
    return () => { window.__closeSheet = prev || null; };
  }, [hlKey, onClose]);
  if (!hlKey) return null;
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  return React.createElement(React.Fragment, null,
    React.createElement("div", { className: "link-sidebar-overlay", onClick: onClose }),
    React.createElement("div", { className: "link-sidebar" },
      React.createElement("div", { className: "link-sidebar-header" },
        React.createElement("button", { className: "link-sidebar-close", onClick: onClose, title: "Close" }, "×"),
        React.createElement("span", { className: "link-sidebar-title" }, "Links")
      ),
      React.createElement("div", { className: "link-sidebar-date" }, dateStr),
      React.createElement("div", { className: "link-sidebar-body" },
        links.length === 0 && React.createElement("div", { className: "link-sidebar-empty" }, "No links yet"),
        links.map(lnk => React.createElement(LinkCard, { key: lnk.id, lnk, hlKey, isBlockScope, onNavigate, setHlTick }))
      )
    )
  );
}
