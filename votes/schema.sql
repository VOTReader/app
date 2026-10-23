-- VOTReader song votes (votes/README.md). Apply: npx wrangler@4 d1 execute votes --remote --file votes/schema.sql
CREATE TABLE IF NOT EXISTS votes (
  install TEXT NOT NULL,          -- the app's random per-install id
  song    TEXT NOT NULL,          -- catalog id, 12 hex
  v       INTEGER NOT NULL,       -- 1 liked, 0 cleared (a thumbs-down is never sent)
  at      INTEGER NOT NULL,       -- the device's own time of the vote, ms
  iph     TEXT,                   -- salted IP hash, nulled after 30 days
  trh     TEXT,                   -- salted hash of screen size, pixel ratio, timezone; nulled after 30 days
  counted INTEGER NOT NULL DEFAULT 1,   -- 0 = the same device liked it again under another install (latest wins)
  PRIMARY KEY (install, song)
);
CREATE INDEX IF NOT EXISTS votes_song ON votes (song, iph, trh);
CREATE TABLE IF NOT EXISTS rate (
  iph  TEXT NOT NULL,
  hour INTEGER NOT NULL,
  n    INTEGER NOT NULL,
  PRIMARY KEY (iph, hour)
);
