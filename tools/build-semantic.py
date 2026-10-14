"""tools/build-semantic.py: embed every search passage with the shipped on-device model (path to 500, step 1, 2026-10-05).

The app's meaning search (src/search/semantic.js) compares a query's vector with one vector per passage. This writes
those vectors, computed by the SAME model file the app runs (semantic/bge-small-en-v1.5-int8.onnx, onnxruntime on the CPU, a few
minutes; no GPU, no network), and the SAME WordPiece vocabulary the app tokenizes with (semantic/vocab.txt).

  node tools/semantic-units.mjs units.json && python tools/build-semantic.py units.json

Writes app/src/main/assets/semantic/units-<sha8>.bin (named by its bytes, so the PWA's cache-first copy is never stale)
and manifest.json, which names it. units-*.bin, little-endian, N units, DIM dims:
  int8[N*DIM] vectors (each unit-length, scaled by its own max) | float32[N] scale | uint32[N] key index | int32[N] start
start is the passage's offset in its document's indexed text (-1 for a title). manifest.json names the keys.

A PASSAGE WHOSE TEXT IS UNCHANGED KEEPS ITS SHIPPED VECTOR (sr8, 2026-10-14). The model is int8 dynamically quantized
and runs in length-sorted batches of 64, so a passage's vector depends on its batch: 61 new passages embedded with the
rest moved all 52,854 vectors (W30 kept 52,496 of them byte-identical by a hand-run seed and reuse pass). The shipped
pack's text hashes are kept beside it, in tools/semantic-units.hashes (line 1 names the units file they describe; one
hash per passage after it, in pack order; not shipped). A rebuild keeps the shipped int8 vector and scale of every
passage whose text the pack holds (the same document and offset first, so an unchanged pack is rebuilt byte for byte;
else the same text anywhere) and embeds only the rest. For a pack with no hashes yet, from the units of the corpus it
was built from (semantic-units.mjs --check passes):

  python tools/build-semantic.py --hashes-only units.json

A changed model embeds every passage (its vectors are another space); --fresh embeds every passage regardless.
"""
import hashlib, json, os, re, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEM = os.path.join(ROOT, 'app', 'src', 'main', 'assets', 'semantic')
# SEMANTIC_OUT: where the pack goes (default: the shipped semantic/); a trial pack for the benchmark
# (tools/search-bench/corpus.mjs SEARCH_SEMANTIC_DIR) goes elsewhere, and reuses the shipped pack's vectors too
OUT = os.environ.get('SEMANTIC_OUT') or SEM
# the shipped pack's text hashes (above); written only with the shipped pack
HASHES = os.path.join(ROOT, 'tools', 'semantic-units.hashes')
HASH_HEX = 16
MODEL = 'bge-small-en-v1.5-int8.onnx'
DIM = 384
MAX_TOKENS = 256
# The model learned His name as "Jesus": passages read it so, as the query does (semantic.js meaningText).
NAME_RESTORED = re.compile(r'\b(?:yahushua|yeshua|yahshua|yahusha|yeshu)\b', re.I)
ORT = 'ort-1.30.0/'  # onnxruntime-web's wasm build, vendored (MIT): ort.wasm.min.mjs, ort-wasm-simd-threaded.mjs/.wasm


def text_of(u):
    """The text a passage is embedded as."""
    return NAME_RESTORED.sub('Jesus', u['t'])


def text_hash(t):
    """sha1 of the embedded text (the SEMANTIC_CACHE key; its first HASH_HEX digits are the pack's hashes)."""
    return hashlib.sha1(t.encode('utf-8')).hexdigest()


def reuse_plan(old, new):
    """Per new passage, the shipped passage whose vector it keeps, or None to embed it. old, new: (key, start, text hash)
    per passage. The same document, offset and text first: an unchanged pack is rebuilt byte for byte, and a text
    repeated in several documents keeps each copy's own vector. Else the same text anywhere (a passage that moved)."""
    exact, by_text = {}, {}
    for i, k in enumerate(old):
        exact.setdefault(k, i)
        by_text.setdefault(k[2], i)
    return [exact.get(k, by_text.get(k[2])) for k in new]


def read_hashes(units_file):
    """The shipped pack's text hashes, or None when there are none or they describe another units file."""
    try:
        lines = open(HASHES, encoding='utf-8').read().split('\n')
    except OSError:
        return None
    if not lines or lines[0].split(':')[0].lstrip('# ') != units_file:
        return None
    return [l for l in lines[1:] if l]


def write_hashes(units_file, hashes):
    with open(HASHES, 'w', encoding='utf-8', newline='\n') as f:
        f.write(f"# {units_file}: each passage's text hash (sha1, first {HASH_HEX} hex), in pack order (tools/build-semantic.py)\n")
        f.write(''.join(h[:HASH_HEX] + '\n' for h in hashes))


def read_pack(d):
    """The pack in `d`: its manifest, int8 vectors, scales, and (key, start) per passage."""
    import numpy as np
    man = json.load(open(os.path.join(d, 'manifest.json'), encoding='utf-8'))
    n, dim = man['count'], man['dim']
    buf = open(os.path.join(d, man['units']), 'rb').read()
    q = np.frombuffer(buf, np.int8, n * dim).reshape(n, dim)
    scale = np.frombuffer(buf, '<f4', n, n * dim)
    key = np.frombuffer(buf, '<u4', n, n * dim + n * 4)
    start = np.frombuffer(buf, '<i4', n, n * dim + n * 8)
    return man, q, scale, [(man['keys'][k], s) for k, s in zip(key.tolist(), start.tolist())]


def hashes_only(units_path):
    """Write the hashes of the pack already shipped, from the units of the corpus it was built from."""
    src = json.load(open(units_path, encoding='utf-8'))
    man, _, _, at = read_pack(SEM)
    if man['fingerprint'] != src['fingerprint'] or man['count'] != len(src['units']):
        sys.exit("these units are not the shipped pack's (fingerprint or count differs): make them from the corpus the pack was built from")
    for i, u in enumerate(src['units']):
        if at[i] != (src['keys'][u['k']], u['s']):
            sys.exit(f"passage {i} is not the shipped pack's: {at[i]} there, {(src['keys'][u['k']], u['s'])} here")
    write_hashes(man['units'], [text_hash(text_of(u)) for u in src['units']])
    print(f"{man['count']} hashes for {man['units']} -> {HASHES}")


def main(units_path, fresh=False):
    import numpy as np
    src = json.load(open(units_path, encoding='utf-8'))
    units = src['units']
    n = len(units)
    texts = [text_of(u) for u in units]
    hashes = [text_hash(t) for t in texts]
    model_sha = hashlib.sha256(open(os.path.join(SEM, MODEL), 'rb').read()).hexdigest()
    # The shipped pack's vector for every passage whose text it holds.
    plan = [None] * n
    oq = osc = None
    if not fresh and os.path.exists(os.path.join(SEM, 'manifest.json')):
        shipped, oq, osc, at = read_pack(SEM)
        if shipped.get('modelSha256') != model_sha or shipped['dim'] != DIM or shipped.get('maxTokens') != MAX_TOKENS:
            print('  the model changed: every passage is embedded', flush=True)
        else:
            old = read_hashes(shipped['units'])
            if old is None or len(old) != shipped['count']:
                sys.exit(f"tools/semantic-units.hashes does not describe the shipped pack ({shipped['units']}): run --hashes-only "
                         'with the units it was built from, or pass --fresh to embed every passage (every vector moves)')
            plan = reuse_plan([a + (h,) for a, h in zip(at, old)],
                              [(src['keys'][u['k']], u['s'], h[:HASH_HEX]) for u, h in zip(units, hashes)])
    vec = np.zeros((n, DIM), np.float32)
    # SEMANTIC_CACHE (an .npz path): vectors already computed for the same text are reused (trial packs)
    cache_path = os.environ.get('SEMANTIC_CACHE')
    cache = {}
    if cache_path and os.path.exists(cache_path):
        z = np.load(cache_path)
        cache = dict(zip(z['keys'].tolist(), z['vecs']))
    todo = [i for i in range(n) if plan[i] is None and hashes[i] not in cache]
    for i in range(n):
        if plan[i] is None and hashes[i] in cache: vec[i] = cache[hashes[i]]
    order = np.array(todo)[np.argsort([len(texts[i]) for i in todo])] if todo else np.array([], int)
    t0 = time.time()
    print(f'  {n - plan.count(None)} keep their shipped vector; {len(todo)} of {n} to embed', flush=True)
    if todo:
        import onnxruntime as ort
        from tokenizers import BertWordPieceTokenizer
        tok = BertWordPieceTokenizer(os.path.join(SEM, 'vocab.txt'), lowercase=True, strip_accents=None, clean_text=True, handle_chinese_chars=True)
        tok.enable_truncation(MAX_TOKENS)
        so = ort.SessionOptions()
        so.intra_op_num_threads = max(1, (os.cpu_count() or 4) - 2)
        sess = ort.InferenceSession(os.path.join(SEM, MODEL), so, providers=['CPUExecutionProvider'])
        names = {i.name for i in sess.get_inputs()}
    for s in range(0, len(order), 64):
        idx = order[s:s + 64]
        enc = tok.encode_batch([texts[i] for i in idx])
        L = max(len(e.ids) for e in enc)
        ids = np.zeros((len(enc), L), np.int64)
        am = np.zeros_like(ids)
        for r, e in enumerate(enc):
            ids[r, :len(e.ids)] = e.ids
            am[r, :len(e.ids)] = 1
        feed = {'input_ids': ids, 'attention_mask': am}
        if 'token_type_ids' in names: feed['token_type_ids'] = np.zeros_like(ids)
        h = sess.run(None, feed)[0][:, 0, :]
        vec[idx] = h / np.linalg.norm(h, axis=1, keepdims=True)
        if s % 6400 == 0: print(f'  {s}/{len(order)} {time.time() - t0:.0f}s', flush=True)
    if cache_path:
        for i in todo: cache[hashes[i]] = vec[i]
        np.savez(cache_path, keys=np.array(list(cache.keys())), vecs=np.stack(list(cache.values())))
    # Quantized as before for the passages embedded (or from the cache); the kept ones keep their shipped bytes.
    q = np.zeros((n, DIM), np.int8)
    scale = np.zeros(n, np.float32)
    rows = np.array([i for i in range(n) if plan[i] is None], np.int64)
    if len(rows):
        scale[rows] = (np.abs(vec[rows]).max(1) / 127).astype(np.float32)
        q[rows] = np.round(vec[rows] / scale[rows][:, None]).astype(np.int8)
    for i, j in enumerate(plan):
        if j is not None:
            q[i] = oq[j]
            scale[i] = osc[j]
    key = np.array([u['k'] for u in units], np.uint32)
    start = np.array([u['s'] for u in units], np.int32)
    blob = q.tobytes() + scale.astype('<f4').tobytes() + key.astype('<u4').tobytes() + start.astype('<i4').tobytes()
    sha = hashlib.sha256(blob).hexdigest()
    units_file = f'units-{sha[:8]}.bin'
    for old in os.listdir(OUT):
        if old.startswith('units-') and old.endswith('.bin') and old != units_file: os.remove(os.path.join(OUT, old))
    with open(os.path.join(OUT, units_file), 'wb') as f: f.write(blob)
    man = {
        'version': 1,
        'model': MODEL, 'modelSha256': model_sha,
        'queryPrefix': 'Represent this sentence for searching relevant passages: ',
        'dim': DIM, 'count': n, 'maxTokens': MAX_TOKENS,
        'units': units_file, 'unitsSha256': sha,
        'ort': ORT,
        # what the PWA keeps offline (sw-register.js warmMeaningSearch), relative to semantic/
        'files': ['vocab.txt', MODEL, units_file] + [ORT + f for f in ('ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm')],
        'fingerprint': src['fingerprint'],
        'keys': src['keys'],
    }
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(man, f, separators=(',', ':'))
        f.write('\n')
    if os.path.abspath(OUT) == os.path.abspath(SEM): write_hashes(units_file, hashes)
    print(f'{n} units, {len(blob) / 1e6:.1f} MB, {time.time() - t0:.0f}s -> {OUT}')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if len(args) != 1:
        sys.exit('usage: python tools/build-semantic.py [--fresh | --hashes-only] <units.json from tools/semantic-units.mjs>')
    if '--hashes-only' in sys.argv: hashes_only(args[0])
    else: main(args[0], fresh='--fresh' in sys.argv)
