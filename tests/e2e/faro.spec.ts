import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('dashboard starts with an honest empty workspace', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome to Faro' })).toBeVisible();
  await expect(page.getByText('No fictional records are loaded')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await expect(page.getByText('Good morning, Jordan')).toHaveCount(0);
});

test('Google Sheets setup does not expose fixture data before sign-in', async ({ page }) => {
  await page.goto('/integrations/google-sheets');
  await expect(page.getByRole('heading', { level: 1, name: 'Google Sheets' })).toBeVisible();
  await expect(page.getByText('Connect Google to create an empty workspace')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview and validate' })).toHaveCount(0);
});

test('follow-ups require an authenticated workspace', async ({ page }) => {
  await page.goto('/follow-ups?task=fu_maya');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Connect your workspace' }),
  ).toBeVisible();
  await expect(page.getByText('Maya Chen')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Generate with IBM Bob' })).toHaveCount(0);
});

test('contact routes do not disclose records without a session', async ({ page }) => {
  await page.goto('/contacts/ct_amara_okafor');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Connect your workspace' }),
  ).toBeVisible();
  await expect(page.getByText('Amara Okafor')).toHaveCount(0);
});

test('workspace API rejects unauthenticated access', async ({ request }) => {
  const response = await request.get('/api/workspace/records');
  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toMatchObject({ error: 'AUTHENTICATION_REQUIRED' });
});

test('Bob generation API rejects unauthenticated access', async ({ request }) => {
  const response = await request.post('/api/bob/generation-requests', {
    data: { contactId: 'ct_untrusted', followUpTaskId: 'fu_untrusted' },
  });
  expect(response.status()).toBe(503);
  await expect(response.json()).resolves.toMatchObject({ error: 'PRODUCTION_AUTH_REQUIRED' });
});

test('empty follow-up setup has no critical accessibility violations', async ({ page }) => {
  await page.goto('/follow-ups');
  const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  expect(results.violations.filter((violation) => violation.impact === 'critical')).toEqual([]);
});
