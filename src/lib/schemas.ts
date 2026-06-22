/**
 * Zod schemas for the four LLM response shapes defined in `ai.ts`.
 *
 * Used by `parseAndValidate` in `ai.ts` so a local LLM that returns
 * structurally-valid JSON missing required fields surfaces a clean
 * `AiResponseError` instead of crashing a downstream `.map`/`.filter`.
 */

import { z } from 'zod';

// ============================================================
// ADVISOR NOTE ANALYSIS
// ============================================================

export const AdvisorNoteAnalysisSchema = z.object({
  checklist: z.array(
    z.object({
      item: z.string(),
      present: z.boolean(),
      details: z.string(),
    }),
  ),
  flags: z.array(
    z.object({
      element: z.string(),
      status: z.enum(['missing', 'insufficient']),
      severity: z.enum(['critical', 'warning', 'info']),
      description: z.string(),
      suggestion: z.string(),
      confidence: z.enum(['high', 'medium', 'low']),
      ciroRule: z.string(),
    }),
  ),
  overallScore: z.number().min(0).max(100),
  verdict: z.enum(['compliant', 'needs_completion', 'non_compliant']),
});

export type AdvisorNoteAnalysis = z.infer<typeof AdvisorNoteAnalysisSchema>;

// ============================================================
// TRANSFER VALIDATION
// ============================================================

export const TransferValidationSchema = z.object({
  checks: z.array(
    z.object({
      category: z.string(),
      fieldName: z.string(),
      expectedFormat: z.string(),
      actualValue: z.string(),
      status: z.enum(['pass', 'fail', 'warning']),
      errorDescription: z.string().nullable(),
      confidence: z.enum(['high', 'medium', 'low']),
      rule: z.string(),
    }),
  ),
  verdict: z.object({
    verdict: z.string(),
    riskScore: z.number(),
    summary: z.string(),
  }),
  extractedFields: z.record(z.string(), z.union([z.string(), z.boolean(), z.null()])),
});

export type TransferValidation = z.infer<typeof TransferValidationSchema>;

// ============================================================
// DOCUMENT EXTRACTION
// ============================================================

export const DocumentExtractionSchema = z.object({
  fields: z.array(
    z.object({
      fieldName: z.string(),
      value: z.string().nullable(),
      confidence: z.number().min(0).max(1),
      confidenceLevel: z.enum(['high', 'medium', 'low']),
      reasoning: z.string(),
    }),
  ),
  sourceInstitution: z.string(),
  documentType: z.string(),
  overallConfidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
});

export type DocumentExtraction = z.infer<typeof DocumentExtractionSchema>;

// ============================================================
// EXCEPTION DIAGNOSIS
// ============================================================

export const ExceptionDiagnosisSchema = z.object({
  rootCause: z.string(),
  rejectionType: z.string(),
  resolutionSteps: z.array(z.string()),
  draftedEmail: z.object({
    subject: z.string(),
    body: z.string(),
  }),
  internalNotes: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  requiresManualReview: z.boolean(),
  manualReviewReason: z.string().optional(),
});

export type ExceptionDiagnosis = z.infer<typeof ExceptionDiagnosisSchema>;
