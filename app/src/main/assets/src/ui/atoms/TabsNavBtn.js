function TabsNavBtn() {
  const ctx = React.useContext(TabsContext);
  if (!ctx || !ctx.enabled) return null;
  const { count, onOpen, isOnTabsScreen } = ctx;
  const label = count > 99 ? '99+' : String(count);
  return (/*#__PURE__*/
    React.createElement("button", {
      className: `tabs-nav-btn${isOnTabsScreen ? ' active' : ''}`,
      onClick: onOpen,
      title: `${count} tab${count === 1 ? '' : 's'} open`,
      "aria-label": `Open tabs (${count} open)` }, /*#__PURE__*/

    React.createElement("span", { className: "tabs-nav-btn-glyph" }, "\u25A2"), /*#__PURE__*/
    React.createElement("span", { className: "tabs-nav-btn-count" }, label)
    ));
}
