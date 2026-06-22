/**
 * Response cache for AI calls.
 *
 * Pure logic · no React, no zod, no UI deps. Used by `ai.ts` to wrap each
 * `withRetry(...)` call so repeat prompts skip the network entirely.
 *
 * Storage shape:
 *   - In-memory: Map<key, { value, timestamp, lastAccess }>
 *   - Optional localStorage snapshot under `storageKey` for cross-reload survival.
 *
 * Behaviour:
 *   - LRU eviction at `maxEntries` (oldest `lastAccess` wins the eviction lottery).
 *   - TTL expiry on read (`Date.now() - timestamp > ttlMs`); ttlMs=0 disables TTL.
 *   - `enabled: false` short-circuits reads/writes but `clearCache` + `cacheSize`
 *     always reflect reality.
 */

export interface CacheOptions {
  /** Master switch. When false, getCached returns null and setCached is a no-op. Default true. */
  enabled?: boolean;
  /** TTL in ms for in-memory entries. Default 24 * 60 * 60 * 1000 (24h). 0 disables TTL. */
  ttlMs?: number;
  /** If true, persist a snapshot of the in-memory map to localStorage so the cache survives page reloads. Default false. */
  persistToLocalStorage?: boolean;
  /** localStorage key when persistToLocalStorage=true. Default 'triagent-cache-v1'. */
  storageKey?: string;
  /** Cap on the number of in-memory entries (LRU eviction). Default 200. */
  maxEntries?: number;
}

interface CacheEntry {
  value: string;
  timestamp: number;
  lastAccess: number;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STORAGE_KEY = 'triagent-cache-v1';
const DEFAULT_MAX_ENTRIES = 200;

// Module-level singletons. Tests reset them via clearCache().
const memoryCache: Map<string, CacheEntry> = new Map();
let _hydrated = false;
let _storageWarned = false;
let _storageDisabledForSession = false;

function resolveOptions(opts?: CacheOptions): Required<CacheOptions> {
  return {
    enabled: opts?.enabled ?? true,
    ttlMs: opts?.ttlMs ?? DEFAULT_TTL_MS,
    persistToLocalStorage: opts?.persistToLocalStorage ?? false,
    storageKey: opts?.storageKey ?? DEFAULT_STORAGE_KEY,
    maxEntries: opts?.maxEntries ?? DEFAULT_MAX_ENTRIES,
  };
}

function warnOnce(message: string): void {
  if (_storageWarned) return;
  _storageWarned = true;
  // eslint-disable-next-line no-console
  console.warn(message);
}

function safeReadStorage(key: string): string | null {
  if (_storageDisabledForSession) return null;
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch (err) {
    _storageDisabledForSession = true;
    warnOnce(`[cache] localStorage read failed; disabling persistence for this session: ${(err as Error).message}`);
    return null;
  }
}

function safeWriteStorage(key: string, value: string): void {
  if (_storageDisabledForSession) return;
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  } catch (err) {
    _storageDisabledForSession = true;
    warnOnce(`[cache] localStorage write failed (quota or environment); disabling persistence for this session: ${(err as Error).message}`);
  }
}

function persistSnapshot(storageKey: string): void {
  const snapshot = JSON.stringify(Array.from(memoryCache.entries()));
  safeWriteStorage(storageKey, snapshot);
}

/**
 * Compute a stable cache key from the parts. Uses Web Crypto SHA-256.
 * Returns a hex string. Parts are joined with the NUL byte (\0) which cannot
 * appear inside a typical JS string we'd cache, making the join unambiguous.
 */
export async function cacheKey(parts: string[]): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(parts.join('\0'));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hydrate the in-memory map from localStorage. Safe to call repeatedly ·
 * only runs once per page load.
 */
export function hydrateFromStorage(opts?: CacheOptions): void {
  if (_hydrated) return;
  _hydrated = true;
  const resolved = resolveOptions(opts);
  const raw = safeReadStorage(resolved.storageKey);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as Array<[string, CacheEntry]>;
    if (!Array.isArray(parsed)) return;
    for (const item of parsed) {
      if (
        Array.isArray(item) &&
        item.length === 2 &&
        typeof item[0] === 'string' &&
        item[1] &&
        typeof item[1] === 'object' &&
        typeof (item[1] as CacheEntry).value === 'string'
      ) {
        memoryCache.set(item[0], item[1] as CacheEntry);
      }
    }
  } catch (err) {
    warnOnce(`[cache] failed to parse persisted snapshot; ignoring: ${(err as Error).message}`);
  }
}

/**
 * Get a cached raw response. Returns null on miss, on TTL expiry, or when disabled.
 */
export async function getCached(key: string, opts?: CacheOptions): Promise<string | null> {
  const resolved = resolveOptions(opts);
  if (!resolved.enabled) return null;

  if (resolved.persistToLocalStorage && !_hydrated) {
    hydrateFromStorage(opts);
  }

  const entry = memoryCache.get(key);
  if (!entry) return null;

  if (resolved.ttlMs > 0 && Date.now() - entry.timestamp > resolved.ttlMs) {
    memoryCache.delete(key);
    if (resolved.persistToLocalStorage) {
      persistSnapshot(resolved.storageKey);
    }
    return null;
  }

  entry.lastAccess = Date.now();
  return entry.value;
}

/**
 * Store a raw response. No-op when disabled. Triggers LRU eviction when over maxEntries.
 * If persistToLocalStorage is true, also writes the snapshot.
 */
export async function setCached(key: string, value: string, opts?: CacheOptions): Promise<void> {
  const resolved = resolveOptions(opts);
  if (!resolved.enabled) return;

  if (resolved.persistToLocalStorage && !_hydrated) {
    hydrateFromStorage(opts);
  }

  // If we'll be inserting a brand-new key and we'd overflow, evict first.
  // (Replacing an existing key is a no-op size-wise, so skip eviction in that case.)
  if (!memoryCache.has(key)) {
    while (memoryCache.size >= resolved.maxEntries) {
      let oldestKey: string | null = null;
      let oldestAccess = Infinity;
      for (const [k, v] of memoryCache.entries()) {
        if (v.lastAccess < oldestAccess) {
          oldestAccess = v.lastAccess;
          oldestKey = k;
        }
      }
      if (oldestKey === null) break;
      memoryCache.delete(oldestKey);
    }
  }

  const now = Date.now();
  memoryCache.set(key, { value, timestamp: now, lastAccess: now });

  if (resolved.persistToLocalStorage) {
    persistSnapshot(resolved.storageKey);
  }
}

/** Clear everything. Always runs regardless of `enabled`. */
export function clearCache(opts?: CacheOptions): void {
  memoryCache.clear();
  _hydrated = false;
  _storageWarned = false;
  _storageDisabledForSession = false;
  if (opts?.persistToLocalStorage) {
    const storageKey = opts.storageKey ?? DEFAULT_STORAGE_KEY;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // best effort · swallow
    }
  }
}

/** Read current entry count (handy for tests + the Settings UI later). */
export function cacheSize(): number {
  return memoryCache.size;
}
