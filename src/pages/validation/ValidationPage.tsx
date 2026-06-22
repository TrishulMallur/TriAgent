import { useState, useCallback } from 'react';
import { Card, Button, VerdictBadge, RiskScore, ProgressSteps } from '@/components/ui';
import { Badge } from '@/components/ui/Badge';
import { TextArea } from '@/components/ui/TextArea';
import { DocumentInput } from '@/components/shared/DocumentInput';
import { AiAnalysisContainer } from '@/components/shared/AiAnalysisContainer';
import { HumanReviewPanel, type ReviewAction } from '@/components/shared/HumanReviewPanel';
import { useClaudeAnalysis } from '@/hooks/useClaudeAnalysis';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useToast } from '@/contexts/ToastContext';
import { useRules } from '@/contexts/RulesContext';
import { validateTransferDocument } from '@/lib/ai';
import { MOCK_TRANSFER_DOCS } from '@/data/mockData';
import { ValidationChecksTable } from './ValidationChecksTable';
import { ExtractedFieldsSummary } from './ExtractedFieldsSummary';
import { AlertTriangle, ShieldCheck, Mail, DollarSign } from 'lucide-react';
import type { Verdict } from '@/types';

type AnalysisResult = Awaited<ReturnType<typeof validateTransferDocument>>;

const PIPELINE_STEPS = [
  { id: 'ingestion', label: 'Ingestion' },
  { id: 'validation', label: 'Validation' },
  { id: 'exceptions', label: 'Exceptions' },
];

const SAMPLE_DOCUMENTS = [
  { id: 'clean_td', label: 'Clean TD Transfer (should pass)', text: MOCK_TRANSFER_DOCS.clean_td },
  { id: 'errors_rbc', label: 'RBC · Multiple Errors (should fail)', text: MOCK_TRANSFER_DOCS.errors_rbc },
  { id: 'missing_sig_questrade', label: 'Questrade · Missing Signature', text: MOCK_TRANSFER_DOCS.missing_sig_questrade },
];

export function ValidationPage() {
  // High-value threshold is driven by RulesContext so the slider in
  // Settings → Rules controls when the banner appears.
  const [documentText, setDocumentText] = useState('');
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followUpSubject, setFollowUpSubject] = useState('');
  const [followUpBody, setFollowUpBody] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [prevVerdict, setPrevVerdict] = useState<string | null>(null);

  const { analyze, rerun, result, status, error, rawResponse, lastUsage, reset } = useClaudeAnalysis<AnalysisResult>(validateTransferDocument);
  const { log } = useAuditLog('transfer_validation');
  const { addToast } = useToast();
  const { rules } = useRules();
  const highValueThreshold = rules.transfer.thresholds.high_value_threshold;

  // Generate follow-up draft for fail verdicts
  const generateFollowUpDraft = useCallback((analysisResult: AnalysisResult) => {
    const failingChecks = analysisResult.checks.filter((c) => c.status === 'fail');
    const institution = analysisResult.extractedFields?.sendingInstitution || 'the sending institution';
    const clientName = analysisResult.extractedFields?.clientName || 'the account holder';

    setFollowUpSubject(
      `Action Required: Transfer Document Issues · ${clientName}`
    );
    setFollowUpBody(
      `Dear ${institution} Transfer Team,\n\n` +
      `We are writing regarding the account transfer request for ${clientName}. Our validation process has identified the following critical issues that must be resolved before the transfer can proceed:\n\n` +
      failingChecks
        .map((c, i) => `${i + 1}. ${c.fieldName}: ${c.errorDescription || 'Validation failed'} (Expected: ${c.expectedFormat})`)
        .join('\n') +
      `\n\nPlease provide corrected documentation addressing the above issues at your earliest convenience.\n\n` +
      `If you have any questions, please do not hesitate to contact our Transfer Operations team.\n\n` +
      `Best regards,\nTriagent Transfer Operations`
    );
    setShowFollowUp(true);
  }, []);

  const handleValidate = useCallback(() => {
    if (!documentText.trim()) return;
    setReviewStatus(null);
    setShowFollowUp(false);
    setPrevVerdict(null);
    analyze(documentText);
    log('ai_analysis', { metadata: { docLength: documentText.length } });
  }, [documentText, analyze, log]);

  // Keyboard shortcut: Ctrl+Enter to validate
  useKeyboardShortcuts([
    { key: 'Enter', ctrl: true, handler: handleValidate, description: 'Validate document' },
  ]);

  // Auto-generate follow-up when verdict is fail
  if (result && result.verdict.verdict === 'fail' && prevVerdict !== 'fail') {
    setPrevVerdict(result.verdict.verdict);
    generateFollowUpDraft(result);
  } else if (result && result.verdict.verdict !== 'fail' && prevVerdict !== result.verdict.verdict) {
    setPrevVerdict(result.verdict.verdict);
  }

  // Derive escalation and high-value flags from result
  const verdictValue = (result?.verdict?.verdict || 'needs_review') as Verdict;
  const riskScore = result?.verdict?.riskScore ?? 0;
  const isFailVerdict = verdictValue === 'fail';
  const isHighValue = (() => {
    if (!result?.extractedFields?.transferAmount) return false;
    const amount = String(result.extractedFields.transferAmount).replace(/[^0-9.]/g, '');
    return parseFloat(amount) > highValueThreshold;
  })();
  const escalationRequired = isFailVerdict || riskScore >= 8;
  const autoEscalateHighValue = isHighValue && !isFailVerdict;

  // Count check statuses
  const checkCounts = result
    ? {
        pass: result.checks.filter((c) => c.status === 'pass').length,
        warning: result.checks.filter((c) => c.status === 'warning').length,
        fail: result.checks.filter((c) => c.status === 'fail').length,
      }
    : null;

  // Human review actions
  const handleReviewAction = useCallback(
    (action: ReviewAction, reason?: string, overrideVerdict?: string) => {
      log(action, {
        aiVerdict: verdictValue,
        humanDecision: action,
        overrideReason: reason,
        metadata: {
          riskScore,
          checkCounts,
          overrideVerdict,
          isHighValue,
        },
      });

      setReviewStatus(action);

      const messages: Record<ReviewAction, string> = {
        approve: 'Transfer approved · validation complete',
        reject: `Transfer rejected${reason ? `: ${reason}` : ''}`,
        escalate: 'Transfer escalated to supervisor for review',
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
    [verdictValue, riskScore, checkCounts, isHighValue, log, addToast]
  );

  const handleReset = () => {
    setDocumentText('');
    setReviewStatus(null);
    setShowFollowUp(false);
    setFollowUpSubject('');
    setFollowUpBody('');
    setPrevVerdict(null);
    reset();
  };

  return (
    <div className="max-w-7xl space-y-6">
      {/* Header with Pipeline Progress */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ws-black">Stage 2 · Validation & Compliance</h1>
          <p className="text-xs text-ws-muted mt-0.5">
            Validate transfer documents against ATON/ACATS rules
          </p>
        </div>
        <ProgressSteps steps={PIPELINE_STEPS} currentStep="validation" />
      </div>

      {/* Document Input */}
      <Card>
        <DocumentInput
          value={documentText}
          onChange={(text) => {
            setDocumentText(text);
            setReviewStatus(null);
          }}
          sampleDocuments={SAMPLE_DOCUMENTS}
          placeholder="Paste transfer document text here for validation..."
          rows={10}
          label="Transfer Document"
        />
        <div className="mt-4 flex items-center gap-3">
          <Button
            onClick={handleValidate}
            disabled={!documentText.trim() || status === 'analyzing'}
            className="gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            Validate Document
          </Button>
          <span className="text-2xs text-ws-muted">Ctrl+Enter</span>
        </div>
      </Card>

      {/* Results Area */}
      <AiAnalysisContainer
        status={status}
        error={error}
        rawResponse={rawResponse}
        onRetry={handleValidate}
        onRerun={rerun}
        usage={lastUsage}
        idleMessage="Submit a transfer document for ATON/ACATS validation"
      >
        {result && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Main Content */}
            <div className={showSidebar ? 'lg:col-span-8 space-y-4' : 'lg:col-span-12 space-y-4'}>
              {/* Verdict Card */}
              <Card>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <RiskScore score={riskScore} />
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <VerdictBadge verdict={verdictValue} size="lg" />
                        {reviewStatus && (
                          <span className="text-xs font-medium text-ws-muted capitalize">
                            {reviewStatus === 'approve'
                              ? 'Approved'
                              : reviewStatus === 'reject'
                              ? 'Rejected'
                              : reviewStatus === 'escalate'
                              ? 'Escalated'
                              : 'Overridden'}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-ws-dark">{result.verdict.summary}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {checkCounts && (
                      <>
                        <Badge variant="success" size="sm">{checkCounts.pass} pass</Badge>
                        {checkCounts.warning > 0 && (
                          <Badge variant="warning" size="sm">{checkCounts.warning} warn</Badge>
                        )}
                        {checkCounts.fail > 0 && (
                          <Badge variant="error" size="sm">{checkCounts.fail} fail</Badge>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </Card>

              {/* Auto-escalation banner · Fail verdict */}
              {escalationRequired && (
                <div className="flex items-center gap-2 rounded-lg bg-verdict-fail-bg px-4 py-3 border border-verdict-fail/20">
                  <AlertTriangle className="w-4 h-4 text-verdict-fail flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-verdict-fail">Escalation Required</p>
                    <p className="text-2xs text-verdict-fail/80">
                      {isFailVerdict
                        ? 'Validation failed · this transfer must be escalated to a supervisor'
                        : `Risk score ${riskScore}/10 exceeds threshold · supervisor review required`}
                    </p>
                  </div>
                </div>
              )}

              {/* Auto-escalation banner · High value */}
              {autoEscalateHighValue && (
                <div className="flex items-center gap-2 rounded-lg bg-verdict-review-bg px-4 py-3 border border-verdict-review/20">
                  <DollarSign className="w-4 h-4 text-verdict-review flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-verdict-review">High-Value Transfer</p>
                    <p className="text-2xs text-verdict-review/80">
                      Transfer amount exceeds ${highValueThreshold.toLocaleString()} · flagged for supervisor review
                    </p>
                  </div>
                </div>
              )}

              {/* Validation Checks Table */}
              <ValidationChecksTable checks={result.checks} />

              {/* Follow-up Draft (visible when verdict is fail) */}
              {showFollowUp && (
                <Card>
                  <div className="flex items-center gap-2 mb-3">
                    <Mail className="w-4 h-4 text-ws-accent" />
                    <h4 className="text-sm font-semibold text-ws-dark">
                      Follow-up Communication Draft
                    </h4>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-ws-muted mb-1">
                        Subject
                      </label>
                      <input
                        type="text"
                        value={followUpSubject}
                        onChange={(e) => setFollowUpSubject(e.target.value)}
                        className="w-full rounded-lg border border-ws-border bg-white px-3 py-2 text-sm text-ws-dark focus:outline-none focus:ring-2 focus:ring-ws-accent/50"
                      />
                    </div>
                    <TextArea
                      label="Body"
                      value={followUpBody}
                      onChange={(e) => setFollowUpBody(e.target.value)}
                      rows={8}
                      className="max-h-48 lg:max-h-none"
                    />
                    <p className="text-2xs text-ws-muted">
                      This draft was auto-generated based on the failing validation checks. Edit as needed before sending.
                    </p>
                  </div>
                </Card>
              )}

              {/* Human Review Panel */}
              <HumanReviewPanel
                onAction={handleReviewAction}
                disabled={!!reviewStatus}
                showOverride={true}
                approveLabel="Approve Transfer"
                rejectLabel="Reject Transfer"
                escalateLabel="Escalate"
                escalationRequired={escalationRequired}
              />

              {/* Reset button */}
              {reviewStatus && (
                <button
                  onClick={handleReset}
                  className="w-full text-center text-xs text-ws-accent hover:text-ws-accent-dark font-medium py-2"
                >
                  Start New Validation
                </button>
              )}
            </div>

            {/* Right Sidebar · Extracted Fields */}
            {showSidebar && (
              <div className="lg:col-span-4 space-y-4">
                <ExtractedFieldsSummary fields={result.extractedFields} />
                <button
                  onClick={() => setShowSidebar(false)}
                  className="w-full text-center text-2xs text-ws-muted hover:text-ws-dark"
                >
                  Hide sidebar
                </button>
              </div>
            )}

            {/* Show sidebar toggle when hidden */}
            {!showSidebar && (
              <div className="lg:col-span-12">
                <button
                  onClick={() => setShowSidebar(true)}
                  className="text-2xs text-ws-accent hover:text-ws-accent-dark font-medium"
                >
                  Show extracted fields sidebar
                </button>
              </div>
            )}
          </div>
        )}
      </AiAnalysisContainer>
    </div>
  );
}
