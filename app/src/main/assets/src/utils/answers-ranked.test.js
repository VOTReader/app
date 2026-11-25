// @ts-nocheck
/* answers-ranked — the Answers box ranked by the main engine (search200 h8): the engine's order, each topic
   opening on the paragraph its excerpt lands in, answersSearch's counts and source line, and the box's own
   groups whenever the engine cannot answer. The engine is a stub here; tools/answers-questions/score.mjs runs
   the real one on every title and heading. */
import { describe, it, expect, vi } from 'vitest';
import { buildAnswersIndex, answersPlainText } from './answers-search.js';
import { answersEngineReady, answersRankedSearch } from './answers-ranked.js';

const topic = (id, title, paragraphs) => ({ id, title, paragraphs: paragraphs.map((text) => ({ align: 'justify', text })) });
const FIXTURE = [
  topic('regarding-prayer', 'Regarding Prayer', [
    '_1/2/10_ **_From The Lord, Our God and Savior_**\n_The Word of The Lord Spoken to Timothy_',
    '"Pray without ceasing, for the Lord hears the _humble_ prayer."',
    '~ [From “Prayer” ~ Volume 1]',
    '✦',
    '"Watch and pray; be ready, for the hour is near."',
    '~ [From “Watch” ~ Volume 2]',
  ]),
  topic('regarding-pride', 'Regarding Pride', [
    '"The **pride** of man is a stone of stumbling; they will not pray."',
    '~ [From “Pride” ~ Volume 3]',
  ]),
  topic('regarding-patience', 'Regarding Patience', [
    '"Wait upon Me in patience, and the hour shall come."',
    '~ [From “Wait” ~ Volume 4]',
  ]),
  // A page of prose: no attribution lines, so no passages — its level-1 sections file it.
  topic('regarding-false-doctrines', 'Regarding False Doctrines', [
    '"Many false doctrines abound in the churches of men."',
    '"Test every spirit, for not every spirit is from God."',
  ]),
];
const INDEX = buildAnswersIndex(FIXTURE);
/** The doc the engine indexes for a topic: its paragraphs' words in one run. */
const docOf = (e, volumeId = 'answers') => ({ kind: 'answers', volumeId, letterId: e.id, title: e.title,
  text: e.paragraphs.map((p) => answersPlainText(p.text)).join(' ') });
const byId = (id) => FIXTURE.find((e) => e.id === id);
/** A stub engine returning these hits in this order; matchExcerpt cuts 48 chars from the first typed word. */
function engine(hits, extra = {}) {
  return {
    isCurrent: () => true,
    search: vi.fn(async () => ({ results: hits, parsedTerms: [] })),
    matchExcerpt: (text, terms) => {
      const low = text.toLowerCase();
      const at = Math.min(...terms.map((t) => low.indexOf(t)).filter((i) => i >= 0));
      return Number.isFinite(at) ? text.slice(at, at + 48) : '';
    },
    ...extra,
  };
}
/** The prose page's sidecar sections: two to file under, one trumpet call, one subhead. */
const PROSE_SECTIONS = [
  { level: 1, at: 0, title: 'The Churches' },
  { level: 1, at: 1, title: 'Later Days' },
  { level: 1, at: 0, title: 'Be a Part of The Trumpet Call: Join Us' },
  { level: 2, at: 0, title: 'A Subhead' },
];
const proseSections = (id) => (id === 'regarding-false-doctrines' ? PROSE_SECTIONS : null);

describe('answersEngineReady', () => {
  it('only an engine whose index is current for the data loaded', () => {
    expect(answersEngineReady(undefined)).toBe(false);
    expect(answersEngineReady({ search() {} })).toBe(false);
    expect(answersEngineReady({ search() {}, isCurrent: () => false })).toBe(false);
    expect(answersEngineReady({ search() {}, isCurrent: () => { throw new Error('x'); } })).toBe(false);
    expect(answersEngineReady({ search() {}, isCurrent: () => true })).toBe(true);
  });
});

describe('answersRankedSearch', () => {
  it('keeps the engine\'s order, once per topic, Answers only, and asks it kept to the collection', async () => {
    const E = engine([
      { doc: docOf(byId('regarding-patience')), terms: ['hour'] },
      { doc: docOf(byId('regarding-prayer'), 'v2'), terms: ['hour'] },
      { doc: docOf(byId('regarding-prayer')), terms: ['hour'] },
      { doc: docOf(byId('regarding-patience')), terms: ['hour'] },
    ]);
    const r = await answersRankedSearch(E, INDEX, 'what does god say about the hour');
    expect(r.groups.map((g) => g.entry.id)).toEqual(['regarding-patience', 'regarding-prayer']);
    expect(r.ranked).toBe(true);
    expect(r.words).toEqual(['hour']);
    const [q, o] = E.search.mock.calls[0];
    expect(q).toBe('what does god say about the hour');
    expect(o.scope).toEqual({ volumeId: 'answers' });
    expect(o.translation).toBeUndefined();
  });

  it('opens a topic on the paragraph its excerpt lands in, with that passage\'s source line', async () => {
    const r = await answersRankedSearch(engine([{ doc: docOf(byId('regarding-prayer')), terms: ['hour'] }]), INDEX, 'hour is near');
    const g = r.groups[0];
    expect(g.first.index).toBe(4);
    expect(g.first.src).toBe(5);
    // the box's counts where every word holds: "1 of 2 passages"
    expect([g.n, g.total, g.titleHit]).toEqual([1, 2, false]);
    expect(r.matches).toBe(1);
  });

  it('a place the engine names lands there; its very start opens the topic at the top', async () => {
    const e = byId('regarding-prayer');
    const d = docOf(e);
    const at = d.text.indexOf('Watch and pray');
    const r = await answersRankedSearch(engine([{ doc: d, terms: [], placeStart: at }]), INDEX, 'keep watch');
    expect(r.groups[0].first.index).toBe(4);
    const top = await answersRankedSearch(engine([{ doc: d, terms: [], placeStart: 0 }]), INDEX, 'regarding prayer');
    expect(top.groups[0].first).toBeNull();
    expect(top.groups[0].titleHit).toBe(true);
  });

  it('a topic found by meaning alone counts no passage and is not called a title match', async () => {
    const r = await answersRankedSearch(engine([{ doc: docOf(byId('regarding-pride')), terms: [] }]), INDEX, 'arrogance');
    expect([r.groups[0].n, r.groups[0].titleHit, r.groups[0].first]).toEqual([0, false, null]);
    expect(r.matches).toBe(0);
  });

  it('null when the engine cannot answer: an error, a search called off, a query too short', async () => {
    expect(await answersRankedSearch(engine([], { search: async () => ({ results: [], error: 'x' }) }), INDEX, 'pray')).toBeNull();
    expect(await answersRankedSearch(engine([], { search: async () => ({ results: [], aborted: true }) }), INDEX, 'pray')).toBeNull();
    const ctl = new AbortController();
    ctl.abort();
    expect(await answersRankedSearch(engine([{ doc: docOf(byId('regarding-pride')) }]), INDEX, 'pray', { signal: ctl.signal })).toBeNull();
    expect(await answersRankedSearch(engine([]), INDEX, 'p')).toBeNull();
  });

  it('a page of prose files its hit under its level-1 sections, trumpet call and subheads aside', async () => {
    const r = await answersRankedSearch(engine([{ doc: docOf(byId('regarding-false-doctrines')), terms: ['false', 'doctrines'] }]), INDEX, 'false doctrines', { sections: proseSections });
    const g = r.groups[0];
    expect(g.prose).toBe(true);
    expect([g.n, g.total, g.titleHit]).toEqual([1, 2, true]);
    expect(g.first).toEqual({ index: 0, src: -1, date: '', sec: 'The Churches' });
  });

  it('a prose hit the box does not count still files under its sections, with no passages to count', async () => {
    const r = await answersRankedSearch(engine([{ doc: docOf(byId('regarding-false-doctrines')), terms: ['false', 'spirits'] }]), INDEX, 'false spirits', { sections: proseSections });
    const g = r.groups[0];
    expect([g.n, g.total, g.titleHit]).toEqual([0, 0, false]);
    expect(g.first).toEqual({ index: 0, src: -1, date: '', sec: 'The Churches' });
  });

  it('a prose page with no sections to file under names no section', async () => {
    const hit = { doc: docOf(byId('regarding-false-doctrines')), terms: ['false', 'doctrines'] };
    const bare = await answersRankedSearch(engine([hit]), INDEX, 'false doctrines');
    expect(bare.groups[0].first).toEqual({ index: 0, src: -1, date: '', sec: '' });
    const nulled = await answersRankedSearch(engine([hit]), INDEX, 'false doctrines', { sections: () => null });
    expect(nulled.groups[0].first).toEqual({ index: 0, src: -1, date: '', sec: '' });
  });

  it('a hit with no terms still lands on the typed words; a textless doc with no excerpt matcher lands nowhere', async () => {
    const r = await answersRankedSearch(engine([{ doc: docOf(byId('regarding-prayer')) }]), INDEX, 'hour is near');
    expect(r.groups[0].first.index).toBe(4);
    const E = engine([{ doc: { kind: 'answers', volumeId: 'answers', letterId: 'regarding-prayer' } }], { matchExcerpt: undefined });
    const t = await answersRankedSearch(E, INDEX, 'hour is near');
    expect(t.groups[0].first).toBeNull();
  });

  it('a wordless query, a null query, and a null index', async () => {
    // '!!!' folds to no words: the box has nothing to say, the engine's hit still lands.
    const r = await answersRankedSearch(engine([{ doc: docOf(byId('regarding-prayer')), terms: ['hour'] }]), INDEX, '!!!');
    expect(r.words).toEqual([]);
    expect([r.groups[0].n, r.groups[0].total]).toEqual([0, 2]);
    expect(r.groups[0].first.index).toBe(4);
    expect(await answersRankedSearch(engine([]), INDEX, null)).toBeNull();
    expect(await answersRankedSearch(engine([]), INDEX, '')).toBeNull();
    const nulled = await answersRankedSearch(engine([{ doc: docOf(byId('regarding-prayer')), terms: ['hour'] }]), null, 'hour is near');
    expect(nulled.groups).toEqual([]);
    expect(nulled.matches).toBe(0);
  });

  it('a question of only question words still searches on them', async () => {
    const r = await answersRankedSearch(engine([{ doc: docOf(byId('regarding-prayer')), terms: ['hour'] }]), INDEX, 'what does god say about');
    expect(r.words).toEqual(['what', 'does', 'god', 'say', 'about']);
    expect(r.groups[0].first.index).toBe(0);
  });

  it('an engine answer with no results, and a hit for a topic not in the index, file nothing', async () => {
    const empty = await answersRankedSearch(engine([], { search: async () => ({}) }), INDEX, 'pray');
    expect(empty.groups).toEqual([]);
    const ghost = await answersRankedSearch(engine([{ doc: { ...docOf(byId('regarding-prayer')), letterId: 'no-such-topic' }, terms: ['hour'] }]), INDEX, 'hour is near');
    expect(ghost.groups).toEqual([]);
  });

  it('a pos the caller supplies is kept, unless it is not a number', async () => {
    const E = engine([{ doc: docOf(byId('regarding-prayer')), terms: ['hour'] }]);
    const r = await answersRankedSearch(E, INDEX, 'hour is near', { pos: () => Infinity });
    expect(r.groups[0].pos).toBe(1e6);
    const placed = await answersRankedSearch(E, INDEX, 'hour is near', { pos: (id) => (id === 'regarding-prayer' ? 7 : 0) });
    expect(placed.groups[0].pos).toBe(7);
  });

  it('a landing on the dated header — a paragraph no passage holds — has no source line', async () => {
    const e = byId('regarding-prayer');
    const d = docOf(e);
    const at = d.text.indexOf('From The Lord');
    const r = await answersRankedSearch(engine([{ doc: d, terms: [], placeStart: at }]), INDEX, 'keep watch');
    expect(r.groups[0].first).toEqual({ index: 0, src: -1, date: '', sec: '' });
  });

  it('when the first excerpt cut misses, the engine is asked again with its own terms added', async () => {
    let calls = 0;
    const cut = (text, terms) => {
      const low = text.toLowerCase();
      const at = Math.min(...terms.map((t) => low.indexOf(t)).filter((i) => i >= 0));
      return Number.isFinite(at) ? text.slice(at, at + 48) : '';
    };
    const E = engine([{ doc: docOf(byId('regarding-prayer')), terms: ['watch'] }], {
      matchExcerpt: (text, terms) => (calls++ === 0 ? '' : cut(text, terms)),
    });
    const r = await answersRankedSearch(E, INDEX, 'hour is near');
    expect(calls).toBe(2);
    expect(r.groups[0].first.index).toBe(4);
  });

  it('an index entry with no paragraphs to land in opens nowhere', async () => {
    // buildAnswersIndex never emits one — the guard is defensive, so the index is hand-built.
    const bare = [{ entry: { id: 'no-paras', title: 'No Paras' }, prose: false, passages: [] }];
    const r = await answersRankedSearch(
      engine([{ doc: { kind: 'answers', volumeId: 'answers', letterId: 'no-paras', text: 'hour by hour' }, terms: ['hour'] }]),
      bare, 'hour is near');
    expect(r.groups[0].entry.id).toBe('no-paras');
    expect(r.groups[0].first).toBeNull();
  });
});
