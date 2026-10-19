import {test,expect} from '@playwright/test';
test('diagnostic can be declined or stopped; answers are only revealed after submit and theory stays independent',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'내가 아는 것 확인하기'}).click();await expect(page.getByText('2+1+1=4박이에요. 조각 수와 시간의 합은 달라요.',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'확인 중단하고 학습 계속'}).click();await expect(page.getByRole('button',{name:/주문 06/})).toBeEnabled();
  await page.getByRole('button',{name:'내가 아는 것 확인하기'}).click();for(let i=0;i<4;i++){await page.getByRole('radio').first().check();await page.getByRole('button',{name:'내 답 제출',exact:true}).click();if(i===3){await expect(page.getByText('글 설명은 자동 채점하지 않아요.',{exact:false})).toBeVisible();await page.getByRole('button',{name:'기록하고 학습 계속'}).click();}else await page.getByRole('button',{name:'다음 문항',exact:true}).click();}
  await expect(page.getByText('0 / 6 이론 통과',{exact:true})).toBeVisible();await page.getByText('내 확인 기록 (1)',{exact:true}).click();await expect(page.getByText('T4: 선택 다시 보기 · 설명 자기 확인 전',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'선택 재확인'})).toHaveCount(0);
});
test('transfer accepts an alternative T7 construction and records self review without a combined ability score',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'새 문제로 확인하기'}).click();
  for(let i=0;i<4;i++){
    if(i===2){for(const name of ['8분음표 더하기','4분음표 더하기','4분쉼표 더하기','8분음표 더하기','4분음표 더하기'])await page.getByRole('button',{name,exact:true}).click();}
    else await page.getByRole('radio').last().check();
    await page.getByRole('button',{name:'내 답 제출',exact:true}).click();if(i===2)await expect(page.getByText('길이 1점 · 재료 1점 · 첫 소리 1점',{exact:true})).toBeVisible();if(i>0)await page.getByRole('button',{name:'내 설명 1점으로 확인',exact:true}).click();await page.getByRole('button',{name:i===3?'기록하고 학습 계속':'다음 문항',exact:true}).click();
  }
  await expect(page.getByText('내 확인 기록 (1)',{exact:true})).toBeVisible();await expect(page.getByText('0 / 6 이론 통과',{exact:true})).toBeVisible();await expect(page.getByTestId('storage-status')).toHaveText('이 기기에 저장됨');
});
