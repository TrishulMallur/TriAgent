import { test, expect } from '@playwright/test';

/**
 * Bulk ingestion mode — end-to-end happy path.
 *
 * Switches the Ingestion page to "Bulk batch" mode, drops three in-memory
 * files into the queue via the hidden <input type="file"> exposed by
 * FileUpload, runs the batch with the default mock-provider concurrency
 * (3), and verifies:
 *
 *   - all three rows reach the `Done` status badge
 *   - the aggregate footer surfaces "Confirm All Pending Review (3)"
 *   - clicking that button advances the confirmed counter to "3 confirmed"
 *
 * Filenames are chosen so the mock provider's filename-based routing
 * (mock-provider.ts → routeExtraction) returns the RBC and Questrade
 * branches alongside the default Clean TD branch — each row therefore
 * exercises a different mock route.
 *
 * Latency note: the mock provider adds 800-2000ms per AI call. At
 * concurrency=3 the three-file batch finishes in ~2-3s; the assertions
 * are given a generous 30s timeout to absorb scheduler jitter on CI.
 */
test('Ingestion (bulk mode): three-file batch completes and confirms via the aggregate footer', async ({ page }) => {
  await page.goto('/transfer/ingestion');
  await page.waitForLoadState('networkidle');

  // Switch to Bulk batch mode. The toggle is a plain <button>, not a tab.
  await page.getByRole('button', { name: /Bulk batch/i }).click();

  // The bulk drop zone should now be visible.
  await expect(page.getByText('Bulk Document Ingestion')).toBeVisible({ timeout: 10_000 });

  // FileUpload renders a hidden <input type="file" multiple webkitdirectory>.
  // Playwright's setInputFiles refuses file payloads when webkitdirectory
  // is set ("input requires passing a path to a directory"), so we strip
  // the directory attributes at test time — production behaviour is
  // untouched and the multiple-files path is what we want to exercise here.
  const fileInput = page.locator('input[type="file"]');
  await fileInput.evaluate((el) => {
    el.removeAttribute('webkitdirectory');
    el.removeAttribute('directory');
  });
  await fileInput.setInputFiles([
    {
      name: 'TD_Canada_Trust_transfer.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('mock TD content'),
    },
    {
      name: 'Wei_Zhang_RBC_Direct_transfer.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('mock RBC content'),
    },
    {
      name: 'Priya_Sharma_Questrade_transfer.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('mock Questrade content'),
    },
  ]);

  // Three rows should appear in the queue, each in the Pending state.
  const queueRows = page.locator('text=/transfer\\.pdf/');
  await expect(queueRows).toHaveCount(3, { timeout: 10_000 });

  // The Start Batch button should reflect the pending count.
  const startBtn = page.getByRole('button', { name: /Start Batch \(3\)/i });
  await expect(startBtn).toBeVisible();
  await startBtn.click();

  // Wait for all three rows to reach the Done badge. The badge text is
  // "Done" (capital D — see STATUS_BADGE in IngestionQueue.tsx). Latency
  // budget: ~3 calls at ~1.5s each with concurrency=3 ≈ 2-3s; cap at 30s.
  await expect(page.getByText('Done', { exact: true })).toHaveCount(3, {
    timeout: 30_000,
  });

  // The aggregate footer should now offer to confirm all 3 pending-review
  // rows. The button label embeds the eligible count.
  const confirmAllBtn = page.getByRole('button', { name: /Confirm All Pending Review \(3\)/i });
  await expect(confirmAllBtn).toBeVisible({ timeout: 10_000 });
  await confirmAllBtn.click();

  // The header badge row should now show "3 confirmed". The exact text
  // comes from the counts badge in IngestionQueue.tsx ("{n} confirmed").
  await expect(page.getByText(/3 confirmed/i)).toBeVisible({ timeout: 10_000 });

  // And the Confirm All button should now be disabled (zero eligible).
  // The label updates to "(0)" once every done row has been reviewed.
  await expect(
    page.getByRole('button', { name: /Confirm All Pending Review \(0\)/i }),
  ).toBeDisabled();
});
