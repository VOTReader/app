/* My Web's words (w3, the My Web stream, 2026-10-18; spec Q8 and r2-05):
   the header "N links · M from Timothy’s notes", the skipped line (item 27),
   and the legend's two families. RED first: none of the three existed. */
import { describe, it, expect } from 'vitest';
import { myWebHeadline, myWebSkippedLine, myWebLegendWords } from './describe.js';

describe('My Web header, skipped line and legend words', () => {
  it('counts the reader\u2019s links and Timothy\u2019s threads in one sentence-case line', () => {
    expect(myWebHeadline(25, 2095)).toBe('25 links · 2,095 from Timothy\u2019s notes');
    expect(myWebHeadline(1, 2648)).toBe('1 link · 2,648 from Timothy\u2019s notes');
    expect(myWebHeadline(3, 0)).toBe('3 links');
  });
  it('with no links it invites instead of counting to zero (R3)', () => {
    const s = myWebHeadline(0, 2648);
    expect(s).not.toMatch(/\d/);
    expect(s).toMatch(/\bLink\b/);
  });
  it('says how many links are not on the web, and nothing when all are (item 27)', () => {
    expect(myWebSkippedLine(0)).toBe('');
    expect(myWebSkippedLine(1)).toBe('1 link isn\u2019t on the web yet');
    expect(myWebSkippedLine(4)).toBe('4 links aren\u2019t on the web yet');
  });
  it('names the two families the picture draws', () => {
    expect(myWebLegendWords()).toEqual({ timothy: 'Timothy\u2019s notes', yours: 'your links' });
  });
});
