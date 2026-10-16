/* notebook-facts.js - main's notebooks as v2 shows them (mw9d, design dz20 3i-3m). Pure but for the two store writes at
   the end (Delete notebook and its Undo): v2 reads and writes main's own NotebookStore and NoteStore (globals from
   bundle-b), so main and v2 show the same notebooks.

   A notebook is main's record { id, name, color?, sortIndex, created, updated }; a note joins one through its own
   notebookIds (0..N); a note in none is Uncategorized (main's NotesIndexScreen). Colour: v2's five swatches stand for
   main's ids (Gold = no colour, main's "Default gold"); a notebook main gave another colour keeps it, drawn in main's own
   hex with a sixth swatch. */

const g = /** @type {any} */ (globalThis);

/** v2's five swatches, as main stores them (marks.js MAIN_COLOUR; Gold is main's no-colour default). */
export const SWATCHES = [
  { id: 'gold', label: 'Gold', main: null },
  { id: 'sage', label: 'Sage', main: 'green' },
  { id: 'rose', label: 'Rose', main: 'pink' },
  { id: 'blue', label: 'Blue', main: 'blue' },
  { id: 'plum', label: 'Plum', main: 'purple' },
];
/** Main's other colour tags (app.css --hl-*), kept as they are. */
const MAIN_HEX = { yellow: '#ffd700', red: '#f44336', orange: '#ff9100', teal: '#00bcd4', brown: '#8d6e63', gray: '#9e9e9e' };

/** The id the drawn Uncategorized card and page go by (main's drilledNbId 'uncategorized'). */
export const UNCATEGORIZED = 'uncategorized';
/** Main's 60-character cap on a notebook's name (NotebookPickerSheet). */
export const NAME_MAX = 60;

/**
 * How a main colour draws: one of v2's swatches, or main's own colour with its hex (a sixth swatch).
 * @param {string | null | undefined} color @returns {{ id: string, label: string, main: string | null, hex?: string }}
 */
export function swatchOf(color) {
  if (!color) return SWATCHES[0];
  const mine = SWATCHES.find((s) => s.main === color);
  if (mine) return mine;
  return { id: color, label: color.charAt(0).toUpperCase() + color.slice(1), main: color, hex: MAIN_HEX[color] || '#9e9e9e' };
}

/** The sheet's swatches: v2's five, and a notebook's own main colour as a sixth. @param {string | null | undefined} color */
export function swatchesFor(color) {
  const s = swatchOf(color);
  return s.hex ? [...SWATCHES, s] : SWATCHES;
}

/** "4 notes" / "1 note" (main's count words). @param {number} n */
export function noteCount(n) {
  return n + (n === 1 ? ' note' : ' notes');
}

/** Create and Save wait for a name with a letter in it. @param {string} name */
export function canName(name) {
  return /\p{L}/u.test(name || '');
}

/** @typedef {{ id: string, name: string, color: string | null }} Notebook */

/** Main's notebooks in its order (sortIndex, then created). @returns {Notebook[]} */
export function readNotebooks(env = g) {
  const S = env.NotebookStore;
  const list = S && typeof S.list === 'function' ? S.list() || [] : [];
  return list.filter(Boolean).map((nb) => ({ id: nb.id, name: nb.name || '', color: nb.color || null }));
}

/** Each note's notebookIds, from main's NoteStore. @returns {string[][]} */
export function readMemberships(env = g) {
  const N = env.NoteStore;
  const all = N && typeof N.all === 'function' ? N.all() || {} : {};
  return Object.values(all).filter(Boolean).map((n) => (Array.isArray(n.notebookIds) ? n.notebookIds : []));
}

/**
 * The cards on the Notes chip (3i): Uncategorized first (only once there is a notebook), then the notebooks, each with
 * its count. @param {Notebook[]} notebooks @param {string[][]} memberships
 * @returns {Array<{ id: string, name: string, color: string | null, count: number }>}
 */
export function notebookCards(notebooks, memberships) {
  if (!notebooks.length) return [];
  const count = (id) => memberships.filter((ids) => ids.includes(id)).length;
  return [
    { id: UNCATEGORIZED, name: 'Uncategorized', color: null, count: memberships.filter((ids) => !ids.length).length },
    ...notebooks.map((nb) => ({ ...nb, count: count(nb.id) })),
  ];
}

/**
 * A notebook page's notes (3j), newest first by default as main (updated, else created: a note mark's `at`).
 * @param {any[]} notes note marks, or anything with { at, nb }
 * @param {string} id a notebook's id or UNCATEGORIZED
 * @param {'newest' | 'oldest'} order
 * @returns {any[]}
 */
export function notesIn(notes, id, order = 'newest') {
  const inIt = notes.filter((m) => (id === UNCATEGORIZED ? !(m.nb && m.nb.length) : !!(m.nb && m.nb.includes(id))));
  return inIt.sort((a, b) => (order === 'oldest' ? a.at - b.at : b.at - a.at));
}

/** The notebook page's empty line (3j; Uncategorized's is main's). @param {string} id */
export function emptyWords(id) {
  return id === UNCATEGORIZED ? 'Notes that aren\'t in any notebook will appear here.'
    : 'Nothing here yet. Add a note from the note itself: Add to a notebook.';
}

/**
 * Main's "Share as text" (notes-export.js through bundle-d's globals): the notebook's notes in the order shown, as one
 * markdown message. Null before bundle-d is here. @param {string} title @param {string[]} groupIds
 */
export function shareTextOf(title, groupIds, env = g) {
  const N = env.NoteStore;
  if (typeof env.composeNotesExport !== 'function' || !N) return null;
  const notes = groupIds.map((id) => N.get(id)).filter(Boolean);
  return env.composeNotesExport({ title, notes, resolveLabel: env.noteSourceLabel });
}

/**
 * Delete notebook (3k): at once, as main's store does it (its notes lose the tag, so they are Uncategorized if it was
 * their only one); returns the Undo, which puts the notebook back with its own id and the tag back on the same notes,
 * their dates unmoved (the stamp moves one ms past the note's own, as main's pruneNotebook does, to win the merge).
 * @param {string} id @returns {(() => void) | null}
 */
export function deleteNotebook(id, env = g) {
  const B = env.NotebookStore;
  const N = env.NoteStore;
  const nb = B && typeof B.get === 'function' ? B.get(id) : null;
  if (!nb || !N) return null;
  const record = { ...nb };
  const members = Object.entries(N.all() || {}).filter(([, n]) => n && (n.notebookIds || []).includes(id)).map(([k]) => k);
  B.remove(id);
  return () => {
    if (!B.get(id)) B.replaceAll({ list: [...B.list(), record] });
    const all = N.all() || {};
    const next = { ...all };
    let changed = false;
    for (const k of members) {
      const n = all[k];
      if (!n || (n.notebookIds || []).includes(id)) continue;
      next[k] = { ...n, notebookIds: [...(n.notebookIds || []), id], updated: (n.updated || n.created || 0) + 1 };
      changed = true;
    }
    if (changed) N.replaceAll(next);
  };
}
