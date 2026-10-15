/**
 * hone-bible-sample (al5, sweep 2026-10-13, low): the QA preview painted a REVIEW verse in the probe-adjudicated
 * amber, i.e. as proven, and would light an UNSPOKEN row that carries a time, which ship() never ships. A REVIEW
 * verse ships (loose over dark, 2026-08-26) but is unproven: it gets its own class and legend entry.
 *
 * The tool runs in-process, through its exported main(). The hook used to spawn a fresh node for it, all of it charged
 * to vitest's 10 s hook timeout: 0.1 s alone, up to 2 s beside two other suites, and past 10 s in a loaded pre-push
 * (readalong rv1-listening, 2026-10-14).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from './hone-bible-sample.mjs';

let tmp;
let html;
const cls = (n) => (html.match(new RegExp(`<span class="([^"]+)" data-n="${n}"`)) || [])[1];

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'hone-sample-'));
  const audio = join(tmp, 'a.mp3');
  writeFileSync(audio, Buffer.from([0xff, 0xfb, 0x90, 0x00]));
  writeFileSync(join(tmp, 'v.json'), JSON.stringify({
    book: 'John', chapter: 1,
    verses: [1, 2, 3, 4, 5].map((n) => ({ n, text: `verse ${n}` })),
  }));
  writeFileSync(join(tmp, 't.json'), JSON.stringify({
    audio,
    verses: [
      { n: 1, t: 1.0, status: 'CONFIRMED' },
      { n: 2, t: 2.0, status: 'PROBED_A' },
      { n: 3, t: 3.0, status: 'REVIEW' },
      { n: 4, t: 4.0, status: 'UNSPOKEN' },
    ],
  }));
  const log = vi.spyOn(console, 'log').mockImplementation(() => {}); // its "wrote <path>" line
  try {
    expect(main([join(tmp, 'v.json'), join(tmp, 't.json'), join(tmp, 'out.html')])).toBe(0);
  } finally {
    log.mockRestore();
  }
  html = readFileSync(join(tmp, 'out.html'), 'utf-8');
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('hone-bible-sample paints each status as what it is', () => {
  it('keeps confirmed and probed verses as before', () => {
    expect(cls(1)).toBe('verse');
    expect(cls(2)).toBe('verse probed');
  });
  it('shows a REVIEW verse as review, never as probe-adjudicated', () => {
    expect(cls(3)).toBe('verse review');
    expect(html).toMatch(/dashed = REVIEW/);
  });
  it('never times an UNSPOKEN row, as ship() never ships one', () => {
    expect(cls(4)).toBe('verse miss');
    expect(html).not.toMatch(/data-n="4" data-t=/);
    expect(cls(5)).toBe('verse miss');
  });
});
