"""Build script — concatenate Cluster A into a single classic-script bundle.

After G.2.1/G.2.2/G.2.3, Clusters B, C, and D are bundled by esbuild as
ES-module → IIFE bundles. This script emits the classic-script bundle-a.js
(vendor + small data + search engine) plus the three lazy corpus bundles.
bundle-a stays UNMINIFIED — its vendored UMD libs (react/react-dom/flexsearch)
read top-level `this`, which esbuild's minify would break (PF2). The corpus
bundles are pure `var X = {...}` data with no top-level `this`, so they ARE
minified here (PF1 — esbuild --minify --target=chrome69 after the concat,
~3.3 MB saved; globals-preserving + chrome69-safe + data-identical, verified).

CLUSTER OWNERSHIP:
  A — vendor + small data + search engine (raw)            (Python concat — this script)
  A-bible/matthew/vot — lazy corpus, MINIFIED (PF1)        (Python concat + esbuild --minify)
  B — stores + components + hooks + journal + scripture    (esbuild → bundle-b.js)
  C — renderer (annotation engine + DOM bridges)           (esbuild → bundle-c.js)
  D — screens + sheets + components + utils + late stores  (esbuild → bundle-d.js)

The clusters are determined by the position of inline `<script>` blocks
in index.html. Inline blocks separate clusters because they declare
symbols used by following clusters AND reference symbols from prior
clusters; the load order between inlines and externals can't be
shuffled.

Run:
  python tools/build.py            # emits bundle-a.js only
  npm run build                    # full chain: this script + esbuild B/C/D

Output:
  app/src/main/assets/dist/bundle-a.js          (raw — UMD `this` trap, PF2)
  app/src/main/assets/dist/bundle-a-bible.js    (minified — PF1)
  app/src/main/assets/dist/bundle-a-matthew.js  (minified — PF1)
  app/src/main/assets/dist/bundle-a-vot.js      (minified — PF1)
"""
import os, sys, subprocess, tempfile

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# Repo paths resolved relative to THIS script (tools/build.py) so the
# build runs identically on any machine and on CI — no hardcoded path.
_HERE = os.path.dirname(os.path.abspath(__file__))
REPO  = os.path.dirname(_HERE)
ROOT  = os.path.join(REPO, 'app', 'src', 'main', 'assets')
DIST  = os.path.join(ROOT, 'dist')

# PF1 corpus minify runs through this JS-API helper (NOT node_modules/esbuild/
# bin/esbuild — on Unix the installer makes that path the native binary, so
# `node bin/esbuild` fails parsing ELF as JS). minify-bundle.mjs imports the
# esbuild JS API, which resolves the platform binary internally → cross-platform.
MINIFY_JS = os.path.join(_HERE, 'minify-bundle.mjs')

# Cluster A — vendor + small data + search engine (CRITICAL PATH).
# All corpus content is lazy-loaded:
#   - books.js (6.9 MB NKJV) → bundle-a-bible.js (Q8.1)
#   - matthew.js (618 KB Study Bible) → bundle-a-matthew.js (Q8.2)
#   - all VOT collections (7 volumes + letters families + WTLB + holy
#     days + hidden manna + blessed, ~3.0 MB) → bundle-a-vot.js (Q8.3)
# books-restored.js + matthew-plain.js + matthew-nkjv.js stay critical
# because they're cross-referenced by other paths (restored chrome
# overrides, BOOKS["matthew-plain"] for inline scripture refs).
# See BUNDLE-LAZY-LOAD-PLAN.md for the design rationale.
A = [
    # html2canvas.min.js is NO LONGER concatenated here (U13) — it was ~198 KB
    # parsed at EVERY boot but is only used by web tab-thumbnails (Android uses
    # native PixelCopy). platform-bridge._ensureHtml2canvas() lazy-loads it via
    # <script src="html2canvas.min.js"> on the first web screenshot; the file
    # stays SW-precached (service-worker.js CORE_ASSETS) so it's instant/offline.
    'react.min.js', 'react-dom.min.js',
    'src/data/books-restored.js',
    'src/data/matthew-plain.js', 'src/data/matthew-nkjv.js',
    'flexsearch.min.js', 'search-data.js', 'search.js',
]

# PF2 — the pure-corpus-DATA members of bundle-a (`var X = {…}`, no top-level
# `this`, no cross-file bare-name dep beyond their one global). These are
# minified per-file BEFORE the concat (the PF1 pattern, proven globals-preserving
# + value-identical), stripping ~150 KB of indentation off the cold-boot parse a
# budget WebView pays on EVERY launch. The vendored UMD libs (react/react-dom/
# flexsearch read top-level `this`) stay RAW, and the search ENGINE (search.js) +
# its index data (search-data.js, multi-global) stay raw too — minify them only
# with the same deep-equal rigor if the marginal win is ever wanted. bundle-a is
# NOT in the corpus-version gate (that hashes only the lazy a-bible/matthew/vot
# bundles), so this needs no CORPUS_VERSION bump; the SW content-hash auto-busts.
MINIFY_A = {
    'src/data/books-restored.js',
    'src/data/matthew-plain.js',
    'src/data/matthew-nkjv.js',
}

# Cluster A-bible — the 66-book NKJV corpus. Loaded ON DEMAND via
# window.__loadBibleCorpus() (see index.html ~line 67). Until this
# bundle loads, `BOOKS` is undefined; consumers (ScripturesHome,
# Bible-bound nav handlers, BibleChapterView, useReadingChainNav,
# useSurprise's Bible branch) either show skeleton state or await
# __loadBibleCorpus() before rendering / navigating.
A_BIBLE = [
    'src/data/books.js',
]

# Cluster A-matthew — the Matthew Study Bible. Loaded ON DEMAND via
# window.__loadMatthewCorpus() on first navigation to Matthew Study
# Bible content (Studies → Matthew Study Bible, or any chain
# navigation that crosses into Matthew). Until this bundle loads,
# `MATTHEW` is undefined; ALL_BOOKS, useBibleStudies' Matthew chain,
# useSurprise's matthew branch, MatthewChapterView all guard.
A_MATTHEW = [
    'src/data/matthew.js',
]

# Cluster A-vot — all VOT collections (7 volumes + letters families +
# WTLB + Holy Days + Hidden Manna + The Blessed). Loaded ON DEMAND
# via window.__loadVotCorpus() on first navigation to ANY VOT-side
# content (VolumesHome, any letter index, any letter view, any WTLB
# entry). Until this bundle loads, the corresponding LETTERS_X /
# WTLB_X / HOLY_DAYS / etc. globals are undefined; consumers route
# through colLetterArr / colPreface (which use typeof window[name]
# guards) and render empty / loading state cleanly. __finishVotInit
# re-runs linkWtlbEntries + linkPreface + rebuilds VOT_LETTER_REGISTRY
# so cross-corpus tap-through works once the corpus is in.
A_VOT = [
    'src/data/volume-one.js', 'src/data/volume-two.js', 'src/data/volume-three.js',
    'src/data/volume-four.js', 'src/data/volume-five.js', 'src/data/volume-six.js',
    'src/data/volume-seven.js',
    'src/data/letters-timothy.js', 'src/data/letters-flock.js', 'src/data/lords-rebuke.js',
    'src/data/wtlb-one.js', 'src/data/wtlb-two.js', 'src/data/wtlb-scriptures.js',
    'src/data/the-blessed.js', 'src/data/holy-days.js', 'src/data/hidden-manna.js',
]

# Cluster B — stores + components + hooks + journal subsystem + scripture-resolution
# (NOW BUNDLED VIA ESBUILD as of G.2.2).
# This list is kept empty; the source files use ES `export` syntax now.
# See package.json `build:b` for the esbuild invocation.
B = []  # intentionally empty; esbuild owns bundle-b.js

# Cluster C — renderer (NOW BUNDLED VIA ESBUILD as of G.2.1).
# This list is kept for reference; tools/build.py no longer emits bundle-c.js.
# See tools/build-esbuild.sh (or package.json `build:c`) for the esbuild
# invocation. The classic-script concat is dead for this cluster — the
# source files use ES `export` syntax now.
C = []  # intentionally empty; esbuild owns bundle-c.js

# Cluster D — screens + sheets + components + utils + late stores
# (NOW BUNDLED VIA ESBUILD as of G.2.3).
# This list is kept empty; the source files use ES `export` syntax now.
# See package.json `build:d` for the esbuild invocation (entry point:
# src/ui/_entry-d.js).
D = []  # intentionally empty; esbuild owns bundle-d.js


def _minify_content(content, label):
    """Minify ONE JS source string via esbuild (PF2) and return it. Same options
    as the PF1 corpus minify (minify + target=chrome69, bundle:false → top-level
    globals preserved, value-identical). Used for the pure-data bundle-a members.
    """
    fd, tmp = tempfile.mkstemp(suffix='.js')
    os.close(fd)
    try:
        with open(tmp, 'w', encoding='utf-8', newline='') as f:
            f.write(content)
        result = subprocess.run(['node', MINIFY_JS, tmp], capture_output=True, text=True)
        if result.returncode != 0:
            print('FATAL: esbuild minify failed for ' + label)
            sys.stderr.write(result.stderr)
            sys.exit(1)
        with open(tmp, 'r', encoding='utf-8', newline='') as f:
            return f.read()
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass


def bundle(name, files):
    out_path = os.path.join(DIST, 'bundle-' + name + '.js')
    parts = []
    parts.append('/* ' + '=' * 67 + '\n')
    parts.append('   G.1 BUNDLE ' + name.upper() + ' — ' + str(len(files)) + ' files concatenated\n')
    parts.append('   Generated by tools/build.py. DO NOT EDIT BY HAND — edit src/* files.\n')
    parts.append('   ' + '=' * 67 + ' */\n\n')
    total = 0
    for rel in files:
        path = os.path.join(ROOT, rel.replace('/', os.sep))
        if not os.path.isfile(path):
            print('FATAL: file not found:', rel)
            sys.exit(1)
        with open(path, 'r', encoding='utf-8', newline='') as f:
            content = f.read()
        # PF2: minify the pure-data members of bundle-a per-file before concat
        # (vendors + the search engine stay raw — see MINIFY_A).
        if name == 'a' and rel in MINIFY_A:
            content = _minify_content(content, rel)
        parts.append('\n/* ' + '-' * 60 + '\n')
        parts.append(' * ' + rel + '\n')
        parts.append(' * ' + '-' * 60 + ' */\n')
        parts.append(content)
        if not content.endswith('\n'):
            parts.append('\n')
        total += len(content)
    os.makedirs(DIST, exist_ok=True)
    with open(out_path, 'w', encoding='utf-8', newline='') as f:
        out = ''.join(parts)
        f.write(out)
    print('OK: ' + name + ' = ' + str(len(files)) + ' files, ' + str(total) + ' raw bytes, ' + str(len(out)) + ' bundle bytes')


def minify_in_place(name):
    """Minify a just-built bundle in place with esbuild (PF1).

    --target=chrome69 is MANDATORY (Permanent Rule 6): it transpiles any syntax
    newer than Chromium 69 so the bundle still PARSES on the Android 8/9 WebView
    floor. ONLY the lazy corpus bundles (bundle-a-bible/matthew/vot.js) are passed
    here — they are pure `var X = {...}` data with no top-level `this`, so the
    bundle-a UMD-`this` trap (PF2) does not apply and minify is provably safe
    (globals preserved, data byte-identical, 0 optional-chaining in output).
    bundle-a itself stays raw because its vendored UMD libs DO read top-level
    `this`.
    """
    path = os.path.join(DIST, 'bundle-' + name + '.js')
    if not os.path.isfile(MINIFY_JS):
        print('FATAL: minify helper not found at ' + MINIFY_JS + '.')
        sys.exit(1)
    before = os.path.getsize(path)
    result = subprocess.run(
        ['node', MINIFY_JS, path],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        print('FATAL: esbuild minify failed for bundle-' + name + '.js')
        sys.stderr.write(result.stderr)
        sys.exit(1)
    after = os.path.getsize(path)
    pct = (before - after) * 100 // before if before else 0
    print('   minified bundle-' + name + '.js: ' + str(before) + ' -> ' + str(after) + ' bytes (-' + str(pct) + '%)')


def main():
    print('Building 4 classic-script bundles --> ' + DIST)
    print('  (clusters B, C, D are bundled by esbuild; run `npm run build` for the full chain)')
    bundle('a', A)  # raw — vendored UMD libs read top-level `this` (PF2 territory)
    # The lazy corpus bundles are pure data → minify (PF1, ~3.3 MB saved).
    # NOTE: any byte change here requires a CORPUS_VERSION bump (U3 gate).
    bundle('a-bible', A_BIBLE)
    minify_in_place('a-bible')
    bundle('a-matthew', A_MATTHEW)
    minify_in_place('a-matthew')
    bundle('a-vot', A_VOT)
    minify_in_place('a-vot')
    print('Done. (bundle-b.js, bundle-c.js, bundle-d.js belong to esbuild now.)')


if __name__ == '__main__':
    main()
