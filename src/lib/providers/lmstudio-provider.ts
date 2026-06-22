import type { LLMProvider, StreamEvent, TokenUsage } from '../llm-provider';
import { AiHttpError, parseRetryAfter } from '../errors';
import { iterSseLines } from '../sse';

interface OpenAiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface LMStudioResponse {
  choices: { message: { content: string } }[];
  usage?: OpenAiUsage;
}

export function createLMStudioProvider(endpoint: string): LLMProvider {
  const baseUrl = endpoint.replace(/\/+$/, '');

  return {
    id: 'lmstudio',
    name: 'LM Studio (Local)',

    async analyze(
      systemPrompt: string,
      userMessage: string,
      maxTokens = 4096,
    ): Promise<{ content: string; usage?: TokenUsage }> {
      const startedAt = Date.now();
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          max_tokens: maxTokens,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new AiHttpError(
          response.status,
          parseRetryAfter(response.headers.get('Retry-After')),
          `LM Studio error ${response.status}: ${errText}`,
        );
      }

      const data: LMStudioResponse = await response.json();
      const content = data.choices[0]?.message?.content || '';
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

    /**
     * Streaming variant. LM Studio implements the OpenAI Chat Completions
     * streaming spec: each SSE event is a JSON object with
     * `choices[0].delta.content`. Stream terminates on `data: [DONE]`
     * (handled by iterSseLines). With `stream_options: { include_usage: true }`
     * LM Studio also sends a final event with `usage` · we capture it and
     * yield a `{ type: 'usage' }` event. Older builds that ignore the flag
     * simply skip the usage event.
     */
    async *analyzeStream(
      systemPrompt: string,
      userMessage: string,
      maxTokens = 4096,
      signal?: AbortSignal,
    ): AsyncIterable<StreamEvent> {
      const startedAt = Date.now();
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          max_tokens: maxTokens,
          temperature: 0.3,
          stream: true,
          stream_options: { include_usage: true },
        }),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new AiHttpError(
          response.status,
          parseRetryAfter(response.headers.get('Retry-After')),
          `LM Studio error ${response.status}: ${errText}`,
        );
      }

      if (!response.body) {
        throw new AiHttpError(0, null, 'LM Studio returned an empty stream body');
      }

      let lastUsage: OpenAiUsage | null = null;

      for await (const payload of iterSseLines(response.body)) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }
        const obj = parsed as {
          choices?: { delta?: { content?: string } }[];
          usage?: OpenAiUsage;
        };
        if (obj.usage) lastUsage = obj.usage;
        const chunk = obj.choices?.[0]?.delta?.content;
        if (chunk) yield { type: 'text', text: chunk };
      }

      if (lastUsage) {
        const inputTokens = lastUsage.prompt_tokens ?? 0;
        const outputTokens = lastUsage.completion_tokens ?? 0;
        yield {
          type: 'usage',
          usage: {
            inputTokens,
            outputTokens,
            totalTokens: lastUsage.total_tokens ?? inputTokens + outputTokens,
            durationMs: Date.now() - startedAt,
          },
        };
      }
    },

    isConfigured(): boolean {
      return !!baseUrl;
    },
  };
}
