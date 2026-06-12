#!/usr/bin/env python3
# Audit helper: diff the HTML-extracted records against the app-data records.
# One-shot tool. Reads _audit-html.json + _audit-app.json.
import json, re, sys

html = json.load(open(r"D:\VOTReader-studio\tools\_audit-html.json", encoding="utf-8"))
app = json.load(open(r"D:\VOTReader-studio\tools\_audit-app.json", encoding="utf-8"))

def key(t):
    return re.sub(r"[^a-z0-9]", "", (t or "").lower())

def find(arr, t):
    k = key(t)
    for r in arr:
        if key(r["title"]) == k:
            return r
    # loose: containment either way (handles trailing "… Says The Lord" drift)
    for r in arr:
        rk = key(r["title"])
        if rk and (rk in k or k in rk) and abs(len(rk) - len(k)) < 12:
            return r
    return None

mode = sys.argv[1] if len(sys.argv) > 1 else "titles"
collections = list(html.keys())

if mode == "titles":
    for col in collections:
        hh, aa = html[col], app.get(col, [])
        h_keys = {key(r["title"]) for r in hh}
        a_keys = {key(r["title"]) for r in aa}
        only_html = [r["title"] for r in hh if key(r["title"]) not in a_keys and not find(aa, r["title"])]
        only_app = [r["title"] for r in aa if key(r["title"]) not in h_keys and not find(hh, r["title"])]
        print(f"\n=== {col}  (HTML {len(hh)} / app {len(aa)}) ===")
        if only_html:
            print("  IN HTML, NOT APP:")
            for t in only_html: print(f"    - {t[:80]}")
        if only_app:
            print("  IN APP, NOT HTML:")
            for t in only_app: print(f"    - {t[:80]}")
        if not only_html and not only_app:
            print("  all titles matched.")

elif mode == "headers":
    print("HEADER discrepancies (occasion / blank-header / date / from):\n")
    for col in collections:
        aa = app.get(col, [])
        issues = []
        for hr in html[col]:
            ar = find(aa, hr["title"])
            if not ar:
                continue
            hl = hr["headerLines"]
            occ = next((l for l in hl if re.match(r"^\(.*\)$", l)), None)
            # blank header: app has no date/from/forLine but HTML has >=2 header lines
            if not ar["date"] and not ar["from"] and not ar["forLine"] and len(hl) >= 2:
                issues.append((hr["title"], f"BLANK app header; HTML has: {hl}"))
                continue
            if occ and re.sub(r"\s+","",occ) != re.sub(r"\s+","",ar["noteLine"]):
                issues.append((hr["title"], f"occasion: HTML {occ!r} vs app {ar['noteLine']!r}"))
            # date present in HTML line0 but app.date empty
            if hl:
                dm = re.match(r"^(\d{1,2}/\d{1,2}/\d{2,4}|\d{4})\b", hl[0])
                if dm and not ar["date"]:
                    issues.append((hr["title"], f"date missing in app (HTML {dm.group(1)})"))
        if issues:
            print(f"--- {col} ({len(issues)}) ---")
            for t, m in issues: print(f"    {t[:55]:55} | {m}")

elif mode == "body":
    print("BODY word-count discrepancies (app < 80% or > 130% of HTML):\n")
    for col in collections:
        aa = app.get(col, [])
        for hr in html[col]:
            ar = find(aa, hr["title"])
            if not ar: continue
            hw, aw = hr["bodyWords"], ar["bodyWords"]
            if hw < 20: continue
            ratio = aw / hw if hw else 0
            if ratio < 0.8 or ratio > 1.3:
                print(f"  {col[:18]:18} {hr['title'][:42]:42} HTML={hw:4} app={aw:4} ({ratio:.0%})")

elif mode == "fn":
    print("FOOTNOTE count discrepancies:\n")
    for col in collections:
        aa = app.get(col, [])
        for hr in html[col]:
            ar = find(aa, hr["title"])
            if not ar: continue
            if hr["fnCount"] != ar["fnCount"]:
                print(f"  {col[:18]:18} {hr['title'][:40]:40} HTML={hr['fnCount']} app={ar['fnCount']}")

elif mode == "related":
    print("RELATED-TOPICS count discrepancies:\n")
    for col in collections:
        aa = app.get(col, [])
        for hr in html[col]:
            ar = find(aa, hr["title"])
            if not ar: continue
            hc, ac = len(hr["relatedTopics"]), len(ar["relatedTopics"])
            if hc != ac:
                print(f"  {col[:18]:18} {hr['title'][:38]:38} HTML={hc} app={ac}")
