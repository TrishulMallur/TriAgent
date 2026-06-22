// ============================================================
// ROLES & ACCESS
// ============================================================
export type UserRole = 'ops_agent' | 'advisor' | 'compliance' | 'manager' | 'admin';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  team: string;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  ops_agent: 'Operations Agent',
  advisor: 'Financial Advisor',
  compliance: 'Compliance Officer',
  manager: 'Manager / Supervisor',
  admin: 'Admin',
};

export const ROLE_MODULES: Record<UserRole, string[]> = {
  ops_agent: ['transfer-pipeline', 'analytics'],
  advisor: ['advisor-notes', 'analytics'],
  compliance: ['transfer-pipeline', 'advisor-notes', 'analytics'],
  manager: ['transfer-pipeline', 'advisor-notes', 'analytics'],
  admin: ['transfer-pipeline', 'advisor-notes', 'analytics', 'settings'],
};

// ============================================================
// VERDICTS & SCORING
// ============================================================
export type Verdict = 'pass' | 'needs_review' | 'fail';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface VerdictResult {
  verdict: Verdict;
  riskScore: number; // 1-10
  summary: string;
}

// ============================================================
// TRANSFER PIPELINE · STAGE 1: INGESTION
// ============================================================
export interface ExtractedField {
  fieldName: string;
  value: string | null;
  confidence: number; // 0.0 - 1.0
  confidenceLevel: ConfidenceLevel;
  reasoning: string;
  agentCorrected?: boolean;
  correctedValue?: string;
}

export interface IngestionResult {
  id: string;
  documentId: string;
  timestamp: string;
  fields: ExtractedField[];
  sourceInstitution: string;
  documentType: string;
  overallConfidence: number;
  status: 'pending_review' | 'confirmed' | 'rejected';
  reviewedBy?: string;
}

// ============================================================
// TRANSFER PIPELINE · STAGE 2: VALIDATION
// ============================================================
export interface ValidationCheck {
  category: string;
  fieldName: string;
  expectedFormat: string;
  actualValue: string;
  status: 'pass' | 'fail' | 'warning';
  errorDescription?: string;
  confidence: ConfidenceLevel;
  rule: string;
}

export interface ValidationResult {
  id: string;
  documentId: string;
  timestamp: string;
  checks: ValidationCheck[];
  verdict: VerdictResult;
  status: 'pending_review' | 'approved' | 'rejected' | 'escalated';
  reviewedBy?: string;
  overrideReason?: string;
}

// ============================================================
// TRANSFER PIPELINE · STAGE 3: EXCEPTION RESOLUTION
// ============================================================
export type RejectionType =
  | 'name_mismatch'
  | 'insufficient_fee'
  | 'account_type_conflict'
  | 'missing_signature'
  | 'expired_authorization'
  | 'account_closed'
  | 'other';

export interface TransferException {
  id: string;
  transferId: string;
  clientId: string;
  clientName: string;
  rejectionCode: string;
  rejectionReason: string;
  rejectionType: RejectionType;
  sendingInstitution: string;
  accountType: string;
  transferAmount: number;
  dateRejected: string;
  status: 'pending_diagnosis' | 'diagnosed' | 'email_drafted' | 'approved' | 'sent' | 'resolved' | 'escalated';
  /**
   * SLA deadline as ISO 8601 timestamp. Computed at seed time from
   * dateRejected + the SLA window for this exception's rejectionType
   * (see `RulesContext.sla.windows_hours`). Once SLA tracking is active,
   * exceptions that cross this deadline are auto-escalated.
   */
  slaDeadline?: string;
}

export interface ExceptionDiagnosis {
  exceptionId: string;
  rootCause: string;
  resolutionSteps: string[];
  draftedEmail: {
    subject: string;
    body: string;
    recipientName: string;
    recipientEmail: string;
  };
  internalNotes: string;
  confidence: ConfidenceLevel;
  requiresManualReview: boolean;
}

// ============================================================
// ADVISOR NOTES
// ============================================================
export interface ComplianceFlag {
  id: string;
  element: string;
  status: 'present' | 'missing' | 'insufficient';
  severity: 'critical' | 'warning' | 'info';
  description: string;
  suggestion: string;
  confidence: ConfidenceLevel;
  ciroRule: string;
}

export interface NoteComplianceResult {
  id: string;
  timestamp: string;
  advisorId: string;
  noteText: string;
  flags: ComplianceFlag[];
  overallScore: number; // 0-100
  verdict: 'compliant' | 'needs_completion' | 'non_compliant';
  checklist: {
    item: string;
    present: boolean;
    details: string;
  }[];
  status: 'draft' | 'submitted' | 'approved';
}

// ============================================================
// ANALYTICS & AUDIT
// ============================================================
export interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  module: 'transfer_ingestion' | 'transfer_validation' | 'transfer_exception' | 'advisor_notes';
  documentId: string;
  action: 'ai_analysis' | 'human_review' | 'approve' | 'reject' | 'override' | 'escalate' | 'submit' | 'send_email';
  aiVerdict?: Verdict;
  humanDecision?: string;
  overrideReason?: string;
  metadata?: Record<string, unknown>;
}

export interface AnalyticsData {
  volumeByDay: { date: string; ingestion: number; validation: number; exception: number; notes: number }[];
  verdictBreakdown: { module: string; pass: number; needsReview: number; fail: number }[];
  commonErrors: { error: string; count: number; module: string; trend: 'up' | 'down' | 'stable' }[];
  pipelineHealth: { stage: string; count: number; avgTimeMinutes: number }[];
  overrides: { date: string; count: number; reasons: Record<string, number> }[];
}
