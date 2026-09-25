/* The usage-statistics wire format (us1), shared by the app and the stats Worker.
   ───────────────────────────────────────────────────────────────────────────────
   The client (utils/usage-stats.js) builds batches against this file and the
   Worker (stats/src/index.js) validates them against it, so the two cannot drift.
   Design: D:\AgentBackbone\reports\phone-audio-and-growth-2026-09-24\04-usage-statistics-design.md
   (Corbin 2026-09-24 22:4x: anonymous usage stats on Cloudflare, first-run notice).

   One batch = one device-day:
     { v: 1, id: '<uuid>', day: 'YYYY-MM-DD', plat: 'apk'|'pwa'|'web',
       ver: '<CACHE_VERSION>', cv: '<CORPUS_VERSION>', rate: 1,
       act: { d, w, m, first, iw } | null,     // Brave-style active flags, no device id
       c: { '<name>|<key>': <number>, ... } }  // counters and summed seconds

   What is NOT here, by design: any device id, the IP, search text, crash text,
   anything the reader wrote. */

export const USAGE_VERSION = 1;

/** Every counter name the Worker accepts, with the ceiling one batch may carry. */
export const USAGE_EVENTS = {
  open: 5000,          // key: letter:<vol>:<id> | bible:<edition>:<book> | study:<id> | answers:<topic> | song:<id>
  read_done: 5000,     // same keys, from the read tracker's credit
  listen_s: 86400,     // key: <kind>:<edition or vol>; media seconds
  listen_start: 5000,  // key: kind
  listen_end: 5000,    // key: kind
  audio_err: 5000,     // key: <kind>:<class> (404 | network | decode | other)
  audio_hidden: 5000,  // key: kind; screen off / app hidden while playing without the media service
  audio_hidden_s: 86400,
  offline_dl: 5000,    // key: kind
  search: 5000,        // no key; never the query text
  search_zero: 5000,
  feat: 5000,          // key: highlight | bookmark | note | journal_new | share | autoscroll | readalong | ...
  install: 5000,       // key: prompt_shown | prompt_accept | prompt_dismiss | appinstalled
  err: 5000,           // key: DiagnosticLog tag; never the message
  boot: 5000,          // key: lt1s | 1to2s | 2to4s | gt4s
};

export const USAGE_PLATS = ['apk', 'pwa', 'web'];

/** Keys: lower-case, short, no spaces - ids and kinds, never free text. */
export const USAGE_KEY_RE = /^[a-z0-9:_.-]{0,80}$/;

export const USAGE_LIMITS = {
  maxBodyBytes: 32 * 1024,
  maxKeys: 300,        // per batch; the client folds the rest into <name>|other
  pastDays: 35,        // a batch for a day older than this is refused
  futureDays: 1,
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_WEEK_RE = /^\d{4}-W\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VER_RE = /^[A-Za-z0-9._-]{0,40}$/;

/** Days between two YYYY-MM-DD strings (b - a), in whole UTC days. */
function dayDiff(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

/**
 * Validate and normalize one batch. Returns { ok: true, batch } with numbers
 * clamped to their ceilings, or { ok: false, error }. `today` is the server's
 * UTC day (YYYY-MM-DD); a device's local day may be one either side of it.
 */
export function validateBatch(raw, today) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'not an object' };
  if (raw.v !== USAGE_VERSION) return { ok: false, error: 'version' };
  if (typeof raw.id !== 'string' || !UUID_RE.test(raw.id)) return { ok: false, error: 'id' };
  if (typeof raw.day !== 'string' || !DAY_RE.test(raw.day) || Number.isNaN(Date.parse(raw.day))) return { ok: false, error: 'day' };
  const age = dayDiff(raw.day, today);
  if (age > USAGE_LIMITS.pastDays || age < -USAGE_LIMITS.futureDays - 1) return { ok: false, error: 'day out of range' };
  if (!USAGE_PLATS.includes(raw.plat)) return { ok: false, error: 'plat' };
  for (const f of ['ver', 'cv']) {
    if (raw[f] != null && (typeof raw[f] !== 'string' || !VER_RE.test(raw[f]))) return { ok: false, error: f };
  }
  const rate = raw.rate == null ? 1 : raw.rate;
  if (typeof rate !== 'number' || !(rate > 0 && rate <= 1)) return { ok: false, error: 'rate' };

  let act = null;
  if (raw.act != null) {
    const a = raw.act;
    if (typeof a !== 'object') return { ok: false, error: 'act' };
    act = {};
    for (const f of ['d', 'w', 'm', 'first']) {
      if (a[f] !== 0 && a[f] !== 1) return { ok: false, error: `act.${f}` };
      act[f] = a[f];
    }
    if (typeof a.iw !== 'string' || !ISO_WEEK_RE.test(a.iw)) return { ok: false, error: 'act.iw' };
    act.iw = a.iw;
  }

  if (!raw.c || typeof raw.c !== 'object' || Array.isArray(raw.c)) return { ok: false, error: 'c' };
  const entries = Object.entries(raw.c);
  if (entries.length > USAGE_LIMITS.maxKeys) return { ok: false, error: 'too many keys' };
  const c = {};
  for (const [k, n] of entries) {
    const bar = k.indexOf('|');
    const name = bar < 0 ? k : k.slice(0, bar);
    const key = bar < 0 ? '' : k.slice(bar + 1);
    if (!Object.prototype.hasOwnProperty.call(USAGE_EVENTS, name)) return { ok: false, error: `event ${name.slice(0, 20)}` };
    if (!USAGE_KEY_RE.test(key)) return { ok: false, error: 'key' };
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return { ok: false, error: 'value' };
    c[`${name}|${key}`] = Math.min(Math.round(n), USAGE_EVENTS[name]);
  }

  return {
    ok: true,
    batch: { v: USAGE_VERSION, id: raw.id, day: raw.day, plat: raw.plat, ver: raw.ver || '', cv: raw.cv || '', rate, act, c },
  };
}

/** The ISO-8601 week of a local calendar date, e.g. '2026-W39' (weeks start Monday). */
export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
