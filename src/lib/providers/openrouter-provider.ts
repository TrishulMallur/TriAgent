import type { LLMProvider, StreamEvent, TokenUsage } from '../llm-provider';
import { AiHttpError, parseRetryAfter } from '../errors';
import { iterSseLines } from '../sse';

/**
 * OpenRouter provider · OpenAI-compatible `/v1/chat/completions` endpoint
 * with a couple of OpenRouter-specific request headers.
 *
 * OpenRouter's ToS requires callers to send:
 *   - `HTTP-Referer` — for attribution & abuse detection
 *   - `X-Title`      — the app name shown on their dashboard
 * Missing these either throttles requests or 403s them, so we set them
 * defensively. The referer defaults to the current `window.location.origin`
 * (which is `https://localhost:5173` in dev, the real Vercel domain in prod),
 * falling back to `https://triagent.app` for SSR / non-browser contexts.
 */

interface OpenRouterCompletion {
  choices: Array<{
    message?: { content?: string };
    finish_reason?: string | null;
    delta?: { content?: string };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string; code?: number };
}

function refererForCurrentOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'https://triagent.app';
}

function buildBody(
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  stream: boolean,
): string {
  return JSON.stringify({
    model,
    max_tokens: maxTokens,
    stream,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  });
}

function buildHeaders(apiKey: string, stream: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': refererForCurrentOrigin(),
    'X-Title': 'TriAgent',
  };
  if (stream) {
    headers['Accept'] = 'text/event-stream';
  }
  return headers;
}

export function createOpenRouterProvider(
  apiKey: string,
  model: string,
  baseUrl?: string,
): LLMProvider {
  const resolvedBaseUrl = (baseUrl?.trim() || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');

  return {
    id: 'openrouter',
    name: 'OpenRouter',
    model,

    async analyze(
      systemPrompt: string,
      userMessage: string,
      maxTokens = 4096,
    ): Promise<{ content: string; usage?: TokenUsage }> {
      const startedAt = Date.now();
      const response = await fetch(`${resolvedBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: buildHeaders(apiKey, false),
        body: buildBody(model, systemPrompt, userMessage, maxTokens, false),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new AiHttpError(
          response.status,
          parseRetryAfter(response.headers.get('Retry-After')),
          `OpenRouter API error ${response.status}: ${errText}`,
        );
      }

      const data: OpenRouterCompletion = await response.json();
      if (data.error) {
        throw new AiHttpError(
          data.error.code ?? 0,
          null,
          `OpenRouter error: ${data.error.message ?? JSON.stringify(data.error)}`,
        );
      }
      const content = data.choices[0]?.message?.content ?? '';
      const inputTokens = data.usage?.prompt_tokens ?? 0;
      const outputTokens = data.usage?.completion_tokens ?? 0;
      const usage: TokenUsage = {
        inputTokens,
        outputTokens,
        totalTokens: data.usage?.total_tokens ?? inputTokens + outputTokens,
        durationMs: Date.now() - startedAt,
      };
      return { content, usage };
    },

    async *analyzeStream(
      systemPrompt: string,
      userMessage: string,
      maxTokens = 4096,
      signal?: AbortSignal,
    ): AsyncIterable<StreamEvent> {
      const startedAt = Date.now();
      const response = await fetch(`${resolvedBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: buildHeaders(apiKey, true),
        body: buildBody(model, systemPrompt, userMessage, maxTokens, true),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new AiHttpError(
          response.status,
          parseRetryAfter(response.headers.get('Retry-After')),
          `OpenRouter API error ${response.status}: ${errText}`,
        );
      }
      if (!response.body) {
        throw new AiHttpError(0, null, 'OpenRouter returned an empty stream body');
      }

      let inputTokens = 0;
      let outputTokens = 0;
      let sawUsage = false;

      for await (const payload of iterSseLines(response.body)) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }
        const obj = parsed as OpenRouterCompletion & {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        if (obj.error) {
          throw new AiHttpError(
            obj.error.code ?? 0,
            null,
            `OpenRouter stream error: ${obj.error.message ?? 'unknown'}`,
          );
        }
        const delta = obj.choices?.[0]?.delta;
        if (delta?.content) {
          yield { type: 'text', text: delta.content };
        }
        if (obj.usage) {
          inputTokens = obj.usage.prompt_tokens ?? 0;
          outputTokens = obj.usage.completion_tokens ?? 0;
          sawUsage = true;
        }
      }

      if (sawUsage) {
        yield {
          type: 'usage',
          usage: {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            durationMs: Date.now() - startedAt,
          },
        };
      }
    },

    isConfigured(): boolean {
      return !!apiKey && apiKey !== 'your_openrouter_key_here';
    },
  };
}
