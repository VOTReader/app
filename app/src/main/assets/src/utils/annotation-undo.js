// @ts-check
/* annotation-undo — a 5 s Undo after a mark or a link is removed (ideas audit A06.6, U06.2).
   The stores are bundle-d window globals, read at call time. */
import { showUndoToast } from './toast.js';

/** @returns {any} */
const _ann = () => /** @type {any} */ (globalThis).AnnotationStore;
/** @returns {any} */
const _notes = () => { const n = /** @type {any} */ (globalThis).NoteStore; return n && typeof n.get === 'function' ? n : null; };

/**
 * What removing these groups would lose: every segment, and the note riding on it.
 * @param {Iterable<string>} groupIds
 * @returns {{ gid: string, segs: { key: string, ann: any }[], note: any }[]}
 */
export function snapshotGroups(groupIds) {
  const out = [];
  for (const gid of groupIds) {
    const notes = _notes();
    out.push({ gid, segs: _ann().getByGroup(gid) || [], note: notes ? notes.get(gid) : null });
  }
  return out;
}

/** Put snapshotted groups back as they were. @param {ReturnType<typeof snapshotGroups>} snaps */
export function restoreGroups(snaps) {
  for (const s of snaps) {
    for (const { key, ann } of s.segs) _ann().add(key, ann);
    const notes = _notes();
    if (s.note && notes) notes.set(s.gid, s.note);
  }
}

/** "Highlight removed · Undo". @param {ReturnType<typeof snapshotGroups>} snaps @param {string} [text] */
export function offerUndoRemoved(snaps, text) {
  if (!snaps.some((s) => s.segs.length || s.note)) return;
  showUndoToast('vot-toast-mark-removed', text || 'Highlight removed', () => restoreGroups(snaps));
}

/** "Highlighted · Undo" after a new mark: Undo takes it off again. @param {string} groupId @param {string} [text] */
export function offerUndoAdded(groupId, text) {
  showUndoToast('vot-toast-mark-added', text || 'Highlighted', () => _ann().removeGroup(groupId));
}

/** "Link removed · Undo". @param {any} link */
export function offerUndoLinkRemoved(link) {
  const store = /** @type {any} */ (globalThis).LinkStore;
  if (!link || !store) return;
  showUndoToast('vot-toast-link-removed', 'Link removed', () => store.add(link));
}
