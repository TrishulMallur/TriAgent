import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import type { ReactNode } from 'react';

import {
  RulesProvider,
  useRules,
  DEFAULT_RULES,
  type Rules,
} from './RulesContext';

// ---------------------------------------------------------------
// Capture pattern (mirrors LLMContext.test.tsx).
// ---------------------------------------------------------------
let captured: ReturnType<typeof useRules> | null = null;

function Capture(): ReactNode {
  captured = useRules();
  return null;
}

function renderWithProvider() {
  return render(
    <RulesProvider>
      <Capture />
    </RulesProvider>,
  );
}

beforeEach(() => {
  captured = null;
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RulesContext', () => {
  it('exposes DEFAULT_RULES when nothing is in localStorage', () => {
    renderWithProvider();
    expect(captured).not.toBeNull();
    expect(captured!.rules).toEqual(DEFAULT_RULES);
  });

  it('throws when useRules is called outside the provider', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Capture />)).toThrow(/within RulesProvider/);
    errSpy.mockRestore();
  });

  it('updateTransferToggle flips one field and leaves others unchanged', () => {
    renderWithProvider();

    // Sanity: name_match_strict default is false.
    expect(captured!.rules.transfer.toggles.name_match_strict).toBe(false);
    const before = captured!.rules;

    act(() => {
      captured!.updateTransferToggle('name_match_strict', true);
    });

    expect(captured!.rules.transfer.toggles.name_match_strict).toBe(true);
    // Other toggles unchanged.
    expect(captured!.rules.transfer.toggles.auth_90_day).toBe(
      before.transfer.toggles.auth_90_day,
    );
    expect(captured!.rules.transfer.toggles.sin_validation).toBe(
      before.transfer.toggles.sin_validation,
    );
    // Note section completely untouched.
    expect(captured!.rules.note).toEqual(before.note);
    // Thresholds untouched.
    expect(captured!.rules.transfer.thresholds).toEqual(
      before.transfer.thresholds,
    );
  });

  it('updateTransferThreshold updates the numeric value', () => {
    renderWithProvider();

    act(() => {
      captured!.updateTransferThreshold('high_value_threshold', 50_000);
    });

    expect(captured!.rules.transfer.thresholds.high_value_threshold).toBe(
      50_000,
    );
    // Other thresholds unchanged.
    expect(captured!.rules.transfer.thresholds.auth_max_days).toBe(
      DEFAULT_RULES.transfer.thresholds.auth_max_days,
    );
  });

  it('updateNoteToggle flips a CIRO checklist item', () => {
    renderWithProvider();

    expect(captured!.rules.note.checklist.ciro_conflicts).toBe(true);

    act(() => {
      captured!.updateNoteToggle('ciro_conflicts', false);
    });

    expect(captured!.rules.note.checklist.ciro_conflicts).toBe(false);
    // Adjacent items unchanged.
    expect(captured!.rules.note.checklist.ciro_objectives).toBe(true);
    expect(captured!.rules.note.checklist.ciro_time_horizon).toBe(true);
  });

  it('updateNoteThreshold updates a scoring threshold', () => {
    renderWithProvider();

    act(() => {
      captured!.updateNoteThreshold('note_pass_score', 75);
    });

    expect(captured!.rules.note.thresholds.note_pass_score).toBe(75);
    expect(captured!.rules.note.thresholds.note_review_score).toBe(
      DEFAULT_RULES.note.thresholds.note_review_score,
    );
  });

  it('resetToDefaults restores everything', () => {
    renderWithProvider();

    act(() => {
      captured!.updateTransferToggle('name_match_strict', true);
      captured!.updateTransferThreshold('high_value_threshold', 1);
      captured!.updateNoteToggle('ciro_conflicts', false);
      captured!.updateNoteThreshold('note_pass_score', 99);
      captured!.updateSlaWindow('name_mismatch', 1);
      captured!.updateSlaAutoEscalate(false);
    });

    // Sanity: at least one of the mutations stuck.
    expect(captured!.rules).not.toEqual(DEFAULT_RULES);

    act(() => {
      captured!.resetToDefaults();
    });

    expect(captured!.rules).toEqual(DEFAULT_RULES);
  });

  it('exposes the default SLA shape with all 7 rejection types + auto-escalate', () => {
    renderWithProvider();

    expect(captured!.rules.sla).toEqual(DEFAULT_RULES.sla);
    // Sanity check on specific defaults · these drive the seeded mock badges.
    expect(captured!.rules.sla.windows_hours.name_mismatch).toBe(48);
    expect(captured!.rules.sla.windows_hours.insufficient_fee).toBe(24);
    expect(captured!.rules.sla.windows_hours.account_type_conflict).toBe(72);
    expect(captured!.rules.sla.windows_hours.missing_signature).toBe(24);
    expect(captured!.rules.sla.windows_hours.expired_authorization).toBe(48);
    expect(captured!.rules.sla.windows_hours.account_closed).toBe(96);
    expect(captured!.rules.sla.windows_hours.other).toBe(48);
    expect(captured!.rules.sla.auto_escalate_on_breach).toBe(true);
  });

  it('updateSlaWindow / updateSlaAutoEscalate mutate one field and persist', () => {
    renderWithProvider();

    act(() => {
      captured!.updateSlaWindow('insufficient_fee', 12);
      captured!.updateSlaAutoEscalate(false);
    });

    expect(captured!.rules.sla.windows_hours.insufficient_fee).toBe(12);
    expect(captured!.rules.sla.auto_escalate_on_breach).toBe(false);
    // Adjacent windows unchanged.
    expect(captured!.rules.sla.windows_hours.name_mismatch).toBe(
      DEFAULT_RULES.sla.windows_hours.name_mismatch,
    );

    // Persistence round-trip.
    const raw = localStorage.getItem('ws-rules-v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as Rules;
    expect(parsed.sla.windows_hours.insufficient_fee).toBe(12);
    expect(parsed.sla.auto_escalate_on_breach).toBe(false);
  });

  it('hydrates a partial persisted blob with no sla section by falling back to defaults', () => {
    // Pre-RulesContext-v2 shape · no sla field at all.
    localStorage.setItem(
      'ws-rules-v1',
      JSON.stringify({
        transfer: { toggles: { auth_90_day: false } },
      }),
    );

    renderWithProvider();

    // sla falls back to defaults wholesale.
    expect(captured!.rules.sla).toEqual(DEFAULT_RULES.sla);
    // Partial-hydration of the other section still works.
    expect(captured!.rules.transfer.toggles.auth_90_day).toBe(false);
  });

  it('persists rule updates to localStorage under ws-rules-v1', () => {
    renderWithProvider();

    act(() => {
      captured!.updateTransferToggle('name_match_strict', true);
    });

    const raw = localStorage.getItem('ws-rules-v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as Rules;
    expect(parsed.transfer.toggles.name_match_strict).toBe(true);
    // Sanity: another field made it into the persisted blob.
    expect(parsed.transfer.thresholds.high_value_threshold).toBe(
      DEFAULT_RULES.transfer.thresholds.high_value_threshold,
    );
  });

  it('hydrates from a partial persisted blob, filling missing fields from defaults', () => {
    // Pre-seed: only one field set, everything else missing · proves mergeWithDefaults.
    localStorage.setItem(
      'ws-rules-v1',
      JSON.stringify({
        transfer: {
          toggles: {
            auth_90_day: false,
          },
        },
      }),
    );

    renderWithProvider();

    // The one field we set survived.
    expect(captured!.rules.transfer.toggles.auth_90_day).toBe(false);
    // Everything else came from defaults.
    expect(captured!.rules.transfer.toggles.account_type_match).toBe(
      DEFAULT_RULES.transfer.toggles.account_type_match,
    );
    expect(captured!.rules.transfer.toggles.sin_validation).toBe(
      DEFAULT_RULES.transfer.toggles.sin_validation,
    );
    expect(captured!.rules.transfer.thresholds).toEqual(
      DEFAULT_RULES.transfer.thresholds,
    );
    expect(captured!.rules.note).toEqual(DEFAULT_RULES.note);
  });

  it('falls back to defaults and warns on malformed persisted JSON', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem('ws-rules-v1', '{not valid json');

    renderWithProvider();

    expect(captured!.rules).toEqual(DEFAULT_RULES);
    expect(warnSpy).toHaveBeenCalled();
    const warnedMsgs = warnSpy.mock.calls.map((c) => String(c[0]));
    expect(warnedMsgs.some((m) => m.includes('RulesContext'))).toBe(true);
  });
});
