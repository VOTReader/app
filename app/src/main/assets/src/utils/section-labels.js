// @ts-check
/* section-labels: a WTLB compilation's range, read from its synced rows (reader-behaviour-n4, audit 11-23).

   AUDIO_SECTIONS labels each compilation file by hand ("Section 2 · 29–56"). Words To Live By: Part Two's labels
   run two behind what the files read: Section 2 plays Entries 31-58. The read-along table (AUDIO_SYNC_SECTIONS)
   knows which entries each file reads, in order, so the range is taken from there and the entries' own numbers.
   A letter the aligner could not prove is absent from its file's rows, so a file's range runs from the entry
   after the previous file's last to the entry before the next file's start (Part One's Part 7 has no row for 125,
   and Part 6 none either: it stays in Part 7, as the hand label has it). A label whose numbers already agree is kept as it is; anything not known
   (the table not landed, an entry not found) keeps the hand label. Pure, so any bundle may import it. */

/**
 * @param {ReadonlyArray<any[]>} secs [label, assetId, reader] as AUDIO_SECTIONS holds them, in file order
 * @param {Record<string, Record<string, any>> | null | undefined} table AUDIO_SYNC_SECTIONS
 * @param {(volKey: string) => any[] | null | undefined} entriesOf the collection's entries, each with id and num
 * @returns {ReadonlyArray<any[]>} the same array when nothing changes, else a relabelled copy
 */
export function relabelSections(secs, table, entriesOf) {
  if (!Array.isArray(secs) || !secs.length || !table) return secs;
  /** @type {Array<{ first: number, last: number, intro: boolean } | null>} */
  const spans = secs.map((s) => {
    const rows = s && table[s[1]];
    const keys = rows ? Object.keys(rows) : [];
    if (!keys.length) return null;
    const volKey = keys[0].slice(0, keys[0].indexOf(':'));
    const entries = volKey ? entriesOf(volKey) : null;
    if (!Array.isArray(entries) || !entries.length) return null;
    const byId = new Map(entries.map((e) => [e && e.id, e]));
    const id = (/** @type {string} */ k) => k.slice(k.indexOf(':') + 1);
    const a = byId.get(id(keys[0]));
    const b = byId.get(id(keys[keys.length - 1]));
    if (!a || !b || !(a.num > 0) || !(b.num > 0)) return null;
    return { first: a.num, last: b.num, intro: a.id === 'introduction' };
  });
  if (spans.some((s) => !s)) return secs;
  const s = /** @type {Array<{ first: number, last: number, intro: boolean }>} */ (spans);
  let changed = false;
  // A gap of unproved entries between two files goes to the later file, as the hand labels place it.
  const starts = s.map((sp, i) => (i === 0 ? sp.first : Math.min(sp.first, s[i - 1].last + 1)));
  const out = secs.map((sec, i) => {
    const from = starts[i];
    const to = i === s.length - 1 ? s[i].last : Math.max(from, starts[i + 1] - 1);
    const label = String(sec[0] || '');
    const at = label.indexOf(' · ');
    const name = at > 0 ? label.slice(0, at) : label;
    const dash = label.indexOf('–') >= 0 ? '–' : '-';
    const range = (i === 0 && s[i].intro ? 'Intro' : String(from)) + dash + to;
    const next = name + ' · ' + range;
    if (next === label) return sec;
    changed = true;
    return [next, ...sec.slice(1)];
  });
  return changed ? out : secs;
}

/**
 * The chips to show while the timings are still on their way: each file's own name with no range ("Section 2"),
 * so a hand range that the timings will correct (WTLB Part Two) never shows first and then changes.
 * @param {ReadonlyArray<any[]>} secs
 * @returns {ReadonlyArray<any[]>}
 */
export function neutralSections(secs) {
  if (!Array.isArray(secs)) return secs;
  return secs.map((sec) => {
    const label = String((sec && sec[0]) || '');
    const at = label.indexOf(' · ');
    return at > 0 ? [label.slice(0, at), ...sec.slice(1)] : sec;
  });
}
