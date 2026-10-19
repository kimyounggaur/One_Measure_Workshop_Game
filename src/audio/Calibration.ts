import {matchCalibration,median} from '../domain/tapMatching';
import type {ClockMode,AudioSchedule} from './types';
export type CalibrationProfile={id:string;version:1;offsetMs:number;clockMode:ClockMode;sampleRate:number;calibratedAt:string;outputLabel:'speaker'|'wired'|'wireless'|'other'};
export type CalibrationEstimate={ok:true;offsetMs:number;keptCount:number;madMs:number}|{ok:false;reason:'tooFew'|'inconsistent'|'outOfRange';keptCount:number;madMs?:number};
export function estimateCalibration(errors:readonly number[]):CalibrationEstimate{
  if(errors.some(v=>!Number.isFinite(v)))throw new Error('Nonfinite calibration error');
  if(errors.length<8)return {ok:false,reason:'tooFew',keptCount:errors.length};
  const center=median(errors),mad=median(errors.map(v=>Math.abs(v-center)));
  const kept=errors.filter(v=>Math.abs(v-center)<=Math.max(3*mad,60));
  if(kept.length<8)return {ok:false,reason:'tooFew',keptCount:kept.length};
  const offsetMs=median(kept),madMs=median(kept.map(v=>Math.abs(v-offsetMs)));
  if(madMs>45)return {ok:false,reason:'inconsistent',keptCount:kept.length,madMs};
  if(Math.abs(offsetMs)>250)return {ok:false,reason:'outOfRange',keptCount:kept.length,madMs};
  return {ok:true,offsetMs,keptCount:kept.length,madMs};
}
export function calibrate(targets:readonly number[],inputs:readonly number[]):CalibrationEstimate{return estimateCalibration(matchCalibration(targets,inputs).pairs.map(p=>p.errorMs));}
export function profileMatches(profile:CalibrationProfile|undefined,clockMode:ClockMode,sampleRate:number):boolean{return !!profile&&profile.clockMode===clockMode&&profile.sampleRate===sampleRate&&Number.isFinite(profile.offsetMs)&&Math.abs(profile.offsetMs)<=250;}
export function calibrationSchedule(startSec:number):AudioSchedule{
  if(!Number.isFinite(startSec)||startSec<0)throw new Error('Invalid calibration start');
  const quarterDurationSec=.75,barStartSec=startSec+3,barDurationSec=9;
  return {countInStartSec:startSec,countInDurationSec:3,barStartSec,barEndSec:barStartSec+barDurationSec,barDurationSec,quarterDurationSec,loops:1,notes:[],unknownTicks:0,clicks:Array.from({length:16},(_,i)=>({startSec:startSec+i*.75,accented:i===0||i===4,countIn:i<4}))};
}
