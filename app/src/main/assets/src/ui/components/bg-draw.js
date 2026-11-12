/* bg-draw - the context a tab drawn off screen for its Tabs card is rendered under (TABS6, 2026-11-12).
   TabSnapDrawer renders another tab's real screen out of sight so its card gets a true picture without a visit.
   Under this context that screen is INERT, exactly as a swipe neighbour is (ScreenLayout and the reading screens read
   it as their `inert` prop): it claims none of the app's singletons (scroll element, read tracker, mark-as-read,
   audio prewarm, sheets), and ScreenLayout lays it out as the live screen's box (layout, viewport, column, track,
   without the bar) at the tab's saved place.
   Value: null outside a background draw, else { restore: the tab's saved place record or null, pager: true for a
   reading screen (the live one sits in a pager viewport, whose column keeps its scrollbar gutter) }. */

/** @type {any} */
export const BgDrawContext = React.createContext(/** @type {null | { restore: any, pager: boolean }} */ (null));
