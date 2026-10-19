import { expect, test, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ hasTouch: true });

const pieces = (page: Page) => page.getByRole('region',{name:'한 마디 조립판'}).locator('.rhythm-strip:not(.ghost-strip) .rhythm-piece');
async function openPuzzle(page: Page, order: number) {
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(`주문 0${order}`) }).tap();
  await expect(page.getByRole('region', { name: '한 마디 조립판' })).toBeVisible();
}
async function openFree(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '자유롭게 만들기', exact: true }).tap();
}
async function position(page: Page, beat: number, half: '앞' | '뒤' = '앞') {
  await page.getByRole('button', { name: `${beat}박 선택`, exact: true }).tap();
  await page.getByRole('button', { name: `${half} 반 박 선택`, exact: true }).tap();
}
async function selectTool(page: Page, id: string) {
  await page.getByRole('button', { name: id.startsWith('N') ? '소리' : '쉼', exact: true }).tap();
  await page.getByTestId(`tool-${id}`).tap();
}
async function expectNoOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
  expect(dimensions.page, `Page must reflow within ${dimensions.viewport}px`).toBeLessThanOrEqual(dimensions.viewport + 1);
}
async function expectLargePrimaryTargets(page: Page) {
  const controls = page.locator('.position-picker button, .palette-panel button, .history-row button, .transport button, .event-list > summary');
  for (const control of await controls.all()) {
    if (!await control.isVisible()) continue;
    const box = await control.boundingBox();
    expect(box, await control.innerText()).not.toBeNull();
    expect(box!.width, `width: ${await control.innerText()}`).toBeGreaterThanOrEqual(43.9);
    expect(box!.height, `height: ${await control.innerText()}`).toBeGreaterThanOrEqual(43.9);
  }
}
async function keyboardActivate(page: Page, target: Locator) {
  for (let step = 0; step < 100; step++) {
    if (await target.evaluate(element => element === document.activeElement)) {
      await page.keyboard.press('Enter');
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error(`Keyboard Tab could not reach ${await target.innerText()}`);
}

for (const width of [320, 390, 768, 1280]) {
  test(`L3 touch-only assembly succeeds at ${width}px with reflow and 44px primary targets`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openPuzzle(page, 3);
    await selectTool(page, 'N2');
    await position(page, 1);
    await position(page, 2);
    await position(page, 4);
    await selectTool(page, 'R2');
    await position(page, 3);
    await expect(pieces(page)).toHaveCount(4);
    await expect(page.getByTestId('coverage')).toContainText('소리 3박 · 쉼 1박 · 미입력 0박');
    await page.getByRole('button', { name: '조건 확인하기', exact: true }).tap();
    await expect(page.getByRole('heading', { name: '이론 통과! 한 마디가 완성됐어요' })).toBeVisible();
    await expectNoOverflow(page);
    await expectLargePrimaryTargets(page);
    await page.screenshot({ path: `output/playwright/s06-l3-${width}.png`, fullPage: true });
  });
}

test('L6 can be completed with keyboard and list controls only', async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await keyboardActivate(page, page.getByRole('button', { name: /주문 06/ }));
  await keyboardActivate(page, page.locator('.event-list > summary'));
  for (const id of ['R1', 'N1', 'N2', 'N1', 'R1', 'N2']) {
    await keyboardActivate(page, page.getByRole('button', { name: id.startsWith('N') ? '소리' : '쉼', exact: true }));
    await keyboardActivate(page, page.getByTestId(`tool-${id}`));
    await keyboardActivate(page, page.locator('.event-list').getByRole('button', { name: /빈칸에 .* 놓기$/ }).first());
  }
  await expect(pieces(page)).toHaveCount(6);
  await expect(page.getByRole('gridcell', { name: /소리 시작/ })).toHaveCount(4);
  await expect(page.getByRole('gridcell', { name: /의도한 쉼/ })).toHaveCount(2);
  await keyboardActivate(page, page.getByRole('button', { name: '조건 확인하기', exact: true }));
  await expect(page.getByRole('heading', { name: '이론 통과! 한 마디가 완성됐어요' })).toBeVisible();
  await expectNoOverflow(page);
  await page.screenshot({ path: 'output/playwright/s06-l6-keyboard-list.png', fullPage: true });
});

test('L2 protects locked pieces while the second beat can split and undo', async ({ page }) => {
  await openPuzzle(page, 2);
  await position(page, 1);
  await expect(page.getByRole('region', { name: '선택한 조각' })).toContainText('잠김');
  await expect(page.getByRole('button', { name: '조각 삭제', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '위치 옮기기', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: /나누기/ })).toBeDisabled();
  await position(page, 2);
  await page.getByRole('button', { name: /나누기/ }).tap();
  await expect(pieces(page)).toHaveCount(5);
  await page.getByRole('button', { name: '되돌리기', exact: true }).tap();
  await expect(pieces(page)).toHaveCount(4);
  await page.getByRole('button', { name: '다시 하기', exact: true }).tap();
  await expect(pieces(page)).toHaveCount(5);
  await page.getByRole('button', { name: '조건 확인하기', exact: true }).tap();
  await expect(page.getByRole('heading', { name: '이론 통과! 한 마디가 완성됐어요' })).toBeVisible();
});

test('confirmation cancellation commits nothing, then apply undo redo restores identical IDs', async ({ page }) => {
  await openFree(page);
  await page.getByLabel('놓기 전에 미리 확인하기').check();
  await position(page, 1);
  await expect(page.locator('.ghost-strip')).toBeVisible();
  await expect(pieces(page)).toHaveCount(0);
  await page.getByRole('button', { name: '취소', exact: true }).tap();
  await expect(page.locator('.ghost-strip')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '되돌리기', exact: true })).toBeDisabled();
  await position(page, 1);
  await page.getByRole('button', { name: '배치 적용', exact: true }).tap();
  const committedId = await pieces(page).first().getAttribute('data-event-id');
  await page.getByRole('button', { name: '되돌리기', exact: true }).tap();
  await expect(pieces(page)).toHaveCount(0);
  await page.getByRole('button', { name: '다시 하기', exact: true }).tap();
  await expect(pieces(page)).toHaveCount(1);
  await expect(pieces(page).first()).toHaveAttribute('data-event-id', committedId!);
});

test('N4 is twice N2 width and tapping sustain selects without creating an onset', async ({ page }) => {
  await openFree(page);
  await selectTool(page, 'N4');
  await position(page, 1);
  await selectTool(page, 'N2');
  await position(page, 3);
  const widths = await pieces(page).evaluateAll(elements => elements.map(element => element.getBoundingClientRect().width));
  expect(widths[0] / widths[1]).toBeCloseTo(2, 4);
  await page.getByRole('gridcell', { name: '1박 뒤 반 박, 앞 음의 지속 구간', exact: true }).tap();
  await expect(pieces(page)).toHaveCount(2);
  await expect(page.getByRole('gridcell', { name: /소리 시작/ })).toHaveCount(2);
  await expect(page.getByRole('region', { name: '선택한 조각' })).toContainText('2분음표');
});

test('overflow placement and cancelled preview leave the existing draft unchanged', async ({ page }) => {
  await openFree(page);
  await selectTool(page, 'N4');
  await position(page, 4);
  await expect(page.locator('.live-message')).toContainText('한 마디 끝을 넘어가요');
  await expect(pieces(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '되돌리기', exact: true })).toBeDisabled();
  await page.getByLabel('놓기 전에 미리 확인하기').check();
  await position(page, 1);
  await expect(page.locator('.ghost-strip')).toBeVisible();
  await page.getByRole('grid').dispatchEvent('pointercancel');
  await expect(page.locator('.ghost-strip')).toHaveCount(0);
  await expect(pieces(page)).toHaveCount(0);
});

test('rest splitting is reachable and preserves explicit silence without note onsets', async ({ page }) => {
  await openFree(page);
  await selectTool(page, 'R4');
  await position(page, 1);
  await position(page, 1);
  const split = page.getByRole('region', { name: '선택한 조각' }).getByRole('button', { name: /나누기/ });
  await expect(split).toBeEnabled();
  await split.tap();
  await expect(pieces(page)).toHaveCount(2);
  await expect(page.getByRole('gridcell', { name: /소리 시작/ })).toHaveCount(0);
  await expect(page.getByTestId('coverage')).toContainText('쉼 2박');
});

test('palette choice and immediate placement provide a live result announcement', async ({ page }) => {
  await openFree(page);
  await selectTool(page, 'N4');
  await expect(page.locator('.live-message')).toContainText('2분음표');
  await expect(page.locator('.live-message')).toContainText(/2박|4칸/);
  await position(page, 1);
  await expect(page.locator('.live-message')).not.toHaveText('');
});

test('320px reflow at 200% text retains step controls, readable buttons and editing', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await openFree(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expectNoOverflow(page);
  await expectLargePrimaryTargets(page);
  await selectTool(page, 'N2');
  await position(page, 1);
  await expect(pieces(page)).toHaveCount(1);
  await page.getByRole('button', { name: '되돌리기', exact: true }).tap();
  await expect(pieces(page)).toHaveCount(0);
  await expectNoOverflow(page);
  await page.screenshot({ path: 'output/playwright/s06-text-200-percent.png', fullPage: true });
});

test('editor and selected-piece controls pass automated axe accessibility checks', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPuzzle(page, 3);
  await position(page, 1);
  await position(page, 1);
  await page.locator('.event-list > summary').tap();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
});
