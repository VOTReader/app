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
import json, os, re, shutil, subprocess, sys, time

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
def find_rclone():
    """rclone on PATH, else the winget install this pipeline was first set up with.
    The versioned folder alone meant an rclone upgrade silently fell back to the
    cookie path (sweep 2026-10-13, W18)."""
    return shutil.which("rclone") or os.path.join(
        os.environ.get("LOCALAPPDATA", ""), "Microsoft", "WinGet", "Packages",
        "Rclone.Rclone_Microsoft.Winget.Source_8wekyb3d8bbwe", "rclone-v1.75.0-windows-amd64", "rclone.exe")


RCLONE = find_rclone()

# The daily Drive sweep (D:/FlockSync/audio_watch.py: rclone lsjson --hash, 05:30): size and md5 of every
# file, the same record the live intake and the align lane's re-upload chain verify against.
DRIVE_LISTING = os.environ.get("VOT_DRIVE_LISTING", r"D:\FlockSync\audio-watch\listing.json")


def drive_files():
    """{fid: {"size", "md5", ...}} from the sweep listing, or {} when it is missing or unreadable."""
    try:
        files = json.load(open(DRIVE_LISTING, encoding="utf-8")).get("files") or {}
    except (OSError, ValueError, AttributeError):
        return {}
    return {fid: f for fid, f in files.items() if isinstance(f, dict) and f.get("size")}


def _md5(path):
    import hashlib
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def not_drives_file(path, want):
    """None when `path` is byte for byte the Drive file `want` describes, else why not. This, not a
    decode, is what stops a cut-off file: ffmpeg decodes an mp3 cut at 5,000,000 of its 11,914,052
    bytes without one error and reports a plausible duration (refuter r1, 2026-10-14)."""
    got = os.path.getsize(path)
    if got != want["size"]:
        return f"{got} B staged vs {want['size']} B on Drive"
    if want.get("md5") and _md5(path) != want["md5"]:
        return "same size, but not Drive's md5"
    return None

# EVERY downloader below writes <fid>.mp3.part and renames it to <fid>.mp3 only
# when the transfer finished whole, and main() uploads a staged file only once it is
# Drive's file byte for byte (size and md5 from the sweep listing: not_drives_file)
# and decodes end to end (_playable). They used to write <fid>.mp3 directly and count
# any size > 0 as done, so a transfer cut off part-way -- or a third failed retry
# that left half a file -- could go up to audio-v1, which is append-only: readers
# would hear that letter stop early, and the next run would skip it as mirrored
# (W18, sweep 2026-10-13).


def _drop(path):
    if os.path.exists(path):
        os.remove(path)


def _rclone_batch(fids):
    """Download a batch of file ids into STAGING via one rclone invocation.
    Returns the subset that landed whole. A batch rclone reports as failed
    promotes nothing: which of its transfers finished is not knowable from
    here, and the per-file fallback in main() fetches each one again."""
    args = [RCLONE, "backend", "copyid", "gdrive:"]
    for fid in fids:
        args += [fid, os.path.join(STAGING, fid + ".mp3.part")]
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        tail = (r.stderr or "").strip().splitlines()
        print("  rclone batch failed: " + (tail[-1][:160] if tail else f"rc {r.returncode}"))
    got = []
    for fid in fids:
        part, dst = (os.path.join(STAGING, fid + ext) for ext in (".mp3.part", ".mp3"))
        if r.returncode == 0 and os.path.exists(part) and os.path.getsize(part) > 0:
            os.replace(part, dst)
            got.append(fid)
        _drop(part)
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
    part = dst + ".part"
    try:
        with open(part, "wb") as f:
            for chunk in r.iter_content(1 << 18):
                f.write(chunk)
        got, want = os.path.getsize(part), r.headers.get("Content-Length")
        if got == 0 or (want and not r.headers.get("Content-Encoding") and got != int(want)):
            print(f"  short transfer {fid}: {got} of {want or '?'} B")
            return False
        os.replace(part, dst)
        return True
    finally:
        _drop(part)


def _download_gdown(fid, dst):
    """Anonymous gdown into a .part, renamed only when gdown returns cleanly."""
    part = dst + ".part"
    try:
        got = gdown.download(id=fid, output=part, quiet=True)
        if got and os.path.exists(part) and os.path.getsize(part) > 0:
            os.replace(part, dst)
            return True
        return False
    finally:
        _drop(part)


def _playable(path):
    """True when ffmpeg decodes the whole file without an error and it lasts at
    least a second: the last check before an upload that can never be taken back.
    No ffmpeg on PATH is a refusal, not a pass."""
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        print("  REFUSING to upload: ffmpeg/ffprobe not on PATH, so the file cannot be checked")
        return False
    dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         capture_output=True, text=True, encoding="utf-8", errors="replace")
    dec = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "null", "-"],
                         capture_output=True, text=True, encoding="utf-8", errors="replace")
    try:
        d = float((dur.stdout or "").strip() or 0)
    except ValueError:
        d = 0.0
    return dec.returncode == 0 and not (dec.stderr or "").strip() and d >= 1

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
    sends application/octet-stream; the uploads API takes the asset's stored
    type from this request's Content-Type header instead.

    KEEP THIS, but the original premise is no longer true on the wire and a
    reader should not inherit it. It said the CDN echoes octet-stream AND
    serves X-Content-Type-Options: nosniff, a combination Chromium's media
    elements refuse. Measured 2026-09-05 (Machine Ops): nosniff appears ONLY
    on the github.com 302, never on the 206 asset response, which comes from
    Azure via Fastly with no nosniff at all — so Chromium content-sniffs the
    ID3 header and plays it. The app assigns el.src straight to the release
    URL (audio-player.js), nothing wraps it in a blob, and all 807 previously
    mirrored assets behave identically. This is a header read, not an
    end-to-end playback proof; what it settles is that the specific mechanism
    named above is measurably absent.

    So the header is belt-and-braces today rather than load-bearing. It stays
    because the day GitHub adds nosniff to the blob response it becomes
    load-bearing again and nobody will be watching."""
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
    # The TREE, not just the count. This reads the manifest in the checkout it
    # runs in, which is correct — but run from the wrong worktree it finds a
    # manifest without the new ids, uploads nothing, and prints DONE ok=0 fail=0.
    # A silent no-op with a success line is the failure mode worth naming
    # (2026-09-05: run from main for six ids that only existed on a branch).
    print(f"manifest ids: {len(ids)}  from {MANIFEST}")

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
    # Nothing goes up that the Drive sweep cannot vouch for byte for byte.
    drive = drive_files()
    unknown = [f for f in todo if f not in drive]
    for f in unknown:
        print(f"  REFUSING {f}: the Drive sweep listing ({DRIVE_LISTING}) has no size for it, so a whole "
              "copy cannot be told from a cut-off one -- wait for the next sweep")
    todo = [f for f in todo if f in drive]
    print(f"to mirror: {len(todo)}{' (dry run)' if dry else ''}"
          + (f"; {len(unknown)} refused (not in the Drive sweep)" if unknown else ""))
    if not todo and not unknown:
        print("NOTHING TO MIRROR — every id in this tree's manifest is already on the release.")
        print("  If you expected uploads, check you are in the worktree whose manifest")
        print("  carries the new ids; this tool reads the tree it runs in.")
    if dry:
        for i in todo[:10]:
            print("  would mirror", i)
        return 2 if unknown else 0

    os.makedirs(STAGING, exist_ok=True)
    rid = release_id()
    use_rclone = os.path.exists(RCLONE)
    session = None if use_rclone else _cookie_session()
    print("downloader: " + ("rclone (owner OAuth)" if use_rclone else "authed cookies" if session else "anonymous gdown"))
    ok, fail = 0, len(unknown)
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

            def why_not(path):
                return not_drives_file(path, drive[fid]) or (None if _playable(path) else "does not decode whole")
            why = os.path.exists(dst) and why_not(dst)
            if why:
                print(f"  [{n}/{len(todo)}] staged {fid}: {why} -- fetching it again")
                os.remove(dst)
            if not os.path.exists(dst):
                # rclone missed it (or non-rclone path) — per-file fallback.
                for attempt in (1, 2, 3):
                    try:
                        if use_rclone:
                            _rclone_batch([fid])
                        elif session:
                            _download_authed(session, fid, dst)
                        else:
                            _download_gdown(fid, dst)
                    except Exception as e:
                        print(f"  [{n}/{len(todo)}] download error {fid} (attempt {attempt}): {(str(e).strip().splitlines() or [type(e).__name__])[0][:120]}")
                    if os.path.exists(dst):
                        why = why_not(dst)
                        if not why:
                            break
                        print(f"  [{n}/{len(todo)}] {fid} (attempt {attempt}): {why}")
                        os.remove(dst)
                    time.sleep(5 * attempt)
                if not os.path.exists(dst):
                    print(f"  [{n}/{len(todo)}] DOWNLOAD FAILED {fid}")
                    fail += 1
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
