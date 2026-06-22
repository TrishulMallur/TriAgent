import { useState } from 'react';
import { Card, Button, Badge, ConfidenceIndicator } from '@/components/ui';
import { TextArea } from '@/components/ui/TextArea';
import { AiAnalysisContainer } from '@/components/shared/AiAnalysisContainer';
import type { TransferException } from '@/types';
import type { AnalysisStatus } from '@/components/shared/AiAnalysisContainer';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { computeSlaStatus, formatSlaCountdown } from '@/lib/sla';
import {
  Brain,
  AlertTriangle,
  CheckCircle2,
  Circle,
  FileText,
  Building2,
  DollarSign,
  Calendar,
  User,
  Clock,
} from 'lucide-react';

interface DiagnosisResult {
  rootCause: string;
  rejectionType: string;
  resolutionSteps: string[];
  draftedEmail: { subject: string; body: string };
  internalNotes: string;
  confidence: 'high' | 'medium' | 'low';
  requiresManualReview: boolean;
  manualReviewReason?: string;
}

interface ExceptionDetailProps {
  exception: TransferException;
  diagnosis: DiagnosisResult | null;
  analysisStatus: AnalysisStatus;
  analysisError: string | null;
  onDiagnose: () => void;
  checkedSteps: Set<number>;
  onToggleStep: (index: number) => void;
  agentNotes: string;
  onAgentNotesChange: (notes: string) => void;
  /** Reference "now" · ticked every 60s from the parent. */
  now: Date;
  /** SLA window in hours for THIS exception's rejection type. */
  slaWindowHours: number;
}

const REJECTION_TYPE_LABELS: Record<string, { label: string; variant: 'error' | 'warning' | 'info' | 'default' }> = {
  name_mismatch: { label: 'Name Mismatch', variant: 'error' },
  insufficient_fee: { label: 'Insufficient Fee', variant: 'warning' },
  account_type_conflict: { label: 'Account Type Conflict', variant: 'error' },
  missing_signature: { label: 'Missing Signature', variant: 'error' },
  expired_authorization: { label: 'Expired Authorization', variant: 'warning' },
  account_closed: { label: 'Account Closed', variant: 'error' },
  other: { label: 'Other', variant: 'default' },
};

export function ExceptionDetail({
  exception,
  diagnosis,
  analysisStatus,
  analysisError,
  onDiagnose,
  checkedSteps,
  onToggleStep,
  agentNotes,
  onAgentNotesChange,
  now,
  slaWindowHours,
}: ExceptionDetailProps) {
  const isHighValue = exception.transferAmount > 100000;
  const sla = computeSlaStatus(exception.dateRejected, now, slaWindowHours);
  const isResolved =
    exception.status === 'approved' ||
    exception.status === 'sent' ||
    exception.status === 'resolved' ||
    exception.status === 'escalated';

  return (
    <div className="space-y-4">
      {/* Exception Summary */}
      <Card>
        <div className="flex items-start justify-between gap-2 flex-wrap mb-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-ws-dark">{exception.clientName}</h2>
            <p className="text-xs text-ws-muted mt-0.5">
              Exception ID: {exception.id} &middot; Transfer: {exception.transferId}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isHighValue && (
              <Badge variant="error" size="md" dot>
                High Value · Supervisor Review
              </Badge>
            )}
            <span className="text-xs font-mono text-ws-accent bg-ws-accent/5 px-2 py-1 rounded">
              {exception.rejectionCode}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-ws-muted" />
            <div>
              <p className="text-2xs text-ws-muted">Sending Institution</p>
              <p className="text-xs font-medium text-ws-dark">{exception.sendingInstitution}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-ws-muted" />
            <div>
              <p className="text-2xs text-ws-muted">Account Type</p>
              <p className="text-xs font-medium text-ws-dark">{exception.accountType}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DollarSign className="w-3.5 h-3.5 text-ws-muted" />
            <div>
              <p className="text-2xs text-ws-muted">Transfer Amount</p>
              <p className="text-xs font-medium text-ws-dark">{formatCurrency(exception.transferAmount)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-ws-muted" />
            <div>
              <p className="text-2xs text-ws-muted">Date Rejected</p>
              <p className="text-xs font-medium text-ws-dark">{formatDate(exception.dateRejected)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-verdict-fail-bg/40 border border-verdict-fail/10 px-4 py-3">
          <p className="text-xs font-semibold text-verdict-fail mb-1">Rejection Reason</p>
          <p className="text-sm text-ws-dark">{exception.rejectionReason}</p>
        </div>
      </Card>

      {/* Live SLA countdown · hidden once the exception is resolved/escalated/sent. */}
      {!isResolved && (
        <Card
          className={
            sla.state === 'breached'
              ? 'border-verdict-fail/30 bg-verdict-fail-bg/20'
              : sla.state === 'at_risk'
                ? 'border-verdict-fail/20 bg-verdict-fail-bg/10'
                : sla.state === 'approaching'
                  ? 'border-verdict-review/20 bg-verdict-review-bg/10'
                  : 'border-verdict-pass/20 bg-verdict-pass-bg/10'
          }
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Clock
                className={
                  sla.state === 'breached' || sla.state === 'at_risk'
                    ? 'w-4 h-4 text-verdict-fail'
                    : sla.state === 'approaching'
                      ? 'w-4 h-4 text-verdict-review'
                      : 'w-4 h-4 text-verdict-pass'
                }
              />
              <div>
                <p className="text-xs font-semibold text-ws-dark">
                  {sla.state === 'breached'
                    ? `SLA: BREACHED ${formatSlaCountdown(sla.remainingMs)} ago`
                    : `SLA: ${formatSlaCountdown(sla.remainingMs)} remaining`}
                </p>
                <p className="text-2xs text-ws-muted">
                  {Math.round(slaWindowHours)}h window for {exception.rejectionType.replace(/_/g, ' ')}
                </p>
              </div>
            </div>
            <Badge
              variant={
                sla.state === 'breached' || sla.state === 'at_risk'
                  ? 'error'
                  : sla.state === 'approaching'
                    ? 'warning'
                    : 'success'
              }
              size="sm"
              dot
            >
              {sla.state === 'on_track'
                ? 'On Track'
                : sla.state === 'approaching'
                  ? 'Approaching'
                  : sla.state === 'at_risk'
                    ? 'At Risk'
                    : 'Breached'}
            </Badge>
          </div>
        </Card>
      )}

      {/* Auto-escalation banner for high-value transfers */}
      {isHighValue && (
        <div className="flex items-center gap-2 rounded-lg bg-verdict-fail-bg px-4 py-3 border border-verdict-fail/20">
          <AlertTriangle className="w-4 h-4 text-verdict-fail flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-verdict-fail">Escalation Required</p>
            <p className="text-2xs text-verdict-fail/80">
              Transfer amount exceeds $100,000 · supervisor review required before approval
            </p>
          </div>
        </div>
      )}

      {/* Diagnose Button (shown when no diagnosis exists) */}
      {analysisStatus === 'idle' && !diagnosis && (
        <Card className="text-center py-8">
          <Brain className="w-8 h-8 text-ws-muted mx-auto mb-3" />
          <p className="text-sm text-ws-muted mb-4">
            Run AI diagnosis to determine root cause and draft client communication
          </p>
          <Button onClick={onDiagnose} className="gap-2">
            <Brain className="w-4 h-4" />
            Diagnose with AI
          </Button>
        </Card>
      )}

      {/* AI Analysis Container (loading/error states) */}
      {(analysisStatus === 'analyzing' || analysisStatus === 'error') && (
        <AiAnalysisContainer
          status={analysisStatus}
          error={analysisError}
          onRetry={onDiagnose}
        >
          <div />
        </AiAnalysisContainer>
      )}

      {/* Diagnosis Results */}
      {diagnosis && (
        <div className="space-y-4">
          {/* Root Cause Card */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-ws-accent" />
                <h3 className="text-sm font-semibold text-ws-dark">AI Diagnosis</h3>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={REJECTION_TYPE_LABELS[diagnosis.rejectionType]?.variant || 'default'}
                  size="md"
                >
                  {REJECTION_TYPE_LABELS[diagnosis.rejectionType]?.label || diagnosis.rejectionType}
                </Badge>
                <ConfidenceIndicator level={diagnosis.confidence} />
              </div>
            </div>

            <p className="text-sm text-ws-dark leading-relaxed">{diagnosis.rootCause}</p>

            {diagnosis.requiresManualReview && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-verdict-review-bg/50 px-3 py-2 border border-verdict-review/20">
                <AlertTriangle className="w-3.5 h-3.5 text-verdict-review flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-verdict-review">Manual Review Recommended</p>
                  <p className="text-2xs text-verdict-review/80">
                    {diagnosis.manualReviewReason || 'AI confidence is low · verify diagnosis before proceeding'}
                  </p>
                </div>
              </div>
            )}
          </Card>

          {/* Resolution Steps */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-ws-accent" />
              <h3 className="text-sm font-semibold text-ws-dark">Resolution Steps</h3>
              <span className="text-xs text-ws-muted ml-auto">
                {checkedSteps.size}/{diagnosis.resolutionSteps.length} completed
              </span>
            </div>

            <div className="space-y-1">
              {diagnosis.resolutionSteps.map((step, i) => {
                const isChecked = checkedSteps.has(i);
                return (
                  <button
                    key={i}
                    onClick={() => onToggleStep(i)}
                    className="w-full flex items-start gap-3 py-2 px-2 rounded-lg text-left hover:bg-ws-light/50 transition-colors"
                  >
                    {isChecked ? (
                      <CheckCircle2 className="w-4 h-4 text-verdict-pass flex-shrink-0 mt-0.5" />
                    ) : (
                      <Circle className="w-4 h-4 text-ws-border flex-shrink-0 mt-0.5" />
                    )}
                    <span
                      className={`text-sm ${
                        isChecked ? 'text-ws-muted line-through' : 'text-ws-dark'
                      }`}
                    >
                      <span className="font-medium text-ws-accent mr-1.5">{i + 1}.</span>
                      {step}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Internal Notes */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <User className="w-4 h-4 text-ws-accent" />
              <h3 className="text-sm font-semibold text-ws-dark">Internal Notes</h3>
            </div>

            <div className="rounded-lg bg-ws-light/50 px-3 py-2 mb-3">
              <p className="text-2xs font-medium text-ws-muted mb-1">AI Notes</p>
              <p className="text-sm text-ws-dark leading-relaxed">{diagnosis.internalNotes}</p>
            </div>

            <TextArea
              label="Agent Notes"
              value={agentNotes}
              onChange={(e) => onAgentNotesChange(e.target.value)}
              placeholder="Add any additional notes for this exception..."
              rows={3}
              helperText="These notes are visible to all team members"
            />
          </Card>
        </div>
      )}
    </div>
  );
}
