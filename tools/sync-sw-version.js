/**
 * W5.4 — sync the service worker's CACHE_VERSION from package.json.
 *
 * package.json "version" is the single source of truth for the app
 * version. This rewrites the `const CACHE_VERSION = 'vX.Y.Z'` line in
 * service-worker.js to match, so a version bump busts the core cache on
 * the next deploy. CORPUS_VERSION is independent (bump only when the
 * lazy corpus bundles change) and is left untouched.
 *
 * Idempotent: no write if already in sync. Wired into `npm run build`
 * (build:sw), so every build — including the deploy workflow's — keeps
 * the deployed SW version correct.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = resolve(root, 'package.json');
const swPath = resolve(root, 'app/src/main/assets/service-worker.js');

const version = JSON.parse(readFileSync(pkgPath, 'utf-8')).version;
if (!version) {
  console.error('[sync-sw-version] package.json has no "version" field');
  process.exit(1);
}

const target = `v${version}`;
const sw = readFileSync(swPath, 'utf-8');
const re = /const CACHE_VERSION = '[^']*';/;

if (!re.test(sw)) {
  console.error('[sync-sw-version] could not find a CACHE_VERSION line in service-worker.js');
  process.exit(1);
}

const next = sw.replace(re, `const CACHE_VERSION = '${target}';`);
if (next === sw) {
  console.log(`[sync-sw-version] CACHE_VERSION already '${target}' — no change.`);
} else {
  writeFileSync(swPath, next);
  console.log(`[sync-sw-version] CACHE_VERSION -> '${target}'.`);
}
