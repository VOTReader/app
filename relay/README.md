# Offline-audio relay (cf1)

Live at `https://audio.votreader.workers.dev` (Corbin's Cloudflare account, `workers_dev`, no routes).

GitHub's release downloads answer without CORS, so a web page cannot keep their bytes. The phone app downloads
recordings natively; the PWA (and an iPhone that added VOTReader to its Home Screen) saves them through this Worker
into Cache Storage (`src/utils/offline-audio-web.js`), and the service worker plays them back with no signal.
Streaming never comes here: it stays direct from GitHub.

What it relays, and nothing else:

    GET|HEAD /<tag>/<file>.mp3  ->  github.com/VOTReader/votreader-assets/releases/download/<tag>/<file>.mp3

- `<tag>` must be an `audio-*` release, `<file>` a plain `.mp3` name; any other path, a query string or another
  method is refused. `OPTIONS` answers the CORS preflight.
- `Access-Control-Allow-Origin: https://votreader.github.io` only. Range is passed through, the body is streamed.
- No logs, traces or analytics of its own (`[observability] enabled = false`; DECISIONS 09-25 23:3x).

Operate (from this folder; wrangler is logged in on Corbin's PC):

```
npx wrangler@4 deploy        # after editing src/
npx vitest run relay/        # from the repo root: the relay's tests
curl -sI https://audio.votreader.workers.dev/audio-v1/<id>.mp3   # 200, Content-Length, the CORS header
```

A new audio release (`audio-<x>-v<n>`) needs nothing here: the tag pattern already covers it.
