import { Badge } from '@/components/ui/Badge';
import type { ProviderId } from '@/lib/llm-provider';
import { PROVIDER_LABELS } from '@/lib/llm-provider';

/**
 * Generalized replacement for the old "Using Mock Fallback" chip.
 *
 * Shows the active provider and whether a personal key is in play:
 *   - configured (real AI)     → "Using Claude — your key"  (success green)
 *   - unconfigured (fallback)  → "Using Mock Fallback"      (warning amber)
 *
 * Kept at the same size, radius, and dot as the original badge so every page
 * that renders it stays visually consistent. The "unconfigured" branch is
 * identical to the legacy markup · drop-in replacement.
 */
interface ProviderBadgeProps {
  providerId: ProviderId;
  isConfigured: boolean;
}

export function ProviderBadge({ providerId, isConfigured }: ProviderBadgeProps) {
  if (!isConfigured) {
    return (
      <Badge variant="warning" dot>
        Using Mock Fallback
      </Badge>
    );
  }
  const label = PROVIDER_LABELS[providerId];
  // "Mock" is its own valid provider · no "your key" suffix for it.
  const suffix = providerId === 'mock' ? '' : ' — your key';
  return (
    <Badge variant="success" dot>
      Using {label}{suffix}
    </Badge>
  );
}
