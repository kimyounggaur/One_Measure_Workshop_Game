import T1 from './T1.json';import T2 from './T2.json';import T3 from './T3.json';import T4 from './T4.json';import T5 from './T5.json';import T6 from './T6.json';import T7 from './T7.json';import T8 from './T8.json';
import type {PaletteId} from '../../domain/types';
import {eventsFromTokens,analyzeCoverage,inventory} from '../../domain/rhythm';
import {assertOnlyKeys,isRecord} from '../../domain/validation';
export type TransferItem={id:string;phase:'pre'|'post';objective:string;prompt:string;tokens:PaletteId[];other?:PaletteId[];options:string[];correct:number;explanation:string;rubricMax:number};
export const TRANSFER=[T1,T2,T3,T4,T5,T6,T7,T8] as TransferItem[];
export type TransferResponse={id:string;choice?:number;tokens?:PaletteId[];explanation:string;selfScore?:number};
export type AssessmentRecord={id:string;phase:'pre'|'post'|'recheck';completedAt:string;responses:TransferResponse[];path:{assistance:string;mode:string}[]};
export function gradeCreation(tokens:readonly PaletteId[]){const events=eventsFromTokens([...tokens]),counts=inventory(events);return {length:analyzeCoverage(events).fullCoverage&&events.every(e=>e.startTick+e.durationTick<=1920),materials:tokens.length===5&&counts.N2===2&&counts.N1===2&&counts.R2===1,firstSound:tokens[0]?.startsWith('N')??false};}
export const WEEK_MS=7*24*60*60*1000;
export function recheckDue(records:readonly AssessmentRecord[],nowMs:number){const posts=records.filter(r=>r.phase==='post'||r.phase==='recheck');const latest=posts.at(-1);if(!latest||!Number.isFinite(nowMs))return false;const completed=Date.parse(latest.completedAt);return Number.isFinite(completed)&&nowMs>=completed&&nowMs-completed>=WEEK_MS;}
export const clockElapsedIsTrusted=(wallStart:number,monoStart:number,wallNow:number,monoNow:number)=>[wallStart,monoStart,wallNow,monoNow].every(Number.isFinite)&&monoNow>=monoStart&&Math.abs((wallNow-wallStart)-(monoNow-monoStart))<=5000;
export function parseAssessments(raw:unknown):AssessmentRecord[]{
  if(!Array.isArray(raw)||raw.length>20)throw new Error('확인 기록은 최대 20회예요.');
  for(const record of raw){
    if(!isRecord(record))throw new Error('Invalid assessment');assertOnlyKeys(record,['id','phase','completedAt','responses','path']);
    if(typeof record.id!=='string'||!record.id||record.id.length>128||!['pre','post','recheck'].includes(String(record.phase))||typeof record.completedAt!=='string'||!Number.isFinite(Date.parse(record.completedAt))||!Array.isArray(record.responses)||record.responses.length!==4||!Array.isArray(record.path)||record.path.length>6)throw new Error('Invalid assessment fields');
    const items=TRANSFER.filter(i=>i.phase===(record.phase==='pre'?'pre':'post'));
    for(const [index,response]of record.responses.entries()){
      if(!isRecord(response))throw new Error('Invalid response');assertOnlyKeys(response,['id','choice','tokens','explanation','selfScore']);const item=items[index];
      if(response.id!==item.id||typeof response.explanation!=='string'||response.explanation.length>500||(response.selfScore!==undefined&&(!Number.isInteger(response.selfScore)||Number(response.selfScore)<0||Number(response.selfScore)>item.rubricMax)))throw new Error('Invalid response fields');
      if(item.id==='T7'){if(!Array.isArray(response.tokens)||response.tokens.length>5||response.tokens.some(t=>!['N2','N1','R2'].includes(String(t))))throw new Error('Invalid creation response');}
      else if(!Number.isInteger(response.choice)||Number(response.choice)<0||Number(response.choice)>=item.options.length)throw new Error('Invalid choice');
    }
    for(const path of record.path){if(!isRecord(path))throw new Error('Invalid learning path');assertOnlyKeys(path,['assistance','mode']);if(!['independent','hinted','solutionViewed','notCompleted'].includes(String(path.assistance))||!['audio','visualAlternative'].includes(String(path.mode)))throw new Error('Invalid learning path');}
  }
  if(new Set(raw.map(r=>r.id)).size!==raw.length)throw new Error('Duplicate assessment IDs');return structuredClone(raw) as AssessmentRecord[];
}
