import { type ReactNode } from 'react';
import { clsx } from 'clsx';
import type { Verdict, ConfidenceLevel } from '@/types';

// ============================================================
// BUTTON
// ============================================================
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', className, children, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center font-medium tracking-tight rounded-md transition-all duration-150 ease-out-quart focus:outline-none focus-visible:shadow-ws-focus disabled:opacity-50 disabled:cursor-not-allowed',
        {
          'bg-ws-accent text-ws-paper shadow-ws hover:bg-ws-accent-dark hover:shadow-ws-md active:bg-ws-accent-dark active:translate-y-px': variant === 'primary',
          'bg-ws-surface text-ws-dark border border-ws-border hover:bg-ws-sunken hover:border-ws-border-strong': variant === 'secondary',
          'bg-transparent text-ws-dark border border-ws-border hover:bg-ws-sunken hover:text-ws-black hover:border-ws-border-strong': variant === 'outline',
          'bg-transparent text-ws-muted hover:bg-ws-sunken hover:text-ws-dark': variant === 'ghost',
          'bg-verdict-fail text-ws-paper hover:opacity-90': variant === 'danger',
        },
        {
          'px-2.5 py-1 text-xs gap-1.5': size === 'sm',
          'px-3.5 py-1.5 text-[13px] gap-2': size === 'md',
          'px-5 py-2.5 text-sm gap-2.5': size === 'lg',
        },
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// ============================================================
// CARD
// ============================================================
interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

// Do not nest Cards. Use hairline dividers or sectioned padding inside a single Card instead.
export function Card({ children, className, hover = false, padding = 'md' }: CardProps) {
  return (
    <div
      className={clsx(
        'bg-ws-surface rounded-lg border border-ws-border',
        hover && 'card-hover',
        {
          '': padding === 'none',
          'p-4': padding === 'sm',
          'p-6': padding === 'md',
          'p-8': padding === 'lg',
        },
        className
      )}
    >
      {children}
    </div>
  );
}

// ============================================================
// VERDICT BADGE
// ============================================================
const VERDICT_CONFIG: Record<Verdict, { label: string; className: string }> = {
  pass: { label: 'Pass', className: 'verdict-pass' },
  needs_review: { label: 'Needs Review', className: 'verdict-review' },
  fail: { label: 'Fail', className: 'verdict-fail' },
};

export function VerdictBadge({ verdict, size = 'md' }: { verdict: Verdict; size?: 'sm' | 'md' | 'lg' }) {
  const config = VERDICT_CONFIG[verdict];
  return (
    <span
      className={clsx(
        'inline-flex items-center font-medium rounded-md uppercase tracking-[0.04em]',
        config.className,
        {
          'px-2 py-0.5 text-[10.5px]': size === 'sm',
          'px-2.5 py-1 text-[11px]': size === 'md',
          'px-3.5 py-1.5 text-[12px]': size === 'lg',
        }
      )}
    >
      {config.label}
    </span>
  );
}

// ============================================================
// COMPLIANCE VERDICT BADGE (for advisor notes)
// ============================================================
type ComplianceVerdict = 'compliant' | 'needs_completion' | 'non_compliant';

const COMPLIANCE_CONFIG: Record<ComplianceVerdict, { label: string; className: string }> = {
  compliant: { label: 'Compliant', className: 'verdict-pass' },
  needs_completion: { label: 'Needs Completion', className: 'verdict-review' },
  non_compliant: { label: 'Non-Compliant', className: 'verdict-fail' },
};

export function ComplianceVerdictBadge({ verdict, size = 'md' }: { verdict: ComplianceVerdict; size?: 'sm' | 'md' | 'lg' }) {
  const config = COMPLIANCE_CONFIG[verdict];
  return (
    <span
      className={clsx(
        'inline-flex items-center font-medium rounded-md uppercase tracking-[0.04em]',
        config.className,
        {
          'px-2 py-0.5 text-[10.5px]': size === 'sm',
          'px-2.5 py-1 text-[11px]': size === 'md',
          'px-3.5 py-1.5 text-[12px]': size === 'lg',
        }
      )}
    >
      {config.label}
    </span>
  );
}

// ============================================================
// CONFIDENCE INDICATOR
// ============================================================
export function ConfidenceIndicator({ level, showLabel = true }: { level: ConfidenceLevel; showLabel?: boolean }) {
  const config: Record<ConfidenceLevel, { label: string; color: string; dotClass: string }> = {
    high: { label: 'High', color: 'text-confidence-high', dotClass: 'confidence-high' },
    medium: { label: 'Medium', color: 'text-confidence-medium', dotClass: 'confidence-medium' },
    low: { label: 'Low', color: 'text-confidence-low', dotClass: 'confidence-low' },
  };
  const c = config[level];
  return (
    <span className={`inline-flex items-center gap-1.5 ${c.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ring-1 ring-inset ring-ws-paper ${c.dotClass}`} />
      {showLabel && <span className="text-[11px] font-medium uppercase tracking-[0.06em]">{c.label}</span>}
    </span>
  );
}

// ============================================================
// RISK SCORE
// ============================================================
export function RiskScore({ score }: { score: number }) {
  const color =
    score <= 3 ? 'text-verdict-pass bg-verdict-pass-bg' :
    score <= 6 ? 'text-verdict-review bg-verdict-review-bg' :
    'text-verdict-fail bg-verdict-fail-bg';

  return (
    <span className={`inline-flex items-center justify-center w-10 h-10 rounded-md font-semibold tracking-tightest tabular-nums text-base ${color}`}>
      {score}
    </span>
  );
}

// ============================================================
// SCORE BAR (for compliance score)
// ============================================================
export function ScoreBar({ score, label }: { score: number; label?: string }) {
  const color =
    score >= 80 ? 'bg-verdict-pass' :
    score >= 50 ? 'bg-verdict-review' :
    'bg-verdict-fail';

  return (
    <div className="space-y-1">
      {label && (
        <div className="flex justify-between text-xs">
          <span className="text-ws-muted">{label}</span>
          <span className="font-semibold text-ws-dark tabular-nums">{score}%</span>
        </div>
      )}
      <div className="h-1.5 bg-ws-sunken rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================
// LOADING SPINNER
// ============================================================
export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div
      className={clsx(
        'border-2 border-ws-border border-t-ws-accent rounded-full animate-spin',
        {
          'w-4 h-4': size === 'sm',
          'w-6 h-6': size === 'md',
          'w-8 h-8': size === 'lg',
        }
      )}
    />
  );
}

// ============================================================
// EMPTY STATE
// ============================================================
export function EmptyState({ icon, title, description, action }: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-12 h-12 rounded-lg border border-ws-border bg-ws-surface flex items-center justify-center text-ws-muted mb-4">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-ws-black mb-1">{title}</h3>
      <p className="text-sm text-ws-muted max-w-md mb-6 text-balance leading-relaxed">{description}</p>
      {action}
    </div>
  );
}

// ============================================================
// RE-EXPORTS from separate files
// ============================================================
export { ToastContainer } from './Toast';
export { Modal } from './Modal';
export { Tabs } from './Tabs';
export { DataTable } from './DataTable';
export type { Column } from './DataTable';
export { TextArea } from './TextArea';
export { Select } from './Select';
export { Badge } from './Badge';
export { ProgressSteps } from './ProgressSteps';
