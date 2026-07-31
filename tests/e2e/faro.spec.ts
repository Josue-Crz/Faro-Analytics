import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('dashboard starts with an honest empty workspace', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Turn outreach into a clear next action' }),
  ).toBeVisible();
  await expect(page.getByText('Your workspace starts empty')).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Know who needs you next—and why.' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await expect(page.getByText('Know who needs you next', { exact: true })).toHaveCount(0);
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
  const [
    records,
    context,
    focusUpdate,
    campaign,
    campaignUpdate,
    campaignDelete,
    sheetConnections,
    contactUpdate,
    contactSchedule,
  ] = await Promise.all([
    request.get('/api/workspace/records'),
    request.get('/api/workspace/context?campaignId=campaign-untrusted'),
    request.patch('/api/workspace/context', {
      data: { campaignId: 'campaign-untrusted' },
    }),
    request.get('/api/campaigns/campaign-untrusted'),
    request.patch('/api/campaigns/campaign-untrusted', {
      data: { action: 'COMPLETE' },
    }),
    request.delete('/api/campaigns/campaign-untrusted'),
    request.get('/api/sheets/connections'),
    request.patch('/api/contacts/contact-untrusted', {
      data: {
        email: 'untrusted@example.test',
        firstName: 'Untrusted',
        lastName: 'Caller',
        phone: null,
        preferredChannel: 'EMAIL',
        timezone: 'UTC',
        title: null,
        type: 'OTHER',
      },
    }),
    request.put('/api/contacts/contact-untrusted/schedule', {
      data: { campaignId: 'campaign-untrusted', mode: 'OPTIMIZE' },
    }),
  ]);
  for (const response of [
    records,
    context,
    focusUpdate,
    campaign,
    campaignUpdate,
    campaignDelete,
    sheetConnections,
    contactUpdate,
    contactSchedule,
  ]) {
    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: 'AUTHENTICATION_REQUIRED' });
  }
});

test('Bob generation API rejects unauthenticated access', async ({ request }) => {
  const response = await request.post('/api/bob/generation-requests', {
    data: { contactId: 'ct_untrusted', followUpTaskId: 'fu_untrusted' },
  });
  expect(response.status()).toBe(503);
  await expect(response.json()).resolves.toMatchObject({ error: 'PRODUCTION_AUTH_REQUIRED' });
});

test('notification APIs reject unauthenticated access', async ({ request }) => {
  const [center, preferences, verification, optOut] = await Promise.all([
    request.get('/api/notifications'),
    request.patch('/api/settings/notifications', { data: {} }),
    request.post('/api/settings/notifications/sms/start', {
      data: { phone: '+14155550123' },
    }),
    request.post('/api/settings/notifications/sms/opt-out'),
  ]);

  expect(center.status()).toBe(401);
  expect(preferences.status()).toBe(401);
  expect(verification.status()).toBe(401);
  expect(optOut.status()).toBe(401);
});

test('notification scheduler rejects an untrusted caller', async ({ request }) => {
  const [notifications, schedules] = await Promise.all([
    request.post('/api/cron/notifications'),
    request.post('/api/cron/outreach-schedules'),
  ]);
  expect([401, 503]).toContain(notifications.status());
  expect([401, 503]).toContain(schedules.status());
});

test('empty follow-up setup has no critical accessibility violations', async ({ page }) => {
  await page.goto('/follow-ups');
  const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  expect(results.violations.filter((violation) => violation.impact === 'critical')).toEqual([]);
});
