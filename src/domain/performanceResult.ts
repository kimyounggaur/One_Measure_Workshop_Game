import { computeInputBounds,computeTapWindows,GRADING_VERSION } from './tapWindows';
import { matchPerformance,median,type MatchResult } from './tapMatching';
import type { Tempo } from './types';
export type Confidence='normal'|'practiceOnly'|'lowConfidence'|'invalidated'|'notApplicable';
export type TapResult={runId:string;rhythmHash:string;gradingVersion:string;tempo:Tempo;clockMode:'outputTimestamp'|'anchorFallback';calibrationId?:string;calibrationVersion?:number;targets:number;matched:number;missed:number;extras:number;extraInRest:number;medianAbsErrorMs?:number;confidence:Confidence;invalidReason?:string};
export type PerformanceRequest={runId:string;rhythmHash:string;tempo:Tempo;clockMode:TapResult['clockMode'];calibrationId?:string;calibrationVersion?:number;offsetMs:number;barStartMs:number;barEndMs:number;targetsMs:readonly number[];restSpansMs:readonly {startMs:number;endMs:number}[];rawInputsMs:readonly number[];lowConfidence?:boolean;invalidReason?:string};
export type PerformanceDetail=MatchResult&{categories:('center'|'early'|'late')[]};
export function buildPerformanceResult(request:PerformanceRequest):{result:TapResult;detail?:PerformanceDetail}{
  const r=request,windows=computeTapWindows(r.targetsMs,r.barEndMs-r.barStartMs);
  const bounds=computeInputBounds(r.barStartMs,r.barEndMs,windows.applicable?windows.WMs:0,r.offsetMs);
  if(r.rawInputsMs.some(v=>!Number.isFinite(v))||r.restSpansMs.some(s=>!Number.isFinite(s.startMs)||!Number.isFinite(s.endMs)||s.endMs<=s.startMs))throw new Error('Invalid performance times');
  const inputs=r.rawInputsMs.filter(v=>v>=bounds.rawOpenMs&&v<=bounds.rawCloseMs).map(v=>v-r.offsetMs);
  const result:TapResult={runId:r.runId,rhythmHash:r.rhythmHash,gradingVersion:GRADING_VERSION,tempo:{...r.tempo,beatUnit:{...r.tempo.beatUnit}},clockMode:r.clockMode,calibrationId:r.calibrationId,calibrationVersion:r.calibrationVersion,targets:r.targetsMs.length,matched:0,missed:0,extras:0,extraInRest:0,confidence:'notApplicable'};
  if(r.invalidReason||inputs.length>64)return {result:{...result,confidence:'invalidated',invalidReason:r.invalidReason??'tooManyInputs'}};
  if(!windows.applicable)return {result:{...result,extras:inputs.length}};
  const detail=matchPerformance(r.targetsMs,inputs,windows.WMs);
  result.confidence=r.lowConfidence?'lowConfidence':!r.calibrationId||r.clockMode==='anchorFallback'?'practiceOnly':'normal';
  result.matched=detail.pairs.length;result.missed=detail.missedTargetIndices.length;result.extras=detail.extraInputIndices.length;
  result.extraInRest=detail.extraInputIndices.filter(i=>r.restSpansMs.some(s=>inputs[i]>=s.startMs&&inputs[i]<s.endMs)).length;
  if(detail.pairs.length)result.medianAbsErrorMs=median(detail.pairs.map(p=>Math.abs(p.errorMs)));
  return {result,detail:{...detail,categories:detail.pairs.map(p=>Math.abs(p.errorMs)<=windows.GMs?'center':p.errorMs<0?'early':'late')}};
}
