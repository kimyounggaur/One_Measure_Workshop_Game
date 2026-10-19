import {PUZZLES} from '../content';
import type {Puzzle,RhythmDocument} from '../domain/types';
import {fullSignature} from '../domain/signatures';
import {assertOnlyKeys,isRecord,parseDocument} from '../domain/validation';
import {migrateCurrent} from './migrations';
import {APP_VERSION,emptyData,parseAppData,safeTree,type AppData} from './schema';
export const MAX_IMPORT_BYTES=1048576;
export type Backup={exportFormat:'one-measure-workshop';schemaVersion:1;exportedAt:string;appVersion:string;documents:RhythmDocument[];drafts?:AppData['drafts'];progress?:AppData['progress'];settings?:AppData['settings']};
export function exportBackup(data:AppData):string{const valid=parseAppData(data);return JSON.stringify({exportFormat:'one-measure-workshop',schemaVersion:1,exportedAt:new Date().toISOString(),appVersion:APP_VERSION,documents:valid.compositions,drafts:valid.drafts,progress:valid.progress,settings:valid.settings} satisfies Backup,null,2);}
function copyDocument(raw:unknown,puzzle?:Puzzle):RhythmDocument{
  const doc=parseDocument(raw);doc.id=crypto.randomUUID();
  doc.events=doc.events.map(e=>{const original=puzzle?.initialEvents.find(o=>fullSignature([o])===fullSignature([e]));if(original)return structuredClone(original);return {...e,id:crypto.randomUUID(),locked:false};});
  if(puzzle)for(const lock of puzzle.initialEvents.filter(e=>e.locked)){const rebound=doc.events.find(e=>e.id===lock.id);if(!rebound)throw new Error('잠긴 조각이 변경된 백업이에요.');}
  return doc;
}
export function parseBackup(text:string):AppData{
  if(new TextEncoder().encode(text).byteLength>MAX_IMPORT_BYTES)throw new Error('백업은 1MiB 이하여야 해요.');const raw:unknown=JSON.parse(text);safeTree(raw);
  if(!isRecord(raw))throw new Error('Invalid backup');assertOnlyKeys(raw,['exportFormat','schemaVersion','exportedAt','appVersion','documents','drafts','progress','settings']);
  if(raw.exportFormat!=='one-measure-workshop'||typeof raw.schemaVersion!=='number'||typeof raw.exportedAt!=='string'||!Number.isFinite(Date.parse(raw.exportedAt))||typeof raw.appVersion!=='string'||raw.appVersion.length>64)throw new Error('Invalid backup format');migrateCurrent({schemaVersion:raw.schemaVersion});
  if(!Array.isArray(raw.documents)||raw.documents.length>20)throw new Error('작품은 최대 20개예요.');
  const data=emptyData();data.compositions=raw.documents.map(d=>copyDocument(d));
  if(raw.drafts!==undefined){if(!isRecord(raw.drafts))throw new Error('Invalid drafts');for(const [key,d]of Object.entries(raw.drafts)){const puzzle=PUZZLES.find(p=>p.id===key);if(!puzzle&&key!=='free')throw new Error('Unknown puzzle');data.drafts[key]=copyDocument(d,puzzle);}}
  if(raw.progress!==undefined){if(!isRecord(raw.progress))throw new Error('Invalid progress');for(const [key,p]of Object.entries(raw.progress)){if(!isRecord(p))throw new Error('Invalid progress');const puzzle=PUZZLES.find(item=>item.id===key);if(!puzzle)throw new Error('Unknown puzzle');const copied=structuredClone(p);if(copied.bestTheorySnapshot!==undefined)copied.bestTheorySnapshot=copyDocument(copied.bestTheorySnapshot,puzzle);data.progress[key]=copied as AppData['progress'][string];}}
  if(raw.settings!==undefined)data.settings=raw.settings as AppData['settings'];
  return parseAppData(data);
}
export async function readBackup(file:Blob){if(file.size>MAX_IMPORT_BYTES)throw new Error('백업은 1MiB 이하여야 해요.');return parseBackup(await file.text());}
export function mergeImport(current:AppData,incoming:AppData,replace=false,restoreLearning=false):AppData{
  const compositions=replace?incoming.compositions:[...current.compositions,...incoming.compositions];
  if(compositions.length>20)throw new Error('20개 저장 슬롯이 가득 찼어요. 자동으로 삭제하지 않아요.');
  return parseAppData({...current,compositions,...(restoreLearning?{drafts:incoming.drafts,progress:incoming.progress,settings:incoming.settings}:{})});
}
export function downloadJson(text:string,name=`one-measure-backup-${new Date().toISOString().slice(0,10)}.json`){const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
