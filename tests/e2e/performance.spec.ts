import {test,expect} from '@playwright/test';
test('optional practice uses accepted snapshot, returns facts, closes and preserves theory',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:/주문 04/}).click();await page.getByRole('button',{name:'해답 보기',exact:true}).click();await page.getByRole('button',{name:'조건 확인하기'}).click();await expect(page.getByTestId('learning-progress')).toContainText('이론 통과');
  await page.getByRole('button',{name:'직접 치기 시작',exact:true}).click();const pad=page.getByRole('button',{name:'리듬 탭 패드'});await expect(pad).toBeFocused();
  await pad.press('Space');
  await expect(page.getByRole('heading',{name:'시작 3개 중 0개, 추가 입력 0번'})).toBeVisible({timeout:15000});
  await expect(page.getByText('기기와 입력의 영향을 포함하는 연습용 결과예요.',{exact:false})).toBeVisible();await expect(page.getByTestId('learning-progress')).toContainText('이론 통과');
  await page.getByRole('button',{name:'연습 결과 닫기'}).click();await expect(page.getByRole('button',{name:'직접 치기 시작',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'직접 치기 시작',exact:true}).click();await page.getByRole('button',{name:'연습 정지',exact:true}).click();await expect(page.getByTestId('learning-progress')).toContainText('이론 통과');
});
test('all-rest practice is notApplicable and calibration twelve-click path can reject without erasing progress',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'자유롭게 만들기',exact:true}).click();await page.getByRole('button',{name:'쉼',exact:true}).click();await page.getByTestId('tool-R8').click();await page.getByRole('button',{name:'1박 선택',exact:true}).click();await page.getByRole('button',{name:'앞 반 박 선택',exact:true}).click();
  await page.getByRole('button',{name:'직접 치기 시작',exact:true}).click();await expect(page.getByRole('heading',{name:'이번 마디에는 눌러야 할 소리가 없어요.'})).toBeVisible({timeout:14000});await page.getByRole('button',{name:'연습 결과 닫기'}).click();
  await page.getByText('내 입력 맞춤',{exact:true}).click();await page.getByRole('button',{name:'내 입력 맞춤 시작',exact:true}).click();await expect(page.getByText('입력이 일정하지 않거나 시계 신뢰도가 낮아 새 맞춤값을 적용하지 않았어요.',{exact:false})).toBeVisible({timeout:18000});await page.getByRole('button',{name:'맞춤 결과 닫기'}).click();
});
