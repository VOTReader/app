/* ═══════════════════════════════════════════════════════════════════════
   audio-text-edition — the Bible text a chapter shows while its recording plays
   ═══════════════════════════════════════════════════════════════════════
   The reader's text defaults to NKJV and the default recording is BRM's KJV, so
   a listener following along read "Most assuredly" while the voice said
   "Verily, verily" (critique 2026-10-05, issue 6). While a recording of THIS
   book is loaded in the player (playing or paused), the chapter shows the
   recording's own translation; when the player lets go, the reader's choice
   comes back. Settings are never written: NKJV stays the default text.

   A restored-Name reader keeps restored names: NKJV-R under a KJV recording
   shows KJV-R, because the Name is a reading choice the reader made on purpose
   and the overlay changes nothing else. A recording whose translation has no
   text edition here (Matthew's TSOT is its own corpus; the John film has none)
   leaves the reader's choice alone.
   ═══════════════════════════════════════════════════════════════════════ */

import { resolveBibleAudio } from './audio-track.js';

/** index.html declares it with a top-level `const`, which is NOT a window
 *  property, so it is read by bare name (as data/translations.js does).
 *  @returns {Array<{id: string, base?: string}>} */
function _options() {
  // @ts-ignore -- classic-script global from index.html
  return (typeof TRANSLATION_OPTIONS !== 'undefined' && Array.isArray(TRANSLATION_OPTIONS)) ? TRANSLATION_OPTIONS : [];
}

/** 'rnkjv' -> 'nkjv', 'rkjv' -> 'kjv', anything else -> itself. */
function _family(code) {
  const opt = _options().find((o) => o.id === code);
  if (opt && opt.base) return opt.base;
  if (/^r(nkjv|kjv)$/.test(code)) return code.slice(1);
  return code;
}

/**
 * The text edition to show, given the reader's choice and the playing
 * recording's translation. Pure, so the rule is tested on its own.
 *
 * @param {string | null | undefined} reading  settings.translation
 * @param {string | null | undefined} audio    the recording's translation, '' / null when none plays here
 * @returns {string}
 */
export function textForRecording(reading, audio) {
  const mine = reading || 'nkjv';
  if (!audio) return mine;
  const ids = _options().map((o) => o.id);
  if (ids.length && !ids.includes(audio)) return mine;
  if (_family(mine) === audio) return mine;
  const restored = mine !== _family(mine);
  if (restored && ids.includes('r' + audio)) return 'r' + audio;
  return audio;
}

/**
 * The translation of the Bible recording loaded in the player for this book,
 * or '' when none is. A string so it can be a useSyncExternalStore snapshot:
 * the chapter re-renders when the answer changes, not on every clock tick.
 * Paused counts as loaded: a reader who pauses to look closer must not see the
 * words change under them.
 *
 * @param {{getState: () => any}} player  AudioPlayer
 * @param {string} bookId
 * @returns {string}
 */
export function recordingTranslationFor(player, bookId) {
  const st = player && player.getState ? player.getState() : null;
  if (!st || st.status === 'idle') return '';
  const track = st.queue && st.queue[st.qi];
  if (!track) return '';
  const ed = resolveBibleAudio({ track }).paint;
  if (!ed || !ed.translation || track.key !== ed.volKey + ':' + bookId) return '';
  return ed.translation;
}
