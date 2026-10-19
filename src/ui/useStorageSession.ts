import {useEffect,useRef,useState,type Dispatch,type RefObject} from 'react';
import type {SessionState} from '../app/machine';
import type {SessionIntent} from '../app/sessionReducer';
import type {RhythmDocument} from '../domain/types';
import {LocalDatabase} from '../persistence/db';
import {StorageController,type StorageStatus} from '../persistence/controller';
import {emptyData,type AppData} from '../persistence/schema';
import {downloadJson,exportBackup} from '../persistence/importExport';
import type {useAudioSession} from './useAudioSession';
export function useStorageSession(state:SessionState,screen:string,drafts:RefObject<Record<string,RhythmDocument>>,dispatch:Dispatch<SessionIntent>,audio:ReturnType<typeof useAudioSession>){
  const controller=useRef<StorageController|undefined>(undefined);
  const [status,setStatus]=useState<StorageStatus>({mode:'loading',save:'clean'}),[ready,setReady]=useState(false);
  const [compositions,setCompositions]=useState<RhythmDocument[]>([]),[settings,setSettings]=useState(emptyData().settings);
  const [preserved,setPreserved]=useState<AppData|undefined>(undefined);
  const current=useRef({state,screen,compositions,settings,audio});current.current={state,screen,compositions,settings,audio};
  const hydrate=(data:AppData)=>{drafts.current=structuredClone(data.drafts);setCompositions(data.compositions);setSettings(data.settings);dispatch({type:'RESTORE_PROGRESS',progress:data.progress});audio.setProfile(data.settings.profile);audio.setProfileStale(data.settings.profileStale);audio.setMetronome(data.settings.metronome);};
  const hydrateRef=useRef(hydrate);hydrateRef.current=hydrate;
  useEffect(()=>{
    let alive=true;
    try{const c=new StorageController(new LocalDatabase(),s=>{if(alive)setStatus(s);});controller.current=c;void c.start().then(data=>{if(alive){hydrateRef.current(data);setReady(true);}});}
    catch{setStatus({mode:'session',save:'failed',error:'이 브라우저는 저장을 지원하지 않아 세션 모드로 사용해요. JSON 백업을 보관해 주세요.'});setReady(true);}
    return()=>{alive=false;void controller.current?.close();};
  },[]);
  const snapshot=():AppData=>{
    const {state:s,screen:where,compositions:works,settings:preferences,audio:sound}=current.current;
    const allDrafts=structuredClone(drafts.current);
    if(where==='build')allDrafts[s.editor.puzzle?.id??'free']=structuredClone(s.editor.document);
    return {drafts:allDrafts,progress:structuredClone(s.progress),compositions:works,settings:{...preferences,profile:sound.profile,profileStale:sound.profileStale,metronome:sound.metronome}};
  };
  useEffect(()=>{
    if(!ready||status.mode==='readonly'||status.recovery)return;
    const data=snapshot(),immediate=screen==='home'||state.effects.some(e=>e.type==='save');
    if(JSON.stringify(data)===JSON.stringify(controller.current?.data)){if(immediate)void controller.current?.flush();return;}
    controller.current?.request(data,immediate);
  },[ready,state.editor.document,state.progress,state.effects,screen,compositions,settings,audio.profile,audio.profileStale,audio.metronome]);
  useEffect(()=>{
    if(!ready)return;const hidden=()=>{if(document.hidden&&status.mode==='writer')void flush();};
    const before=(event:BeforeUnloadEvent)=>{if(['pending','saving','failed'].includes(controller.current?.status.save??'')){event.preventDefault();event.returnValue='';}};
    document.addEventListener('visibilitychange',hidden);window.addEventListener('beforeunload',before);return()=>{document.removeEventListener('visibilitychange',hidden);window.removeEventListener('beforeunload',before);};
  },[ready,status.mode]);
  const flush=async()=>{const c=controller.current;if(!c)return false;const data=snapshot();if(JSON.stringify(data)!==JSON.stringify(c.data))c.request(data);return c.flush();};
  const takeOver=async()=>{const c=controller.current;if(!c)return;setPreserved(snapshot());const result=await c.takeOver();hydrate(result.data);dispatch({type:'LEAVE'});};
  const restore=async()=>{const c=controller.current;if(c)hydrate(await c.restore());};
  const apply=async(data:AppData)=>{const c=controller.current;if(!c||status.mode!=='writer')throw new Error('저장 권한이 필요해요.');await c.apply(data);hydrate(data);};
  const erase=async()=>{const c=controller.current;if(c){hydrate(await c.erase());dispatch({type:'LEAVE'});}};
  return {status,ready,canEdit:ready&&(status.mode==='writer'||status.mode==='session')&&!status.recovery,compositions,setCompositions,settings,setSettings,snapshot,flush,takeOver,restore,apply,erase,revision:controller.current?.revision??0,preserved,export:()=>downloadJson(exportBackup(snapshot())),exportPreserved:()=>preserved&&downloadJson(exportBackup(preserved)),rawRecovery:async()=>{const raw=await controller.current?.db.rawRecovery();downloadJson(JSON.stringify(raw,null,2),'one-measure-recovery-raw.json');}};
}
