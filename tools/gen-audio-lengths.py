"""gen-audio-lengths - bytes and seconds of every shipped recording, baked at build time.

Downloads brief 2026-10-23, 3d (and player brief U04.1, "lengths in the manifest"): the app looked sizes up one HEAD
at a time (929 for one Bible edition; the phone app through GitHub's API at 60 calls an hour), so whole-set totals
came back partial or hidden, and nothing knew how long a recording runs until it loaded. This writes them all once:

  python tools/gen-audio-lengths.py            -> app/src/main/assets/src/data/audio-lengths.js
  (then npm run build; the file is a lazy src/data file, fetched by utils/sync-loaders.js, never on the boot path)

AUDIO_LENGTHS: "<asset>" -> [bytes, seconds], for every .mp3 on the release tags utils/audio-track.js trusts
(RELEASE_PREFIXES). <asset> is the file name without .mp3, which is how every track URL ends and is unique across
the tags (Drive ids on audio-v1, stamped names like brm1_gen_001 on the per-chapter editions).

Bytes come from the release listing (gh api). Seconds come from the MP3 itself: one ranged read of its first 64 KB
(more only when an ID3 tag is bigger), then the Xing/Info or VBRI frame count, or for a constant bit rate file its
size over its bit rate. A rerun reads only assets that are new or whose size changed (the previous output is the
cache), so it takes seconds when nothing moved.
"""
import json, os, re, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor

import requests

REPO = "VOTReader/votreader-assets"
TAGS = ["audio-v1", "audio-bible-v1", "audio-wop-v1", "audio-wop-v2", "audio-brm-v1", "audio-brm-v2",
        "audio-web-v1", "audio-web-v2"]
GH = r"C:\Program Files\GitHub CLI\gh.exe"
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "app", "src", "main", "assets", "src", "data", "audio-lengths.js")
TRACK_JS = os.path.join(ROOT, "app", "src", "main", "assets", "src", "utils", "audio-track.js")
HEAD_BYTES = 65536

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BITRATES = {  # Layer III, kbit/s by index
    1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
}
RATES = {3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000]}


def _gh(*args):
    exe = GH if os.path.exists(GH) else "gh"
    return subprocess.run([exe, "api", *args], capture_output=True, text=True, check=True, encoding="utf-8").stdout


def release_assets():
    """{asset: {"size": n, "url": download url}} over every trusted tag."""
    out = {}
    for tag in TAGS:
        rid = _gh(f"repos/{REPO}/releases/tags/{tag}", "-q", ".id").strip()
        rows = _gh("--paginate", f"repos/{REPO}/releases/{rid}/assets?per_page=100",
                   "-q", ".[] | [.name, .size, .state, .browser_download_url] | @tsv")
        n = 0
        for line in rows.strip().splitlines():
            name, size, state, url = line.split("\t")
            if state != "uploaded" or not name.lower().endswith(".mp3"):
                continue
            out[name[:-4]] = {"size": int(size), "url": url}
            n += 1
        print(f"{tag}: {n} recordings")
    return out


def _frame(buf, i):
    """(version, layer, bitrate kbit/s, sample rate, channel mode) of a valid Layer III header at i, else None."""
    if i + 4 > len(buf) or buf[i] != 0xFF or (buf[i + 1] & 0xE0) != 0xE0:
        return None
    ver = (buf[i + 1] >> 3) & 3
    layer = (buf[i + 1] >> 1) & 3
    bri = buf[i + 2] >> 4
    sri = (buf[i + 2] >> 2) & 3
    if ver == 1 or layer != 1 or bri in (0, 15) or sri == 3:
        return None
    kbps = BITRATES[1 if ver == 3 else 2][bri]
    return ver, layer, kbps, RATES[ver][sri], buf[i + 3] >> 6


def _frame_len(ver, kbps, rate, pad):
    return (144 if ver == 3 else 72) * kbps * 1000 // rate + pad


def seconds_of(head, size, audio_start=0):
    """Seconds of an MP3 from its first bytes (`head` begins at the file offset `audio_start`) and its total size."""
    i = 0
    while i + 4 <= len(head):
        f = _frame(head, i)
        if f:
            ver, _layer, kbps, rate, mode = f
            nxt = i + _frame_len(ver, kbps, rate, (head[i + 2] >> 1) & 1)
            # A real frame is followed by another (a stray 0xFFE in tag padding is not).
            if nxt + 4 > len(head) or _frame(head, nxt):
                break
        i += 1
    else:
        return None
    spf = 1152 if ver == 3 else 576
    side = (17 if mode == 3 else 32) if ver == 3 else (9 if mode == 3 else 17)
    x = i + 4 + side
    if head[x:x + 4] in (b"Xing", b"Info") and len(head) >= x + 12:
        flags = int.from_bytes(head[x + 4:x + 8], "big")
        if flags & 1:
            return int.from_bytes(head[x + 8:x + 12], "big") * spf / rate
    v = i + 4 + 32
    if head[v:v + 4] == b"VBRI" and len(head) >= v + 18:
        return int.from_bytes(head[v + 14:v + 18], "big") * spf / rate
    return (size - audio_start - i) * 8 / (kbps * 1000)


def probe(session, asset, info):
    """[bytes, seconds] of one recording (seconds None when it cannot be read)."""
    size, url = info["size"], info["url"]
    for attempt in range(3):
        try:
            r = session.get(url, headers={"Range": f"bytes=0-{HEAD_BYTES - 1}"}, timeout=60)
            r.raise_for_status()
            head = r.content
            start = 0
            if head[:3] == b"ID3":
                tag = ((head[6] & 0x7F) << 21) | ((head[7] & 0x7F) << 14) | ((head[8] & 0x7F) << 7) | (head[9] & 0x7F)
                start = 10 + tag + (10 if head[5] & 0x10 else 0)
                if start + 8192 > len(head):
                    r = session.get(url, headers={"Range": f"bytes={start}-{start + HEAD_BYTES - 1}"}, timeout=60)
                    r.raise_for_status()
                    head = r.content
                else:
                    head = head[start:]
            sec = seconds_of(head, size, start)
            return asset, [size, round(sec) if sec else None]
        except Exception as e:  # noqa: BLE001 - a network blip is retried, then reported
            err = e
            time.sleep(2 * (attempt + 1))
    print(f"  ! {asset}: {err}")
    return asset, [size, None]


def previous():
    if not os.path.exists(OUT):
        return {}
    text = open(OUT, encoding="utf-8").read()
    return {m.group(1): [int(m.group(2)), int(m.group(3))] for m in re.finditer(r'"([A-Za-z0-9_-]+)":\[(\d+),(\d+)\]', text)}


def check_tags():
    """The tags here are the app's trusted release tags, no more and no fewer."""
    text = open(TRACK_JS, encoding="utf-8").read()
    used = set(re.findall(r"releases/download/(audio-[a-z0-9-]+)/'", text))
    if used != set(TAGS):
        sys.exit(f"gen-audio-lengths: TAGS {sorted(TAGS)} != audio-track.js release tags {sorted(used)}")


def main():
    check_tags()
    assets = release_assets()
    old = previous()
    todo = {a: i for a, i in assets.items() if not (a in old and old[a][0] == i["size"])}
    print(f"{len(assets)} recordings; {len(assets) - len(todo)} unchanged, {len(todo)} to read")
    out = {a: old[a] for a in assets if a not in todo}
    with requests.Session() as s, ThreadPoolExecutor(16) as pool:
        for n, (asset, row) in enumerate(pool.map(lambda kv: probe(s, *kv), todo.items()), 1):
            out[asset] = row
            if n % 250 == 0:
                print(f"  {n}/{len(todo)}")
    missing = sorted(a for a, r in out.items() if r[1] is None)
    if missing:
        sys.exit(f"gen-audio-lengths: {len(missing)} recordings unreadable, nothing written: {missing[:10]}")
    rows = ",\n".join(f'"{a}":[{r[0]},{r[1]}]' for a, r in sorted(out.items()))
    total_b = sum(r[0] for r in out.values())
    total_s = sum(r[1] for r in out.values())
    body = (
        "/* AUDIO LENGTHS - auto-generated by tools/gen-audio-lengths.py. DO NOT EDIT.\n"
        '   AUDIO_LENGTHS: "<asset>" -> [bytes, seconds] for every recording on the trusted release tags\n'
        "   (<asset> = the track URL's file name without .mp3). A lazy src/data file: utils/sync-loaders.js\n"
        "   fetches it on demand (utils/audio-lengths.js). Regenerate: python tools/gen-audio-lengths.py */\n"
        f"var AUDIO_LENGTHS = {{\n{rows}\n}};\n"
    )
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(body)
    print(f"wrote {OUT}: {len(out)} recordings, {total_b / 1e9:.2f} GB, {total_s / 3600:.1f} h")


if __name__ == "__main__":
    main()
