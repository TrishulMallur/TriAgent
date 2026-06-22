import { useState, useCallback, useRef, useEffect } from 'react';
import { Card, ComplianceVerdictBadge, ScoreBar } from '@/components/ui';
import { AiAnalysisContainer } from '@/components/shared/AiAnalysisContainer';
import { HumanReviewPanel, type ReviewAction } from '@/components/shared/HumanReviewPanel';
import { useClaudeAnalysis } from '@/hooks/useClaudeAnalysis';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useToast } from '@/contexts/ToastContext';
import { analyzeAdvisorNote, analyzeAdvisorNoteStream } from '@/lib/ai';
import { NoteEditor } from './NoteEditor';
import { ComplianceChecklist } from './ComplianceChecklist';
import { FlagsList } from './FlagsList';
import { AlertTriangle } from 'lucide-react';

type AnalysisResult = Awaited<ReturnType<typeof analyzeAdvisorNote>>;

export function AdvisorNotesPage() {
  const [noteText, setNoteText] = useState('');
  const [liveMode, setLiveMode] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { analyze, rerun, result, status, error, rawResponse, lastUsage, streamingText, cancel, reset } = useClaudeAnalysis<AnalysisResult>(analyzeAdvisorNote, {
    streaming: true,
    // Cast: the hook types its stream fn as `(...args: unknown[]) => Promise<T>` so it can
    // accept any of the *Stream exports from lib/ai. Each stream fn has a specific positional
    // signature (noteText, onChunk, signal), and the hook calls it with that exact arg order.
    analysisStreamFn: analyzeAdvisorNoteStream as (...args: unknown[]) => Promise<AnalysisResult>,
  });
  const { log } = useAuditLog('advisor_notes');
  const { addToast } = useToast();

  // Debounced live analysis
  const handleNoteChange = useCallback(
    (text: string) => {
      setNoteText(text);
      setReviewStatus(null);
      reset();

      if (liveMode && text.trim().length > 50) {
        if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
        liveTimerRef.current = setTimeout(() => {
          analyze(text);
        }, 2000);
      }
    },
    [liveMode, analyze, reset]
  );

  // Cleanup live timer
  useEffect(() => {
    return () => {
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    };
  }, []);

  const handleAnalyze = useCallback(() => {
    if (!noteText.trim()) return;
    setReviewStatus(null);
    analyze(noteText);
    log('ai_analysis', { metadata: { noteLength: noteText.length } });
  }, [noteText, analyze, log]);

  const handleToggleLiveMode = useCallback(() => {
    setLiveMode((prev) => !prev);
    if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
  }, []);

  // Keyboard shortcut: Ctrl+Enter to analyze
  useKeyboardShortcuts([
    {
      key: 'Enter',
      ctrl: true,
      handler: handleAnalyze,
      description: 'Analyze note',
    },
  ]);

  // Human review actions
  const handleReviewAction = useCallback(
    (action: ReviewAction, reason?: string, overrideVerdict?: string) => {
      const verdictLabel = result?.verdict || 'unknown';

      log(action, {
        aiVerdict: verdictLabel,
        humanDecision: action,
        overrideReason: reason,
        metadata: {
          overallScore: result?.overallScore,
          flagCount: result?.flags?.length,
          overrideVerdict,
        },
      });

      setReviewStatus(action);

      const messages: Record<ReviewAction, string> = {
        approve: 'Note approved · compliance review complete',
        reject: `Note rejected${reason ? `: ${reason}` : ''}`,
        escalate: 'Note escalated to supervisor for review',
        override: `Verdict overridden to "${overrideVerdict}"${reason ? ` · ${reason}` : ''}`,
      };

      const toastTypes: Record<ReviewAction, 'success' | 'error' | 'warning' | 'info'> = {
        approve: 'success',
        reject: 'error',
        escalate: 'warning',
        override: 'info',
      };

      addToast(toastTypes[action], messages[action]);
    },
    [result, log, addToast]
  );

  const handleReset = () => {
    setNoteText('');
    setReviewStatus(null);
    reset();
  };

  const escalationRequired = result ? result.verdict === 'non_compliant' || result.overallScore < 50 : false;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-7xl">
      {/* Left Column · Input (55%) */}
      <div className="lg:col-span-7">
        <NoteEditor
          noteText={noteText}
          onNoteChange={handleNoteChange}
          onAnalyze={handleAnalyze}
          analyzing={status === 'analyzing'}
          liveMode={liveMode}
          onToggleLiveMode={handleToggleLiveMode}
        />
      </div>

      {/* Right Column · Results (45%) */}
      <div className="lg:col-span-5 space-y-4">
        <AiAnalysisContainer
          status={status}
          error={error}
          rawResponse={rawResponse}
          onRetry={handleAnalyze}
          onRerun={rerun}
          streamingText={streamingText}
          onCancel={cancel}
          usage={lastUsage}
          idleMessage="Paste or type advisor notes, then analyze for CIRO compliance"
        >
          {result && (
            <div className="space-y-4">
              {/* Verdict Header */}
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <ComplianceVerdictBadge verdict={result.verdict} size="lg" />
                  {reviewStatus && (
                    <span className="text-xs font-medium text-ws-muted capitalize">
                      {reviewStatus === 'approve' ? 'Approved' : reviewStatus === 'reject' ? 'Rejected' : reviewStatus === 'escalate' ? 'Escalated' : 'Overridden'}
                    </span>
                  )}
                </div>
                <ScoreBar score={result.overallScore} label="Compliance Score" />
              </Card>

              {/* Auto-escalation banner */}
              {escalationRequired && (
                <div className="flex items-center gap-2 rounded-lg bg-verdict-fail-bg px-4 py-3 border border-verdict-fail/20">
                  <AlertTriangle className="w-4 h-4 text-verdict-fail flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-verdict-fail">Escalation Required</p>
                    <p className="text-2xs text-verdict-fail/80">
                      Score below 50 · this note must be reviewed by a compliance officer
                    </p>
                  </div>
                </div>
              )}

              {/* CIRO Checklist */}
              <ComplianceChecklist checklist={result.checklist} />

              {/* Compliance Flags */}
              <FlagsList flags={result.flags} />

              {/* Human Review Panel */}
              <HumanReviewPanel
                onAction={handleReviewAction}
                disabled={!!reviewStatus}
                showOverride={true}
                approveLabel="Approve Note"
                rejectLabel="Send Back"
                escalateLabel="Escalate"
                escalationRequired={escalationRequired}
              />

              {/* Reset button */}
              {reviewStatus && (
                <button
                  onClick={handleReset}
                  className="w-full text-center text-xs text-ws-accent hover:text-ws-accent-dark font-medium py-2"
                >
                  Start New Review
                </button>
              )}
            </div>
          )}
        </AiAnalysisContainer>
      </div>
    </div>
  );
}
