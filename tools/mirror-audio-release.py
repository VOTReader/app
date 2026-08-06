"""Mirror the audio-letter tracks to GitHub Releases (the app's stream host).

WHY THIS EXISTS (2026-08-06): Google Drive 403s every request whose
Sec-Fetch-Site is `cross-site` — hard anti-hotlinking on
drive.usercontent.google.com, so a web/WebView <audio> can NEVER stream
Drive directly (verified: same 403 from headless Chrome, real Chrome, and
the on-device WebView; a curl WITHOUT sec-fetch headers sails through,
which is what made the endpoint look viable). GitHub release assets have
no such gate, support Range, and already host the Garden images
(votreader-assets) — so the tracks mirror there and audio-player.js's
trackUrl() points at the release.

Usage:
  python tools/fetch-drive-audio.py               # refresh Drive listing
  node tools/gen-audio-manifest.mjs               # refresh manifest
  python tools/mirror-audio-release.py [--limit N] [--dry] [--reverse] [--until-done]

--until-done: loop passes (20 min apart) until every manifest id is on the
release. Drive rate-limits anonymous bulk downloads after a few dozen files
(per-IP cooldown, "Failed to retrieve file url"); each pass grinds through
whatever the current quota window allows and the loop outlasts the wall.

Idempotent + additive: skips assets already on the release, so a re-run
after the flock uploads new tracks only transfers the new files. Assets
are named <driveFileId>.mp3 — the manifest's ids double as asset names,
so a manifest regen needs NO url rewrites here.

Needs: gdown (pip) + gh CLI authed as VOTReader.
"""
import json, os, re, subprocess, sys, time

import gdown
import requests

REPO = "VOTReader/votreader-assets"
TAG = "audio-v1"
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MANIFEST = os.path.join(ROOT, "app", "src", "main", "assets", "src", "data", "audio-manifest.js")
STAGING = os.path.join(HERE, "_audio-mirror-staging")
GH = r"C:\Program Files\GitHub CLI\gh.exe"
COOKIES = os.path.join(HERE, "_drive-cookies.json")  # from tools/drive-login.mjs
# rclone with the owner's OAuth grant (2026-08-06, drive.readonly scope, remote
# "gdrive") — `backend copyid` fetches by file id on the ACCOUNT's quota, which
# is what finally beat Drive's anonymous per-IP download wall. NOTE: uses
# rclone's shared client_id (retires during 2026) — fine for this mirror; make
# a personal client_id if this pipeline is still pulling from Drive by then.
RCLONE = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "WinGet", "Packages",
                      "Rclone.Rclone_Microsoft.Winget.Source_8wekyb3d8bbwe",
                      "rclone-v1.75.0-windows-amd64", "rclone.exe")


def _rclone_batch(fids):
    """Download a batch of file ids into STAGING via one rclone invocation.
    Returns the subset that landed with bytes."""
    args = [RCLONE, "backend", "copyid", "gdrive:"]
    for fid in fids:
        args += [fid, os.path.join(STAGING, fid + ".mp3")]
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        print("  rclone batch stderr: " + (r.stderr or "").strip().splitlines()[-1][:160] if r.stderr else "  rclone batch failed")
    got = []
    for fid in fids:
        dst = os.path.join(STAGING, fid + ".mp3")
        if os.path.exists(dst) and os.path.getsize(dst) > 0:
            got.append(fid)
    return got


def _cookie_session():
    """Authenticated requests session when drive-login.mjs has run (uses the
    owner's own download quota — the anonymous per-IP wall doesn't apply).
    Returns None when no cookie file exists (anonymous gdown path)."""
    if not os.path.exists(COOKIES):
        return None
    s = requests.Session()
    for c in json.load(open(COOKIES, encoding="utf-8")):
        s.cookies.set(c["name"], c["value"], domain=c.get("domain", ".google.com"), path=c.get("path", "/"))
    s.headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36"
    return s


def _download_authed(session, fid, dst):
    """Server-side download (no sec-fetch headers, so no hotlink gate) with
    the signed-in cookies. Handles the interstitial confirm page for large
    files by re-posting the form params."""
    url = "https://drive.usercontent.google.com/download"
    r = session.get(url, params={"id": fid, "export": "download"}, stream=True, timeout=120)
    ct = r.headers.get("Content-Type", "")
    if ct.startswith("text/html"):
        # Virus-scan/quota interstitial — harvest the confirm form fields.
        html = r.text
        params = dict(re.findall(r'name="([^"]+)"\s+value="([^"]*)"', html))
        if not params.get("id"):
            return False
        r = session.get(url, params=params, stream=True, timeout=120)
        if r.headers.get("Content-Type", "").startswith("text/html"):
            return False
    with open(dst, "wb") as f:
        for chunk in r.iter_content(1 << 18):
            f.write(chunk)
    return os.path.getsize(dst) > 0

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def manifest_ids():
    """Every drive file id the app can play: letter parts + section comps."""
    text = open(MANIFEST, encoding="utf-8").read()
    # Tuples look like ["<id>","B"] / ["<id>","V","Part 2"] and section rows
    # ["Part 1 · Intro–19","<id>","V"] — harvest every plausible Drive id.
    ids = set(re.findall(r'"([A-Za-z0-9_-]{25,})"', text))
    return sorted(ids)


def existing_assets():
    r = subprocess.run([GH, "release", "view", TAG, "--repo", REPO, "--json", "assets"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        return None  # release absent
    return {a["name"] for a in json.loads(r.stdout)["assets"]}


def release_id():
    r = subprocess.run([GH, "api", f"repos/{REPO}/releases/tags/{TAG}", "-q", ".id"],
                       capture_output=True, text=True, check=True)
    return r.stdout.strip()


def upload_asset(rid, path, name):
    """Upload with an EXPLICIT audio/mpeg content type. `gh release upload`
    sends application/octet-stream, and the release CDN both echoes that type
    AND serves X-Content-Type-Options: nosniff — a combination Chromium's
    media elements refuse. The uploads API takes the asset's stored type from
    this request's Content-Type header; the signed download URL then carries
    rsct=audio/mpeg and <audio> plays it."""
    return subprocess.run(
        [GH, "api", "--method", "POST",
         "-H", "Content-Type: audio/mpeg",
         f"https://uploads.github.com/repos/{REPO}/releases/{rid}/assets?name={name}",
         "--input", path],
        capture_output=True, text=True)


def main():
    limit = 0
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])
    dry = "--dry" in sys.argv
    reverse = "--reverse" in sys.argv  # second worker walks from the far end;
    # the two meet in the middle with only crossover-window duplicate attempts
    # (a duplicate upload 422s and is counted, not fatal).
    shard = None  # "--shard i/n": disjoint hash partition — N workers, zero overlap
    if "--shard" in sys.argv:
        i, n_ = sys.argv[sys.argv.index("--shard") + 1].split("/")
        shard = (int(i), int(n_))

    ids = manifest_ids()
    print(f"manifest ids: {len(ids)}")

    have = existing_assets()
    if have is None:
        if dry:
            print(f"would create release {TAG}")
            have = set()
        else:
            subprocess.run([GH, "release", "create", TAG, "--repo", REPO,
                            "--title", "Audio Letters (streaming mirror)",
                            "--notes", "Streaming mirror of the flock's audio-letter tracks. "
                                       "Assets are named <driveFileId>.mp3; regenerated by "
                                       "tools/mirror-audio-release.py. Drive blocks cross-site "
                                       "streaming (sec-fetch 403), so the app streams from here."],
                           check=True)
            have = set()
    print(f"release has: {len(have)} assets")

    todo = [i for i in ids if (i + ".mp3") not in have]
    if shard:
        si, sn = shard
        todo = [f for f in todo if (sum(f.encode()) % sn) == si]
        print(f"shard {si}/{sn}: {len(todo)} ids")
    if reverse:
        todo.reverse()
    if limit:
        todo = todo[:limit]
    print(f"to mirror: {len(todo)}{' (dry run)' if dry else ''}")
    if dry:
        for i in todo[:10]:
            print("  would mirror", i)
        return 0

    os.makedirs(STAGING, exist_ok=True)
    rid = release_id()
    use_rclone = os.path.exists(RCLONE)
    session = None if use_rclone else _cookie_session()
    print("downloader: " + ("rclone (owner OAuth)" if use_rclone else "authed cookies" if session else "anonymous gdown"))
    ok = fail = 0
    n = 0
    BATCH = 10
    for b in range(0, len(todo), BATCH):
        batch = todo[b:b + BATCH]
        if use_rclone:
            _rclone_batch([f for f in batch
                           if not os.path.exists(os.path.join(STAGING, f + ".mp3"))])
        for fid in batch:
            n += 1
            dst = os.path.join(STAGING, fid + ".mp3")
            if not (os.path.exists(dst) and os.path.getsize(dst) > 0):
                # rclone missed it (or non-rclone path) — per-file fallback.
                got = None
                for attempt in (1, 2, 3):
                    try:
                        if use_rclone:
                            got = _rclone_batch([fid]) and dst
                        elif session:
                            got = _download_authed(session, fid, dst) and dst
                        else:
                            got = gdown.download(id=fid, output=dst, quiet=True)
                    except Exception as e:
                        print(f"  [{n}/{len(todo)}] download error {fid} (attempt {attempt}): {str(e).splitlines()[0][:120]}")
                        got = None
                    if got and os.path.exists(dst) and os.path.getsize(dst) > 0:
                        break
                    time.sleep(5 * attempt)
                if not os.path.exists(dst) or os.path.getsize(dst) == 0:
                    print(f"  [{n}/{len(todo)}] DOWNLOAD FAILED {fid}")
                    fail += 1
                    if os.path.exists(dst):
                        os.remove(dst)
                    continue
            r = upload_asset(rid, dst, fid + ".mp3")
            if r.returncode != 0:
                print(f"  [{n}/{len(todo)}] UPLOAD FAILED {fid}: {r.stderr.strip()[:160]}")
                fail += 1
                continue
            os.remove(dst)  # keep staging lean; the release is the mirror
            ok += 1
            if n % 10 == 0 or n == len(todo):
                print(f"  [{n}/{len(todo)}] ok={ok} fail={fail}")
        if not use_rclone:
            time.sleep(2.5)  # anonymous pacing only; the OAuth path uses the account quota
    print(f"DONE ok={ok} fail={fail}")
    return 2 if fail else 0


def until_done():
    passes = 0
    while True:
        passes += 1
        print(f"===== pass {passes} =====")
        rc = main()
        if rc == 0:
            print("ALL MIRRORED.")
            # The sign-in cookie file has served its purpose — remove it.
            try:
                if os.path.exists(COOKIES):
                    os.remove(COOKIES)
                    print("(auth cookies deleted)")
            except OSError:
                print("WARNING: could not delete tools/_drive-cookies.json — remove it manually.")
            return 0
        print("pass incomplete (quota wall or transient failures) — next pass in 20 min")
        time.sleep(1200)


if __name__ == "__main__":
    sys.exit(until_done() if "--until-done" in sys.argv else main())
