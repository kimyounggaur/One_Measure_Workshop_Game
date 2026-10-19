import { expect, test } from '@playwright/test';
test('HOME is Korean and accessible without audio', async ({ page }) => {
  const external: string[] = [];
  page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:4386')) external.push(r.url()); });
  await page.addInitScript(() => { Object.defineProperty(window, 'AudioContext', { value: class { constructor() { throw new Error('Audio must not start during boot'); } } }); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '한 마디 조립실', exact: true })).toBeVisible();
  await expect(page.getByRole('button').first()).toBeVisible();
  expect(external).toEqual([]);
});
