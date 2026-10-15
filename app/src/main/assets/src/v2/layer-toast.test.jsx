/* LayerToast (Sheet.jsx): the words alone ("Copied"), with a kit icon before them (9c's cloudOff), and with the toast's
   own button at the end (4c's "OK"); nothing when there are no words. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { LayerToast } from './Sheet.jsx';

afterEach(cleanup);

describe('LayerToast', () => {
  it('draws the words in the kit toast; nothing for empty words', () => {
    const { container, rerender } = render(<LayerToast text="Copied" />);
    expect(container.querySelector('.toast-wrap[role="status"] .toast').textContent).toBe('Copied');
    expect(container.querySelector('.toast .v2i')).toBe(null);
    expect(container.querySelector('.toast .act')).toBe(null);
    rerender(<LayerToast text={null} />);
    expect(container.querySelector('.toast-wrap')).toBe(null);
  });

  it('an icon goes before the words, an action button after them', () => {
    const onAct = vi.fn();
    const { container } = render(<LayerToast text="No connection." icon="cloudOff" act="OK" onAct={onAct} />);
    const toast = container.querySelector('.toast');
    expect(toast.firstElementChild.querySelector('svg')).not.toBe(null);
    expect(toast.lastElementChild.textContent).toBe('OK');
    expect(toast.textContent).toBe('No connection.OK');
    fireEvent.click(container.querySelector('.toast .act'));
    expect(onAct).toHaveBeenCalledTimes(1);
  });
});
