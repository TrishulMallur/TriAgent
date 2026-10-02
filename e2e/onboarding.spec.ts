import { test, expect } from '@playwright/test';

/**
 * First-visit experience: a brand-new visitor (empty storage) lands in demo
 * mode with the banner, the walkthrough opens on its own, can be stepped
 * through to the end, does not reopen on reload, and can be replayed from
 * the header.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test('new visitor: demo banner, walkthrough, replay', async ({ page }) => {
  await page.goto('/');

  // Demo mode banner with a path to real AI.
  const banner = page.getByRole('status').filter({ hasText: 'Demo mode' });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole('link', { name: 'Add your API key in Settings' })).toBeVisible();

  // Walkthrough opens automatically.
  const tour = page.getByRole('dialog');
  await expect(tour).toBeVisible();
  await expect(tour.getByText('Welcome to TriAgent')).toBeVisible();

  // Step through every step to the end.
  for (let i = 0; i < 20; i++) {
    const finish = tour.getByRole('button', { name: 'Finish' });
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    await tour.getByRole('button', { name: 'Next' }).click();
  }
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Seen: a reload does not reopen it.
  await page.reload();
  await expect(page.getByText('Demo mode')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Replay from the header, then dismiss with Escape.
  await page.getByRole('button', { name: 'Take the quick tour' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('new visitor: AI actions work in demo mode and never call the AI proxy', async ({ page }) => {
  // Any request to the proxy is counted and refused, so a stray call can neither
  // hide behind a fallback nor reach a real backend.
  const proxyCalls: string[] = [];
  await page.route('**/api/llm/**', (route) => {
    proxyCalls.push(route.request().url());
    return route.abort();
  });

  // Advisor note check.
  await page.goto('/advisor-notes');
  await page.getByRole('button', { name: 'Skip tour' }).click();
  await page.getByRole('button', { name: /Partial/ }).click();
  await page.getByRole('button', { name: 'Analyze Note' }).click();
  await expect(page.getByText('CIRO Requirements Checklist')).toBeVisible();

  // Document extraction (Transfer Pipeline, stage 1).
  await page.goto('/transfer/ingestion');
  await page.getByRole('tab', { name: 'Use Sample' }).first().click();
  await page.locator('select').first().selectOption({ label: 'Clean · TD Canada Trust' });
  await page.getByRole('button', { name: 'Extract Fields' }).click();
  await expect(page.locator('table tbody tr').first()).toBeVisible();

  expect(proxyCalls).toEqual([]);
});
