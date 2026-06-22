import { Card, ConfidenceIndicator } from '@/components/ui';
import { Badge } from '@/components/ui/Badge';
import { AlertCircle, AlertTriangle, Info, Lightbulb } from 'lucide-react';

interface Flag {
  element: string;
  status: 'missing' | 'insufficient';
  severity: 'critical' | 'warning' | 'info';
  description: string;
  suggestion: string;
  confidence: 'high' | 'medium' | 'low';
  ciroRule: string;
}

interface FlagsListProps {
  flags: Flag[];
}

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertCircle,
    variant: 'error' as const,
    label: 'Critical',
    borderClass: 'border-l-verdict-fail',
  },
  warning: {
    icon: AlertTriangle,
    variant: 'warning' as const,
    label: 'Warning',
    borderClass: 'border-l-verdict-review',
  },
  info: {
    icon: Info,
    variant: 'info' as const,
    label: 'Info',
    borderClass: 'border-l-ws-accent',
  },
};

const STATUS_CONFIG = {
  missing: { label: 'Missing', variant: 'error' as const },
  insufficient: { label: 'Insufficient', variant: 'warning' as const },
};

function FlagCard({ flag }: { flag: Flag }) {
  const severity = SEVERITY_CONFIG[flag.severity];
  const status = STATUS_CONFIG[flag.status];
  const Icon = severity.icon;

  return (
    <div className={`border-l-4 ${severity.borderClass} rounded-r-lg bg-white border border-ws-border/50 p-4`}>
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 flex-shrink-0" />
          <h4 className="text-sm font-semibold text-ws-dark">{flag.element}</h4>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge variant={status.variant}>{status.label}</Badge>
          <Badge variant={severity.variant}>{severity.label}</Badge>
        </div>
      </div>

      <p className="text-xs text-ws-muted mb-3">{flag.description}</p>

      {/* Suggestion */}
      <div className="flex items-start gap-2 bg-ws-accent/5 border border-ws-accent/10 rounded-lg px-3 py-2 mb-2">
        <Lightbulb className="w-3.5 h-3.5 text-ws-accent flex-shrink-0 mt-0.5" />
        <p className="text-xs text-ws-dark">{flag.suggestion}</p>
      </div>

      {/* Footer: CIRO rule + confidence */}
      <div className="flex items-center justify-between">
        <span className="text-2xs text-ws-muted font-mono">{flag.ciroRule}</span>
        <ConfidenceIndicator level={flag.confidence} />
      </div>
    </div>
  );
}

export function FlagsList({ flags }: FlagsListProps) {
  if (flags.length === 0) {
    return (
      <Card className="text-center py-6">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-verdict-pass-bg flex items-center justify-center">
            <Info className="w-4 h-4 text-verdict-pass" />
          </div>
          <p className="text-sm font-medium text-verdict-pass">No compliance flags</p>
          <p className="text-xs text-ws-muted">This note meets all checked CIRO requirements</p>
        </div>
      </Card>
    );
  }

  // Sort: critical first, then warning, then info
  const sortedFlags = [...flags].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  const criticalCount = flags.filter((f) => f.severity === 'critical').length;
  const warningCount = flags.filter((f) => f.severity === 'warning').length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ws-dark">
          Compliance Flags ({flags.length})
        </h3>
        <div className="flex items-center gap-2 text-2xs">
          {criticalCount > 0 && (
            <span className="text-verdict-fail font-medium">{criticalCount} critical</span>
          )}
          {warningCount > 0 && (
            <span className="text-verdict-review font-medium">{warningCount} warning</span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {sortedFlags.map((flag, i) => (
          <FlagCard key={`${flag.element}-${i}`} flag={flag} />
        ))}
      </div>
    </div>
  );
}
