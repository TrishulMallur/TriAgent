import type { LLMProvider, StreamEvent, TokenUsage } from '../llm-provider';
import { AiHttpError, parseRetryAfter } from '../errors';
import { iterSseLines } from '../sse';

interface ClaudeResponse {
  content: { type: string; text: string }[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export function createClaudeProvider(apiKey: string, model: string): LLMProvider {
  return {
    id: 'claude',
    name: 'Claude (Anthropic)',
    model,

    async analyze(
      systemPrompt: string,
      userMessage: string,
      maxTokens = 4096,
    ): Promise<{ content: string; usage?: TokenUsage }> {
      const startedAt = Date.now();
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new AiHttpError(
          response.status,
          parseRetryAfter(response.headers.get('Retry-After')),
          `Claude API error ${response.status}: ${errText}`,
        );
      }

      const data: ClaudeResponse = await response.json();
      const content = data.content[0]?.text || '';
      const inputTokens = data.usage?.input_tokens ?? 0;
      const outputTokens = data.usage?.output_tokens ?? 0;
      const usage: TokenUsage = {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        durationMs: Date.now() - startedAt,
      };
      return { content, usage };
    },

    /**
     * Streaming variant of analyze(). Uses Anthropic's `stream: true` SSE
     * response format and yields text deltas as `{ type: 'text' }` events.
     * Captures `usage` from `message_start` (input_tokens) and `message_delta`
     * (cumulative output_tokens) and yields a final `{ type: 'usage' }` event.
     * Errors mid-stream (`event: error`) are thrown as `AiHttpError`.
     */
    async *analyzeStream(
      systemPrompt: string,
      userMessage: string,
      maxTokens = 4096,
      signal?: AbortSignal,
    ): AsyncIterable<StreamEvent> {
      const startedAt = Date.now();
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
          stream: true,
        }),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new AiHttpError(
          response.status,
          parseRetryAfter(response.headers.get('Retry-After')),
          `Claude API error ${response.status}: ${errText}`,
        );
      }

      if (!response.body) {
        throw new AiHttpError(0, null, 'Claude API returned an empty stream body');
      }

      // Anthropic emits input_tokens in message_start.usage and updates
      // output_tokens incrementally via message_delta.usage. Track both and
      // emit a single final usage event.
      let inputTokens = 0;
      let outputTokens = 0;
      let sawUsage = false;

      for await (const payload of iterSseLines(response.body)) {
        // Anthropic SSE sends discrete event types as JSON objects. We rely on
        // the `type` field rather than the `event:` header (iterSseLines drops
        // event headers; the JSON carries the same info).
        let parsed: unknown;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue; // ignore malformed line
        }
        const obj = parsed as {
          type?: string;
          delta?: { type?: string; text?: string };
          message?: { usage?: { input_tokens?: number; output_tokens?: number } };
          usage?: { input_tokens?: number; output_tokens?: number };
          error?: { message?: string; type?: string };
        };

        if (obj.type === 'content_block_delta' && obj.delta?.type === 'text_delta' && obj.delta.text) {
          yield { type: 'text', text: obj.delta.text };
        } else if (obj.type === 'message_start' && obj.message?.usage) {
          if (typeof obj.message.usage.input_tokens === 'number') {
            inputTokens = obj.message.usage.input_tokens;
            sawUsage = true;
          }
          if (typeof obj.message.usage.output_tokens === 'number') {
            outputTokens = obj.message.usage.output_tokens;
          }
        } else if (obj.type === 'message_delta' && obj.usage) {
          if (typeof obj.usage.output_tokens === 'number') {
            outputTokens = obj.usage.output_tokens;
            sawUsage = true;
          }
        } else if (obj.type === 'error') {
          const msg = obj.error?.message ?? 'Unknown Claude stream error';
          throw new AiHttpError(0, null, `Claude stream error: ${msg}`);
        }
        // Ignore message_stop, ping, etc.
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
      return !!apiKey && apiKey !== 'your_claude_key_here';
    },
  };
}
