// @ts-nocheck -- reads offline.html from disk with node APIs
// The offline fallback page (offline.html) names what plays without internet once the app has opened online:
// the letters, and the songs a listener keeps on this phone (Songs of the Letters K1; wording deferred to K3).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

describe('offline.html', () => {
  it('says kept songs play without internet, in one plain line', () => {
    const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../offline.html'), 'utf-8');
    const lines = [...html.matchAll(/<p>([^<]*)<\/p>/g)].map((m) => m[1]);
    expect(lines.filter((l) => /songs you keep on this phone play without internet/.test(l))).toHaveLength(1);
  });
});
