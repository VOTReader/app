/* ═══════════════════════════════════════════════════════════════════════
   TabsNavBtn — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

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
