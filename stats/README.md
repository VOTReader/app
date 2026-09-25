# stats/ - VOTReader usage statistics (us1)

A Cloudflare Worker with a D1 database, on Corbin's Cloudflare account (`wrangler` is logged in on the laptop).
Live at `https://stats.votreader.workers.dev`. Design: `D:\AgentBackbone\reports\phone-audio-and-growth-2026-09-24\04-usage-statistics-design.md`;
Corbin said yes on 2026-09-24 (anonymous counts, a first-run notice, the "no telemetry" line dropped).

- `POST /v1/b` takes one device-day batch as `text/plain` JSON (no CORS preflight; `sendBeacon` works). The format and its
  validator live in `app/src/main/assets/src/utils/usage-schema.js`, shared with the app. Only the two app origins are
  accepted. A batch is stored once per id (a resend is ignored). Cloudflare's country is kept; the IP never is.
- `GET /dash?k=<DASH_KEY>` is the phone dashboard. The key is a Worker secret; the full link is in
  `D:\Swarm\lanes\docs\out\stats-dashboard-link.txt`, never in the repo. Without the key it is a 404.
- A nightly cron (03:17 UTC) recomputes the last 36 days of rollups; raw batches go after 90 days, rollups after 25 months.
- A request with `X-Stats-Dev: 1` is stored but never counted (smoke tests).

## Operate

```sh
cd stats
npx wrangler@4 deploy                                           # after editing src/
npx wrangler@4 d1 migrations apply votreader-stats --remote     # after adding migrations/
printf '%s' "<new key>" | npx wrangler@4 secret put DASH_KEY    # rotate the dashboard link
npx wrangler@4 d1 execute votreader-stats --remote --command "SELECT day, SUM(d) FROM actives GROUP BY day"
```

Tests run in the repo's own vitest on Node's built-in SQLite (`stats/test/d1-sqlite.js`): `npx vitest run stats/`.
Free-tier ceilings (100k requests and 100k D1 row writes a day) fail closed; the app keeps its queue and resends.
