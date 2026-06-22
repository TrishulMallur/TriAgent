import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';

// pdf.js cannot run in jsdom (no Worker, no canvas backend). We stub it with
// a minimal surface that satisfies the PdfViewer component's imports.
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn().mockReturnValue({
    // A never-resolving promise keeps the component in its "loading" state,
    // which is exactly what we want to assert on.
    promise: new Promise(() => {}),
  }),
  GlobalWorkerOptions: { workerSrc: '' },
}));

import { PdfViewer } from './PdfViewer';

describe('PdfViewer', () => {
  // jsdom doesn't implement URL.createObjectURL · stub it so the image branch
  // can mount. Registering hooks inside describe is required by vitest 4.x.
  beforeAll(() => {
    if (!('createObjectURL' in URL)) {
      // @ts-expect-error · augmenting in test only
      URL.createObjectURL = vi.fn(() => 'blob:fake');
    } else {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    }
    if (!('revokeObjectURL' in URL)) {
      // @ts-expect-error · augmenting in test only
      URL.revokeObjectURL = vi.fn();
    } else {
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    }
  });

  it('renders an empty-state placeholder when file is null', () => {
    render(<PdfViewer file={null} />);
    expect(
      screen.getByText(/Upload a PDF or image to preview here/i),
    ).toBeInTheDocument();
  });

  it('renders an <img> for image files', () => {
    const file = new File([new Blob(['fake'])], 'snapshot.png', {
      type: 'image/png',
    });
    const { container } = render(<PdfViewer file={file} />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('blob:fake');
  });

  it('renders page-navigation controls for PDF files', () => {
    const file = new File([new Blob(['%PDF-1.4 fake'])], 'doc.pdf', {
      type: 'application/pdf',
    });
    render(<PdfViewer file={file} />);

    // pdf.js is mocked to never resolve, so we stay in the "loading" state and
    // the page indicator says so. The prev/next/zoom buttons should be present.
    expect(screen.getByLabelText(/Previous page/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Next page/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Zoom in/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Zoom out/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Reset zoom/i)).toBeInTheDocument();
    // The PDF branch may have multiple "Loading" labels (page indicator + canvas overlay).
    // Just assert at least one is present.
    expect(screen.getAllByText(/Loading/i).length).toBeGreaterThan(0);
  });
});
