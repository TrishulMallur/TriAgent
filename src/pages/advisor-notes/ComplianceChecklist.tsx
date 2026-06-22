import { useState } from 'react';
import { Card } from '@/components/ui';
import { CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronRight, ClipboardCheck } from 'lucide-react';

interface ChecklistItem {
  item: string;
  present: boolean;
  details: string;
}

interface ComplianceChecklistProps {
  checklist: ChecklistItem[];
}

function StatusIcon({ present }: { present: boolean }) {
  if (present) {
    return <CheckCircle2 className="w-4 h-4 text-verdict-pass flex-shrink-0" />;
  }
  return <XCircle className="w-4 h-4 text-verdict-fail flex-shrink-0" />;
}

function StatusBadge({ present }: { present: boolean }) {
  if (present) {
    return (
      <span className="px-2 py-0.5 text-2xs font-medium rounded-full bg-verdict-pass-bg text-verdict-pass">
        Present
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 text-2xs font-medium rounded-full bg-verdict-fail-bg text-verdict-fail">
      Missing
    </span>
  );
}

function ChecklistRow({ item, index }: { item: ChecklistItem; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`${index > 0 ? 'border-t border-ws-border/50' : ''}`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 py-2.5 px-1 text-left hover:bg-ws-light/50 rounded transition-colors"
      >
        <StatusIcon present={item.present} />
        <span className="flex-1 text-sm text-ws-dark font-medium">{item.item}</span>
        <StatusBadge present={item.present} />
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-ws-muted" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-ws-muted" />
        )}
      </button>
      {expanded && (
        <div className="ml-7 pb-2.5 pr-4">
          <p className="text-xs text-ws-muted leading-relaxed">{item.details}</p>
        </div>
      )}
    </div>
  );
}

export function ComplianceChecklist({ checklist }: ComplianceChecklistProps) {
  const presentCount = checklist.filter((c) => c.present).length;
  const totalCount = checklist.length;

  return (
    <Card padding="sm">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardCheck className="w-4 h-4 text-ws-accent flex-shrink-0" />
          <h3 className="text-sm font-semibold text-ws-dark">CIRO Requirements Checklist</h3>
        </div>
        <span className="text-xs text-ws-muted">
          {presentCount}/{totalCount} documented
        </span>
      </div>

      <div className="px-1">
        {checklist.map((item, i) => (
          <ChecklistRow key={item.item} item={item} index={i} />
        ))}
      </div>

      {presentCount < totalCount && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-verdict-review-bg/50 px-3 py-2 mx-1">
          <AlertTriangle className="w-3.5 h-3.5 text-verdict-review flex-shrink-0 mt-0.5" />
          <p className="text-2xs text-verdict-review">
            {totalCount - presentCount} required element{totalCount - presentCount > 1 ? 's' : ''} missing · advisor should update notes before filing
          </p>
        </div>
      )}
    </Card>
  );
}
