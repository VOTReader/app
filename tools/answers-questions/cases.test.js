/* The Answers question set (build.mjs) stays what the corpus builds: a corpus refresh that renames a topic or a
   heading shows up here, and `node tools/answers-questions/build.mjs` writes it anew. The scores themselves are a
   bench (npm run bench:answers, floor.json): the engine and its meaning model are too heavy for a unit run. */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

describe('answers question set', () => {
  it('cases.json is what build.mjs makes from the corpus', () => {
    const out = execFileSync(process.execPath, [resolve(HERE, 'build.mjs'), '--check'], { encoding: 'utf8' });
    expect(out).toMatch(/cases\.json current/);
  }, 20000);

  it('every title has its three phrasings at most, every heading case names the section it lands in', () => {
    const { cases } = JSON.parse(readFileSync(resolve(HERE, 'cases.json'), 'utf8'));
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    for (const c of cases) {
      expect(['title', 'section']).toContain(c.kind);
      expect(c.q.length).toBeGreaterThanOrEqual(2);
      if (c.kind === 'section') for (const t of c.targets) expect(t.to).toBeGreaterThan(t.from);
    }
    const floor = JSON.parse(readFileSync(resolve(HERE, 'floor.json'), 'utf8'));
    for (const [shape, f] of Object.entries(floor.shapes)) expect(f.top3).toBeGreaterThanOrEqual(f.top1, shape);
  });
});
