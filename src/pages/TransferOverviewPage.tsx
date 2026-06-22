import { Card, Button } from '@/components/ui';
import {
  FileSearch,
  ShieldAlert,
  Mail,
} from 'lucide-react';

export function TransferOverviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ws-black">Transfer Operations Pipeline</h1>
        <p className="text-sm text-ws-muted mt-1">End-to-end processing of inbound account transfers from legacy institutions</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {
            stage: 'Stage 1',
            title: 'Document Ingestion',
            description: 'AI reads unstructured fax/mail/scan documents and extracts all fields into structured format',
            icon: <FileSearch className="w-6 h-6" />,
            path: '/transfer/ingestion',
            color: 'bg-emerald-500/10 text-emerald-600',
            stats: '14 documents today',
          },
          {
            stage: 'Stage 2',
            title: 'Validation & Compliance',
            description: 'AI validates extracted fields against transfer rules, client records, and ATON/ACATS requirements',
            icon: <ShieldAlert className="w-6 h-6" />,
            path: '/transfer/validation',
            color: 'bg-amber-500/10 text-amber-600',
            stats: '11 validated, 3 pending',
          },
          {
            stage: 'Stage 3',
            title: 'Exception Resolution',
            description: 'AI diagnoses rejected transfers and drafts personalized client communications for resolution',
            icon: <Mail className="w-6 h-6" />,
            path: '/transfer/exceptions',
            color: 'bg-red-500/10 text-red-600',
            stats: '8 exceptions in queue',
          },
        ].map((stage) => (
          <Card key={stage.stage} hover>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stage.color}`}>
                {stage.icon}
              </div>
              <div>
                <p className="text-xs font-semibold text-ws-accent uppercase tracking-wider">{stage.stage}</p>
                <h3 className="text-base font-semibold text-ws-black">{stage.title}</h3>
              </div>
            </div>
            <p className="text-sm text-ws-muted mb-3">{stage.description}</p>
            <p className="text-xs text-ws-dark font-medium mb-4">{stage.stats}</p>
            <Button variant="outline" size="sm" onClick={() => window.location.href = stage.path}>
              Open Stage
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
