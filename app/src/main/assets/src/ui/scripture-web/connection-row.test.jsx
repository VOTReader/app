// @ts-nocheck
/* The one connection row (digest B1: the main screen and the no-WebGL list
   share one component). The panel skin carries the row's actions and lights
   its thread on hover AND keyboard focus (A5); the fallback skin keeps the
   list's own classes, so its theme-aware look is unchanged. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { ConnectionRow } from './connection-row.jsx';

afterEach(cleanup);
const ul = (row) => render(<ul>{row}</ul>);

describe('ConnectionRow', () => {
  it('panel skin: main, Open and Follow each do their own thing', () => {
    const onMain = vi.fn(), onOpen = vi.fn(), onFollow = vi.fn();
    const { container } = ul(<ConnectionRow title="Romans 4:7" tag="182 votes" text="Blessed are those"
      onMain={onMain} mainLabel="Romans 4:7, 182 votes"
      onOpen={onOpen} openLabel="Open in reader: Romans 4:7"
      onFollow={onFollow} followLabel="Follow the line to Romans 4:7" />);
    expect(container.querySelector('li.sw-row .sw-row-main .sw-row-ref').textContent).toBe('Romans 4:7');
    expect(container.querySelector('.sw-row-tag').textContent).toBe('182 votes');
    expect(container.querySelector('.sw-row-text').textContent).toBe('Blessed are those');
    fireEvent.click(screen.getByRole('button', { name: 'Romans 4:7, 182 votes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open in reader: Romans 4:7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Follow the line to Romans 4:7' }));
    expect([onMain.mock.calls.length, onOpen.mock.calls.length, onFollow.mock.calls.length]).toEqual([1, 1, 1]);
  });

  it("a named row keeps its verse as the main button's description (s24.1)", () => {
    ul(<ConnectionRow title="Romans 4:7" text="Blessed are those" onMain={() => {}} mainLabel="Romans 4:7, 182 votes" />);
    const main = screen.getByRole('button', { name: 'Romans 4:7, 182 votes', description: 'Blessed are those' });
    expect(document.getElementById(main.getAttribute('aria-describedby')).textContent).toBe('Blessed are those');
    cleanup();
    ul(<ConnectionRow title="Romans 4:7" onMain={() => {}} mainLabel="Romans 4:7" />);
    expect(screen.getByRole('button', { name: 'Romans 4:7' }).hasAttribute('aria-describedby')).toBe(false);
  });

  it('lights on hover and on keyboard focus, and lets go when focus leaves the row', () => {
    const onLight = vi.fn();
    const { container } = ul(<ConnectionRow title="A" onMain={() => {}} onOpen={() => {}} onLight={onLight} />);
    const li = container.querySelector('li');
    fireEvent.mouseEnter(li);
    fireEvent.mouseLeave(li);
    const [main, open] = container.querySelectorAll('button');
    fireEvent.focus(main);
    // moving focus between the row's own buttons keeps it lit
    fireEvent.blur(main, { relatedTarget: open });
    fireEvent.blur(open, { relatedTarget: document.body });
    expect(onLight.mock.calls.map((c) => c[0])).toEqual([true, false, true, false]);
  });

  it('fallback skin keeps the list\'s classes and has no actions unless given', () => {
    const { container } = ul(<ConnectionRow skin="fallback" title="Genesis 1:1" tag="Famous" text="In the beginning" />);
    expect(container.querySelector('button.swf-row .swf-row-top .swf-ref').textContent).toBe('Genesis 1:1');
    expect(container.querySelector('.swf-tier').textContent).toBe('Famous');
    expect(container.querySelector('.swf-snip').textContent).toBe('In the beginning');
    expect(container.querySelector('.sw-row-actions')).toBeNull();
    expect(container.querySelector('li').className).toBe('');
  });

  it('mainClass adds the hooks a list keeps (the chooser and Nearby rows: .sw-choice-row) to the main button', () => {
    const { container } = ul(<ConnectionRow title="Genesis 1" text="31 verses" mainClass="sw-choice-row sw-choice-chapter" active />);
    const main = container.querySelector('button');
    expect(main.className).toBe('sw-row-main sw-choice-row sw-choice-chapter');
    expect(container.querySelector('li').className).toBe('sw-row is-on');
    cleanup();
    const plain = ul(<ConnectionRow title="Genesis 1" />);
    expect(plain.container.querySelector('button').className).toBe('sw-row-main');
  });
});
