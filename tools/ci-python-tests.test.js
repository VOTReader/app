/* pipeline-11 (audit 2026-11-23): test_tx_anchor.py (14 tests) ran nowhere - CI names each Python test module by hand
   and one was never added. Every root test_*.py is in ci.yml's unittest call, or named in NEEDS_FITZ (PyMuPDF is in
   requirements-ocr.txt, which that job does not install; hub 2026-11-25). `unittest discover` would pull those in. */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CI = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8').replace(/\r\n/g, '\n');
const NEEDS_FITZ = ['test_msb_pdf_diff', 'test_vot_pdf_extract', 'test_vot_pdf_render'];

describe('every Python test module runs in CI', () => {
  const call = /^\s*python -m unittest (.+?) -v\s*$/m.exec(CI);
  const named = new Set(call ? call[1].trim().split(/\s+/) : []);
  const modules = readdirSync(ROOT).filter((f) => /^test_.*\.py$/.test(f)).map((f) => f.replace(/\.py$/, ''));

  it('finds the unittest call and the modules', () => {
    expect(call).not.toBeNull();
    expect(modules.length).toBeGreaterThan(20);
  });
  it('each root test_*.py is in the call, or needs fitz and is named as such', () => {
    const missing = modules.filter((m) => !named.has(m) && !NEEDS_FITZ.includes(m));
    expect(missing).toEqual([]);
  });
  it('the fitz modules stay out of the call, and the call names no module that is gone', () => {
    for (const m of NEEDS_FITZ) expect(named.has(m), m).toBe(false);
    expect([...named].filter((m) => !modules.includes(m))).toEqual([]);
  });
});
