import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

test('public production alias serves the verified build and six orders, audio, storage and offline reload work',async({page,context,browser,request})=>{
  const errors:string[]=[],failed:string[]=[],external:string[]=[];
  const origin=new URL(process.env.DEPLOYMENT_URL!).origin;
  page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.status()>=400)failed.push(`${response.status()} ${response.url()}`);});
  context.on('request',req=>{if(new URL(req.url()).origin!==origin)external.push(req.url());});
  const metadataResponse=await request.get('/build-meta.json');expect(metadataResponse.status()).toBe(200);const metadata=await metadataResponse.json();expect(metadata.buildId).toBe(process.env.EXPECTED_BUILD_ID);expect(metadata.appVersion).toBe('1.0.0');
  const license=await request.get('/THIRD_PARTY_NOTICES.txt');expect(license.status()).toBe(200);expect(await license.text()).toContain('scheduler 0.28.0');
  const response=await page.goto('/');expect(response?.status()).toBe(200);await expect(page.getByRole('heading',{name:'한 마디 조립실',exact:true})).toBeVisible();await expect(page.getByTestId('offline-status')).toContainText('오프라인 준비 완료',{timeout:30000});
  await mkdir('output/qa',{recursive:true});await mkdir('output/playwright',{recursive:true});await page.screenshot({path:'output/playwright/production-home-390.png',fullPage:true});
  for(let i=1;i<=6;i++){
    await page.getByRole('button',{name:new RegExp(`주문 0${i}`)}).click();await page.getByRole('button',{name:'해답 보기',exact:true}).click();await page.getByRole('button',{name:'조건 확인하기'}).click();await expect(page.getByTestId('learning-progress')).toContainText('이론 통과');
    if(i===3){await page.getByRole('button',{name:'내 리듬 듣기',exact:true}).click();await expect(page.locator('.count-in-display')).toContainText('준비');await page.getByRole('button',{name:'정지',exact:true}).click();await page.screenshot({path:'output/playwright/production-l3-390.png',fullPage:true});}
    await page.getByRole('button',{name:'주문 목록',exact:true}).click();
  }
  await expect(page.getByText('6 / 6 이론 통과',{exact:true})).toBeVisible();await expect(page.getByTestId('storage-status')).toHaveText('이 기기에 저장됨');
  await context.setOffline(true);await page.reload();await expect(page.getByText('6 / 6 이론 통과',{exact:true})).toBeVisible();
  if(await page.getByRole('button',{name:'여기서 편집하기',exact:true}).isVisible())await page.getByRole('button',{name:'여기서 편집하기',exact:true}).click();
  await page.getByRole('button',{name:'자유롭게 만들기',exact:true}).click();await expect(page.getByTestId('tool-N2')).toBeEnabled();await page.getByText('작품 보관함 · 백업과 가져오기',{exact:true}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'JSON 백업 내보내기',exact:true}).click();expect((await download).suggestedFilename()).toMatch(/^one-measure-backup-/);
  expect(errors).toEqual([]);expect(failed).toEqual([]);expect(external).toEqual([]);
  await writeFile('output/qa/production.json',JSON.stringify({status:'PASS',checkedAt:new Date().toISOString(),url:origin,metadata,browser:browser.version(),viewport:'390x844 CSS px',sixOrdersPassed:true,gestureAudioStartStop:true,persistedProgressReload:true,offlineReloadAndExport:true,pageErrors:errors,failedResponses:failed,externalRequests:external,manualListening:'NOT_RUN',physicalDevice:'NOT_RUN'},null,2));
});
