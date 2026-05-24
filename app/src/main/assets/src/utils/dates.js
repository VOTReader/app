/* ===================================================================
   Date formatters — relative-date and time-ago
   ===================================================================
   Global-scope module. Concatenates with index.html via <script src>.
   Bundled helpers (P5e):
   - relativeDate
   - timeAgo
   =================================================================== */


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
  if (min < 60) return min + 'm ago';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'h ago';
  const d = Math.floor(hr / 24);
  if (d < 7) return d + 'd ago';
  if (d < 30) return Math.floor(d / 7) + 'w ago';
  const date = new Date(ts);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

