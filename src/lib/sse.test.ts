import { describe, it, expect } from 'vitest';
import { iterSseLines } from './sse';

/**
 * Build a ReadableStream<Uint8Array> from one or more string chunks.
 * Each chunk is enqueued separately so tests can simulate event boundaries
 * being split across `read()` calls.
 */
function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

async function collect(iter: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const v of iter) out.push(v);
  return out;
}

describe('iterSseLines', () => {
  it('yields the payload from a single data: line', async () => {
    const stream = streamOf('data: hello world\n\n');
    const lines = await collect(iterSseLines(stream));
    expect(lines).toEqual(['hello world']);
  });

  it('buffers a payload split across two read() chunks', async () => {
    // The first chunk has the start of the line; the second completes it
    // and terminates with a newline. iterSseLines must buffer across reads.
    const stream = streamOf('data: hel', 'lo world\n\n');
    const lines = await collect(iterSseLines(stream));
    expect(lines).toEqual(['hello world']);
  });

  it('terminates cleanly on [DONE] and yields nothing after', async () => {
    const stream = streamOf(
      'data: alpha\n',
      'data: beta\n',
      'data: [DONE]\n',
      'data: gamma\n', // must NOT be yielded
    );
    const lines = await collect(iterSseLines(stream));
    expect(lines).toEqual(['alpha', 'beta']);
  });

  it('skips blank lines, comments, and event: headers', async () => {
    const stream = streamOf(
      'event: ping\n',
      ': this is a comment\n',
      '\n',
      'data: only-this-counts\n',
      'id: 42\n',
      '\n',
    );
    const lines = await collect(iterSseLines(stream));
    expect(lines).toEqual(['only-this-counts']);
  });

  it('flushes a trailing data line that has no terminating newline', async () => {
    // Stream ends mid-line (server crashed / connection closed). The trailing
    // partial line still carries a payload, so we should yield it on flush.
    const stream = streamOf('data: partial-final');
    const lines = await collect(iterSseLines(stream));
    expect(lines).toEqual(['partial-final']);
  });
});
