/* ═══════════════════════════════════════════════════════════════════════
   page-menu — a screen's own items at the top of the ⋯ menu (id-datasafe 122)
   ═══════════════════════════════════════════════════════════════════════

   The journal viewer carried its own ⋮ (Edit / Pin / Delete) beside the top
   bar's ⋯: two overflow glyphs side by side. It now shows a pencil for Edit
   and hands Pin and Delete to the ⋯ menu through here. MoreMenu reads the
   list as it opens (as it reads the page's website link), so a screen only
   says what it offers while it is mounted.

   More than one part of a screen can offer at once (WA6: an Answers topic
   opened from Search has "Find in this topic" and its own "Share as a card"),
   so the slot holds a list of lists, one per offerer, in the order they
   mounted, and the menu shows them all.

   The lists live on globalThis: MoreMenu is in bundle-d and the screens in
   other bundles, and each bundle carries its own copy of this file. */

/**
 * @typedef {{ key: string, label: string, icon?: 'find' | 'share', danger?: boolean, onSelect: () => void }} PageMenuItem
 */

/** The items the screen on view offers, or null. @returns {PageMenuItem[] | null} */
export function pageMenu() {
  const lists = /** @type {any} */ (globalThis).__votPageMenu;
  if (!Array.isArray(lists)) return null;
  const items = [].concat(...lists.filter(Array.isArray));
  return items.length ? items : null;
}

/** Offer `items` in the ⋯ menu while the caller is mounted (null offers nothing).
 *  @param {PageMenuItem[] | null} items */
export function usePageMenu(items) {
  React.useEffect(() => {
    if (!items) return undefined;
    const g = /** @type {any} */ (globalThis);
    if (!Array.isArray(g.__votPageMenu)) g.__votPageMenu = [];
    const lists = g.__votPageMenu;
    lists.push(items);
    return () => { const i = lists.indexOf(items); if (i >= 0) lists.splice(i, 1); };
  }, [items]);
}
