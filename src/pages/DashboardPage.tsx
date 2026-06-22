import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useRole } from '@/contexts/RoleContext';
import { ROLE_LABELS } from '@/types';
import { VerdictBadge } from '@/components/ui';
import type { Verdict } from '@/types';

// ============================================================
// EDITORIAL DASHBOARD
// A single-anchor brief, a hairline snapshot strip, a vertical
// list of modules, and a short queue peek. No hero metrics.
// No identical card grids. The numbers carry their own weight.
// ============================================================

interface Snapshot {
  label: string;
  value: string;
  delta: string;
}

interface ModuleRow {
  id: string;
  label: string;
  description: string;
  path: string;
  pending: number;
  passRate: string;
}

interface QueueItem {
  id: string;
  ref: string;
  client: string;
  context: string;
  verdict: Verdict;
  path: string;
}

const SNAPSHOTS: Snapshot[] = [
  { label: 'Pending review', value: '17', delta: '+3 since yesterday' },
  { label: 'Completed today', value: '52', delta: '+12 vs. same hour' },
  { label: 'Exceptions open', value: '8',  delta: '3 high priority' },
  { label: 'Pass rate, 7d',   value: '84%', delta: '+2 pts week over week' },
];

const ALL_MODULES: ModuleRow[] = [
  {
    id: 'transfer-pipeline',
    label: 'Transfer pipeline',
    description: 'Ingestion, validation, and exception resolution for inbound account transfers.',
    path: '/transfer',
    pending: 12,
    passRate: '87%',
  },
  {
    id: 'advisor-notes',
    label: 'Advisor note checker',
    description: 'Live CIRO documentation review against meeting notes as advisors write them.',
    path: '/advisor-notes',
    pending: 5,
    passRate: '72%',
  },
  {
    id: 'analytics',
    label: 'Analytics command centre',
    description: 'Volume, quality, override, and team workload trends across every workflow.',
    path: '/analytics',
    pending: 0,
    passRate: 'N/A',
  },
];

const QUEUE: QueueItem[] = [
  { id: 'q1', ref: 'TR-4821', client: 'M. Okafor',     context: 'Name mismatch on RBC LIRA transfer in.',          verdict: 'needs_review', path: '/transfer/exceptions' },
  { id: 'q2', ref: 'TR-4807', client: 'J. Tremblay',   context: 'Signature page missing, expiry imminent.',         verdict: 'fail',         path: '/transfer/exceptions' },
  { id: 'q3', ref: 'AN-1190', client: 'S. Iyer',       context: 'KYC update note, suitability rationale unclear.',  verdict: 'needs_review', path: '/advisor-notes' },
  { id: 'q4', ref: 'TR-4799', client: 'L. Andersson',  context: 'Account type conflict, requires advisor confirm.', verdict: 'needs_review', path: '/transfer/exceptions' },
];

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatBrief(d: Date) {
  return `${WEEKDAYS[d.getDay()]} · ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function firstName(full: string) {
  return full.split(' ')[0];
}

export function DashboardPage() {
  const { currentUser, currentRole, hasAccess } = useRole();
  const modules = ALL_MODULES.filter((m) => hasAccess(m.id));
  const dateLine = formatBrief(new Date());
  const roleEyebrow = ROLE_LABELS[currentRole].toUpperCase();

  return (
    <div className="space-y-12 pb-16">
      {/* Editorial brief header */}
      <header className="pt-2">
        <p className="eyebrow tabular-nums">{dateLine} · {roleEyebrow}</p>
        <h1 className="mt-3 text-display font-semibold tracking-tightest text-balance text-ws-black max-w-3xl">
          17 transfers waiting on you, 3 flagged for compliance.
        </h1>
        <p className="mt-4 text-base text-ws-muted max-w-2xl text-pretty">
          Good morning, {firstName(currentUser.name)}. Pass rate is steady at 84 percent across the week. Eight exceptions are open in the pipeline, three of them within a four-hour SLA.
        </p>
      </header>

      {/* Snapshot strip */}
      <section aria-label="Today at a glance">
        <div className="rounded-lg border border-ws-border bg-ws-surface shadow-ws">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-ws-border">
            {SNAPSHOTS.map((s) => (
              <div key={s.label} className="px-8 py-6">
                <p className="eyebrow">{s.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tightest text-ws-black tabular-nums">{s.value}</p>
                <p className="mt-1 text-xs text-ws-muted tabular-nums">{s.delta}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Modules · vertical list, not a grid */}
      <section aria-label="Modules">
        <div className="flex items-baseline justify-between mb-5">
          <div>
            <p className="eyebrow">Modules</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tightest text-ws-black">Where you work</h2>
          </div>
          <p className="text-xs text-ws-faint tabular-nums hidden sm:block">
            {modules.length} of {ALL_MODULES.length} available to {ROLE_LABELS[currentRole].toLowerCase()}
          </p>
        </div>

        <div className="rounded-lg border border-ws-border bg-ws-surface shadow-ws divide-y divide-ws-border overflow-hidden">
          {modules.map((m) => (
            <Link
              key={m.id}
              to={m.path}
              className="row-hover group flex items-center gap-6 px-6 py-5"
            >
              <div className="flex-1 min-w-0">
                <p className="text-base font-medium text-ws-black">{m.label}</p>
                <p className="mt-1 text-sm text-ws-muted text-pretty">{m.description}</p>
              </div>
              <div className="hidden md:flex items-center gap-5 text-sm text-ws-muted tabular-nums whitespace-nowrap">
                <span><span className="text-ws-dark font-medium">{m.pending}</span> pending</span>
                <span aria-hidden className="text-ws-faint">·</span>
                <span><span className="text-ws-dark font-medium">{m.passRate}</span> pass</span>
              </div>
              <ChevronRight
                className="w-4 h-4 text-ws-faint transition-colors duration-150 ease-out-quart group-hover:text-ws-dark"
                aria-hidden
              />
            </Link>
          ))}
        </div>
      </section>

      {/* Today's queue */}
      <section aria-label="Today's queue">
        <div className="flex items-baseline justify-between mb-5">
          <div>
            <p className="eyebrow">Today's queue</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tightest text-ws-black">Items needing your eyes</h2>
          </div>
          <Link
            to="/transfer/exceptions"
            className="text-xs font-medium text-ws-accent hover:text-ws-accent-dark transition-colors"
          >
            View full queue
          </Link>
        </div>

        <div className="rounded-lg border border-ws-border bg-ws-surface shadow-ws divide-y divide-ws-border overflow-hidden">
          {QUEUE.map((item) => (
            <Link
              key={item.id}
              to={item.path}
              className="row-hover group flex items-center gap-4 px-6 py-4"
            >
              <span className="text-xs font-mono tracking-tight text-ws-faint w-20 tabular-nums shrink-0">{item.ref}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ws-black truncate">{item.client}</p>
                <p className="mt-0.5 text-xs text-ws-muted truncate">{item.context}</p>
              </div>
              <div className="shrink-0">
                <VerdictBadge verdict={item.verdict} size="sm" />
              </div>
              <ChevronRight
                className="w-4 h-4 text-ws-faint transition-colors duration-150 ease-out-quart group-hover:text-ws-dark shrink-0"
                aria-hidden
              />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
