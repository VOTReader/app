/* The UI pass's shared parts (W1, 2026-11-11): each pattern keeps its rule (U rules 12, 14, 15 and the notice style). */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { ListGroup, ListRow, RowPlay, SectionLabel, UiButton, Chip, Segmented, ValueTool, ToolRow, EmptyState, Notice } from './UiParts.jsx';
import { UiIcon, UI_ICONS } from './UiIcon.jsx';

afterEach(cleanup);

describe('the list row (rule 12)', () => {
  it('a row that opens something is one button: icon chip, title, meta, value, chevron', () => {
    const go = vi.fn();
    const { container } = render(<ListGroup label="Yours"><ListRow icon="note" title="Notes" meta="2 notes" value="2" onClick={go} /></ListGroup>);
    const row = container.querySelector('.ui-group > button.ui-row');
    expect(row).not.toBeNull();
    expect(row.querySelector('.ui-row-lead svg[data-icon="note"]')).not.toBeNull();
    expect(row.querySelector('.ui-row-title').textContent).toBe('Notes');
    expect(row.querySelector('.ui-row-meta').textContent).toBe('2 notes');
    expect(row.querySelector('.ui-row-value').textContent).toBe('2');
    expect(row.querySelector('.ui-row-chev')).not.toBeNull();
    fireEvent.click(row); expect(go).toHaveBeenCalledTimes(1);
    expect(container.querySelector('h2.ui-label').textContent).toBe('Yours');
    expect(container.querySelector('.ui-group').getAttribute('aria-labelledby')).toBe(container.querySelector('h2.ui-label').id);
  });

  it('with a menu, the row tap and the menu are two sibling buttons (never nested) and there is no chevron', () => {
    const open = vi.fn(); const menu = vi.fn();
    const { container } = render(<ListRow title="Chosen by God" meta="Volume One · Letter 1" onClick={open} menu={{ label: 'Note options', onClick: menu }} />);
    const btns = container.querySelectorAll('button');
    expect(btns.length).toBe(2);
    expect(container.querySelector('button button')).toBeNull();
    expect(container.querySelector('.ui-row-chev')).toBeNull();
    fireEvent.click(container.querySelector('.ui-row-menu')); expect(menu).toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
    expect(container.querySelector('.ui-row-menu').getAttribute('aria-label')).toBe('Note options');
  });

  it('a state is a mark, not a button; a tick mark is named', () => {
    const { container, rerender } = render(<ListRow icon="dl" title="Volume One" mark={{ label: 'On this phone', icon: 'check' }} />);
    expect(container.querySelector('.ui-row-mark').textContent).toBe('On this phone');
    expect(container.querySelector('button')).toBeNull();
    rerender(<ListRow icon="dl" title="Volume One" mark={{ tick: true, label: 'Read' }} />);
    expect(container.querySelector('.ui-row-mark.is-tick').getAttribute('aria-label')).toBe('Read');
  });

  it('"None yet" greys; a row without a lead says so for the hairline; a play lead is the one other button', () => {
    const play = vi.fn(); const open = vi.fn();
    const { container } = render(<>
      <ListRow noLead title="Journal" value="None yet" valueNone />
      <ListRow lead={<RowPlay label="Play Chosen by God" onClick={play} />} title="Chosen by God" onClick={open} chevron={false} />
    </>);
    expect(container.querySelector('.ui-row-value.is-none').textContent).toBe('None yet');
    expect(container.querySelector('.ui-row.no-lead')).not.toBeNull();
    fireEvent.click(container.querySelector('.ui-row-lead.is-play'));
    expect(play).toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
  });

  it('a section label aside is a muted count, or a gold link with a handler', () => {
    const all = vi.fn();
    const { container } = render(<><SectionLabel aside="3">Saved</SectionLabel><SectionLabel aside="See all" onAside={all}>History</SectionLabel></>);
    expect(container.querySelector('.ui-label-aside').textContent).toBe('3');
    fireEvent.click(container.querySelector('button.ui-link')); expect(all).toHaveBeenCalled();
  });
});

describe('buttons, chips and the segmented control', () => {
  it('the three buttons and a destructive one', () => {
    const { container } = render(<><UiButton kind="primary" icon="play">Play all</UiButton><UiButton>Back up</UiButton><UiButton kind="text">Not now</UiButton><UiButton danger small>Delete note</UiButton></>);
    const [p, s, t, d] = container.querySelectorAll('button');
    expect(p.className).toContain('is-primary'); expect(p.querySelector('svg')).not.toBeNull();
    expect(s.className).toBe('ui-btn');
    expect(t.className).toContain('is-text');
    expect(d.className).toContain('is-danger'); expect(d.className).toContain('is-small');
  });

  it('a chip announces its state', () => {
    const { container } = render(<Chip on onClick={() => {}}>Beatitudes</Chip>);
    expect(container.querySelector('.ui-chip').getAttribute('aria-pressed')).toBe('true');
  });

  it('the segmented control is one radio group; arrows move and pick', () => {
    const pick = vi.fn();
    const { container } = render(<Segmented label="Look" options={[{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }]} value="dark" onChange={pick} />);
    const group = container.querySelector('[role="radiogroup"]');
    expect(group.getAttribute('aria-label')).toBe('Look');
    const radios = container.querySelectorAll('[role="radio"]');
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
    expect(radios[1].getAttribute('tabindex')).toBe('-1');
    fireEvent.keyDown(group, { key: 'ArrowRight' }); expect(pick).toHaveBeenCalledWith('light');
    fireEvent.click(radios[1]); expect(pick).toHaveBeenLastCalledWith('light');
  });
});

describe('a tool shows its value (rule 14)', () => {
  it('names itself "name: value" in every variant', () => {
    const { container } = render(<ToolRow label="Player tools">
      <ValueTool icon="clock" name="Speed" value="1×" onClick={() => {}} />
      <ValueTool icon="moon" name="Sleep" value="Off" variant="chip" onClick={() => {}} />
      <ValueTool name="Sort" value="Newest first" variant="link" onClick={() => {}} />
    </ToolRow>);
    const tools = [...container.querySelectorAll('.ui-tool')];
    expect(tools.map((t) => t.getAttribute('aria-label'))).toEqual(['Speed: 1×', 'Sleep: Off', 'Sort: Newest first']);
    expect(tools[0].querySelector('.ui-tool-value').textContent).toBe('1×');
    expect(tools[1].className).toContain('is-chip');
    expect(tools[2].className).toContain('is-link');
  });
});

describe('the empty state (rule 15) and the notice', () => {
  it('one sentence and one button that goes there', () => {
    const go = vi.fn();
    const { container } = render(<EmptyState icon="mark" title="No bookmarks yet" text="Tap the bookmark on any page to keep your place." action={{ label: 'Open the letters', onClick: go }} />);
    expect(container.querySelector('.ui-empty-title').textContent).toBe('No bookmarks yet');
    expect(container.querySelectorAll('button').length).toBe(1);
    fireEvent.click(container.querySelector('button')); expect(go).toHaveBeenCalled();
  });

  it('a failed save is announced at once; a plain notice is a status; dismiss only when given', () => {
    const back = vi.fn(); const x = vi.fn();
    const { container } = render(<>
      <Notice tone="danger" title="Your last change could not be saved" text="Storage is full." actions={[{ label: 'Back up now', onClick: back }]} />
      <Notice title="Offline library incomplete" text="3 files did not download." inline actions={[{ label: 'Retry', onClick: () => {} }]} onDismiss={x} dismissLabel="Hide" />
    </>);
    const [danger, info] = container.querySelectorAll('.ui-notice');
    expect(danger.getAttribute('role')).toBe('alert');
    expect(danger.className).toContain('is-danger');
    expect(danger.querySelector('.ui-btn.is-primary').textContent).toBe('Back up now');
    expect(danger.querySelector('.ui-notice-x')).toBeNull();
    expect(info.getAttribute('role')).toBe('status');
    fireEvent.click(info.querySelector('.ui-notice-x')); expect(x).toHaveBeenCalled();
    fireEvent.click(danger.querySelector('.ui-btn')); expect(back).toHaveBeenCalled();
  });
});

describe('the icon set', () => {
  it('draws every mock icon and falls back to info', () => {
    expect(Object.keys(UI_ICONS).length).toBeGreaterThanOrEqual(60);
    const { container } = render(<><UiIcon name="search" /><UiIcon name="nope-not-an-icon" size="sm" /></>);
    const svgs = container.querySelectorAll('svg.ui-i');
    expect(svgs.length).toBe(2);
    expect(svgs[0].getAttribute('aria-hidden')).toBe('true');
    expect(svgs[1].getAttribute('class')).toContain('ui-i-sm');
    expect(svgs[1].children.length).toBe(UI_ICONS.info.length);
  });
});
