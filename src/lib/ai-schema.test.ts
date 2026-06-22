import { describe, it, expect } from 'vitest';
import { parseAndValidate } from './ai';
import { AiResponseError } from './errors';
import {
  AdvisorNoteAnalysisSchema,
  TransferValidationSchema,
  DocumentExtractionSchema,
  ExceptionDiagnosisSchema,
} from './schemas';

// ============================================================
// Minimum-valid fixtures, one per schema
// ============================================================

const validAdvisor = {
  checklist: [
    { item: 'Client investment objectives', present: true, details: 'documented' },
  ],
  flags: [
    {
      element: 'Risk tolerance level',
      status: 'missing',
      severity: 'critical',
      description: 'not present',
      suggestion: 'add it',
      confidence: 'high',
      ciroRule: 'CIRO Rule 3402',
    },
  ],
  overallScore: 87,
  verdict: 'compliant',
};

const validTransfer = {
  checks: [
    {
      category: 'Account Identification',
      fieldName: 'accountNumber',
      expectedFormat: '7-12 digits',
      actualValue: '1234567',
      status: 'pass',
      errorDescription: null,
      confidence: 'high',
      rule: 'Rule A',
    },
  ],
  verdict: { verdict: 'pass', riskScore: 2, summary: 'looks good' },
  extractedFields: {
    accountNumber: '1234567',
    signaturePresent: true,
    notes: null,
  },
};

const validExtraction = {
  fields: [
    {
      fieldName: 'Account Number',
      value: '1234567',
      confidence: 0.95,
      confidenceLevel: 'high',
      reasoning: 'clearly printed in header',
    },
  ],
  sourceInstitution: 'RBC',
  documentType: 'transfer_form',
  overallConfidence: 0.9,
  warnings: [],
};

const validException = {
  rootCause: 'name mismatch on signature card',
  rejectionType: 'name_mismatch',
  resolutionSteps: ['confirm legal name', 'resubmit with matching ID'],
  draftedEmail: { subject: 'Action required', body: 'Hi Pat · ...' },
  internalNotes: 'rerun after client confirms',
  confidence: 'high',
  requiresManualReview: false,
};

describe('parseAndValidate', () => {
  it('returns parsed object for a valid response', () => {
    const raw = JSON.stringify(validAdvisor);
    const result = parseAndValidate(raw, AdvisorNoteAnalysisSchema);
    expect(result.verdict).toBe('compliant');
    expect(result.overallScore).toBe(87);
    expect(result.checklist).toHaveLength(1);
  });

  it('strips ```json ... ``` markdown fences before parsing', () => {
    const raw = '```json\n' + JSON.stringify(validAdvisor) + '\n```';
    const result = parseAndValidate(raw, AdvisorNoteAnalysisSchema);
    expect(result.verdict).toBe('compliant');
  });

  it('throws AiResponseError with raw text on malformed JSON', () => {
    const raw = '{ "verdict": "compliant", broken';
    try {
      parseAndValidate(raw, AdvisorNoteAnalysisSchema);
      throw new Error('expected parseAndValidate to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AiResponseError);
      const aiErr = err as AiResponseError;
      expect(aiErr.message).toMatch(/not valid JSON/i);
      expect(aiErr.rawResponse).toBe(raw);
    }
  });

  it('throws AiResponseError with field path when a required field is missing', () => {
    const { verdict: _omit, ...withoutVerdict } = validAdvisor;
    const raw = JSON.stringify(withoutVerdict);
    try {
      parseAndValidate(raw, AdvisorNoteAnalysisSchema);
      throw new Error('expected parseAndValidate to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AiResponseError);
      const aiErr = err as AiResponseError;
      expect(aiErr.message).toMatch(/schema validation/i);
      expect(aiErr.message).toContain('verdict');
      expect(aiErr.rawResponse).toBe(raw);
    }
  });

  it('throws AiResponseError on a wrong enum value', () => {
    const raw = JSON.stringify({ ...validAdvisor, verdict: 'INVALID' });
    expect(() => parseAndValidate(raw, AdvisorNoteAnalysisSchema)).toThrow(AiResponseError);
  });

  it('accepts a minimum-valid AdvisorNoteAnalysisSchema fixture', () => {
    expect(() =>
      parseAndValidate(JSON.stringify(validAdvisor), AdvisorNoteAnalysisSchema),
    ).not.toThrow();
  });

  it('accepts a minimum-valid TransferValidationSchema fixture', () => {
    const result = parseAndValidate(JSON.stringify(validTransfer), TransferValidationSchema);
    expect(result.verdict.verdict).toBe('pass');
    expect(result.extractedFields.accountNumber).toBe('1234567');
    expect(result.extractedFields.signaturePresent).toBe(true);
    expect(result.extractedFields.notes).toBeNull();
  });

  it('accepts a minimum-valid DocumentExtractionSchema fixture', () => {
    const result = parseAndValidate(JSON.stringify(validExtraction), DocumentExtractionSchema);
    expect(result.sourceInstitution).toBe('RBC');
    expect(result.fields[0].confidenceLevel).toBe('high');
  });

  it('accepts a minimum-valid ExceptionDiagnosisSchema fixture (optional manualReviewReason omitted)', () => {
    const result = parseAndValidate(JSON.stringify(validException), ExceptionDiagnosisSchema);
    expect(result.rejectionType).toBe('name_mismatch');
    expect(result.requiresManualReview).toBe(false);
    expect(result.manualReviewReason).toBeUndefined();
  });
});
