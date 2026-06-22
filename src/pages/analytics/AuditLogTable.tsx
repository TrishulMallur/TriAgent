import { useState, useMemo } from 'react';
import { Card, Badge, DataTable } from '@/components/ui';
import type { Column } from '@/components/ui';
import type { AuditEntry } from '@/types';
import { Search, Download } from 'lucide-react';

interface AuditLogTableProps {
  entries: AuditEntry[];
}

const MODULE_LABELS: Record<string, string> = {
  transfer_ingestion: 'Ingestion',
  transfer_validation: 'Validation',
  transfer_exception: 'Exceptions',
  advisor_notes: 'Advisor Notes',
};

const ACTION_VARIANT: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
  approve: 'success',
  reject: 'error',
  escalate: 'warning',
  override: 'warning',
  ai_analysis: 'info',
  human_review: 'info',
  submit: 'default',
  send_email: 'success',
};

const columns: Column<AuditEntry>[] = [
  {
    key: 'timestamp',
    header: 'Time',
    sortable: true,
    sortValue: (row) => row.timestamp,
    render: (row) => <span className="text-xs text-ws-muted whitespace-nowrap">{row.timestamp.slice(5, 16).replace('T', ' ')}</span>,
    width: '110px',
  },
  {
    key: 'userName',
    header: 'User',
    sortable: true,
    sortValue: (row) => row.userName,
    render: (row) => <span className="text-xs font-medium">{row.userName}</span>,
  },
  {
    key: 'module',
    header: 'Module',
    sortable: true,
    sortValue: (row) => row.module,
    render: (row) => <Badge variant="info" size="sm">{MODULE_LABELS[row.module] || row.module}</Badge>,
  },
  {
    key: 'action',
    header: 'Action',
    sortable: true,
    sortValue: (row) => row.action,
    render: (row) => <Badge variant={ACTION_VARIANT[row.action] || 'default'} size="sm">{row.action.replace('_', ' ')}</Badge>,
  },
  {
    key: 'aiVerdict',
    header: 'Verdict',
    render: (row) => row.aiVerdict
      ? <Badge variant={row.aiVerdict === 'pass' ? 'success' : row.aiVerdict === 'fail' ? 'error' : 'warning'} size="sm">{row.aiVerdict}</Badge>
      : <span className="text-xs text-ws-muted">·</span>,
  },
  {
    key: 'documentId',
    header: 'Doc ID',
    render: (row) => <span className="text-xs font-mono text-ws-muted">{row.documentId.slice(0, 12)}</span>,
  },
];

export function AuditLogTable({ entries }: AuditLogTableProps) {
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    let result = entries;
    if (moduleFilter !== 'all') {
      result = result.filter((e) => e.module === moduleFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((e) =>
        e.userName.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        e.module.toLowerCase().includes(q) ||
        e.documentId.toLowerCase().includes(q)
      );
    }
    return result;
  }, [entries, search, moduleFilter]);

  const handleExportCsv = () => {
    const header = 'Timestamp,User,Role,Module,Action,Verdict,Document ID\n';
    const rows = filtered.map((e) =>
      `${e.timestamp},${e.userName},${e.userRole},${e.module},${e.action},${e.aiVerdict || ''},${e.documentId}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-ws-dark">Audit Log</h3>
          <p className="text-xs text-ws-muted">{filtered.length} entries</p>
        </div>
        <button
          onClick={handleExportCsv}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ws-dark bg-ws-light rounded-lg hover:bg-ws-border transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ws-muted" />
          <input
            type="text"
            placeholder="Search by user, action, module, doc ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-ws-light border border-ws-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ws-accent/50"
          />
        </div>
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="px-3 py-1.5 text-xs bg-ws-light border border-ws-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ws-accent/50"
        >
          <option value="all">All Modules</option>
          <option value="transfer_ingestion">Ingestion</option>
          <option value="transfer_validation">Validation</option>
          <option value="transfer_exception">Exceptions</option>
          <option value="advisor_notes">Advisor Notes</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        keyExtractor={(row) => row.id}
        compact
        emptyMessage="No audit entries match your filters"
      />
    </Card>
  );
}
