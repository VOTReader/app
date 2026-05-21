#!/usr/bin/env python3
"""Static file server for the preview tool — with caching disabled.

The plain `python -m http.server` sends only `Last-Modified` (no
`Cache-Control`), so browsers apply heuristic freshness and serve a STALE
`dist/bundle-*.js` from cache after a rebuild — `location.reload()` does not
pick the rebuild up. That cost real verification time more than once.

This server sends `Cache-Control: no-store` on every response, so every
reload fetches fresh bytes. Dev-only; never shipped to the Android APK.

Usage (see .claude/launch.json):
    python tools/preview-server.py <port> <directory>
"""

import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
DIRECTORY = sys.argv[2] if len(sys.argv) > 2 else "."


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Force a full fetch on every request — no heuristic caching, no
        # conditional 304s. This is what makes a rebuilt bundle show up on
        # a plain reload.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


# THREADED — must mirror `python -m http.server`, which uses ThreadingHTTPServer.
# A single-threaded TCPServer stalls under the smoke harness's rapid concurrent
# request bursts (a held-open connection blocks the whole server), the preview
# tool then sees the port as dead and the browser falls back to chrome-error.
class Server(http.server.ThreadingHTTPServer):
    allow_reuse_address = True  # avoid "address already in use" on quick restarts
    daemon_threads = True       # don't let lingering request threads block exit


if __name__ == "__main__":
    with Server(("", PORT), NoCacheHandler) as httpd:
        print(f"preview-server: no-store cache headers, :{PORT} serving {DIRECTORY}")
        httpd.serve_forever()
