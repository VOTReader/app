function LinkIcon({ hlKey, hlTick, onClick, prefix }) {
  const links = useMemo(
    () => prefix ? LinkStore.getForKeyPrefix(hlKey) : LinkStore.getForKey(hlKey),
    [hlKey, hlTick, prefix]
  );
  if (!links || links.length === 0) return null;
  return React.createElement("span", {
    className: "verse-link-icon",
    onClick: (e) => { e.stopPropagation(); onClick && onClick(hlKey); },
    title: links.length + " link" + (links.length > 1 ? "s" : "")
  },
    React.createElement("svg", { viewBox: "0 0 24 24" },
      React.createElement("path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }),
      React.createElement("path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" })
    )
  );
}
