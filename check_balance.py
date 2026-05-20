"""Comprehensive validity check for all data files.

Catches:
1. Brace/bracket/paren imbalance
2. Non-ASCII dashes (en/em) in verse ranges (digit-dash-digit)
3. Smart quotes (" " ' ') used as JSON delimiters
4. esprima JS parse errors (real syntax check)

Run after batch edits — these issues cause black-screen app failures
that brace-balance alone can't detect.

Usage:
    python check_balance.py [file ...]      # specific files (no .js suffix)
    python check_balance.py                  # all standard files
"""
import sys, re, os

# Path is computed relative to this script so the check survives any
# checkout location (the absolute path used here previously broke after
# the working copy moved D: → src/data/ in P3.5b).
_HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(_HERE, "app", "src", "main", "assets", "src", "data") + os.sep
DEFAULT_FILES = [
    'volume-one','volume-two','volume-three','volume-four','volume-five',
    'volume-six','volume-seven','lords-rebuke','letters-flock','letters-timothy',
    'wtlb-one','wtlb-two','the-blessed','holy-days','hidden-manna',
    'matthew','matthew-nkjv','matthew-plain','bible-studies',
    'wtlb-scriptures','books','books-restored',
]

EN_DASH = chr(0x2013)   # –
EM_DASH = chr(0x2014)   # —
LEFT_DQ = chr(0x201c)   # "
RIGHT_DQ = chr(0x201d)  # "
LEFT_SQ = chr(0x2018)   # '
RIGHT_SQ = chr(0x2019)  # '

def check_balance(text):
    in_str=False; escape=False; quote=None; b=0; br=0; p=0
    for c in text:
        if escape: escape=False; continue
        if in_str:
            if c == '\\': escape=True; continue
            if c == quote: in_str=False
            continue
        if c == '"' or c == "'":
            in_str=True; quote=c; continue
        if c == '{': b += 1
        elif c == '}': b -= 1
        elif c == '[': br += 1
        elif c == ']': br -= 1
        elif c == '(': p += 1
        elif c == ')': p -= 1
    return b, br, p

def check_dashes_in_ranges(text):
    """Find non-ASCII dashes between digits — these break verse-range parser."""
    en = re.findall(r'\d' + EN_DASH + r'\d', text)
    em = re.findall(r'\d' + EM_DASH + r'\d', text)
    return len(en) + len(em)

def check_smart_quote_json(text):
    """Detect smart quotes used as JSON delimiters (heuristic).
    Pattern: line where smart quote sits at the START of a key or value position.
    Example bad line: '            "t": "text",' but with smart quotes.
    """
    bad = 0
    for line in text.split('\n'):
        # Strip leading whitespace
        stripped = line.lstrip()
        if not stripped: continue
        # If line starts with a smart double-quote AND has a colon, it's likely a JSON line with smart quotes
        if stripped.startswith(LEFT_DQ) and ':' in stripped:
            bad += 1
    return bad

def esprima_check(text):
    try:
        import esprima
        esprima.parseScript(text)
        return None
    except ImportError:
        return "(esprima not installed; pip install esprima)"
    except Exception as e:
        return str(e)[:120]

def main():
    files = sys.argv[1:] if len(sys.argv) > 1 else DEFAULT_FILES
    all_ok = True
    for f in files:
        path = DATA_DIR + f + '.js'
        if not os.path.exists(path):
            print(f'{f}: SKIP (not found)')
            continue
        text = open(path, encoding='utf-8').read()
        problems = []
        # esprima is authoritative for JS validity; brace check is fallback
        esp = esprima_check(text)
        if esp and "esprima not installed" not in esp:
            problems.append(f'esprima parse: {esp}')
            # Also report brace counts for diagnosis
            b, br, p = check_balance(text)
            if b or br or p:
                problems.append(f'  diagnostic: braces={b} brackets={br} parens={p}')
        elif esp and "esprima not installed" in esp:
            # esprima not available — fall back to brace check only
            b, br, p = check_balance(text)
            if b or br or p:
                problems.append(f'IMBALANCED braces={b} brackets={br} parens={p} (esprima unavailable)')
        n_dashes = check_dashes_in_ranges(text)
        if n_dashes:
            problems.append(f'{n_dashes} non-ASCII dashes in verse ranges (digit{EN_DASH}digit) — will break parser')
        n_sq = check_smart_quote_json(text)
        if n_sq:
            problems.append(f'{n_sq} lines start with smart double-quote — likely JSON-delimiter contamination')
        if problems:
            all_ok = False
            print(f'{f}: FAIL')
            for p_ in problems:
                print(f'  - {p_}')
        else:
            print(f'{f}: OK')
    print()
    print('ALL OK' if all_ok else 'PROBLEMS DETECTED — see above')
    sys.exit(0 if all_ok else 1)

if __name__ == '__main__':
    main()
