import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Card, Button, ProgressSteps } from '@/components/ui';
import { HumanReviewPanel, type ReviewAction } from '@/components/shared/HumanReviewPanel';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useToast } from '@/contexts/ToastContext';
import { useRules } from '@/contexts/RulesContext';
import { diagnoseException } from '@/lib/ai';
import { MOCK_EXCEPTIONS, MOCK_CLIENTS } from '@/data/mockData';
import type { TransferException } from '@/types';
import type { AnalysisStatus } from '@/components/shared/AiAnalysisContainer';
import { computeSlaStatus } from '@/lib/sla';
import { ExceptionQueue } from './ExceptionQueue';
import { ExceptionDetail } from './ExceptionDetail';
import { EmailDraftEditor } from './EmailDraftEditor';
import { Inbox, ArrowLeft } from 'lucide-react';

type DiagnosisResult = Awaited<ReturnType<typeof diagnoseException>>;

const PIPELINE_STEPS = [
  { id: 'ingestion', label: 'Ingestion' },
  { id: 'validation', label: 'Validation' },
  { id: 'exceptions', label: 'Exceptions' },
];

export function ExceptionsPage() {
  // Exception queue state
  const [exceptions, setExceptions] = useState<TransferException[]>(() => [...MOCK_EXCEPTIONS]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());

  // Per-exception persisted state
  const [diagnoses, setDiagnoses] = useState<Map<string, DiagnosisResult>>(new Map());
  const [emailDrafts, setEmailDrafts] = useState<Map<string, { subject: string; body: string }>>(new Map());
  const [checkedSteps, setCheckedSteps] = useState<Map<string, Set<number>>>(new Map());
  const [agentNotes, setAgentNotes] = useState<Map<string, string>>(new Map());
  const [reviewStatuses, setReviewStatuses] = useState<Map<string, string>>(new Map());

  // Current analysis state (for the active diagnosis in progress)
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>('idle');
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const analyzingIdRef = useRef<string | null>(null);

  const { log } = useAuditLog('transfer_exception');
  const { addToast } = useToast();
  const { rules } = useRules();

  // 60s ticker drives the SLA badges + auto-escalation effect across the page.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Track which exception IDs have already auto-escalated this session so we
  // don't re-fire the toast every 60s after the deadline crosses.
  const autoEscalatedRef = useRef<Set<string>>(new Set());

  // Auto-escalation effect · runs on every tick (cheap), only acts on
  // exceptions that JUST crossed their deadline this tick.
  useEffect(() => {
    if (!rules.sla.auto_escalate_on_breach) return;
    const toEscalate: TransferException[] = [];
    for (const exc of exceptions) {
      // Only escalate exceptions still in an unresolved state.
      if (
        exc.status === 'approved' ||
        exc.status === 'sent' ||
        exc.status === 'resolved' ||
        exc.status === 'escalated'
      ) {
        continue;
      }
      if (autoEscalatedRef.current.has(exc.id)) continue;
      const windowHours = rules.sla.windows_hours[exc.rejectionType] ?? 48;
      const status = computeSlaStatus(exc.dateRejected, now, windowHours);
      if (status.state === 'breached') {
        toEscalate.push(exc);
      }
    }
    if (toEscalate.length === 0) return;
    for (const exc of toEscalate) {
      autoEscalatedRef.current.add(exc.id);
      log('escalate', {
        documentId: exc.id,
        humanDecision: 'auto_escalate',
        metadata: {
          reason: 'sla_breach',
          slaDeadline: exc.slaDeadline,
          breachedAt: now.toISOString(),
          rejectionType: exc.rejectionType,
          windowHours: rules.sla.windows_hours[exc.rejectionType] ?? 48,
        },
      });
      addToast('warning', `SLA breached · ${exc.clientName} auto-escalated`);
    }
    setExceptions((prev) =>
      prev.map((e) =>
        toEscalate.some((x) => x.id === e.id) ? { ...e, status: 'escalated' as const } : e,
      ),
    );
  }, [now, exceptions, rules.sla, log, addToast]);

  // Derived state for selected exception
  const selectedExc = useMemo(
    () => exceptions.find((e) => e.id === selectedId) ?? null,
    [exceptions, selectedId]
  );
  const selectedDiagnosis = selectedId ? diagnoses.get(selectedId) ?? null : null;
  const selectedDraft = selectedId ? emailDrafts.get(selectedId) ?? null : null;
  const selectedCheckedSteps = selectedId ? checkedSteps.get(selectedId) ?? new Set<number>() : new Set<number>();
  const selectedAgentNotes = selectedId ? agentNotes.get(selectedId) ?? '' : '';
  const selectedReviewStatus = selectedId ? reviewStatuses.get(selectedId) ?? null : null;

  // Build client profile for AI call
  const getClientProfile = useCallback((clientId: string) => {
    const client = MOCK_CLIENTS.find((c) => c.id === clientId);
    if (!client) return {};
    return {
      firstName: client.firstName,
      lastName: client.lastName,
      preferredName: client.preferredName,
      email: client.email,
      dob: client.dob,
      wsAccountType: client.wsAccountType,
      wsAccountNumber: client.wsAccountNumber,
    };
  }, []);

  // Diagnose selected exception
  const handleDiagnose = useCallback(async () => {
    if (!selectedExc) return;

    const excId = selectedExc.id;
    analyzingIdRef.current = excId;
    setAnalysisStatus('analyzing');
    setAnalysisError(null);

    log('ai_analysis', {
      documentId: excId,
      metadata: { rejectionCode: selectedExc.rejectionCode, clientId: selectedExc.clientId },
    });

    const clientProfile = getClientProfile(selectedExc.clientId);
    const transferDetails = {
      transferId: selectedExc.transferId,
      sendingInstitution: selectedExc.sendingInstitution,
      accountType: selectedExc.accountType,
      transferAmount: selectedExc.transferAmount,
      dateRejected: selectedExc.dateRejected,
    };

    try {
      const result = await diagnoseException(
        selectedExc.rejectionCode,
        selectedExc.rejectionReason,
        clientProfile,
        transferDetails
      );

      // Only apply result if we're still looking at the same exception
      if (analyzingIdRef.current === excId) {
        setDiagnoses((prev) => new Map(prev).set(excId, result));
        setEmailDrafts((prev) =>
          new Map(prev).set(excId, {
            subject: result.draftedEmail.subject,
            body: result.draftedEmail.body,
          })
        );
        setExceptions((prev) =>
          prev.map((e) => (e.id === excId ? { ...e, status: 'diagnosed' as const } : e))
        );
        setAnalysisStatus('success');
      }
    } catch (err) {
      if (analyzingIdRef.current === excId) {
        setAnalysisError(err instanceof Error ? err.message : 'Diagnosis failed');
        setAnalysisStatus('error');
      }
    }
  }, [selectedExc, getClientProfile, log]);

  // Handle selecting an exception
  const handleSelectException = useCallback((id: string) => {
    setSelectedId(id);
    setAnalysisStatus('idle');
    setAnalysisError(null);
    analyzingIdRef.current = null;
  }, []);

  // Toggle batch selection
  const handleToggleBatch = useCallback((id: string) => {
    setBatchSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Batch approve
  const handleBatchApprove = useCallback(() => {
    setExceptions((prev) =>
      prev.map((e) => (batchSelected.has(e.id) ? { ...e, status: 'approved' as const } : e))
    );
    batchSelected.forEach((id) => {
      log('approve', { documentId: id, humanDecision: 'approve' });
    });
    addToast('success', `${batchSelected.size} exceptions approved`);
    setBatchSelected(new Set());
  }, [batchSelected, log, addToast]);

  // Toggle resolution step checkbox
  const handleToggleStep = useCallback(
    (index: number) => {
      if (!selectedId) return;
      setCheckedSteps((prev) => {
        const next = new Map(prev);
        const steps = new Set(prev.get(selectedId) ?? []);
        if (steps.has(index)) steps.delete(index);
        else steps.add(index);
        next.set(selectedId, steps);
        return next;
      });
    },
    [selectedId]
  );

  // Update agent notes
  const handleAgentNotesChange = useCallback(
    (notes: string) => {
      if (!selectedId) return;
      setAgentNotes((prev) => new Map(prev).set(selectedId, notes));
    },
    [selectedId]
  );

  // Update email draft
  const handleDraftChange = useCallback(
    (draft: { subject: string; body: string }) => {
      if (!selectedId) return;
      setEmailDrafts((prev) => new Map(prev).set(selectedId, draft));
    },
    [selectedId]
  );

  // Human review actions
  const handleReviewAction = useCallback(
    (action: ReviewAction, reason?: string, overrideVerdict?: string) => {
      if (!selectedId || !selectedExc) return;

      const statusMap: Record<string, TransferException['status']> = {
        approve: 'approved',
        reject: 'pending_diagnosis',
        escalate: 'pending_diagnosis',
        override: 'approved',
      };

      setExceptions((prev) =>
        prev.map((e) => (e.id === selectedId ? { ...e, status: statusMap[action] || 'pending_diagnosis' } : e))
      );

      setReviewStatuses((prev) => new Map(prev).set(selectedId, action));

      log(action, {
        documentId: selectedId,
        aiVerdict: selectedDiagnosis?.rejectionType,
        humanDecision: action,
        overrideReason: reason,
        metadata: {
          confidence: selectedDiagnosis?.confidence,
          requiresManualReview: selectedDiagnosis?.requiresManualReview,
          agentNotes: selectedAgentNotes,
          overrideVerdict,
        },
      });

      const messages: Record<ReviewAction, string> = {
        approve: 'Exception approved · ready for email dispatch',
        reject: `Exception rejected${reason ? `: ${reason}` : ''}`,
        escalate: 'Exception escalated to supervisor for review',
        override: `Diagnosis overridden${reason ? ` · ${reason}` : ''}`,
      };

      const toastTypes: Record<ReviewAction, 'success' | 'error' | 'warning' | 'info'> = {
        approve: 'success',
        reject: 'error',
        escalate: 'warning',
        override: 'info',
      };

      addToast(toastTypes[action], messages[action]);
    },
    [selectedId, selectedExc, selectedDiagnosis, selectedAgentNotes, log, addToast]
  );

  // Send email action
  const handleSendEmail = useCallback(() => {
    if (!selectedId) return;
    setExceptions((prev) =>
      prev.map((e) => (e.id === selectedId ? { ...e, status: 'sent' as const } : e))
    );
    log('send_email', { documentId: selectedId, metadata: { emailDraft: emailDrafts.get(selectedId) } });
    addToast('success', 'Client email sent successfully');
  }, [selectedId, emailDrafts, log, addToast]);

  // Keyboard shortcut
  useKeyboardShortcuts([
    {
      key: 'Enter',
      ctrl: true,
      handler: () => {
        if (selectedExc && !selectedDiagnosis && analysisStatus !== 'analyzing') {
          handleDiagnose();
        }
      },
      description: 'Diagnose exception',
    },
  ]);

  const isHighValue = selectedExc ? selectedExc.transferAmount > 100000 : false;
  const escalationRequired = isHighValue || (selectedDiagnosis?.requiresManualReview ?? false);

  // Determine display status for the detail panel
  const currentAnalysisStatus: AnalysisStatus = selectedDiagnosis
    ? 'success'
    : analysisStatus === 'analyzing' && analyzingIdRef.current === selectedId
      ? 'analyzing'
      : analysisStatus === 'error' && analyzingIdRef.current === selectedId
        ? 'error'
        : 'idle';

  return (
    <div className="max-w-7xl space-y-4">
      {/* Pipeline Progress */}
      <ProgressSteps
        steps={PIPELINE_STEPS}
        currentStep="exceptions"
        completedSteps={['ingestion', 'validation']}
      />

      {/* Master-Detail Layout · below lg, queue and detail swap in/out (see selectedId) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:min-h-[70vh]">
        {/* Left · Queue (40%) — hidden on mobile once an item is open */}
        <div className={`lg:col-span-5 ${selectedId ? 'hidden lg:block' : ''}`}>
          <ExceptionQueue
            exceptions={exceptions}
            selectedId={selectedId}
            onSelect={handleSelectException}
            batchSelected={batchSelected}
            onToggleBatch={handleToggleBatch}
            onBatchApprove={handleBatchApprove}
            now={now}
            slaWindowsHours={rules.sla.windows_hours}
          />
        </div>

        {/* Right · Detail (60%) — hidden on mobile until an item is open */}
        <div className={`lg:col-span-7 ${selectedId ? '' : 'hidden lg:block'}`}>
          {selectedExc ? (
            <div className="space-y-4">
              <button
                onClick={() => setSelectedId(null)}
                className="lg:hidden inline-flex items-center gap-1.5 text-sm font-medium text-ws-accent hover:text-ws-accent-dark"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to queue
              </button>
              <ExceptionDetail
                exception={selectedExc}
                diagnosis={selectedDiagnosis}
                analysisStatus={currentAnalysisStatus}
                analysisError={analysisError}
                onDiagnose={handleDiagnose}
                checkedSteps={selectedCheckedSteps}
                onToggleStep={handleToggleStep}
                agentNotes={selectedAgentNotes}
                onAgentNotesChange={handleAgentNotesChange}
                now={now}
                slaWindowHours={rules.sla.windows_hours[selectedExc.rejectionType] ?? 48}
              />

              {/* Email Draft */}
              {selectedDiagnosis && selectedDraft && (
                <EmailDraftEditor
                  draft={selectedDraft}
                  recipientName={selectedExc.clientName}
                  recipientEmail={
                    MOCK_CLIENTS.find((c) => c.id === selectedExc.clientId)?.email || 'client@example.com'
                  }
                  onDraftChange={handleDraftChange}
                />
              )}

              {/* Human Review Panel */}
              {selectedDiagnosis && (
                <>
                  <HumanReviewPanel
                    onAction={handleReviewAction}
                    disabled={!!selectedReviewStatus}
                    showOverride={true}
                    approveLabel="Approve & Queue Email"
                    rejectLabel="Reject"
                    escalateLabel="Escalate"
                    escalationRequired={escalationRequired}
                  />

                  {/* Send Email (shown after approval) */}
                  {selectedReviewStatus === 'approve' &&
                    exceptions.find((e) => e.id === selectedId)?.status === 'approved' && (
                      <Card className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-ws-dark">Ready to Send</p>
                          <p className="text-xs text-ws-muted">
                            Email draft approved · send to {selectedExc.clientName}
                          </p>
                        </div>
                        <Button onClick={handleSendEmail} className="gap-2">
                          Send Email
                        </Button>
                      </Card>
                    )}

                  {selectedReviewStatus && (
                    <button
                      onClick={() => {
                        setReviewStatuses((prev) => {
                          const next = new Map(prev);
                          next.delete(selectedId!);
                          return next;
                        });
                      }}
                      className="w-full text-center text-xs text-ws-accent hover:text-ws-accent-dark font-medium py-2"
                    >
                      Reset Review Decision
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <Card className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
              <div className="w-14 h-14 rounded-2xl bg-ws-light flex items-center justify-center mb-3">
                <Inbox className="w-7 h-7 text-ws-muted" />
              </div>
              <p className="text-sm font-medium text-ws-dark mb-1">No Exception Selected</p>
              <p className="text-xs text-ws-muted max-w-xs">
                Select an exception from the queue to view details, run AI diagnosis, and manage client communications
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
