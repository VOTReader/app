/* ═══════════════════════════════════════════════════════════════
   VOT NOTE LABEL — the volume caption on a Matthew Study Bible note
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Bundled into bundle-b via _entry-b.js.

   The New Testament Study Bible PDF lists its Volumes-of-Truth notes as

       10:1   Volume One, Humility and The Word of God, "…"

   — reference, volume, letter title, excerpt. But a few rows name NO volume,
   because the letter they cite is not in any published volume:

       10:9   I Have Purged; Behold, I Shall Wipe Away and Restore, "…"
       23:32  Woe to Dallas, "…"

   The importer recorded those faithfully — the title went into BOTH `vol` and
   `letter` (and `null` into `vol` for the one row that points at an album
   rather than a letter). That is the right thing for the DATA to say: the
   corpus mirrors the official source. It is the wrong thing to PRINT, because
   every render path showed `n.vol` raw and so captioned the note with the
   title it was about to quote underneath.

   Five rows are affected: 5:1-11, 10:9, 10:19, 23:32/36, 26:28.

   Of the letters those rows cite, only "Woe to Dallas" is in the app (as
   Hidden Manna). "I Am The Lord, I Have Purged; Behold, I Shall Wipe Away and
   Restore" and "The Promise" exist upstream but have never been imported, so
   their notes render as static text — reference, title and excerpt, with no
   chevron. That is correct: `resolveVotLetter` returns null for them and
   every render path already gates tappability on it, so there is no dead-end
   tap. They are simply not yet reachable.
   ═══════════════════════════════════════════════════════════════ */

/**
 * The volume caption to print above a votNote, or '' when the note names no
 * volume of its own.
 *
 * @param {{vol?: string|null, letter?: string|null}|null|undefined} n
 * @returns {string}
 */
export function votNoteVolLabel(n) {
  if (!n) return '';
  const vol = String(n.vol == null ? '' : n.vol).trim();
  if (!vol) return '';
  const letter = String(n.letter == null ? '' : n.letter).trim();
  // A "volume" that is just the letter title again is the importer recording
  // a source row that had no volume — caption nothing rather than print the
  // same words twice.
  if (letter && vol.toLowerCase() === letter.toLowerCase()) return '';
  return vol;
}
