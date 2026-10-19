import { test,expect,type Page } from '@playwright/test';
const answers=[['N2','N2','N2','N2'],['N2','N1','N1','N2','N2'],['N2','N2','R2','N2'],['N4','N2','N2'],['N2','R2','N2','N2'],['R1','N1','N2','N1','R1','N2']];
async function pattern(page:Page,tokens:string[]) {
  const clear=page.getByRole('button',{name:'비우기',exact:true});if(await clear.isEnabled())await clear.click();
  let unit=0;
  for(const token of tokens){
    await page.getByRole('button',{name:token[0]==='N'?'소리':'쉼',exact:true}).click();
    await page.getByTestId(`tool-${token}`).click();
    await page.getByRole('button',{name:`${Math.floor(unit/2)+1}박 선택`,exact:true}).click();
    await page.getByRole('button',{name:unit%2?'뒤 반 박 선택':'앞 반 박 선택',exact:true}).click();
    unit+=Number(token.slice(1));
  }
}
async function submit(page:Page,pass=true){await page.getByRole('button',{name:'조건 확인하기',exact:true}).click();await expect(page.getByRole('heading',{name:pass?'이론 통과! 한 마디가 완성됐어요':'한 조각씩 다시 살펴볼까요?'})).toBeVisible();}
test('silent tutorial and all six orders, wrong attempts and explanation independent of progress',async({page})=>{
  await page.addInitScript(()=>{Object.defineProperty(window,'AudioContext',{value:class{constructor(){throw new Error('silent path must not open audio');}},configurable:true});});
  await page.goto('/');await page.getByRole('button',{name:/조립실 시작/}).click();await page.getByRole('button',{name:'소리 없이 시작',exact:true}).click();
  await page.getByRole('button',{name:'첫 박에 4분음표 놓기'}).click();await page.getByRole('button',{name:'다음 시연'}).click();
  await page.getByRole('button',{name:'둘로 나누어 다시 치기'}).click();await expect(page.getByText('총 길이 1박 · 소리 시작 2번')).toBeVisible();await page.getByRole('button',{name:'다음 시연'}).click();
  await page.getByRole('button',{name:'첫 박을 쉼표로 바꾸기'}).click();await page.getByRole('button',{name:'지워서 빈칸과 비교하기'}).click();await expect(page.getByText('첫 박은 미입력: 아직 정하지 않았어요.')).toBeVisible();await page.getByRole('button',{name:'다음 시연'}).click();await page.getByRole('button',{name:'건너뛰고 조립 계속'}).click();
  for(let index=0;index<6;index++){
    await submit(page,false);
    if(index===1){await page.getByRole('button',{name:'2박 선택',exact:true}).click();await page.getByRole('button',{name:'앞 반 박 선택',exact:true}).click();await page.getByRole('button',{name:'두 소리로 나누기'}).click();}
    else await pattern(page,answers[index]);
    if(index===5)await page.getByRole('button',{name:'모델 기호 보기'}).click();
    await submit(page);
    await page.getByRole('region',{name:'개념 설명'}).getByRole('button').first().click();
    await expect(page.getByTestId('learning-progress')).toContainText('이론 통과');
    if(index<5)await page.getByRole('button',{name:'다음 주문 열기 →'}).click();
  }
  await expect(page.getByTestId('learning-progress')).toContainText('시각 대안으로 조립');
  await page.getByRole('button',{name:'주문 목록',exact:true}).click();await expect(page.getByText('6 / 6 이론 통과',{exact:true})).toBeVisible();
  await expect(page.getByTestId('storage-status')).toHaveText('이 기기에 저장됨');await page.reload();await expect(page.getByText('6 / 6 이론 통과',{exact:true})).toBeVisible();
});
test('all L4 and L5 alternatives retain unique semantic discoveries',async({page})=>{
  await page.goto('/');
  for(const [order,patterns] of [[4,[['N4','N2','N2'],['N2','N4','N2'],['N2','N2','N4']]],[5,[['N2','R2','N2','N2'],['N2','N2','N2','R2']]]] as const){
    await page.getByRole('button',{name:new RegExp(`주문 0${order}`)}).click();
    for(let i=0;i<patterns.length;i++){await pattern(page,[...patterns[i]]);await submit(page);await expect(page.getByTestId('learning-progress')).toContainText(`발견한 답 ${i+1}`);}
    await submit(page);await expect(page.getByTestId('learning-progress')).toContainText(`발견한 답 ${patterns.length}`);
    await page.getByRole('button',{name:'주문 목록',exact:true}).click();
  }
});
test('L6 equal onsets wrong sustain fails; visual help and solution disclosure remain distinct',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:/주문 06/}).click();await pattern(page,['R1','N1','N2','N2','N2']);await submit(page,false);await expect(page.getByRole('status',{name:'조건 확인 결과'})).toContainText('소리가 이어지는 길이');
  await page.getByRole('button',{name:'모델 기호 보기'}).click();await page.getByRole('button',{name:'해답 보기',exact:true}).click();await submit(page);
  await expect(page.getByTestId('learning-progress')).toContainText('해답 확인');await expect(page.getByTestId('learning-progress')).toContainText('시각 대안');
  await page.getByRole('button',{name:'되돌리기',exact:true}).click();await submit(page,false);
});
test('hinted completion and free all-rest, gap and frozen A remain honest',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:/주문 01/}).click();await page.getByRole('button',{name:'힌트 하나 더 보기'}).click();await pattern(page,answers[0]);await submit(page);await expect(page.getByTestId('learning-progress')).toContainText('힌트 사용');
  await page.getByRole('button',{name:'주문 목록',exact:true}).click();await page.getByRole('button',{name:'자유롭게 만들기',exact:true}).click();
  await pattern(page,['R8']);await page.getByRole('button',{name:'한 마디 확인하기',exact:true}).click();await expect(page.getByText('소리가 없는 한 마디예요. 이번 마디에는 눌러야 할 소리가 없어요.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'현재 조립을 A로 보관하기'}).click();await pattern(page,['N2']);
  await expect(page.getByRole('region',{name:'리듬 비교'}).locator('.comparison-columns>div').first()).toContainText('쉼 4박');
  await page.getByRole('button',{name:'한 마디 확인하기',exact:true}).click();await expect(page.getByText('아직 3박이 미입력이에요. 소리나 쉼으로 채워 보세요.',{exact:true})).toBeVisible();
});
