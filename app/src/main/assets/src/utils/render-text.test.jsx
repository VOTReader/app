// @ts-nocheck
/* render-text — renderTextWithScripRefs, the tokenizer behind Notes / Bookmark
   card bodies. Its contract has two return shapes (a bare string when there is
   nothing to decorate, else a React tree), and callers rely on both: a bare
   string must stay a string so plain text is not wrapped in extra spans. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { renderTextWithScripRefs } from './render-text.jsx';

afterEach(cleanup);

const mount = (node) => render(<div data-testid="host">{node}</div>).getByTestId('host');

describe('renderTextWithScripRefs — plain text (no refs)', () => {
  it('returns empty / missing text as-is, or an empty span when a class is given', () => {
    expect(renderTextWithScripRefs('')).toBe('');
    expect(renderTextWithScripRefs(null)).toBeNull();
    expect(renderTextWithScripRefs(undefined)).toBeUndefined();
    const host = mount(renderTextWithScripRefs('', 'body'));
    expect(host.innerHTML).toBe('<span class="body"></span>');
  });

  it('returns the bare string when there is nothing to decorate', () => {
    expect(renderTextWithScripRefs('Grace and peace')).toBe('Grace and peace');
  });

  it('wraps plain text in the base class span', () => {
    const host = mount(renderTextWithScripRefs('Grace and peace', 'note-body'));
    expect(host.innerHTML).toBe('<span class="note-body">Grace and peace</span>');
  });

  it('marks a highlight match, with and without the base class', () => {
    let host = mount(renderTextWithScripRefs('Amazing Grace abounds', undefined, null, 'grace'));
    expect(host.querySelector('mark.letter-highlight').textContent).toBe('Grace');
    expect(host.textContent).toBe('Amazing Grace abounds');
    cleanup();
    host = mount(renderTextWithScripRefs('Amazing Grace abounds', 'b', null, 'grace'));
    expect(host.firstElementChild.className).toBe('b');
    expect(host.querySelector('span.b > mark').textContent).toBe('Grace');
  });

  it('a highlight that does not match falls back to the plain shapes', () => {
    expect(renderTextWithScripRefs('Amazing Grace', undefined, null, 'mercy')).toBe('Amazing Grace');
    const host = mount(renderTextWithScripRefs('Amazing Grace', 'b', null, 'mercy'));
    expect(host.innerHTML).toBe('<span class="b">Amazing Grace</span>');
  });
});

describe('renderTextWithScripRefs — {{ref:…}} tokens', () => {
  it('turns each ref into a tappable link that reports the trimmed ref and blocks navigation', () => {
    const onScrip = vi.fn();
    const host = mount(renderTextWithScripRefs('See {{ref: John 3:16 }} and {{ref:Romans 8:28}}.', undefined, onScrip));
    const links = host.querySelectorAll('a.inline-scrip-ref');
    expect(links).toHaveLength(2);
    expect(links[0].textContent).toBe('John 3:16');
    expect(links[0].getAttribute('title')).toBe('John 3:16');
    expect(links[0].getAttribute('href')).toBe('#');
    expect(host.textContent).toBe('See John 3:16 and Romans 8:28.');
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    links[1].dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(onScrip).toHaveBeenCalledWith('Romans 8:28');
  });

  it('a ref tap with no handler is a harmless no-op', () => {
    const host = mount(renderTextWithScripRefs('{{ref:Psalm 23:1}}'));
    expect(() => fireEvent.click(host.querySelector('a'))).not.toThrow();
  });

  it('keeps a verse range with its ASCII hyphen intact', () => {
    const host = mount(renderTextWithScripRefs('{{ref:Exodus 12:18-20}}'));
    expect(host.querySelector('a').textContent).toBe('Exodus 12:18-20');
  });

  it('wraps the text between refs in the base class, skipping empty segments', () => {
    const host = mount(renderTextWithScripRefs('{{ref:Gen 1:1}} then text', 'seg'));
    // a leading ref leaves an empty first segment: it renders nothing
    expect(host.children).toHaveLength(2);
    expect(host.children[0].tagName).toBe('A');
    expect(host.children[1].outerHTML).toBe('<span class="seg"> then text</span>');
  });

  it('without a base class the segments are bare text', () => {
    const host = mount(renderTextWithScripRefs('a {{ref:Gen 1:1}} b'));
    expect(host.querySelectorAll('span')).toHaveLength(0);
    expect(host.textContent).toBe('a Gen 1:1 b');
  });

  it('highlights a match inside the text segments, not inside the link', () => {
    const host = mount(renderTextWithScripRefs('Love one another {{ref:John 13:34}} as I loved', 'seg', null, 'loved'));
    const marks = host.querySelectorAll('mark.letter-highlight');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('loved');
    expect(marks[0].closest('span.seg')).not.toBeNull();
    expect(host.querySelector('a mark')).toBeNull();
  });

  it('a highlight that misses a segment leaves it unchanged', () => {
    const host = mount(renderTextWithScripRefs('alpha {{ref:Gen 1:1}} beta', undefined, null, 'beta'));
    expect(host.querySelectorAll('mark')).toHaveLength(1);
    expect(host.textContent).toBe('alpha Gen 1:1 beta');
  });

  it('an unterminated ref token is left as literal text', () => {
    const host = mount(renderTextWithScripRefs('broken {{ref:John 3:16'));
    expect(host.querySelector('a')).toBeNull();
    expect(host.textContent).toBe('broken {{ref:John 3:16');
  });
});
