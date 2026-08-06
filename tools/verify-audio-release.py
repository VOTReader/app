"""Verify every audio-v1 release asset actually STREAMS: 206 + mp3 magic.

A GitHub release upload can 201 yet leave an asset that lists but 404s on
download (broken/incomplete server-side state) — count checks lie. This
sweeps all assets with ranged GETs (16 bytes each), flags anything that
isn't a healthy mp3 (ID3 tag or MPEG frame sync), and with --repair deletes
the broken assets so mirror-audio-release.py's next pass re-uploads them.

  python tools/verify-audio-release.py [--repair]
"""
import json, os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

import requests

REPO = "VOTReader/votreader-assets"
TAG = "audio-v1"
GH = r"C:\Program Files\GitHub CLI\gh.exe"
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MANIFEST = os.path.join(ROOT, "app", "src", "main", "assets", "src", "data", "audio-manifest.js")

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def manifest_ids():
    text = open(MANIFEST, encoding="utf-8").read()
    return sorted(set(re.findall(r'"([A-Za-z0-9_-]{25,})"', text)))


def release_assets():
    rid = subprocess.run([GH, "api", f"repos/{REPO}/releases/tags/{TAG}", "-q", ".id"],
                         capture_output=True, text=True, check=True).stdout.strip()
    out = subprocess.run([GH, "api", "--paginate", f"repos/{REPO}/releases/{rid}/assets?per_page=100",
                          "-q", ".[] | [.id, .name, .size, .state] | @tsv"],
                         capture_output=True, text=True, check=True).stdout
    assets = {}
    for line in out.strip().splitlines():
        aid, name, size, state = line.split("\t")
        assets[name] = {"id": aid, "size": int(size), "state": state}
    return assets


def check(name):
    url = f"https://github.com/{REPO}/releases/download/{TAG}/{name}"
    try:
        r = requests.get(url, headers={"Range": "bytes=0-15"}, timeout=45, allow_redirects=True)
        body = r.content[:16]
        okmagic = body.startswith(b"ID3") or (len(body) >= 2 and body[0] == 0xFF and (body[1] & 0xE0) == 0xE0)
        return name, r.status_code, okmagic
    except Exception as e:
        return name, 0, False


def main():
    repair = "--repair" in sys.argv
    ids = manifest_ids()
    assets = release_assets()
    missing = [i for i in ids if (i + ".mp3") not in assets]
    print(f"manifest ids: {len(ids)} | release assets: {len(assets)} | not on release: {len(missing)}")

    names = [i + ".mp3" for i in ids if (i + ".mp3") in assets]
    bad = []
    with ThreadPoolExecutor(max_workers=16) as ex:
        for n, (name, status, okmagic) in enumerate(ex.map(check, names), 1):
            if status not in (200, 206) or not okmagic:
                bad.append((name, status, okmagic))
            if n % 100 == 0:
                print(f"  checked {n}/{len(names)} — bad so far: {len(bad)}")
    print(f"CHECKED {len(names)}: broken {len(bad)}, missing {len(missing)}")
    for name, status, okmagic in bad:
        print(f"  BROKEN {name} status={status} mp3magic={okmagic} state={assets[name]['state']} size={assets[name]['size']}")

    if repair and bad:
        print("deleting broken assets so the mirror re-uploads them…")
        for name, _s, _m in bad:
            subprocess.run([GH, "api", "--method", "DELETE",
                            f"repos/{REPO}/releases/assets/{assets[name]['id']}"],
                           capture_output=True, text=True)
        print(f"deleted {len(bad)} — run: python tools/mirror-audio-release.py --until-done")
    return 1 if (bad or missing) else 0


if __name__ == "__main__":
    sys.exit(main())
