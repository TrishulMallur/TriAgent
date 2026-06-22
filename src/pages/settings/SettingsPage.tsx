import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Badge, Select, Tabs } from '@/components/ui';
import { useRole } from '@/contexts/RoleContext';
import { useLLM } from '@/contexts/LLMContext';
import { useToast } from '@/contexts/ToastContext';
import type { ProviderId, ProviderConfig } from '@/lib/llm-provider';
import { UserManagement } from './UserManagement';
import { RuleConfiguration } from './RuleConfiguration';
import { ApiKeyManager } from './ApiKeyManager';
import { ProviderBadge } from '@/components/shared/ProviderBadge';
import {
  Settings,
  Cpu,
  CheckCircle2,
  XCircle,
  Wifi,
  WifiOff,
  Server,
  Terminal,
  Sparkles,
  SlidersHorizontal,
  KeyRound,
} from 'lucide-react';

// ============================================================
// AI PROVIDER TAB
// ============================================================
const PROVIDER_OPTIONS = [
  { value: 'claude', label: 'Claude (Anthropic)' },
  { value: 'gemini', label: 'Gemini (Google)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'lmstudio', label: 'LM Studio (Local)' },
  { value: 'llamacpp', label: 'llama.cpp (Local)' },
  { value: 'backend', label: 'Backend Proxy (Railway)' },
  { value: 'mock', label: 'Mock (Demo Mode)' },
];

const CLAUDE_MODELS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'claude-haiku-4-20250514', label: 'Claude Haiku 4' },
];

const GEMINI_MODELS = [
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
];

function AIProviderSettings() {
  const {
    activeProviderId,
    setProvider,
    useBackend,
    setUseBackend,
    isConfigured,
    config,
    updateConfig,
    sessionUsage,
    resetSessionUsage,
  } = useLLM();
  const { addToast } = useToast();
  const [lmStudioStatus, setLmStudioStatus] = useState<'idle' | 'testing' | 'connected' | 'failed'>('idle');
  const [llamaCppStatus, setLlamaCppStatus] = useState<'idle' | 'testing' | 'connected' | 'failed'>('idle');
  const [maxTokens, setMaxTokens] = useState(4096);

  const handleProviderChange = (value: string) => {
    setProvider(value as ProviderId);
    addToast('info', `Switched AI provider to ${PROVIDER_OPTIONS.find((p) => p.value === value)?.label}`);
  };

  const handleClaudeModelChange = (model: string) => {
    updateConfig({ claude: { ...config.claude, model } } as Partial<ProviderConfig>);
  };

  const handleGeminiModelChange = (model: string) => {
    updateConfig({ gemini: { ...config.gemini, model } } as Partial<ProviderConfig>);
  };

  const handleLmStudioEndpoint = (endpoint: string) => {
    updateConfig({ lmstudio: { ...config.lmstudio, endpoint } } as Partial<ProviderConfig>);
  };

  const handleLlamaCppEndpoint = (endpoint: string) => {
    updateConfig({ llamacpp: { ...config.llamacpp, endpoint } } as Partial<ProviderConfig>);
  };

  const testLlamaCppConnection = async () => {
    setLlamaCppStatus('testing');
    try {
      const resp = await fetch(`${config.llamacpp.endpoint}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        setLlamaCppStatus('connected');
        addToast('success', 'llama.cpp connection successful');
      } else {
        setLlamaCppStatus('failed');
        addToast('error', 'llama.cpp returned an error');
      }
    } catch {
      setLlamaCppStatus('failed');
      addToast('error', 'Cannot connect to llama.cpp. Is llama-server running?');
    }
  };

  const testLmStudioConnection = async () => {
    setLmStudioStatus('testing');
    try {
      const resp = await fetch(`${config.lmstudio.endpoint}/v1/models`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        setLmStudioStatus('connected');
        addToast('success', 'LM Studio connection successful');
      } else {
        setLmStudioStatus('failed');
        addToast('error', 'LM Studio returned an error');
      }
    } catch {
      setLmStudioStatus('failed');
      addToast('error', 'Cannot connect to LM Studio. Is it running?');
    }
  };

  const claudeConfigured = !!config.claude.apiKey;
  const geminiConfigured = !!config.gemini.apiKey;

  return (
    <div className="space-y-8">
      {/* Personal AI Keys · gated section at the top of the AI tab. The
          ApiKeyManager owns its own section header + cards. */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-ws-accent/10 flex items-center justify-center">
            <KeyRound className="w-5 h-5 text-ws-accent" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-ws-dark">Personal AI Keys</h3>
            <p className="text-sm text-ws-muted">
              Paste your own API key to unlock live AI. Keys stay in this browser's localStorage
              and are only forwarded to this app's Railway backend on each AI call.
            </p>
          </div>
        </div>
        <ApiKeyManager />
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-ws-accent/10 flex items-center justify-center">
          <Cpu className="w-5 h-5 text-ws-accent" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-ws-dark">AI Provider Configuration</h3>
          <p className="text-sm text-ws-muted">Select and configure the LLM provider for AI-powered analysis</p>
        </div>
      </div>

      {/* Active Provider Card */}
      <Card>
        <div className="space-y-4">
          <Select
            label="Active AI Provider"
            options={PROVIDER_OPTIONS}
            value={activeProviderId}
            onChange={handleProviderChange}
          />

          <div className="flex items-center gap-2">
            <ProviderBadge providerId={activeProviderId} isConfigured={isConfigured} />
            {activeProviderId !== 'mock' && !isConfigured && (
              <span className="text-xs text-ws-muted">No API key detected · falling back to mock responses</span>
            )}
          </div>
        </div>
      </Card>

      {/* Session Usage Card · running token + cost totals across the session. */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-sm font-semibold text-ws-dark">Session Usage</h4>
            <p className="text-xs text-ws-muted">
              Totals across all AI calls since the app loaded (or last reset).
              Cache hits are counted but consume 0 tokens.
            </p>
          </div>
          <button
            onClick={() => {
              resetSessionUsage();
              addToast('info', 'Session usage totals reset');
            }}
            className="text-xs text-ws-accent hover:text-ws-accent-dark font-medium"
          >
            Reset
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-lg bg-ws-light/50 px-3 py-2">
            <p className="text-2xs text-ws-muted">Calls</p>
            <p className="text-lg font-bold text-ws-dark">{sessionUsage.callCount}</p>
            {sessionUsage.cacheHitCount > 0 && (
              <p className="text-2xs text-ws-muted">{sessionUsage.cacheHitCount} cached</p>
            )}
          </div>
          <div className="rounded-lg bg-ws-light/50 px-3 py-2">
            <p className="text-2xs text-ws-muted">Total tokens</p>
            <p className="text-lg font-bold text-ws-dark">{sessionUsage.totalTokens.toLocaleString()}</p>
            <p className="text-2xs text-ws-muted">
              {sessionUsage.inputTokens.toLocaleString()} in · {sessionUsage.outputTokens.toLocaleString()} out
            </p>
          </div>
          <div className="rounded-lg bg-ws-light/50 px-3 py-2">
            <p className="text-2xs text-ws-muted">Estimated cost</p>
            <p className="text-lg font-bold text-ws-dark">
              ${sessionUsage.totalCostUsd < 0.01
                ? sessionUsage.totalCostUsd.toFixed(4)
                : sessionUsage.totalCostUsd.toFixed(3)}
            </p>
            <p className="text-2xs text-ws-muted">USD · cloud calls only</p>
          </div>
          <div className="rounded-lg bg-ws-light/50 px-3 py-2">
            <p className="text-2xs text-ws-muted">Provider</p>
            <p className="text-sm font-semibold text-ws-dark capitalize">{activeProviderId}</p>
            <p className="text-2xs text-ws-muted">Local providers don't report cost</p>
          </div>
        </div>
      </Card>

      {/* Provider-Specific Configuration */}
      {activeProviderId === 'claude' && (
        <Card>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-500" />
              <span className="text-sm font-semibold text-ws-dark">Claude Configuration</span>
            </div>

            <Select
              label="Model"
              options={CLAUDE_MODELS}
              value={config.claude.model}
              onChange={handleClaudeModelChange}
            />

            <div className="flex items-center gap-3 p-3 bg-ws-light rounded-lg">
              <span className="text-sm text-ws-muted">API Key Status:</span>
              {claudeConfigured ? (
                <span className="flex items-center gap-1.5 text-sm font-medium text-green-700">
                  <CheckCircle2 className="w-4 h-4" />
                  Configured via VITE_ANTHROPIC_API_KEY
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-sm font-medium text-red-600">
                  <XCircle className="w-4 h-4" />
                  Not configured · add VITE_ANTHROPIC_API_KEY to .env
                </span>
              )}
            </div>
          </div>
        </Card>
      )}

      {activeProviderId === 'gemini' && (
        <Card>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-semibold text-ws-dark">Gemini Configuration</span>
            </div>

            <Select
              label="Model"
              options={GEMINI_MODELS}
              value={config.gemini.model}
              onChange={handleGeminiModelChange}
            />

            <div className="flex items-center gap-3 p-3 bg-ws-light rounded-lg">
              <span className="text-sm text-ws-muted">API Key Status:</span>
              {geminiConfigured ? (
                <span className="flex items-center gap-1.5 text-sm font-medium text-green-700">
                  <CheckCircle2 className="w-4 h-4" />
                  Configured via VITE_GEMINI_API_KEY
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-sm font-medium text-red-600">
                  <XCircle className="w-4 h-4" />
                  Not configured · add VITE_GEMINI_API_KEY to .env
                </span>
              )}
            </div>
          </div>
        </Card>
      )}

      {activeProviderId === 'lmstudio' && (
        <Card>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-semibold text-ws-dark">LM Studio Configuration</span>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-ws-dark">Server Endpoint</label>
              <input
                type="text"
                value={config.lmstudio.endpoint}
                onChange={(e) => handleLmStudioEndpoint(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-ws-border bg-white text-ws-dark focus:outline-none focus:ring-2 focus:ring-ws-accent/50 focus:border-ws-accent font-mono"
                placeholder="http://localhost:1234"
              />
            </div>

            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={testLmStudioConnection} disabled={lmStudioStatus === 'testing'}>
                {lmStudioStatus === 'testing' ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-ws-border border-t-ws-accent rounded-full animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <Wifi className="w-3.5 h-3.5" />
                    Test Connection
                  </>
                )}
              </Button>

              {lmStudioStatus === 'connected' && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-green-700">
                  <Wifi className="w-4 h-4" />
                  Connected
                </span>
              )}
              {lmStudioStatus === 'failed' && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-red-600">
                  <WifiOff className="w-4 h-4" />
                  Connection Failed
                </span>
              )}
            </div>

            <p className="text-xs text-ws-muted">
              LM Studio runs locally · no API key needed. Make sure LM Studio is running and a model is loaded.
            </p>
          </div>
        </Card>
      )}

      {activeProviderId === 'llamacpp' && (
        <Card>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-semibold text-ws-dark">llama.cpp Configuration</span>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-ws-dark">Server Endpoint</label>
              <input
                type="text"
                value={config.llamacpp.endpoint}
                onChange={(e) => handleLlamaCppEndpoint(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-ws-border bg-white text-ws-dark focus:outline-none focus:ring-2 focus:ring-ws-accent/50 focus:border-ws-accent font-mono"
                placeholder="http://localhost:8080"
              />
            </div>

            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={testLlamaCppConnection} disabled={llamaCppStatus === 'testing'}>
                {llamaCppStatus === 'testing' ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-ws-border border-t-ws-accent rounded-full animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <Wifi className="w-3.5 h-3.5" />
                    Test Connection
                  </>
                )}
              </Button>

              {llamaCppStatus === 'connected' && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-green-700">
                  <Wifi className="w-4 h-4" />
                  Connected
                </span>
              )}
              {llamaCppStatus === 'failed' && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-red-600">
                  <WifiOff className="w-4 h-4" />
                  Connection Failed
                </span>
              )}
            </div>

            <p className="text-xs text-ws-muted">
              llama.cpp runs locally via the <code className="font-mono">llama-server</code> binary · no API key needed. Start it with <code className="font-mono">./llama-server -m model.gguf</code> (default port 8080).
            </p>
          </div>
        </Card>
      )}

      {activeProviderId === 'mock' && (
        <Card>
          <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <Sparkles className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-800">Mock Mode Active</p>
              <p className="text-xs text-blue-700 mt-0.5">
                All AI analyses will return realistic pre-built responses. This is useful for demos and testing without API keys.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Backend Routing */}
      <Card>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-ws-muted" />
            <span className="text-sm font-semibold text-ws-dark">AI Routing Mode</span>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-ws-dark">Route AI calls through backend</p>
              <p className="text-xs text-ws-muted">
                {useBackend
                  ? 'AI calls are routed through the FastAPI backend (API keys stay server-side)'
                  : 'AI calls are made directly from the browser (requires frontend API keys)'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={useBackend}
              onClick={() => {
                setUseBackend(!useBackend);
                addToast('info', `AI routing switched to ${!useBackend ? 'backend' : 'frontend-direct'}`);
              }}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-ws-accent/50 ${
                useBackend ? 'bg-ws-accent' : 'bg-ws-border'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
                  useBackend ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </Card>

      {/* Max Tokens */}
      <Card>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-ws-muted" />
            <span className="text-sm font-semibold text-ws-dark">Max Tokens</span>
          </div>
          <p className="text-xs text-ws-muted">Maximum number of tokens in AI responses. Higher values allow longer responses but increase latency and cost.</p>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={1024}
              max={8192}
              step={512}
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              className="flex-1 h-1.5 bg-ws-border rounded-full appearance-none cursor-pointer accent-ws-accent"
              style={{
                background: `linear-gradient(to right, var(--color-ws-accent, #4C35E0) 0%, var(--color-ws-accent, #4C35E0) ${
                  ((maxTokens - 1024) / (8192 - 1024)) * 100
                }%, #E5E7EB ${((maxTokens - 1024) / (8192 - 1024)) * 100}%, #E5E7EB 100%)`,
              }}
            />
            <span className="text-sm font-semibold text-ws-dark min-w-[80px] text-right">{maxTokens.toLocaleString()}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// SETTINGS PAGE (MAIN)
// ============================================================
const SETTINGS_TABS = [
  { id: 'users', label: 'Users' },
  { id: 'rules', label: 'Rules' },
  { id: 'ai', label: 'AI Provider' },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const { currentRole, hasAccess } = useRole();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('users');

  // Access control · redirect non-admins
  useEffect(() => {
    if (!hasAccess('settings')) {
      addToast('error', 'Access denied. Settings requires Admin role.');
      navigate('/', { replace: true });
    }
  }, [currentRole, hasAccess, navigate, addToast]);

  // Don't render if non-admin (prevents flash before redirect)
  if (!hasAccess('settings')) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-3 flex-wrap mb-1">
          <Settings className="w-6 h-6 text-ws-accent flex-shrink-0" />
          <h1 className="text-2xl font-bold text-ws-black">Platform Settings</h1>
          <Badge variant="error" size="sm">Admin Only</Badge>
        </div>
        <p className="text-sm text-ws-muted">
          Manage users, configure validation rules, and set up AI provider preferences.
        </p>
      </div>

      {/* Tabs */}
      <Tabs tabs={SETTINGS_TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'users' && <UserManagement />}
        {activeTab === 'rules' && <RuleConfiguration />}
        {activeTab === 'ai' && <AIProviderSettings />}
      </div>
    </div>
  );
}
