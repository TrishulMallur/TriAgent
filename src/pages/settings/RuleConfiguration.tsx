import { useState } from 'react';
import { Card, Badge, Button } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useRules, type TransferRules, type NoteRules, type SlaRules } from '@/contexts/RulesContext';
import { Scale, FileCheck, ClipboardCheck, Clock, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';

interface SlaWindowMeta {
  id: keyof SlaRules['windows_hours'];
  label: string;
  description: string;
}

const SLA_WINDOW_META: SlaWindowMeta[] = [
  { id: 'name_mismatch', label: 'Name Mismatch', description: 'SLA window for name-mismatch rejections (most common, usually quick to resolve)' },
  { id: 'insufficient_fee', label: 'Insufficient Fee', description: 'Insufficient transfer-out fee · client communication tends to be fast' },
  { id: 'account_type_conflict', label: 'Account Type Conflict', description: 'LIRA/RRIF/locked-in conflicts may need a TriAgent ops review' },
  { id: 'missing_signature', label: 'Missing Signature', description: 'Client must re-sign · short SLA forces a same-day response' },
  { id: 'expired_authorization', label: 'Expired Authorization', description: 'Authorization older than the 90-day window · needs a fresh signature' },
  { id: 'account_closed', label: 'Account Closed', description: 'Sending institution flagged the account closed · usually needs research' },
  { id: 'other', label: 'Other', description: 'Catch-all for rejection types not in the standard taxonomy' },
];

// ============================================================
// LABELS + RANGES (presentation-only; the real state lives in RulesContext)
// ============================================================

interface ToggleMeta {
  id: keyof TransferRules['toggles'] | keyof NoteRules['checklist'];
  label: string;
  description: string;
}

interface ThresholdMeta {
  id: keyof TransferRules['thresholds'] | keyof NoteRules['thresholds'];
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}

const TRANSFER_TOGGLE_META: ToggleMeta[] = [
  { id: 'auth_90_day', label: '90-Day Authorization Check', description: 'Reject transfer authorizations older than the authorization age limit' },
  { id: 'account_type_match', label: 'Account Type Matching', description: 'Require source and destination account types to be compatible (e.g., RRSP-to-RRSP)' },
  { id: 'min_account_digits', label: 'Minimum Account Number Digits', description: 'Require account numbers to meet the minimum-digits threshold' },
  { id: 'joint_signatures', label: 'Joint Account Signatures', description: 'Require all account holders to sign for joint accounts' },
  { id: 'signature_required', label: 'Signature Presence Check', description: 'Flag documents with missing or blank signature fields' },
  { id: 'name_match_strict', label: 'Strict Name Matching', description: 'Require exact name match between source and destination (no abbreviations, initials)' },
  { id: 'sin_validation', label: 'SIN Format Validation', description: 'Validate Social Insurance Number format when present in documents' },
];

const TRANSFER_THRESHOLD_META: ThresholdMeta[] = [
  { id: 'high_value_threshold', label: 'High-Value Transfer Threshold', description: 'Transfers above this amount trigger supervisor review', min: 10000, max: 1000000, step: 10000, unit: '$' },
  { id: 'auth_max_days', label: 'Authorization Max Age', description: 'Maximum age of authorization before auto-rejection', min: 30, max: 365, step: 1, unit: 'days' },
  { id: 'min_account_digits_val', label: 'Min Account Digits', description: 'Minimum number of digits required for valid account numbers', min: 6, max: 16, step: 1, unit: 'digits' },
];

const NOTE_TOGGLE_META: ToggleMeta[] = [
  { id: 'ciro_client_profile', label: 'Client Profile & Financial Situation', description: 'Require documentation of client background, income, assets, and liabilities' },
  { id: 'ciro_objectives', label: 'Investment Objectives', description: 'Require clear documentation of client investment goals' },
  { id: 'ciro_risk_tolerance', label: 'Risk Tolerance Assessment', description: 'Require explicit risk tolerance documentation with scale rating' },
  { id: 'ciro_recommendation', label: 'Recommendation & Suitability', description: 'Require suitability rationale linking recommendation to client profile' },
  { id: 'ciro_risks_discussed', label: 'Material Risks Discussed', description: 'Require documentation of risk disclosures made to client' },
  { id: 'ciro_client_response', label: 'Client Response & Consent', description: 'Require documentation of client acknowledgment and agreement' },
  { id: 'ciro_conflicts', label: 'Conflict of Interest Disclosure', description: 'Require disclosure statement or explicit confirmation of no conflicts' },
  { id: 'ciro_time_horizon', label: 'Time Horizon Documentation', description: 'Require explicit mention of investment time horizon' },
];

const NOTE_THRESHOLD_META: ThresholdMeta[] = [
  { id: 'note_pass_score', label: 'Pass Score Threshold', description: 'Minimum score for a "Compliant" verdict', min: 50, max: 100, step: 5, unit: '%' },
  { id: 'note_review_score', label: 'Review Score Threshold', description: 'Minimum score for "Needs Completion" (below this = Non-Compliant)', min: 20, max: 80, step: 5, unit: '%' },
  { id: 'note_escalation_score', label: 'Auto-Escalation Score', description: 'Notes scoring below this trigger automatic escalation', min: 10, max: 70, step: 5, unit: '%' },
];

// ============================================================
// INLINE PRESENTATIONAL HELPERS
// ============================================================

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (val: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-ws-accent/50 ${
        enabled ? 'bg-ws-accent' : 'bg-ws-border'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
          enabled ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function Slider({
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (val: number) => void;
}) {
  const displayValue = unit === '$' ? `$${value.toLocaleString()}` : `${value} ${unit}`;
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className="flex items-center gap-4">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1.5 bg-ws-border rounded-full appearance-none cursor-pointer accent-ws-accent"
        style={{
          background: `linear-gradient(to right, var(--color-ws-accent, #4C35E0) 0%, var(--color-ws-accent, #4C35E0) ${percentage}%, #E5E7EB ${percentage}%, #E5E7EB 100%)`,
        }}
      />
      <span className="text-sm font-semibold text-ws-dark min-w-[80px] text-right">{displayValue}</span>
    </div>
  );
}

interface RuleSectionProps {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  count?: number;
}

function RuleSection({ title, icon, defaultOpen = true, children, count }: RuleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card padding="none">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-ws-light/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {icon}
          <span className="text-sm font-semibold text-ws-dark">{title}</span>
          {count !== undefined && (
            <Badge variant="info" size="sm">{count} rules</Badge>
          )}
        </div>
        {open ? (
          <ChevronDown className="w-4 h-4 text-ws-muted" />
        ) : (
          <ChevronRight className="w-4 h-4 text-ws-muted" />
        )}
      </button>
      {open && <div className="px-6 pb-5 space-y-4 border-t border-ws-border pt-4">{children}</div>}
    </Card>
  );
}

// ============================================================
// COMPONENT
// ============================================================

export function RuleConfiguration() {
  const { addToast } = useToast();
  const {
    rules,
    updateTransferToggle,
    updateTransferThreshold,
    updateNoteToggle,
    updateNoteThreshold,
    updateSlaWindow,
    updateSlaAutoEscalate,
    resetToDefaults,
  } = useRules();

  const handleTransferToggle = (id: keyof TransferRules['toggles']) => {
    const meta = TRANSFER_TOGGLE_META.find((m) => m.id === id);
    const currentlyEnabled = rules.transfer.toggles[id];
    updateTransferToggle(id, !currentlyEnabled);
    addToast('info', `${meta?.label ?? id} ${currentlyEnabled ? 'disabled' : 'enabled'}`);
  };

  const handleNoteToggle = (id: keyof NoteRules['checklist']) => {
    const meta = NOTE_TOGGLE_META.find((m) => m.id === id);
    const currentlyEnabled = rules.note.checklist[id];
    updateNoteToggle(id, !currentlyEnabled);
    addToast('info', `${meta?.label ?? id} ${currentlyEnabled ? 'disabled' : 'enabled'}`);
  };

  const handleReset = () => {
    resetToDefaults();
    addToast('success', 'Rules reset to defaults');
  };

  const enabledTransfer = (Object.values(rules.transfer.toggles) as boolean[]).filter(Boolean).length;
  const enabledNote = (Object.values(rules.note.checklist) as boolean[]).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-ws-accent/10 flex items-center justify-center flex-shrink-0">
            <Scale className="w-5 h-5 text-ws-accent" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-ws-dark">Rule Configuration</h3>
            <p className="text-sm text-ws-muted">
              Toggles below are injected into every AI prompt · disabled rules will not produce flags.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleReset}>
          <RotateCcw className="w-4 h-4 mr-1" /> Reset to defaults
        </Button>
      </div>

      {/* Transfer Validation Rules */}
      <RuleSection
        title="Transfer Validation Rules"
        icon={<FileCheck className="w-5 h-5 text-blue-600" />}
        count={enabledTransfer}
      >
        {TRANSFER_TOGGLE_META.map((meta) => {
          const enabled = rules.transfer.toggles[meta.id as keyof TransferRules['toggles']];
          return (
            <div key={meta.id} className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ws-dark">{meta.label}</span>
                  {enabled ? (
                    <Badge variant="success" size="sm">Active</Badge>
                  ) : (
                    <Badge variant="default" size="sm">Disabled</Badge>
                  )}
                </div>
                <p className="text-xs text-ws-muted mt-0.5">{meta.description}</p>
              </div>
              <Toggle
                enabled={enabled}
                onChange={() => handleTransferToggle(meta.id as keyof TransferRules['toggles'])}
              />
            </div>
          );
        })}
      </RuleSection>

      {/* Transfer Thresholds */}
      <RuleSection
        title="Transfer Thresholds"
        icon={<FileCheck className="w-5 h-5 text-blue-600" />}
        defaultOpen={false}
      >
        {TRANSFER_THRESHOLD_META.map((meta) => {
          const value = rules.transfer.thresholds[meta.id as keyof TransferRules['thresholds']];
          return (
            <div key={meta.id} className="space-y-2">
              <div>
                <span className="text-sm font-medium text-ws-dark">{meta.label}</span>
                <p className="text-xs text-ws-muted">{meta.description}</p>
              </div>
              <Slider
                value={value}
                min={meta.min}
                max={meta.max}
                step={meta.step}
                unit={meta.unit}
                onChange={(v) => updateTransferThreshold(meta.id as keyof TransferRules['thresholds'], v)}
              />
            </div>
          );
        })}
      </RuleSection>

      {/* Advisor Note CIRO Checklist */}
      <RuleSection
        title="Advisor Note CIRO Checklist"
        icon={<ClipboardCheck className="w-5 h-5 text-amber-600" />}
        count={enabledNote}
      >
        {NOTE_TOGGLE_META.map((meta) => {
          const enabled = rules.note.checklist[meta.id as keyof NoteRules['checklist']];
          return (
            <div key={meta.id} className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ws-dark">{meta.label}</span>
                  {enabled ? (
                    <Badge variant="success" size="sm">Required</Badge>
                  ) : (
                    <Badge variant="default" size="sm">Optional</Badge>
                  )}
                </div>
                <p className="text-xs text-ws-muted mt-0.5">{meta.description}</p>
              </div>
              <Toggle
                enabled={enabled}
                onChange={() => handleNoteToggle(meta.id as keyof NoteRules['checklist'])}
              />
            </div>
          );
        })}
      </RuleSection>

      {/* SLA Windows + Auto-Escalation */}
      <RuleSection
        title="SLA Windows"
        icon={<Clock className="w-5 h-5 text-rose-600" />}
        defaultOpen={false}
        count={SLA_WINDOW_META.length}
      >
        <div className="flex items-start justify-between gap-4 pb-3 border-b border-ws-border">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-ws-dark">Auto-Escalate on SLA Breach</span>
              {rules.sla.auto_escalate_on_breach ? (
                <Badge variant="success" size="sm">Active</Badge>
              ) : (
                <Badge variant="default" size="sm">Disabled</Badge>
              )}
            </div>
            <p className="text-xs text-ws-muted mt-0.5">
              When an exception passes its SLA deadline, automatically escalate it to a supervisor.
              The audit log captures `reason: sla_breach`. Disable to keep breached exceptions in the queue without escalation.
            </p>
          </div>
          <Toggle
            enabled={rules.sla.auto_escalate_on_breach}
            onChange={(v) => {
              updateSlaAutoEscalate(v);
              addToast('info', `Auto-escalation ${v ? 'enabled' : 'disabled'}`);
            }}
          />
        </div>
        {SLA_WINDOW_META.map((meta) => {
          const value = rules.sla.windows_hours[meta.id];
          return (
            <div key={meta.id} className="space-y-2">
              <div>
                <span className="text-sm font-medium text-ws-dark">{meta.label}</span>
                <p className="text-xs text-ws-muted">{meta.description}</p>
              </div>
              <Slider
                value={value}
                min={1}
                max={168}
                step={1}
                unit="hours"
                onChange={(v) => updateSlaWindow(meta.id, v)}
              />
            </div>
          );
        })}
      </RuleSection>

      {/* Note Scoring Thresholds */}
      <RuleSection
        title="Note Scoring Thresholds"
        icon={<ClipboardCheck className="w-5 h-5 text-amber-600" />}
        defaultOpen={false}
      >
        {NOTE_THRESHOLD_META.map((meta) => {
          const value = rules.note.thresholds[meta.id as keyof NoteRules['thresholds']];
          return (
            <div key={meta.id} className="space-y-2">
              <div>
                <span className="text-sm font-medium text-ws-dark">{meta.label}</span>
                <p className="text-xs text-ws-muted">{meta.description}</p>
              </div>
              <Slider
                value={value}
                min={meta.min}
                max={meta.max}
                step={meta.step}
                unit={meta.unit}
                onChange={(v) => updateNoteThreshold(meta.id as keyof NoteRules['thresholds'], v)}
              />
            </div>
          );
        })}
      </RuleSection>
    </div>
  );
}
