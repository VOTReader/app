import os
import re
import sys
import subprocess

# Config
DATA_ROOT = "app/src/main/assets/data"
SRC_ROOT = "app/src/main/assets/src"
INDEX_HTML = "app/src/main/assets/index.html"
OUT_HTML = "app/src/main/assets/index.html"

# 9-layer dependency order (bottom-up)
LAYERS = [
    "lib",
    "stores",
    "data",
    "hooks",
    "ui/helpers",
    "ui/atoms",
    "ui/sheets",
    "ui/screens",
    "renderer"
]

def collect_data_files():
    if not os.path.exists(DATA_ROOT):
        return []

    # Priority data files that must load first for structural dependencies
    priority = [
        "books.js",
        "books-restored.js",
        "matthew.js",
        "collections.js",
        "registry.js",
        "registry-helpers.js",
        "scripture-refs.js"
    ]

    files = []
    # Add priority files if they exist
    for p in priority:
        if os.path.exists(os.path.join(DATA_ROOT, p)):
            files.append(p)

    # Add the rest alphabetically
    for f in sorted(os.listdir(DATA_ROOT)):
        if f.endswith(".js") and not f.startswith("bible-") and f not in priority:
            files.append(f)

    return files

def collect_js_files():
    files = []
    for layer in LAYERS:
        layer_path = os.path.join(SRC_ROOT, layer)
        if not os.path.exists(layer_path):
            continue
        # Sort files alphabetically within each layer
        for f in sorted(os.listdir(layer_path)):
            if f.endswith(".js"):
                files.append(os.path.join(layer, f))

    # Finally add App.js and boot.js if they exist
    if os.path.exists(os.path.join(SRC_ROOT, "App.js")):
        files.append("App.js")
    if os.path.exists(os.path.join(SRC_ROOT, "boot.js")):
        files.append("boot.js")

    return files

def run_pycheckers():
    print("Running check_balance.py...")
    try:
        result = subprocess.run([sys.executable, "check_balance.py"], capture_output=True, text=True)
        print(result.stdout)
        if result.returncode != 0:
            print("ERROR: check_balance.py failed!")
            return False
        return True
    except Exception as e:
        print(f"ERROR running check_balance.py: {e}")
        return False

def main():
    print("--- VOTReader Module Concatenator ---")

    data_files = collect_data_files()
    print(f"Found {len(data_files)} data files to concatenate.")

    js_files = collect_js_files()
    print(f"Found {len(js_files)} app modules to concatenate.")

    bundle_js = []

    for f in data_files:
        path = os.path.join(DATA_ROOT, f)
        bundle_js.append(f"// --- data/{f} ---\n" + open(path, 'r', encoding='utf-8').read())

    for f in js_files:
        path = os.path.join(SRC_ROOT, f)
        bundle_js.append(f"// --- {f} ---\n" + open(path, 'r', encoding='utf-8').read())

    final_js = "\n\n".join(bundle_js)

    with open(INDEX_HTML, 'r', encoding='utf-8') as f:
        html = f.read()

    # Define the replacement marker.
    start_marker = "<!-- APP_JS_START -->"
    end_marker = "<!-- APP_JS_END -->"

    start_idx = html.find(start_marker)
    if start_idx == -1:
        print("ERROR: Could not find start marker in index.html")
        return

    end_idx = html.find(end_marker)
    if end_idx == -1:
        print("ERROR: Could not find end marker in index.html")
        return

    # We want to keep the markers and wrap in a single script tag
    new_html = html[:start_idx + len(start_marker)] + "\n<script>\n" + final_js + "\n</script>\n" + html[end_idx:]

    with open(OUT_HTML, 'w', encoding='utf-8') as f:
        f.write(new_html)

    print(f"Concatenation complete. Written to {OUT_HTML}")

    if run_pycheckers():
        print("Build verified. OK.")
    else:
        print("Build verification FAILED. Please check the output.")

if __name__ == "__main__":
    main()
