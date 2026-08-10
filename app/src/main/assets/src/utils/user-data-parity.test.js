// @ts-nocheck — reads the three declarations from source via node fs/path/url
// (outside the DOM types the Q4 scope carries), same as reading-fonts.test.js.

/* Four-way user-data store parity.
   ─────────────────────────────────────────────────────────────────────
   Four lists name the user's own stores, and nothing made them agree:

     1. SettingsScreen.jsx  _exportableStores() + _flagStores()
        — WHAT THE BACKUP WRITES AND RESTORES. The source of truth: a
          store missing here is not in the user's only backup at all.
     2. utils/user-data-size.js  USER_DATA_STORES
        — what Settings → Your Data COUNTS. A store missing here is
          backed up but invisible in the size number.
     3. utils/import-validators.js  STORE_SHAPES
        — what the import trust boundary VALIDATES. A store missing
          here is restored from a .votbak with its top-level shape
          unchecked (validateStorePayload tolerates unknown names by
          design, for forward-compat with newer backups).
     4. stores/idb-adapter.js  STORE_NAMES  (added C2-D [D2])
        — every store the SCHEMA declares. This is the leg that closes
          the loop in the other direction: legs 1-3 could all agree
          with each other about a set of stores that quietly OMITTED a
          real one, which is exactly what happened. vot-library-order,
          vot-note-default and vot-ann-hint-dismissed had been in the
          schema since IDB v3/v4/v7 and in NO backup list at all, so
          the reader's Library tile arrangement, the note style+colour
          every new note inherits, and a dismissed coach-mark simply
          died with the device. Three lists agreeing is not parity if
          all three are short.

   Each list was maintained by hand, by comment ("If a store is added to
   the export, add it here too"). That held until `vot-audio-library`
   (IDB v9) landed: SettingsScreen and STORE_SHAPES got it, USER_DATA_STORES
   did not — so a reader with a large saved-recordings shelf saw a "Your
   Data" number that under-counted it, for a release. That is the failure
   this file makes impossible to repeat quietly.

   HOW: legs 1 and 3 are object literals inside a module (one of them
   inside a component closure), so they cannot be imported — they are
   read from SOURCE TEXT. That is deliberate and it is the only way to
   see the `globalThis` -guarded `vot-audio-library` entry by name without
   standing up a bundle. The extractors assert their own sanity (marker
   found, plausible count) so a refactor that outruns the regex goes RED
   here rather than silently passing a vacuous parity check.

   THE CARVE-OUT: the four flag stores (vot-welcomed / vot-about-seen /
   vot-garden-warning-acked / vot-ann-hint-dismissed) are booleans, not
   payloads — they ride _flagStores() and USER_DATA_STORES but
   deliberately have no STORE_SHAPES entry. That exemption is asserted
   explicitly below so it can never quietly widen into a place to hide a
   real store.

   THE OTHER CARVE-OUT: `meta` is the one store in the schema that is NOT
   the reader's content — it holds migration bookkeeping and the storage-
   growth series, and it is deliberately outside USER_DATA_STORES so the
   series can never inflate the very number it trends. It is the ONLY
   name leg 4 exempts, by exact match, so "it's just bookkeeping" cannot
   become a second place to lose a store.
*/

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { USER_DATA_STORES } from './user-data-size.js';
import { IDBAdapter } from '../stores/idb-adapter.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = join(HERE, '..', 'ui', 'screens', 'SettingsScreen.jsx');
const VALIDATORS_PATH = join(HERE, 'import-validators.js');

const SETTINGS_SRC = readFileSync(SETTINGS_PATH, 'utf8');
const VALIDATORS_SRC = readFileSync(VALIDATORS_PATH, 'utf8');

/* ── extraction ─────────────────────────────────────────────────────── */

/**
 * Slice the source between two markers, failing loudly (rather than
 * returning '') when the shape has moved. A silent miss here would make
 * every parity assertion below vacuously true.
 *
 * @param {string} src   file text
 * @param {string} file  file name, for the failure message
 * @param {string} start opening marker (must be unique enough)
 * @param {string} end   closing marker, searched after `start`
 * @returns {string}
 */
function sliceBetween(src, file, start, end) {
  const a = src.indexOf(start);
  if (a === -1) {
    throw new Error(
      `user-data-parity: cannot find "${start}" in ${file}. The declaration moved or was `
      + 'renamed — update this test\'s extractor. Do NOT delete the assertion.',
    );
  }
  const b = src.indexOf(end, a + start.length);
  if (b === -1) {
    throw new Error(
      `user-data-parity: found "${start}" in ${file} but not its closing "${end}". `
      + 'Update this test\'s extractor.',
    );
  }
  return src.slice(a + start.length, b);
}

/** Drop `//` line comments so a commented-out store name never counts. */
const stripLineComments = (s) => s.replace(/\/\/[^\n]*/g, '');

/**
 * Every `'vot-…'` string literal in a region, de-duplicated, in order.
 * Within these three regions the only vot- literals ARE store names —
 * as keys, or (for the guarded AudioLibraryStore) as a bracket-assignment
 * subscript, which is exactly why this reads literals rather than keys.
 *
 * @param {string} region
 * @returns {string[]}
 */
function votLiterals(region) {
  const found = stripLineComments(region).match(/'(vot-[a-z0-9-]+)'/g) || [];
  return [...new Set(found.map((q) => q.slice(1, -1)))];
}

/** Leg 1a — the stores the backup exports and restores by payload. */
const EXPORTABLE = votLiterals(sliceBetween(
  SETTINGS_SRC, 'SettingsScreen.jsx', 'const _exportableStores = () => {', 'return stores;',
));

/** Leg 1b — the boolean flag stores the backup carries alongside them. */
const FLAGS = votLiterals(sliceBetween(
  SETTINGS_SRC, 'SettingsScreen.jsx', 'const _flagStores = () => ({', '});',
));

/** Leg 3 — the store names the import trust boundary shape-checks. */
const SHAPED = votLiterals(sliceBetween(
  VALIDATORS_SRC, 'import-validators.js', 'const STORE_SHAPES = {', '\n};',
));

/** Everything the backup touches: payload stores + flag stores. */
const BACKED_UP = [...EXPORTABLE, ...FLAGS];

/** Leg 4 — every `vot-*` store the IDB schema declares. `meta` is excluded
 *  here (it is bookkeeping, not content) and asserted separately below. */
const SCHEMA = IDBAdapter.STORE_NAMES.filter((n) => n.startsWith('vot-'));

/* ── reporting ──────────────────────────────────────────────────────── */

/**
 * Names in `a` absent from `b`. Returned as a sorted array so a failure
 * message lists the offenders deterministically.
 *
 * @param {string[]} a
 * @param {string[]} b
 * @returns {string[]}
 */
const missingFrom = (a, b) => a.filter((n) => !b.includes(n)).sort();

/**
 * Assert one direction of one leg, with a message that names the leg,
 * the file to edit, and what breaks for the reader if it stays broken.
 *
 * @param {string[]} have     names present in the source-of-truth side
 * @param {string[]} want     names present in the side under test
 * @param {string}   leg      human name of the side under test
 * @param {string}   file     where to add the missing names
 * @param {string}   symptom  what the user experiences while it is missing
 */
function expectCovered(have, want, leg, file, symptom) {
  const gap = missingFrom(have, want);
  expect(
    gap,
    `${leg} is missing ${gap.length} store(s): ${gap.join(', ')}\n`
    + `  → add them to ${file}\n`
    + `  → until then: ${symptom}`,
  ).toEqual([]);
}

/* ── the extractors must actually be reading something ──────────────── */

describe('user-data parity — extraction sanity', () => {
  it('reads a plausible store list out of each of the four declarations', () => {
    // Floors, not exact counts: adding a store must not fail THIS test (it
    // fails the parity tests below, which say what to do). They exist so a
    // regex that stops matching can never make the parity checks vacuous.
    expect(EXPORTABLE.length, 'SettingsScreen _exportableStores() parsed too small').toBeGreaterThanOrEqual(15);
    expect(FLAGS.length, 'SettingsScreen _flagStores() parsed too small').toBeGreaterThanOrEqual(4);
    expect(SHAPED.length, 'import-validators STORE_SHAPES parsed too small').toBeGreaterThanOrEqual(15);
    expect(USER_DATA_STORES.length).toBeGreaterThanOrEqual(18);
    // Leg 4 is a real import, not a regex — it needs no marker sanity, only
    // the guarantee that the schema isn't somehow empty.
    expect(SCHEMA.length, 'IDBAdapter.STORE_NAMES parsed too small').toBeGreaterThanOrEqual(20);
  });

  it('sees the globalThis-guarded AudioLibraryStore entry by name', () => {
    // The one entry that is NOT a literal key — it is attached conditionally
    // (`stores['vot-audio-library'] = …`) because AudioLibraryStore lives in
    // bundle-b. Reading literals rather than keys is what catches it; this
    // pins that, so the extractor can't regress to keys-only and go quiet.
    expect(EXPORTABLE).toContain('vot-audio-library');
  });

  it('no list repeats a store name', () => {
    // votLiterals() de-dupes by construction; USER_DATA_STORES is hand-written.
    expect(USER_DATA_STORES.length).toBe(new Set(USER_DATA_STORES).size);
  });
});

/* ── leg 2: Settings → Your Data counts everything the backup carries ── */

describe('user-data parity — USER_DATA_STORES (the "Your Data" size)', () => {
  it('counts every store the backup writes', () => {
    expectCovered(
      BACKED_UP, USER_DATA_STORES,
      'USER_DATA_STORES', 'app/src/main/assets/src/utils/user-data-size.js',
      'the store is backed up but its bytes are invisible in Settings → Your Data, '
      + 'so the number under-reports what the reader would lose.',
    );
  });

  it('counts nothing the backup does NOT write', () => {
    // The reverse leg. "Your Data" promises to be the size of what Export
    // saves; a store counted here but absent from the backup would inflate
    // that promise with bytes the reader would lose anyway.
    expectCovered(
      USER_DATA_STORES, BACKED_UP,
      "SettingsScreen's export map", 'app/src/main/assets/src/ui/screens/SettingsScreen.jsx',
      'the "Your Data" size counts bytes the backup never saves, overstating what is protected.',
    );
  });
});

/* ── leg 3: the import trust boundary validates what it restores ─────── */

describe('user-data parity — STORE_SHAPES (the import trust boundary)', () => {
  it('shape-checks every payload store the backup restores', () => {
    expectCovered(
      EXPORTABLE, SHAPED,
      'STORE_SHAPES', 'app/src/main/assets/src/utils/import-validators.js',
      'validateStorePayload() returns [] for unknown names (forward-compat), so this '
      + "store's payload is restored from a .votbak with its top-level shape unchecked.",
    );
  });

  it('shape-checks nothing the backup does NOT restore', () => {
    expectCovered(
      SHAPED, EXPORTABLE,
      "SettingsScreen's export map", 'app/src/main/assets/src/ui/screens/SettingsScreen.jsx',
      'a shape is declared for a store nothing imports — either the store was dropped '
      + 'from the backup (and its shape is dead) or it was never wired in.',
    );
  });

  it('deliberately exempts the four boolean flag stores', () => {
    // Flags are `true`/`false`, not payloads — they are applied via set()/clear(),
    // never through validateStorePayload. Pinned so the exemption stays exactly
    // four known names and never becomes a general hole in the boundary.
    expect(FLAGS.slice().sort()).toEqual([
      'vot-about-seen', 'vot-ann-hint-dismissed',
      'vot-garden-warning-acked', 'vot-welcomed',
    ]);
    for (const flag of FLAGS) expect(SHAPED).not.toContain(flag);
  });
});

/* ── leg 4: the schema and the backup name the same stores ───────────── */

describe('user-data parity — STORE_NAMES (the IDB schema)', () => {
  it('backs up every vot-* store the schema declares', () => {
    // The direction the other three legs structurally cannot see: they check
    // each other, so a store none of them ever heard of stays invisible. This
    // one starts from the DATABASE. If a store exists to hold something, the
    // burden is on the author to say why it is not the reader's to keep.
    expectCovered(
      SCHEMA, BACKED_UP,
      "SettingsScreen's export + flag maps",
      'app/src/main/assets/src/ui/screens/SettingsScreen.jsx',
      'the store exists, the app writes to it, and Export does not read it — '
      + 'whatever it holds dies with the device. If it genuinely is not user '
      + 'data, exempt it HERE by name with the reason, the way `meta` is.',
    );
  });

  it('backs up nothing the schema does not declare', () => {
    // The reverse: an export entry for a store the schema never creates would
    // read undefined forever and restore into nothing — the shape of a missed
    // DB_VERSION bump (leg 1 of the seven registration legs).
    expectCovered(
      BACKED_UP, SCHEMA,
      'IDBAdapter.STORE_NAMES', 'app/src/main/assets/src/stores/idb-adapter.js',
      'the backup names a store the schema never creates, so it exports nothing '
      + 'and restores nowhere. Add it to STORE_NAMES and bump DB_VERSION.',
    );
  });

  it('exempts `meta` and nothing else', () => {
    // `meta` holds migration bookkeeping + the storage-growth series, and is
    // deliberately outside USER_DATA_STORES so the series cannot inflate the
    // number it trends (see user-data-size.js). Pinned by exact match so the
    // exemption cannot widen into a place to park a real store.
    const nonVot = IDBAdapter.STORE_NAMES.filter((n) => !n.startsWith('vot-'));
    expect(nonVot).toEqual(['meta']);
    expect(USER_DATA_STORES).not.toContain('meta');
  });
});
