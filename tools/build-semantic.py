"""tools/build-semantic.py: embed every search passage with the shipped on-device model (path to 500, step 1, 2026-10-05).

The app's meaning search (src/search/semantic.js) compares a query's vector with one vector per passage. This writes
those vectors, computed by the SAME model file the app runs (semantic/bge-small-en-v1.5-int8.onnx, onnxruntime on the CPU, a few
minutes; no GPU, no network), and the SAME WordPiece vocabulary the app tokenizes with (semantic/vocab.txt).

  node tools/semantic-units.mjs units.json && python tools/build-semantic.py units.json

Writes app/src/main/assets/semantic/units-<sha8>.bin (named by its bytes, so the PWA's cache-first copy is never stale)
and manifest.json, which names it. units-*.bin, little-endian, N units, DIM dims:
  int8[N*DIM] vectors (each unit-length, scaled by its own max) | float32[N] scale | uint32[N] key index | int32[N] start
start is the passage's offset in its document's indexed text (-1 for a title). manifest.json names the keys.
"""
import hashlib, json, os, sys, time
import numpy as np
import onnxruntime as ort
from tokenizers import BertWordPieceTokenizer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEM = os.path.join(ROOT, 'app', 'src', 'main', 'assets', 'semantic')
# SEMANTIC_OUT: where the pack goes (default: the shipped semantic/); a trial pack for the benchmark
# (tools/search-bench/corpus.mjs SEARCH_SEMANTIC_DIR) goes elsewhere
OUT = os.environ.get('SEMANTIC_OUT') or SEM
MODEL = 'bge-small-en-v1.5-int8.onnx'
DIM = 384
MAX_TOKENS = 256
ORT = 'ort-1.30.0/'  # onnxruntime-web's wasm build, vendored (MIT): ort.wasm.min.mjs, ort-wasm-simd-threaded.mjs/.wasm

def main(units_path):
    src = json.load(open(units_path, encoding='utf-8'))
    units = src['units']
    tok = BertWordPieceTokenizer(os.path.join(SEM, 'vocab.txt'), lowercase=True, strip_accents=None, clean_text=True, handle_chinese_chars=True)
    tok.enable_truncation(MAX_TOKENS)
    so = ort.SessionOptions()
    so.intra_op_num_threads = max(1, (os.cpu_count() or 4) - 2)
    sess = ort.InferenceSession(os.path.join(SEM, MODEL), so, providers=['CPUExecutionProvider'])
    names = {i.name for i in sess.get_inputs()}
    texts = [u['t'] for u in units]
    vec = np.zeros((len(texts), DIM), np.float32)
    order = np.argsort([len(t) for t in texts])
    t0 = time.time()
    for s in range(0, len(texts), 64):
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
        if s % 6400 == 0: print(f'  {s}/{len(texts)} {time.time() - t0:.0f}s', flush=True)
    scale = (np.abs(vec).max(1) / 127).astype(np.float32)
    q = np.round(vec / scale[:, None]).astype(np.int8)
    key = np.array([u['k'] for u in units], np.uint32)
    start = np.array([u['s'] for u in units], np.int32)
    blob = q.tobytes() + scale.astype('<f4').tobytes() + key.astype('<u4').tobytes() + start.astype('<i4').tobytes()
    sha = hashlib.sha256(blob).hexdigest()
    units_file = f'units-{sha[:8]}.bin'
    for old in os.listdir(OUT):
        if old.startswith('units-') and old.endswith('.bin') and old != units_file: os.remove(os.path.join(OUT, old))
    with open(os.path.join(OUT, units_file), 'wb') as f: f.write(blob)
    model_sha = hashlib.sha256(open(os.path.join(SEM, MODEL), 'rb').read()).hexdigest()
    man = {
        'version': 1,
        'model': MODEL, 'modelSha256': model_sha,
        'queryPrefix': 'Represent this sentence for searching relevant passages: ',
        'dim': DIM, 'count': len(units), 'maxTokens': MAX_TOKENS,
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
    print(f'{len(units)} units, {len(blob) / 1e6:.1f} MB, {time.time() - t0:.0f}s -> {OUT}')

if __name__ == '__main__':
    if len(sys.argv) != 2: sys.exit('usage: python tools/build-semantic.py <units.json from tools/semantic-units.mjs>')
    main(sys.argv[1])
