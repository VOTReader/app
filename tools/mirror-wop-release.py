"""Mirror the Word of Promise per-chapter tracks to the audio-wop releases.

1,189 chapter MP3s exceed GitHub's 1,000-asset/release cap, so the edition
spans two tags: audio-wop-v1 (OT, 929 assets) + audio-wop-v2 (NT, 260).
Asset names wop<testament>_<appBookId>_<NNN>.mp3 match the manifest expansion
in src/data/bible-audio-manifest.js. Explicit audio/mpeg upload; idempotent.

Source tree: D:/BibleAudio/wop-nkjv/Word_of_Promise_Audio_Bible_Dramatized_NKJV/
  The Old Testament/24 - Jeremiah/24 Jeremiah 13.mp3  ->  wop1_jeremiah_013.mp3

Usage: python tools/mirror-wop-release.py [--dry]
Needs: gh CLI authed as VOTReader.
"""
import json
import os
import re
import subprocess
import sys

REPO = "VOTReader/votreader-assets"
GH = r"C:\Program Files\GitHub CLI\gh.exe"
ROOT = r"D:\BibleAudio\wop-nkjv\Word_of_Promise_Audio_Bible_Dramatized_NKJV"

# Folder book-name -> app book id (lowercase, no spaces/hyphens; canonical).
def app_id(folder_book):
    s = folder_book.strip().lower()
    s = re.sub(r"^(the )", "", s)
    s = s.replace("song of songs", "songofsolomon").replace("song of solomon", "songofsolomon")
    s = re.sub(r"[^a-z0-9]", "", s)
    return s


def collect():
    files = []
    for testament, tdir, tag in [(1, "The Old Testament", "audio-wop-v1"),
                                 (2, "The New Testament", "audio-wop-v2")]:
        base = os.path.join(ROOT, tdir)
        for bookdir in sorted(os.listdir(base)):
            m = re.match(r"(\d+) - (.+)$", bookdir)
            if not m:
                continue
            bid = app_id(m.group(2))
            bpath = os.path.join(base, bookdir)
            for f in sorted(os.listdir(bpath)):
                cm = re.match(r"\d+ .+ (\d+)\.mp3$", f)
                if not cm:
                    continue
                ch = int(cm.group(1))
                name = f"wop{testament}_{bid}_{ch:03d}.mp3"
                files.append((tag, os.path.join(bpath, f), name))
    return files


def ensure_release(tag, title):
    r = subprocess.run([GH, "release", "view", tag, "--repo", REPO, "--json", "id"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        c = subprocess.run([GH, "release", "create", tag, "--repo", REPO,
                            "--title", title,
                            "--notes", "The Word of Promise (dramatized NKJV) per-chapter tracks streamed by VOTReader."],
                           capture_output=True, text=True)
        if c.returncode != 0:
            raise RuntimeError(c.stderr.strip())
    rel = json.loads(subprocess.run([GH, "api", f"repos/{REPO}/releases/tags/{tag}"],
                                    capture_output=True, text=True).stdout)
    return rel["id"], {a["name"] for a in rel.get("assets", [])}


def upload(rid, path, name):
    return subprocess.run(
        [GH, "api", "--method", "POST", "-H", "Content-Type: audio/mpeg",
         f"https://uploads.github.com/repos/{REPO}/releases/{rid}/assets?name={name}",
         "--input", path],
        capture_output=True, text=True)


def main():
    dry = "--dry" in sys.argv
    files = collect()
    ot = [f for f in files if f[0] == "audio-wop-v1"]
    nt = [f for f in files if f[0] == "audio-wop-v2"]
    print(f"collected OT={len(ot)} NT={len(nt)} total={len(files)}", flush=True)
    assert len(files) == 1189, f"expected 1189, got {len(files)}"
    done = failed = skipped = 0
    for tag, title in [("audio-wop-v1", "Word of Promise OT (per-chapter)"),
                       ("audio-wop-v2", "Word of Promise NT (per-chapter)")]:
        rid, existing = ensure_release(tag, title)
        batch = [f for f in files if f[0] == tag]
        for _tag, path, name in batch:
            if name in existing:
                skipped += 1
                continue
            if dry:
                continue
            r = upload(rid, path, name)
            if r.returncode == 0:
                done += 1
                if done % 25 == 0:
                    print(f"uploaded {done} (+{skipped} skipped) latest {name}", flush=True)
            elif "already_exists" in (r.stdout + r.stderr):
                skipped += 1
            else:
                failed += 1
                print(f"FAILED {name}: {(r.stderr or r.stdout)[:200]}", flush=True)
    print(f"DONE uploaded={done} skipped={skipped} failed={failed}", flush=True)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
