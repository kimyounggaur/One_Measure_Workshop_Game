import {afterEach,it,expect,vi} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {LocalDatabase,LEASE_DURATION_MS} from '../../src/persistence/db';
import {StorageController,CHECKPOINT_MS} from '../../src/persistence/controller';
import {emptyData,type AppData} from '../../src/persistence/schema';
import {createDocument,eventsFromTokens} from '../../src/domain/rhythm';
const opened:LocalDatabase[]=[];
async function setup(owner='A',factory=new IDBFactory(),clock=()=>1000){const db=new LocalDatabase(owner,factory,clock);opened.push(db);await db.open();await db.acquire();return db;}
afterEach(async()=>{vi.useRealTimers();await Promise.all(opened.splice(0).map(db=>db.close()));});
const data=(revision=0):AppData=>{const value=emptyData();value.drafts.free={...createDocument(eventsFromTokens(['N2']),'free'),revision};return value;};
it('commit, readback, previousGood and late older revision rejection are atomic',async()=>{
  const db=await setup();expect((await db.commit(data(9),0)).revision).toBe(1);await db.commit(data(10),1);
  await expect(db.commit(data(9),1)).rejects.toThrow('revisionConflict');const saved=await db.load();expect(saved.current?.data.drafts.free.revision).toBe(10);expect(saved.previous?.data.drafts.free.revision).toBe(9);
});
it('simultaneous leases have one writer, expired A cannot write or recover after B acquires',async()=>{
  const factory=new IDBFactory();let now=0;const a=new LocalDatabase('A',factory,()=>now),b=new LocalDatabase('B',factory,()=>now);opened.push(a,b);await Promise.all([a.open(),b.open()]);const results=await Promise.all([a.acquire(),b.acquire()]);expect(results.filter(Boolean)).toHaveLength(1);const first=results[0]?a:b,second=results[0]?b:a;await first.commit(data(),0);now=LEASE_DURATION_MS+1;expect(await second.acquire()).toBe(true);expect(second.lease!.fencingToken).toBe(first.lease!.fencingToken+1);await expect(first.commit(data(1),1)).rejects.toThrow('leaseLost');await expect(first.commit(data(1),1,true)).rejects.toThrow('leaseLost');
});
it('corrupt current is never promoted; explicit recovery preserves raw original',async()=>{
  const factory=new IDBFactory(),db=await setup('A',factory);await db.commit(data(1),0);await db.commit(data(2),1);
  const external=await new Promise<IDBDatabase>((resolve,reject)=>{const r=factory.open(db.name,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise<void>((resolve,reject)=>{const tx=external.transaction('drafts','readwrite');tx.objectStore('drafts').put({free:{broken:true}},'current');tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});
  const loaded=await db.load();expect(loaded.corrupt).toBe(true);expect(loaded.previous?.data.drafts.free.revision).toBe(1);await expect(db.commit(data(3),2)).rejects.toThrow('recoveryRequired');
  await db.commit(loaded.previous!.data,2,true);expect((await db.load()).current?.data.drafts.free.revision).toBe(1);
  const recovered=await new Promise<unknown[]>((resolve,reject)=>{const tx=external.transaction('metadata','readonly');const r=tx.objectStore('metadata').getAllKeys();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});expect(recovered.some(key=>String(key).startsWith('recovery:'))).toBe(true);external.close();
});
it.each(['QuotaExceededError','AbortError','readbackMismatch'])('failure %s stays dirty and retains memory/export data',async reason=>{
  const db=new LocalDatabase('A',new IDBFactory(),()=>1000);opened.push(db);const controller=new StorageController(db);await controller.start();vi.spyOn(db,'commit').mockRejectedValueOnce(new Error(reason));controller.request(data(5));expect(await controller.flush()).toBe(false);expect(controller.status.save).toBe('failed');expect(controller.data.drafts.free.revision).toBe(5);await controller.close();
});
it('debounce/checkpoint and serialized requests do not let a late saved callback clear newer work',async()=>{
  const db=new LocalDatabase('A',new IDBFactory(),()=>1000);opened.push(db);const controller=new StorageController(db);await controller.start();let resolveFirst:((snapshot:{revision:number;data:AppData})=>void)|undefined;
  const commit=vi.spyOn(db,'commit').mockImplementationOnce(()=>new Promise(resolve=>{resolveFirst=resolve;}));controller.request(data(9));const first=controller.flush();await vi.waitFor(()=>expect(resolveFirst).toBeTypeOf('function'));controller.request(data(10));resolveFirst!({revision:1,data:data(9)});await first;expect(controller.status.save).toBe('pending');
  commit.mockResolvedValueOnce({revision:2,data:data(10)});expect(await controller.flush()).toBe(true);expect(controller.status.save).toBe('clean');expect(commit.mock.calls.map(call=>call[0].drafts.free.revision)).toEqual([9,10]);await controller.close();
});
it('continuous edits still checkpoint by 2 seconds',async()=>{
  const db=new LocalDatabase('A',new IDBFactory(),()=>1000);opened.push(db);const c=new StorageController(db);await c.start();vi.useFakeTimers();const commit=vi.spyOn(db,'commit').mockImplementation(async input=>({revision:1,data:input}));for(let n=0;n<10;n++){c.request(data(n));await vi.advanceTimersByTimeAsync(200);}expect(commit).toHaveBeenCalled();expect(CHECKPOINT_MS).toBe(2000);vi.useRealTimers();await c.close();
});
