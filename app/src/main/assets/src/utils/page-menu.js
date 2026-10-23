/* ═══════════════════════════════════════════════════════════════════════
   page-menu — a screen's own items at the top of the ⋯ menu (id-datasafe 122)
   ═══════════════════════════════════════════════════════════════════════

   The journal viewer carried its own ⋮ (Edit / Pin / Delete) beside the top
   bar's ⋯: two overflow glyphs side by side. It now shows a pencil for Edit
   and hands Pin and Delete to the ⋯ menu through here. MoreMenu reads the
   list as it opens (as it reads the page's website link), so a screen only
   says what it offers while it is mounted.

   The list lives on globalThis: MoreMenu is in bundle-d and the screens in
   other bundles, and each bundle carries its own copy of this file. */

/**
 * @typedef {{ key: string, label: string, danger?: boolean, onSelect: () => void }} PageMenuItem
 */

/** The items the screen on view offers, or null. @returns {PageMenuItem[] | null} */
export function pageMenu() {
  const items = /** @type {any} */ (globalThis).__votPageMenu;
  return Array.isArray(items) && items.length ? items : null;
}

/** Offer `items` in the ⋯ menu while the caller is mounted (null offers nothing).
 *  @param {PageMenuItem[] | null} items */
export function usePageMenu(items) {
  React.useEffect(() => {
    if (!items) return undefined;
    const g = /** @type {any} */ (globalThis);
    g.__votPageMenu = items;
    return () => { if (g.__votPageMenu === items) g.__votPageMenu = null; };
  }, [items]);
}
