import { useState } from 'react';
import { Card, Badge, ConfidenceIndicator } from '@/components/ui';
import { CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import type { ConfidenceLevel } from '@/types';

interface ValidationCheck {
  category: string;
  fieldName: string;
  expectedFormat: string;
  actualValue: string;
  status: 'pass' | 'fail' | 'warning';
  errorDescription: string | null;
  confidence: ConfidenceLevel;
  rule: string;
}

interface ValidationChecksTableProps {
  checks: ValidationCheck[];
}

const STATUS_CONFIG = {
  pass: {
    icon: CheckCircle2,
    iconClass: 'text-verdict-pass',
    variant: 'success' as const,
    label: 'Pass',
  },
  fail: {
    icon: XCircle,
    iconClass: 'text-verdict-fail',
    variant: 'error' as const,
    label: 'Fail',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-verdict-review',
    variant: 'warning' as const,
    label: 'Warning',
  },
};

const CATEGORY_ORDER = [
  'Account Identification',
  'Client Identity',
  'Transfer Details',
  'Authorization',
  'Sending Institution',
  'Special Conditions',
];

function groupByCategory(checks: ValidationCheck[]): Map<string, ValidationCheck[]> {
  const grouped = new Map<string, ValidationCheck[]>();

  // Sort categories by defined order, unknown categories go last
  for (const cat of CATEGORY_ORDER) {
    const matching = checks.filter((c) => c.category === cat);
    if (matching.length > 0) grouped.set(cat, matching);
  }

  // Add any unknown categories
  for (const check of checks) {
    if (!CATEGORY_ORDER.includes(check.category)) {
      const existing = grouped.get(check.category) || [];
      if (!existing.includes(check)) {
        existing.push(check);
        grouped.set(check.category, existing);
      }
    }
  }

  // Sort failing checks to top within each category
  for (const [cat, items] of grouped) {
    grouped.set(
      cat,
      items.sort((a, b) => {
        const order = { fail: 0, warning: 1, pass: 2 };
        return order[a.status] - order[b.status];
      })
    );
  }

  return grouped;
}

export function ValidationChecksTable({ checks }: ValidationChecksTableProps) {
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const grouped = groupByCategory(checks);

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const getCategoryCounts = (items: ValidationCheck[]) => {
    const pass = items.filter((c) => c.status === 'pass').length;
    const fail = items.filter((c) => c.status === 'fail').length;
    const warning = items.filter((c) => c.status === 'warning').length;
    return { pass, fail, warning };
  };

  return (
    <Card padding="none">
      <div className="px-4 py-3 border-b border-ws-border">
        <h4 className="text-sm font-semibold text-ws-dark">Validation Checks</h4>
        <p className="text-xs text-ws-muted mt-0.5">
          {checks.filter((c) => c.status === 'pass').length} passed,{' '}
          {checks.filter((c) => c.status === 'warning').length} warnings,{' '}
          {checks.filter((c) => c.status === 'fail').length} failed
        </p>
      </div>

      <div className="divide-y divide-ws-border">
        {Array.from(grouped.entries()).map(([category, items]) => {
          const isCollapsed = collapsedCategories.has(category);
          const counts = getCategoryCounts(items);
          const hasFails = counts.fail > 0;

          return (
            <div key={category}>
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-ws-light/50 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-ws-muted" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-ws-muted" />
                  )}
                  <span className="text-xs font-semibold text-ws-dark">{category}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {counts.pass > 0 && (
                    <Badge variant="success" size="sm">{counts.pass} pass</Badge>
                  )}
                  {counts.warning > 0 && (
                    <Badge variant="warning" size="sm">{counts.warning} warn</Badge>
                  )}
                  {counts.fail > 0 && (
                    <Badge variant="error" size="sm">{counts.fail} fail</Badge>
                  )}
                </div>
              </button>

              {/* Check Rows */}
              {!isCollapsed && (
                <div className="divide-y divide-ws-border/50">
                  {items.map((check, idx) => {
                    const config = STATUS_CONFIG[check.status];
                    const Icon = config.icon;

                    return (
                      <div
                        key={`${category}-${idx}`}
                        className={`px-4 py-3 pl-10 ${
                          check.status === 'fail'
                            ? 'bg-verdict-fail-bg/30'
                            : check.status === 'warning'
                            ? 'bg-verdict-review-bg/30'
                            : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${config.iconClass}`} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-ws-dark">
                                  {check.fieldName}
                                </span>
                                <Badge variant={config.variant} size="sm">
                                  {config.label}
                                </Badge>
                              </div>

                              {/* Actual vs Expected */}
                              <div className="mt-1.5 space-y-1">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  <span className="text-ws-muted">Actual:</span>
                                  <code className="font-mono text-ws-dark bg-ws-light px-1.5 py-0.5 rounded break-all min-w-0">
                                    {check.actualValue || '(empty)'}
                                  </code>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  <span className="text-ws-muted">Expected:</span>
                                  <code className="font-mono text-ws-muted bg-ws-light px-1.5 py-0.5 rounded break-all min-w-0">
                                    {check.expectedFormat}
                                  </code>
                                </div>
                              </div>

                              {/* Error Description */}
                              {check.errorDescription && (
                                <p className="mt-1.5 text-xs text-verdict-fail">
                                  {check.errorDescription}
                                </p>
                              )}

                              {/* Rule Reference */}
                              <div className="mt-1.5 flex items-center gap-3">
                                <span className="text-2xs text-ws-muted">
                                  Rule: <code className="font-mono">{check.rule}</code>
                                </span>
                                <ConfidenceIndicator level={check.confidence} />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
