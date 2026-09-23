// @ts-nocheck — reads the REAL shipped audio manifest.
/* EVERY FAMILY OF RECORDINGS HAS A WAY IN FROM THE LISTENING LIBRARY (listening item 4, 2026-09-22).
   The studies shipped recordings for months with no Listening Library doorway (the 2026-09-22 walk found it).
   The hub's Browse shelf reaches AUDIO_MANIFEST's families through two doorways: "The Volumes of Truth" (every
   COLLECTIONS entry) and "Bible/Letter Studies" ('study'). The Bible editions have their own manifest and rows.
   A new family in the manifest (a new collection, a new kind of recording) fails here until it has a doorway:
   add it to the hub's Browse shelf, then to DOORWAYS below. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { COLLECTIONS } from './scripture-resolution.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = new Function(`${readFileSync(join(HERE, 'audio-manifest.js'), 'utf8')}; return AUDIO_MANIFEST;`)();

const DOORWAYS = new Set([...COLLECTIONS.map((c) => c.volKey), 'study']);

describe('the Listening Library reaches every family of recordings', () => {
  it('each AUDIO_MANIFEST family is behind a doorway', () => {
    const families = [...new Set(Object.keys(manifest).map((k) => k.slice(0, k.indexOf(':'))))];
    expect(families.length).toBeGreaterThan(10);
    const orphans = families.filter((f) => !DOORWAYS.has(f));
    expect(orphans, 'recordings no Listening Library screen can reach').toEqual([]);
  });

  it('the studies family is real (so its doorway is not a doorway to nothing)', () => {
    expect(Object.keys(manifest).some((k) => k.startsWith('study:'))).toBe(true);
  });
});
