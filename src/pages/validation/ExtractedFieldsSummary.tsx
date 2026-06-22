import { Card } from '@/components/ui';
import { FileText } from 'lucide-react';

interface ExtractedFieldsSummaryProps {
  fields: Record<string, string | boolean | null>;
}

const FIELD_LABELS: Record<string, string> = {
  accountNumber: 'Account Number',
  accountType: 'Account Type',
  clientName: 'Client Name',
  dateOfBirth: 'Date of Birth',
  transferType: 'Transfer Type',
  sendingInstitution: 'Sending Institution',
  transferAmount: 'Transfer Amount',
  authorizationDate: 'Authorization Date',
  signaturePresent: 'Signature Present',
};

function formatFieldValue(key: string, value: string | boolean | null): string {
  if (value === null || value === undefined || value === '') return 'Not found';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

export function ExtractedFieldsSummary({ fields }: ExtractedFieldsSummaryProps) {
  const entries = Object.entries(fields);
  const missingCount = entries.filter(
    ([, v]) => v === null || v === undefined || v === ''
  ).length;

  return (
    <Card padding="none">
      <div className="px-4 py-3 border-b border-ws-border">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-ws-accent" />
          <h4 className="text-sm font-semibold text-ws-dark">Extracted Fields</h4>
        </div>
        {missingCount > 0 && (
          <p className="text-xs text-verdict-fail mt-0.5">
            {missingCount} field{missingCount > 1 ? 's' : ''} not found
          </p>
        )}
      </div>

      <div className="divide-y divide-ws-border/50">
        {entries.map(([key, value]) => {
          const isMissing = value === null || value === undefined || value === '';
          const isBoolean = typeof value === 'boolean';
          const label = FIELD_LABELS[key] || key;
          const displayValue = formatFieldValue(key, value);

          return (
            <div key={key} className="px-4 py-2.5 flex items-start justify-between gap-3">
              <span className="text-xs text-ws-muted flex-shrink-0">{label}</span>
              <span
                className={`text-xs font-medium text-right ${
                  isMissing
                    ? 'text-verdict-fail italic'
                    : isBoolean && !value
                    ? 'text-verdict-fail'
                    : 'text-ws-dark'
                }`}
              >
                {isBoolean && !isMissing ? (
                  <span
                    className={`inline-flex items-center gap-1 ${
                      value ? 'text-verdict-pass' : 'text-verdict-fail'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        value ? 'bg-verdict-pass' : 'bg-verdict-fail'
                      }`}
                    />
                    {displayValue}
                  </span>
                ) : (
                  <code className={`font-mono ${isMissing ? '' : 'bg-ws-light px-1 rounded'}`}>
                    {displayValue}
                  </code>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
