import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function main() {
  const baseURL = process.env.FARO_SCREENSHOT_URL ?? 'http://127.0.0.1:3000';
  const output = 'docs/screenshots';

  await mkdir(output, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });

  for (const [name, route] of [
    ['dashboard', '/dashboard'],
    ['follow-ups', '/follow-ups?task=fu_amara'],
    ['analytics', '/analytics'],
    ['google-sheets', '/integrations/google-sheets'],
  ] as const) {
    await page.goto(`${baseURL}${route}`, { waitUntil: 'networkidle' });
    if (name === 'google-sheets') {
      await page.getByRole('button', { name: 'Preview and validate' }).click();
      await page.getByText('Preview complete with two decisions').waitFor();
    }
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, 0);
    });
    // Let fixed Carbon shell layers settle after a button click scrolls a long page.
    await page.waitForFunction(() => window.scrollY === 0);
    await page.waitForTimeout(800);
    await page.screenshot({ fullPage: true, path: `${output}/${name}.png` });
  }

  await browser.close();
  console.log(
    `Captured ${output}/dashboard.png, follow-ups.png, analytics.png, and google-sheets.png`,
  );
}

void main();
