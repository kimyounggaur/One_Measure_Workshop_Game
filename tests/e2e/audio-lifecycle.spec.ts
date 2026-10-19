import { test, expect, type Page } from '@playwright/test';

async function l3(page: Page, complete = true) {
  await page.goto('/');
  await page.getByRole('button',{name:/주문 03/}).click();
  for (const beat of [1,2,4]) {
    await page.getByRole('button',{name:`${beat}박 선택`,exact:true}).click();
    await page.getByRole('button',{name:'앞 반 박 선택',exact:true}).click();
  }
  if (complete) {
    await page.getByRole('button',{name:'쉼',exact:true}).click();
    await page.getByTestId('tool-R2').click();
    await page.getByRole('button',{name:'3박 선택',exact:true}).click();
    await page.getByRole('button',{name:'앞 반 박 선택',exact:true}).click();
    await page.getByRole('button',{name:'조건 확인하기',exact:true}).click();
    await expect(page.getByRole('heading',{name:'이론 통과! 한 마디가 완성됐어요'})).toBeVisible();
  }
}
test('gesture starts one context; stop/replay preserves editor and theory',async ({page}) => {
  await page.addInitScript(() => {
    const scope = window as Window & { __contextCount?: number };
    scope.__contextCount = 0;
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      constructor(options?: AudioContextOptions) { super(options); scope.__contextCount = (scope.__contextCount ?? 0)+1; }
    };
  });
  await l3(page);
  expect(await page.evaluate(() => (window as Window & {__contextCount?:number}).__contextCount)).toBe(0);
  await page.getByRole('button',{name:'내 리듬 듣기',exact:true}).click();
  await expect(page.getByRole('button',{name:'정지',exact:true})).toBeEnabled();
  await expect(page.getByLabel('빠르기 BPM',{exact:true})).toBeDisabled();
  await expect(page.locator('.count-in-display')).toContainText('준비',{timeout:10000});
  await page.getByRole('button',{name:'정지',exact:true}).click();
  await expect(page.getByLabel('빠르기 BPM',{exact:true})).toBeEnabled();
  await expect(page.locator('.rhythm-piece')).toHaveCount(4);
  await expect(page.getByRole('heading',{name:'이론 통과! 한 마디가 완성됐어요'})).toBeVisible();
  await page.getByRole('button',{name:'내 리듬 듣기',exact:true}).click();
  await expect(page.locator('.count-in-display')).toContainText('준비');
  await page.getByRole('button',{name:'정지',exact:true}).click();
  expect(await page.evaluate(() => (window as Window & {__contextCount?:number}).__contextCount)).toBe(1);
});
test('missing audio leaves silent editing and objective verification available',async ({page}) => {
  await page.addInitScript(() => { Object.defineProperty(window,'AudioContext',{value:undefined,configurable:true}); Object.defineProperty(window,'webkitAudioContext',{value:undefined,configurable:true}); });
  await l3(page,false);
  await page.getByRole('button',{name:'내 리듬 듣기',exact:true}).click();
  await expect(page.locator('.audio-state')).toContainText('소리 없이 조립을 계속');
  await expect(page.getByLabel('빠르기 BPM',{exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'조건 확인하기',exact:true}).click();
  await expect(page.getByRole('heading',{name:'한 조각씩 다시 살펴볼까요?'})).toBeVisible();
  await expect(page.getByTestId('coverage')).toContainText('미입력 1박');
});
test('hidden and orientation interrupt; restart needs a new explicit play and preserves draft',async ({page}) => {
  await l3(page);
  for (const interruption of ['hidden','orientation']) {
    await page.getByRole('button',{name:'내 리듬 듣기',exact:true}).click();
    await expect(page.locator('.count-in-display')).toContainText('준비');
    await page.evaluate(kind => {
      if (kind === 'hidden') {
        Object.defineProperty(document,'hidden',{value:true,configurable:true});
        Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});
        document.dispatchEvent(new Event('visibilitychange'));
      } else window.dispatchEvent(new Event('orientationchange'));
    },interruption);
    await expect(page.getByRole('button',{name:'정지',exact:true})).toBeDisabled();
    await expect(page.getByLabel('빠르기 BPM',{exact:true})).toBeEnabled();
    await expect(page.locator('.rhythm-piece')).toHaveCount(4);
    await expect(page.getByRole('heading',{name:'이론 통과! 한 마디가 완성됐어요'})).toBeVisible();
    await page.evaluate(() => {
      Object.defineProperty(document,'hidden',{value:false,configurable:true});
      Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByRole('button',{name:'정지',exact:true})).toBeDisabled();
  }
});
test('incomplete preview stays incomplete; navigation stops a four-loop preview',async ({page}) => {
  await l3(page,false);
  await expect(page.getByText('빈칸은 아직 결정하지 않은 시간이에요.',{exact:false})).toBeVisible();
  await page.getByLabel('미리 듣기 횟수',{exact:true}).selectOption('4');
  await page.getByRole('button',{name:'내 리듬 듣기',exact:true}).click();
  await expect(page.locator('.count-in-display')).toContainText('준비');
  await page.getByRole('button',{name:'주문 목록',exact:true}).click();
  await expect(page.getByRole('heading',{name:'한 마디 조립실',exact:true})).toBeVisible();
  await expect(page.getByText('0 / 6 이론 통과',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/주문 03/}).click();
  await expect(page.getByTestId('coverage')).toContainText('미입력 1박');
  await expect(page.getByRole('button',{name:'정지',exact:true})).toBeDisabled();
});
test('real browser audio clock completes count-in and a full preview, then unlocks editing',async ({page}) => {
  await l3(page);
  await page.getByLabel('빠르기 BPM',{exact:true}).fill('120');
  await page.getByRole('button',{name:'내 리듬 듣기',exact:true}).click();
  await expect(page.locator('.count-in-display')).toContainText('준비');
  await expect(page.locator('.count-in-display')).toContainText('번째 마디',{timeout:10000});
  await expect(page.getByRole('button',{name:'정지',exact:true})).toBeDisabled({timeout:10000});
  await expect(page.getByLabel('빠르기 BPM',{exact:true})).toBeEnabled();
  await expect(page.locator('.rhythm-piece')).toHaveCount(4);
  await page.getByRole('button',{name:'조건 확인하기',exact:true}).click();
  await expect(page.getByRole('heading',{name:'이론 통과! 한 마디가 완성됐어요'})).toBeVisible();
});
