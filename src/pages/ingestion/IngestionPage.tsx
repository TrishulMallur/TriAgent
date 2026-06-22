import { useState, useCallback } from 'react';
import { Card, Button, ScoreBar, Badge, ProgressSteps } from '@/components/ui';
import { DocumentInput } from '@/components/shared/DocumentInput';
import { PdfViewer } from '@/components/shared/PdfViewer';
import { AiAnalysisContainer } from '@/components/shared/AiAnalysisContainer';
import { HumanReviewPanel, type ReviewAction } from '@/components/shared/HumanReviewPanel';
import { useClaudeAnalysis } from '@/hooks/useClaudeAnalysis';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useToast } from '@/contexts/ToastContext';
import { extractTransferDocument } from '@/lib/ai';
import { MOCK_TRANSFER_DOCS } from '@/data/mockData';
import { FieldReviewTable } from './FieldReviewTable';
import { IngestionQueue } from './IngestionQueue';
import {
  FileSearch,
  AlertTriangle,
  ArrowRight,
  FileText,
  File as FileIcon,
  Files,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type IngestionMode = 'single' | 'bulk';

type ExtractionResult = Awaited<ReturnType<typeof extractTransferDocument>>;

interface CorrectedField {
  fieldName: string;
  value: string | null;
  confidence: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  reasoning: string;
  agentCorrected?: boolean;
  correctedValue?: string;
}

const PIPELINE_STEPS = [
  { id: 'ingestion', label: 'Ingestion' },
  { id: 'validation', label: 'Validation' },
  { id: 'exceptions', label: 'Exceptions' },
];

const SAMPLE_DOCUMENTS = [
  { id: 'clean_td', label: 'Clean · TD Canada Trust', text: MOCK_TRANSFER_DOCS.clean_td },
  { id: 'errors_rbc', label: 'Errors · RBC Direct', text: MOCK_TRANSFER_DOCS.errors_rbc },
  { id: 'missing_sig_questrade', label: 'Missing Signature · Questrade', text: MOCK_TRANSFER_DOCS.missing_sig_questrade },
];

export function IngestionPage() {
  const [mode, setMode] = useState<IngestionMode>('single');
  const [documentText, setDocumentText] = useState('');
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [fields, setFields] = useState<CorrectedField[]>([]);
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const { analyze, rerun, result, status, error, rawResponse, lastUsage, reset } = useClaudeAnalysis<ExtractionResult>(extractTransferDocument);
  const { log } = useAuditLog('transfer_ingestion');
  const { addToast } = useToast();
  const navigate = useNavigate();

  // Sync AI result into editable fields state
  const handleExtract = useCallback(() => {
    if (!documentText.trim()) return;
    setReviewStatus(null);
    setConfirmed(false);
    setFields([]);
    analyze(documentText).then(() => {
      // Fields synced via effect below
    });
    log('ai_analysis', { metadata: { documentLength: documentText.length } });
  }, [documentText, analyze, log]);

  // When result arrives, copy fields into local mutable state
  if (result && fields.length === 0 && status === 'success') {
    setFields(result.fields.map((f) => ({ ...f })));
  }

  // Keyboard shortcut
  useKeyboardShortcuts([
    { key: 'Enter', ctrl: true, handler: handleExtract, description: 'Extract fields' },
  ]);

  // Field correction handler
  const handleFieldCorrection = useCallback(
    (fieldName: string, correctedValue: string) => {
      setFields((prev) =>
        prev.map((f) =>
          f.fieldName === fieldName
            ? { ...f, agentCorrected: true, correctedValue }
            : f
        )
      );
    },
    []
  );

  // Human review actions
  const handleReviewAction = useCallback(
    (action: ReviewAction, reason?: string, overrideVerdict?: string) => {
      const correctionCount = fields.filter((f) => f.agentCorrected).length;

      if (action === 'approve') {
        setConfirmed(true);
      }

      log(action, {
        aiVerdict: undefined,
        humanDecision: action,
        overrideReason: reason,
        metadata: {
          fieldCount: fields.length,
          correctionCount,
          overallConfidence: result?.overallConfidence,
          sourceInstitution: result?.sourceInstitution,
          overrideVerdict,
        },
      });

      setReviewStatus(action);

      const messages: Record<ReviewAction, string> = {
        approve: `All ${fields.length} fields confirmed · ready for validation`,
        reject: `Document rejected${reason ? `: ${reason}` : ''}`,
        escalate: 'Document escalated to supervisor for review',
        override: `Extraction overridden${reason ? ` · ${reason}` : ''}`,
      };

      const toastTypes: Record<ReviewAction, 'success' | 'error' | 'warning' | 'info'> = {
        approve: 'success',
        reject: 'error',
        escalate: 'warning',
        override: 'info',
      };

      addToast(toastTypes[action], messages[action]);
    },
    [fields, result, log, addToast]
  );

  const handleReset = () => {
    setDocumentText('');
    setRawFile(null);
    setFields([]);
    setReviewStatus(null);
    setConfirmed(false);
    reset();
  };

  const lowConfidenceCount = fields.filter((f) => f.confidence < 0.5).length;
  const escalationRequired = lowConfidenceCount >= 3 || (result?.overallConfidence ?? 1) < 0.5;

  return (
    <div className="max-w-7xl space-y-6">
      {/* Pipeline Progress */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-ws-black flex items-center gap-2">
            <FileSearch className="w-5 h-5 text-ws-accent" />
            Stage 1 · Document Ingestion
          </h1>
          <p className="text-sm text-ws-muted mt-0.5">
            Extract all fields from a transfer document for review and correction
          </p>
        </div>
        <ProgressSteps steps={PIPELINE_STEPS} currentStep="ingestion" />
      </div>

      {/* Mode toggle · single vs bulk. Mode switch clears any in-flight single state. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            if (mode !== 'single') handleReset();
            setMode('single');
          }}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
            mode === 'single'
              ? 'border-ws-accent bg-ws-accent/10 text-ws-accent'
              : 'border-ws-border text-ws-muted hover:border-ws-accent/30 hover:text-ws-dark'
          }`}
        >
          <FileIcon className="w-4 h-4" />
          Single document
        </button>
        <button
          onClick={() => {
            if (mode !== 'bulk') handleReset();
            setMode('bulk');
          }}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
            mode === 'bulk'
              ? 'border-ws-accent bg-ws-accent/10 text-ws-accent'
              : 'border-ws-border text-ws-muted hover:border-ws-accent/30 hover:text-ws-dark'
          }`}
        >
          <Files className="w-4 h-4" />
          Bulk batch
        </button>
      </div>

      {/* Bulk mode short-circuits the rest of the single-document layout. */}
      {mode === 'bulk' ? <IngestionQueue /> : (
      <>
      {/* Two-Column Layout: Document Viewer + Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column · Document Input (55%) */}
        <div className="lg:col-span-7 space-y-4">
          <Card>
            <DocumentInput
              value={documentText}
              onChange={(text) => {
                setDocumentText(text);
                if (result) {
                  // Reset if user changes document after extraction
                  setFields([]);
                  setReviewStatus(null);
                  setConfirmed(false);
                  reset();
                }
              }}
              onFileSelected={(file) => {
                setRawFile(file);
                // Changing the source document should reset prior extraction state
                if (result) {
                  setFields([]);
                  setReviewStatus(null);
                  setConfirmed(false);
                  reset();
                }
              }}
              sampleDocuments={SAMPLE_DOCUMENTS}
              placeholder="Paste the transfer document text here, or upload a PDF/image file..."
              rows={14}
              label="Transfer Document"
            />
            <Button
              size="lg"
              onClick={handleExtract}
              disabled={!documentText.trim() || status === 'analyzing'}
              className="w-full mt-4 gap-2"
            >
              <FileSearch className="w-4 h-4" />
              {status === 'analyzing' ? 'Extracting Fields...' : 'Extract Fields'}
            </Button>
            <p className="text-2xs text-ws-muted text-center mt-2">
              Press Ctrl+Enter to extract
            </p>
          </Card>

          {/* Original Document Viewer · visible after extraction */}
          {status === 'success' && rawFile && (
            <PdfViewer file={rawFile} />
          )}
          {status === 'success' && !rawFile && documentText && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-ws-muted" />
                <h3 className="text-sm font-semibold text-ws-dark">Original Document</h3>
              </div>
              <div className="rounded-lg border border-ws-border bg-ws-light/50 p-4 max-h-64 overflow-y-auto">
                <pre className="text-xs text-ws-dark whitespace-pre-wrap font-mono leading-relaxed">
                  {documentText}
                </pre>
              </div>
            </Card>
          )}
        </div>

        {/* Right Column · Extraction Results (45%) */}
        <div className="lg:col-span-5 space-y-4">
          <AiAnalysisContainer
            status={status}
            error={error}
            rawResponse={rawResponse}
            onRetry={handleExtract}
            onRerun={rerun}
            usage={lastUsage}
            idleMessage="Paste or upload a transfer document, then extract fields for review"
          >
            {result && (
              <div className="space-y-4">
                {/* Extraction Summary */}
                <Card>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-ws-dark">Extraction Summary</h3>
                      {reviewStatus && (
                        <span className="text-xs font-medium text-ws-muted capitalize">
                          {reviewStatus === 'approve'
                            ? 'Confirmed'
                            : reviewStatus === 'reject'
                              ? 'Rejected'
                              : reviewStatus === 'escalate'
                                ? 'Escalated'
                                : 'Overridden'}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-2xs text-ws-muted">Source Institution</p>
                        <p className="text-sm font-medium text-ws-dark">{result.sourceInstitution}</p>
                      </div>
                      <div>
                        <p className="text-2xs text-ws-muted">Document Type</p>
                        <p className="text-sm font-medium text-ws-dark capitalize">
                          {result.documentType.replace(/_/g, ' ')}
                        </p>
                      </div>
                    </div>
                    <ScoreBar
                      score={Math.round(result.overallConfidence * 100)}
                      label="Overall Confidence"
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="default">{fields.length} fields</Badge>
                      {fields.filter((f) => f.value === null).length > 0 && (
                        <Badge variant="error">
                          {fields.filter((f) => f.value === null).length} missing
                        </Badge>
                      )}
                      {fields.filter((f) => f.agentCorrected).length > 0 && (
                        <Badge variant="info">
                          {fields.filter((f) => f.agentCorrected).length} corrected
                        </Badge>
                      )}
                    </div>

                    {/* Warnings */}
                    {result.warnings.length > 0 && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          <p className="text-xs font-semibold text-amber-700">Warnings</p>
                        </div>
                        <ul className="space-y-0.5">
                          {result.warnings.map((w, i) => (
                            <li key={i} className="text-xs text-amber-700">
                              {w}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </Card>

                {/* Auto-escalation banner */}
                {escalationRequired && (
                  <div className="flex items-center gap-2 rounded-lg bg-verdict-fail-bg px-4 py-3 border border-verdict-fail/20">
                    <AlertTriangle className="w-4 h-4 text-verdict-fail flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-verdict-fail">Escalation Required</p>
                      <p className="text-2xs text-verdict-fail/80">
                        {lowConfidenceCount >= 3
                          ? `${lowConfidenceCount} fields have low confidence · supervisor review required`
                          : 'Overall confidence below 50% · supervisor review required'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </AiAnalysisContainer>
        </div>
      </div>

      {/* Field Review Table · Full Width below the two-column section */}
      {status === 'success' && fields.length > 0 && (
        <>
          <FieldReviewTable
            fields={fields}
            onFieldCorrection={handleFieldCorrection}
          />

          {/* Human Review Panel */}
          {!confirmed && (
            <HumanReviewPanel
              onAction={handleReviewAction}
              disabled={!!reviewStatus}
              showOverride={true}
              approveLabel="Confirm All Fields"
              rejectLabel="Flag as Unreadable"
              escalateLabel="Escalate"
              escalationRequired={escalationRequired}
            />
          )}

          {/* Post-confirmation: Proceed to Validation */}
          {confirmed && (
            <Card className="border-verdict-pass/30 bg-verdict-pass-bg/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-verdict-pass">
                    All fields confirmed
                  </p>
                  <p className="text-xs text-ws-muted mt-0.5">
                    {fields.length} fields extracted
                    {fields.filter((f) => f.agentCorrected).length > 0 &&
                      ` (${fields.filter((f) => f.agentCorrected).length} corrected by agent)`}
                    {' · ready to proceed to Stage 2 validation'}
                  </p>
                </div>
                <Button
                  onClick={() => navigate('/transfer/validation')}
                  className="gap-2"
                >
                  Proceed to Validation
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          )}

          {/* Reset */}
          {reviewStatus && (
            <button
              onClick={handleReset}
              className="w-full text-center text-xs text-ws-accent hover:text-ws-accent-dark font-medium py-2"
            >
              Process Another Document
            </button>
          )}
        </>
      )}
      </>
      )}
    </div>
  );
}
