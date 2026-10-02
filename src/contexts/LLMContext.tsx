import { createContext, useContext, useState, useMemo, useEffect, type ReactNode } from 'react';
import type { LLMProvider, ProviderId, ProviderConfig } from '@/lib/llm-provider';
import { getDefaultConfig, looksLikeCompleteKey } from '@/lib/llm-provider';
import { createClaudeProvider } from '@/lib/providers/claude-provider';
import { createGeminiProvider } from '@/lib/providers/gemini-provider';
import { createLMStudioProvider } from '@/lib/providers/lmstudio-provider';
import { createLlamaCppProvider } from '@/lib/providers/llamacpp-provider';
import { createOpenAIProvider } from '@/lib/providers/openai-provider';
import { createOpenRouterProvider } from '@/lib/providers/openrouter-provider';
import { createMockProvider } from '@/lib/providers/mock-provider';
import { createBackendProvider } from '@/lib/providers/backend-provider';
import { setActiveProvider, setCacheOptions } from '@/lib/ai';
import {
  getSessionTotals,
  resetSession as resetSessionUsage,
  subscribe as subscribeUsage,
  type SessionTotals,
} from '@/lib/usage-tracker';

interface LLMContextType {
  activeProviderId: ProviderId;
  setProvider: (id: ProviderId) => void;
  provider: LLMProvider;
  useBackend: boolean;
  setUseBackend: (val: boolean) => void;
  isConfigured: boolean;
  config: ProviderConfig;
  updateConfig: (updates: Partial<ProviderConfig>) => void;
  /**
   * Clear the per-provider API key (and optional base URL override) for
   * a single provider. Mirrors the clear to localStorage so a reload
   * doesn't resurrect the old value. Used by the ApiKeyManager "Clear" button.
   */
  clearApiKey: (id: ProviderId) => void;
  /** Master cache switch. When false, every AI call bypasses the cache. */
  cacheEnabled: boolean;
  setCacheEnabled: (val: boolean) => void;
  /** When true, the in-memory cache snapshot is mirrored to localStorage so it survives reloads. */
  cachePersist: boolean;
  setCachePersist: (val: boolean) => void;
  /**
   * Whether the FastAPI backend's /api/health endpoint responded successfully
   * on the latest check. Defaults to true (optimistic) and flips to false only
   * after a failed check while `useBackend` is on. Other hooks that read from
   * the backend (e.g. `useAuditEntries`) consult this to decide whether to
   * fire a request or fall back to local mock data.
   */
  backendReachable: boolean;
  /**
   * Session-wide AI usage totals, synced from `lib/usage-tracker` via a
   * subscription. Re-rendered every time a new call (or cache hit) is
   * recorded. Use the underlying `usage-tracker` module directly if you need
   * the most-recent individual call (e.g. for a per-result badge).
   */
  sessionUsage: SessionTotals;
  /** Reset session totals to zero. Notifies all subscribers. */
  resetSessionUsage: () => void;
}

const LLMContext = createContext<LLMContextType | null>(null);

// Every first-time visitor lands in demo mode (mock provider). Pasting a key in
// Settings switches them to that provider (see ApiKeyManager). A returning
// visitor keeps whatever provider they last chose (persisted below).
const DEFAULT_PROVIDER: ProviderId = 'mock';
const DEFAULT_USE_BACKEND = import.meta.env.VITE_USE_BACKEND === 'true';

/**
 * Provider IDs that carry an apiKey / base URL override / model worth
 * persisting. `mock` is excluded · there's nothing to remember for it.
 * Adding a new provider here is mandatory when adding to ProviderId so its
 * localStorage round-trip picks up on reload.
 */
const PERSISTED_PROVIDERS: readonly (keyof ProviderConfig)[] = [
  'claude',
  'gemini',
  'openai',
  'openrouter',
  'lmstudio',
  'llamacpp',
  'backend',
];

const LS_KEY = (id: ProviderId | 'active') => `triagent.providers.${id}`;

/**
 * Hydrate the ProviderConfig from localStorage. Reads each persisted key
 * (`triagent.providers.<id>`) and merges the parsed object on top of the
 * built-in defaults so new fields get their defaults on the next deploy.
 */
function hydrateFromLocalStorage(base: ProviderConfig): ProviderConfig {
  const out: ProviderConfig = {
    claude: { ...base.claude },
    gemini: { ...base.gemini },
    lmstudio: { ...base.lmstudio },
    llamacpp: { ...base.llamacpp },
    openai: { ...base.openai },
    openrouter: { ...base.openrouter },
    backend: { ...base.backend },
  };
  for (const id of PERSISTED_PROVIDERS) {
    const raw = localStorage.getItem(LS_KEY(id));
    if (!raw) continue;
    try {
      const patch = JSON.parse(raw) as Record<string, unknown>;
      // Merge only known fields so stale keys from prior schemas don't leak.
      const entry = out[id] as Record<string, unknown>;
      for (const key of ['apiKey', 'baseUrl', 'model', 'endpoint']) {
        const v = patch[key];
        if (typeof v === 'string') {
          entry[key] = v;
        }
      }
    } catch {
      // Corrupted entry · ignore rather than break the app.
      try {
        localStorage.removeItem(LS_KEY(id));
      } catch {
        /* ignore quota errors */
      }
    }
  }
  return out;
}

/**
 * Persist the per-provider slices to localStorage. Only writes fields that
 * differ from defaults to keep storage small and make "reset to defaults"
 * behave predictably after a key clear.
 */
function persistToLocalStorage(config: ProviderConfig) {
  for (const id of PERSISTED_PROVIDERS) {
    const entry = config[id] as Record<string, unknown>;
    // Only persist non-empty user overrides · prevents writing `{ apiKey: '' }`
    // over and over, and lets a fresh deploy pick up new defaults.
    const record: Record<string, string> = {};
    for (const key of ['apiKey', 'baseUrl', 'model', 'endpoint']) {
      const v = entry[key];
      if (typeof v === 'string' && v.length > 0) record[key] = v;
    }
    const serialized = JSON.stringify(record);
    try {
      if (Object.keys(record).length === 0) {
        localStorage.removeItem(LS_KEY(id));
      } else {
        localStorage.setItem(LS_KEY(id), serialized);
      }
    } catch {
      /* ignore quota / private-mode errors */
    }
  }
}

function createProvider(id: ProviderId, config: ProviderConfig): LLMProvider {
  switch (id) {
    case 'claude':
      return createClaudeProvider(config.claude.apiKey, config.claude.model);
    case 'gemini':
      return createGeminiProvider(config.gemini.apiKey, config.gemini.model);
    case 'lmstudio':
      return createLMStudioProvider(config.lmstudio.endpoint);
    case 'llamacpp':
      return createLlamaCppProvider(config.llamacpp.endpoint);
    case 'openai':
      return createOpenAIProvider(config.openai.apiKey, config.openai.model, config.openai.baseUrl);
    case 'openrouter':
      return createOpenRouterProvider(config.openrouter.apiKey, config.openrouter.model, config.openrouter.baseUrl);
    case 'backend':
      return createBackendProvider(config.backend.baseUrl, '', 'gemini', 'gemini-2.0-flash', import.meta.env.VITE_BACKEND_API_KEY || '');
    case 'mock':
    default:
      return createMockProvider();
  }
}

export function LLMProviderWrapper({ children }: { children: ReactNode }) {
  const [activeProviderId, setActiveProviderId] = useState<ProviderId>(() => {
    let stored: string | null = null;
    try {
      stored = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY('active')) : null;
    } catch {
      // Storage blocked (privacy mode / SecurityError): start in demo mode.
    }
    // 'backend' is not restored: as a provider of its own it has no visitor key,
    // so every call would 401. Visitors reach the backend by choosing a cloud
    // provider and adding their key.
    return stored && ['claude', 'gemini', 'lmstudio', 'llamacpp', 'openai', 'openrouter', 'mock'].includes(stored)
      ? (stored as ProviderId)
      : DEFAULT_PROVIDER;
  });
  const [useBackend, setUseBackend] = useState(DEFAULT_USE_BACKEND);
  const [config, setConfig] = useState<ProviderConfig>(() => {
    // Safe SSR guard · import.meta doesn't know about window during SSR builds.
    if (typeof window === 'undefined') return getDefaultConfig();
    try {
      return hydrateFromLocalStorage(getDefaultConfig());
    } catch {
      return getDefaultConfig();
    }
  });
  const [backendReachable, setBackendReachable] = useState<boolean>(true);
  const [cacheEnabled, setCacheEnabled] = useState<boolean>(true);
  const [cachePersist, setCachePersist] = useState<boolean>(false);
  const [sessionUsage, setSessionUsage] = useState<SessionTotals>(() => getSessionTotals());

  // Subscribe to the singleton usage tracker so the context re-renders when
  // recordUsage(...) fires. Unsubscribe on unmount.
  useEffect(() => {
    const unsub = subscribeUsage((totals) => setSessionUsage(totals));
    setSessionUsage(getSessionTotals());
    return unsub;
  }, []);

  // Persist provider config to localStorage on every change. Wrapped in a
  // try/catch in case the user is in private mode · we'd rather log than
  // break the UI.
  useEffect(() => {
    try {
      persistToLocalStorage(config);
    } catch {
      /* ignore */
    }
  }, [config]);

  // Persist the chosen active provider id so a reload keeps it.
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY('active'), activeProviderId);
    } catch {
      /* ignore */
    }
  }, [activeProviderId]);

  const provider = useMemo(
    () => createProvider(activeProviderId, config),
    [activeProviderId, config]
  );

  const providerConfigured = provider.isConfigured();

  // When backend mode is on, route all AI calls through FastAPI (no keys in browser)
  const backendBaseUrl = config.backend.baseUrl || import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

  // Determine which cloud provider + key + model to forward to the backend proxy.
  // If the user selected a non-proxiable provider (local, mock) fall back to gemini.
  const { backendProvider, activeIsCloud, cloudKeyComplete } = useMemo(() => {
    const PROXY_PROVIDERS = ['claude', 'gemini', 'openai', 'openrouter'] as const;
    type ProxyProvider = (typeof PROXY_PROVIDERS)[number];
    const proxyProvider: ProxyProvider = PROXY_PROVIDERS.includes(activeProviderId as ProxyProvider)
      ? (activeProviderId as ProxyProvider)
      : 'gemini';

    let userApiKey = '';
    let proxyModel = 'gemini-2.0-flash';
    switch (proxyProvider) {
      case 'claude':
        userApiKey = config.claude.apiKey;
        proxyModel = config.claude.model;
        break;
      case 'gemini':
        userApiKey = config.gemini.apiKey;
        proxyModel = config.gemini.model;
        break;
      case 'openai':
        userApiKey = config.openai.apiKey;
        proxyModel = config.openai.model;
        break;
      case 'openrouter':
        userApiKey = config.openrouter.apiKey;
        proxyModel = config.openrouter.model;
        break;
    }
    const backendApiKey = import.meta.env.VITE_BACKEND_API_KEY || '';
    return {
      backendProvider: createBackendProvider(backendBaseUrl, userApiKey, proxyProvider, proxyModel, backendApiKey),
      // Only a cloud provider the visitor actually chose can go live -- demo (mock)
      // and local providers never use a stale cloud key.
      activeIsCloud: PROXY_PROVIDERS.includes(activeProviderId as ProxyProvider),
      // ...and only with a complete-looking key: '', a build-time placeholder
      // ('your_claude_key_here') or a half-typed key would only earn a 401.
      cloudKeyComplete: looksLikeCompleteKey(userApiKey),
    };
  }, [backendBaseUrl, activeProviderId, config]);

  // Health check the backend once per baseUrl change. If unreachable, fall back to the
  // configured provider (or mock) so the app doesn't show "Failed to fetch" indefinitely.
  useEffect(() => {
    let cancelled = false;
    setBackendReachable(true);

    if (!useBackend) return;

    (async () => {
      try {
        const resp = await fetch(`${backendBaseUrl}/api/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (cancelled) return;
        if (!resp.ok) {
          console.warn(
            `[LLMContext] Backend health check returned ${resp.status} · falling back to in-browser provider`
          );
          setBackendReachable(false);
        }
      } catch (err) {
        if (cancelled) return;
        console.warn(
          '[LLMContext] Backend unreachable · falling back to in-browser provider',
          err
        );
        setBackendReachable(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [useBackend, backendBaseUrl]);

  // Auto-fallback to mock if provider isn't configured
  const effectiveProvider = useMemo(() => {
    // A cloud provider without a complete key is demo mode, through the backend
    // or direct: never send '', a placeholder or a half-typed key upstream.
    if (activeIsCloud && !cloudKeyComplete) return createMockProvider();
    if (useBackend && backendReachable && activeIsCloud) return backendProvider;
    // The bare backend provider never carries a visitor key -> always a 401.
    if (activeProviderId === 'backend') return createMockProvider();
    if (!providerConfigured && activeProviderId !== 'mock') {
      return createMockProvider();
    }
    return provider;
  }, [provider, providerConfigured, activeProviderId, useBackend, backendReachable, backendProvider, activeIsCloud, cloudKeyComplete]);

  // What Settings shows as "configured": a cloud provider only with a complete
  // key (the same rule that decides live vs demo above), else the provider's own check.
  const isConfigured = activeIsCloud ? cloudKeyComplete : providerConfigured;

  // Sync the active provider into ai.ts so all AI calls use the context provider
  useEffect(() => {
    setActiveProvider(effectiveProvider);
  }, [effectiveProvider]);

  // Sync cache config into ai.ts.
  useEffect(() => {
    setCacheOptions({ enabled: cacheEnabled, persistToLocalStorage: cachePersist });
  }, [cacheEnabled, cachePersist]);

  const updateConfig = (updates: Partial<ProviderConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  };

  const clearApiKey = (id: ProviderId) => {
    setConfig((prev) => {
      const next = { ...prev };
      switch (id) {
        case 'claude':
          next.claude = { ...prev.claude, apiKey: '' };
          break;
        case 'gemini':
          next.gemini = { ...prev.gemini, apiKey: '' };
          break;
        case 'openai':
          next.openai = { ...prev.openai, apiKey: '', baseUrl: undefined };
          break;
        case 'openrouter':
          next.openrouter = { ...prev.openrouter, apiKey: '', baseUrl: undefined };
          break;
        case 'lmstudio':
          next.lmstudio = { ...prev.lmstudio, endpoint: getDefaultConfig().lmstudio.endpoint };
          break;
        case 'llamacpp':
          next.llamacpp = { ...prev.llamacpp, endpoint: getDefaultConfig().llamacpp.endpoint };
          break;
        case 'backend':
          next.backend = { baseUrl: getDefaultConfig().backend.baseUrl };
          break;
      }
      return next;
    });
    try {
      localStorage.removeItem(LS_KEY(id));
    } catch {
      /* ignore */
    }
  };

  return (
    <LLMContext.Provider
      value={{
        activeProviderId,
        setProvider: setActiveProviderId,
        provider: effectiveProvider,
        useBackend,
        setUseBackend,
        isConfigured,
        config,
        updateConfig,
        clearApiKey,
        cacheEnabled,
        setCacheEnabled,
        cachePersist,
        setCachePersist,
        backendReachable,
        sessionUsage,
        resetSessionUsage,
      }}
    >
      {children}
    </LLMContext.Provider>
  );
}

export function useLLM() {
  const context = useContext(LLMContext);
  if (!context) throw new Error('useLLM must be used within LLMProviderWrapper');
  return context;
}
