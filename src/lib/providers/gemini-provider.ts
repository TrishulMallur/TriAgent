import type { LLMProvider, StreamEvent, TokenUsage } from '../llm-provider';
import { AiHttpError, parseRetryAfter } from '../errors';
import { iterSseLines } from '../sse';

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export function createGeminiProvider(apiKey: string, model: string): LLMProvider {
  return {
    id: 'gemini',
    name: 'Gemini (Google)',
    model,

    async analyze(
      systemPrompt: string,
      userMessage: string,
      maxTokens = 4096,
    ): Promise<{ content: string; usage?: TokenUsage }> {
      const startedAt = Date.now();
      // Use the Google Generative AI SDK if available, otherwise fall back to REST
      try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const genModel = genAI.getGenerativeModel({
          model,
          systemInstruction: systemPrompt,
        });

        const result = await genModel.generateContent({
          contents: [{ role: 'user', parts: [{ text: userMessage }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        });

        const content = result.response.text();
        const meta = (result.response as { usageMetadata?: GeminiUsageMetadata }).usageMetadata;
        const inputTokens = meta?.promptTokenCount ?? 0;
        const outputTokens = meta?.candidatesTokenCount ?? 0;
        const usage: TokenUsage = {
          inputTokens,
          outputTokens,
          totalTokens: meta?.totalTokenCount ?? inputTokens + outputTokens,
          durationMs: Date.now() - startedAt,
        };
        return { content, usage };
      } catch (err) {
        // If SDK import fails, use REST API directly
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            // Pass the key via header, never the URL query string · URLs leak
            // into browser history, the Referer header, and intermediary logs.
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemPrompt }] },
              contents: [{ role: 'user', parts: [{ text: userMessage }] }],
              generationConfig: { maxOutputTokens: maxTokens },
            }),
          }
        );

        if (!response.ok) {
          const errText = await response.text();
          throw new AiHttpError(
            response.status,
            parseRetryAfter(response.headers.get('Retry-After')),
            `Gemini API error ${response.status}: ${errText}`,
          );
        }

        const data = await response.json();
        const content: string = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const meta = data.usageMetadata as GeminiUsageMetadata | undefined;
        const inputTokens = meta?.promptTokenCount ?? 0;
        const outputTokens = meta?.candidatesTokenCount ?? 0;
        const usage: TokenUsage = {
          inputTokens,
          outputTokens,
          totalTokens: meta?.totalTokenCount ?? inputTokens + outputTokens,
          durationMs: Date.now() - startedAt,
        };
        return { content, usage };
      }
    },

    /**
     * Streaming variant. Uses the REST `streamGenerateContent?alt=sse`
     * endpoint directly (skips the SDK to avoid extra deps). Each SSE event
     * carries a complete `GenerateContentResponse` JSON with one or more
     * `candidates[*].content.parts[*].text` deltas · we yield the first
     * candidate's first text part per event. The final event(s) usually
     * also carry `usageMetadata`; we keep the latest seen and emit it as a
     * single `{ type: 'usage' }` event at end-of-stream.
     */
    async *analyzeStream(
      systemPrompt: string,
      userMessage: string,
      maxTokens = 4096,
      signal?: AbortSignal,
    ): AsyncIterable<StreamEvent> {
      const startedAt = Date.now();
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
        {
          method: 'POST',
          // Key travels in the x-goog-api-key header, never the URL (avoids
          // history / Referer / proxy-log leakage). `alt=sse` stays in the query.
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userMessage }] }],
            generationConfig: { maxOutputTokens: maxTokens },
          }),
          signal,
        },
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new AiHttpError(
          response.status,
          parseRetryAfter(response.headers.get('Retry-After')),
          `Gemini API error ${response.status}: ${errText}`,
        );
      }

      if (!response.body) {
        throw new AiHttpError(0, null, 'Gemini API returned an empty stream body');
      }

      let lastMeta: GeminiUsageMetadata | null = null;

      for await (const payload of iterSseLines(response.body)) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }
        const obj = parsed as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
          usageMetadata?: GeminiUsageMetadata;
          error?: { message?: string; code?: number };
        };
        if (obj.error) {
          throw new AiHttpError(
            obj.error.code ?? 0,
            null,
            `Gemini stream error: ${obj.error.message ?? 'unknown'}`,
          );
        }
        if (obj.usageMetadata) {
          lastMeta = obj.usageMetadata;
        }
        const text = obj.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) yield { type: 'text', text };
      }

      if (lastMeta) {
        const inputTokens = lastMeta.promptTokenCount ?? 0;
        const outputTokens = lastMeta.candidatesTokenCount ?? 0;
        yield {
          type: 'usage',
          usage: {
            inputTokens,
            outputTokens,
            totalTokens: lastMeta.totalTokenCount ?? inputTokens + outputTokens,
            durationMs: Date.now() - startedAt,
          },
        };
      }
    },

    isConfigured(): boolean {
      return !!apiKey && apiKey !== 'your_gemini_key_here';
    },
  };
}
