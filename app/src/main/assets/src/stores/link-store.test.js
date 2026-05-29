/* W7.1 — LinkStore._normalize malformed-record guard.
   ───────────────────────────────────────────────────
   The legacy {a,b} → {source,target} conversion was RETIRED in W7.1: live
   data is already in the {source,target} shape, and future shape changes go
   through the CachedStore versioned-migration framework, not an ad-hoc
   one-shot. What survives is the real-data guard — _normalize drops malformed
   records (any non-object, or any link missing a source.key / target.key). An
   ancient {a,b}-only record that surfaced via an old import now lacks
   source/target keys and is simply dropped.

   No mocks (per [[dont-over-mock]]) — real LinkStore + jsdom localStorage.
*/

import { describe, it, expect, beforeEach } from 'vitest';
import { LinkStore, persistLink, lnkId, hlId } from './link-store.js';

// Build a typed endpoint for persistLink — coerces the literal so
// `type: 'bible'` narrows to the LinkEndpoint union instead of widening to
// string. Pure type-level coercion at the call site.
/** @param {any} x @returns {import('./link-store.js').LinkEndpoint} */
const ep = (x) => /** @type {any} */ (x);

beforeEach(() => {
  localStorage.clear();
  LinkStore._resetForTests({ forceLoaded: true });
});

describe('LinkStore._normalize — malformed-record guard', () => {
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
    expect(loaded[0]).toEqual(modern);  // strict equality on full shape — guard never mutates valid records
  });

  it('drops a legacy {a, b}-only record (conversion retired — no source/target keys)', () => {
    const legacy = {
      id: 'lnk_legacy',
      a: { type: 'bible', key: 'bible:genesis:1:1', label: 'Gen 1:1' },
      b: { type: 'letter', key: 'letter:the-wide-path:0', label: 'The Wide Path' },
      created: 1700000000000,
    };
    localStorage.setItem('vot-links', JSON.stringify([legacy]));

    // No source/target keys → malformed → dropped. Pre-W7.1 this was
    // converted; the conversion is gone.
    expect(LinkStore.all().length).toBe(0);
  });

  it('keeps a valid record even if it carries stray legacy a/b fields', () => {
    // A record with valid endpoints AND leftover a/b is still valid — a/b are
    // ignored downstream (clean data never has them); the guard only drops on
    // a missing source.key / target.key.
    const withStray = {
      id: 'lnk_stray',
      source: { type: 'bible', key: 'bible:psalms:23:1', label: 'Ps 23:1' },
      target: { type: 'letter', key: 'letter:still-waters:0', label: 'Still Waters' },
      a: { type: 'bible', key: 'bible:psalms:23:1' },
      created: 1700000000002,
    };
    localStorage.setItem('vot-links', JSON.stringify([withStray]));

    const loaded = LinkStore.all();
    expect(loaded.length).toBe(1);
    expect(loaded[0].source.key).toBe('bible:psalms:23:1');
    expect(loaded[0].target.key).toBe('letter:still-waters:0');
  });

  it('drops records missing an endpoint key (both sides, or just one)', () => {
    const malformed = [
      { id: 'lnk_bad_1' },                                                    // no endpoints at all
      { id: 'lnk_bad_2', source: { /* no key */ }, target: { /* no key */ } },
      { id: 'lnk_bad_3', source: { type: 'bible', key: 'bible:john:1:1' } },  // target missing
      { id: 'lnk_bad_4', target: { type: 'letter', key: 'letter:x:0' } },     // source missing
      'not-an-object',
      null,
    ];
    localStorage.setItem('vot-links', JSON.stringify(malformed));

    expect(LinkStore.all().length).toBe(0);
  });

  it('persists the pruned list — dropped records do not reappear on reload', () => {
    const mixed = [
      {
        id: 'lnk_good',
        source: { type: 'bible', key: 'bible:psalms:1:1', label: 'Ps 1:1' },
        target: { type: 'letter', key: 'letter:a:0', label: 'A' },
        created: 1,
      },
      { id: 'lnk_bad' },  // malformed → dropped + pruned from storage
    ];
    localStorage.setItem('vot-links', JSON.stringify(mixed));

    const first = LinkStore.all();
    expect(first.length).toBe(1);
    expect(first[0].id).toBe('lnk_good');

    // Reload from storage — the pruned list was persisted, so still 1.
    LinkStore._resetForTests({ forceLoaded: true });
    const second = LinkStore.all();
    expect(second.length).toBe(1);
    expect(second[0].id).toBe('lnk_good');
  });

  it('is idempotent — clean data reloads unchanged', () => {
    const clean = [{
      id: 'lnk_clean',
      source: { type: 'bible', key: 'bible:genesis:1:1', label: 'Gen 1:1' },
      target: { type: 'letter', key: 'letter:foo:0', label: 'Foo' },
      created: 5,
    }];
    localStorage.setItem('vot-links', JSON.stringify(clean));

    const first = JSON.stringify(LinkStore.all());
    LinkStore._resetForTests({ forceLoaded: true });
    const second = JSON.stringify(LinkStore.all());
    expect(second).toBe(first);
  });

  it('handles a mixed batch — valid kept, malformed + legacy dropped', () => {
    const mixed = [
      {
        id: 'lnk_mixed_modern',
        source: { type: 'bible', key: 'bible:psalms:1:1', label: 'Ps 1:1' },
        target: { type: 'letter', key: 'letter:a:0', label: 'A' },
        created: 1,
      },
      {
        id: 'lnk_mixed_modern2',
        source: { type: 'bible', key: 'bible:psalms:2:1', label: 'Ps 2:1' },
        target: { type: 'letter', key: 'letter:b:0', label: 'B' },
        created: 2,
      },
      // {a,b}-only → dropped (conversion retired)
      { id: 'lnk_mixed_legacy', a: { type: 'bible', key: 'bible:psalms:3:1' }, b: { type: 'letter', key: 'letter:c:0' } },
      { id: 'lnk_mixed_bad' },  // malformed → dropped
    ];
    localStorage.setItem('vot-links', JSON.stringify(mixed));

    const loaded = LinkStore.all();
    expect(loaded.length).toBe(2);
    expect(loaded.map(l => l.id).sort()).toEqual(['lnk_mixed_modern', 'lnk_mixed_modern2']);
    for (const l of loaded) {
      expect(l.source.key).toBeTruthy();
      expect(l.target.key).toBeTruthy();
    }
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
