import { useState, type ReactNode } from 'react';
import { Card, Spinner, Button } from '@/components/ui';
import { AlertCircle, Brain, Clipboard, ClipboardCheck, RefreshCw, Coins } from 'lucide-react';
import type { RecordedCall } from '@/lib/usage-tracker';

export type AnalysisStatus = 'idle' | 'analyzing' | 'success' | 'error';

interface AiAnalysisContainerProps {
  status: AnalysisStatus;
  error?: string | null;
  /**
   * When the error is a schema-validation failure (`AiResponseError`),
   * pass the raw LLM response here so the user can copy it to clipboard
   * for bug reports. Surfaces a "Copy raw response" button.
   */
  rawResponse?: string | null;
  onRetry?: () => void;
  /**
   * If provided, surfaces a "Re-run (fresh)" button that bypasses the
   * response cache for one call. Useful when the cached result is stale or
   * the user just wants to see a fresh sample from the LLM.
   */
  onRerun?: () => void;
  /**
   * Live streaming text from the model. When provided alongside
   * `status === 'analyzing'`, the spinner state shows the partial output
   * instead of just the static "This typically takes…" copy.
   */
  streamingText?: string | null;
  /**
   * If provided alongside `streamingText`, surfaces a Cancel button under
   * the streaming preview that aborts the in-flight request.
   */
  onCancel?: () => void;
  /**
   * Token usage + cost for the call that produced this result. Renders a
   * small badge below the children when `status === 'success'`. Pass
   * `useClaudeAnalysis(...).lastUsage` here. Null/undefined → no badge.
   */
  usage?: RecordedCall | null;
  children: ReactNode;
  idleMessage?: string;
}

function formatUsageBadge(call: RecordedCall): string {
  const tokens = call.usage.totalTokens ?? call.usage.inputTokens + call.usage.outputTokens;
  const seconds = call.usage.durationMs ? (call.usage.durationMs / 1000).toFixed(1) + 's' : null;
  if (call.cached) return `0 tokens (cached)${seconds ? ` · ${seconds}` : ''}`;
  const tokensStr = tokens.toLocaleString();
  const costStr =
    call.costUsd !== null && call.costUsd > 0
      ? ` · ~$${call.costUsd < 0.01 ? call.costUsd.toFixed(4) : call.costUsd.toFixed(3)}`
      : '';
  return `${tokensStr} tokens${costStr}${seconds ? ` · ${seconds}` : ''}`;
}

export function AiAnalysisContainer({
  status,
  error,
  rawResponse,
  onRetry,
  onRerun,
  streamingText,
  onCancel,
  usage,
  children,
  idleMessage = 'Submit a document or note for AI analysis',
}: AiAnalysisContainerProps) {
  const [copied, setCopied] = useState(false);

  if (status === 'idle') {
    return (
      <Card className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-12 h-12 rounded-xl bg-ws-light flex items-center justify-center mb-3">
          <Brain className="w-6 h-6 text-ws-muted" />
        </div>
        <p className="text-sm text-ws-muted">{idleMessage}</p>
      </Card>
    );
  }

  if (status === 'analyzing') {
    // Streaming variant: show the live tail of the model's output under the spinner.
    if (streamingText && streamingText.length > 0) {
      return (
        <Card className="analyzing-pulse flex flex-col items-center py-8">
          <div className="flex flex-col items-center text-center">
            <Spinner size="lg" />
            <p className="text-sm font-medium text-ws-accent mt-4">Generating…</p>
            <p className="text-xs text-ws-muted mt-1">Streaming response from the model</p>
          </div>
          <div className="w-full mt-4 max-w-2xl">
            <div className="rounded-md bg-ws-light/60 border border-ws-border/40 p-3 max-h-48 overflow-hidden">
              <div className="font-mono text-2xs text-ws-muted whitespace-pre-wrap break-words leading-snug">
                {streamingText}
              </div>
            </div>
            {onCancel && (
              <div className="flex justify-center mt-3">
                <Button variant="outline" size="sm" onClick={onCancel}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </Card>
      );
    }

    return (
      <Card className="analyzing-pulse flex flex-col items-center justify-center py-12 text-center">
        <Spinner size="lg" />
        <p className="text-sm font-medium text-ws-accent mt-4">Analyzing with AI...</p>
        <p className="text-xs text-ws-muted mt-1">This typically takes 5-10 seconds</p>
      </Card>
    );
  }

  if (status === 'error') {
    const handleCopy = async () => {
      if (!rawResponse) return;
      try {
        await navigator.clipboard.writeText(rawResponse);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // clipboard API can fail in non-secure contexts; ignore silently
      }
    };

    return (
      <Card className="border-verdict-fail/30 bg-verdict-fail-bg/30">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <AlertCircle className="w-8 h-8 text-verdict-fail mb-3" />
          <p className="text-sm font-medium text-verdict-fail">Analysis Failed</p>
          <p className="text-xs text-ws-muted mt-1 max-w-sm">{error || 'An unexpected error occurred'}</p>
          <div className="flex items-center gap-2 mt-4 flex-wrap justify-center">
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                Try Again
              </Button>
            )}
            {onRerun && (
              <Button variant="outline" size="sm" onClick={onRerun}>
                <RefreshCw className="w-4 h-4 mr-1" /> Re-run (fresh)
              </Button>
            )}
            {rawResponse && (
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? (
                  <>
                    <ClipboardCheck className="w-4 h-4 mr-1" /> Copied
                  </>
                ) : (
                  <>
                    <Clipboard className="w-4 h-4 mr-1" /> Copy raw response
                  </>
                )}
              </Button>
            )}
          </div>
          {rawResponse && (
            <p className="text-2xs text-ws-muted mt-2 max-w-md">
              The LLM returned a response that did not match the expected schema.
              Copy and share it with engineering to file a bug.
            </p>
          )}
        </div>
      </Card>
    );
  }

  // status === 'success'
  return (
    <>
      {children}
      {usage && (
        <div className="flex items-center gap-1.5 text-2xs text-ws-muted mt-2 px-1">
          <Coins className="w-3 h-3" />
          <span>{formatUsageBadge(usage)}</span>
          <span className="opacity-60">· {usage.providerId}</span>
        </div>
      )}
    </>
  );
}
