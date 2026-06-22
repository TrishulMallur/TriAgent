import type { LLMProvider, StreamEvent, TokenUsage } from '../llm-provider';
import { AiHttpError, parseRetryAfter } from '../errors';
import { iterSseLines } from '../sse';

/**
 * Minimal shape of an OpenAI `/v1/chat/completions` response · just the
 * fields we actually read (choices, usage). Anything else is ignored.
 */
interface OpenAICompletion {
  choices: Array<{
    message?: { content?: string };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string; type?: string };
}

/**
 * Build the OpenAI-shaped chat payload used by both direct OpenAI and the
 * OpenRouter-compatible variant. The system+user split matches the other
 * providers (Claude uses top-level `system`; Gemini uses `systemInstruction`;
 * OpenAI-family uses a `system` message in the messages array).
 */
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

/**
 * OpenAI provider · direct `fetch` to `https://api.openai.com/v1/chat/completions`.
 *
 * No `openai` npm dep · keeps the bundle slim. Supports streaming via the
 * standard SSE response format (same `data: {...}` shape Anthropic and
 * OpenRouter use, just with different field names). `baseUrl` is
 * override-friendly so the same factory can drive LM Studio
 * (`http://localhost:1234/v1`), vLLM, or any OpenAI-compatible endpoint.
 */
export function createOpenAIProvider(
  apiKey: string,
  model: string,
  /** Optional base URL override · defaults to OpenAI's production endpoint. */
  baseUrl?: string,
): LLMProvider {
  const resolvedBaseUrl = (baseUrl?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');

  return {
    id: 'openai',
    name: 'OpenAI',
    model,

    async analyze(
      systemPrompt: string,
      userMessage: string,
      maxTokens = 4096,
    ): Promise<{ content: string; usage?: TokenUsage }> {
      const startedAt = Date.now();
      const response = await fetch(`${resolvedBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: buildBody(model, systemPrompt, userMessage, maxTokens, false),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new AiHttpError(
          response.status,
          parseRetryAfter(response.headers.get('Retry-After')),
          `OpenAI API error ${response.status}: ${errText}`,
        );
      }

      const data: OpenAICompletion = await response.json();
      if (data.error) {
        throw new AiHttpError(0, null, `OpenAI error: ${data.error.message ?? JSON.stringify(data.error)}`);
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          Accept: 'text/event-stream',
        },
        body: buildBody(model, systemPrompt, userMessage, maxTokens, true),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new AiHttpError(
          response.status,
          parseRetryAfter(response.headers.get('Retry-After')),
          `OpenAI API error ${response.status}: ${errText}`,
        );
      }
      if (!response.body) {
        throw new AiHttpError(0, null, 'OpenAI returned an empty stream body');
      }

      // OpenAI SSE emits `usage` only on the final chunk when `stream_options:
      // { include_usage: true }` is set. We didn't request it to keep this
      // compatible with LM Studio / older endpoints, so `usage` is best-effort
      // here · the fallback is to let the consumer record `durationMs` only.
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
        const obj = parsed as {
          choices?: Array<{
            delta?: { content?: string };
            finish_reason?: string | null;
          }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
          error?: { message?: string };
        };

        if (obj.error) {
          throw new AiHttpError(0, null, `OpenAI stream error: ${obj.error.message ?? 'unknown'}`);
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
      return !!apiKey && apiKey !== 'your_openai_key_here';
    },
  };
}
