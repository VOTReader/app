/* What I've read on a spread-out plan: its empty days (nothing to read, so "done") were listed as "Read before the
   start". Ruth's 4 chapters over 7 days hold readings on days 1, 3, 5 and 7. */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { newRun, tickItem } from '../../data/plan-engine.js';
import { PlanSchedule } from './PlanSchedule.jsx';

const at = (s, h = 9) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, h); };
afterEach(cleanup);

describe('What I\'ve read on a spread-out plan', () => {
  it('lists the days read, never an empty day as "Read before the start"', () => {
    let run = newRun({ plan: 'custom', tracks: [{ kind: 'bible', by: 'count', items: [1, 2, 3, 4].map((c) => ({ k: 'ruth:' + c, w: 600 })) }], pace: { mode: 'days', n: 7 } }, at('2026-11-23'));
    run = tickItem(run, 'ruth:1', '2026-11-24', 1);
    const { container } = render(<PlanSchedule run={run} now={at('2026-11-26')} tab="read" onRead={() => {}} />);
    expect(container.textContent).not.toContain('Read before the start');
    expect(container.textContent).toContain('Tue Nov 24');
  });
});
