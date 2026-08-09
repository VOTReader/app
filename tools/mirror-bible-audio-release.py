"""Mirror the whole-book Bible audiobooks to the audio-bible-v1 GitHub release.

Sibling of mirror-audio-release.py (same explicit audio/mpeg upload — the
release CDN is nosniff, so octet-stream assets won't play in <audio>). The
Bible books live on their OWN tag: GitHub caps a release at 1,000 assets and
audio-v1 already carries the ~729 letter tracks.

Source corpus: D:/BibleAudio/brministries-kjv/<slug>.mp3 (fetch-brm-kjv.py).
Asset names: brm-kjv_<appBookId>.mp3 (appBookId = slug minus hyphens, with
song-of-songs -> songofsolomon) — matching src/data/bible-audio-manifest.js.

Idempotent + additive: assets already on the release are skipped.

Usage: python tools/mirror-bible-audio-release.py [--dry]
Needs: gh CLI authed as VOTReader.
"""
import json
import os
import subprocess
import sys

REPO = "VOTReader/votreader-assets"
TAG = "audio-bible-v1"
GH = r"C:\Program Files\GitHub CLI\gh.exe"
CORPUS = r"D:\BibleAudio\brministries-kjv"


def slug_to_app_id(slug):
    if slug == "song-of-songs":
        return "songofsolomon"
    return slug.replace("-", "")


def gh_json(args):
    r = subprocess.run([GH] + args, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip() or r.stdout.strip())
    return json.loads(r.stdout) if r.stdout.strip() else None


def ensure_release():
    r = subprocess.run([GH, "release", "view", TAG, "--repo", REPO, "--json", "id"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        c = subprocess.run([GH, "release", "create", TAG, "--repo", REPO,
                            "--title", "Bible audiobooks v1",
                            "--notes", "Whole-book Bible audio editions streamed by VOTReader. "
                                       "brm-kjv_*: KJV, Biblical Restoration Ministries."],
                           capture_output=True, text=True)
        if c.returncode != 0:
            raise RuntimeError(c.stderr.strip())
    rel = gh_json(["api", f"repos/{REPO}/releases/tags/{TAG}"])
    return rel["id"], {a["name"] for a in rel.get("assets", [])}


def upload_asset(rid, path, name):
    return subprocess.run(
        [GH, "api", "--method", "POST",
         "-H", "Content-Type: audio/mpeg",
         f"https://uploads.github.com/repos/{REPO}/releases/{rid}/assets?name={name}",
         "--input", path],
        capture_output=True, text=True)


def main():
    dry = "--dry" in sys.argv
    inv = json.load(open(os.path.join(CORPUS, "inventory.json")))
    rid, existing = ensure_release()
    done = failed = skipped = 0
    for slug in sorted(inv):
        name = f"brm-kjv_{slug_to_app_id(slug)}.mp3"
        path = os.path.join(CORPUS, f"{slug}.mp3")
        if name in existing:
            skipped += 1
            continue
        if not os.path.exists(path):
            print(f"MISSING local file: {path}", flush=True)
            failed += 1
            continue
        if dry:
            print(f"would upload {name} ({os.path.getsize(path)/1e6:.0f} MB)", flush=True)
            continue
        r = upload_asset(rid, path, name)
        if r.returncode == 0:
            done += 1
            print(f"uploaded {name} ({os.path.getsize(path)/1e6:.0f} MB) [{done+skipped}/66]", flush=True)
        else:
            # A 422 already_exists from a crossed re-run is success-shaped.
            if "already_exists" in (r.stdout + r.stderr):
                skipped += 1
            else:
                failed += 1
                print(f"FAILED {name}: {(r.stderr or r.stdout)[:300]}", flush=True)
    print(f"DONE uploaded={done} skipped={skipped} failed={failed}", flush=True)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
