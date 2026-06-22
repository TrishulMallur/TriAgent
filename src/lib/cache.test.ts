import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  cacheKey,
  getCached,
  setCached,
  clearCache,
  cacheSize,
  hydrateFromStorage,
} from './cache';

beforeEach(() => {
  clearCache();
  try {
    localStorage.clear();
  } catch {
    // jsdom · should always work, but be defensive
  }
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cacheKey', () => {
  it('is stable: same input parts → same hex hash; different input → different hash', async () => {
    const a1 = await cacheKey(['claude-sonnet', 'system prompt', 'user message']);
    const a2 = await cacheKey(['claude-sonnet', 'system prompt', 'user message']);
    expect(a1).toBe(a2);
    expect(a1).toMatch(/^[0-9a-f]{64}$/);

    const b = await cacheKey(['claude-sonnet', 'system prompt', 'different message']);
    expect(b).not.toBe(a1);
  });

  it('is order-sensitive: cacheKey(["a","b"]) !== cacheKey(["b","a"])', async () => {
    const ab = await cacheKey(['a', 'b']);
    const ba = await cacheKey(['b', 'a']);
    expect(ab).not.toBe(ba);
  });
});

describe('hit / miss', () => {
  it('setCached then getCached returns value; unknown key returns null', async () => {
    await setCached('key1', 'value1');
    expect(await getCached('key1')).toBe('value1');
    expect(await getCached('other-key')).toBeNull();
  });
});

describe('TTL', () => {
  it('expires entries past ttlMs and deletes them from the map', async () => {
    const start = new Date('2026-01-01T00:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(start);

    await setCached('k', 'v', { ttlMs: 100 });
    expect(await getCached('k', { ttlMs: 100 })).toBe('v');

    // Advance well past TTL
    vi.setSystemTime(new Date(start.getTime() + 500));
    expect(await getCached('k', { ttlMs: 100 })).toBeNull();
    expect(cacheSize()).toBe(0);
  });

  it('ttlMs=0 never expires (even one year later)', async () => {
    const start = new Date('2026-01-01T00:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(start);

    await setCached('forever', 'v', { ttlMs: 0 });

    // +1 year
    vi.setSystemTime(new Date(start.getTime() + 365 * 24 * 60 * 60 * 1000));
    expect(await getCached('forever', { ttlMs: 0 })).toBe('v');
  });
});

describe('enabled: false', () => {
  it('short-circuits both reads and writes', async () => {
    await setCached('k', 'v', { enabled: false });
    expect(cacheSize()).toBe(0);
    expect(await getCached('k', { enabled: false })).toBeNull();

    // And even if something *was* cached previously, disabled reads return null.
    await setCached('k2', 'v2');
    expect(await getCached('k2', { enabled: false })).toBeNull();
  });
});

describe('LRU eviction', () => {
  it('evicts the least-recently-accessed entry when over maxEntries', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const opts = { maxEntries: 3 } as const;

    await setCached('a', '1', opts);
    vi.advanceTimersByTime(10);
    await setCached('b', '2', opts);
    vi.advanceTimersByTime(10);
    await setCached('c', '3', opts);

    // Touch 'a' so it becomes most-recently-used.
    vi.advanceTimersByTime(10);
    expect(await getCached('a', opts)).toBe('1');

    // Insert a 4th; 'b' is now the oldest by lastAccess and should be evicted.
    vi.advanceTimersByTime(10);
    await setCached('d', '4', opts);

    expect(cacheSize()).toBe(3);
    expect(await getCached('a', opts)).toBe('1');
    expect(await getCached('b', opts)).toBeNull();
    expect(await getCached('c', opts)).toBe('3');
    expect(await getCached('d', opts)).toBe('4');
  });
});

describe('clearCache', () => {
  it('empties the map', async () => {
    await setCached('a', '1');
    await setCached('b', '2');
    expect(cacheSize()).toBe(2);
    clearCache();
    expect(cacheSize()).toBe(0);
    expect(await getCached('a')).toBeNull();
  });
});

describe('localStorage persistence', () => {
  it('writes to localStorage when persistToLocalStorage=true', async () => {
    await setCached('pk', 'pv', { persistToLocalStorage: true });
    const raw = localStorage.getItem('triagent-cache-v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0][0]).toBe('pk');
    expect(parsed[0][1].value).toBe('pv');
  });

  it('hydrateFromStorage repopulates the in-memory map', async () => {
    await setCached('hk', 'hv', { persistToLocalStorage: true });
    expect(cacheSize()).toBe(1);

    // Wipe in-memory state but DON'T touch localStorage. clearCache() also
    // resets the _hydrated flag, which is what we want before re-hydrating.
    clearCache();
    expect(cacheSize()).toBe(0);

    hydrateFromStorage({ persistToLocalStorage: true });
    expect(cacheSize()).toBe(1);
    expect(await getCached('hk', { persistToLocalStorage: true })).toBe('hv');
  });

  it('hydrateFromStorage is idempotent · second call is a no-op', async () => {
    await setCached('hk', 'hv', { persistToLocalStorage: true });
    clearCache();

    hydrateFromStorage({ persistToLocalStorage: true });
    const sizeAfterFirst = cacheSize();
    hydrateFromStorage({ persistToLocalStorage: true });
    const sizeAfterSecond = cacheSize();

    expect(sizeAfterFirst).toBe(1);
    expect(sizeAfterSecond).toBe(1);
  });

  it('swallows localStorage quota errors and warns once', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    await expect(
      setCached('qk', 'qv', { persistToLocalStorage: true }),
    ).resolves.toBeUndefined();

    // Second write should NOT trigger another warn (warn-once semantics).
    await setCached('qk2', 'qv2', { persistToLocalStorage: true });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    setItemSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
