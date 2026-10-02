import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ProductTour, TOUR_SEEN_KEY, shouldAutoStartTour, type TourStep } from './ProductTour';

const STEPS: TourStep[] = [
  { title: 'One', body: 'first step' },
  { target: 'thing', title: 'Two', body: 'second step' },
  { target: 'missing', title: 'Three', body: 'third step' },
];

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('ProductTour', () => {
  it('auto-starts only until the tour has been seen', () => {
    expect(shouldAutoStartTour()).toBe(true);
    localStorage.setItem(TOUR_SEEN_KEY, '1');
    expect(shouldAutoStartTour()).toBe(false);
  });

  it('renders nothing when closed', () => {
    render(<ProductTour open={false} onClose={() => {}} steps={STEPS} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('steps forward and back, then finishes and records it as seen', () => {
    const onClose = vi.fn();
    render(<ProductTour open onClose={onClose} steps={STEPS} />);

    expect(screen.getByRole('dialog')).toHaveTextContent('One');
    expect(screen.getByText('Quick tour · 1 of 3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Two');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('One');

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    // A step whose target does not exist still renders (centred card).
    expect(screen.getByRole('dialog')).toHaveTextContent('Three');
    expect(screen.queryByRole('button', { name: 'Skip tour' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(TOUR_SEEN_KEY)).toBe('1');
  });

  it('skip, close button and Escape all end the tour and mark it seen', () => {
    for (const end of ['skip', 'close', 'escape'] as const) {
      localStorage.clear();
      const onClose = vi.fn();
      const { unmount } = render(<ProductTour open onClose={onClose} steps={STEPS} />);
      if (end === 'skip') fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
      if (end === 'close') fireEvent.click(screen.getByRole('button', { name: 'Close tour' }));
      if (end === 'escape') fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem(TOUR_SEEN_KEY)).toBe('1');
      unmount();
    }
  });

  it('arrow keys move between steps within bounds', () => {
    render(<ProductTour open onClose={() => {}} steps={STEPS} />);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByRole('dialog')).toHaveTextContent('One');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByRole('dialog')).toHaveTextContent('Three');
  });

  it('traps Tab inside the card, makes the page inert, and restores focus on close', () => {
    const page = document.createElement('div');
    const opener = document.createElement('button');
    opener.textContent = 'open tour';
    page.appendChild(opener);
    document.body.appendChild(page);
    opener.focus();

    const { rerender } = render(<ProductTour open onClose={() => {}} steps={STEPS} />);
    expect(page.hasAttribute('inert')).toBe(true);
    const next = screen.getByRole('button', { name: 'Next' });
    const close = screen.getByRole('button', { name: 'Close tour' });
    expect(document.activeElement).toBe(next);

    // Next is the last focusable in the card -> Tab wraps to the first (Close).
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    // Shift+Tab from the first wraps back to the last.
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(next);

    rerender(<ProductTour open={false} onClose={() => {}} steps={STEPS} />);
    expect(page.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  function withViewportWidth(width: number, fn: () => void) {
    const original = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    try {
      fn();
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: original });
    }
  }

  it('on a phone, points to the ☰ menu for a hidden sidebar item', () => {
    withViewportWidth(390, () => {
      const steps: TourStep[] = [{ target: 'nav-analytics', title: 'Analytics', body: 'trends' }];
      render(<ProductTour open onClose={() => {}} steps={steps} />);
      expect(screen.getByRole('dialog')).toHaveTextContent('open the ☰ menu');
    });
  });

  it('on desktop, a missing sidebar item is explained by the role, not the ☰ menu', () => {
    withViewportWidth(1440, () => {
      const steps: TourStep[] = [{ target: 'nav-settings', title: 'Settings', body: 'admin' }];
      render(<ProductTour open onClose={() => {}} steps={steps} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).not.toHaveTextContent('☰');
      expect(dialog).toHaveTextContent('Your current role cannot see this module');
    });
  });

  it('a centred step follows a resize', () => {
    withViewportWidth(1440, () => {
      const steps: TourStep[] = [{ target: 'nav-settings', title: 'Settings', body: 'admin' }];
      render(<ProductTour open onClose={() => {}} steps={steps} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('Your current role cannot see this module');
      // (Width uses CSS min(); jsdom cannot parse it -- checked in a real browser.)

      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
      act(() => {
        window.dispatchEvent(new Event('resize'));
      });
      expect(screen.getByRole('dialog')).toHaveTextContent('open the ☰ menu');
    });
  });

  it('the card never exceeds the viewport and scrolls instead', () => {
    render(<ProductTour open onClose={() => {}} steps={STEPS} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.style.maxHeight).toBe('calc(100dvh - 32px)');
    expect(dialog.className).toContain('overflow-y-auto');
  });

  it('spotlights a visible target', () => {
    const el = document.createElement('div');
    el.setAttribute('data-tour', 'thing');
    el.getBoundingClientRect = () =>
      ({ top: 100, left: 20, width: 200, height: 30, right: 220, bottom: 130, x: 20, y: 100, toJSON: () => ({}) }) as DOMRect;
    document.body.appendChild(el);

    render(<ProductTour open onClose={() => {}} steps={STEPS} />);
    const tour = screen.getByTestId('product-tour');
    // Centred step: plain dim backdrop, no ring.
    expect(tour.querySelector('.ring-2')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const ring = tour.querySelector<HTMLElement>('.ring-2');
    expect(ring).not.toBeNull();
    expect(ring!.style.top).toBe('94px'); // 100 - 6px padding
    expect(ring!.style.width).toBe('212px'); // 200 + 2 * 6px
  });
});
