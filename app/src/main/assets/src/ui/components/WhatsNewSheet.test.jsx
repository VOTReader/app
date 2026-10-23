/* up1: the plain list behind "Updated · What's new" opens on the window event and closes. */
import { it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { WhatsNewSheet } from './WhatsNewSheet.jsx';
import { OPEN_EVENT } from '../../utils/whats-new.js';

beforeEach(() => { /** @type {any} */ (globalThis).ReactDOM = ReactDOM; });
afterEach(() => { cleanup(); });

const at = (s) => new Date(s + 'T12:00:00').getTime();

it('opens with the changes by day, and an empty list says so', () => {
  render(<WhatsNewSheet />);
  expect(document.querySelector('.whats-new-sheet'), 'nothing in the page until asked').toBeNull();
  act(() => { window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { items: [
    { t: at('2026-10-23'), text: 'Build your own reading plan.' },
    { t: at('2026-10-22'), text: 'The daily reminder.' },
  ] } })); });
  const sheet = document.querySelector('.whats-new-sheet');
  expect(sheet.classList.contains('open')).toBe(true);
  expect(sheet.getAttribute('aria-label')).toBe("What's new");
  expect([...document.querySelectorAll('.whats-new-day')].map((h) => h.textContent)).toEqual(['October 23', 'October 22']);
  expect(screen.getByText('Build your own reading plan.')).toBeTruthy();
  act(() => { window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { items: [] } })); });
  expect(screen.getByText('Nothing new to tell yet.')).toBeTruthy();
});
