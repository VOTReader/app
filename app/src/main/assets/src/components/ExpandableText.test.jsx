/* ExpandableText — the collapsed preview cut (sweep low, mw9).
   The cut sliced UTF-16 code units, so a threshold landing inside an emoji left half of it (a lone
   surrogate, drawn as a replacement glyph) before the ellipsis. */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { ExpandableText } from './ExpandableText.jsx';

afterEach(cleanup);

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const TAIL = ' and the words that run on past the cut';

describe('ExpandableText — collapsed preview', () => {
  it('a cut inside an emoji drops the whole emoji, never half of it', () => {
    const { container } = render(<ExpandableText text={'a'.repeat(9) + '\u{1F600}' + TAIL} threshold={10} />);
    const shown = container.textContent;
    expect(LONE_SURROGATE.test(shown)).toBe(false);
    expect(shown.startsWith('a'.repeat(9) + '…')).toBe(true);
  });

  it('a cut just after an emoji keeps it', () => {
    const { container } = render(<ExpandableText text={'a'.repeat(9) + '\u{1F600}' + TAIL} threshold={11} />);
    expect(container.textContent.startsWith('a'.repeat(9) + '\u{1F600}…')).toBe(true);
  });

  it('short text renders whole, with no toggle', () => {
    const { container } = render(<ExpandableText text={'short \u{1F600}'} threshold={10} />);
    expect(container.textContent).toBe('short \u{1F600}');
    expect(container.querySelector('button')).toBeNull();
  });
});

/** Any interactive element inside another (axe nested-interactive). */
const nestedInteractive = (root) => root.querySelectorAll(
  'button button, button [role="button"], [role="button"] button, [role="button"] [role="button"], '
  + 'button [tabindex="0"], [role="button"] [tabindex="0"]').length;

// Sweep v047: whole-text mode (renderText / bodyProps) keeps the whole text in the body and clamps it, so the
// toggle is offered only when the clamp hides something. jsdom lays nothing out (both heights are 0).
describe('ExpandableText — whole-text mode', () => {
  it('draws through renderText into the bodyProps element, and offers no toggle when nothing is clipped', () => {
    const text = 'word '.repeat(80);
    const { container } = render(
      <ExpandableText text={text} threshold={40} bodyProps={{ 'data-hl-key': 'k' }} renderText={(t) => <b>{t}</b>} />
    );
    const body = container.querySelector('[data-hl-key="k"]');
    expect(body.querySelector('b').textContent).toBe(text);
    expect(container.querySelector('button')).toBeNull();
  });
});

// Sweep low (mw10): with tapToToggle the wrapper was role=button around the real Show more button.
describe('ExpandableText — tapToToggle', () => {
  it('has one control, the Show more button, which says whether the text is expanded; a tap anywhere still toggles', () => {
    const { container } = render(<ExpandableText text={'word '.repeat(80)} threshold={40} tapToToggle={true} />);
    const wrap = /** @type {HTMLElement} */ (container.firstChild);
    expect(wrap.getAttribute('role')).toBeNull();
    expect(wrap.hasAttribute('tabindex')).toBe(false);
    expect(nestedInteractive(container)).toBe(0);
    const btn = container.querySelector('button');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(wrap);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });
});
