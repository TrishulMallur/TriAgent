import { describe, it, expect } from 'vitest';

import {
  DEFAULT_RULES,
  renderRulesPreamble,
  type Rules,
} from './RulesContext';

// Deep-clone helper so individual tests don't mutate DEFAULT_RULES.
function clone(rules: Rules): Rules {
  return JSON.parse(JSON.stringify(rules)) as Rules;
}

describe('renderRulesPreamble', () => {
  it('always starts with the ACTIVE RULES header', () => {
    const advisor = renderRulesPreamble(DEFAULT_RULES, 'advisor_note');
    const transfer = renderRulesPreamble(DEFAULT_RULES, 'transfer_validation');
    expect(advisor.startsWith('ACTIVE RULES (apply only these):')).toBe(true);
    expect(transfer.startsWith('ACTIVE RULES (apply only these):')).toBe(true);
  });

  it('advisor-note preamble lists enabled CIRO items', () => {
    const text = renderRulesPreamble(DEFAULT_RULES, 'advisor_note');
    // Default has every CIRO item enabled; their human labels should appear.
    expect(text).toMatch(/Client profile/i);
    expect(text).toMatch(/Investment objectives/i);
    expect(text).toMatch(/Risk tolerance/i);
    expect(text).toMatch(/Recommendation/i);
    expect(text).toMatch(/Material risks/i);
    expect(text).toMatch(/Client response/i);
    expect(text).toMatch(/Conflict/i);
    expect(text).toMatch(/Time horizon/i);
  });

  it('advisor-note preamble explicitly mentions disabled items as "Do NOT flag"', () => {
    const rules = clone(DEFAULT_RULES);
    rules.note.checklist.ciro_conflicts = false;

    const text = renderRulesPreamble(rules, 'advisor_note');

    expect(text).toMatch(/Do NOT flag/i);
    expect(text).toMatch(/conflict/i);

    // Stricter check: the "conflict" label appears in the disabled section,
    // which always follows the "Do NOT flag" line in our renderer.
    const doNotFlagIdx = text.toLowerCase().indexOf('do not flag');
    const conflictIdx = text.toLowerCase().indexOf('conflict');
    expect(doNotFlagIdx).toBeGreaterThan(-1);
    expect(conflictIdx).toBeGreaterThan(doNotFlagIdx);
  });

  it('transfer-validation preamble includes the high-value $ threshold and auth_max_days', () => {
    const rules = clone(DEFAULT_RULES);
    rules.transfer.thresholds.high_value_threshold = 250_000;
    rules.transfer.thresholds.auth_max_days = 90;

    const text = renderRulesPreamble(rules, 'transfer_validation');

    // Accept either formatted "250,000" or raw "250000".
    expect(text).toMatch(/250,000|250000/);
    // auth_max_days should appear as the literal "90 days".
    expect(text).toMatch(/90\s+days/i);
  });

  it('transfer-validation preamble lists disabled toggles under "Do NOT flag"', () => {
    const rules = clone(DEFAULT_RULES);
    // name_match_strict is the one default-off toggle · flip another one off too.
    rules.transfer.toggles.sin_validation = false;

    const text = renderRulesPreamble(rules, 'transfer_validation');

    expect(text).toMatch(/Do NOT flag/i);
    expect(text).toMatch(/SIN/i);
    expect(text).toMatch(/Strict name/i);
  });
});
