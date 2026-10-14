/**
 * gen-bible-audio-manifest (al5, sweep 2026-10-13, low): without D:/BibleAudio/brm-kjv-chapters.json the generator
 * wrote BIBLE_AUDIO_CHAPTERS empty and said nothing, and restore.js still migrates a pre-switch BRM resume snapshot
 * through those rows. A missing file is now a hard error before anything is written. The generator runs on Corbin's
 * laptop only (its inventory lives on D:), so this test runs only where that inventory is.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = resolve(HERE, 'gen-bible-audio-manifest.mjs');
const OUT = join(HERE, '..', 'app', 'src', 'main', 'assets', 'src', 'data', 'bible-audio-manifest.js');
const INVENTORY = 'D:/BibleAudio/brministries-kjv/inventory.json';

describe('gen-bible-audio-manifest', () => {
  it.skipIf(!existsSync(INVENTORY))('refuses to write an empty chapter-start table', () => {
    const before = readFileSync(OUT, 'utf-8');
    const r = spawnSync(process.execPath, [TOOL], {
      encoding: 'utf-8', env: { ...process.env, BIBLE_CHAPTERS_JSON: join(HERE, 'no-such-chapters.json') },
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/no-such-chapters\.json/);
    expect(readFileSync(OUT, 'utf-8')).toBe(before);
  });
});
