import {LocalDatabase,LEASE_RENEWAL_MS,type Snapshot} from './db';
import {emptyData,parseAppData,type AppData} from './schema';
import {notifyOtherTabs} from './writerLease';
export const SAVE_DEBOUNCE_MS=300,CHECKPOINT_MS=2000;
export type StorageStatus={mode:'loading'|'writer'|'readonly'|'session';save:'clean'|'pending'|'saving'|'failed';error?:string;recovery?:Snapshot};
export class StorageController{
  data=emptyData();revision=0;status:StorageStatus={mode:'loading',save:'clean'};
  private seq=0;private savedSeq=0;private chain:Promise<boolean>=Promise.resolve(true);private debounce?:ReturnType<typeof setTimeout>;private checkpoint?:ReturnType<typeof setTimeout>;private heartbeat?:ReturnType<typeof setInterval>;private closed=false;
  private channel?:ReturnType<typeof notifyOtherTabs>;
  constructor(readonly db:LocalDatabase,private onChange:(status:StorageStatus)=>void=()=>undefined){}
  private emit(patch:Partial<StorageStatus>){this.status={...this.status,...patch};this.onChange({...this.status});}
  async start(){try{await this.db.open();const loaded=await this.db.load();this.revision=loaded.revision;this.data=loaded.current?.data??emptyData();const writer=await this.db.acquire();this.emit({mode:writer?'writer':'readonly',save:loaded.corrupt?'failed':'clean',error:loaded.corrupt?'저장본을 읽지 못했어요. 원본을 보존하고 이전 저장본을 복구할 수 있어요.':undefined,recovery:loaded.corrupt?loaded.previous:undefined});
    if(!this.closed){this.channel=notifyOtherTabs(()=>{void this.checkLease();});this.heartbeat=setInterval(()=>{void this.checkLease();},LEASE_RENEWAL_MS);}
    return this.data;
  }catch(error){this.emit({mode:'session',save:'failed',error:`이 브라우저에 저장할 수 없어 세션 모드로 사용해요. JSON 백업을 내려받아 주세요. (${error instanceof Error?error.name:'unavailable'})`});return this.data;}}
  private async checkLease(){if(this.status.mode!=='writer'||this.closed)return;try{await this.db.renew();}catch{this.emit({mode:'readonly',save:'failed',error:'다른 탭이 편집 권한을 가져갔어요. 이 탭의 초안은 메모리에 남아 있고 JSON으로 보관할 수 있어요.'});}}
  request(input:AppData,immediate=false){this.data=parseAppData(input);this.seq++;this.emit({save:'pending'});clearTimeout(this.debounce);if(immediate){void this.flush();return;}this.debounce=setTimeout(()=>{void this.flush();},SAVE_DEBOUNCE_MS);this.checkpoint??=setTimeout(()=>{void this.flush();},CHECKPOINT_MS);}
  flush():Promise<boolean>{
    clearTimeout(this.debounce);clearTimeout(this.checkpoint);this.debounce=undefined;this.checkpoint=undefined;
    const seq=this.seq,data=structuredClone(this.data);
    this.chain=this.chain.catch(()=>false).then(async()=>{
      if(seq<=this.savedSeq&&this.status.save==='clean')return true;
      if(this.status.mode!=='writer'||this.status.recovery){this.emit({save:'failed',error:this.status.error??'저장 권한이 없어요. 현재 초안은 JSON으로 보관할 수 있어요.'});return false;}
      this.emit({save:'saving'});
      try{const snapshot=await this.db.commit(data,this.revision);this.revision=snapshot.revision;this.savedSeq=seq;this.emit({save:this.seq===seq?'clean':'pending',error:undefined});return true;}
      catch(error){const reason=error instanceof Error?error.message:String(error);this.emit({save:'failed',...(/leaseLost|revisionConflict/.test(reason)?{mode:'readonly' as const}:{}),error:`저장하지 못했어요 (${reason}). 조립은 메모리에 남아 있어요. JSON 백업을 내려받을 수 있어요.`});return false;}
    });return this.chain;
  }
  async takeOver(){await this.chain;const memory=structuredClone(this.data);await this.db.acquire(true);const loaded=await this.db.load();this.revision=loaded.revision;this.data=loaded.current?.data??emptyData();this.seq++;this.savedSeq=this.seq;this.emit({mode:'writer',save:loaded.corrupt?'failed':'clean',recovery:loaded.corrupt?loaded.previous:undefined,error:loaded.corrupt?'저장본 복구를 선택해 주세요.':undefined});this.channel?.notify();return {data:this.data,preservedMemory:memory};}
  async restore(){await this.chain;const previous=this.status.recovery;if(!previous)throw new Error('No valid previous snapshot');const saved=await this.db.commit(previous.data,this.revision,true);this.data=saved.data;this.revision=saved.revision;this.seq++;this.savedSeq=this.seq;this.emit({save:'clean',error:undefined,recovery:undefined});return this.data;}
  async apply(input:AppData){this.request(input);const okay=await this.flush();if(!okay)throw new Error(this.status.error);return this.data;}
  async erase(){await this.chain;const snapshot=await this.db.eraseAll(this.revision);this.data=snapshot.data;this.revision=0;this.seq++;this.savedSeq=this.seq;this.emit({save:'clean',error:undefined,recovery:undefined});return this.data;}
  async close(){this.closed=true;clearTimeout(this.debounce);clearTimeout(this.checkpoint);clearInterval(this.heartbeat);this.channel?.close();await this.chain;await this.db.close();}
}
