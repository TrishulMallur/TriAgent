import { describe, it, expect } from 'vitest';
import { createMockProvider } from './mock-provider';

// Minimal prompts containing the unique routing substrings from src/lib/ai.ts.
const SYSTEM_PROMPTS = {
  advisorNote: 'You are a CIRO compliance auditor for a Canadian advisory firm.',
  validation: 'You are a transfer document validation system for Triagent.',
  extraction: 'You are a document extraction system for Triagent.',
  exception: 'You are an account transfer exception resolution system for Triagent.',
};

describe('createMockProvider', () => {
  describe('provider metadata', () => {
    it('exposes id === "mock" and isConfigured() === true', () => {
      const provider = createMockProvider();
      expect(provider.id).toBe('mock');
      expect(provider.isConfigured()).toBe(true);
    });
  });

  describe('system-prompt routing', () => {
    it('routes advisor-note prompt to a checklist/flags response', async () => {
      const provider = createMockProvider();
      const raw = await provider.analyze(SYSTEM_PROMPTS.advisorNote, 'some note');
      const parsed = JSON.parse(raw.content);
      expect(parsed).toHaveProperty('checklist');
      expect(parsed).toHaveProperty('flags');
      expect(parsed).toHaveProperty('overallScore');
      expect(parsed).toHaveProperty('verdict');
    });

    it('routes validation prompt to a checks/verdict/extractedFields response', async () => {
      const provider = createMockProvider();
      const raw = await provider.analyze(SYSTEM_PROMPTS.validation, 'some doc');
      const parsed = JSON.parse(raw.content);
      expect(parsed).toHaveProperty('checks');
      expect(parsed).toHaveProperty('verdict');
      expect(parsed).toHaveProperty('extractedFields');
    });

    it('routes extraction prompt to a fields/sourceInstitution response', async () => {
      const provider = createMockProvider();
      const raw = await provider.analyze(SYSTEM_PROMPTS.extraction, 'some doc');
      const parsed = JSON.parse(raw.content);
      expect(parsed).toHaveProperty('fields');
      expect(parsed).toHaveProperty('sourceInstitution');
      expect(parsed).toHaveProperty('documentType');
    });

    it('routes exception prompt to a rejectionType/draftedEmail response', async () => {
      const provider = createMockProvider();
      const raw = await provider.analyze(SYSTEM_PROMPTS.exception, 'REJECTION CODE: ATON-401');
      const parsed = JSON.parse(raw.content);
      expect(parsed).toHaveProperty('rejectionType');
      expect(parsed).toHaveProperty('draftedEmail');
      expect(parsed).toHaveProperty('resolutionSteps');
    });

    it('throws on an unrecognized system prompt (no silent CIRO fallback)', async () => {
      const provider = createMockProvider();
      await expect(provider.analyze('garbage prompt', 'x')).rejects.toThrow(/unrecognized/i);
    });
  });

  describe('advisor-note sub-routing', () => {
    it('returns the Wei Zhang non-compliant mock when user message mentions Wei Zhang', async () => {
      const provider = createMockProvider();
      const raw = await provider.analyze(SYSTEM_PROMPTS.advisorNote, 'Note about Wei Zhang and 80/20 allocation');
      const parsed = JSON.parse(raw.content);
      expect(parsed.verdict).toBe('non_compliant');
      expect(parsed.overallScore).toBe(19);
    });

    it('returns the Marcus Thompson zero-score mock', async () => {
      const provider = createMockProvider();
      const raw = await provider.analyze(SYSTEM_PROMPTS.advisorNote, 'Call notes from Marcus Thompson on RRIF');
      const parsed = JSON.parse(raw.content);
      expect(parsed.verdict).toBe('non_compliant');
      expect(parsed.overallScore).toBe(0);
    });

    it('falls through to the Sarah-compliant mock for unrelated input', async () => {
      const provider = createMockProvider();
      const raw = await provider.analyze(SYSTEM_PROMPTS.advisorNote, 'A standard compliant note');
      const parsed = JSON.parse(raw.content);
      expect(parsed.verdict).toBe('compliant');
      expect(parsed.overallScore).toBe(95);
    });
  });

  describe('validation sub-routing', () => {
    it('returns VALIDATION_ERRORS_RBC for a Wei Zhang RBC Direct document', async () => {
      const provider = createMockProvider();
      const userMessage = 'Transfer doc for Wei Zhang from RBC Direct Investing, LIRA → Non-Registered.';
      const raw = await provider.analyze(SYSTEM_PROMPTS.validation, userMessage);
      const parsed = JSON.parse(raw.content);
      expect(parsed.verdict.verdict).toBe('fail');
      const liraConflict = parsed.checks.find((c: { actualValue?: string }) =>
        typeof c.actualValue === 'string' && c.actualValue.includes('LIRA') && c.actualValue.includes('Non-Registered'),
      );
      expect(liraConflict).toBeDefined();
    });

    it('does NOT confuse "Wei Zhang" in a validation prompt for an advisor-note response (2026-05-24 collision fix)', async () => {
      const provider = createMockProvider();
      // User message mentions Wei Zhang (an advisor-note mock key) but is sent
      // through the validation flow. Must return a validation-shaped response.
      const raw = await provider.analyze(SYSTEM_PROMPTS.validation, 'Wei Zhang transfer document');
      const parsed = JSON.parse(raw.content);
      expect(parsed).toHaveProperty('checks');
      expect(Array.isArray(parsed.checks)).toBe(true);
      expect(parsed).not.toHaveProperty('flags');
    });
  });

  describe('exception diagnosis', () => {
    it('personalizes the drafted email by parsing CLIENT PROFILE JSON', async () => {
      const provider = createMockProvider();
      const userMessage = [
        'REJECTION CODE: ATON-502',
        'REJECTION REASON: Insufficient transfer-out fee',
        'CLIENT PROFILE:',
        '{"firstName": "Sarah", "lastName": "Martinez"}',
        'TRANSFER DETAILS:',
        '{"sendingInstitution": "RBC", "accountType": "TFSA", "transferAmount": 28000}',
      ].join('\n');
      const raw = await provider.analyze(SYSTEM_PROMPTS.exception, userMessage);
      const parsed = JSON.parse(raw.content);
      expect(parsed.rejectionType).toBe('insufficient_fee');
      expect(parsed.draftedEmail.body).toContain('Sarah');
      expect(parsed.draftedEmail.body).not.toContain('Jonathan');
      expect(parsed.draftedEmail.body).not.toContain('John Doe');
      expect(parsed.internalNotes).toContain('RBC');
    });

    it.each<[string, string]>([
      ['ATON-401', 'name_mismatch'],
      ['ATON-502', 'insufficient_fee'],
      ['ATON-403', 'account_type_conflict'],
      ['ATON-301', 'missing_signature'],
      ['ATON-302', 'expired_authorization'],
      ['ATON-601', 'account_closed'],
      ['ATON-999', 'other'],
    ])('classifies rejection code %s as %s', async (code, expectedType) => {
      const provider = createMockProvider();
      const userMessage = `REJECTION CODE: ${code}\nREJECTION REASON: test\nCLIENT PROFILE:\n{"firstName": "Alex"}\nTRANSFER DETAILS:\n{"sendingInstitution": "TestBank", "accountType": "TFSA"}`;
      const raw = await provider.analyze(SYSTEM_PROMPTS.exception, userMessage);
      const parsed = JSON.parse(raw.content);
      expect(parsed.rejectionType).toBe(expectedType);
    });
  });
});
