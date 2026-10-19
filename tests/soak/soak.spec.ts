import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
type Diagnostics={contexts:number;sources:number;timers:number;intervals:number;listeners:number;longTasks:number;maxLongTaskMs:number};
declare global{interface Window{soakDiagnostics:()=>Diagnostics;}}
test('twenty real minutes of editing, playback, stop and navigation keep resources bounded',async({page,context,browser})=>{
  await page.addInitScript(()=>{
    const sources=new Set<AudioScheduledSourceNode>(),timers=new Set<number>(),intervals=new Set<number>();let contexts=0,longTasks=0,maxLongTaskMs=0;
    const Native=window.AudioContext;class MeasuredContext extends Native{constructor(options?:AudioContextOptions){super(options);contexts++;}createOscillator(){const source=super.createOscillator();sources.add(source);source.addEventListener('ended',()=>sources.delete(source),{once:true});return source;}}window.AudioContext=MeasuredContext;
    const timeout=window.setTimeout.bind(window),clear=window.clearTimeout.bind(window),interval=window.setInterval.bind(window),clearInterval=window.clearInterval.bind(window);
    window.setTimeout=((handler:TimerHandler,delay?:number,...args:unknown[])=>{let id=0;id=timeout(typeof handler==='function'?()=>{timers.delete(id);Reflect.apply(handler,window,args);}:handler,delay);timers.add(id);return id;}) as typeof window.setTimeout;
    window.clearTimeout=((id?:number)=>{if(id!==undefined)timers.delete(id);clear(id);}) as typeof window.clearTimeout;
    window.setInterval=((handler:TimerHandler,delay?:number,...args:unknown[])=>{const id=interval(handler,delay,...args);intervals.add(id);return id;}) as typeof window.setInterval;
    window.clearInterval=((id?:number)=>{if(id!==undefined)intervals.delete(id);clearInterval(id);}) as typeof window.clearInterval;
    const selected=new Set(['visibilitychange','orientationchange','pagehide','statechange','sinkchange','devicechange','pointerup','pointercancel']);
    const listeners=new Map<EventTarget,Map<string,Set<EventListenerOrEventListenerObject>>>();
    const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
    const relevant=(target:EventTarget,type:string)=>selected.has(type)&&(target===window||target===document||target instanceof Native||target===navigator.mediaDevices);
    EventTarget.prototype.addEventListener=function(type,callback,options){if(callback&&relevant(this,type)){const byType=listeners.get(this)??new Map<string,Set<EventListenerOrEventListenerObject>>();listeners.set(this,byType);const set=byType.get(type)??new Set<EventListenerOrEventListenerObject>();byType.set(type,set);set.add(callback);}add.call(this,type,callback,options);};
    EventTarget.prototype.removeEventListener=function(type,callback,options){if(callback&&relevant(this,type))listeners.get(this)?.get(type)?.delete(callback);remove.call(this,type,callback,options);};
    try{new PerformanceObserver(list=>{for(const entry of list.getEntries()){longTasks++;maxLongTaskMs=Math.max(maxLongTaskMs,entry.duration);}}).observe({type:'longtask',buffered:true});}catch{/* Unsupported browsers report no observer samples. */}
    window.soakDiagnostics=()=>({contexts,sources:sources.size,timers:timers.size,intervals:intervals.size,listeners:[...listeners.values()].reduce((total,types)=>total+[...types.values()].reduce((n,set)=>n+set.size,0),0),longTasks,maxLongTaskMs});
  });
  await page.goto('/');await expect(page.getByTestId('offline-status')).toContainText('오프라인 준비 완료',{timeout:20000});const baseline=await page.evaluate(()=>window.soakDiagnostics());const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
  const started=Date.now(),samples:unknown[]=[];let cycle=0,nextSample=0;
  await mkdir('output/qa',{recursive:true});
  while(Date.now()-started<20*60*1000){
    await page.getByRole('button',{name:new RegExp(`주문 0${cycle%6+1}`)}).click();await page.getByRole('button',{name:'해답 보기',exact:true}).click();
    if(cycle%3===0){const undo=page.getByRole('button',{name:'되돌리기',exact:true});if(await undo.isEnabled()){await undo.click();await page.getByRole('button',{name:'다시 하기',exact:true}).click();}}
    await page.getByRole('button',{name:'내 리듬 듣기',exact:true}).click();
    if(cycle%4===0)await expect(page.getByRole('button',{name:'내 리듬 듣기',exact:true})).toBeEnabled({timeout:14000});
    else{await page.waitForTimeout(350);await page.getByRole('button',{name:'정지',exact:true}).click();}
    await page.getByRole('button',{name:'주문 목록',exact:true}).click();await expect(page.getByTestId('storage-status')).toHaveText('이 기기에 저장됨');await page.waitForTimeout(100);
    const diagnostics=await page.evaluate(()=>window.soakDiagnostics());expect(diagnostics.contexts).toBe(1);expect(diagnostics.sources).toBe(0);expect(diagnostics.listeners).toBeLessThanOrEqual(baseline.listeners);expect(diagnostics.timers).toBeLessThanOrEqual(baseline.timers+1);expect(diagnostics.intervals).toBeLessThanOrEqual(baseline.intervals);
    cycle++;
    if(Date.now()-started>=nextSample){await cdp.send('HeapProfiler.collectGarbage');const metrics=await cdp.send('Performance.getMetrics');const heap=metrics.metrics.find(m=>m.name==='JSHeapUsedSize')?.value??0;const sample={elapsedMs:Date.now()-started,cycle,...diagnostics,heapBytes:heap};samples.push(sample);console.log(JSON.stringify(sample));await writeFile('output/qa/soak-progress.json',JSON.stringify({startedAt:new Date(started).toISOString(),baseline,samples},null,2));nextSample+=60000;}
  }
  await cdp.send('HeapProfiler.collectGarbage');const finalMetrics=await cdp.send('Performance.getMetrics');const finalHeap=finalMetrics.metrics.find(m=>m.name==='JSHeapUsedSize')?.value??0;const first=(samples[0] as {heapBytes:number}).heapBytes;
  const result={status:'PASS',durationMs:Date.now()-started,cycles:cycle,browser:browser.version(),environment:'Windows desktop headless Chrome, real clocks, localhost; no human listening or physical device test',baseline,samples,finalHeapBytes:finalHeap,heapGrowthBytes:finalHeap-first,heapBudgetBytes:16*1024*1024,final:await page.evaluate(()=>window.soakDiagnostics())};
  expect(result.durationMs).toBeGreaterThanOrEqual(1200000);expect(finalHeap-first).toBeLessThan(16*1024*1024);await writeFile('output/qa/soak-result.json',JSON.stringify(result,null,2));
});
