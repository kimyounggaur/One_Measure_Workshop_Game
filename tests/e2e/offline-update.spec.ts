import {test,expect,type Page} from '@playwright/test';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
const fixturePath=resolve('dist/sw-fixture.js');
async function ready(page:Page){await expect(page.getByTestId('offline-status')).toContainText('오프라인 준비 완료',{timeout:20000});await page.evaluate(()=>navigator.serviceWorker.ready);}
async function editLease(page:Page){if(await page.getByRole('button',{name:'여기서 편집하기',exact:true}).isVisible())await page.getByRole('button',{name:'여기서 편집하기',exact:true}).click();}
async function variant(id:string,missing=false,mismatch=false){let script=await readFile(resolve('dist/sw.js'),'utf8');const line=script.match(/const MANIFEST=(.*);/);if(!line)throw new Error('No manifest');const manifest=JSON.parse(line[1]);manifest.buildId=id;if(missing)manifest.files[0].url='/missing-required-file.svg';if(mismatch)manifest.contentVersion='future';script=script.replace(line[0],`const MANIFEST=${JSON.stringify(manifest)};`);await writeFile(fixturePath,script);}
test.afterEach(async()=>{await unlink(fixturePath).catch(()=>undefined);});
test('production cache supports offline six orders, free synthesis, save and JSON export/import',async({context,page})=>{
  await page.goto('/');await ready(page);await context.setOffline(true);await page.reload();await expect(page.getByTestId('offline-status')).toContainText('현재 오프라인');await editLease(page);
  for(let index=1;index<=6;index++){await page.getByRole('button',{name:new RegExp(`주문 0${index}`)}).click();await expect(page.getByRole('button',{name:'조건 확인하기'})).toBeVisible();await page.getByRole('button',{name:'주문 목록',exact:true}).click();}
  await page.getByRole('button',{name:'자유롭게 만들기',exact:true}).click();await page.getByTestId('tool-N8').click();await page.getByRole('button',{name:'1박 선택',exact:true}).click();await page.getByRole('button',{name:'앞 반 박 선택',exact:true}).click();await page.getByRole('button',{name:'내 리듬 듣기',exact:true}).click();await page.getByRole('button',{name:'정지',exact:true}).click();await expect(page.getByTestId('storage-status')).toHaveText('이 기기에 저장됨');
  await page.getByText('작품 보관함 · 백업과 가져오기',{exact:true}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'JSON 백업 내보내기'}).click();const file=await (await download).path();await page.getByLabel('JSON 백업 파일 선택').setInputFiles(file!);await expect(page.getByRole('heading',{name:'가져오기 미리보기'})).toBeVisible();
});
test('failed v2 required file and content mismatch keep v1 cache and DB intact',async({page})=>{
  await page.goto('/');await ready(page);const original=await page.evaluate(()=>caches.keys());
  for(const [id,missing,mismatch]of [['failed-v2',true,false],['mismatch-v3',false,true]] as const){await variant(id,missing,mismatch);await page.evaluate(async()=>{try{const reg=await navigator.serviceWorker.register('/sw-fixture.js',{scope:'/',updateViaCache:'none'});const worker=reg.installing;if(worker)await new Promise<void>(resolve=>worker.addEventListener('statechange',()=>{if(['redundant','installed'].includes(worker.state))resolve();}));}catch{/* Expected failed install. */}});expect(await page.evaluate(()=>caches.keys())).toEqual(original);}
  await expect(page.getByTestId('offline-status')).toContainText('오프라인 준비 완료');await expect(page.getByRole('button',{name:/주문 01/})).toBeEnabled();
});
test('waiting update never reloads playback; old cache kept without new build ACK',async({page})=>{
  await page.goto('/');await ready(page);await page.getByRole('button',{name:/주문 01/}).click();await page.getByRole('button',{name:'해답 보기',exact:true}).click();await page.getByRole('button',{name:'내 리듬 듣기',exact:true}).click();
  await variant('test-v2');await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw-fixture.js',{scope:'/',updateViaCache:'none'});});
  await expect.poll(()=>page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(true);
  await expect(page.getByRole('heading',{name:'네 박의 선반',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'새 버전 적용'})).toHaveCount(0);
  const cachesBefore=await page.evaluate(()=>caches.keys());expect(cachesBefore.length).toBe(2);
  const before=await page.evaluate(()=>new Promise<unknown>(resolve=>{const r=indexedDB.open('one-measure-workshop-v1');r.onsuccess=()=>{const q=r.result.transaction('drafts').objectStore('drafts').get('current');q.onsuccess=()=>{r.result.close();resolve(q.result);};};}));
  await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();r?.waiting?.postMessage({type:'APPLY',buildId:'test-v2'});});await expect.poll(()=>page.evaluate(()=>navigator.serviceWorker.controller?.scriptURL)).toContain('sw-fixture.js');expect(await page.evaluate(()=>caches.keys())).toEqual(cachesBefore);
  const after=await page.evaluate(()=>new Promise<unknown>(resolve=>{const r=indexedDB.open('one-measure-workshop-v1');r.onsuccess=()=>{const q=r.result.transaction('drafts').objectStore('drafts').get('current');q.onsuccess=()=>{r.result.close();resolve(q.result);};};}));expect(after).toEqual(before);
  await page.evaluate(()=>navigator.serviceWorker.controller?.postMessage({type:'APP_READY',buildId:'test-v2',contentVersion:'1'}));await expect.poll(()=>page.evaluate(()=>caches.keys())).toEqual(['one-measure-cache-test-v2']);
  const preserved=await page.evaluate(()=>new Promise<unknown>(resolve=>{const r=indexedDB.open('one-measure-workshop-v1');r.onsuccess=()=>{const q=r.result.transaction('drafts').objectStore('drafts').get('current');q.onsuccess=()=>{r.result.close();resolve(q.result);};};}));expect(preserved).toEqual(before);
});
test('fresh uncached browser offline cannot load the application',async({context,page})=>{await context.setOffline(true);await expect(page.goto('/')).rejects.toThrow();});
test('one missing initial required asset never announces offline ready',async({page})=>{
  const original=await readFile(resolve('dist/sw.js'),'utf8');await variant('initial-failure',true);const broken=await readFile(fixturePath,'utf8');
  try{await writeFile(resolve('dist/sw.js'),broken);await page.goto('/');await expect(page.getByText('오프라인 파일 준비를 완료하지 못했어요. 현재 저장본은 유지해요.',{exact:true})).toBeVisible({timeout:15000});await expect(page.getByTestId('offline-status')).toContainText('오프라인 준비 전');expect(await page.evaluate(()=>caches.keys())).toEqual([]);}finally{await writeFile(resolve('dist/sw.js'),original);}
});
