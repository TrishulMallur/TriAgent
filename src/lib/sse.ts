/**
 * Server-Sent Events (SSE) line parser for streaming LLM responses.
 *
 * Used by the streaming methods on the Claude, Gemini, LM Studio, and
 * llama.cpp providers. Each `fetch()` to a streaming endpoint returns a
 * `ReadableStream<Uint8Array>` body; this generator decodes UTF-8 chunks,
 * splits on newlines, buffers partial lines across `read()` boundaries,
 * and yields the data portion of each `data:` SSE line.
 *
 * Behaviour:
 *   - Lines beginning with `data: ` are yielded with the prefix stripped.
 *   - The OpenAI-style `data: [DONE]` sentinel ends the stream cleanly.
 *   - `event:`, `id:`, `retry:`, `:`-comment lines and blank lines are skipped.
 *   - Trailing data on a final partial line (no terminating newline) is
 *     flushed when the stream closes.
 *
 * Providers translate the yielded JSON-or-text payload into model text and
 * yield that to `runAnalysisStreaming` · this helper deliberately does NOT
 * know about the provider-specific JSON shape.
 */

/**
 * Async generator that consumes a `fetch()` response body and yields the
 * raw text after each `data:` SSE line. Lines that say `[DONE]` end the stream
 * cleanly; other control lines (`event:`, comments) are skipped.
 */
export async function* iterSseLines(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // Flush any decoder remainder.
        buffer += decoder.decode();
        // Process the final line if it contains data and has no terminating newline.
        const trailing = buffer.trim();
        if (trailing.startsWith('data:')) {
          const payload = trailing.slice(5).trimStart();
          if (payload && payload !== '[DONE]') {
            yield payload;
          }
        }
        return;
      }

      buffer += decoder.decode(value, { stream: true });

      // SSE events are delimited by `\n` (or `\r\n`). Split on `\n` and keep
      // the trailing partial line in the buffer.
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const rawLine = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);

        // Strip a trailing `\r` from CRLF endings.
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

        // Skip blank lines, comments (`:` prefix), and non-data fields.
        if (line === '' || line.startsWith(':')) continue;
        if (!line.startsWith('data:')) continue;

        const payload = line.slice(5).trimStart();
        if (payload === '[DONE]') return;
        if (payload === '') continue;
        yield payload;
      }
    }
  } finally {
    // Release the reader so the underlying stream can be cancelled by the caller.
    try {
      reader.releaseLock();
    } catch {
      // ignore · reader may already be detached on cancellation
    }
  }
}
