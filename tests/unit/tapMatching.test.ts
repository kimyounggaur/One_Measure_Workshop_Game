import {describe,it,expect} from 'vitest';
import fixture from '../fixtures/timing.json';
import {computeInputBounds,computeTapWindows,deriveTapTargets} from '../../src/domain/tapWindows';
import {matchPerformance} from '../../src/domain/tapMatching';
import {buildPerformanceResult,type PerformanceRequest} from '../../src/domain/performanceResult';
import {createDocument,eventsFromTokens} from '../../src/domain/rhythm';
const request=(extra:Partial<PerformanceRequest>={}):PerformanceRequest=>({runId:'run',rhythmHash:'meaning',tempo:{bpm:80,beatUnit:{num:1,den:4}},clockMode:'outputTimestamp',calibrationId:'profile',calibrationVersion:1,offsetMs:0,barStartMs:1000,barEndMs:4000,targetsMs:[1000,1750,3250],restSpansMs:[{startMs:2500,endMs:3250}],rawInputsMs:[],...extra});
describe('S09 source fixtures',()=>{
  for(const c of fixture.offsetCases)it(`offset sign ${c.offsetMs}`,()=>expect(c.rawInputMs-c.targetMs-c.offsetMs).toBe(c.correctedErrorMs));
  for(const c of fixture.windows)it(`input bounds ${c.offsetMs}`,()=>expect(computeInputBounds(c.barStartMs,c.barEndMs,c.WMs,c.offsetMs)).toMatchObject({rawOpenMs:c.rawOpenMs,rawCloseMs:c.rawCloseMs,finalizeMs:c.finalizeMs}));
  for(const [i,c]of fixture.matching.entries())it(`matching fixture ${i}`,()=>{const r=matchPerformance(c.targetsMs,c.correctedInputsMs,c.WMs);expect(r.pairs.map(p=>[p.targetIndex,p.inputIndex])).toEqual(c.expectedPairs);expect(r.extraInputIndices).toEqual(c.expectedExtras);});
});
it('IOI governs W, single target uses bar duration, exact G boundary is centered',()=>{
  expect(computeTapWindows([1000,1250],2000)).toEqual({applicable:true,minIOIMs:250,WMs:112.5,GMs:55});
  const fast=computeTapWindows([0,60000/140/2],60000/140*4);if(!fast.applicable)throw new Error();expect(fast.WMs).toBeCloseTo(96.428571);
  expect(computeTapWindows([1000],2000)).toMatchObject({WMs:160,GMs:55});
  expect(buildPerformanceResult(request({rawInputsMs:[1055,1805.001,3195]})).detail?.categories).toEqual(['center','late','center']);
});
it('inclusive ±W without numeric widening',()=>{expect(matchPerformance([1000],[1160],160).pairs).toHaveLength(1);expect(matchPerformance([1000],[1160.001],160).pairs).toHaveLength(0);});
it('unsorted and duplicate inputs retain original indices and stable chronological ties',()=>{expect(matchPerformance([1000],[1010,990],160).pairs[0].inputIndex).toBe(1);expect(matchPerformance([1000],[990,990],160).pairs[0].inputIndex).toBe(0);expect(matchPerformance([1000,1100],[1050],160).pairs).toHaveLength(1);});
it('uses actual L4 and L5 semantic snapshots',()=>{
  expect(deriveTapTargets(createDocument(eventsFromTokens(['N2','N4','N2'])))).toEqual([0,480,1440]);
  expect(deriveTapTargets(createDocument(eventsFromTokens(['N2','N2','N4'])))).toEqual([0,480,960]);
  expect(deriveTapTargets(createDocument(eventsFromTokens(['N2','R2','N2','N2'])))).toEqual([0,960,1440]);
  expect(deriveTapTargets(createDocument(eventsFromTokens(['N2','N2','N2','R2'])))).toEqual([0,480,960]);
});
it('negative offset retains early input and positive offset retains post-bar extra',()=>{
  expect(buildPerformanceResult(request({offsetMs:-250,rawInputsMs:[750]})).result.matched).toBe(1);
  expect(buildPerformanceResult(request({offsetMs:250,rawInputsMs:[4300]})).result.extras).toBe(1);
});
it('matched early next-note input is not also a rest extra; gaps are not rests',()=>{const r=buildPerformanceResult(request({rawInputsMs:[3100,2900,2300]})).result;expect(r).toMatchObject({matched:1,extras:2,extraInRest:1});});
it('all-rest has no manufactured precision, and 65 eligible inputs invalidates',()=>{
  const result=buildPerformanceResult(request({targetsMs:[],rawInputsMs:[2000]})).result;expect(result.confidence).toBe('notApplicable');expect(result.medianAbsErrorMs).toBeUndefined();
  expect(buildPerformanceResult(request({rawInputsMs:Array(65).fill(1000)})).result.confidence).toBe('invalidated');
  expect(()=>matchPerformance(Array.from({length:9},(_,i)=>i),[],1)).toThrow();expect(()=>matchPerformance([0],Array(65).fill(0),1)).toThrow();
});
it('result is an aggregate with identities, never raw times or progress',()=>{const r=buildPerformanceResult(request({rawInputsMs:[1000]})).result;expect(r).toMatchObject({runId:'run',rhythmHash:'meaning',gradingVersion:'1.0.0',calibrationVersion:1,confidence:'normal'});expect(JSON.stringify(r)).not.toContain('rawInputs');});
it('rejects nonfinite, duplicated targets and invalid windows',()=>{for(const t of [[0,0],[NaN],[2,1]])expect(()=>matchPerformance(t,[],1)).toThrow();expect(()=>computeInputBounds(1,2,160,251)).toThrow();expect(()=>computeTapWindows([],0)).toThrow();});

// Independent oracle enumerates all monotonic partial pair sets, then globally sorts.
function exhaustive(targets:number[],inputs:number[],w:number){
  const sorted=inputs.map((time,index)=>({time,index})).sort((a,b)=>a.time-b.time||a.index-b.index);
  const candidates:{pairs:[number,number][];cost:number}[]=[];
  const visit=(pairs:[number,number][],t:number,j:number)=>{
    candidates.push({pairs,cost:pairs.reduce((s,[a,b])=>s+Math.abs(targets[a]-sorted[b].time),0)});
    for(let a=t;a<targets.length;a++)for(let b=j;b<sorted.length;b++)if(Math.abs(targets[a]-sorted[b].time)<=w)visit([...pairs,[a,b]],a+1,b+1);
  };visit([],0,0);
  candidates.sort((a,b)=>b.pairs.length-a.pairs.length||a.cost-b.cost||(()=>{const x=a.pairs.flat(),y=b.pairs.flat();for(let k=0;k<x.length;k++)if(x[k]!==y[k])return x[k]-y[k];return 0;})());
  const winner=candidates[0];return {pairs:winner.pairs.map(([t,j])=>({targetIndex:t,inputIndex:sorted[j].index,errorMs:sorted[j].time-targets[t]})),cost:winner.cost};
}
it('DP equals independent exhaustive oracle for 400 small sequences and common translations',()=>{
  let seed=217;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};
  for(let k=0;k<400;k++){
    const targets=Array.from({length:random()%5},(_,i)=>i*300+1000);
    const inputs=Array.from({length:random()%6},()=>800+(random()%16)*100);const w=160;
    const expected=exhaustive(targets,inputs,w),actual=matchPerformance(targets,inputs,w);
    expect(actual.pairs).toEqual(expected.pairs);expect(actual.totalAbsErrorMs).toBe(expected.cost);
    expect(actual.missedTargetIndices).toEqual(targets.map((_,i)=>i).filter(i=>!expected.pairs.some(p=>p.targetIndex===i)));
    expect(actual.extraInputIndices).toEqual(inputs.map((_,i)=>i).filter(i=>!expected.pairs.some(p=>p.inputIndex===i)));
    expect(matchPerformance(targets.map(v=>v+25000),inputs.map(v=>v+25000),w)).toEqual(actual);
  }
});
