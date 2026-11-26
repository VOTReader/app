// @ts-nocheck - node fs in a source-text test
/* Fix list 42: tapping a locked To read study in Listen pushed a silent Back entry and then did nothing (selectStudy
   refuses a locked study), so the next Back seemed to do nothing. onReadStudy bails on a locked study before it
   pushes anything. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const SRC = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'screen-routes.jsx'), 'utf8');

describe('onReadStudy pushes no Back step for a study it will not open (fix list 42)', () => {
  it('a locked study returns before pushFromLetter', () => {
    const at = SRC.indexOf('onReadStudy={(studyId) => {');
    expect(at).toBeGreaterThan(-1);
    const body = SRC.slice(at, SRC.indexOf('selectStudy(studyId);', at));
    const guard = body.indexOf('s.locked');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(body.indexOf('pushFromLetter('));
  });
});
