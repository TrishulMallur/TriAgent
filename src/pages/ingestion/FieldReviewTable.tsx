import { useState, useMemo } from 'react';
import { Card, Badge, ConfidenceIndicator } from '@/components/ui';
import { Button } from '@/components/ui';
import { Pencil, ChevronDown, ChevronRight, ArrowUpDown } from 'lucide-react';
import { FieldEditModal } from './FieldEditModal';

interface ExtractedFieldWithCorrection {
  fieldName: string;
  value: string | null;
  confidence: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  reasoning: string;
  agentCorrected?: boolean;
  correctedValue?: string;
}

interface FieldReviewTableProps {
  fields: ExtractedFieldWithCorrection[];
  onFieldCorrection: (fieldName: string, correctedValue: string) => void;
}

type SortKey = 'confidence' | 'fieldName';
type SortDir = 'asc' | 'desc';

export function FieldReviewTable({ fields, onFieldCorrection }: FieldReviewTableProps) {
  const [editingField, setEditingField] = useState<ExtractedFieldWithCorrection | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('confidence');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sortedFields = useMemo(() => {
    return [...fields].sort((a, b) => {
      if (sortKey === 'confidence') {
        return sortDir === 'asc' ? a.confidence - b.confidence : b.confidence - a.confidence;
      }
      return sortDir === 'asc'
        ? a.fieldName.localeCompare(b.fieldName)
        : b.fieldName.localeCompare(a.fieldName);
    });
  }, [fields, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'confidence' ? 'asc' : 'asc');
    }
  };

  const toggleExpand = (fieldName: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(fieldName)) next.delete(fieldName);
      else next.add(fieldName);
      return next;
    });
  };

  const getRowBgClass = (confidence: number) => {
    if (confidence < 0.5) return 'bg-red-50/60';
    if (confidence < 0.75) return 'bg-amber-50/40';
    return '';
  };

  const correctionCount = fields.filter((f) => f.agentCorrected).length;
  const lowConfidenceCount = fields.filter((f) => f.confidence < 0.75).length;

  return (
    <>
      <Card padding="none">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-ws-border">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-ws-dark">Extracted Fields</h3>
            <Badge variant="default">{fields.length} fields</Badge>
            {correctionCount > 0 && (
              <Badge variant="info">{correctionCount} corrected</Badge>
            )}
            {lowConfidenceCount > 0 && (
              <Badge variant="warning">{lowConfidenceCount} low confidence</Badge>
            )}
          </div>
        </div>

        {/* Table · desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ws-border bg-ws-light/50">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-ws-muted w-8" />
                <th
                  className="text-left px-4 py-2.5 text-xs font-medium text-ws-muted cursor-pointer select-none"
                  onClick={() => toggleSort('fieldName')}
                >
                  <span className="inline-flex items-center gap-1">
                    Field Name
                    {sortKey === 'fieldName' && <ArrowUpDown className="w-3 h-3" />}
                  </span>
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-ws-muted">Value</th>
                <th
                  className="text-left px-4 py-2.5 text-xs font-medium text-ws-muted cursor-pointer select-none"
                  onClick={() => toggleSort('confidence')}
                >
                  <span className="inline-flex items-center gap-1">
                    Confidence
                    {sortKey === 'confidence' && <ArrowUpDown className="w-3 h-3" />}
                  </span>
                </th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-ws-muted">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedFields.map((field) => {
                const isExpanded = expandedRows.has(field.fieldName);
                const displayValue = field.agentCorrected ? field.correctedValue : field.value;

                return (
                  <tr key={field.fieldName} className="group">
                    {/* Main Row */}
                    <td className={`px-4 py-2.5 ${getRowBgClass(field.confidence)}`}>
                      <button
                        onClick={() => toggleExpand(field.fieldName)}
                        className="text-ws-muted hover:text-ws-dark"
                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </td>
                    <td className={`px-4 py-2.5 ${getRowBgClass(field.confidence)}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ws-dark">{field.fieldName}</span>
                        {field.agentCorrected && (
                          <Badge variant="info" size="sm">Agent Corrected</Badge>
                        )}
                      </div>
                    </td>
                    <td className={`px-4 py-2.5 ${getRowBgClass(field.confidence)}`}>
                      {displayValue ? (
                        <span className="font-mono text-xs text-ws-dark">{displayValue}</span>
                      ) : (
                        <span className="italic text-ws-muted text-xs">Not found</span>
                      )}
                    </td>
                    <td className={`px-4 py-2.5 ${getRowBgClass(field.confidence)}`}>
                      <div className="flex items-center gap-2">
                        <ConfidenceIndicator level={field.confidenceLevel} />
                        <span className="text-xs text-ws-muted font-medium">
                          {Math.round(field.confidence * 100)}%
                        </span>
                      </div>
                    </td>
                    <td className={`px-4 py-2.5 text-right ${getRowBgClass(field.confidence)}`}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingField(field)}
                        className="opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity gap-1"
                      >
                        <Pencil className="w-3 h-3" />
                        Edit
                      </Button>
                    </td>

                    {/* Expanded Reasoning Row */}
                    {isExpanded && (
                      <td
                        colSpan={5}
                        className={`px-4 pb-3 pt-0 ${getRowBgClass(field.confidence)}`}
                      >
                        <div className="ml-8 rounded-lg bg-white/60 border border-ws-border/50 px-3 py-2">
                          <p className="text-2xs font-medium text-ws-muted mb-0.5">AI Reasoning</p>
                          <p className="text-xs text-ws-dark">{field.reasoning}</p>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Cards · mobile */}
        <div className="md:hidden divide-y divide-ws-border">
          {sortedFields.map((field) => {
            const isExpanded = expandedRows.has(field.fieldName);
            const displayValue = field.agentCorrected ? field.correctedValue : field.value;
            return (
              <div key={field.fieldName} className={`px-4 py-3 ${getRowBgClass(field.confidence)}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="font-medium text-ws-dark text-sm">{field.fieldName}</span>
                    {field.agentCorrected && (
                      <Badge variant="info" size="sm">Agent Corrected</Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingField(field)}
                    className="gap-1 shrink-0"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </Button>
                </div>
                <div className="mt-1.5">
                  {displayValue ? (
                    <span className="font-mono text-xs text-ws-dark break-all">{displayValue}</span>
                  ) : (
                    <span className="italic text-ws-muted text-xs">Not found</span>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ConfidenceIndicator level={field.confidenceLevel} />
                    <span className="text-xs text-ws-muted font-medium">
                      {Math.round(field.confidence * 100)}%
                    </span>
                  </div>
                  <button
                    onClick={() => toggleExpand(field.fieldName)}
                    className="inline-flex items-center gap-1 text-xs text-ws-muted hover:text-ws-dark"
                    aria-label={isExpanded ? 'Hide reasoning' : 'Show reasoning'}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                    Reasoning
                  </button>
                </div>
                {isExpanded && (
                  <div className="mt-2 rounded-lg bg-white/60 border border-ws-border/50 px-3 py-2">
                    <p className="text-2xs font-medium text-ws-muted mb-0.5">AI Reasoning</p>
                    <p className="text-xs text-ws-dark">{field.reasoning}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Edit Modal */}
      {editingField && (
        <FieldEditModal
          open={!!editingField}
          onClose={() => setEditingField(null)}
          fieldName={editingField.fieldName}
          aiValue={editingField.value}
          confidence={editingField.confidence}
          confidenceLevel={editingField.confidenceLevel}
          reasoning={editingField.reasoning}
          onSave={(correctedValue) => {
            onFieldCorrection(editingField.fieldName, correctedValue);
            setEditingField(null);
          }}
        />
      )}
    </>
  );
}
