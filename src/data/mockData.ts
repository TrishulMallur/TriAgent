/**
 * MOCK DATA · Simulated TriAgent operational data
 * 
 * This file contains all mock data for the prototype.
 * No real PII is used. All names, account numbers, and institutions are fictional.
 */

import type { TransferException, AuditEntry, AnalyticsData } from '@/types';

// ============================================================
// MOCK CLIENTS
// ============================================================
export const MOCK_CLIENTS = [
  { id: 'cli_001', firstName: 'Jonathan', lastName: 'Doe', preferredName: 'John', email: 'john.doe@example.com', dob: '1985-03-15', wsAccountType: 'RRSP', wsAccountNumber: 'WS-7734821' },
  { id: 'cli_002', firstName: 'Sarah', lastName: 'Martinez', preferredName: 'Sarah', email: 'sarah.m@example.com', dob: '1990-08-22', wsAccountType: 'TFSA', wsAccountNumber: 'WS-9912034' },
  { id: 'cli_003', firstName: 'Wei', lastName: 'Zhang', preferredName: 'Wei', email: 'wei.zhang@example.com', dob: '1978-11-30', wsAccountType: 'Non-Registered', wsAccountNumber: 'WS-4456789' },
  { id: 'cli_004', firstName: 'Priya', lastName: 'Sharma', preferredName: 'Priya', email: 'priya.s@example.com', dob: '1992-05-10', wsAccountType: 'FHSA', wsAccountNumber: 'WS-6623451' },
  { id: 'cli_005', firstName: 'Marcus', lastName: 'Thompson', preferredName: 'Marcus', email: 'marcus.t@example.com', dob: '1968-01-25', wsAccountType: 'RRIF', wsAccountNumber: 'WS-3387654' },
  { id: 'cli_006', firstName: 'Emily', lastName: 'Chen-Roberts', preferredName: 'Emily', email: 'emily.cr@example.com', dob: '1988-07-14', wsAccountType: 'RRSP', wsAccountNumber: 'WS-5501234' },
  { id: 'cli_007', firstName: 'David', lastName: 'O\'Brien', preferredName: 'David', email: 'dobrien@example.com', dob: '1975-12-03', wsAccountType: 'LIRA', wsAccountNumber: 'WS-8876543' },
  { id: 'cli_008', firstName: 'Fatima', lastName: 'Al-Hassan', preferredName: 'Fatima', email: 'fatima.ah@example.com', dob: '1995-09-18', wsAccountType: 'TFSA', wsAccountNumber: 'WS-2234567' },
];

// ============================================================
// MOCK REJECTED TRANSFERS (Stage 3 · Exception Queue)
// ============================================================
//
// SLA seed strategy
// -----------------
// The Exceptions page derives each card's badge from
//   (now - dateRejected) / windowHoursFor(rejectionType).
// We want the demo to render all 4 SLA badge states out of the box, but the
// real wall clock keeps moving forward. So we anchor every rejection date to
// `MOCK_BUILD_TIME` (module-load instant) with a per-row offset chosen to
// place that row in the target bucket given its rejectionType's default
// window. `slaDeadline` is the derived ISO deadline (dateRejected +
// windowHours) and is exposed for display only · the live state calc still
// goes through computeSlaStatus.
//
// Target distribution against DEFAULT_RULES.sla.windows_hours:
//   exc_001 name_mismatch (48h)           → BREACHED   (rejected 96h ago → 200%)
//   exc_002 insufficient_fee (24h)        → BREACHED   (rejected 30h ago → 125%)
//   exc_003 account_type_conflict (72h)   → AT_RISK    (rejected 64h ago → 89%)
//   exc_004 missing_signature (24h)       → BREACHED   (rejected 36h ago → 150%)
//   exc_005 name_mismatch (48h)           → ON_TRACK   (rejected 8h ago → 17%)
//   exc_006 name_mismatch (48h)           → APPROACHING(rejected 30h ago → 63%)
//   exc_007 account_type_conflict (72h)   → AT_RISK    (rejected 62h ago → 86%)
//   exc_008 insufficient_fee (24h)        → BREACHED   (rejected 28h ago → 117%)
// Total: 4 breached, 2 at_risk, 1 approaching, 1 on_track.

const MOCK_BUILD_TIME = Date.now();
const HOUR_MS = 60 * 60 * 1000;

/** rejectionType → default SLA window hours (mirrors DEFAULT_RULES.sla). */
const DEFAULT_SLA_WINDOW_HOURS: Record<string, number> = {
  name_mismatch: 48,
  insufficient_fee: 24,
  account_type_conflict: 72,
  missing_signature: 24,
  expired_authorization: 48,
  account_closed: 96,
  other: 48,
};

/**
 * Build a (dateRejected, slaDeadline) pair such that the exception falls in
 * the desired bucket right now. `hoursAgoRejected` is how long ago the rejection
 * happened; deadline = rejection + window for the type.
 */
function seedSla(
  rejectionType: string,
  hoursAgoRejected: number,
): { dateRejected: string; slaDeadline: string } {
  const rejectedMs = MOCK_BUILD_TIME - hoursAgoRejected * HOUR_MS;
  const windowMs =
    (DEFAULT_SLA_WINDOW_HOURS[rejectionType] ?? 48) * HOUR_MS;
  return {
    dateRejected: new Date(rejectedMs).toISOString(),
    slaDeadline: new Date(rejectedMs + windowMs).toISOString(),
  };
}

export const MOCK_EXCEPTIONS: TransferException[] = [
  {
    id: 'exc_001', transferId: 'txfr_001', clientId: 'cli_001', clientName: 'John Doe',
    rejectionCode: 'ATON-401', rejectionReason: 'Account holder name does not match. Registered as: Jonathan Edward Doe',
    rejectionType: 'name_mismatch', sendingInstitution: 'TD Canada Trust',
    accountType: 'RRSP', transferAmount: 45000, status: 'pending_diagnosis',
    ...seedSla('name_mismatch', 96), // breached
  },
  {
    id: 'exc_002', transferId: 'txfr_002', clientId: 'cli_002', clientName: 'Sarah Martinez',
    rejectionCode: 'ATON-502', rejectionReason: 'Insufficient funds to cover transfer-out fee. Account balance: $42.13. Required fee: $150.00',
    rejectionType: 'insufficient_fee', sendingInstitution: 'RBC Royal Bank',
    accountType: 'TFSA', transferAmount: 28000, status: 'pending_diagnosis',
    ...seedSla('insufficient_fee', 30), // breached
  },
  {
    id: 'exc_003', transferId: 'txfr_003', clientId: 'cli_003', clientName: 'Wei Zhang',
    rejectionCode: 'ATON-403', rejectionReason: 'Account type mismatch. Source account is LIRA; destination registered as Non-Registered.',
    rejectionType: 'account_type_conflict', sendingInstitution: 'BMO InvestorLine',
    accountType: 'Non-Registered', transferAmount: 112000, status: 'pending_diagnosis',
    ...seedSla('account_type_conflict', 64), // at_risk
  },
  {
    id: 'exc_004', transferId: 'txfr_004', clientId: 'cli_004', clientName: 'Priya Sharma',
    rejectionCode: 'ATON-301', rejectionReason: 'Authorization signature missing on transfer form page 2',
    rejectionType: 'missing_signature', sendingInstitution: 'Questrade',
    accountType: 'FHSA', transferAmount: 8000, status: 'pending_diagnosis',
    ...seedSla('missing_signature', 36), // breached
  },
  {
    id: 'exc_005', transferId: 'txfr_005', clientId: 'cli_005', clientName: 'Marcus Thompson',
    rejectionCode: 'ATON-401', rejectionReason: 'Name mismatch: Marcus A. Thompson vs Marcus Thompson. Middle initial required.',
    rejectionType: 'name_mismatch', sendingInstitution: 'Scotia iTRADE',
    accountType: 'RRIF', transferAmount: 340000, status: 'pending_diagnosis',
    ...seedSla('name_mismatch', 8), // on_track
  },
  {
    id: 'exc_006', transferId: 'txfr_006', clientId: 'cli_006', clientName: 'Emily Chen-Roberts',
    rejectionCode: 'ATON-401', rejectionReason: 'Hyphenated name not matching. Source: Emily Chen. Destination: Emily Chen-Roberts',
    rejectionType: 'name_mismatch', sendingInstitution: 'CIBC Investor\'s Edge',
    accountType: 'RRSP', transferAmount: 67000, status: 'pending_diagnosis',
    ...seedSla('name_mismatch', 30), // approaching (~63%)
  },
  {
    id: 'exc_007', transferId: 'txfr_007', clientId: 'cli_007', clientName: 'David O\'Brien',
    rejectionCode: 'ATON-403', rejectionReason: 'Source account is Locked-In Retirement Account (LIRA). Cannot transfer to standard RRSP.',
    rejectionType: 'account_type_conflict', sendingInstitution: 'National Bank Direct Brokerage',
    accountType: 'LIRA', transferAmount: 89000, status: 'pending_diagnosis',
    ...seedSla('account_type_conflict', 62), // at_risk (~86%)
  },
  {
    id: 'exc_008', transferId: 'txfr_008', clientId: 'cli_008', clientName: 'Fatima Al-Hassan',
    rejectionCode: 'ATON-502', rejectionReason: 'Transfer-out fee of $150 cannot be deducted. TFSA has $0 cash balance. Holdings are 100% equities.',
    rejectionType: 'insufficient_fee', sendingInstitution: 'TD Canada Trust',
    accountType: 'TFSA', transferAmount: 15000, status: 'pending_diagnosis',
    ...seedSla('insufficient_fee', 28), // breached
  },
];

// ============================================================
// MOCK TRANSFER DOCUMENTS (Stage 1 & 2 · text versions)
// ============================================================
export const MOCK_TRANSFER_DOCS = {
  clean_td: `ACCOUNT TRANSFER AUTHORIZATION FORM
TD Canada Trust · Investor Services
Date: February 15, 2026

ACCOUNT HOLDER INFORMATION
Full Name: Sarah Martinez
Date of Birth: August 22, 1990
Address: 142 Queen St W, Toronto, ON M5H 2M9
SIN: ***-***-789

SENDING ACCOUNT DETAILS
Institution: TD Canada Trust
Institution Code: 004
Branch: 10242
Account Number: 6629-8834-221
Account Type: TFSA
Account Status: Active

TRANSFER DETAILS
Transfer Type: Full Transfer
Asset Type: Cash
Estimated Value: $28,000.00
Transfer To: TriAgent
Destination Account: WS-9912034
Destination Account Type: TFSA

AUTHORIZATION
I hereby authorize TD Canada Trust to transfer the above-referenced account to TriAgent

Signature: [SIGNED] Sarah Martinez
Date: February 15, 2026
`,

  errors_rbc: `ACCOUNT TRANSFER REQUEST
RBC Direct Investing

Client: Wei Zhang
DOB: Nov 30 1978

From Account:
RBC - Acct# 553-221-8  (Note: only 7 digits · format should be 10+)
Type: LIRA
Branch: 00312

To:
TriAgent - WS-4456789
Type: Non-Registered  (Note: LIRA cannot go to Non-Registered)

Transfer: Full, In-Kind
Approx Value: $112,000

Authorization date: November 2, 2025  (Note: >90 days old)
Signature: [SIGNED] Wei Zhang
`,

  missing_sig_questrade: `Questrade Account Transfer Form
Generated: 2026-02-18

Account Holder: Priya Sharma
Date of Birth: 1992-05-10
Email: priya.s@example.com

Source Account:
Institution: Questrade Inc.
Account #: 5198-7723-001
Account Type: FHSA
Estimated Value: $8,000

Destination:
TriAgent
Account #: WS-6623451
Account Type: FHSA

Transfer Type: Full Transfer
Asset Type: Cash

Authorization:
Date: February 18, 2026
Signature: ___________________  (Note: BLANK · no signature)
`,
};

// ============================================================
// MOCK ADVISOR NOTES (varying compliance levels)
// ============================================================
export const MOCK_ADVISOR_NOTES = {
  compliant: `Client Meeting Notes · February 20, 2026
Client: Sarah Martinez | Account: TFSA (WS-9912034)
Advisor: Michael Rivera

Meeting Purpose: Annual portfolio review and rebalancing discussion.

Client Profile & Financial Situation:
Sarah is 35, employed as a software engineer earning approximately $130,000/year. She has no outstanding debt, owns a condo with $180K remaining on her mortgage, and has an emergency fund covering 6 months of expenses. Her TFSA is her primary investment vehicle with a current balance of approximately $45,000.

Investment Objectives:
Sarah's primary objective is long-term growth, with a secondary goal of saving for a potential home upgrade in the next 7-10 years. She explicitly stated she does not need income from her portfolio at this time.

Risk Tolerance:
Sarah confirmed her risk tolerance as moderate-to-aggressive (7/10 on our scale). She expressed comfort with short-term volatility and understands that equity-heavy portfolios can experience drawdowns of 20-30% in any given year. She confirmed she would not panic sell in a downturn.

Recommendation & Suitability Rationale:
I recommended rebalancing from her current 60/40 equity-bond split to a 75/25 split, using TriAgent's Growth portfolio. This aligns with her moderate-to-aggressive risk profile, her 7-10 year time horizon, and her stated growth objective. At 35 with stable employment and no debt pressure, she has the capacity to absorb short-term volatility.

Material Risks Discussed:
I informed Sarah that increasing equity exposure means higher expected volatility. Specifically, a 75% equity portfolio could see drawdowns of 25-35% in a severe downturn. I also noted that her 7-10 year time horizon for the home upgrade provides adequate recovery time, but if her timeline shortened materially, we would need to reassess.

Client Response:
Sarah agreed with the recommendation and confirmed she is comfortable with the increased equity allocation. She had no objections. She asked about ESG options, and I noted that TriAgent's SRI portfolio is available if she wants to prioritize socially responsible investing in the future.

No conflicts of interest to disclose.`,

  partial: `Quick note · Met with Wei Zhang today, Feb 21.

We talked about his portfolio. He wants growth. I suggested moving to a more aggressive allocation since he's got a decent chunk of change and seems fine with risk.

He's been with us for a while now and his accounts are looking good. We agreed to go with 80/20 equities.

He seemed happy with the plan. Will check in next quarter.`,

  non_compliant: `Called Marcus Thompson back re: his question about his RRIF.

He wanted to know about minimum withdrawals. I explained the rules.

He's going to think about it and get back to me.

· Mike`,
};

// ============================================================
// MOCK ANALYTICS DATA (30-day seed)
// ============================================================
function generateAnalyticsData(): AnalyticsData {
  const days = 30;
  const volumeByDay = [];
  const now = new Date('2026-02-24');

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const base = isWeekend ? 5 : 20;
    // Deterministic seeded values (stable across reloads)
    volumeByDay.push({
      date: date.toISOString().split('T')[0],
      ingestion: Math.floor(base + ((i * 7) % 15)),
      validation: Math.floor(base + ((i * 5) % 12)),
      exception: Math.floor(2 + ((i * 3) % 8)),
      notes: Math.floor(5 + ((i * 11) % 15)),
    });
  }

  return {
    volumeByDay,
    verdictBreakdown: [
      { module: 'Transfer Ingestion', pass: 142, needsReview: 38, fail: 12 },
      { module: 'Transfer Validation', pass: 128, needsReview: 45, fail: 19 },
      { module: 'Exception Resolution', pass: 67, needsReview: 21, fail: 8 },
      { module: 'Advisor Notes', pass: 98, needsReview: 52, fail: 14 },
    ],
    commonErrors: [
      { error: 'Name mismatch between institutions', count: 47, module: 'Transfer', trend: 'stable' },
      { error: 'Missing suitability rationale', count: 38, module: 'Advisor Notes', trend: 'down' },
      { error: 'Expired authorization date', count: 29, module: 'Transfer', trend: 'up' },
      { error: 'Account type conflict', count: 23, module: 'Transfer', trend: 'stable' },
      { error: 'Missing risk tolerance documentation', count: 21, module: 'Advisor Notes', trend: 'down' },
      { error: 'Insufficient transfer-out fee coverage', count: 18, module: 'Transfer', trend: 'up' },
      { error: 'Missing signature on authorization', count: 15, module: 'Transfer', trend: 'stable' },
      { error: 'Vague client objective statement', count: 12, module: 'Advisor Notes', trend: 'down' },
    ],
    pipelineHealth: [
      { stage: 'Ingestion Queue', count: 14, avgTimeMinutes: 3.2 },
      { stage: 'Validation Queue', count: 8, avgTimeMinutes: 4.1 },
      { stage: 'Processing', count: 22, avgTimeMinutes: 12.5 },
      { stage: 'Exception Queue', count: 8, avgTimeMinutes: 45.0 },
      { stage: 'Completed (24h)', count: 52, avgTimeMinutes: 0 },
    ],
    overrides: [
      { date: '2026-02-24', count: 3, reasons: { 'Known client · context not in system': 2, 'Document quality issue · verified manually': 1 } },
      { date: '2026-02-23', count: 1, reasons: { 'Rule too strict for this account type': 1 } },
      { date: '2026-02-22', count: 4, reasons: { 'Known client · context not in system': 1, 'Sending institution confirmed verbally': 2, 'Policy exception approved by supervisor': 1 } },
      { date: '2026-02-20', count: 2, reasons: { 'Known client · context not in system': 1, 'Document quality issue · verified manually': 1 } },
      { date: '2026-02-19', count: 3, reasons: { 'Sending institution confirmed verbally': 2, 'Rule too strict for this account type': 1 } },
      { date: '2026-02-17', count: 2, reasons: { 'Policy exception approved by supervisor': 1, 'Known client · context not in system': 1 } },
      { date: '2026-02-16', count: 1, reasons: { 'Document quality issue · verified manually': 1 } },
      { date: '2026-02-13', count: 3, reasons: { 'Known client · context not in system': 2, 'Sending institution confirmed verbally': 1 } },
      { date: '2026-02-11', count: 2, reasons: { 'Rule too strict for this account type': 1, 'Policy exception approved by supervisor': 1 } },
      { date: '2026-02-09', count: 1, reasons: { 'Known client · context not in system': 1 } },
      { date: '2026-02-06', count: 2, reasons: { 'Document quality issue · verified manually': 1, 'Sending institution confirmed verbally': 1 } },
      { date: '2026-02-03', count: 1, reasons: { 'Policy exception approved by supervisor': 1 } },
      { date: '2026-01-31', count: 2, reasons: { 'Known client · context not in system': 1, 'Rule too strict for this account type': 1 } },
      { date: '2026-01-28', count: 1, reasons: { 'Sending institution confirmed verbally': 1 } },
    ],
  };
}

export const MOCK_ANALYTICS = generateAnalyticsData();
