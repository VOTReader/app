/* platform-7 (2026-11-26): the web app manifest describes the app the way
   index.html does. The manifest still said "Offline scripture reader for The
   Volumes of Truth" after the app grew the Bible, audio and study tools, and
   the install sheet shows that line. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSETS = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'src', 'main', 'assets');

describe('manifest.json', () => {
  it("description is index.html's meta description", () => {
    const manifest = JSON.parse(readFileSync(resolve(ASSETS, 'manifest.json'), 'utf-8'));
    const html = readFileSync(resolve(ASSETS, 'index.html'), 'utf-8');
    const meta = html.match(/<meta name="description" content="([^"]+)"/);
    expect(meta, 'index.html has no meta description').not.toBeNull();
    expect(manifest.description).toBe(meta[1]);
  });
});
