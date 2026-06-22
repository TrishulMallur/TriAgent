/**
 * AI Integration Layer
 *
 * All AI calls go through this module. Each feature has a dedicated function
 * that sends a structured prompt and returns typed JSON.
 *
 * Uses the active LLM provider from LLMContext (Claude, Gemini, LM Studio,
 * llama.cpp, or Mock). For direct usage outside React, falls back to the
 * default provider based on env vars.
 *
 * Layered behaviour (in call order):
 *   1. Build the system prompt (constant + per-flow rules preamble from
 *      `RulesContext` via `setActiveRules`).
 *   2. Compute SHA-256 cache key over (providerId, model, systemPrompt,
 *      userMessage). Skip step 3 on cache hit.
 *   3. Call `provider.analyze(...)` wrapped in `withRetry` (handles 429/503/
 *      network/one-schema retry with backoff).
 *   4. `parseAndValidate(raw, schema)` · throws `AiResponseError` with the
 *      raw text on JSON / schema failure.
 *   5. Cache the raw response on success.
 *
 * Re-run-from-UI: call `skipNextCacheRead()` before the function call. Used
 * by the "Re-run analysis" button in `AiAnalysisContainer`.
 */

import type { ZodType } from 'zod';
import type { LLMProvider, ProviderId, TokenUsage } from './llm-provider';
import { getDefaultConfig } from './llm-provider';
import { createClaudeProvider } from './providers/claude-provider';
import { createGeminiProvider } from './providers/gemini-provider';
import { createMockProvider } from './providers/mock-provider';
import { AiResponseError } from './errors';
import { withRetry, type RetryOptions } from './retry';
import { recordUsage } from './usage-tracker';
import {
  AdvisorNoteAnalysisSchema,
  TransferValidationSchema,
  DocumentExtractionSchema,
  ExceptionDiagnosisSchema,
  type AdvisorNoteAnalysis,
  type TransferValidation,
  type DocumentExtraction,
  type ExceptionDiagnosis,
} from './schemas';
import { DEFAULT_RULES, renderRulesPreamble, type Rules } from '@/contexts/RulesContext';
import { cacheKey, getCached, setCached, type CacheOptions } from './cache';

// ============================================================
// SINGLETONS · synced from React context via useEffect setters
// ============================================================

let _activeProvider: LLMProvider | null = null;
let _activeRules: Rules = DEFAULT_RULES;
let _cacheOptions: CacheOptions = { enabled: true, persistToLocalStorage: false };
let _skipNextCacheRead = false;

export function setActiveProvider(provider: LLMProvider) {
  _activeProvider = provider;
}

export function setActiveRules(rules: Rules) {
  _activeRules = rules;
}

export function setCacheOptions(opts: CacheOptions) {
  _cacheOptions = { ..._cacheOptions, ...opts };
}

/** Force the next AI call to bypass the cache read; cache write still happens on success. */
export function skipNextCacheRead() {
  _skipNextCacheRead = true;
}

function getFallbackProvider(): LLMProvider {
  const config = getDefaultConfig();
  const defaultId = (import.meta.env.VITE_DEFAULT_PROVIDER as ProviderId) || 'claude';

  if (defaultId === 'gemini' && config.gemini.apiKey && config.gemini.apiKey !== 'your_gemini_key_here') {
    return createGeminiProvider(config.gemini.apiKey, config.gemini.model);
  }
  if (config.claude.apiKey && config.claude.apiKey !== 'your_claude_key_here') {
    return createClaudeProvider(config.claude.apiKey, config.claude.model);
  }
  return createMockProvider();
}

function getProvider(): LLMProvider {
  return _activeProvider || getFallbackProvider();
}

/** Approximate the model string per provider · used as part of the cache key so swapping models invalidates cached entries. */
function getModelTag(provider: LLMProvider): string {
  const config = getDefaultConfig();
  switch (provider.id) {
    case 'claude':
      return provider.model || config.claude.model;
    case 'gemini':
      return provider.model || config.gemini.model;
    case 'lmstudio':
      return `lmstudio:${config.lmstudio.endpoint}`;
    case 'llamacpp':
      return `llamacpp:${config.llamacpp.endpoint}`;
    case 'openai':
      return provider.model || config.openai.model;
    case 'openrouter':
      return provider.model || config.openrouter.model;
    case 'backend':
      return provider.model || config.gemini.model;
    case 'mock':
    default:
      return 'mock';
  }
}

/**
 * Parse an LLM response as JSON and validate it against the given schema.
 * Throws `AiResponseError` (carrying the raw response) on either JSON parse
 * failure or schema mismatch · this is what the retry helper and UI key off.
 */
export function parseAndValidate<T>(raw: string, schema: ZodType<T>): T {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new AiResponseError(
      `LLM response was not valid JSON: ${(err as Error).message}`,
      raw,
      err,
    );
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new AiResponseError(
      `LLM response failed schema validation: ${result.error.issues
        .map((i) => `${i.path.join('.') || '<root>'} · ${i.message}`)
        .join('; ')}`,
      raw,
      result.error,
    );
  }
  return result.data;
}

const RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 4,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  maxSchemaRetries: 1,
};

/**
 * Run an LLM call with retry, cache, and schema validation.
 * Single integration point · the four exported AI functions all go through here.
 */
async function runAnalysis<T>(
  systemPrompt: string,
  userMessage: string,
  schema: ZodType<T>,
): Promise<T> {
  const provider = getProvider();
  const modelTag = getModelTag(provider);

  const key = await cacheKey([provider.id, modelTag, systemPrompt, userMessage]);

  if (!_skipNextCacheRead) {
    const hit = await getCached(key, _cacheOptions);
    if (hit !== null) {
      // Cache hit · consumed 0 tokens this call, but still count it in session totals.
      recordUsage(provider.id, modelTag, { inputTokens: 0, outputTokens: 0, durationMs: 0 }, true);
      // Validate even on cache hit so schema changes invalidate stale entries cleanly.
      return parseAndValidate(hit, schema);
    }
  } else {
    _skipNextCacheRead = false;
  }

  // Miss (or forced) · run the real call. parseAndValidate runs INSIDE
  // withRetry so a one-off bad token gets one retry per the retry policy.
  // We cache the raw text (pre-validation) so the schema check still runs
  // on every hit, but only after we know the LLM produced something
  // structurally non-broken.
  let rawForCache: string | null = null;
  const startedAt = Date.now();
  const result = await withRetry(async () => {
    const { content, usage } = await provider.analyze(systemPrompt, userMessage);
    const parsed = parseAndValidate(content, schema); // throws AiResponseError → retry once
    rawForCache = content;
    // Record usage for the session-totals subscriber (LLMContext).
    const finalUsage: TokenUsage = usage
      ? { ...usage, durationMs: usage.durationMs ?? Date.now() - startedAt }
      : { inputTokens: 0, outputTokens: 0, durationMs: Date.now() - startedAt };
    recordUsage(provider.id, modelTag, finalUsage, false);
    return parsed;
  }, RETRY_OPTIONS);

  if (rawForCache !== null) {
    await setCached(key, rawForCache, _cacheOptions);
  }

  return result;
}

/**
 * Streaming variant of runAnalysis. Identical caching/retry/validation
 * semantics · the only difference is that the raw response is delivered
 * incrementally via `onChunk` while it's still being generated.
 *
 * Flow:
 *   1. Same SHA-256 cache key as `runAnalysis` (so streaming and non-streaming
 *      calls share the same cache).
 *   2. Cache hit → call `onChunk(raw)` once (UX consistency: the streaming UI
 *      still shows the response), parseAndValidate, return.
 *   3. Cache miss + `provider.analyzeStream` undefined → fall back to
 *      `runAnalysis` (no streaming display, but the call still completes).
 *   4. Cache miss + streaming supported → withRetry around an accumulator that
 *      consumes the async iterable, calls onChunk with the running total,
 *      and parseAndValidates the final string.
 *   5. On successful return, cache the accumulated raw text.
 *
 * `_skipNextCacheRead` is honoured identically to `runAnalysis`.
 */
export async function runAnalysisStreaming<T>(
  systemPrompt: string,
  userMessage: string,
  schema: ZodType<T>,
  onChunk: (accumulated: string) => void,
  signal?: AbortSignal,
): Promise<T> {
  const provider = getProvider();
  const modelTag = getModelTag(provider);
  const key = await cacheKey([provider.id, modelTag, systemPrompt, userMessage]);

  if (!_skipNextCacheRead) {
    const hit = await getCached(key, _cacheOptions);
    if (hit !== null) {
      recordUsage(provider.id, modelTag, { inputTokens: 0, outputTokens: 0, durationMs: 0 }, true);
      onChunk(hit);
      return parseAndValidate(hit, schema);
    }
  } else {
    _skipNextCacheRead = false;
  }

  // Fallback: provider doesn't support streaming → use the non-streaming path.
  // The caller still gets the final result, just without the incremental display.
  if (typeof provider.analyzeStream !== 'function') {
    const final = await runAnalysis(systemPrompt, userMessage, schema);
    return final;
  }

  let rawForCache: string | null = null;
  const startedAt = Date.now();
  const result = await withRetry(async () => {
    let acc = '';
    let streamUsage: TokenUsage | undefined;
    // Non-null because we checked typeof above; TypeScript narrowing across
    // the withRetry closure boundary needs the bang.
    for await (const event of provider.analyzeStream!(systemPrompt, userMessage, undefined, signal)) {
      if (event.type === 'text') {
        acc += event.text;
        onChunk(acc);
      } else if (event.type === 'usage') {
        streamUsage = event.usage;
      }
    }
    const parsed = parseAndValidate(acc, schema); // throws AiResponseError → retry once
    rawForCache = acc;
    const finalUsage: TokenUsage = streamUsage
      ? { ...streamUsage, durationMs: streamUsage.durationMs ?? Date.now() - startedAt }
      : { inputTokens: 0, outputTokens: 0, durationMs: Date.now() - startedAt };
    recordUsage(provider.id, modelTag, finalUsage, false);
    return parsed;
  }, RETRY_OPTIONS);

  if (rawForCache !== null) {
    await setCached(key, rawForCache, _cacheOptions);
  }

  return result;
}

// ============================================================
// SYSTEM PROMPTS · constants for the static body, builders for the
// rules-aware preamble that goes in front.
// ============================================================

const ADVISOR_NOTE_SYSTEM_PROMPT_BODY = `You are a CIRO compliance auditor for a Canadian investment advisory firm. Your job is to analyze advisor meeting notes and check them against CIRO documentation requirements.

You MUST return a valid JSON object with this exact structure:
{
  "checklist": [
    { "item": "Client investment objectives", "present": true/false, "details": "description" },
    { "item": "Risk tolerance level", "present": true/false, "details": "description" },
    { "item": "Suitability rationale", "present": true/false, "details": "description" },
    { "item": "Material risks discussed", "present": true/false, "details": "description" },
    { "item": "Client concerns/objections", "present": true/false, "details": "description" },
    { "item": "Time horizon", "present": true/false, "details": "description" },
    { "item": "Current financial situation", "present": true/false, "details": "description" },
    { "item": "Conflicts of interest", "present": true/false, "details": "description" }
  ],
  "flags": [
    {
      "element": "name of missing/insufficient element",
      "status": "missing" | "insufficient",
      "severity": "critical" | "warning" | "info",
      "description": "what is wrong",
      "suggestion": "what the advisor should add",
      "confidence": "high" | "medium" | "low",
      "ciroRule": "specific CIRO rule reference"
    }
  ],
  "overallScore": 0-100,
  "verdict": "compliant" | "needs_completion" | "non_compliant"
}

CIRO Requirements to check:
1. Client investment objectives MUST be documented (growth, income, capital preservation, speculation)
2. Risk tolerance level MUST be referenced and matched to the recommended product
3. Suitability rationale MUST be explicitly stated · WHY this product for THIS client at THIS time
4. Material risks of the recommendation MUST be discussed and noted
5. Client concerns or objections MUST be documented with advisor response (if any were raised)
6. Time horizon MUST be referenced and matched to recommended product characteristics
7. Client's current financial situation MUST be referenced as basis for recommendation
8. Conflicts of interest MUST be disclosed if applicable

Scoring: Each element is worth 12.5 points. Deduct full points for missing, half for insufficient.

Flag vague statements like "discussed risk" as insufficient · CIRO requires SPECIFIC documentation.
Honour the ACTIVE RULES block above · items listed under "Do NOT flag" should NOT appear in checklist failures or flags.
Return ONLY the JSON object, no other text.`;

const TRANSFER_VALIDATION_SYSTEM_PROMPT_BODY = `You are a transfer document validation system for TriAgent, a Canadian financial platform. You validate inbound account transfer documents against ATON/ACATS rules.

You MUST return a valid JSON object with this exact structure:
{
  "checks": [
    {
      "category": "Account Identification" | "Client Identity" | "Transfer Details" | "Authorization" | "Sending Institution" | "Special Conditions",
      "fieldName": "name of field",
      "expectedFormat": "what is expected",
      "actualValue": "what was found",
      "status": "pass" | "fail" | "warning",
      "errorDescription": "description if fail/warning, null if pass",
      "confidence": "high" | "medium" | "low",
      "rule": "specific rule reference"
    }
  ],
  "verdict": {
    "verdict": "pass" | "needs_review" | "fail",
    "riskScore": 1-10,
    "summary": "one sentence summary"
  },
  "extractedFields": {
    "accountNumber": "string or null",
    "accountType": "string or null",
    "clientName": "string or null",
    "dateOfBirth": "string or null",
    "transferType": "string or null",
    "sendingInstitution": "string or null",
    "transferAmount": "string or null",
    "authorizationDate": "string or null",
    "signaturePresent": true/false
  }
}

Default validation rules (subject to the ACTIVE RULES block above):
- Account numbers must be valid format (Canadian institutional accounts typically 10+ digits)
- Account type must be recognized (RRSP, TFSA, FHSA, RRIF, non-registered, LIRA, RESP, RDSP)
- Client name must not be empty and should be consistent across the document
- Transfer type must be specified (full/partial, cash/in-kind)
- Authorization signature must be present
- Sending institution must have valid institution code
- For joint accounts, both signatures required
- For spousal RRSP, attribution rules must be noted

If a rule is listed under "Do NOT flag" in the ACTIVE RULES block, do not fail or warn against it · downgrade to pass.
Return ONLY the JSON object, no other text.`;

const DOCUMENT_EXTRACTION_SYSTEM_PROMPT = `You are a document extraction system for TriAgent. You read unstructured transfer documents from legacy banks and extract all fields into a structured format.

You MUST return a valid JSON object with this exact structure:
{
  "fields": [
    {
      "fieldName": "name of field",
      "value": "extracted value or null",
      "confidence": 0.0-1.0,
      "confidenceLevel": "high" | "medium" | "low",
      "reasoning": "why this confidence level"
    }
  ],
  "sourceInstitution": "detected institution name",
  "documentType": "transfer_form" | "account_statement" | "authorization_letter" | "other",
  "overallConfidence": 0.0-1.0,
  "warnings": ["any issues detected with the document"]
}

Fields to extract (in order):
1. Account Number
2. Account Type (RRSP, TFSA, FHSA, RRIF, non-registered, LIRA, etc.)
3. Client Full Name
4. Date of Birth
5. Client Address
6. Transfer Type (full/partial)
7. Asset Type (cash/in-kind/mixed)
8. Transfer Amount / Asset Breakdown
9. Sending Institution Name
10. Sending Institution Code
11. Branch Identifier
12. Authorization Signature (present/absent)
13. Authorization Date
14. Beneficiary Designation (if present)
15. Special Conditions (locked-in, spousal RRSP, etc.)

If a field cannot be found, return value as null with low confidence and explain why.
Return ONLY the JSON object, no other text.`;

const EXCEPTION_DIAGNOSIS_SYSTEM_PROMPT = `You are an account transfer exception resolution system for TriAgent. When a transfer is rejected by the losing institution, you diagnose the root cause and draft a client communication.

You will receive: the rejection code and reason, the client's TriAgent profile, and the original transfer details.

You MUST return a valid JSON object with this exact structure:
{
  "rootCause": "specific diagnosis of why the transfer was rejected",
  "rejectionType": "name_mismatch" | "insufficient_fee" | "account_type_conflict" | "missing_signature" | "expired_authorization" | "account_closed" | "other",
  "resolutionSteps": ["step 1", "step 2"],
  "draftedEmail": {
    "subject": "email subject line",
    "body": "complete email body, personalized to the client"
  },
  "internalNotes": "notes for the ops team",
  "confidence": "high" | "medium" | "low",
  "requiresManualReview": true/false,
  "manualReviewReason": "why manual review is needed, if applicable"
}

Guidelines:
- Use the client's first name in the email
- Be specific about what the client needs to do
- Keep the email warm, clear, and action-oriented · this is TriAgent's brand voice
- If the diagnosis is uncertain, set requiresManualReview to true
- Never instruct the client to do something impossible or incorrect
- For fee issues, mention TriAgent's transfer fee reimbursement program

Return ONLY the JSON object, no other text.`;

function buildAdvisorNotePrompt(rules: Rules): string {
  return `${renderRulesPreamble(rules, 'advisor_note')}\n\n---\n\n${ADVISOR_NOTE_SYSTEM_PROMPT_BODY}`;
}

function buildTransferValidationPrompt(rules: Rules): string {
  return `${renderRulesPreamble(rules, 'transfer_validation')}\n\n---\n\n${TRANSFER_VALIDATION_SYSTEM_PROMPT_BODY}`;
}

// ============================================================
// EXPORTED AI FUNCTIONS (identical call sites to before)
// ============================================================

export async function analyzeAdvisorNote(noteText: string): Promise<AdvisorNoteAnalysis> {
  return runAnalysis(
    buildAdvisorNotePrompt(_activeRules),
    `Analyze this advisor meeting note for CIRO compliance:\n\n${noteText}`,
    AdvisorNoteAnalysisSchema,
  );
}

export async function validateTransferDocument(documentText: string): Promise<TransferValidation> {
  return runAnalysis(
    buildTransferValidationPrompt(_activeRules),
    `Validate this transfer document:\n\n${documentText}`,
    TransferValidationSchema,
  );
}

export async function extractTransferDocument(documentText: string): Promise<DocumentExtraction> {
  return runAnalysis(
    DOCUMENT_EXTRACTION_SYSTEM_PROMPT,
    `Extract all fields from this transfer document:\n\n${documentText}`,
    DocumentExtractionSchema,
  );
}

export async function diagnoseException(
  rejectionCode: string,
  rejectionReason: string,
  clientProfile: Record<string, unknown>,
  transferDetails: Record<string, unknown>,
): Promise<ExceptionDiagnosis> {
  return runAnalysis(
    EXCEPTION_DIAGNOSIS_SYSTEM_PROMPT,
    `Diagnose this transfer exception:

REJECTION CODE: ${rejectionCode}
REJECTION REASON: ${rejectionReason}

CLIENT PROFILE:
${JSON.stringify(clientProfile, null, 2)}

TRANSFER DETAILS:
${JSON.stringify(transferDetails, null, 2)}`,
    ExceptionDiagnosisSchema,
  );
}

// ============================================================
// STREAMING VARIANTS · same prompts/schemas as above, but stream
// the raw response through `onChunk` as it arrives. Opt-in via
// `useClaudeAnalysis(fn, { streaming: true, analysisStreamFn })`.
// ============================================================

export async function analyzeAdvisorNoteStream(
  noteText: string,
  onChunk: (accumulated: string) => void,
  signal?: AbortSignal,
): Promise<AdvisorNoteAnalysis> {
  return runAnalysisStreaming(
    buildAdvisorNotePrompt(_activeRules),
    `Analyze this advisor meeting note for CIRO compliance:\n\n${noteText}`,
    AdvisorNoteAnalysisSchema,
    onChunk,
    signal,
  );
}

export async function validateTransferDocumentStream(
  documentText: string,
  onChunk: (accumulated: string) => void,
  signal?: AbortSignal,
): Promise<TransferValidation> {
  return runAnalysisStreaming(
    buildTransferValidationPrompt(_activeRules),
    `Validate this transfer document:\n\n${documentText}`,
    TransferValidationSchema,
    onChunk,
    signal,
  );
}

export async function extractTransferDocumentStream(
  documentText: string,
  onChunk: (accumulated: string) => void,
  signal?: AbortSignal,
): Promise<DocumentExtraction> {
  return runAnalysisStreaming(
    DOCUMENT_EXTRACTION_SYSTEM_PROMPT,
    `Extract all fields from this transfer document:\n\n${documentText}`,
    DocumentExtractionSchema,
    onChunk,
    signal,
  );
}

export async function diagnoseExceptionStream(
  rejectionCode: string,
  rejectionReason: string,
  clientProfile: Record<string, unknown>,
  transferDetails: Record<string, unknown>,
  onChunk: (accumulated: string) => void,
  signal?: AbortSignal,
): Promise<ExceptionDiagnosis> {
  return runAnalysisStreaming(
    EXCEPTION_DIAGNOSIS_SYSTEM_PROMPT,
    `Diagnose this transfer exception:

REJECTION CODE: ${rejectionCode}
REJECTION REASON: ${rejectionReason}

CLIENT PROFILE:
${JSON.stringify(clientProfile, null, 2)}

TRANSFER DETAILS:
${JSON.stringify(transferDetails, null, 2)}`,
    ExceptionDiagnosisSchema,
    onChunk,
    signal,
  );
}
