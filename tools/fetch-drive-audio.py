"""Enumerate the VOT audio-letters Google Drive tree (public, link-shared).

Step 1 of the audio-manifest pipeline:
  python tools/fetch-drive-audio.py        -> tools/_audio-drive-listing.json
  node tools/gen-audio-manifest.mjs        -> src/data/audio-manifest.js

Needs: pip install gdown  (same dep the FlockSync pipeline uses).
The listing file is a regenerable artifact — NOT committed (gitignored).
Re-run both steps whenever the flock adds/replaces tracks, then bump
CORPUS_VERSION (audio-manifest.js rides bundle-a-vot).
"""
import json, os, sys

import gdown

PARENT = "1i2dyV9IgTQuv4jm726O_n479Jq0Pap4v"  # "TVOT" audio root (thevolumesoftruth@gmail.com)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_audio-drive-listing.json")

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def main():
    files = gdown.download_folder(id=PARENT, skip_download=True, quiet=True)
    if not files:
        print("FATAL: Drive listing returned nothing (layout/scrape change?)")
        return 1
    out = [{"path": f.path.replace("\\", "/"), "id": f.id} for f in files]
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=0)
    print(f"OK: {len(out)} files -> {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
