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
});
