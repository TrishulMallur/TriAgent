/**
 * Multi-LLM Provider Interface
 *
 * Defines the provider abstraction that allows switching between
 * Claude, Gemini, OpenAI, OpenRouter, LM Studio, llama.cpp, the
 * Railway backend proxy, and Mock providers.
 */

export type ProviderId =
  | 'claude'
  | 'gemini'
  | 'lmstudio'
  | 'llamacpp'
  | 'openai'
  | 'openrouter'
  | 'backend'
  | 'mock';

/**
 * Token usage and timing for a single AI call. Reported by every provider's
 * `analyze()` (best-effort · local providers may omit token counts).
 *
 * - `inputTokens` / `outputTokens` come straight from the provider's usage
 *   payload (`usage.input_tokens` / `usage.output_tokens` for Claude;
 *   `usageMetadata.promptTokenCount` / `candidatesTokenCount` for Gemini;
 *   `usage.prompt_tokens` / `completion_tokens` for OpenAI-compatible).
 * - `totalTokens` is the sum when explicitly returned by the API; otherwise
 *   the consumer can compute it as input + output.
 * - `durationMs` is wall-clock time the provider measured for the call;
 *   useful even on local providers that don't report tokens.
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
  durationMs?: number;
}

/**
 * Discriminated event yielded by `analyzeStream`. Most events are text
 * fragments; the final event (or any provider-specific usage event) carries
 * a `TokenUsage` payload so consumers can attribute streaming calls without
 * an out-of-band side channel.
 *
 * Backwards compatibility: consumers that only care about text can still do
 * `if (event.type === 'text') acc += event.text;`.
 */
export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'usage'; usage: TokenUsage };

export interface LLMProvider {
  id: ProviderId;
  name: string;
  model?: string;
  /**
   * Returns the model's text response along with best-effort token usage.
   * Local providers (LM Studio, llama.cpp, Mock) may estimate or omit
   * usage; cloud providers fill it from the API response.
   */
  analyze(
    systemPrompt: string,
    userMessage: string,
    maxTokens?: number,
  ): Promise<{ content: string; usage?: TokenUsage }>;
  /**
   * Optional streaming variant. Yields a discriminated union of `text`
   * events (incremental decoded chunks, no SSE wire-protocol leakage) and
   * an optional final `usage` event when the provider reports it.
   * Providers that don't support streaming simply don't define this and
   * the consumer falls back to analyze().
   */
  analyzeStream?(
    systemPrompt: string,
    userMessage: string,
    maxTokens?: number,
    signal?: AbortSignal,
  ): AsyncIterable<StreamEvent>;
  isConfigured(): boolean;
}

export interface ProviderConfig {
  claude: { apiKey: string; model: string };
  gemini: { apiKey: string; model: string };
  lmstudio: { endpoint: string; model: string };
  llamacpp: { endpoint: string };
  openai: { apiKey: string; model: string; baseUrl?: string };
  openrouter: { apiKey: string; model: string; baseUrl?: string };
  backend: { baseUrl: string };
}

/**
 * Display labels for each provider. Used by the ProviderBadge, the soft banner
 * in AppLayout ("No API key for [label]..."), and the API-key manager cards.
 * Single source of truth · new providers must be added here too.
 */
export const PROVIDER_LABELS: Record<ProviderId, string> = {
  claude: 'Claude',
  gemini: 'Gemini',
  lmstudio: 'LM Studio',
  llamacpp: 'llama.cpp',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  backend: 'Backend Proxy',
  mock: 'Mock',
};

const DEFAULT_CONFIG: ProviderConfig = {
  claude: {
    apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY || '',
    model: 'claude-sonnet-4-20250514',
  },
  gemini: {
    apiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
    model: 'gemini-2.0-flash',
  },
  lmstudio: {
    endpoint: import.meta.env.VITE_LMSTUDIO_URL || 'http://localhost:1234',
    model: 'local',
  },
  llamacpp: {
    endpoint: import.meta.env.VITE_LLAMACPP_URL || 'http://localhost:8080',
  },
  openai: {
    apiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
    model: 'gpt-4o-mini',
    // baseUrl intentionally omitted · falls back to https://api.openai.com/v1.
    // Override (LM Studio / vLLM / etc.) goes through the ApiKeyManager UI.
  },
  openrouter: {
    apiKey: import.meta.env.VITE_OPENROUTER_API_KEY || '',
    model: 'anthropic/claude-sonnet-4',
    // baseUrl intentionally omitted · falls back to https://openrouter.ai/api/v1.
  },
  backend: {
    baseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  },
};

export function getDefaultConfig(): ProviderConfig {
  return { ...DEFAULT_CONFIG };
}
