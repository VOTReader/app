/* v2's ... menu (D6): what opens it, what closes it, where focus goes, how keys move. */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { Menu } from './Menu.jsx';

const key = (el, k) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const press = (el) => act(() => { el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })); });

/** A ... button and its menu: Save, a disabled item, two radios. */
function Harness({ focusFirst = true }) {
  const [open, setOpen] = React.useState(false);
  const anchor = React.useRef(/** @type {HTMLButtonElement | null} */ (null));
  return (
    <div className="panel anc">
      <button ref={anchor} type="button" aria-label="More" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>⋮</button>
      <p className="outside">Text</p>
      <div className="scroller" />
      {open && (
        <Menu label="More" anchorRef={anchor} onClose={() => setOpen(false)} className="np" focusFirst={focusFirst}>
          <button type="button" role="menuitem" tabIndex={-1}>Save</button>
          <button type="button" role="menuitem" tabIndex={-1} disabled>Not now</button>
          <span className="label">Voice</span>
          <button type="button" role="menuitemradio" aria-checked tabIndex={-1}>Benjamin</button>
          <button type="button" role="menuitemradio" aria-checked={false} tabIndex={-1}>Text-to-speech</button>
        </Menu>
      )}
    </div>
  );
}

afterEach(cleanup);

describe('Menu (D6)', () => {
  it('a role=menu with its label and zone; the first item takes focus; arrows, Home and End move over enabled items, wrapping', () => {
    const { container: c } = render(<Harness />);
    click(c.querySelector('[aria-label="More"]'));
    const menu = c.querySelector('.menu.np');
    expect([menu.getAttribute('role'), menu.getAttribute('aria-label'), menu.getAttribute('data-zone')]).toEqual(['menu', 'More', 'menu']);
    const names = () => document.activeElement.textContent;
    expect(names()).toBe('Save');
    key(document.activeElement, 'ArrowDown');
    expect(names()).toBe('Benjamin');
    key(document.activeElement, 'ArrowDown');
    expect(names()).toBe('Text-to-speech');
    key(document.activeElement, 'ArrowDown');
    expect(names()).toBe('Save');
    key(document.activeElement, 'ArrowUp');
    expect(names()).toBe('Text-to-speech');
    key(document.activeElement, 'Home');
    expect(names()).toBe('Save');
    key(document.activeElement, 'End');
    expect(names()).toBe('Text-to-speech');
  });

  it('Escape closes it and hands focus back to its button; so does a second click on the button', () => {
    const { container: c } = render(<Harness />);
    const more = c.querySelector('[aria-label="More"]');
    click(more);
    key(document.activeElement, 'Escape');
    expect(c.querySelector('.menu')).toBeNull();
    expect(document.activeElement).toBe(more);
    click(more);
    press(more);
    expect(c.querySelector('.menu')).not.toBeNull();
    click(more);
    expect(c.querySelector('.menu')).toBeNull();
  });

  it('a press outside, a scroll outside, a resize or Tab closes it; a press or scroll inside does not', () => {
    const { container: c } = render(<Harness />);
    const more = c.querySelector('[aria-label="More"]');
    click(more);
    press(c.querySelector('.menu [role="menuitem"]'));
    act(() => { c.querySelector('.menu').dispatchEvent(new Event('scroll')); });
    expect(c.querySelector('.menu')).not.toBeNull();
    press(c.querySelector('.outside'));
    expect(c.querySelector('.menu')).toBeNull();
    click(more);
    act(() => { c.querySelector('.scroller').dispatchEvent(new Event('scroll')); });
    expect(c.querySelector('.menu')).toBeNull();
    click(more);
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(c.querySelector('.menu')).toBeNull();
    click(more);
    key(document.activeElement, 'Tab');
    expect(c.querySelector('.menu')).toBeNull();
  });

  it('focusFirst false leaves focus where it was; ArrowDown then starts at the first item', () => {
    const { container: c } = render(<Harness focusFirst={false} />);
    const more = /** @type {HTMLElement} */ (c.querySelector('[aria-label="More"]'));
    more.focus();
    click(more);
    expect(document.activeElement).toBe(more);
    key(c.querySelector('.menu'), 'ArrowDown');
    expect(document.activeElement.textContent).toBe('Save');
  });
});
