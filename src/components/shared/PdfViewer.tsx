import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileText,
} from 'lucide-react';
import { Card, Button, Spinner } from '@/components/ui';

// Configure pdf.js worker. Vite resolves this URL to a static asset at build time.
// We guard the assignment so test environments that mock pdfjs-dist with an empty
// GlobalWorkerOptions still load without crashing.
try {
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
  }
} catch {
  // Ignore · worker is unavailable in some test environments.
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;
const ZOOM_STEP = 0.25;

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'tiff', 'tif', 'gif', 'webp'];

interface PdfViewerProps {
  /** A File or Blob (PDF) or an image File (png/jpg). The component branches internally. */
  file: File | Blob | null;
  /** Optional initial scale. Default 1.0. */
  initialScale?: number;
  className?: string;
}

type FileKind = 'pdf' | 'image' | 'unknown';

function detectKind(file: File | Blob | null): FileKind {
  if (!file) return 'unknown';
  const mime = (file.type || '').toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';

  // Fall back to filename extension when the File has a name (Blob does not).
  const name = (file as File).name?.toLowerCase?.() ?? '';
  if (name.endsWith('.pdf')) return 'pdf';
  const ext = name.split('.').pop() ?? '';
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';

  return 'unknown';
}

export function PdfViewer({ file, initialScale = 1.0, className }: PdfViewerProps) {
  const kind = useMemo(() => detectKind(file), [file]);

  // ---------- Empty state ----------
  if (!file) {
    return (
      <Card className={className}>
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-ws-muted" />
          <h3 className="text-sm font-semibold text-ws-dark">Source Document</h3>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-ws-border bg-ws-light/30 py-12 px-4 text-center">
          <FileText className="w-8 h-8 text-ws-muted mb-2" />
          <p className="text-sm text-ws-muted">
            Upload a PDF or image to preview here
          </p>
        </div>
      </Card>
    );
  }

  if (kind === 'image') {
    return <ImageViewer file={file} initialScale={initialScale} className={className} />;
  }

  // PDF (also the fallback for unknown · pdf.js will surface an error if it really isn't one).
  return <PdfDocViewer file={file} initialScale={initialScale} className={className} />;
}

// =====================================================================
// Image branch
// =====================================================================
function ImageViewer({
  file,
  initialScale,
  className,
}: {
  file: File | Blob;
  initialScale: number;
  className?: string;
}) {
  const [scale, setScale] = useState(initialScale);
  const objectUrl = useMemo(() => URL.createObjectURL(file), [file]);

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  const zoomIn = () => setScale((s) => Math.min(ZOOM_MAX, s + ZOOM_STEP));
  const zoomOut = () => setScale((s) => Math.max(ZOOM_MIN, s - ZOOM_STEP));
  const reset = () => setScale(1.0);

  return (
    <Card className={className}>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-ws-muted" />
          <h3 className="text-sm font-semibold text-ws-dark">Source Document</h3>
          <span className="text-2xs text-ws-muted">Image</span>
        </div>
        <ZoomControls scale={scale} onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={reset} />
      </div>
      <div className="rounded-lg border border-ws-border bg-ws-light/50 overflow-auto max-h-[600px] p-4 flex items-start justify-center">
        <img
          src={objectUrl}
          alt="Source document"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
          className="max-w-none"
        />
      </div>
    </Card>
  );
}

// =====================================================================
// PDF branch
// =====================================================================
function PdfDocViewer({
  file,
  initialScale,
  className,
}: {
  file: File | Blob;
  initialScale: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(initialScale);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const renderTaskRef = useRef<pdfjs.RenderTask | null>(null);

  // Load the PDF whenever the file changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdfDoc(null);
    setNumPages(0);
    setCurrentPage(1);

    (async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        if (cancelled) return;
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const doc = await loadingTask.promise;
        if (cancelled) {
          doc.destroy();
          return;
        }
        setPdfDoc(doc);
        setNumPages(doc.numPages);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'Failed to load PDF document',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file]);

  // Render whenever page or scale changes (or pdfDoc loads).
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;

    (async () => {
      // Cancel any in-flight render so rapid zoom doesn't race.
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
        renderTaskRef.current = null;
      }

      try {
        const page = await pdfDoc.getPage(currentPage);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const task = page.render({ canvas, canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
        if (renderTaskRef.current === task) {
          renderTaskRef.current = null;
        }
      } catch (err: any) {
        // RenderingCancelledException is expected when superseded · swallow it.
        if (err?.name === 'RenderingCancelledException') return;
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to render page');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, currentPage, scale]);

  // Clean up the document on unmount.
  useEffect(() => {
    return () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
        renderTaskRef.current = null;
      }
      if (pdfDoc) {
        try {
          pdfDoc.destroy();
        } catch {
          // ignore
        }
      }
    };
    // We only want to run this on unmount; pdfDoc swap is handled by the
    // load effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prevPage = useCallback(() => {
    setCurrentPage((p) => Math.max(1, p - 1));
  }, []);
  const nextPage = useCallback(() => {
    setCurrentPage((p) => Math.min(numPages || p, p + 1));
  }, [numPages]);
  const zoomIn = useCallback(() => {
    setScale((s) => Math.min(ZOOM_MAX, s + ZOOM_STEP));
  }, []);
  const zoomOut = useCallback(() => {
    setScale((s) => Math.max(ZOOM_MIN, s - ZOOM_STEP));
  }, []);
  const resetZoom = useCallback(() => {
    setScale(1.0);
  }, []);

  return (
    <Card className={className}>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-ws-muted" />
          <h3 className="text-sm font-semibold text-ws-dark">Source Document</h3>
          <span className="text-2xs text-ws-muted">PDF</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={prevPage}
              disabled={loading || currentPage <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <span className="text-xs text-ws-muted px-2 min-w-[5rem] text-center">
              {loading
                ? 'Loading…'
                : `Page ${currentPage} of ${numPages || '·'}`}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={nextPage}
              disabled={loading || currentPage >= numPages}
              aria-label="Next page"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
          <ZoomControls
            scale={scale}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onReset={resetZoom}
          />
        </div>
      </div>

      <div className="rounded-lg border border-ws-border bg-ws-light/50 overflow-auto max-h-[600px] p-4 flex items-start justify-center">
        {error ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm font-semibold text-verdict-fail">Failed to load PDF</p>
            <p className="text-xs text-ws-muted mt-1">{error}</p>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Spinner size="md" />
            <p className="text-xs text-ws-muted">Loading document…</p>
          </div>
        ) : (
          <canvas ref={canvasRef} className="shadow-sm bg-white" />
        )}
      </div>
    </Card>
  );
}

// =====================================================================
// Shared zoom controls
// =====================================================================
function ZoomControls({
  scale,
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={onZoomOut}
        disabled={scale <= ZOOM_MIN}
        aria-label="Zoom out"
      >
        <ZoomOut className="w-3.5 h-3.5" />
      </Button>
      <span className="text-xs text-ws-muted px-2 min-w-[3rem] text-center">
        {Math.round(scale * 100)}%
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={onZoomIn}
        disabled={scale >= ZOOM_MAX}
        aria-label="Zoom in"
      >
        <ZoomIn className="w-3.5 h-3.5" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={onReset}
        disabled={scale === 1.0}
        aria-label="Reset zoom"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
