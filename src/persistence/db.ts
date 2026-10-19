import {APP_VERSION,emptyData,parseAppData,type AppData} from './schema';
export const DB_NAME='one-measure-workshop-v1';
export const STORES=['settings','drafts','progress','compositions','metadata'] as const;
export type Lease={ownerId:string;fencingToken:number;expiresAtMs:number};
export const LEASE_DURATION_MS=15000,LEASE_RENEWAL_MS=5000;
export type Envelope={schemaVersion:1;appRevision:number;appVersion:string;committedAt:string};
export type Snapshot={revision:number;data:AppData};
type Raw=Record<typeof STORES[number],unknown>;
export const req=<T>(request:IDBRequest<T>):Promise<T>=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
function completion(tx:IDBTransaction){return new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new Error('AbortError'));tx.onerror=()=>undefined;});}
async function readRaw(tx:IDBTransaction,slot:string):Promise<Raw>{const values=await Promise.all(STORES.map(name=>req(tx.objectStore(name).get(slot))));return Object.fromEntries(STORES.map((name,i)=>[name,values[i]])) as Raw;}
function parseRaw(raw:Raw):Snapshot|undefined{
  if(STORES.every(name=>raw[name]===undefined))return undefined;
  const e=raw.metadata as Envelope;if(!e||e.schemaVersion!==1||!Number.isSafeInteger(e.appRevision)||e.appRevision<0)throw new Error('Corrupt metadata');
  return {revision:e.appRevision,data:parseAppData({settings:raw.settings,drafts:raw.drafts,progress:raw.progress,compositions:raw.compositions})};
}
export class LocalDatabase{
  private db?:IDBDatabase;lease?:Lease;
  constructor(readonly ownerId:string=crypto.randomUUID(),private readonly factory:IDBFactory=indexedDB,private readonly now=()=>Date.now(),readonly name=DB_NAME){}
  async open(){const opening=this.factory.open(this.name,1);opening.onupgradeneeded=()=>{for(const name of STORES)if(!opening.result.objectStoreNames.contains(name))opening.result.createObjectStore(name);};this.db=await req(opening);this.db.onversionchange=()=>{this.db?.close();this.lease=undefined;};}
  private transaction(mode:IDBTransactionMode){if(!this.db)throw new Error('Storage unavailable');return this.db.transaction([...STORES],mode);}
  async load():Promise<{current?:Snapshot;previous?:Snapshot;corrupt:boolean;revision:number}>{const tx=this.transaction('readonly'),done=completion(tx);const [raw,previousRaw]=await Promise.all([readRaw(tx,'current'),readRaw(tx,'previousGood')]);await done;let current:Snapshot|undefined,previous:Snapshot|undefined,corrupt=false;try{current=parseRaw(raw);}catch{corrupt=true;}try{previous=parseRaw(previousRaw);}catch{/* Keep raw data for recovery export. */}const revision=Number((raw.metadata as Envelope|undefined)?.appRevision);return {current,previous,corrupt,revision:Number.isSafeInteger(revision)&&revision>=0?revision:0};}
  async acquire(takeover=false):Promise<boolean>{const tx=this.transaction('readwrite'),done=completion(tx);try{const store=tx.objectStore('metadata');const prior=await req(store.get('lease')) as Lease|undefined;const now=this.now();if(prior&&prior.ownerId!==this.ownerId&&prior.expiresAtMs>now&&!takeover){await done;return false;}const token=(prior?.fencingToken??0)+1;this.lease={ownerId:this.ownerId,fencingToken:token,expiresAtMs:now+LEASE_DURATION_MS};store.put(this.lease,'lease');await done;return true;}catch(error){tx.abort();await done.catch(()=>undefined);throw error;}}
  private async checkFence(tx:IDBTransaction){const live=await req(tx.objectStore('metadata').get('lease')) as Lease|undefined;if(!this.lease||!live||live.ownerId!==this.ownerId||live.fencingToken!==this.lease.fencingToken||live.expiresAtMs<=this.now())throw new Error('leaseLost');return live;}
  async renew(){const tx=this.transaction('readwrite'),done=completion(tx);try{const lease=await this.checkFence(tx);lease.expiresAtMs=this.now()+LEASE_DURATION_MS;tx.objectStore('metadata').put(lease,'lease');await done;this.lease=lease;}catch(error){try{tx.abort();}catch{/* Transaction already finished. */}await done.catch(()=>undefined);this.lease=undefined;throw error;}}
  async commit(input:AppData,baseRevision:number,restore=false):Promise<Snapshot>{
    const data=parseAppData(input);const tx=this.transaction('readwrite'),done=completion(tx);let revision=baseRevision+1;
    try{
      await this.checkFence(tx);const raw=await readRaw(tx,'current');let current:Snapshot|undefined;try{current=parseRaw(raw);}catch{if(!restore)throw new Error('recoveryRequired');}
      const rawRevision=Number((raw.metadata as Envelope|undefined)?.appRevision);const actualRevision=current?.revision??(Number.isSafeInteger(rawRevision)&&rawRevision>=0?rawRevision:0);
      if(actualRevision!==baseRevision)throw new Error('revisionConflict');revision=actualRevision+1;
      if(restore)tx.objectStore('metadata').put(raw,`recovery:${this.now()}:${crypto.randomUUID()}`);
      if(current)for(const name of STORES)tx.objectStore(name).put(raw[name],'previousGood');
      for(const name of STORES)if(name!=='metadata')tx.objectStore(name).put(data[name],'current');
      tx.objectStore('metadata').put({schemaVersion:1,appRevision:revision,appVersion:APP_VERSION,committedAt:new Date(this.now()).toISOString()} satisfies Envelope,'current');
      await done;
    }catch(error){try{tx.abort();}catch{/* A committed transaction cannot be aborted. */}await done.catch(()=>undefined);throw error;}
    const loaded=await this.load();if(!loaded.current||loaded.current.revision!==revision||JSON.stringify(loaded.current.data)!==JSON.stringify(data))throw new Error('readbackMismatch');
    // A takeover between commit and readback must not produce a clean receipt.
    const check=this.transaction('readonly'),checked=completion(check);try{await this.checkFence(check);await checked;}catch(error){await checked.catch(()=>undefined);throw error;}
    return loaded.current;
  }
  async rawRecovery(){const tx=this.transaction('readonly'),done=completion(tx);const raw=await readRaw(tx,'current');await done;return raw;}
  async eraseAll(baseRevision:number){const tx=this.transaction('readwrite'),done=completion(tx);try{await this.checkFence(tx);const raw=await readRaw(tx,'current');if((parseRaw(raw)?.revision??0)!==baseRevision)throw new Error('revisionConflict');for(const name of STORES)tx.objectStore(name).clear();tx.objectStore('metadata').put(this.lease,'lease');await done;}catch(error){try{tx.abort();}catch{/* Complete. */}await done.catch(()=>undefined);throw error;}return {revision:0,data:emptyData()};}
  async close(){if(!this.db)return;const tx=this.transaction('readwrite'),done=completion(tx);try{const live=await req(tx.objectStore('metadata').get('lease')) as Lease|undefined;if(live?.ownerId===this.ownerId&&live.fencingToken===this.lease?.fencingToken)tx.objectStore('metadata').put({...live,expiresAtMs:0},'lease');await done;}finally{this.db.close();this.db=undefined;this.lease=undefined;}}
}
