import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

// ============================================================
// TYPES
// ============================================================

export interface TransferRules {
  toggles: {
    auth_90_day: boolean;
    account_type_match: boolean;
    min_account_digits: boolean;
    joint_signatures: boolean;
    signature_required: boolean;
    name_match_strict: boolean;
    sin_validation: boolean;
  };
  thresholds: {
    high_value_threshold: number; // dollars
    auth_max_days: number; // days
    min_account_digits_val: number; // digits
  };
}

export interface NoteRules {
  checklist: {
    ciro_client_profile: boolean;
    ciro_objectives: boolean;
    ciro_risk_tolerance: boolean;
    ciro_recommendation: boolean;
    ciro_risks_discussed: boolean;
    ciro_client_response: boolean;
    ciro_conflicts: boolean;
    ciro_time_horizon: boolean;
  };
  thresholds: {
    note_pass_score: number; // %, 50-100
    note_review_score: number; // %, 20-80
    note_escalation_score: number; // %, 10-70
  };
}

/**
 * SLA configuration · per-rejection-type windows (in hours) and a kill-switch
 * for the auto-escalation effect that runs in ExceptionsPage.
 *
 * NOTE: these values are intentionally NOT injected into the LLM preamble.
 * The SLA clock is operational policy, not an AI evaluation rule.
 */
export interface SlaRules {
  windows_hours: {
    name_mismatch: number;
    insufficient_fee: number;
    account_type_conflict: number;
    missing_signature: number;
    expired_authorization: number;
    account_closed: number;
    other: number;
  };
  auto_escalate_on_breach: boolean;
}

export interface Rules {
  transfer: TransferRules;
  note: NoteRules;
  sla: SlaRules;
}

// ============================================================
// DEFAULTS
// ============================================================

export const DEFAULT_RULES: Rules = {
  transfer: {
    toggles: {
      auth_90_day: true,
      account_type_match: true,
      min_account_digits: true,
      joint_signatures: true,
      signature_required: true,
      name_match_strict: false,
      sin_validation: true,
    },
    thresholds: {
      high_value_threshold: 100_000,
      auth_max_days: 90,
      min_account_digits_val: 10,
    },
  },
  note: {
    checklist: {
      ciro_client_profile: true,
      ciro_objectives: true,
      ciro_risk_tolerance: true,
      ciro_recommendation: true,
      ciro_risks_discussed: true,
      ciro_client_response: true,
      ciro_conflicts: true,
      ciro_time_horizon: true,
    },
    thresholds: {
      note_pass_score: 80,
      note_review_score: 50,
      note_escalation_score: 50,
    },
  },
  sla: {
    windows_hours: {
      name_mismatch: 48,
      insufficient_fee: 24,
      account_type_conflict: 72,
      missing_signature: 24,
      expired_authorization: 48,
      account_closed: 96,
      other: 48,
    },
    auto_escalate_on_breach: true,
  },
};

// ============================================================
// HUMAN-READABLE LABELS (used by renderRulesPreamble)
// ============================================================

const TRANSFER_TOGGLE_LABELS: Record<keyof TransferRules['toggles'], string> = {
  auth_90_day: '90-day authorization age limit',
  account_type_match: 'Account type matching (e.g. RRSP-to-RRSP)',
  min_account_digits: 'Minimum account number digits',
  joint_signatures: 'Joint account signature requirement',
  signature_required: 'Signature presence check',
  name_match_strict: 'Strict name matching (no abbreviations or initials)',
  sin_validation: 'SIN format validation',
};

const NOTE_CHECKLIST_LABELS: Record<keyof NoteRules['checklist'], string> = {
  ciro_client_profile: 'Client profile and financial situation',
  ciro_objectives: 'Investment objectives',
  ciro_risk_tolerance: 'Risk tolerance assessment',
  ciro_recommendation: 'Recommendation and suitability rationale',
  ciro_risks_discussed: 'Material risks discussed with client',
  ciro_client_response: 'Client response and consent',
  ciro_conflicts: 'Conflict of interest disclosure',
  ciro_time_horizon: 'Investment time horizon',
};

// ============================================================
// PERSISTENCE
// ============================================================

const STORAGE_KEY = 'ws-rules-v1';

/**
 * Deep-merge a possibly-malformed persisted blob with defaults.
 * - If the persisted value at a key is the wrong type, the default wins.
 * - Missing fields are filled from defaults (forward-compat).
 * - Extra fields in the persisted blob are ignored.
 */
export function mergeWithDefaults(persisted: unknown, defaults: Rules): Rules {
  if (!persisted || typeof persisted !== 'object') return defaults;
  const p = persisted as Record<string, unknown>;

  const transferIn =
    p.transfer && typeof p.transfer === 'object'
      ? (p.transfer as Record<string, unknown>)
      : {};
  const noteIn =
    p.note && typeof p.note === 'object'
      ? (p.note as Record<string, unknown>)
      : {};
  const slaIn =
    p.sla && typeof p.sla === 'object'
      ? (p.sla as Record<string, unknown>)
      : {};

  const transferTogglesIn =
    transferIn.toggles && typeof transferIn.toggles === 'object'
      ? (transferIn.toggles as Record<string, unknown>)
      : {};
  const transferThresholdsIn =
    transferIn.thresholds && typeof transferIn.thresholds === 'object'
      ? (transferIn.thresholds as Record<string, unknown>)
      : {};
  const noteChecklistIn =
    noteIn.checklist && typeof noteIn.checklist === 'object'
      ? (noteIn.checklist as Record<string, unknown>)
      : {};
  const noteThresholdsIn =
    noteIn.thresholds && typeof noteIn.thresholds === 'object'
      ? (noteIn.thresholds as Record<string, unknown>)
      : {};
  const slaWindowsIn =
    slaIn.windows_hours && typeof slaIn.windows_hours === 'object'
      ? (slaIn.windows_hours as Record<string, unknown>)
      : {};
  const slaAutoEscalateIn =
    typeof slaIn.auto_escalate_on_breach === 'boolean'
      ? slaIn.auto_escalate_on_breach
      : defaults.sla.auto_escalate_on_breach;

  const mergeBool = <K extends string>(
    src: Record<string, unknown>,
    fallback: Record<K, boolean>,
  ): Record<K, boolean> => {
    const out = { ...fallback };
    (Object.keys(fallback) as K[]).forEach((k) => {
      const v = src[k];
      if (typeof v === 'boolean') out[k] = v;
    });
    return out;
  };

  const mergeNum = <K extends string>(
    src: Record<string, unknown>,
    fallback: Record<K, number>,
  ): Record<K, number> => {
    const out = { ...fallback };
    (Object.keys(fallback) as K[]).forEach((k) => {
      const v = src[k];
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    });
    return out;
  };

  return {
    transfer: {
      toggles: mergeBool(transferTogglesIn, defaults.transfer.toggles),
      thresholds: mergeNum(transferThresholdsIn, defaults.transfer.thresholds),
    },
    note: {
      checklist: mergeBool(noteChecklistIn, defaults.note.checklist),
      thresholds: mergeNum(noteThresholdsIn, defaults.note.thresholds),
    },
    sla: {
      windows_hours: mergeNum(slaWindowsIn, defaults.sla.windows_hours),
      auto_escalate_on_breach: slaAutoEscalateIn,
    },
  };
}

function readPersistedRules(): { rules: Rules; warned: boolean } {
  try {
    const raw =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(STORAGE_KEY)
        : null;
    if (raw === null) return { rules: DEFAULT_RULES, warned: false };
    const parsed = JSON.parse(raw);
    return { rules: mergeWithDefaults(parsed, DEFAULT_RULES), warned: false };
  } catch (err) {
    console.warn(
      '[RulesContext] Failed to read persisted rules · falling back to defaults',
      err,
    );
    return { rules: DEFAULT_RULES, warned: true };
  }
}

function writePersistedRules(rules: Rules): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch (err) {
    console.warn(
      '[RulesContext] Failed to persist rules · continuing in-memory only',
      err,
    );
  }
}

// ============================================================
// CONTEXT
// ============================================================

interface RulesContextType {
  rules: Rules;
  updateTransferToggle: (
    key: keyof TransferRules['toggles'],
    val: boolean,
  ) => void;
  updateTransferThreshold: (
    key: keyof TransferRules['thresholds'],
    val: number,
  ) => void;
  updateNoteToggle: (key: keyof NoteRules['checklist'], val: boolean) => void;
  updateNoteThreshold: (
    key: keyof NoteRules['thresholds'],
    val: number,
  ) => void;
  updateSlaWindow: (
    key: keyof SlaRules['windows_hours'],
    val: number,
  ) => void;
  updateSlaAutoEscalate: (val: boolean) => void;
  resetToDefaults: () => void;
}

const RulesContext = createContext<RulesContextType | null>(null);

export function RulesProvider({ children }: { children: ReactNode }) {
  // Read once on mount. useState's initializer runs once, so this is fine.
  const initial = useRef<{ rules: Rules; warned: boolean } | null>(null);
  if (initial.current === null) initial.current = readPersistedRules();
  const [rules, setRules] = useState<Rules>(initial.current.rules);

  // Persist on every change. Skip the very first run so we don't immediately
  // rewrite the same value we just read (harmless, but pointless I/O).
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    writePersistedRules(rules);
  }, [rules]);

  const updateTransferToggle = useCallback(
    (key: keyof TransferRules['toggles'], val: boolean) => {
      setRules((prev) => ({
        ...prev,
        transfer: {
          ...prev.transfer,
          toggles: { ...prev.transfer.toggles, [key]: val },
        },
      }));
    },
    [],
  );

  const updateTransferThreshold = useCallback(
    (key: keyof TransferRules['thresholds'], val: number) => {
      setRules((prev) => ({
        ...prev,
        transfer: {
          ...prev.transfer,
          thresholds: { ...prev.transfer.thresholds, [key]: val },
        },
      }));
    },
    [],
  );

  const updateNoteToggle = useCallback(
    (key: keyof NoteRules['checklist'], val: boolean) => {
      setRules((prev) => ({
        ...prev,
        note: {
          ...prev.note,
          checklist: { ...prev.note.checklist, [key]: val },
        },
      }));
    },
    [],
  );

  const updateNoteThreshold = useCallback(
    (key: keyof NoteRules['thresholds'], val: number) => {
      setRules((prev) => ({
        ...prev,
        note: {
          ...prev.note,
          thresholds: { ...prev.note.thresholds, [key]: val },
        },
      }));
    },
    [],
  );

  const updateSlaWindow = useCallback(
    (key: keyof SlaRules['windows_hours'], val: number) => {
      setRules((prev) => ({
        ...prev,
        sla: {
          ...prev.sla,
          windows_hours: { ...prev.sla.windows_hours, [key]: val },
        },
      }));
    },
    [],
  );

  const updateSlaAutoEscalate = useCallback((val: boolean) => {
    setRules((prev) => ({
      ...prev,
      sla: { ...prev.sla, auto_escalate_on_breach: val },
    }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setRules(DEFAULT_RULES);
  }, []);

  const value = useMemo<RulesContextType>(
    () => ({
      rules,
      updateTransferToggle,
      updateTransferThreshold,
      updateNoteToggle,
      updateNoteThreshold,
      updateSlaWindow,
      updateSlaAutoEscalate,
      resetToDefaults,
    }),
    [
      rules,
      updateTransferToggle,
      updateTransferThreshold,
      updateNoteToggle,
      updateNoteThreshold,
      updateSlaWindow,
      updateSlaAutoEscalate,
      resetToDefaults,
    ],
  );

  return (
    <RulesContext.Provider value={value}>{children}</RulesContext.Provider>
  );
}

export function useRules(): RulesContextType {
  const ctx = useContext(RulesContext);
  if (!ctx) throw new Error('useRules must be used within RulesProvider');
  return ctx;
}

// ============================================================
// PROMPT PREAMBLE RENDERER
// ============================================================

/**
 * Render the active-rules preamble that gets prefixed to LLM system prompts.
 *
 * For advisor_note: list the enabled CIRO checklist items, list the disabled
 *   ones as "Do NOT flag", and inject the pass/review/escalation thresholds.
 * For transfer_validation: list the enabled toggles, list the disabled ones
 *   as "Do NOT flag", and inject the high-value $, auth_max_days, and
 *   min-digit-count thresholds.
 *
 * Always returns a multi-line string starting with the header
 * "ACTIVE RULES (apply only these):".
 */
export function renderRulesPreamble(
  rules: Rules,
  flow: 'advisor_note' | 'transfer_validation',
): string {
  if (flow === 'advisor_note') {
    const checklist = rules.note.checklist;
    const enabled: string[] = [];
    const disabled: string[] = [];
    (Object.keys(NOTE_CHECKLIST_LABELS) as Array<keyof NoteRules['checklist']>)
      .forEach((k) => {
        const label = NOTE_CHECKLIST_LABELS[k];
        if (checklist[k]) enabled.push(label);
        else disabled.push(label);
      });

    const t = rules.note.thresholds;
    const lines: string[] = [];
    lines.push('ACTIVE RULES (apply only these):');
    lines.push('');
    lines.push('CIRO checklist items to enforce:');
    if (enabled.length === 0) {
      lines.push('- (none · do not flag any CIRO items)');
    } else {
      enabled.forEach((l) => lines.push(`- ${l}`));
    }
    if (disabled.length > 0) {
      lines.push('');
      lines.push(
        'Do NOT flag the following items (they are disabled in current policy):',
      );
      disabled.forEach((l) => lines.push(`- ${l}`));
    }
    lines.push('');
    lines.push('Scoring thresholds:');
    lines.push(`- Pass score (Compliant): >= ${t.note_pass_score}%`);
    lines.push(
      `- Review score (Needs Completion): >= ${t.note_review_score}% and < ${t.note_pass_score}%`,
    );
    lines.push(
      `- Auto-escalation: any note scoring below ${t.note_escalation_score}%`,
    );
    return lines.join('\n');
  }

  // flow === 'transfer_validation'
  const toggles = rules.transfer.toggles;
  const enabled: string[] = [];
  const disabled: string[] = [];
  (Object.keys(TRANSFER_TOGGLE_LABELS) as Array<keyof TransferRules['toggles']>)
    .forEach((k) => {
      const label = TRANSFER_TOGGLE_LABELS[k];
      if (toggles[k]) enabled.push(label);
      else disabled.push(label);
    });

  const t = rules.transfer.thresholds;
  const lines: string[] = [];
  lines.push('ACTIVE RULES (apply only these):');
  lines.push('');
  lines.push('Transfer validation checks to enforce:');
  if (enabled.length === 0) {
    lines.push('- (none · do not flag any transfer issues)');
  } else {
    enabled.forEach((l) => lines.push(`- ${l}`));
  }
  if (disabled.length > 0) {
    lines.push('');
    lines.push(
      'Do NOT flag the following checks (they are disabled in current policy):',
    );
    disabled.forEach((l) => lines.push(`- ${l}`));
  }
  lines.push('');
  lines.push('Thresholds:');
  lines.push(
    `- High-value transfer threshold: $${t.high_value_threshold.toLocaleString('en-US')} (above this, flag for supervisor review)`,
  );
  lines.push(
    `- Authorization must be dated within the last ${t.auth_max_days} days`,
  );
  lines.push(
    `- Account numbers must contain at least ${t.min_account_digits_val} digits`,
  );
  return lines.join('\n');
}
