/* ===================================================================
   notes-export — compose My Notes / a notebook as a shareable text doc
   ===================================================================
   Pure composer + a thin delivery shim for the "Share as text" action on
   the Notes index (a notebook's drilled header + the All Notes tab).
   The output is a human-readable markdown/plain-text ARTIFACT — it is
   NOT a backup format (Settings → Your Data owns backup; no importer
   exists or should exist for this).

   composeNotesExport / notesExportFilename are pure (notes + resolver
   in → string out) so the document shape is unit-testable without DOM
   or stores. shareNotesExport hands the composed text to the existing
   platform paths: navigator.share where the host provides it, else
   PlatformBridge.saveToFile (Android SAF create-document picker / web
   Blob download — the same primitive the W1.2 export flow shipped).
   =================================================================== */

import { normalizeExcerptDisplay } from './excerpt-display.js';

const _MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Absolute local-time date label ("July 3, 2026"). Fixed English month
 * names (the app is English-only) so tests are locale-independent —
 * unlike toLocaleDateString, whose output varies with the host ICU.
 *
 * @param {number | null | undefined} ts  epoch ms; falsy → ''
 * @returns {string}
 */
export function _absoluteDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return _MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

/**
 * A note record from NoteStore. Only the fields the composer reads are
 * described; the full shape lives in note-store.js.
 *
 * @typedef {{
 *   groupId?: string,
 *   keys?: string[],
 *   body?: string,
 *   fullText?: string,
 *   created?: number,
 *   updated?: number
 * }} ExportableNote
 */

/**
 * Resolve a note's source label via the caller-supplied resolver
 * (NotesIndexScreen passes noteSourceLabel, which already degrades to
 * the raw slug when the VOT corpus/title can't resolve). A THROWING
 * resolver degrades further to the note's first raw key, so one bad
 * record can't take down the whole export.
 *
 * @param {ExportableNote} note
 * @param {((note: ExportableNote) => string) | undefined} resolveLabel
 * @returns {string}
 */
function _labelFor(note, resolveLabel) {
  if (typeof resolveLabel === 'function') {
    try {
      const label = resolveLabel(note);
      if (label) return label;
    } catch (_e) { /* degrade to the raw key below */ }
  }
  return (note.keys && note.keys[0]) || 'Note';
}

/**
 * Compose a markdown document from a list of notes — the exact list the
 * user is looking at (already sorted by the caller). Notes are grouped
 * by source label in order of first appearance; each note renders its
 * anchor as a blockquote (normalized like NoteRow renders it), then the
 * body, then an absolute date line. A small header carries the export
 * title (notebook name or "My Notes"), the count, and the export date.
 *
 * @param {object} opts
 * @param {string} opts.title                                 - notebook name or "My Notes"
 * @param {ExportableNote[]} opts.notes                       - notes in display order
 * @param {(note: ExportableNote) => string} [opts.resolveLabel] - note → source label (noteSourceLabel)
 * @param {number} [opts.now]                                 - export timestamp (default Date.now())
 * @returns {string}
 */
export function composeNotesExport({ title, notes, resolveLabel, now }) {
  const list = notes || [];
  const ts = now == null ? Date.now() : now;
  const lines = [];
  lines.push('# ' + (title || 'My Notes'));
  lines.push('');
  lines.push(
    list.length + (list.length === 1 ? ' note' : ' notes') +
    ' · Exported ' + _absoluteDate(ts) + ' · VOTReader'
  );
  if (!list.length) {
    lines.push('');
    lines.push('No notes.');
    return lines.join('\n') + '\n';
  }

  // Group by source label, preserving order of first appearance so the
  // document reads in the same order as the on-screen list.
  /** @type {Map<string, ExportableNote[]>} */
  const groups = new Map();
  list.forEach(note => {
    const label = _labelFor(note, resolveLabel);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(note);
  });

  groups.forEach((groupNotes, label) => {
    lines.push('');
    lines.push('## ' + label);
    groupNotes.forEach(note => {
      const parts = [];
      const anchor = normalizeExcerptDisplay(note.fullText);
      if (anchor) {
        // Blockquote every line so a multi-line anchor stays one quote.
        parts.push(('“' + anchor + '”').split('\n').map(l => '> ' + l).join('\n'));
      }
      const body = (note.body || '').trim();
      if (body) parts.push(body);
      const date = _absoluteDate(note.updated || note.created);
      if (date) parts.push('— ' + date);
      if (parts.length) {
        lines.push('');
        lines.push(parts.join('\n\n'));
      }
    });
  });

  return lines.join('\n') + '\n';
}

/**
 * Filename for the saved artifact — "<title> notes 2026-07-03.md"
 * (" notes" is skipped when the title already says it, so "My Notes"
 * doesn't become "My Notes notes"). Strips filesystem-reserved chars;
 * local-time date stamp.
 *
 * @param {string} title
 * @param {number} [now]  epoch ms (default Date.now())
 * @returns {string}
 */
export function notesExportFilename(title, now) {
  const ts = now == null ? Date.now() : now;
  const safe = String(title || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Notes';
  const base = /notes/i.test(safe) ? safe : safe + ' notes';
  const d = new Date(ts);
  const stamp = d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
  return base + ' ' + stamp + '.md';
}

/**
 * Hand a composed document to the platform: navigator.share where the
 * host provides it (mobile browsers; the Android WebView doesn't expose
 * it), else PlatformBridge.saveToFile — the SAF create-document picker
 * on Android, a Blob download on web. The save path registers a
 * one-shot window.__onExportComplete (the saveToFile contract; nothing
 * else registers it) to toast the outcome; a user cancel stays silent.
 *
 * @param {object} opts
 * @param {string} opts.title     - share-sheet title
 * @param {string} opts.filename  - suggested filename for the save path
 * @param {string} opts.text      - the composed document
 * @returns {'share' | 'file' | 'none'} which delivery path ran
 */
export function shareNotesExport({ title, filename, text }) {
  if (typeof navigator !== 'undefined' && navigator.share) {
    navigator.share({ title, text }).catch(() => {});
    return 'share';
  }
  if (typeof PlatformBridge === 'undefined') return 'none';
  if (typeof window !== 'undefined') {
    /** @type {any} */ (window).__onExportComplete = (/** @type {string} */ result) => {
      /** @type {any} */ (window).__onExportComplete = null;
      if (typeof showToast === 'undefined') return;
      if (result === 'ok') {
        showToast({ id: 'vot-toast-info', className: 'vot-toast', text: 'Notes exported.' });
      } else if (result !== 'cancelled') {
        showToast({ id: 'vot-toast-info', className: 'vot-toast', text: 'Export failed. Please try again.', ariaLive: 'assertive' });
      }
    };
  }
  PlatformBridge.saveToFile(filename, text);
  return 'file';
}
