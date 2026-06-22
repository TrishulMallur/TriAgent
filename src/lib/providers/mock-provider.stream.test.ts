import { describe, it, expect } from 'vitest';
import { createMockProvider } from './mock-provider';

const ADVISOR_NOTE_PROMPT = 'You are a CIRO compliance auditor for a Canadian advisory firm.';

describe('createMockProvider().analyzeStream', () => {
  it('yields multiple chunks for an advisor-note prompt', async () => {
    const provider = createMockProvider();
    expect(typeof provider.analyzeStream).toBe('function');

    const chunks: string[] = [];
    for await (const event of provider.analyzeStream!(ADVISOR_NOTE_PROMPT, 'A standard compliant note')) {
      if (event.type === 'text') chunks.push(event.text);
    }

    // Mock provider slices into 6 roughly-equal chunks.
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => typeof c === 'string' && c.length > 0)).toBe(true);
  });

  it('accumulates to the same string as analyze()', async () => {
    const provider = createMockProvider();
    const userMessage = 'A standard compliant note';

    const streamed: string[] = [];
    for await (const event of provider.analyzeStream!(ADVISOR_NOTE_PROMPT, userMessage)) {
      if (event.type === 'text') streamed.push(event.text);
    }
    const streamedFull = streamed.join('');

    const direct = await provider.analyze(ADVISOR_NOTE_PROMPT, userMessage);

    // Both paths route through the same mock router → identical JSON text.
    expect(streamedFull).toBe(direct.content);
  });

  it('aborts cleanly when the consumer signals AbortController', async () => {
    const provider = createMockProvider();
    const controller = new AbortController();

    const received: string[] = [];
    let caught: unknown = null;
    try {
      for await (const event of provider.analyzeStream!(
        ADVISOR_NOTE_PROMPT,
        'A standard compliant note',
        undefined,
        controller.signal,
      )) {
        if (event.type === 'text') received.push(event.text);
        // After the first chunk, abort. The next loop iteration should throw.
        controller.abort();
      }
    } catch (err) {
      caught = err;
    }

    // Either the first chunk arrived and then abort threw, or abort raced
    // ahead of the first chunk. Either way, we should NOT have received all 6
    // chunks, and the loop must have terminated (no hung timer).
    expect(received.length).toBeLessThan(6);
    // AbortError is the expected throw shape. We throw a DOMException whose
    // `.name === 'AbortError'`; in jsdom DOMException is not always an Error
    // subclass, so we only assert on the shape, not the prototype chain.
    if (caught) {
      expect(typeof (caught as { name?: unknown }).name).toBe('string');
      expect((caught as { name: string }).name).toBe('AbortError');
    }
  });
});
