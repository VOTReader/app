/* The place registry (zv1): a registered place renders in the shell with the props it is promised, its title names Back
   on the page above it, its actions land in the top bar, replace() swaps the top entry, and a gate boot is ready only
   once the place calls onReady(). The group 10 hooks (zv1): a registered start opens a real boot (never a gate boot), a
   bare place draws no bars, an overlay renders over every page with the shell's props. */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { V2App, routeTitle } from './App.jsx';
import { GATE_STATES } from './gate.js';
import { PLACES, OVERLAYS, definePlace, placeFor, defineStart, startStack } from './places.js';

const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });

let seen = /** @type {any[]} */ ([]);
const undo = /** @type {Array<() => void>} */ ([]);

function TestRoot(props) {
  seen.push(props);
  const { onReady } = props;
  React.useEffect(() => { onReady(); }, [onReady]);
  return (
    <div className="zz-root">
      <button type="button" className="zz-go" onClick={() => props.go({ place: 'zz-detail', n: 1 })}>open</button>
    </div>
  );
}

function TestDetail({ route, replace, onReady }) {
  React.useEffect(() => { onReady(); }, [onReady]);
  return <button type="button" className="zz-next" onClick={() => replace({ place: 'zz-detail', n: route.n + 1 })}>{'detail ' + route.n}</button>;
}

function register() {
  definePlace('notes', {
    Screen: TestRoot,
    title: () => 'Notes (test)',
    actions: ({ device }) => <button type="button" className="zz-act">{'act ' + device}</button>,
  });
  definePlace('zz-detail', { Screen: TestDetail, title: (r) => 'Detail ' + r.n, contentClass: 'content zz' });
}

afterEach(() => {
  cleanup();
  for (const id of ['notes', 'zz-detail', 'zz-bare']) delete PLACES[id];
  delete OVERLAYS['zz-over'];
  while (undo.length) undo.pop()();
  delete GATE_STATES['zz-gate'];
  delete html.dataset.gate;
  seen = [];
});

describe('the place registry', () => {
  it('placeFor knows only what was defined', () => {
    expect(placeFor('zz-detail')).toBe(null);
    register();
    expect(placeFor('zz-detail').contentClass).toBe('content zz');
    expect(placeFor('toString')).toBe(null);
  });

  it('a registered tab root renders with its actions in the top bar; its title names Back above it', () => {
    register();
    const { container } = render(<V2App gateId={null} />);
    click([...container.querySelectorAll('.tabbar .tab')][2]);
    expect(container.querySelector('.zz-root')).not.toBe(null);
    expect(container.querySelector('.tb .appname').textContent).toBe('VOTReader');
    expect(container.querySelector('.tb .zz-act').textContent).toBe('act phone');
    const p = seen[seen.length - 1];
    expect(p.route).toEqual({ place: 'notes' });
    expect(p.desktop).toBe(false);
    expect(p.device).toBe('phone');
    expect(p.gate).toBe(null);
    for (const k of ['go', 'pop', 'replace', 'openTab', 'onReady']) expect(typeof p[k]).toBe('function');

    click(container.querySelector('.zz-go'));
    expect(container.querySelector('.tb .title').textContent).toBe('Notes (test)');
    expect(container.querySelector('.content.zz .zz-next').textContent).toBe('detail 1');
    expect(routeTitle({ place: 'zz-detail', n: 4 })).toBe('Detail 4');
  });

  it('replace() swaps the top entry; Back still names the page under it', () => {
    register();
    const { container } = render(<V2App gateId={null} />);
    click([...container.querySelectorAll('.tabbar .tab')][2]);
    click(container.querySelector('.zz-go'));
    click(container.querySelector('.zz-next'));
    expect(container.querySelector('.zz-next').textContent).toBe('detail 2');
    click(container.querySelector('.tb button'));
    expect(container.querySelector('.zz-root')).not.toBe(null);
  });

  it('a gate boot hands the place its gate (facts seeded) and is ready once the place says so', async () => {
    register();
    GATE_STATES['zz-gate'] = { stack: [{ place: 'notes' }], facts: { marks: [] } };
    render(<V2App gateId="zz-gate" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    const p = seen[seen.length - 1];
    expect(p.gate).toBe(GATE_STATES['zz-gate']);
    expect(p.facts).toEqual({ marks: [] });
  });

  it('a registered start opens a real boot; null passes to the next, a throw is skipped, none means Home', () => {
    expect(startStack()).toBe(null);
    undo.push(defineStart(() => { throw new Error('no store'); }));
    undo.push(defineStart(() => null));
    expect(startStack()).toBe(null);
    undo.push(defineStart(() => [{ place: 'zz-bare' }]));
    expect(startStack()).toEqual([{ place: 'zz-bare' }]);
  });

  it('a bare place draws no top bar, mini player or tab bar, and still says ready on a gate boot', async () => {
    let ran = 0;
    undo.push(defineStart(() => { ran++; return [{ place: 'zz-bare' }]; }));
    definePlace('zz-bare', {
      bare: true, contentClass: 'content zz-b',
      Screen: ({ onReady }) => { React.useEffect(() => { onReady(); }, [onReady]); return <p className="zz-hello">hello</p>; },
    });
    const { container } = render(<V2App gateId={null} />);
    expect(ran).toBe(1);
    expect(container.querySelector('.v2-phone.bare .content.zz-b .zz-hello')).not.toBe(null);
    for (const sel of ['.tb', '.tabbar', '.mini']) expect(container.querySelector(sel)).toBe(null);
    cleanup();

    // a gate boot never asks the starts: its stack is the picture's
    GATE_STATES['zz-gate'] = { stack: [{ place: 'zz-bare' }] };
    render(<V2App gateId="zz-gate" />);
    expect(ran).toBe(1);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
  });

  it('an overlay renders over every page with the route, gate, go and openTab', () => {
    register();
    /** @type {any[]} */ const got = [];
    OVERLAYS['zz-over'] = (p) => { got.push(p); return <div className="zz-over">{p.route.place}</div>; };
    const { container } = render(<V2App gateId={null} />);
    expect(container.querySelector('.zz-over').textContent).toBe('home');
    click([...container.querySelectorAll('.tabbar .tab')][2]);
    expect(container.querySelector('.zz-over').textContent).toBe('notes');
    const p = got[got.length - 1];
    expect(p.gate).toBe(null);
    expect(p.desktop).toBe(false);
    expect(typeof p.go).toBe('function');
    expect(typeof p.openTab).toBe('function');
  });
});
