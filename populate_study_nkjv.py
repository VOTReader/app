"""
Populate missing nkjv verse texts in bible-studies.js.
Handles both:
  (a) chapters with existing nkjv dict that are missing some entries
  (b) chapters with refs but no nkjv key at all
"""
import re, json, sys
sys.stdout.reconfigure(encoding='utf-8')

DATA = r"D:\VOTReader-studio\app\src\main\assets\data"

BOOK_MAP = {
    "genesis":"genesis","exodus":"exodus","leviticus":"leviticus",
    "numbers":"numbers","deuteronomy":"deuteronomy","joshua":"joshua",
    "judges":"judges","ruth":"ruth","1 samuel":"1samuel","2 samuel":"2samuel",
    "1 kings":"1kings","2 kings":"2kings","1 chronicles":"1chronicles",
    "2 chronicles":"2chronicles","ezra":"ezra","nehemiah":"nehemiah",
    "esther":"esther","job":"job","psalm":"psalms","psalms":"psalms",
    "proverbs":"proverbs","ecclesiastes":"ecclesiastes",
    "song of solomon":"songofsolomon","isaiah":"isaiah","jeremiah":"jeremiah",
    "lamentations":"lamentations","ezekiel":"ezekiel","daniel":"daniel",
    "hosea":"hosea","joel":"joel","amos":"amos","obadiah":"obadiah",
    "jonah":"jonah","micah":"micah","nahum":"nahum","habakkuk":"habakkuk",
    "zephaniah":"zephaniah","haggai":"haggai","zechariah":"zechariah",
    "malachi":"malachi","matthew":"matthew","mark":"mark","luke":"luke",
    "john":"john","acts":"acts","romans":"romans",
    "1 corinthians":"1corinthians","2 corinthians":"2corinthians",
    "galatians":"galatians","ephesians":"ephesians",
    "philippians":"philippians","colossians":"colossians",
    "1 thessalonians":"1thessalonians","2 thessalonians":"2thessalonians",
    "1 timothy":"1timothy","2 timothy":"2timothy","titus":"titus",
    "philemon":"philemon","hebrews":"hebrews","james":"james",
    "1 peter":"1peter","2 peter":"2peter","1 john":"1john","2 john":"2john",
    "3 john":"3john","jude":"jude","revelation":"revelation",
}

def book_id(name):
    return BOOK_MAP.get(name.strip().lower())

# ── Load NKJV ────────────────────────────────────────────────────────────────
print("Loading books.js ...")
raw = open(f"{DATA}/books.js", encoding='utf-8').read()
raw = re.sub(r'^/\*.*?\*/\s*', '', raw, flags=re.DOTALL)
raw = re.sub(r'^var BOOKS\s*=\s*', '', raw).rstrip().rstrip(';')
BOOKS = json.loads(raw)
print(f"  {len(BOOKS)} books")

def get_verses_nkjv(bid, ch_num, v_start, v_end=None):
    bk = BOOKS.get(bid)
    if not bk: return None
    ch = next((c for c in bk.get("chapters",[]) if c["num"]==ch_num), None)
    if not ch: return None
    all_v = [v for sec in ch.get("sections",[]) for v in sec.get("verses",[])]
    if v_end is None: v_end = v_start
    hits = [v["text"] for v in all_v if v_start <= v["n"] <= v_end]
    return " ".join(hits) if hits else None

def get_chapter_nkjv(bid, ch_num):
    bk = BOOKS.get(bid)
    if not bk: return None
    ch = next((c for c in bk.get("chapters",[]) if c["num"]==ch_num), None)
    if not ch: return None
    return " ".join(v["text"] for sec in ch.get("sections",[]) for v in sec.get("verses",[]))

# ── Load KJV ─────────────────────────────────────────────────────────────────
print("Loading bible-kjv.js ...")
raw_kjv = open(f"{DATA}/bible-kjv.js", encoding='utf-8').read()
raw_kjv = re.sub(r'^var BIBLE_KJV\s*=\s*', '', raw_kjv).rstrip().rstrip(';')
KJV = json.loads(raw_kjv)
print(f"  {len(KJV)} books")

def get_verses_kjv(bid, ch_num, v_start, v_end=None):
    bk = KJV.get(bid)
    if not bk: return None
    ch = bk.get(str(ch_num))
    if not ch: return None
    if v_end is None: v_end = v_start
    hits = [v["text"] for v in ch if v_start <= v["n"] <= v_end]
    return " ".join(hits) if hits else None

CJB = {
    "2 Peter 1:20-21 (CJB)":
        "No prophecy of Scripture is a matter of one's own interpretation, "
        "because no prophecy ever came by human will; rather, people moved "
        "by the Ruach HaKodesh spoke from God.",
}

REF_RE = re.compile(
    r'^((?:\d\s+)?[A-Za-z ]+?)\s+(\d+)'
    r'(?::(\d+)(?:[–\-](\d+))?)?'
    r'(?:\s*,\s*\d+(?:[–\-]\d+)?)*'
    r'(?:\s*\(([A-Z]+)\))?$'
)

def lookup_ref(ref_str):
    ref_str = ref_str.strip()
    if ref_str in CJB: return CJB[ref_str]
    m = REF_RE.match(ref_str)
    if not m: return None
    book_name, ch_str, v_start_str, v_end_str, tag = m.groups()
    bid = book_id(book_name)
    if not bid: return None
    ch_num = int(ch_str)
    if v_start_str is None:
        if tag == 'KJV':
            bk = KJV.get(bid)
            if bk:
                ch = bk.get(str(ch_num), [])
                return " ".join(v["text"] for v in ch) or None
        return get_chapter_nkjv(bid, ch_num)
    v_start = int(v_start_str)
    v_end = int(v_end_str) if v_end_str else v_start
    if tag == 'KJV': return get_verses_kjv(bid, ch_num, v_start, v_end)
    return get_verses_nkjv(bid, ch_num, v_start, v_end)

# ── Parse chapter boundaries ──────────────────────────────────────────────────
print("Processing bible-studies.js ...")
bs_path = f"{DATA}/bible-studies.js"
content = open(bs_path, encoding='utf-8').read()

# Find all proper chapter objects: {"id":"...", "num":N, "title":...}
chapter_defs = list(re.finditer(
    r'\{\s*"id":\s*"([^"]+)"\s*,\s*"num":\s*(\d+)\s*,\s*"title"',
    content
))
print(f"  Found {len(chapter_defs)} chapter objects")

# Build list of (ch_id, ch_start, ch_end) using next-chapter as boundary
chapters = []
for i, m in enumerate(chapter_defs):
    ch_id = m.group(1)
    ch_start = m.start()
    ch_end = chapter_defs[i+1].start() if i+1 < len(chapter_defs) else len(content)
    ch_text = content[ch_start:ch_end]
    refs = set(re.findall(r'\{\{ref:([^}]+)\}\}', ch_text))
    if refs:
        chapters.append((ch_id, ch_start, ch_end, refs))

print(f"  Chapters with refs: {len(chapters)}")

# ── Build patches ─────────────────────────────────────────────────────────────
patches = []  # list of (start, end, replacement_text)
unresolved = []
total_added = 0

for ch_id, ch_start, ch_end, all_refs in chapters:
    ch_text = content[ch_start:ch_end]

    # Find existing nkjv dict in this chapter
    nkjv_m = re.search(r'"nkjv":\s*\{([^}]*)\}', ch_text, re.DOTALL)

    if nkjv_m:
        existing_keys = set(re.findall(r'"([^"]+)":', nkjv_m.group(1)))
        missing = [r for r in sorted(all_refs) if r not in existing_keys]
        if not missing:
            continue
        # Resolve verse texts
        new_entries = {}
        for ref in missing:
            text = lookup_ref(ref)
            if text:
                new_entries[ref] = text
            else:
                unresolved.append(f"{ch_id}: {ref}")
        if not new_entries:
            continue
        # Build new inner content
        existing_inner = nkjv_m.group(1).rstrip()
        new_parts = [f'"{r}": "{v.replace(chr(92), chr(92)*2).replace(chr(34), chr(92)+chr(34))}"'
                     for r, v in sorted(new_entries.items())]
        if existing_inner.strip():
            new_inner = existing_inner + ',\n          ' + ',\n          '.join(new_parts) + '\n        '
        else:
            new_inner = '\n          ' + ',\n          '.join(new_parts) + '\n        '
        # Record patch (absolute positions)
        inner_start = ch_start + nkjv_m.start(1)
        inner_end = ch_start + nkjv_m.end(1)
        patches.append((inner_start, inner_end, new_inner))
        total_added += len(new_entries)

    else:
        # No nkjv key — need to INSERT one before the chapter's closing }
        # Find the chapter's outermost closing brace
        # Walk from ch_start, count braces
        open_pos = content.find('{', ch_start)
        if open_pos == -1 or open_pos >= ch_end:
            unresolved.append(f"{ch_id}: (could not find opening brace)")
            continue
        depth = 0
        closing_pos = -1
        i = open_pos
        while i < ch_end:
            if content[i] == '{': depth += 1
            elif content[i] == '}':
                depth -= 1
                if depth == 0:
                    closing_pos = i
                    break
            i += 1
        if closing_pos == -1:
            unresolved.append(f"{ch_id}: (could not find closing brace)")
            continue
        # Resolve verse texts
        new_entries = {}
        for ref in sorted(all_refs):
            text = lookup_ref(ref)
            if text:
                new_entries[ref] = text
            else:
                unresolved.append(f"{ch_id}: {ref}")
        if not new_entries:
            continue
        # Build nkjv block
        new_parts = [f'"{r}": "{v.replace(chr(92), chr(92)*2).replace(chr(34), chr(92)+chr(34))}"'
                     for r, v in sorted(new_entries.items())]
        nkjv_block = (',\n        "nkjv": {\n          ' +
                      ',\n          '.join(new_parts) +
                      '\n        }')
        # Insert before the closing brace
        patches.append((closing_pos, closing_pos, nkjv_block))
        total_added += len(new_entries)

# ── Apply patches in reverse order ───────────────────────────────────────────
patches.sort(key=lambda p: p[0], reverse=True)
result = content
for start, end, replacement in patches:
    result = result[:start] + replacement + result[end:]

# ── Write ─────────────────────────────────────────────────────────────────────
open(bs_path, 'w', encoding='utf-8').write(result)

print(f"  Verse entries added: {total_added}")
if unresolved:
    print(f"  Could not resolve ({len(unresolved)}):")
    for r in sorted(set(unresolved))[:30]:
        print(f"    {r}")
print("Done.")
