/* ═══════════════════════════════════════════════════════════════════════
   AnnotationDomSync — effects-only leaf owning the annotation DOM re-apply (U5)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-d.js; globalized via _entry-d.

   Renders null. It calls useDomAnnotationSync, which subscribes to the four
   annotation stores (Annotation/Note/Link/Bookmark) via useSyncExternalStore.

   WHY THIS IS A COMPONENT, NOT A HOOK CALL IN App():
   useSyncExternalStore re-renders whatever component subscribes. When App()
   called useDomAnnotationSync directly, every store _bump() — a highlight,
   note, link, or bookmark mutation — re-rendered ALL of App(): it rebuilt the
   ~90-prop ROUTES object (with ~33 fresh handler closures) and reconciled the
   active screen (e.g. ~176 verse components in Psalm 119) on every annotation
   tap. The imperative DOM layer exists precisely to AVOID re-rendering verses
   for annotations, so routing the trigger through App() defeated it.

   Mounting this leaf as a CHILD of App() isolates the subscription: a store
   bump now re-renders ONLY this null-rendering leaf and re-runs the apply
   passes (the actual goal). App() no longer re-renders on annotation
   mutations. App still re-renders on screen / letterId / noteSheetTarget
   changes (its own state) and passes them down as props, so the apply pass
   still fires on navigation and note open/close — exactly as before.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @param {{
 *   screen: string,
 *   letterId: string | null,
 *   noteSheetTarget: { groupId: string } | null,
 *   setNoteSheetTarget: (v: any) => void
 * }} props
 * @returns {null}
 */
export function AnnotationDomSync({ screen, letterId, noteSheetTarget, setNoteSheetTarget }) {
  useDomAnnotationSync({ screen, letterId, noteSheetTarget, setNoteSheetTarget });
  return null;
}
