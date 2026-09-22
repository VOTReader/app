/**
 * The journal SCREENS join bundle-g; the journal MACHINERY does not.
 * ─────────────────────────────────────────────────────────────────────
 * The hub, the viewer and the editor are screens a reader opens on
 * purpose — the same shape as My Progress, Notes, Links, Highlights,
 * Bookmarks, Milestones and History before them — yet they sat in
 * bundle-b, parsed on every launch: 76 KB of the cluster's 340, the
 * single biggest block in it after the styles.
 *
 * WHAT DELIBERATELY STAYS EAGER, and why each one would be a bug to move:
 *   journal-styles.js      the renderer paints JournalChip INTO reading
 *                          text on chapter and letter screens, and the
 *                          chip wears `jrn-` CSS. Move the styles and an
 *                          eager surface goes unstyled until a reader
 *                          opens the journal.
 *   JournalInboundSheet    AppShellSheets mounts it in the always-present
 *                          shell (the "entries linked to this ref" sheet),
 *                          exactly like BookmarkPopover in landing 22.
 *   JournalChip            the renderer's own inline chip.
 *   JournalHelpers + every journal STORE
 *                          they register with CachedStore and hydrate at
 *                          boot; HydrationGate waits on them.
 *
 * The two sheets that DO travel are the two the editor alone renders:
 * JournalInsertSheet and JournalRecordingSheet.
 *
 * A MARKER IS A DEFINITION, never a mention. screen-routes.jsx keeps
 * `typeof JournalHubScreen !== 'undefined'` in bundle-d precisely BECAUSE
 * the contract is kept, so the identifier alone proves nothing; and the
 * minifier writes a guarded free-global read as a ternary, whose colon reads
 * like a key. `defines` below asks for the key shape, and where a module has
 * no window key — the styles, the stores — the marker is a string literal.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, '..', 'app', 'src', 'main', 'assets', 'dist');
const read = (f) => readFileSync(resolve(DIST, f), 'utf-8');

/* One Object.assign key per travelling screen. esbuild keeps the KEY of a
   window assignment verbatim, so `Name:` is the honest membership marker. */
const TRAVELLERS = [
  'JournalHubScreen', 'JournalViewerScreen', 'JournalEditorScreen',
  'JournalInsertSheet', 'JournalRecordingSheet',
  'JournalCardMenu', 'JournalBlockView', 'jrnRenderInline',
];
/* A definition is a KEY in an object literal, so the character before the
   colon is `{` or `,`. A bare `name + ':'` also matches the minifier's ternary
   for a guarded free-global read (`typeof X=="function"?X:…`) — which is the
   opposite of a definition. */
const defines = (bundle, name) => new RegExp('[{,]\s*' + name + ':').test(bundle);

describe('the journal screens ride bundle-g', () => {
  it('bundle-g defines every travelling screen and helper', () => {
    const g = read('bundle-g.js');
    for (const name of TRAVELLERS) {
      expect(defines(g, name), `bundle-g.js lacks ${name}`).toBe(true);
    }
  });

  it('bundle-b has let them go', () => {
    const b = read('bundle-b.js');
    for (const name of TRAVELLERS) {
      expect(defines(b, name), `bundle-b.js still defines ${name}`).toBe(false);
    }
  });

  it('the machinery under them stays in bundle-b', () => {
    const b = read('bundle-b.js');
    // String literals from the modules that must NOT travel.
    expect(b.includes('jrn-styles'), 'bundle-b.js lost journal-styles.js').toBe(true);
    expect(defines(b, 'JournalInboundSheet'), 'bundle-b.js lost the shell sheet').toBe(true);
    expect(defines(b, 'JournalChip'), 'bundle-b.js lost the renderer chip').toBe(true);
    expect(defines(b, 'JournalHelpers'), 'bundle-b.js lost JournalHelpers').toBe(true);
    expect(defines(b, 'JournalStore'), 'bundle-b.js lost JournalStore').toBe(true);
  });

  it('nothing ships the journal styles or the shell sheet twice', () => {
    const g = read('bundle-g.js');
    expect(g.includes('jrn-styles'), 'bundle-g.js ships a SECOND journal stylesheet').toBe(false);
    expect(defines(g, 'JournalInboundSheet'), 'bundle-g.js ships a second inbound sheet').toBe(false);
    expect(defines(g, 'JournalStore'), 'bundle-g.js ships a second JournalStore — two store states, one IDB').toBe(false);
  });

  it('bundle-d still asks for the screens it no longer holds', () => {
    const d = read('bundle-d.js');
    expect(d.includes('JournalHubScreen'), 'screen-routes lost its guard').toBe(true);
  });
});
