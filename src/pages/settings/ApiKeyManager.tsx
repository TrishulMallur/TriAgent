import { useMemo, useState } from 'react';
import { Card, Button } from '@/components/ui';
import { useLLM } from '@/contexts/LLMContext';
import { useToast } from '@/contexts/ToastContext';
import type { ProviderId, ProviderConfig } from '@/lib/llm-provider';
import { PROVIDER_LABELS, looksLikeCompleteKey } from '@/lib/llm-provider';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Trash2,
  Wifi,
  WifiOff,
  Sparkles,
  Globe,
  Server,
  Terminal,
  KeyRound,
  Zap,
} from 'lucide-react';

/**
 * Per-provider metadata for the card grid. Each entry carries the icon, the
 * one-line description shown under the name, and which optional fields the
 * card should render (key input / base URL override / model string).
 *
 * The list is the single source of truth for which providers surface in the
 * "Personal AI Keys" section · if a new provider ever lands, add it here.
 */
interface CardSpec {
  id: ProviderId;
  label: string;
  description: string;
  icon: React.ReactNode;
  /** True for cloud providers that bill per-token against the user's key. */
  acceptsKey: boolean;
  /** True for providers with an overridable base URL (LM Studio, llama.cpp, OpenRouter, OpenAI-compatible). */
  acceptsBaseUrl: boolean;
  /** Default base URL shown as a placeholder when none is configured. */
  defaultBaseUrl?: string;
  /** True for providers where the model slug is user-configurable. */
  acceptsModel?: boolean;
  /** Suggested model slugs shown in the datalist dropdown. */
  modelOptions?: string[];
}

const CARDS: CardSpec[] = [
  {
    id: 'claude',
    label: PROVIDER_LABELS.claude,
    description: "Anthropic's Claude family · best at structured JSON output used by TriAgent pipelines.",
    icon: <Sparkles className="w-5 h-5 text-orange-500" />,
    acceptsKey: true,
    acceptsBaseUrl: false,
    acceptsModel: true,
    modelOptions: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-haiku-20241022'],
  },
  {
    id: 'gemini',
    label: PROVIDER_LABELS.gemini,
    description: "Google's Gemini · fast multimodal responses; 2.0 Flash is the default low-latency option.",
    icon: <Sparkles className="w-5 h-5 text-blue-500" />,
    acceptsKey: true,
    acceptsBaseUrl: false,
    acceptsModel: true,
    modelOptions: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
  },
  {
    id: 'openai',
    label: PROVIDER_LABELS.openai,
    description: 'GPT-4o / 4o-mini. Override the base URL to point at LM Studio, vLLM, or any OpenAI-compatible endpoint.',
    icon: <Zap className="w-5 h-5 text-emerald-600" />,
    acceptsKey: true,
    acceptsBaseUrl: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
    acceptsModel: true,
    modelOptions: ['gpt-4o', 'gpt-4o-mini', 'o4-mini', 'gpt-4.1'],
  },
  {
    id: 'openrouter',
    label: PROVIDER_LABELS.openrouter,
    description: 'Single key, 100+ models. OpenRouter routes to Claude / GPT / Llama / etc. on your behalf.',
    icon: <Globe className="w-5 h-5 text-purple-500" />,
    acceptsKey: true,
    acceptsBaseUrl: true,
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    acceptsModel: true,
    modelOptions: [
      'anthropic/claude-sonnet-4',
      'anthropic/claude-opus-4',
      'anthropic/claude-haiku-4.5',
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'google/gemini-2.0-flash-exp:free',
      'meta-llama/llama-3.1-70b-instruct',
      'mistralai/mistral-large',
    ],
  },
  {
    id: 'lmstudio',
    label: PROVIDER_LABELS.lmstudio,
    description: 'Local inference via the LM Studio GUI · no API key, everything runs on your machine.',
    icon: <Server className="w-5 h-5 text-emerald-500" />,
    acceptsKey: false,
    acceptsBaseUrl: true,
    defaultBaseUrl: 'http://localhost:1234',
  },
  {
    id: 'llamacpp',
    label: PROVIDER_LABELS.llamacpp,
    description: 'Local llama.cpp server · lightweight GGUF inference, default port 8080.',
    icon: <Terminal className="w-5 h-5 text-amber-500" />,
    acceptsKey: false,
    acceptsBaseUrl: true,
    defaultBaseUrl: 'http://localhost:8080',
  },
  // No standalone Backend card: the Railway proxy needs the visitor's own key,
  // so the cloud cards above reach it automatically once a key is added.
];

/**
 * Derive the "currently configured" base URL from the provider config. The
 * field name differs per provider (`endpoint` vs `baseUrl`); normalize here
 * so the cards don't branch on id.
 */
function readBaseUrl(id: ProviderId, config: ProviderConfig): string {
  switch (id) {
    case 'lmstudio':
      return config.lmstudio.endpoint;
    case 'llamacpp':
      return config.llamacpp.endpoint;
    case 'openai':
      return config.openai.baseUrl ?? '';
    case 'openrouter':
      return config.openrouter.baseUrl ?? '';
    case 'backend':
      return config.backend.baseUrl;
    default:
      return '';
  }
}

function apiKeyOf(id: ProviderId, config: ProviderConfig): string {
  switch (id) {
    case 'claude':
      return config.claude.apiKey;
    case 'gemini':
      return config.gemini.apiKey;
    case 'openai':
      return config.openai.apiKey;
    case 'openrouter':
      return config.openrouter.apiKey;
    default:
      return '';
  }
}

function modelOf(id: ProviderId, config: ProviderConfig): string {
  switch (id) {
    case 'claude':
      return config.claude.model;
    case 'gemini':
      return config.gemini.model;
    case 'openai':
      return config.openai.model;
    case 'openrouter':
      return config.openrouter.model;
    default:
      return '';
  }
}

/**
 * Ping a LOCAL model server directly (never the Railway proxy): llama.cpp
 * exposes `/health`, LM Studio the OpenAI-compatible `/v1/models`.
 */
async function pingLocalServer(
  provider: ProviderId,
  baseUrl: string,
): Promise<{ ok: boolean; status: number; message: string }> {
  const path = provider === 'llamacpp' ? '/health' : '/v1/models';
  try {
    const resp = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, { signal: AbortSignal.timeout(3000) });
    return resp.ok
      ? { ok: true, status: resp.status, message: 'reachable' }
      : { ok: false, status: resp.status, message: `server returned ${resp.status}` };
  } catch {
    return { ok: false, status: 0, message: 'cannot reach the local server — is it running?' };
  }
}

/**
 * Ping the backend proxy with a dummy payload. Mirrors the Phase A contract:
 *   POST /api/llm/<provider>   with X-User-API-Key header
 *   Body: { messages: [{ role: 'user', content: 'ping' }], max_tokens: 8 }
 *
 * We don't care about the response body · just whether the endpoint answered
 * 2xx (key accepted + model reachable) vs non-2xx.
 */
async function pingBackendProxy(
  backendBaseUrl: string,
  provider: ProviderId,
  apiKey: string,
  model: string,
): Promise<{ ok: boolean; status: number; message: string }> {
  const url = `${backendBaseUrl.replace(/\/+$/, '')}/api/llm/${provider}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const backendApiKey = import.meta.env.VITE_BACKEND_API_KEY || '';
  if (backendApiKey) headers['X-API-Key'] = backendApiKey;
  if (apiKey) headers['X-User-API-Key'] = apiKey;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 8,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    let message = '';
    try {
      const text = await resp.text();
      message = text.slice(0, 160);
    } catch {
      /* ignore */
    }
    if (resp.ok) {
      return { ok: true, status: resp.status, message: message || 'OK' };
    }
    return { ok: false, status: resp.status, message: message || `HTTP ${resp.status}` };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: `Network error: ${err instanceof Error ? err.message : 'unreachable'}`,
    };
  }
}

interface ProviderCardProps {
  spec: CardSpec;
  apiKey: string;
  baseUrl: string;
  model: string;
  onKeyChange: (v: string) => void;
  /** The key field was committed (blur, paste, Enter) with this value. */
  onKeyCommit?: (v: string) => void;
  onBaseUrlChange: (v: string) => void;
  onModelChange: (v: string) => void;
  onClear: () => void;
  backendBaseUrl: string;
}

function ProviderCard({
  spec,
  apiKey,
  baseUrl,
  model,
  onKeyChange,
  onKeyCommit,
  onBaseUrlChange,
  onModelChange,
  onClear,
  backendBaseUrl,
}: ProviderCardProps) {
  const { addToast } = useToast();
  const [visible, setVisible] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');

  const hasAnything = (spec.acceptsKey && !!apiKey) || (spec.acceptsBaseUrl && !!baseUrl);

  // Cloud cards go through the proxy, which needs a complete key; local cards
  // (LM Studio / llama.cpp) are tested against their own server instead.
  const canTest = spec.acceptsKey ? looksLikeCompleteKey(apiKey) : !!(baseUrl || spec.defaultBaseUrl);

  const runTest = async () => {
    if (!canTest) return;
    setTestStatus('testing');
    setTestMessage('');
    const result = spec.acceptsKey
      ? await pingBackendProxy(backendBaseUrl, spec.id, apiKey, model)
      : await pingLocalServer(spec.id, baseUrl || spec.defaultBaseUrl || '');
    setTestStatus(result.ok ? 'ok' : 'fail');
    setTestMessage(result.message);
    addToast(
      result.ok ? 'success' : 'error',
      result.ok
        ? `${spec.label}: connection OK (${result.status})`
        : `${spec.label}: ${result.message}`,
    );
  };

  return (
    <Card padding="sm">
      <div className="space-y-3">
        {/* Header: icon + name + description */}
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-ws-accent/5 flex items-center justify-center flex-shrink-0">
            {spec.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-ws-dark">{spec.label}</h4>
              {spec.acceptsKey && looksLikeCompleteKey(apiKey) && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                  <CheckCircle2 className="w-3 h-3" /> key set
                </span>
              )}
              {spec.acceptsKey && !looksLikeCompleteKey(apiKey) && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-ws-muted bg-ws-sunken border border-ws-border rounded px-1.5 py-0.5">
                  no key
                </span>
              )}
            </div>
            <p className="text-xs text-ws-muted mt-0.5 leading-snug">{spec.description}</p>
          </div>
        </div>

        {/* API Key input (only where applicable) */}
        {spec.acceptsKey && (
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-ws-dark">API Key</label>
            <div className="relative">
              <input
                type={visible ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => onKeyChange(e.target.value)}
                onBlur={(e) => onKeyCommit?.(e.currentTarget.value)}
                onPaste={(e) => {
                  const input = e.currentTarget;
                  // Read the value after the paste has been applied.
                  setTimeout(() => onKeyCommit?.(input.value), 0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onKeyCommit?.(e.currentTarget.value);
                }}
                placeholder={spec.id === 'claude' ? 'sk-ant-…' : spec.id === 'gemini' ? 'AIza…' : spec.id === 'openrouter' ? 'sk-or-…' : 'sk-…'}
                autoComplete="off"
                spellCheck={false}
                className="w-full px-3 py-2 pr-16 text-sm rounded-lg border border-ws-border bg-white text-ws-dark focus:outline-none focus:ring-2 focus:ring-ws-accent/50 focus:border-ws-accent font-mono"
              />
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-ws-muted hover:text-ws-dark transition-colors"
                aria-label={visible ? 'Hide key' : 'Reveal key'}
              >
                {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        {/* Base URL override */}
        {spec.acceptsBaseUrl && (
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-ws-dark">
              Base URL{spec.defaultBaseUrl ? <span className="text-ws-muted font-normal"> · default {spec.defaultBaseUrl}</span> : null}
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => onBaseUrlChange(e.target.value)}
              placeholder={spec.defaultBaseUrl}
              className="w-full px-3 py-2 text-sm rounded-lg border border-ws-border bg-white text-ws-dark focus:outline-none focus:ring-2 focus:ring-ws-accent/50 focus:border-ws-accent font-mono"
            />
          </div>
        )}

        {/* Model selector */}
        {spec.acceptsModel && (
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-ws-dark">
              Model
              {spec.id === 'openrouter' && (
                <span className="text-ws-muted font-normal"> · format: <code className="font-mono text-[11px]">provider/model-name</code></span>
              )}
            </label>
            {spec.modelOptions && (
              <datalist id={`model-opts-${spec.id}`}>
                {spec.modelOptions.map((opt) => (
                  <option key={opt} value={opt} />
                ))}
              </datalist>
            )}
            <input
              type="text"
              list={spec.modelOptions ? `model-opts-${spec.id}` : undefined}
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              placeholder={spec.modelOptions?.[0] ?? ''}
              className="w-full px-3 py-2 text-sm rounded-lg border border-ws-border bg-white text-ws-dark focus:outline-none focus:ring-2 focus:ring-ws-accent/50 focus:border-ws-accent font-mono"
            />
          </div>
        )}

        {/* Actions row */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={runTest}
            disabled={testStatus === 'testing' || !canTest}
            title={canTest ? undefined : 'Paste a complete API key to test it'}
          >
            {testStatus === 'testing' ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-ws-border border-t-ws-accent rounded-full animate-spin" />
                Testing…
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5" />
                Test connection
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={!hasAnything && testStatus !== 'fail'}
            className="text-ws-muted hover:text-verdict-fail"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </Button>

          {testStatus === 'ok' && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
              <Wifi className="w-3.5 h-3.5" /> Connected
            </span>
          )}
          {testStatus === 'fail' && (
            <span
              className="inline-flex items-center gap-1 text-xs font-medium text-verdict-fail"
              title={testMessage}
            >
              <WifiOff className="w-3.5 h-3.5" /> Failed
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * Renders the "Personal AI Keys" section on the Settings page. One card per
 * provider, each with its own key input, optional base URL override, test,
 * and clear buttons. All writes go through `LLMContext.updateConfig`, which
 * persists to localStorage via the context's effect · so reload survival and
 * context reactivity both come for free.
 */
export function ApiKeyManager() {
  const { config, updateConfig, clearApiKey, activeProviderId, setProvider } = useLLM();
  const { addToast } = useToast();

  const backendBaseUrl = useMemo(
    () => config.backend.baseUrl || import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
    [config.backend.baseUrl],
  );

  const setApiKey = (id: ProviderId, apiKey: string) => {
    switch (id) {
      case 'claude':
        updateConfig({ claude: { ...config.claude, apiKey } } as Partial<ProviderConfig>);
        break;
      case 'gemini':
        updateConfig({ gemini: { ...config.gemini, apiKey } } as Partial<ProviderConfig>);
        break;
      case 'openai':
        updateConfig({ openai: { ...config.openai, apiKey } } as Partial<ProviderConfig>);
        break;
      case 'openrouter':
        updateConfig({ openrouter: { ...config.openrouter, apiKey } } as Partial<ProviderConfig>);
        break;
    }
  };

  // Leaving demo mode: a complete-looking key committed (blur / paste / Enter)
  // while on the mock provider makes that provider active, so adding a key is
  // all a visitor has to do. Never on a keystroke: a half-typed key must not
  // claim that live AI is on.
  const commitKey = (id: ProviderId, apiKey: string) => {
    if (activeProviderId === 'mock' && looksLikeCompleteKey(apiKey)) {
      setProvider(id);
      addToast('success', `${PROVIDER_LABELS[id]} key added · live AI is on (demo mode off)`);
    }
  };

  const setModel = (id: ProviderId, model: string) => {
    switch (id) {
      case 'claude':
        updateConfig({ claude: { ...config.claude, model } } as Partial<ProviderConfig>);
        break;
      case 'gemini':
        updateConfig({ gemini: { ...config.gemini, model } } as Partial<ProviderConfig>);
        break;
      case 'openai':
        updateConfig({ openai: { ...config.openai, model } } as Partial<ProviderConfig>);
        break;
      case 'openrouter':
        updateConfig({ openrouter: { ...config.openrouter, model } } as Partial<ProviderConfig>);
        break;
    }
  };

  const setBaseUrl = (id: ProviderId, value: string) => {
    switch (id) {
      case 'openai':
        updateConfig({ openai: { ...config.openai, baseUrl: value || undefined } } as Partial<ProviderConfig>);
        break;
      case 'openrouter':
        updateConfig({ openrouter: { ...config.openrouter, baseUrl: value || undefined } } as Partial<ProviderConfig>);
        break;
      case 'lmstudio':
        updateConfig({ lmstudio: { ...config.lmstudio, endpoint: value } } as Partial<ProviderConfig>);
        break;
      case 'llamacpp':
        updateConfig({ llamacpp: { ...config.llamacpp, endpoint: value } } as Partial<ProviderConfig>);
        break;
      case 'backend':
        updateConfig({ backend: { ...config.backend, baseUrl: value } } as Partial<ProviderConfig>);
        break;
    }
  };

  const handleClear = (id: ProviderId) => {
    clearApiKey(id);
    addToast('info', `${PROVIDER_LABELS[id]} key cleared`);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {CARDS.map((spec) => (
          <ProviderCard
            key={spec.id}
            spec={spec}
            apiKey={apiKeyOf(spec.id, config)}
            baseUrl={readBaseUrl(spec.id, config)}
            model={modelOf(spec.id, config)}
            onKeyChange={(v) => setApiKey(spec.id, v)}
            onKeyCommit={(v) => commitKey(spec.id, v)}
            onBaseUrlChange={(v) => setBaseUrl(spec.id, v)}
            onModelChange={(v) => setModel(spec.id, v)}
            onClear={() => handleClear(spec.id)}
            backendBaseUrl={backendBaseUrl}
          />
        ))}
      </div>

      <p className="flex items-start gap-2 text-xs text-ws-muted px-1 pt-1">
        <KeyRound className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-ws-muted" />
        <span>
          Your key is stored only in this browser's <code className="font-mono text-[11px]">localStorage</code>.
          It is sent to this app's Railway backend on every AI call, where it is forwarded to the upstream
          provider · TriAgent itself never holds your key.
        </span>
      </p>
    </div>
  );
}
