// @ts-nocheck -- classic-global screen contract is isolated here.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { AudioBibleScreen, editionName, editionReading } from './AudioBibleScreen.jsx';
import * as AT from '../../utils/audio-track.js';
import * as AudioCoverage from '../../utils/audio-coverage.js';

beforeEach(() => {
  globalThis.ScreenLayout = ({ children, utility }) => <main>{utility ? <h1>{utility.title}</h1> : null}{children}</main>;
  globalThis.AudioPlayer = { subscribe: () => () => {}, getShape: () => '0|' };
  Object.assign(globalThis, AT, AudioCoverage);
  globalThis.BIBLE_AUDIO_MANIFEST = {
    'bible-brm-kjv:genesis': [['g', '']], 'bible-brm-kjv:exodus': [['e', '']],
    'bible-wop-nkjv:genesis': [['g', '']], 'bible-wop-nkjv:exodus': [['e', '']],
    'bible-web:genesis': [['g', '']], 'bible-web:exodus': [['e', '']],
    'bible-tsot-matthew:matthew': [['m', '']],
    'bible-john-film:john': [['j', '']],
  };
});
afterEach(() => {
  cleanup();
  for (const key of ['ScreenLayout', 'AudioPlayer', 'BIBLE_AUDIO_MANIFEST']) delete globalThis[key];
});

describe('AudioBibleScreen (listen.html au-bible)', () => {
  it('splits the editions into Whole Bible and Single books, each opening its books', () => {
    const onOpenEdition = vi.fn();
    render(<AudioBibleScreen onBack={() => {}} onOpenEdition={onOpenEdition} />);
    expect(screen.getByRole('heading', { name: 'The Bible' })).toBeTruthy();
    const whole = screen.getByRole('group', { name: 'Whole Bible' });
    expect([...whole.querySelectorAll('.ui-row-title')].map((t) => t.textContent)).toEqual(['KJV', 'NKJV', 'WEB']);
    expect(screen.getByText('2 books each')).toBeTruthy();
    const single = screen.getByRole('group', { name: 'Single books' });
    expect([...single.querySelectorAll('.ui-row-title')].map((t) => t.textContent)).toEqual(['Matthew', 'John']);
    fireEvent.click(screen.getByRole('button', { name: /^KJV · Biblical Restoration Ministries/ }));
    expect(onOpenEdition).toHaveBeenCalledWith('bible-brm-kjv');
  });

  it('marks a timed edition Read-along and the film Listening only', () => {
    render(<AudioBibleScreen onBack={() => {}} onOpenEdition={() => {}} />);
    expect(screen.getByRole('button', { name: /Biblical Restoration Ministries, read-along/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Gospel of John.*, listening only/ })).toBeTruthy();
  });

  it('names each edition by its short name and its reading in words', () => {
    const E = AT.BIBLE_AUDIO_EDITIONS;
    expect(editionName(E['brm-kjv'])).toBe('KJV');
    expect(editionReading(E['brm-kjv'])).toBe('Biblical Restoration Ministries');
    expect(editionReading(E['wop-nkjv'])).toBe('The Word of Promise, dramatized');
    expect(editionReading(E['tsot-matthew'])).toBe('The Scriptures of Truth · Benjamin');
    expect(editionReading(E['john-film'])).toBe('The Gospel of John, film audio');
  });
});
