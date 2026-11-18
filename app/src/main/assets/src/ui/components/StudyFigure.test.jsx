// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* StudyFigure — a picture inside a study chapter (studies pass 3): a title plate, a chart, an illustration. */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { StudyFigure, studyFigureKind, chartTitle } from './StudyFigure.jsx';

globalThis.ReactDOM = ReactDOM;
afterEach(() => { cleanup(); });

describe('StudyFigure', () => {
  it('tells the three kinds apart by the file name', () => {
    expect(studyFigureKind('study-title-part-one-title.jpg')).toBe('plate');
    expect(studyFigureKind('study-cover-lamb.jpg')).toBe('plate');
    expect(studyFigureKind('study-chart-chronology.jpg')).toBe('chart');
    expect(studyFigureKind('study-lamb-supper.jpg')).toBe('picture');
    expect(studyFigureKind('study-cover-mtam.jpg')).toBe('picture');
  });

  it('names a chart without its "Chart: " lead', () => {
    expect(chartTitle('Chart: The True Chronology')).toBe('The True Chronology');
    expect(chartTitle('The True Chronology')).toBe('The True Chronology');
    expect(chartTitle('')).toBe('Chart');
  });

  it('a plate and an illustration are plain pictures with their words as the alt', () => {
    const { container, rerender } = render(<StudyFigure src="study-title-part-two-title.jpg" alt="Part Two: Without Spot or Blemish" />);
    const plate = container.querySelector('.study-figure');
    expect(plate.tagName).toBe('DIV');
    expect(plate.classList.contains('is-plate')).toBe(true);
    expect(plate.querySelector('img').getAttribute('alt')).toBe('Part Two: Without Spot or Blemish');
    rerender(<StudyFigure src="study-lamb-supper.jpg" alt="The Last Supper" />);
    expect(container.querySelector('.study-figure').classList.contains('is-picture')).toBe(true);
    expect(container.querySelector('button')).toBeNull();
  });

  it('a chart is one button that opens the zoom viewer, and the viewer closes again', () => {
    const { container } = render(<StudyFigure src="study-chart-chronology.jpg" alt="Chart: The True Chronology" />);
    const btn = container.querySelector('button.study-figure.is-chart');
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('aria-haspopup')).toBe('dialog');
    expect(btn.getAttribute('aria-label')).toMatch(/^The True Chronology, a chart/);
    expect(btn.textContent).toMatch(/^Open chart/);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    fireEvent.click(btn);
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-label')).toBe('The True Chronology');
    expect(dialog.querySelector('.ans-zoom img').getAttribute('src')).toBe('study-chart-chronology.jpg');
    fireEvent.click(document.querySelector('.select-sheet-backdrop'));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
