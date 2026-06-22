import { test, expect } from '@playwright/test';

/**
 * End-to-end "happy path" test for the compliance pipeline.
 *
 * Walks the user through Ingestion -> Validation using the
 * "Clean — TD Canada Trust" sample document and asserts the
 * expected verdict / row counts at each stage.
 *
 * Latency note: the mock provider adds 800-2000ms per AI call,
 * so each waitable assertion is given a generous (15s) timeout.
 */
test('Ingestion -> Validation happy path with the clean TD sample', async ({ page }) => {
  // -------------------------------------------------
  // Stage 1 — Ingestion
  // -------------------------------------------------
  await page.goto('/transfer/ingestion');
  await page.waitForLoadState('networkidle');

  // The sample picker lives inside a tab — switch to "Use Sample".
  await page.getByRole('tab', { name: 'Use Sample' }).first().click();

  // Pick the clean TD sample. DocumentInput renders a native <select>,
  // so selectOption({ label: ... }) works.
  const sampleSelect = page.locator('select').first();
  await sampleSelect.selectOption({ label: 'Clean — TD Canada Trust' });

  // Kick off extraction.
  await page.getByRole('button', { name: 'Extract Fields' }).click();

  // The "Extraction Summary" card should render with TD Canada Trust
  // as the source institution. Use a structural locator instead of plain
  // text — "TD Canada Trust" otherwise also matches the sample <option>
  // text in the (collapsed) dropdown, which Playwright treats as hidden.
  await expect(page.getByText('Extraction Summary')).toBeVisible({ timeout: 15_000 });
  await expect(
    page
      .locator('p', { hasText: 'Source Institution' })
      .locator('xpath=following-sibling::p[1]'),
  ).toHaveText('TD Canada Trust', { timeout: 15_000 });

  // Field Review Table should have at least 10 rows (clean_td has 15).
  const fieldRows = page.locator('table tbody tr');
  await expect(fieldRows.first()).toBeVisible({ timeout: 15_000 });
  // Some rows may be expansion rows — count distinct field-name rows by
  // sampling the table's row count instead of inspecting each cell.
  const rowCount = await fieldRows.count();
  expect(rowCount).toBeGreaterThanOrEqual(10);

  // Confirm all fields -> success card appears.
  await page.getByRole('button', { name: 'Confirm All Fields' }).click();

  const proceedBtn = page.getByRole('button', { name: /Proceed to Validation/i });
  await expect(proceedBtn).toBeVisible({ timeout: 15_000 });

  // -------------------------------------------------
  // Stage 2 — Validation
  // -------------------------------------------------
  await proceedBtn.click();

  await expect(page).toHaveURL(/\/transfer\/validation$/);
  await page.waitForLoadState('networkidle');

  // Validation may not pre-fill the document; pick the clean TD sample again.
  await page.getByRole('tab', { name: 'Use Sample' }).first().click();
  const validationSelect = page.locator('select').first();
  await validationSelect.selectOption({ label: 'Clean TD Transfer (should pass)' });

  await page.getByRole('button', { name: 'Validate Document' }).click();

  // Verdict card appears -> assert "Pass" verdict (capitalised by
  // VerdictBadge) and that the Validation Checks section renders.
  await expect(page.getByText(/^Pass$/i).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Validation Checks').first()).toBeVisible({ timeout: 15_000 });
});
