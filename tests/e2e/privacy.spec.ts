import {test,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';

test('practice and backup keep raw input local and request no capture permissions or remote endpoint',async({page,context,browser},testInfo)=>{
  const requests:{url:string;method:string}[]=[];
  context.on('request',request=>requests.push({url:request.url(),method:request.method()}));
  await page.addInitScript(()=>{
    const counters={capture:0,beacon:0};
    Object.assign(window,{privacyCounters:counters});
    if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=async()=>{counters.capture++;throw new Error('Capture must never be requested');};
    navigator.sendBeacon=()=>{counters.beacon++;return false;};
  });
  await page.goto('/');await expect(page.getByTestId('offline-status')).toContainText('오프라인 준비 완료',{timeout:20000});
  await page.getByRole('button',{name:/주문 04/}).click();await page.getByRole('button',{name:'해답 보기',exact:true}).click();await page.getByRole('button',{name:'조건 확인하기'}).click();
  await page.getByRole('button',{name:'직접 치기 시작',exact:true}).click();await page.waitForTimeout(3800);await page.getByRole('button',{name:'리듬 탭 패드'}).press('Space');
  await expect(page.getByRole('button',{name:'연습 결과 닫기'})).toBeVisible({timeout:12000});await page.getByRole('button',{name:'연습 결과 닫기'}).click();
  await page.getByText('작품 보관함 · 백업과 가져오기',{exact:true}).click();await page.getByRole('button',{name:'지금 저장',exact:true}).click();await expect(page.getByTestId('storage-status')).toHaveText('이 기기에 저장됨');
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'JSON 백업 내보내기',exact:true}).click();const download=await pending;const backup=JSON.parse(await readFile((await download.path())!,'utf8')) as unknown;
  const persisted=await page.evaluate(()=>new Promise<Record<string,unknown[]>>((resolve,reject)=>{
    const request=indexedDB.open('one-measure-workshop-v1',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{
      const db=request.result,names=[...db.objectStoreNames],values:Record<string,unknown[]>={},tx=db.transaction(names,'readonly');
      for(const name of names){const query=tx.objectStore(name).getAll();query.onsuccess=()=>{values[name]=query.result;};}
      tx.oncomplete=()=>{db.close();resolve(values);};tx.onabort=()=>reject(tx.error);
    };
  }));
  const forbidden=new Set(['rawTapsMs','rawInputsMs','inputBounds','timestampMs','targetsMs','tapDetail','performanceResult','inputTimes','expectedTimes']);
  function check(value:unknown){if(value&&typeof value==='object')for(const [key,nested]of Object.entries(value)){expect(forbidden.has(key),`persisted raw input key: ${key}`).toBe(false);check(nested);}}
  check(backup);check(persisted);
  // Edge emits its own edge://downloads-hub resources after a download. Those are browser UI, not network transfers.
  const browserInternal=requests.filter(r=>['edge:','chrome:'].includes(new URL(r.url).protocol));
  const network=requests.filter(r=>!browserInternal.includes(r));
  const origin=new URL(page.url()).origin,external=network.filter(r=>new URL(r.url).origin!==origin),mutations=network.filter(r=>r.method!=='GET');
  const counters=await page.evaluate(()=>Reflect.get(window,'privacyCounters') as {capture:number;beacon:number});
  expect(external).toEqual([]);expect(mutations).toEqual([]);expect(counters).toEqual({capture:0,beacon:0});expect(await context.cookies()).toEqual([]);
  const evidence=JSON.stringify({status:'PASS',browser:browser.version(),scope:'Observed production-browser practice, close, save and export; network requests are static same-origin GET. Browser internal chrome:/edge: download UI resources are counted separately. This does not audit hosting access logs.',networkRequests:network.length,browserInternalRequests:browserInternal.length,externalRequests:external.length,nonGetRequests:mutations.length,counters,cookies:0,persistedStores:Object.keys(persisted),rawInputKeysInDatabaseOrBackup:0},null,2);
  await mkdir('output/qa',{recursive:true});await writeFile('output/qa/privacy.json',evidence);await writeFile(`output/qa/privacy-${testInfo.project.name}.json`,evidence);
});
