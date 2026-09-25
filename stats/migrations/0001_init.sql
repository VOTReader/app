-- VOTReader usage statistics (us1). One row per device-day batch; no device id, no IP.
CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,          -- the client's random batch id: a resend is ignored
  day TEXT NOT NULL,            -- the device's local day, YYYY-MM-DD
  plat TEXT NOT NULL,           -- apk | pwa | web
  ver TEXT NOT NULL DEFAULT '',
  cv TEXT NOT NULL DEFAULT '',
  rate REAL NOT NULL DEFAULT 1,
  d INTEGER, w INTEGER, m INTEGER, first INTEGER, iw TEXT,
  country TEXT NOT NULL DEFAULT '',
  dev INTEGER NOT NULL DEFAULT 0,   -- test traffic (X-Stats-Dev), never rolled up
  recv_at INTEGER NOT NULL,
  body TEXT NOT NULL            -- the validated counters, JSON
);
CREATE INDEX IF NOT EXISTS batches_day ON batches(day);

-- Nightly rollups (kept 25 months; raw batches 90 days).
CREATE TABLE IF NOT EXISTS metrics (
  day TEXT NOT NULL, name TEXT NOT NULL, key TEXT NOT NULL, plat TEXT NOT NULL, value REAL NOT NULL,
  PRIMARY KEY (day, name, key, plat)
);
CREATE TABLE IF NOT EXISTS actives (
  day TEXT NOT NULL, plat TEXT NOT NULL, ver TEXT NOT NULL,
  d INTEGER NOT NULL, w INTEGER NOT NULL, m INTEGER NOT NULL, first INTEGER NOT NULL,
  PRIMARY KEY (day, plat, ver)
);
-- Retention: devices active for the first time in a week (w = 1), by install week.
CREATE TABLE IF NOT EXISTS cohorts (
  day TEXT NOT NULL, iw TEXT NOT NULL, plat TEXT NOT NULL, w INTEGER NOT NULL,
  PRIMARY KEY (day, iw, plat)
);
-- The data-honesty box: refused batches and resends, by reason.
CREATE TABLE IF NOT EXISTS rejects (
  day TEXT NOT NULL, reason TEXT NOT NULL, n INTEGER NOT NULL,
  PRIMARY KEY (day, reason)
);
