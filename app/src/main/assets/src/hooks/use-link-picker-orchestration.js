/* ═══════════════════════════════════════════════════════════════════════
   useLinkPickerOrchestration — the link-picker / link-sidebar sub-domain
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   D-bucket follow-up (the narrow half of D8): the link-picker cluster was the
   one genuinely separable sub-domain inside useSheetOrchestration — 6 of its
   13 state slots, with callbacks that touch ONLY those slots + bare-global
   helpers (_allBooks / findEntryContext / JournalStore / JournalHelpers), and
   NOT the chip/note/bookmark/journal-inbound state. Pulling it out leaves both
   hooks cohesive: this one owns "linking" (open the sidebar, open the picker,
   target-picker mode, refine, undo), useSheetOrchestration owns the remaining
   transient overlays.

   It is an INTERNAL sub-hook: only useSheetOrchestration imports it (not App
   directly), so it is NOT globalized — kept off `window` deliberately.

   OWNS:
     - linkSidebarKey state      hlKey | null
     - linkPickerSource state    { key, label, ... } | null
     - linkRefineRequest state   { kind, target, item } | null
     - lastLinkCreated state     most recently created link, for undo
     - linkPickerMode state      null | 'card' | 'excerpt'
     - linkPickerOnPickRef       useRef — callback for target-picker mode
     - openLinkSidebar / closeLinkSidebar      (useCallback)
     - openLinkPicker / closeLinkPicker         (useCallback)
     - openLinkPickerForTarget                  (useCallback)
     - 3 window bridges: __openLinkPicker, __openLinkPickerForTarget,
       __openLinkSidebar (each torn down with `delete` in its effect cleanup)

   WINDOW: 3 handler bridges (see OWNS). Bare-name globals read inside
     openLinkPicker (_allBooks / findEntryContext / JournalStore /
     JournalHelpers) come from other bundles; accessed by bare name, no imports.

   RETURNS: the 6 state slots + their openers/closers/setters that
     useSheetOrchestration spreads straight into its own return, so App()'s
     destructure is unchanged.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * The link-picker / link-sidebar state container + its three window bridges.
 * No params — it reads only its own state and bare-global helpers.
 * @returns {any}
 */
export function useLinkPickerOrchestration() {
  const [linkSidebarKey, setLinkSidebarKey] = React.useState(null);   // hlKey or null
  const [linkPickerSource, setLinkPickerSource] = React.useState(null); // { key, label } or null
  const [linkRefineRequest, setLinkRefineRequest] = React.useState(null); // { kind, target, item } or null
  const [lastLinkCreated, setLastLinkCreated] = React.useState(null); // most recently created link, for undo
  // Picker mode — when set, LinkPicker behaves as a target picker (no source,
  // no link persistence); the selected/refined target is handed back via
  // linkPickerOnPickRef.current. Used by Journal to drive the LinkPicker for
  // "Insert Card" (mode='card', no excerpt prompt) and "Insert Excerpt"
  // (mode='excerpt', always refine through verse/letter picker).
  const [linkPickerMode, setLinkPickerMode] = React.useState(null); // null | 'card' | 'excerpt'
  const linkPickerOnPickRef = React.useRef(null);

  const openLinkSidebar = React.useCallback((hlKey) => setLinkSidebarKey(hlKey), []);
  const closeLinkSidebar = React.useCallback(() => setLinkSidebarKey(null), []);
  const openLinkPicker = React.useCallback((selInfo) => {
    const hlKey = typeof selInfo === 'string' ? selInfo : selInfo.hlKey;
    if (!hlKey) return;
    const parts = hlKey.split(':');
    let label = hlKey;
    if (parts[0] === 'bible') {
      const b = _allBooks()[parts[1]];
      label = (b ? b.title : parts[1]) + ' ' + parts[2] + ':' + parts[3];
    } else if (parts[0] === 'study') {
      // study:bookId-chapter:verse  e.g. "study:matthew-4:7"
      const m = parts[1].match(/^(.+)-(\d+)$/);
      if (m) label = (m[1].charAt(0).toUpperCase() + m[1].slice(1)) + ' ' + m[2] + (parts[2] && parts[2] !== '0' ? ':' + parts[2] : '');
    } else if (parts[0] === 'letter' || parts[0] === 'wtlb' || parts[0] === 'blessed' || parts[0] === 'holy-days') {
      // Centralized lookup also covers Bible-Study chapters (whose source
      // hlKey shape is "letter:{chapterId}:N" because LetterView renders them).
      const ctx = findEntryContext(parts[1], parts[0]);
      if (ctx && ctx.title) label = ctx.title;
    } else if (parts[0] === 'journal') {
      // journal:<entryId>:<blockIdx>
      const eid = parts[1];
      const je = (typeof JournalStore !== 'undefined') ? JournalStore.get(eid) : null;
      if (je && typeof JournalHelpers !== 'undefined') {
        label = 'Journal · ' + (JournalHelpers.entryDisplayTitle(je) || 'Untitled');
      }
    }
    const src = typeof selInfo === 'string'
      ? { key: hlKey, label }
      : { key: hlKey, label, start: selInfo.start, end: selInfo.end, text: selInfo.text };
    setLinkPickerSource(src);
  }, []);
  const closeLinkPicker = React.useCallback(() => { setLinkPickerSource(null); setLinkRefineRequest(null); setLastLinkCreated(null); setLinkPickerMode(null); linkPickerOnPickRef.current = null; }, []);
  // Picker mode — Journal calls this to open LinkPicker as a target picker.
  //   mode: 'card'    → return target after the first item is chosen (no
  //                     verse/excerpt prompt). Used for "Insert Card".
  //   mode: 'excerpt' → always run the verse/letter excerpt picker so the
  //                     user can pick a character-precise span. Used for
  //                     "Insert Excerpt".
  // onPick receives the chosen target endpoint (+ optional refinement data).
  const openLinkPickerForTarget = React.useCallback((mode, onPick) => {
    linkPickerOnPickRef.current = typeof onPick === 'function' ? onPick : null;
    // Use a sentinel source object so the render conditions ("source &&
    // !refine") still fire — but no real source key/label exists.
    setLinkPickerSource({ key: null, label: null, picker: true });
    setLinkPickerMode(mode || 'card');
    setLinkRefineRequest(null);
    setLastLinkCreated(null);
  }, []);

  // ── Window-bridge effects ──────────────────────────────────────────────
  // Expose openLinkPicker globally so the SelectionToolbar can invoke it
  // from anywhere (Bible/Letter/WTLB views), and so tests / hardware-back
  // handling can interact with it without prop-drilling.
  React.useEffect(() => {
    window.__openLinkPicker = openLinkPicker;
    window.__openLinkPickerForTarget = openLinkPickerForTarget;
    return () => {
      delete window.__openLinkPicker;
      delete window.__openLinkPickerForTarget;
    };
  }, [openLinkPicker, openLinkPickerForTarget]);
  // window.__openLinkSidebar is read by inline link-icon clicks (dom-links.js).
  React.useEffect(() => { window.__openLinkSidebar = openLinkSidebar; return () => { delete window.__openLinkSidebar; }; }, [openLinkSidebar]);

  return {
    linkSidebarKey, openLinkSidebar, closeLinkSidebar,
    linkPickerSource, openLinkPicker, openLinkPickerForTarget, closeLinkPicker,
    linkRefineRequest, setLinkRefineRequest,
    lastLinkCreated, setLastLinkCreated,
    linkPickerMode, linkPickerOnPickRef,
  };
}
