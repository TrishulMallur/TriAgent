import { test, expect } from '@playwright/test';

/**
 * Settings -> AI Provider -> llama.cpp (Local)
 *
 * The default role is "admin" (Emma Thompson, see RoleContext.tsx),
 * so /settings is reachable without any extra setup.
 *
 * No llama.cpp server is running on localhost:8080 in the test environment,
 * so "Test Connection" should surface a "Connection Failed" status and the
 * page must NOT crash.
 */
test('Settings: llama.cpp test connection fails gracefully without crashing', async ({ page }) => {
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');

  // Switch to the "AI Provider" tab.
  await page.getByRole('tab', { name: 'AI Provider' }).click();

  // Pick the llama.cpp option from the Active AI Provider dropdown.
  // The Select renders a native <select>; the first <select> on this
  // tab is the provider selector.
  const providerSelect = page.locator('select').first();
  await providerSelect.selectOption({ label: 'llama.cpp (Local)' });

  // Provider-specific config card should render with an endpoint input
  // pre-filled to http://localhost:8080.
  const endpointInput = page.locator('input[placeholder="http://localhost:8080"]');
  await expect(endpointInput).toBeVisible({ timeout: 10_000 });

  // Click "Test Connection". With no server running, the fetch fails
  // and the UI shows the "Connection Failed" status badge.
  await page.getByRole('button', { name: /Test Connection/i }).click();

  await expect(page.getByText('Connection Failed')).toBeVisible({ timeout: 10_000 });

  // Page itself should not have crashed.
  await expect(page.getByText('Something went wrong')).not.toBeVisible();
});
