import type { LLMProvider, StreamEvent, TokenUsage } from '../llm-provider';

/**
 * Approximate token count from a UTF-8 string. Real tokenizers are
 * model-specific (cl100k, BPE, SentencePiece, etc.) but for the mock
 * provider's "plausible numbers" goal a 4-chars-per-token heuristic is fine.
 */
function approxTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

/** Build a fabricated TokenUsage for the mock provider. */
function fabricateUsage(systemPrompt: string, userMessage: string, output: string, durationMs: number): TokenUsage {
  const inputTokens = approxTokens(systemPrompt) + approxTokens(userMessage);
  const outputTokens = approxTokens(output);
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    durationMs,
  };
}

/**
 * Mock provider returns realistic hardcoded responses for each analysis type.
 * Used when no real provider is configured (full demo mode).
 *
 * Routing strategy:
 *   1. Branch by stable substrings of the system prompt (the four flows
 *      in src/lib/ai.ts each have a uniquely identifiable phrase).
 *   2. Inside each branch, sub-route by content in the user message.
 *   3. If no system prompt matches, throw · silent CIRO fallback was masking bugs.
 */

// ============================================================
// ADVISOR NOTE MOCKS
// ============================================================

const ADVISOR_NOTE_WEI_ZHANG = {
  checklist: [
    { item: 'Client investment objectives', present: true, details: 'Growth mentioned, but no specific objective type (income, capital preservation, etc.) documented' },
    { item: 'Risk tolerance level', present: false, details: '"Seems fine with risk" is insufficient · no specific risk tolerance level or numeric score documented' },
    { item: 'Suitability rationale', present: false, details: 'No explanation for why 80/20 equities is suitable for this specific client at this time' },
    { item: 'Material risks discussed', present: false, details: 'No mention of risks associated with the aggressive allocation · required by CIRO' },
    { item: 'Client concerns/objections', present: false, details: '"Seemed happy" does not document whether objections were raised or addressed' },
    { item: 'Time horizon', present: false, details: 'No investment time horizon mentioned or matched to the recommended allocation' },
    { item: 'Current financial situation', present: false, details: '"Decent chunk of change" does not constitute a documented financial situation' },
    { item: 'Conflicts of interest', present: false, details: 'No conflicts of interest disclosure present' },
  ],
  flags: [
    { element: 'Risk tolerance level', status: 'missing', severity: 'critical', description: 'No specific risk tolerance level documented', suggestion: "Document client's risk tolerance score and confirm it aligns with the 80/20 equity allocation", confidence: 'high', ciroRule: 'CIRO Rule 3400' },
    { element: 'Suitability rationale', status: 'missing', severity: 'critical', description: 'No justification for why 80/20 equities is suitable for Wei Zhang', suggestion: "Explicitly state why this allocation matches the client's profile, objectives, and risk tolerance", confidence: 'high', ciroRule: 'CIRO Rule 3400' },
    { element: 'Material risks discussed', status: 'missing', severity: 'critical', description: 'Risks of an aggressive equity allocation not documented', suggestion: 'Document specific risks discussed, including potential drawdown ranges for an 80/20 portfolio', confidence: 'high', ciroRule: 'CIRO Rule 3400' },
    { element: 'Time horizon', status: 'missing', severity: 'critical', description: 'Investment time horizon not mentioned', suggestion: "Document client's time horizon and confirm it aligns with the aggressive allocation", confidence: 'high', ciroRule: 'CIRO Rule 3400' },
    { element: 'Current financial situation', status: 'insufficient', severity: 'warning', description: '"Decent chunk of change" does not satisfy CIRO\'s documentation standard', suggestion: 'Document income, assets, liabilities, and investment capacity', confidence: 'high', ciroRule: 'CIRO Rule 3400' },
    { element: 'Client concerns/objections', status: 'insufficient', severity: 'warning', description: '"Seemed happy" does not confirm objections were documented or absent', suggestion: 'Explicitly note that no objections were raised, or document any concerns and how they were addressed', confidence: 'medium', ciroRule: 'CIRO Rule 3400' },
  ],
  overallScore: 19,
  verdict: 'non_compliant',
};

const ADVISOR_NOTE_MARCUS_THOMPSON = {
  checklist: [
    { item: 'Client investment objectives', present: false, details: 'No investment objectives documented · call was about RRIF minimum withdrawal rules only' },
    { item: 'Risk tolerance level', present: false, details: 'No risk tolerance mentioned or referenced' },
    { item: 'Suitability rationale', present: false, details: 'No recommendation made, no suitability assessment present' },
    { item: 'Material risks discussed', present: false, details: 'No risks discussed or documented' },
    { item: 'Client concerns/objections', present: false, details: 'No client concerns or objections documented beyond a follow-up intention' },
    { item: 'Time horizon', present: false, details: 'No time horizon mentioned' },
    { item: 'Current financial situation', present: false, details: 'No financial situation documented' },
    { item: 'Conflicts of interest', present: false, details: 'No conflicts of interest disclosure present' },
  ],
  flags: [
    { element: 'Client investment objectives', status: 'missing', severity: 'critical', description: 'No investment objectives documented', suggestion: "Document the client's investment goals before any follow-up recommendation", confidence: 'high', ciroRule: 'CIRO Rule 3400' },
    { element: 'Risk tolerance level', status: 'missing', severity: 'critical', description: 'Risk tolerance not mentioned', suggestion: 'Conduct and document a risk tolerance assessment', confidence: 'high', ciroRule: 'CIRO Rule 3400' },
    { element: 'Suitability rationale', status: 'missing', severity: 'critical', description: 'No suitability assessment present', suggestion: 'Any recommendation must include an explicit suitability rationale', confidence: 'high', ciroRule: 'CIRO Rule 3400' },
    { element: 'Material risks discussed', status: 'missing', severity: 'critical', description: 'No risks documented', suggestion: 'Document any material risks discussed with the client', confidence: 'high', ciroRule: 'CIRO Rule 3400' },
    { element: 'Current financial situation', status: 'missing', severity: 'critical', description: 'Client financial situation not documented', suggestion: 'Reference client income, assets, and liabilities as the basis for any future recommendation', confidence: 'high', ciroRule: 'CIRO Rule 3400' },
    { element: 'Time horizon', status: 'missing', severity: 'warning', description: 'No time horizon referenced', suggestion: "Document client's investment time horizon, especially relevant given RRIF minimum withdrawal context", confidence: 'high', ciroRule: 'CIRO Rule 3400' },
  ],
  overallScore: 0,
  verdict: 'non_compliant',
};

const ADVISOR_NOTE_SARAH_COMPLIANT = {
  checklist: [
    { item: 'Client investment objectives', present: true, details: 'Growth objective clearly stated' },
    { item: 'Risk tolerance level', present: true, details: 'Moderate-to-aggressive (7/10) documented' },
    { item: 'Suitability rationale', present: true, details: 'Rationale ties risk profile to recommendation' },
    { item: 'Material risks discussed', present: true, details: 'Volatility and drawdown risks noted' },
    { item: 'Client concerns/objections', present: true, details: 'No objections raised, ESG question documented' },
    { item: 'Time horizon', present: true, details: '7-10 year horizon referenced' },
    { item: 'Current financial situation', present: true, details: 'Income, debt, emergency fund documented' },
    { item: 'Conflicts of interest', present: true, details: 'No conflicts disclosed' },
  ],
  flags: [],
  overallScore: 95,
  verdict: 'compliant',
};

function routeAdvisorNote(userMessage: string): string {
  if (userMessage.includes('Wei Zhang')) {
    return JSON.stringify(ADVISOR_NOTE_WEI_ZHANG);
  }
  if (userMessage.includes('Marcus Thompson')) {
    return JSON.stringify(ADVISOR_NOTE_MARCUS_THOMPSON);
  }
  return JSON.stringify(ADVISOR_NOTE_SARAH_COMPLIANT);
}

// ============================================================
// TRANSFER VALIDATION MOCKS
// ============================================================

const VALIDATION_CLEAN_TD = {
  checks: [
    { category: 'Account Identification', fieldName: 'Account Number', expectedFormat: '7-12 digits', actualValue: '6629-8834-221', status: 'pass', errorDescription: null, confidence: 'high', rule: 'ATON-100' },
    { category: 'Client Identity', fieldName: 'Client Name', expectedFormat: 'Non-empty string', actualValue: 'Sarah Martinez', status: 'pass', errorDescription: null, confidence: 'high', rule: 'ATON-101' },
    { category: 'Transfer Details', fieldName: 'Transfer Type', expectedFormat: 'full/partial', actualValue: 'Full Transfer', status: 'pass', errorDescription: null, confidence: 'high', rule: 'ATON-200' },
    { category: 'Authorization', fieldName: 'Signature', expectedFormat: 'Present', actualValue: '[SIGNED]', status: 'pass', errorDescription: null, confidence: 'high', rule: 'ATON-300' },
    { category: 'Authorization', fieldName: 'Authorization Date', expectedFormat: 'Within 90 days', actualValue: 'February 15, 2026', status: 'pass', errorDescription: null, confidence: 'high', rule: 'ATON-301' },
    { category: 'Sending Institution', fieldName: 'Institution Code', expectedFormat: 'Valid Canadian code', actualValue: '004', status: 'pass', errorDescription: null, confidence: 'high', rule: 'ATON-400' },
  ],
  verdict: { verdict: 'pass', riskScore: 2, summary: 'All validation checks passed. Document is complete and compliant.' },
  extractedFields: {
    accountNumber: '6629-8834-221', accountType: 'TFSA', clientName: 'Sarah Martinez',
    dateOfBirth: 'August 22, 1990', transferType: 'Full Transfer', sendingInstitution: 'TD Canada Trust',
    transferAmount: '$28,000.00', authorizationDate: 'February 15, 2026', signaturePresent: true,
  },
};

const VALIDATION_ERRORS_RBC = {
  checks: [
    { category: 'Account Identification', fieldName: 'Account Number', expectedFormat: '10-12 digits (Canadian institutional)', actualValue: '553-221-8', status: 'fail', errorDescription: 'Account number has only 7 digits. Canadian institutional account numbers require 10 or more digits.', confidence: 'high', rule: 'ATON-100' },
    { category: 'Client Identity', fieldName: 'Client Name', expectedFormat: 'Non-empty string', actualValue: 'Wei Zhang', status: 'pass', errorDescription: null, confidence: 'high', rule: 'ATON-101' },
    { category: 'Transfer Details', fieldName: 'Account Type Conflict', expectedFormat: 'Source and destination account types compatible', actualValue: 'LIRA → Non-Registered', status: 'fail', errorDescription: 'Locked-In Retirement Account (LIRA) cannot transfer to a Non-Registered account. LIRA funds are subject to provincial pension legislation and must move to another locked-in vehicle (LIRA, LIF, or LRIF).', confidence: 'high', rule: 'ATON-403' },
    { category: 'Transfer Details', fieldName: 'Transfer Type', expectedFormat: 'full/partial, cash/in-kind', actualValue: 'Full, In-Kind', status: 'pass', errorDescription: null, confidence: 'high', rule: 'ATON-200' },
    { category: 'Authorization', fieldName: 'Signature', expectedFormat: 'Present', actualValue: '[SIGNED] Wei Zhang', status: 'pass', errorDescription: null, confidence: 'high', rule: 'ATON-300' },
    { category: 'Authorization', fieldName: 'Authorization Date', expectedFormat: 'Within 90 days', actualValue: 'November 2, 2025', status: 'fail', errorDescription: 'Authorization date is older than 90 days (signed Nov 2, 2025). Sending institution will reject as expired authorization.', confidence: 'high', rule: 'ATON-301' },
    { category: 'Sending Institution', fieldName: 'Institution Code', expectedFormat: 'Valid Canadian code', actualValue: 'RBC Direct Investing (code not provided)', status: 'warning', errorDescription: 'Institution name present but institution code missing from document.', confidence: 'medium', rule: 'ATON-400' },
  ],
  verdict: { verdict: 'fail', riskScore: 8, summary: 'Multiple critical failures: malformed account number, account type conflict (LIRA → Non-Registered), and expired authorization.' },
  extractedFields: {
    accountNumber: '553-221-8', accountType: 'LIRA', clientName: 'Wei Zhang',
    dateOfBirth: 'November 30, 1978', transferType: 'Full Transfer, In-Kind', sendingInstitution: 'RBC Direct Investing',
    transferAmount: '$112,000.00', authorizationDate: 'November 2, 2025', signaturePresent: true,
  },
};

const VALIDATION_MISSING_SIG_QUESTRADE = {
  checks: [
    { category: 'Account Identification', fieldName: 'Account Number', expectedFormat: '7-12 digits', actualValue: '5198-7723-001', status: 'pass', errorDescription: null, confidence: 'high', rule: 'ATON-100' },
    { category: 'Client Identity', fieldName: 'Client Name', expectedFormat: 'Non-empty string', actualValue: 'Priya Sharma', status: 'pass', errorDescription: null, confidence: 'high', rule: 'ATON-101' },
    { category: 'Transfer Details', fieldName: 'Transfer Type', expectedFormat: 'full/partial', actualValue: 'Full Transfer', status: 'pass', errorDescription: null, confidence: 'high', rule: 'ATON-200' },
    { category: 'Authorization', fieldName: 'Signature', expectedFormat: 'Present (signed by account holder)', actualValue: 'BLANK · no signature on authorization line', status: 'fail', errorDescription: 'Authorization signature is missing. The signature line is empty. Sending institution will reject without a valid signature.', confidence: 'high', rule: 'ATON-300' },
    { category: 'Authorization', fieldName: 'Authorization Date', expectedFormat: 'Within 90 days', actualValue: 'February 18, 2026', status: 'pass', errorDescription: null, confidence: 'high', rule: 'ATON-301' },
    { category: 'Sending Institution', fieldName: 'Institution Code', expectedFormat: 'Valid Canadian code', actualValue: 'Questrade Inc. (code not provided)', status: 'warning', errorDescription: 'Institution code not on document; lookup required.', confidence: 'medium', rule: 'ATON-400' },
  ],
  verdict: { verdict: 'fail', riskScore: 7, summary: 'Missing authorization signature. All other fields valid, but the document cannot be processed until signed.' },
  extractedFields: {
    accountNumber: '5198-7723-001', accountType: 'FHSA', clientName: 'Priya Sharma',
    dateOfBirth: 'May 10, 1992', transferType: 'Full Transfer', sendingInstitution: 'Questrade Inc.',
    transferAmount: '$8,000.00', authorizationDate: 'February 18, 2026', signaturePresent: false,
  },
};

function routeValidation(userMessage: string): string {
  // Detect by uniquely-identifying content from each sample document.
  if (userMessage.includes('Wei Zhang') && userMessage.includes('RBC Direct')) {
    return JSON.stringify(VALIDATION_ERRORS_RBC);
  }
  if (userMessage.includes('Priya Sharma') && userMessage.includes('Questrade')) {
    return JSON.stringify(VALIDATION_MISSING_SIG_QUESTRADE);
  }
  return JSON.stringify(VALIDATION_CLEAN_TD);
}

// ============================================================
// DOCUMENT EXTRACTION MOCKS
// ============================================================

const EXTRACTION_CLEAN_TD = {
  fields: [
    { fieldName: 'Account Number', value: '6629-8834-221', confidence: 0.98, confidenceLevel: 'high', reasoning: 'Clearly printed in dedicated field' },
    { fieldName: 'Account Type', value: 'TFSA', confidence: 0.99, confidenceLevel: 'high', reasoning: 'Explicitly labeled' },
    { fieldName: 'Client Full Name', value: 'Sarah Martinez', confidence: 0.97, confidenceLevel: 'high', reasoning: 'Matches header and signature' },
    { fieldName: 'Date of Birth', value: 'August 22, 1990', confidence: 0.95, confidenceLevel: 'high', reasoning: 'Standard date format' },
    { fieldName: 'Client Address', value: '142 Queen St W, Toronto, ON M5H 2M9', confidence: 0.94, confidenceLevel: 'high', reasoning: 'Full address present' },
    { fieldName: 'Transfer Type', value: 'Full Transfer', confidence: 0.99, confidenceLevel: 'high', reasoning: 'Explicitly stated' },
    { fieldName: 'Asset Type', value: 'Cash', confidence: 0.99, confidenceLevel: 'high', reasoning: 'Explicitly stated' },
    { fieldName: 'Transfer Amount', value: '$28,000.00', confidence: 0.96, confidenceLevel: 'high', reasoning: 'Listed as estimated value' },
    { fieldName: 'Sending Institution Name', value: 'TD Canada Trust', confidence: 0.99, confidenceLevel: 'high', reasoning: 'In document header' },
    { fieldName: 'Sending Institution Code', value: '004', confidence: 0.95, confidenceLevel: 'high', reasoning: 'Standard TD institution code' },
    { fieldName: 'Branch Identifier', value: '10242', confidence: 0.93, confidenceLevel: 'high', reasoning: 'Listed in account details' },
    { fieldName: 'Authorization Signature', value: 'present', confidence: 0.90, confidenceLevel: 'high', reasoning: '[SIGNED] marker detected' },
    { fieldName: 'Authorization Date', value: 'February 15, 2026', confidence: 0.97, confidenceLevel: 'high', reasoning: 'Date beside signature' },
    { fieldName: 'Beneficiary Designation', value: null, confidence: 0.70, confidenceLevel: 'medium', reasoning: 'No beneficiary section found in document' },
    { fieldName: 'Special Conditions', value: null, confidence: 0.75, confidenceLevel: 'medium', reasoning: 'No special conditions noted' },
  ],
  sourceInstitution: 'TD Canada Trust',
  documentType: 'transfer_form',
  overallConfidence: 0.94,
  warnings: [] as string[],
};

const EXTRACTION_ERRORS_RBC = {
  fields: [
    { fieldName: 'Account Number', value: '553-221-8', confidence: 0.72, confidenceLevel: 'medium', reasoning: 'Value read confidently, but format is anomalous: only 7 digits where 10+ are expected for RBC institutional accounts' },
    { fieldName: 'Account Type', value: 'LIRA', confidence: 0.94, confidenceLevel: 'high', reasoning: 'Explicitly labeled "Type: LIRA"' },
    { fieldName: 'Client Full Name', value: 'Wei Zhang', confidence: 0.96, confidenceLevel: 'high', reasoning: 'Listed as Client and matches signature line' },
    { fieldName: 'Date of Birth', value: 'November 30, 1978', confidence: 0.88, confidenceLevel: 'high', reasoning: 'Compact format ("Nov 30 1978") parsed' },
    { fieldName: 'Client Address', value: null, confidence: 0.25, confidenceLevel: 'low', reasoning: 'No client address field present in document' },
    { fieldName: 'Transfer Type', value: 'Full, In-Kind', confidence: 0.93, confidenceLevel: 'high', reasoning: 'Stated explicitly' },
    { fieldName: 'Asset Type', value: 'In-Kind', confidence: 0.91, confidenceLevel: 'high', reasoning: 'Combined with transfer type' },
    { fieldName: 'Transfer Amount', value: '$112,000.00', confidence: 0.80, confidenceLevel: 'medium', reasoning: 'Listed as "Approx Value" · approximate, not exact' },
    { fieldName: 'Sending Institution Name', value: 'RBC Direct Investing', confidence: 0.97, confidenceLevel: 'high', reasoning: 'In document header' },
    { fieldName: 'Sending Institution Code', value: null, confidence: 0.30, confidenceLevel: 'low', reasoning: 'Institution code not present in document; would need to be looked up (RBC = 003)' },
    { fieldName: 'Branch Identifier', value: '00312', confidence: 0.85, confidenceLevel: 'high', reasoning: 'Listed under sending account details' },
    { fieldName: 'Authorization Signature', value: 'present', confidence: 0.88, confidenceLevel: 'high', reasoning: '[SIGNED] marker detected next to client name' },
    { fieldName: 'Authorization Date', value: 'November 2, 2025', confidence: 0.94, confidenceLevel: 'high', reasoning: 'Date is clearly stated, but is older than 90 days from today' },
    { fieldName: 'Beneficiary Designation', value: null, confidence: 0.40, confidenceLevel: 'low', reasoning: 'No beneficiary section in document' },
    { fieldName: 'Special Conditions', value: 'Locked-in (LIRA · provincial pension legislation applies)', confidence: 0.78, confidenceLevel: 'medium', reasoning: 'Inferred from LIRA account type · formal locked-in declaration not explicitly written in document' },
  ],
  sourceInstitution: 'RBC Direct Investing',
  documentType: 'transfer_form',
  overallConfidence: 0.75,
  warnings: [
    'Account number has only 7 digits (Canadian institutional accounts typically have 10+).',
    'Authorization date is older than 90 days · likely to be rejected as expired.',
    'Source account type LIRA cannot transfer to a Non-Registered destination.',
    'Sending institution code not present in document.',
  ],
};

const EXTRACTION_MISSING_SIG_QUESTRADE = {
  fields: [
    { fieldName: 'Account Number', value: '5198-7723-001', confidence: 0.96, confidenceLevel: 'high', reasoning: 'Clearly printed' },
    { fieldName: 'Account Type', value: 'FHSA', confidence: 0.98, confidenceLevel: 'high', reasoning: 'Explicitly labeled' },
    { fieldName: 'Client Full Name', value: 'Priya Sharma', confidence: 0.97, confidenceLevel: 'high', reasoning: 'Listed as Account Holder' },
    { fieldName: 'Date of Birth', value: 'May 10, 1992', confidence: 0.95, confidenceLevel: 'high', reasoning: 'ISO format date parsed' },
    { fieldName: 'Client Address', value: null, confidence: 0.30, confidenceLevel: 'low', reasoning: 'No address field present (email only)' },
    { fieldName: 'Transfer Type', value: 'Full Transfer', confidence: 0.99, confidenceLevel: 'high', reasoning: 'Explicitly stated' },
    { fieldName: 'Asset Type', value: 'Cash', confidence: 0.98, confidenceLevel: 'high', reasoning: 'Explicitly stated' },
    { fieldName: 'Transfer Amount', value: '$8,000.00', confidence: 0.94, confidenceLevel: 'high', reasoning: 'Estimated value clearly given' },
    { fieldName: 'Sending Institution Name', value: 'Questrade Inc.', confidence: 0.99, confidenceLevel: 'high', reasoning: 'In document header' },
    { fieldName: 'Sending Institution Code', value: null, confidence: 0.35, confidenceLevel: 'low', reasoning: 'Institution code not present in document' },
    { fieldName: 'Branch Identifier', value: null, confidence: 0.30, confidenceLevel: 'low', reasoning: 'No branch identifier present' },
    { fieldName: 'Authorization Signature', value: 'absent', confidenceLevel: 'high', confidence: 0.97, reasoning: 'Signature line contains only underscores with explicit "BLANK · no signature" annotation. No signature detected on authorization line.' },
    { fieldName: 'Authorization Date', value: 'February 18, 2026', confidence: 0.96, confidenceLevel: 'high', reasoning: 'Date is present and within 90 days' },
    { fieldName: 'Beneficiary Designation', value: null, confidence: 0.40, confidenceLevel: 'low', reasoning: 'No beneficiary section present' },
    { fieldName: 'Special Conditions', value: null, confidence: 0.55, confidenceLevel: 'medium', reasoning: 'No special conditions stated' },
  ],
  sourceInstitution: 'Questrade Inc.',
  documentType: 'transfer_form',
  overallConfidence: 0.82,
  warnings: [
    'No signature detected on authorization line · document is unsigned.',
    'Sending institution code missing from document; lookup required.',
  ],
};

function routeExtraction(userMessage: string): string {
  if (userMessage.includes('Wei Zhang') && userMessage.includes('RBC Direct')) {
    return JSON.stringify(EXTRACTION_ERRORS_RBC);
  }
  if (userMessage.includes('Priya Sharma') && userMessage.includes('Questrade')) {
    return JSON.stringify(EXTRACTION_MISSING_SIG_QUESTRADE);
  }
  return JSON.stringify(EXTRACTION_CLEAN_TD);
}

// ============================================================
// EXCEPTION DIAGNOSIS MOCKS
// ============================================================

interface ParsedExceptionContext {
  clientFirstName: string;
  clientFullName: string;
  sendingInstitution: string;
  rejectionCode: string;
  rejectionReason: string;
  accountType: string;
  transferAmount: string;
}

function extractField(text: string, label: string): string | null {
  // Match `LABEL: value` (single-line) regardless of position in the prompt.
  const re = new RegExp(`${label}\\s*[:=]\\s*([^\\n\\r]+)`, 'i');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function parseExceptionContext(userMessage: string): ParsedExceptionContext {
  let clientFirstName = 'there';
  let clientFullName = 'the client';
  let sendingInstitution = 'the sending institution';
  let accountType = 'the source account';
  let transferAmount = '';

  // Try to parse CLIENT PROFILE JSON block.
  const profileMatch = userMessage.match(/CLIENT PROFILE:\s*(\{[\s\S]*?\})\s*\n\s*TRANSFER DETAILS:/);
  if (profileMatch) {
    try {
      const profile = JSON.parse(profileMatch[1]) as Record<string, unknown>;
      const first = (profile.firstName ?? profile.preferredName) as string | undefined;
      const last = profile.lastName as string | undefined;
      if (first) clientFirstName = first;
      if (first && last) clientFullName = `${first} ${last}`;
      else if (first) clientFullName = first;
    } catch {
      // ignore · fall through to regex fallbacks
    }
  }

  // Try to parse TRANSFER DETAILS JSON block.
  const transferMatch = userMessage.match(/TRANSFER DETAILS:\s*(\{[\s\S]*?\})\s*$/);
  if (transferMatch) {
    try {
      const transfer = JSON.parse(transferMatch[1]) as Record<string, unknown>;
      if (typeof transfer.sendingInstitution === 'string') sendingInstitution = transfer.sendingInstitution;
      if (typeof transfer.accountType === 'string') accountType = transfer.accountType;
      if (typeof transfer.transferAmount === 'number') {
        transferAmount = `$${transfer.transferAmount.toLocaleString('en-US')}`;
      } else if (typeof transfer.transferAmount === 'string') {
        transferAmount = transfer.transferAmount;
      }
      // If client name wasn't found in profile, try TRANSFER DETAILS.clientName.
      if (clientFullName === 'the client' && typeof transfer.clientName === 'string') {
        clientFullName = transfer.clientName;
        clientFirstName = transfer.clientName.split(/\s+/)[0] || clientFirstName;
      }
    } catch {
      // ignore
    }
  }

  const rejectionCode = extractField(userMessage, 'REJECTION CODE') ?? '';
  const rejectionReason = extractField(userMessage, 'REJECTION REASON') ?? '';

  return {
    clientFirstName,
    clientFullName,
    sendingInstitution,
    rejectionCode,
    rejectionReason,
    accountType,
    transferAmount,
  };
}

type DiagnosedType =
  | 'name_mismatch'
  | 'insufficient_fee'
  | 'account_type_conflict'
  | 'missing_signature'
  | 'expired_authorization'
  | 'account_closed'
  | 'other';

function classifyException(userMessage: string): DiagnosedType {
  const lower = userMessage.toLowerCase();
  if (lower.includes('name_mismatch') || lower.includes('aton-401')) return 'name_mismatch';
  if (lower.includes('insufficient_fee') || lower.includes('aton-502')) return 'insufficient_fee';
  if (lower.includes('account_type_conflict') || lower.includes('aton-403')) return 'account_type_conflict';
  if (lower.includes('missing_signature') || lower.includes('aton-301')) return 'missing_signature';
  if (lower.includes('expired_authorization') || lower.includes('aton-302')) return 'expired_authorization';
  if (lower.includes('account_closed') || lower.includes('aton-601')) return 'account_closed';
  return 'other';
}

function buildExceptionResponse(diagnosed: DiagnosedType, ctx: ParsedExceptionContext): Record<string, unknown> {
  const { clientFirstName, clientFullName, sendingInstitution, rejectionReason, accountType } = ctx;
  const amountClause = ctx.transferAmount ? ` (${ctx.transferAmount})` : '';

  switch (diagnosed) {
    case 'name_mismatch':
      return {
        rootCause: `The account holder name registered at ${sendingInstitution} does not match the name on the TriAgent account for ${clientFullName}. Details from the rejection: "${rejectionReason}". This is a common name-mismatch case (legal name vs preferred name, missing middle initial, or hyphenated surname variation).`,
        rejectionType: 'name_mismatch',
        resolutionSteps: [
          `Verify the client's legal name on file at TriAgent against the name registered at ${sendingInstitution}`,
          `Ask ${clientFirstName} to confirm the exact legal name as it appears at ${sendingInstitution} (including middle names/initials and hyphens)`,
          'Update the TriAgent account profile to match the legal name at the sending institution',
          'Resubmit the transfer request with the corrected name',
        ],
        draftedEmail: {
          subject: `Action needed: Your account transfer from ${sendingInstitution}`,
          body: `Hi ${clientFirstName},\n\nWe're writing about your recent account transfer request from ${sendingInstitution} to TriAgent${amountClause}.\n\n${sendingInstitution} was unable to process the transfer because the name on your account there doesn't exactly match the name on your TriAgent account. Specifically: ${rejectionReason}\n\nTo fix this, we'll need to align the names on both accounts. Could you reply to this email and confirm the exact legal name as it appears on your ${sendingInstitution} account · including any middle names, initials, or hyphens?\n\nOnce confirmed, we'll update your TriAgent account and resubmit the transfer right away. This usually takes 1-2 business days after we hear back from you.\n\nIf you have any questions, just reply to this email or call us at 1-855-255-9038.\n\nBest,\nTriAgent Transfer Operations`,
        },
        internalNotes: `Name mismatch case for ${clientFullName} at ${sendingInstitution}. Rejection details: ${rejectionReason}. Update WS profile to match the sending institution's records before resubmission. Standard ATON-401 workflow.`,
        confidence: 'high',
        requiresManualReview: false,
      };

    case 'insufficient_fee':
      return {
        rootCause: `${sendingInstitution} charges a transfer-out fee that ${clientFirstName}'s ${accountType} account does not have sufficient cash to cover. Rejection details: "${rejectionReason}". TriAgent reimburses transfer-out fees, but the sending institution must first be able to deduct or collect the fee at their end before the assets can move.`,
        rejectionType: 'insufficient_fee',
        resolutionSteps: [
          `Confirm the exact transfer-out fee charged by ${sendingInstitution} and the current cash balance in the source account`,
          `Ask ${sendingInstitution} to deduct the fee from the proceeds of a small security sale (if the account holds securities) · this is the standard workaround for cash-light registered accounts`,
          `Alternatively, have ${clientFirstName} deposit enough cash at ${sendingInstitution} to cover the shortfall, or arrange for the fee to be billed externally`,
          `Inform ${clientFirstName} that TriAgent will reimburse the transfer-out fee (up to $150 per account) once the transfer completes · they should keep the fee receipt`,
          'Resubmit the transfer once the fee is covered',
        ],
        draftedEmail: {
          subject: `Quick fix needed on your transfer from ${sendingInstitution}`,
          body: `Hi ${clientFirstName},\n\nWe ran into a small snag with your transfer from ${sendingInstitution}${amountClause}.\n\n${sendingInstitution} couldn't process the transfer because they need to collect a transfer-out fee, and there isn't enough cash in the account to cover it. Specifically: ${rejectionReason}\n\nGood news: TriAgent reimburses transfer-out fees up to $150 per account, so this won't cost you anything in the end. There are a couple of ways to get unstuck:\n\n1. Ask ${sendingInstitution} to deduct the fee from the sale of a small portion of your holdings (this is the most common approach for accounts that are mostly invested in securities)\n2. Add enough cash to the ${sendingInstitution} account to cover the fee\n\nJust hold on to the fee receipt and reply to this email once it's sorted · we'll resubmit the transfer and reimburse you as soon as the assets arrive.\n\nQuestions? Reply here or call us at 1-855-255-9038.\n\nBest,\nTriAgent Transfer Operations`,
        },
        internalNotes: `Insufficient fee for ${clientFullName} at ${sendingInstitution}. ${rejectionReason}. Standard ATON-502 workflow: confirm holdings, recommend security-sale deduction or external cash deposit, queue reimbursement on completion. Account: ${accountType}.`,
        confidence: 'high',
        requiresManualReview: false,
      };

    case 'account_type_conflict':
      return {
        rootCause: `The source account at ${sendingInstitution} is a Locked-In Retirement Account (LIRA), but the configured TriAgent destination is a ${accountType} account. LIRA funds are governed by provincial pension legislation and can only be transferred into another locked-in vehicle (LIRA, LIF, or LRIF). Rejection details: "${rejectionReason}".`,
        rejectionType: 'account_type_conflict',
        resolutionSteps: [
          `Confirm with ${clientFirstName} that the source account is in fact locked-in (LIRA) and identify the governing jurisdiction (federal vs province)`,
          `Open a matching locked-in account at TriAgent (LIRA, or LIF if the client is at the de-locking age) in the same jurisdiction as the source`,
          `Update the transfer destination to the new locked-in account number`,
          `Explain to ${clientFirstName} that LIRA funds cannot be moved to a non-registered or regular RRSP account due to pension regulations`,
          'Resubmit the transfer with the corrected destination account',
        ],
        draftedEmail: {
          subject: `One quick step on your transfer from ${sendingInstitution}`,
          body: `Hi ${clientFirstName},\n\nWe're working on your transfer from ${sendingInstitution}${amountClause} and need a quick adjustment before we can move forward.\n\nThe account you're transferring from is a Locked-In Retirement Account (LIRA). Because LIRA funds are governed by provincial pension legislation, they can only be moved into another locked-in account · they can't go into a regular RRSP or a non-registered account.\n\nWhat this means: we'll need to open a matching LIRA at TriAgent in the same jurisdiction as your existing one, and route the transfer there. It only takes a few minutes · we can walk you through it.\n\nReply to this email or call us at 1-855-255-9038 and we'll get this set up right away.\n\nBest,\nTriAgent Transfer Operations`,
        },
        internalNotes: `Account type conflict for ${clientFullName}: LIRA → ${accountType} at ${sendingInstitution}. ${rejectionReason}. Need to open a matching locked-in account at WS in the correct jurisdiction (confirm province with client). Standard ATON-403 workflow.`,
        confidence: 'high',
        requiresManualReview: false,
      };

    case 'missing_signature':
      return {
        rootCause: `The authorization form sent to ${sendingInstitution} for ${clientFullName} is missing a required signature. Rejection details: "${rejectionReason}". The form cannot be processed until ${clientFirstName} signs the authorization page.`,
        rejectionType: 'missing_signature',
        resolutionSteps: [
          `Send ${clientFirstName} a pre-filled e-signature link for the same authorization form, with the signature field clearly highlighted`,
          `Confirm the correct page and signature location with the client (the rejection cited a specific page)`,
          'Receive the signed form back via secure e-signature workflow',
          `Resubmit the signed authorization to ${sendingInstitution} immediately on receipt`,
        ],
        draftedEmail: {
          subject: `Quick signature needed for your ${sendingInstitution} transfer`,
          body: `Hi ${clientFirstName},\n\nWe're so close to wrapping up your transfer from ${sendingInstitution}${amountClause} · we just need a signature.\n\n${sendingInstitution} returned the form because the signature on the authorization page was missing. Specifically: ${rejectionReason}\n\nWe've prepared a fresh e-signature link below that has the signature field highlighted in yellow so you can't miss it. It takes about 30 seconds:\n\n[E-SIGNATURE LINK]\n\nAs soon as you sign, we'll resubmit to ${sendingInstitution} the same day. The transfer should complete 1-3 business days after that.\n\nLet us know if you have any questions · reply to this email or call 1-855-255-9038.\n\nBest,\nTriAgent Transfer Operations`,
        },
        internalNotes: `Missing signature for ${clientFullName} on ${sendingInstitution} transfer authorization. ${rejectionReason}. Resend via e-signature with field highlighted. Standard ATON-301 workflow.`,
        confidence: 'high',
        requiresManualReview: false,
      };

    case 'expired_authorization':
      return {
        rootCause: `The authorization signed by ${clientFullName} for the ${sendingInstitution} transfer is older than 90 days and has been treated as expired by ${sendingInstitution}. Rejection details: "${rejectionReason}".`,
        rejectionType: 'expired_authorization',
        resolutionSteps: [
          `Send ${clientFirstName} a fresh authorization form pre-filled with the original transfer details`,
          'Collect the new signature via e-signature workflow',
          `Resubmit the dated authorization to ${sendingInstitution}`,
        ],
        draftedEmail: {
          subject: `Quick re-sign needed on your ${sendingInstitution} transfer`,
          body: `Hi ${clientFirstName},\n\nYour transfer authorization from ${sendingInstitution}${amountClause} is now more than 90 days old, so ${sendingInstitution} requires a fresh signature.\n\nWe've prepared an updated form below · it takes about a minute to sign:\n\n[E-SIGNATURE LINK]\n\nOnce we have it, we'll resubmit the same day. Thanks for your patience!\n\nBest,\nTriAgent Transfer Operations`,
        },
        internalNotes: `Expired authorization for ${clientFullName} at ${sendingInstitution}. ${rejectionReason}. Re-send via e-signature.`,
        confidence: 'high',
        requiresManualReview: false,
      };

    case 'account_closed':
      return {
        rootCause: `The source account for ${clientFullName} at ${sendingInstitution} appears to have been closed before the transfer could be processed. Rejection details: "${rejectionReason}". Manual confirmation with the sending institution is required.`,
        rejectionType: 'account_closed',
        resolutionSteps: [
          `Contact ${sendingInstitution} to confirm account status and find out where any residual balance was directed`,
          `Reach out to ${clientFirstName} to verify whether they recently closed the account or moved the funds elsewhere`,
          'If the account was closed in error, request that the sending institution reopen it or escalate to their transfer operations team',
        ],
        draftedEmail: {
          subject: `Question about your ${sendingInstitution} account`,
          body: `Hi ${clientFirstName},\n\nWe tried to process your transfer from ${sendingInstitution}${amountClause}, but ${sendingInstitution} reported that the source account is closed.\n\nCould you confirm whether you recently closed this account or moved the funds? If the account should still be open, let us know and we'll work directly with ${sendingInstitution} to get this resolved.\n\nReply to this email or call 1-855-255-9038 whenever it's convenient.\n\nBest,\nTriAgent Transfer Operations`,
        },
        internalNotes: `Source account reported closed at ${sendingInstitution} for ${clientFullName}. ${rejectionReason}. Awaiting client confirmation and follow-up with institution.`,
        confidence: 'medium',
        requiresManualReview: true,
        manualReviewReason: 'Account closure requires direct confirmation from both the client and the sending institution before any action can be taken.',
      };

    case 'other':
    default:
      return {
        rootCause: `The transfer for ${clientFullName} from ${sendingInstitution} was rejected with an unrecognized or atypical rejection. Details: "${rejectionReason}". Automated diagnosis cannot reliably determine the root cause; manual operator review is required.`,
        rejectionType: 'other',
        resolutionSteps: [
          `Manually review the full rejection text from ${sendingInstitution}`,
          `Contact ${sendingInstitution} to clarify the rejection reason if it is not self-explanatory`,
          `Follow up with ${clientFirstName} only after the operator has determined the correct course of action`,
        ],
        draftedEmail: {
          subject: `We're looking into your ${sendingInstitution} transfer`,
          body: `Hi ${clientFirstName},\n\nWe wanted to let you know we hit a snag on your transfer from ${sendingInstitution}${amountClause} and our operations team is reviewing it directly with the sending institution.\n\nWe'll be back in touch within 1-2 business days with next steps. No action is needed from you right now.\n\nThanks for your patience.\n\nBest,\nTriAgent Transfer Operations`,
        },
        internalNotes: `Atypical rejection for ${clientFullName} at ${sendingInstitution}: ${rejectionReason}. Automated diagnosis insufficient · operator must review before any client action.`,
        confidence: 'low',
        requiresManualReview: true,
        manualReviewReason: 'Rejection reason did not match a known pattern. Operator must determine the correct resolution path before any client outreach.',
      };
  }
}

function routeException(userMessage: string): string {
  const ctx = parseExceptionContext(userMessage);
  const diagnosed = classifyException(userMessage);
  return JSON.stringify(buildExceptionResponse(diagnosed, ctx));
}

// ============================================================
// PROVIDER ENTRY POINT
// ============================================================

/** Route the system+user prompt to a hardcoded mock response. Pure · no latency. */
function routeMock(systemPrompt: string, userMessage: string): string {
  if (systemPrompt.includes('CIRO compliance auditor')) {
    return routeAdvisorNote(userMessage);
  }
  if (systemPrompt.includes('transfer document validation system')) {
    return routeValidation(userMessage);
  }
  if (systemPrompt.includes('document extraction system')) {
    return routeExtraction(userMessage);
  }
  if (systemPrompt.includes('exception resolution system')) {
    return routeException(userMessage);
  }
  throw new Error(
    'Mock provider: unrecognized system prompt. Expected one of the four ai.ts system prompts (CIRO compliance auditor / transfer document validation system / document extraction system / exception resolution system).',
  );
}

export function createMockProvider(): LLMProvider {
  return {
    id: 'mock',
    name: 'Mock (Demo Mode)',

    async analyze(systemPrompt: string, userMessage: string): Promise<{ content: string; usage?: TokenUsage }> {
      const startedAt = Date.now();
      // Simulate API latency
      await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 1200));
      const content = routeMock(systemPrompt, userMessage);
      const usage = fabricateUsage(systemPrompt, userMessage, content, Date.now() - startedAt);
      return { content, usage };
    },

    /**
     * Streaming variant for demo mode. Resolves the full mock JSON synchronously
     * (no artificial up-front latency), then yields it in 6 roughly-equal slices
     * with ~120ms between chunks. Net latency ≈ 720ms, similar to the
     * non-streaming demo mode's ~1.5s but visibly progressive. After the last
     * text slice, yields a single `{ type: 'usage' }` event with fabricated
     * token counts so downstream consumers can record usage uniformly.
     *
     * Honours `AbortSignal`: if signalled mid-stream the loop throws so the
     * for-await caller exits cleanly.
     */
    async *analyzeStream(
      systemPrompt: string,
      userMessage: string,
      _maxTokens?: number,
      signal?: AbortSignal,
    ): AsyncIterable<StreamEvent> {
      const startedAt = Date.now();
      const full = routeMock(systemPrompt, userMessage);
      const sliceCount = 6;
      const sliceSize = Math.ceil(full.length / sliceCount);
      for (let i = 0; i < sliceCount; i++) {
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        const start = i * sliceSize;
        const end = Math.min(start + sliceSize, full.length);
        if (start >= full.length) break;
        // First chunk has no preceding delay so the UI lights up immediately.
        if (i > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, 120));
        }
        yield { type: 'text', text: full.slice(start, end) };
      }
      yield { type: 'usage', usage: fabricateUsage(systemPrompt, userMessage, full, Date.now() - startedAt) };
    },

    isConfigured(): boolean {
      return true; // Mock is always available
    },
  };
}
