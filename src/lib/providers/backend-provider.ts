import type { LLMProvider, TokenUsage } from '../llm-provider';
import { AiHttpError, parseRetryAfter } from '../errors';

interface BackendAnalyzeResponse {
  content: string;
  usage?: {
    in?: number;
    out?: number;
  };
}

/**
 * Backend provider · proxies all AI calls through the FastAPI backend.
 * The actual API keys (Gemini, Claude) live only on the server and are
 * never embedded in the frontend bundle.
 */
export function createBackendProvider(
  baseUrl: string,
  /**
   * Per-call bearer token · forwarded as `X-User-API-Key` to the proxy.
   * When empty we still hit the backend (which may reply 401); the ApiKeyManager
   * "Test connection" button depends on this not being hardcoded.
   */
  userApiKey: string = '',
  /** Provider path for the proxy · e.g. "claude", "openai". Defaults to "gemini" for back-compat. */
  proxyProvider: 'claude' | 'gemini' | 'openai' | 'openrouter' = 'gemini',
  /** Model slug forwarded to the backend's LLMProxyRequest · required by /api/llm/* endpoints. */
  model: string = 'gemini-2.0-flash',
  /** Shared secret for backend auth (X-API-Key). Set on Railway as BACKEND_API_KEY. */
  backendApiKey: string = '',
): LLMProvider {
  return {
    id: 'backend', // Distinct id so cache keys don't collide with a direct-gemini call.
    name: 'Backend Proxy (Railway)',
    model,

    async analyze(
      systemPrompt: string,
      userMessage: string,
      maxTokens = 4096,
    ): Promise<{ content: string; usage?: TokenUsage }> {
      const startedAt = Date.now();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (backendApiKey) {
        headers['X-API-Key'] = backendApiKey;
      }
      if (userApiKey) {
        headers['X-User-API-Key'] = userApiKey;
      }
      // Phase A proxy contract · the backend dispatches by path segment so the
      // right SDK picks up the call.
      const response = await fetch(`${baseUrl}/api/llm/${proxyProvider}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
          max_tokens: maxTokens,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new AiHttpError(
          response.status,
          parseRetryAfter(response.headers.get('Retry-After')),
          `Backend AI error ${response.status}: ${err}`,
        );
      }

      const data: BackendAnalyzeResponse = await response.json();
      const inputTokens = data.usage?.in ?? 0;
      const outputTokens = data.usage?.out ?? 0;
      const usage: TokenUsage | undefined = data.usage
        ? {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            durationMs: Date.now() - startedAt,
          }
        : undefined;
      return { content: data.content, usage };
    },

    isConfigured(): boolean {
      return !!baseUrl;
    },
  };
}
