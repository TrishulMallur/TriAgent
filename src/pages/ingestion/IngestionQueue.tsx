import { useCallback, useMemo, useRef, useState } from 'react';
import { Card, Button, Badge, Spinner } from '@/components/ui';
import { FileUpload } from '@/components/shared/FileUpload';
import { useLLM } from '@/contexts/LLMContext';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useToast } from '@/contexts/ToastContext';
import { extractTransferDocument } from '@/lib/ai';
import { WorkerPool, defaultConcurrencyFor } from '@/lib/worker-pool';
import { uploadFile } from '@/lib/api';
import { FieldReviewTable } from './FieldReviewTable';
import {
  Files,
  Play,
  Square,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  Loader2,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';

type QueueStatus =
  | 'pending'
  | 'extracting'   // /api/documents/extract-text round-trip
  | 'analyzing'    // LLM extract call
  | 'done'
  | 'failed'
  | 'aborted';

type ReviewState = 'unreviewed' | 'confirmed' | 'flagged';

type ExtractionResult = Awaited<ReturnType<typeof extractTransferDocument>>;

interface QueueItem {
  id: string;
  file: File;
  status: QueueStatus;
  text?: string;
  extraction?: ExtractionResult;
  error?: string;
  durationMs?: number;
  review: ReviewState;
}

interface BackendExtractResult {
  text: string;
}

const STATUS_BADGE: Record<QueueStatus, { variant: 'default' | 'info' | 'warning' | 'success' | 'error'; label: string }> = {
  pending: { variant: 'default', label: 'Pending' },
  extracting: { variant: 'info', label: 'Extracting' },
  analyzing: { variant: 'info', label: 'Analyzing' },
  done: { variant: 'success', label: 'Done' },
  failed: { variant: 'error', label: 'Failed' },
  aborted: { variant: 'warning', label: 'Aborted' },
};

export function IngestionQueue() {
  const { activeProviderId } = useLLM();
  const { log } = useAuditLog('transfer_ingestion');
  const { addToast } = useToast();

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [concurrency, setConcurrency] = useState<number>(defaultConcurrencyFor(activeProviderId));
  const [viewingId, setViewingId] = useState<string | null>(null);

  const poolRef = useRef<WorkerPool<QueueItem, ExtractionResult> | null>(null);

  // Re-suggest default concurrency when the user switches providers · only if
  // the queue is empty (don't override mid-batch).
  useMemo(() => {
    if (queue.length === 0) {
      setConcurrency(defaultConcurrencyFor(activeProviderId));
    }
    return null;
  }, [activeProviderId, queue.length]);

  const handleFilesSelected = useCallback((files: File[]) => {
    setQueue((prev) => {
      // Dedupe by filename so the same accidental double-drop doesn't double-queue.
      const existing = new Set(prev.map((q) => q.file.name));
      const additions: QueueItem[] = files
        .filter((f) => !existing.has(f.name))
        .map((file) => ({
          id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${file.name}`,
          file,
          status: 'pending' as QueueStatus,
          review: 'unreviewed' as ReviewState,
        }));
      return [...prev, ...additions];
    });
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }, []);

  const removeItem = useCallback(
    (id: string) => {
      setQueue((prev) => prev.filter((q) => q.id !== id));
      if (viewingId === id) setViewingId(null);
    },
    [viewingId],
  );

  const runBatch = useCallback(async () => {
    const items = queue.filter((q) => q.status === 'pending');
    if (items.length === 0) {
      addToast('info', 'Nothing to process · queue is empty or already complete');
      return;
    }
    setIsRunning(true);
    const pool = new WorkerPool<QueueItem, ExtractionResult>(concurrency);
    poolRef.current = pool;

    const worker = async (item: QueueItem, _signal: AbortSignal): Promise<ExtractionResult> => {
      updateItem(item.id, { status: 'extracting' });
      // Backend text extraction. If the backend isn't running (e.g., demo
      // mode), fall back to using the filename as the prompt so the mock
      // provider still produces a routable response.
      let text: string;
      try {
        const r = await uploadFile<BackendExtractResult>(
          '/api/documents/extract-text',
          item.file,
        );
        text = r.text;
      } catch {
        text = `Bulk-mode stub · backend text extraction unavailable. Filename: ${item.file.name}`;
      }
      updateItem(item.id, { status: 'analyzing', text });
      const extraction = await extractTransferDocument(text);
      return extraction;
    };

    let completed = 0;
    let failed = 0;
    for await (const result of pool.run(items, worker)) {
      const isAbort = result.error?.name === 'AbortError';
      if (result.error && isAbort) {
        updateItem(result.item.id, {
          status: 'aborted',
          error: 'Batch aborted',
          durationMs: result.durationMs,
        });
      } else if (result.error) {
        failed++;
        updateItem(result.item.id, {
          status: 'failed',
          error: result.error.message,
          durationMs: result.durationMs,
        });
      } else if (result.result) {
        completed++;
        updateItem(result.item.id, {
          status: 'done',
          extraction: result.result,
          durationMs: result.durationMs,
        });
        log('ai_analysis', {
          documentId: result.item.id,
          metadata: {
            filename: result.item.file.name,
            durationMs: result.durationMs,
            sourceInstitution: result.result.sourceInstitution,
            fieldCount: result.result.fields.length,
          },
        });
      }
    }

    poolRef.current = null;
    setIsRunning(false);
    addToast(
      failed > 0 ? 'warning' : 'success',
      `Batch complete: ${completed} done${failed > 0 ? `, ${failed} failed` : ''}`,
    );
  }, [queue, concurrency, updateItem, log, addToast]);

  const abortBatch = useCallback(() => {
    poolRef.current?.abort();
    addToast('warning', 'Batch aborted · in-flight workers signalled');
  }, [addToast]);

  const handleReview = useCallback(
    (id: string, decision: 'confirm' | 'flag') => {
      setQueue((prev) =>
        prev.map((q) =>
          q.id === id ? { ...q, review: decision === 'confirm' ? 'confirmed' : 'flagged' } : q,
        ),
      );
      const item = queue.find((q) => q.id === id);
      if (!item) return;
      log(decision === 'confirm' ? 'approve' : 'reject', {
        documentId: id,
        humanDecision: decision === 'confirm' ? 'approve' : 'reject',
        metadata: {
          filename: item.file.name,
          fieldCount: item.extraction?.fields.length,
        },
      });
      addToast(
        decision === 'confirm' ? 'success' : 'error',
        `${item.file.name}: ${decision === 'confirm' ? 'confirmed' : 'flagged as unreadable'}`,
      );
    },
    [queue, log, addToast],
  );

  const bulkReview = useCallback(
    (decision: 'confirm' | 'flag') => {
      const eligible = queue.filter((q) => q.status === 'done' && q.review === 'unreviewed');
      if (eligible.length === 0) return;
      for (const item of eligible) {
        handleReview(item.id, decision);
      }
    },
    [queue, handleReview],
  );

  const clearQueue = useCallback(() => {
    poolRef.current?.abort();
    poolRef.current = null;
    setQueue([]);
    setViewingId(null);
    setIsRunning(false);
  }, []);

  const counts = useMemo(() => {
    const c = { total: queue.length, pending: 0, inFlight: 0, done: 0, failed: 0, confirmed: 0 };
    for (const q of queue) {
      if (q.status === 'pending') c.pending++;
      else if (q.status === 'extracting' || q.status === 'analyzing') c.inFlight++;
      else if (q.status === 'done') c.done++;
      else if (q.status === 'failed' || q.status === 'aborted') c.failed++;
      if (q.review === 'confirmed') c.confirmed++;
    }
    return c;
  }, [queue]);

  const viewingItem = viewingId ? queue.find((q) => q.id === viewingId) ?? null : null;
  const eligibleForBulk = queue.filter((q) => q.status === 'done' && q.review === 'unreviewed').length;

  return (
    <div className="space-y-4">
      {/* Drop zone + controls */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Files className="w-4 h-4 text-ws-accent" />
          <h3 className="text-sm font-semibold text-ws-dark">Bulk Document Ingestion</h3>
        </div>
        <FileUpload
          onTextExtracted={() => {/* unused in bulk mode */}}
          onFilesSelected={handleFilesSelected}
          multiple
          directory
          disabled={isRunning}
        />
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <label className="flex items-center gap-2 text-xs text-ws-muted">
            <span>Concurrent extractions:</span>
            <input
              type="number"
              min={1}
              max={5}
              value={concurrency}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v >= 1 && v <= 5) setConcurrency(v);
              }}
              disabled={isRunning}
              className="w-14 px-2 py-1 rounded border border-ws-border bg-white text-sm text-ws-dark text-center"
            />
          </label>
          <p className="text-2xs text-ws-muted">
            Default for <strong>{activeProviderId}</strong>: {defaultConcurrencyFor(activeProviderId)}
            {activeProviderId === 'lmstudio' || activeProviderId === 'llamacpp'
              ? ' (single-thread local inference)'
              : ''}
          </p>
          <div className="ml-auto flex items-center gap-2">
            {!isRunning ? (
              <Button
                onClick={runBatch}
                disabled={counts.pending === 0}
                className="gap-2"
              >
                <Play className="w-4 h-4" />
                Start Batch ({counts.pending})
              </Button>
            ) : (
              <Button variant="outline" onClick={abortBatch} className="gap-2">
                <Square className="w-4 h-4" />
                Abort
              </Button>
            )}
            <Button variant="outline" onClick={clearQueue} disabled={queue.length === 0}>
              Clear
            </Button>
          </div>
        </div>
      </Card>

      {/* Queue table */}
      {queue.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ws-dark">
              Queue · {counts.total} file{counts.total === 1 ? '' : 's'}
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="default" size="sm">{counts.pending} pending</Badge>
              {counts.inFlight > 0 && <Badge variant="info" size="sm" dot>{counts.inFlight} in-flight</Badge>}
              <Badge variant="success" size="sm">{counts.done} done</Badge>
              {counts.failed > 0 && <Badge variant="error" size="sm">{counts.failed} failed</Badge>}
              {counts.confirmed > 0 && (
                <Badge variant="success" size="sm" dot>{counts.confirmed} confirmed</Badge>
              )}
            </div>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {queue.map((q) => {
              const isViewing = viewingId === q.id;
              const badge = STATUS_BADGE[q.status];
              return (
                <div
                  key={q.id}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                    isViewing
                      ? 'border-ws-accent bg-ws-accent/5'
                      : 'border-ws-border bg-white hover:bg-ws-light/40'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-sm font-medium text-ws-dark truncate">{q.file.name}</span>
                      <Badge variant={badge.variant} size="sm" dot={q.status === 'extracting' || q.status === 'analyzing'}>
                        {badge.label}
                      </Badge>
                      {q.review === 'confirmed' && (
                        <Badge variant="success" size="sm">Confirmed</Badge>
                      )}
                      {q.review === 'flagged' && (
                        <Badge variant="error" size="sm">Flagged</Badge>
                      )}
                    </div>
                    {q.status === 'failed' && q.error && (
                      <p className="text-2xs text-verdict-fail mt-0.5 truncate">{q.error}</p>
                    )}
                    {q.status === 'done' && q.extraction && (
                      <p className="text-2xs text-ws-muted mt-0.5 truncate">
                        {q.extraction.fields.length} fields · {q.extraction.sourceInstitution} ·{' '}
                        {Math.round((q.extraction.overallConfidence ?? 0) * 100)}% confidence
                        {q.durationMs ? ` · ${(q.durationMs / 1000).toFixed(1)}s` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {(q.status === 'extracting' || q.status === 'analyzing') && (
                      <Spinner size="sm" />
                    )}
                    {q.status === 'done' && q.review === 'unreviewed' && (
                      <>
                        <button
                          onClick={() => handleReview(q.id, 'confirm')}
                          title="Confirm"
                          className="p-1 text-verdict-pass hover:bg-verdict-pass-bg/50 rounded"
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleReview(q.id, 'flag')}
                          title="Flag as unreadable"
                          className="p-1 text-verdict-fail hover:bg-verdict-fail-bg/50 rounded"
                        >
                          <ThumbsDown className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    {q.status === 'done' && (
                      <button
                        onClick={() => setViewingId(isViewing ? null : q.id)}
                        title="View fields"
                        className="p-1 text-ws-muted hover:text-ws-accent hover:bg-ws-accent/10 rounded"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {!isRunning && (
                      <button
                        onClick={() => removeItem(q.id)}
                        title="Remove"
                        className="p-1 text-ws-muted hover:text-verdict-fail rounded"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {q.status === 'done' && !q.review && <CheckCircle2 className="w-3.5 h-3.5 text-verdict-pass" />}
                    {q.status === 'failed' && <AlertTriangle className="w-3.5 h-3.5 text-verdict-fail" />}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Aggregate footer · visible once at least one file is done. */}
          {counts.done > 0 && (
            <div className="mt-4 pt-4 border-t border-ws-border flex items-center justify-between flex-wrap gap-3">
              <p className="text-xs text-ws-muted">
                {counts.confirmed} of {counts.done} done file(s) reviewed
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={eligibleForBulk === 0}
                  onClick={() => bulkReview('flag')}
                  className="gap-1.5"
                >
                  <ThumbsDown className="w-3.5 h-3.5" />
                  Flag All Unreadable ({eligibleForBulk})
                </Button>
                <Button
                  size="sm"
                  disabled={eligibleForBulk === 0}
                  onClick={() => bulkReview('confirm')}
                  className="gap-1.5"
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                  Confirm All Pending Review ({eligibleForBulk})
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Viewing pane for the selected queue item */}
      {viewingItem?.extraction && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-ws-dark">{viewingItem.file.name}</h3>
              <p className="text-xs text-ws-muted">
                Extracted fields · {viewingItem.extraction.fields.length} total
              </p>
            </div>
            <button
              onClick={() => setViewingId(null)}
              className="text-xs text-ws-muted hover:text-ws-accent"
            >
              Close
            </button>
          </div>
          <FieldReviewTable
            fields={viewingItem.extraction.fields.map((f) => ({ ...f }))}
            onFieldCorrection={() => {/* corrections disabled in bulk view (read-only) */}}
          />
        </Card>
      )}

      {/* Empty state */}
      {queue.length === 0 && (
        <Card>
          <div className="text-center py-8 text-ws-muted">
            <Loader2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">
              Drop one or more documents (or a whole folder) above to populate the bulk queue.
            </p>
            <p className="text-xs mt-1">
              Worker pool will process up to {concurrency} concurrently using <strong>{activeProviderId}</strong>.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
