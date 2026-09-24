// @ts-nocheck
/**
 * The guide names the drag that reaches the sky (ux1, hub 2026-09-22 22:57).
 *
 * "How to read this web" told the reader "Drag up to look into the sky", and the
 * gesture does the opposite: the picture follows the finger, as a page does, so
 * a finger moving DOWN pulls the web down and shows what is above it
 * (gestures.js: c.y = drag.camy + dy). A reader who did what the card said stayed
 * on the baseline, and the S22 walk (VERDICT W3-3) repeated the card's claim.
 *
 * This test reads the direction word from the guide's own sky line and drives
 * that drag through attachWebGestures with a real y frame: the camera must rise
 * off the baseline. Changing the words or the gesture alone fails it; the
 * CONTROL drags the other way and must stay put.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachWebGestures } from './gestures.js';
import { createCamera, clampCamera, zoomAbout, xToVerse, squashFactor } from '../../utils/scripture-web/geometry.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCREEN = fs.readFileSync(path.join(HERE, '../screens/ScriptureWebScreen.jsx'), 'utf8');

/** The guide's sky line as the reader reads it (tags stripped). */
function skyLine() {
  const guide = SCREEN.slice(SCREEN.indexOf('How to read this web</div>'));
  const items = guide.match(/<li>[\s\S]*?<\/li>/g) || [];
  return items.map((s) => s.replace(/<[^>]+>/g, '')).find((s) => /\bsky\b/i.test(s)) || '';
}

/** The finger's direction the sky line names: the first up/down after the verb. */
function directionWord(line) {
  const m = /\b(?:drag|pull|swipe|slide)\b[^.]*?\b(up|down)\b/i.exec(line);
  return m ? m[1].toLowerCase() : null;
}

/** One finger drag of `dy` CSS px on the canon web, zoomed past the overview (at
 * fit the dome fills the frame and there is no sky to pan to); the camera's y. */
function drive(dy) {
  const root = document.createElement('div');
  root.className = 'sw-root';
  root.setPointerCapture = vi.fn();
  document.body.appendChild(root);
  const W = 1000;
  const cam = createCamera(1000);
  clampCamera(cam, W, 4000);
  cam.ppv = 10;
  const yf = { base: 500, ceil: 400, squash: squashFactor(400, W), maxSpan: 1000 };
  clampCamera(cam, W, 4000, yf);
  const detach = attachWebGestures(root, {
    loc: (e) => ({ x: e.clientX, y: e.clientY }),
    dpr: () => 1, cam: () => cam, view: () => ({ W, H: 600, DPR: 1 }),
    handlers: () => ({ hover: vi.fn(), tap: vi.fn(), doubleTap: vi.fn() }),
    schedule: vi.fn(), maxZoom: () => 4000,
    clampCamera, zoomAbout, xToVerse, yFrame: () => yf,
  });
  const ev = (type, y) => new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', clientX: 500, clientY: y,
  });
  root.dispatchEvent(ev('pointerdown', 300));
  root.dispatchEvent(ev('pointermove', 300 + dy / 2));
  root.dispatchEvent(ev('pointermove', 300 + dy));
  root.dispatchEvent(ev('pointerup', 300 + dy));
  detach();
  root.remove();
  return cam.y;
}

const STEP = { down: 150, up: -150 };

describe('the guide names the drag that reaches the sky (ux1)', () => {
  it('the sky line names a direction for the finger', () => {
    expect(skyLine()).toMatch(/sky/i);
    expect(['up', 'down']).toContain(directionWord(skyLine()));
  });

  it('a drag the way the guide says lifts the camera off the baseline', () => {
    expect(drive(STEP[directionWord(skyLine())])).toBeGreaterThan(0);
  });

  it('CONTROL: a drag the other way stays on the baseline', () => {
    const other = directionWord(skyLine()) === 'down' ? 'up' : 'down';
    expect(drive(STEP[other])).toBe(0);
  });
});
