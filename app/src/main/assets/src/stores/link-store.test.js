/* Q5.4 — LinkStore migration regression tests.
   ───────────────────────────────────────────────
   The {a, b} → {source, target} migration is the highest-risk silent
   data-loss surface in the codebase: it runs on every user's first
   load after the schema change, mutates persisted state, and if it
   drops a field the user only notices weeks later when they tap a
   broken link card. The original code header (link-store.js:91-94)
   already cites a prior data-loss incident.

   This test exercises the migration WITHOUT mocks (per [[dont-over-mock]])
   — real LinkStore + jsdom localStorage. Seed legacy/half-migrated/
   modern records, trigger _load() to fire the migration, then assert
   every original field survived.

   Coverage targets:
     - Modern records (already {source, target}) pass through unchanged
     - Legacy {a, b} records migrate with ALL endpoint fields preserved
     - Half-migrated records (source set + a still present) heal
     - Malformed records (missing endpoint key on both sides) drop
     - Idempotent (re-loading after migration is a no-op)
     - Mixed batch (some legacy, some modern, some malformed) handled
*/

import { describe, it, expect, beforeEach } from 'vitest';
import { LinkStore, persistLink, lnkId, hlId } from './link-store.js';

// Helper: cast a loaded link to any so we can probe legacy `a`/`b`
// fields without TS rejecting the access against the `Link` type.
// (After migration these should be undefined — which is what we assert.)
/** @param {any} v @returns {any} */
const asAny = (v) => v;

// Helper: build a typed endpoint for persistLink. Wraps the literal so
// `type: 'bible'` narrows to the `LinkEndpoint` literal union instead of
// widening to `string`. Pure type-level coercion at the call site.
/** @param {any} x @returns {import('./link-store.js').LinkEndpoint} */
const ep = (x) => /** @type {any} */ (x);

beforeEach(() => {
  localStorage.clear();
  LinkStore._resetForTests();
});

describe('LinkStore — legacy {a, b} → {source, target} migration', () => {
  it('passes a modern {source, target} record through unchanged', () => {
    const modern = {
      id: 'lnk_modern',
      source: { type: 'bible', key: 'bible:genesis:1:1', label: 'Gen 1:1' },
      target: { type: 'letter', key: 'letter:the-wide-path:0', label: 'The Wide Path' },
      created: 1700000000000,
    };
    localStorage.setItem('vot-links', JSON.stringify([modern]));

    const loaded = LinkStore.all();

    expect(loaded.length).toBe(1);
    expect(loaded[0]).toEqual(modern);  // strict equality on full shape
  });

  it('migrates a pure-legacy {a, b} record, preserving id and created', () => {
    const legacy = {
      id: 'lnk_legacy_1',
      a: { type: 'bible', key: 'bible:genesis:1:1', label: 'Gen 1:1' },
      b: { type: 'letter', key: 'letter:the-wide-path:0', label: 'The Wide Path' },
      created: 1700000000000,
    };
    localStorage.setItem('vot-links', JSON.stringify([legacy]));

    const loaded = LinkStore.all();

    expect(loaded.length).toBe(1);
    expect(loaded[0].id).toBe('lnk_legacy_1');
    expect(loaded[0].created).toBe(1700000000000);
    // a/b coerced into source/target — every endpoint field preserved
    expect(loaded[0].source).toEqual({ type: 'bible', key: 'bible:genesis:1:1', label: 'Gen 1:1' });
    expect(loaded[0].target).toEqual({ type: 'letter', key: 'letter:the-wide-path:0', label: 'The Wide Path' });
    // Legacy fields removed
    expect(asAny(loaded[0]).a).toBeUndefined();
    expect(asAny(loaded[0]).b).toBeUndefined();
  });

  it('preserves all endpoint fields during migration (preview, excerpt, start/end, collection, etc.)', () => {
    // The endpoint shape is wide — bookId, chapter, verse, verseEnd,
    // collection, letterId, entryId, start, end, text, preview.
    // A field dropped during migration is exactly the silent-data-loss
    // bug this test catches.
    const legacy = {
      id: 'lnk_rich',
      a: {
        type: 'wtlb',
        key: 'wtlb:matters-of-the-heart:0:5-20',
        label: 'Matters of the Heart',
        entryId: 'matters-of-the-heart',
        collection: 'wtlb1',
        start: 5,
        end: 20,
        text: 'selected text',
        preview: 'preview text',
      },
      b: {
        type: 'bible',
        key: 'bible:matthew:5:3',
        label: 'Matthew 5:3',
        bookId: 'matthew',
        chapter: 5,
        verse: 3,
        verseEnd: 3,
        preview: 'Blessed are the poor in spirit...',
      },
      created: 1700000000001,
    };
    localStorage.setItem('vot-links', JSON.stringify([legacy]));

    const loaded = LinkStore.all();

    expect(loaded[0].source).toEqual(legacy.a);  // exact field-for-field
    expect(loaded[0].target).toEqual(legacy.b);
  });

  it('heals a half-migrated record (source set + a still present)', () => {
    // Simulates an interrupted prior migration OR a hand-edited export.
    // Per the link-store.js:91-94 comment, this case was real data-loss
    // in an earlier version — the test guards against regression.
    const halfMigrated = {
      id: 'lnk_half',
      source: { type: 'bible', key: 'bible:psalms:23:1', label: 'Ps 23:1' },
      a: { type: 'bible', key: 'bible:psalms:23:1', label: 'Ps 23:1' },  // duplicate
      target: { type: 'letter', key: 'letter:still-waters:0', label: 'Still Waters' },
      created: 1700000000002,
    };
    localStorage.setItem('vot-links', JSON.stringify([halfMigrated]));

    const loaded = LinkStore.all();

    expect(loaded.length).toBe(1);
    expect(loaded[0].source.key).toBe('bible:psalms:23:1');
    expect(loaded[0].target.key).toBe('letter:still-waters:0');
    expect(asAny(loaded[0]).a).toBeUndefined();  // legacy field stripped
  });

  it('heals a half-migrated record where source is missing but a is present', () => {
    // Inverse case: someone clobbered source but left a.
    const halfMigrated = {
      id: 'lnk_inverse_half',
      a: { type: 'bible', key: 'bible:isaiah:53:5', label: 'Is 53:5' },
      target: { type: 'letter', key: 'letter:wounded:0', label: 'Wounded' },
      created: 1700000000003,
    };
    localStorage.setItem('vot-links', JSON.stringify([halfMigrated]));

    const loaded = LinkStore.all();

    expect(loaded.length).toBe(1);
    expect(loaded[0].source.key).toBe('bible:isaiah:53:5');
    expect(loaded[0].target.key).toBe('letter:wounded:0');
    expect(asAny(loaded[0]).a).toBeUndefined();
  });

  it('drops malformed records (both endpoints missing key)', () => {
    // A record with no useful endpoints can't be salvaged. Logged as
    // a warning + dropped is the documented behavior.
    const malformed = [
      { id: 'lnk_bad_1' },  // no source, no target, no a, no b
      { id: 'lnk_bad_2', a: { /* no key */ }, b: { /* no key */ } },
      { id: 'lnk_bad_3', source: { /* no key */ } },
      'not-an-object',
      null,
    ];
    localStorage.setItem('vot-links', JSON.stringify(malformed));

    const loaded = LinkStore.all();

    expect(loaded.length).toBe(0);
  });

  it('preserves a record with one valid endpoint and one missing — dropped (both keys required)', () => {
    // Both source.key AND target.key must be present. Loose: if only
    // one is set, drop. The header (line 110) calls this out explicitly.
    const oneEndpoint = {
      id: 'lnk_one_endpoint',
      source: { type: 'bible', key: 'bible:john:1:1', label: 'John 1:1' },
      // no target
      created: 1700000000004,
    };
    localStorage.setItem('vot-links', JSON.stringify([oneEndpoint]));

    expect(LinkStore.all().length).toBe(0);
  });

  it('is idempotent — loading after migration is a no-op', () => {
    const legacy = {
      id: 'lnk_idempotent',
      a: { type: 'bible', key: 'bible:genesis:1:1', label: 'Gen 1:1' },
      b: { type: 'letter', key: 'letter:foo:0', label: 'Foo' },
      created: 1700000000005,
    };
    localStorage.setItem('vot-links', JSON.stringify([legacy]));

    // First load — migrates and writes back.
    const first = LinkStore.all();
    const firstSerialized = JSON.stringify(first);

    // Bust the cache to force a re-load from localStorage.
    LinkStore._resetForTests();

    // Second load — should produce identical output (no double-migration).
    const second = LinkStore.all();

    expect(JSON.stringify(second)).toBe(firstSerialized);
    expect(asAny(second[0]).a).toBeUndefined();
    expect(second[0].source).toEqual(legacy.a);
  });

  it('handles a mixed batch — legacy + modern + half-migrated + malformed', () => {
    const mixed = [
      // Modern
      {
        id: 'lnk_mixed_modern',
        source: { type: 'bible', key: 'bible:psalms:1:1', label: 'Ps 1:1' },
        target: { type: 'letter', key: 'letter:a:0', label: 'A' },
        created: 1,
      },
      // Pure legacy
      {
        id: 'lnk_mixed_legacy',
        a: { type: 'bible', key: 'bible:psalms:2:1', label: 'Ps 2:1' },
        b: { type: 'letter', key: 'letter:b:0', label: 'B' },
        created: 2,
      },
      // Half-migrated
      {
        id: 'lnk_mixed_half',
        source: { type: 'bible', key: 'bible:psalms:3:1', label: 'Ps 3:1' },
        a: { type: 'bible', key: 'bible:psalms:3:1', label: 'Ps 3:1' },
        target: { type: 'letter', key: 'letter:c:0', label: 'C' },
        created: 3,
      },
      // Malformed (no keys)
      { id: 'lnk_mixed_bad' },
    ];
    localStorage.setItem('vot-links', JSON.stringify(mixed));

    const loaded = LinkStore.all();

    expect(loaded.length).toBe(3);  // malformed dropped
    expect(loaded.map(l => l.id).sort()).toEqual([
      'lnk_mixed_half',
      'lnk_mixed_legacy',
      'lnk_mixed_modern',
    ]);
    for (const l of loaded) {
      expect(l.source.key).toBeTruthy();
      expect(l.target.key).toBeTruthy();
      expect(asAny(l).a).toBeUndefined();
      expect(asAny(l).b).toBeUndefined();
    }
  });

  it('migration persists to localStorage (next session sees clean data)', () => {
    const legacy = {
      id: 'lnk_persist',
      a: { type: 'bible', key: 'bible:genesis:1:1', label: 'Gen 1:1' },
      b: { type: 'letter', key: 'letter:x:0', label: 'X' },
      created: 1700000000099,
    };
    localStorage.setItem('vot-links', JSON.stringify([legacy]));

    LinkStore.all();  // trigger migration

    const rawAfter = JSON.parse(localStorage.getItem('vot-links') || '[]');
    expect(rawAfter.length).toBe(1);
    expect(rawAfter[0].source).toBeDefined();
    expect(rawAfter[0].target).toBeDefined();
    expect(asAny(rawAfter[0]).a).toBeUndefined();
    expect(asAny(rawAfter[0]).b).toBeUndefined();
  });
});

describe('LinkStore — persistLink dedup contract', () => {
  it('returns the new link on first persist', () => {
    const source = ep({ type: 'bible', key: 'bible:gen:1:1', label: 'Gen 1:1' });
    const target = ep({ type: 'letter', key: 'letter:foo:0', label: 'Foo' });

    const link = persistLink(source, target);

    expect(link).not.toBeNull();
    expect(link.source.key).toBe('bible:gen:1:1');
    expect(link.target.key).toBe('letter:foo:0');
    expect(LinkStore.all().length).toBe(1);
  });

  it('returns the existing link on duplicate persist (no second record)', () => {
    const source = ep({ type: 'bible', key: 'bible:gen:1:1', label: 'Gen 1:1' });
    const target = ep({ type: 'letter', key: 'letter:foo:0', label: 'Foo' });

    const first = persistLink(source, target);
    const second = persistLink(source, target);

    expect(second).toEqual(first);  // same record returned
    expect(LinkStore.all().length).toBe(1);
  });

  it('dedups bidirectionally — A→B and B→A are the same link', () => {
    const a = ep({ type: 'bible', key: 'bible:gen:1:1', label: 'Gen 1:1' });
    const b = ep({ type: 'letter', key: 'letter:foo:0', label: 'Foo' });

    const forward = persistLink(a, b);
    const reverse = persistLink(b, a);

    // The first (forward) link is returned — both sides see the same record.
    expect(reverse.id).toBe(forward.id);
    expect(LinkStore.all().length).toBe(1);
  });

  it('returns null when source has no key', () => {
    const link = persistLink(ep({ type: 'bible', label: 'oops no key' }), ep({ type: 'letter', key: 'k', label: 'L' }));
    expect(link).toBeNull();
    expect(LinkStore.all().length).toBe(0);
  });

  it('returns null when source is null/undefined', () => {
    expect(persistLink(null, ep({ type: 'letter', key: 'k', label: 'L' }))).toBeNull();
    expect(persistLink(undefined, ep({ type: 'letter', key: 'k', label: 'L' }))).toBeNull();
  });
});

describe('LinkStore — id generators', () => {
  it('hlId returns a unique string each call', () => {
    const a = hlId();
    const b = hlId();
    expect(a).toMatch(/^hl_\d+_[a-z0-9]+$/);
    expect(a).not.toBe(b);
  });

  it('lnkId returns a unique string each call', () => {
    const a = lnkId();
    const b = lnkId();
    expect(a).toMatch(/^lnk_\d+_[a-z0-9]+$/);
    expect(a).not.toBe(b);
  });
});
