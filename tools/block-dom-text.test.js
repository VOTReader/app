/* Now Playing's live text (rv1, NowPlayingText.jsx) cuts clauses out of the app's blockDomText
   (block-dom-text.js) with the AUDIO_SYNC offsets, which the extractor measured with this lib's
   blockDomainText. Every block in the letter corpus must read the same through both, or the pane shows
   a clause shifted from the voice. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { runInNewContext } from 'vm';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CORPUS_FILES, buildCollections, blockDomainText } from './audio-fragments-lib.mjs';
import { blockDomText } from '../app/src/main/assets/src/utils/block-dom-text.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, '..', 'app', 'src', 'main', 'assets', 'src', 'data');

describe("blockDomText is the extractor's block domain", () => {
  it('matches blockDomainText on every block of the letter corpus', () => {
    const ctx = {};
    for (const f of CORPUS_FILES) runInNewContext(readFileSync(resolve(DATA, f), 'utf8'), ctx, { filename: f });
    const { A } = buildCollections(ctx);
    let n = 0;
    for (const arr of Object.values(A)) for (const letter of arr.filter(Boolean)) for (const b of letter.blocks || []) {
      const want = blockDomainText(b);
      expect(blockDomText(b)).toBe(want ? want.text : null);
      n++;
    }
    expect(n).toBeGreaterThan(2000);   // 2,541 blocks on 2026-10-05
  });
});
