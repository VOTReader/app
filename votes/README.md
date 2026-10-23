# Song votes (sync sy4)

Live at `https://votes.votreader.workers.dev` (Corbin's Cloudflare account, `workers_dev`, D1 database `votes`).
Corbin 2026-10-22 23:0x (DECISIONS): 👍/👎 per song, one vote, changeable; 👎 is private; a Popular tab from 👍 that
needs real agreement, plus All-time loved and New; no play counts; votes send when online, even with the app closed.

    POST /v1/vote     {install, song, v: 1|0, at, traits?: {w, h, dpr, tz}}  -> 204
    GET  /v1/tallies  -> {generated, songs: {<id>: [liked, liked in the last 30 days]}}

- Only 👍 is ever sent. 👎 lowers a song in that device's own shuffle and stays on the device; turning a 👍 into a 👎
  or clearing it sends `v: 0`.
- A vote is an upsert keyed by (install, song) and carries the device's own time: a retry or a late older vote never
  changes a count, so the app's outbox resends freely.
- The same salted IP hash + trait hash (screen size, pixel ratio, timezone) liking a song from another install within
  30 days counts once, the latest wins. The hashes are nulled after 30 days (daily cron), rate rows after 2.
  The raw address is never stored. 120 votes an hour per address.
- CORS: `https://votreader.github.io` and the APK's `https://appassets.androidplatform.net` only.
- No logs or analytics of its own (`[observability] enabled = false`).

The tallies reach the app through `D:\FlockSync\songs_publish.py`, which reads `/v1/tallies` on each run and writes
`votes.json` beside `catalog.json` on votreader.github.io/songs.

Operate (from this folder; wrangler is logged in on Corbin's PC):

```
npx wrangler@4 d1 execute votes --remote --file schema.sql   # once, and after a schema change
npx wrangler@4 secret put SALT                               # once: a long random string; changing it resets the soft dedupe
npx wrangler@4 deploy                                        # after editing src/
npx vitest run votes/                                        # from the repo root: the Worker's tests
curl -s https://votes.votreader.workers.dev/v1/tallies
```
