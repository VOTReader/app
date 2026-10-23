/* ═══════════════════════════════════════════════════════════════════════
   mark-overlap — which of two overlapping marks paints, and what a delete uncovers
   ═══════════════════════════════════════════════════════════════════════
   The rule both paint paths follow (annotation-engine.jsx) lives here, in a leaf
   module, so the sheets that delete marks (AnnotationActionChip, NoteSheet,
   SelectionToolbar) can ask the same question without the whole renderer. */

/* An annotation's effective VISIBILITY — does it paint anything? A blank
   highlight (or a legacy kind:'note', which aliases to blank) shows nothing, so
   it never suppresses a colored annotation beneath it in an overlap: blank is
   transparent and lets the layer below show. */
export function annVisible(ann) {
  if (!ann || ann.kind === 'note') return false;
  return !!(ann.color && ann.color !== 'blank');
}

/* Overlap stacking order: the most-recently CREATED annotation wins, with the
   id as a stable tiebreaker. "a is above b" === a is more recent than b. */
export function annAbove(a, b) {
  const ac = a.created || 0, bc = b.created || 0;
  return ac > bc || (ac === bc && (a.id || '') > (b.id || ''));
}

/** The palette's own name for a stored color (old 'cyan' marks paint teal). */
const COLOR_NAMES = /** @type {Record<string, string>} */ ({ cyan: 'teal' });

/** @param {any} a @returns {string} "yellow", "blue underline", "green squiggle" */
function markLabel(a) {
  const style = a.kind === 'underline' ? ' underline' : a.kind === 'squiggle' ? ' squiggle' : '';
  return (COLOR_NAMES[a.color] || a.color) + style;
}

/**
 * RC.11 (UX sweep 2026-10-22): a mark painted over an older one hides it there (the newest visible mark paints), so
 * deleting the newer one brings the older one back with no word. The delete confirms say so: this names what shows
 * again once `groupIds` go, or '' when nothing does. An older mark still under another newer mark that stays is not
 * uncovered; a group's pieces in other verses count too.
 * @param {string[]} groupIds the groups being deleted
 * @param {any} store AnnotationStore (get, getByGroup)
 * @returns {string}
 */
export function uncoveredLine(groupIds, store) {
  if (!store || typeof store.get !== 'function' || typeof store.getByGroup !== 'function') return '';
  const doomed = new Set(groupIds);
  /** @type {Set<string>} */
  const labels = new Set();
  doomed.forEach((gid) => {
    store.getByGroup(gid).forEach(({ key, ann }) => {
      if (!annVisible(ann)) return;
      const onKey = store.get(key) || [];
      onKey.forEach((under) => {
        if (doomed.has(under.groupId) || !annVisible(under) || !annAbove(ann, under)) return;
        const s = Math.max(ann.start, under.start), e = Math.min(ann.end, under.end);
        if (s >= e) return;
        // Covered by newer marks that stay over the whole of [s, e]: it stays hidden.
        const stays = onKey
          .filter((t) => t !== under && !doomed.has(t.groupId) && annVisible(t) && annAbove(t, under))
          .map((t) => [Math.max(s, t.start), Math.min(e, t.end)])
          .filter(([a, b]) => a < b)
          .sort((x, y) => x[0] - y[0]);
        let at = s;
        for (const [a, b] of stays) { if (a > at) break; at = Math.max(at, b); }
        if (at < e) labels.add(markLabel(under));
      });
    });
  });
  if (!labels.size) return '';
  return labels.size === 1 ? 'The ' + [...labels][0] + ' under it shows again.' : 'The marks under it show again.';
}
