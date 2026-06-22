/**
 * Per-model pricing constants and a helper to convert a TokenUsage payload
 * into a USD cost estimate.
 *
 * Prices are listed as USD per token (i.e. published list-price per million
 * tokens divided by 1_000_000). When the published price changes, edit the
 * constants here · every cost figure in the UI updates automatically.
 *
 * Local providers (LM Studio, llama.cpp, Mock) don't have a per-token cost;
 * `calculateCost` returns `null` for them so the UI can render "tokens · time"
 * without a price.
 *
 * Sources (as of 2026-05-25, all "Standard" tier · Batch API is 50% off):
 *   - https://www.anthropic.com/pricing
 *   - https://ai.google.dev/pricing
 */

import type { ProviderId } from './llm-provider';
import type { TokenUsage } from './llm-provider';

interface ModelPrice {
  /** USD per input token. */
  input: number;
  /** USD per output token. */
  output: number;
}

/**
 * Per-model pricing table. Keys are the exact model strings used by the
 * provider · keep them in sync with the model IDs in `llm-provider.ts`
 * and the Settings UI dropdowns.
 */
export const MODEL_PRICING: Record<string, ModelPrice> = {
  // ----- Anthropic Claude -----
  'claude-sonnet-4-20250514': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  'claude-haiku-4-20250514': { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
  // Aliases that may be set by users / .env without the date suffix.
  'claude-sonnet-4': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  'claude-haiku-4': { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },

  // ----- Google Gemini -----
  'gemini-2.0-flash': { input: 0.075 / 1_000_000, output: 0.3 / 1_000_000 },
  'gemini-2.0-flash-lite': { input: 0.0375 / 1_000_000, output: 0.15 / 1_000_000 },
  // Gemini 2.5 Pro tiered pricing · use the larger-context tier (the more
  // honest worst-case to display in cost estimates).
  'gemini-2.5-pro': { input: 1.25 / 1_000_000, output: 10 / 1_000_000 },
  'gemini-2.5-flash': { input: 0.3 / 1_000_000, output: 2.5 / 1_000_000 },

  // ----- OpenAI -----
  'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
  'gpt-4o': { input: 2.50 / 1_000_000, output: 10 / 1_000_000 },
  'gpt-4.1-mini': { input: 0.40 / 1_000_000, output: 1.60 / 1_000_000 },
  'gpt-4.1': { input: 2.00 / 1_000_000, output: 8 / 1_000_000 },

  // ----- OpenRouter -----
  // "openrouter/auto" is an OpenRouter-specific model slug that picks the
  // cheapest viable model. Price varies per upstream · we charge zero here
  // because the proxy path is billed to the user's key, not TriAgent.
  // When a specific model is chosen the UI will match against MODEL_PRICING
  // rows; if unknown it falls back to "·" (see calculateCost).
  'openrouter/auto': { input: 0, output: 0 },
};

/** Providers that never have a cloud cost (local inference). */
const LOCAL_PROVIDERS = new Set<ProviderId>(['lmstudio', 'llamacpp', 'mock']);

/**
 * Compute USD cost for an AI call. Returns `null` when:
 *   - the provider is local (no per-token price applies), or
 *   - the model isn't in `MODEL_PRICING` (unknown model · show "·" in UI), or
 *   - usage is missing.
 *
 * Otherwise returns a USD number (not rounded · callers format).
 */
export function calculateCost(
  providerId: ProviderId,
  model: string,
  usage: TokenUsage | undefined,
): number | null {
  if (!usage) return null;
  if (LOCAL_PROVIDERS.has(providerId)) return null;
  const price = MODEL_PRICING[model];
  if (!price) return null;
  return usage.inputTokens * price.input + usage.outputTokens * price.output;
}

/**
 * Format a USD cost for display. Falls back to "·" when null.
 * Uses 4 decimals below $0.01, 3 below $1, 2 above · small enough that
 * sub-cent calls still show a visible figure.
 */
export function formatCost(cost: number | null | undefined): string {
  if (cost == null) return '·';
  if (cost === 0) return '$0';
  if (cost < 0.01) return `~$${cost.toFixed(4)}`;
  if (cost < 1) return `~$${cost.toFixed(3)}`;
  return `~$${cost.toFixed(2)}`;
}
