import { test, expect } from '@playwright/test';

/**
 * Browser-level regression tests that lock in the 2026-05-24 morning bug fixes.
 *
 *  1. The "Errors — RBC Direct" sample on Ingestion no longer crashes the
 *     ErrorBoundary; it renders the field table with Wei Zhang.
 *  2. The Sarah Martinez exception diagnosis surfaces "Sarah", not "Jonathan"
 *     (the previous mock-provider regression that returned the John Doe text).
 */

test('Ingestion: Errors — RBC Direct sample does not crash and renders Wei Zhang', async ({ page }) => {
  await page.goto('/transfer/ingestion');
  await page.waitForLoadState('networkidle');

  await page.getByRole('tab', { name: 'Use Sample' }).first().click();

  const sampleSelect = page.locator('select').first();
  await sampleSelect.selectOption({ label: 'Errors · RBC Direct' });

  await page.getByRole('button', { name: 'Extract Fields' }).click();

  // Wait for either a success-state card (Extraction Summary) or an
  // explicit error message — whichever fires first.
  await expect(
    page.getByText(/Extraction Summary|Analysis Failed|Failed to/i).first(),
  ).toBeVisible({ timeout: 20_000 });

  // The ErrorBoundary fallback must NOT have rendered.
  await expect(page.getByText('Something went wrong')).not.toBeVisible();

  // Wei Zhang should appear somewhere on the page (extracted as
  // "Client Full Name" by the mock provider for the RBC sample).
  await expect(page.getByText('Wei Zhang').first()).toBeVisible({ timeout: 15_000 });
});

test('Exceptions: Sarah Martinez diagnosis contains "Sarah", not "Jonathan"', async ({ page }) => {
  await page.goto('/transfer/exceptions');
  await page.waitForLoadState('networkidle');

  // Click the Sarah Martinez card in the queue. There are multiple text
  // matches across the panel (queue + detail), so target the queue card
  // specifically via the first match.
  const sarahCard = page.getByText('Sarah Martinez').first();
  await expect(sarahCard).toBeVisible({ timeout: 10_000 });
  await sarahCard.click();

  // Trigger diagnosis.
  await page.getByRole('button', { name: /Diagnose with AI/i }).click();

  // Wait for the AI Diagnosis card.
  await expect(page.getByText('AI Diagnosis')).toBeVisible({ timeout: 20_000 });

  // Scope the assertion to the right-side detail panel only — the
  // exception queue on the left still renders the John Doe card whose
  // rejection-reason text contains "Jonathan Edward Doe", and we don't
  // want that to pollute the regression check.
  const detailPanel = page.locator('div.lg\\:col-span-7').first();
  await expect(detailPanel).toBeVisible();

  const detailText = await detailPanel.innerText();
  expect(detailText).toContain('Sarah');
  expect(detailText).not.toContain('Jonathan');
  expect(detailText).not.toContain('Doe');
});
