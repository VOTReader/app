/* ===================================================================
   Date formatters — relative-date and time-ago
   ===================================================================
   Global-scope module. Concatenates with index.html via <script src>.
   Bundled helpers (P5e):
   - relativeDate
   - timeAgo
   =================================================================== */


/* One Month-Day formatter for every row: toLocaleDateString with options builds a fresh ICU
   formatter per call, and the Library lists format thousands of rows per search keystroke (sweep
   W69). Built on first use, so a page that never shows an old date never pays for it. */
/** @type {Intl.DateTimeFormat | null} */
let _monthDay = null;

/**
 * Format a past timestamp as a sentence-cased relative string ("Just now",
 * "5m ago", "3d ago", "Jan 14"). For ages older than ~a month, falls back
 * to a Month-Day locale date (year omitted by design).
 *
 * @param {number | null | undefined} ts  epoch ms; falsy → '' (no anchor)
 * @returns {string}
 */
export function relativeDate(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Just now';
  // Whole words (UX sweep U07.8): "1m ago" in a spaced-capital label read as "1 MONTH ago".
  if (min < 60) return min + ' min ago';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + ' hr ago';
  const d = Math.floor(hr / 24);
  if (d < 7) return d + (d === 1 ? ' day ago' : ' days ago');
  const w = Math.floor(d / 7);
  if (d < 30) return w + (w === 1 ? ' week ago' : ' weeks ago');
  if (!_monthDay) _monthDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  return _monthDay.format(ts);
}

/**
 * Format a past timestamp as a lowercase compact relative string ("just now",
 * "5m ago", "3w ago", "2mo ago"). Differs from relativeDate in casing and
 * its older-than-a-month behavior (compact months vs. locale date).
 *
 * @param {number} ts  epoch ms
 * @returns {string}
 */
export function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  // Whole words, as relativeDate (U07.8).
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return days === 1 ? '1 day ago' : `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}

