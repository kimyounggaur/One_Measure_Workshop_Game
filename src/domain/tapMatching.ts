import { assertTargets } from './tapWindows';
export type MatchPair={targetIndex:number;inputIndex:number;errorMs:number};
export type MatchResult={pairs:MatchPair[];missedTargetIndices:number[];extraInputIndices:number[];totalAbsErrorMs:number};
type Path={pairs:[number,number][];cost:number};
function better(a:Path,b:Path):Path {
  if(a.pairs.length!==b.pairs.length)return a.pairs.length>b.pairs.length?a:b;
  if(a.cost!==b.cost)return a.cost<b.cost?a:b;
  for(let i=0;i<a.pairs.length;i++)for(let j=0;j<2;j++)if(a.pairs[i][j]!==b.pairs[i][j])return a.pairs[i][j]<b.pairs[i][j]?a:b;
  return a;
}
function matchSequence(targets:readonly number[],inputs:readonly number[],WMs:number,maximum:number):MatchResult {
  assertTargets(targets,maximum);
  if(inputs.length>64||inputs.some(v=>!Number.isFinite(v))||!Number.isFinite(WMs)||WMs<0)throw new Error('Invalid matching inputs');
  const sorted=inputs.map((time,index)=>({time,index})).sort((a,b)=>a.time-b.time||a.index-b.index);
  const dp:Path[][]=Array.from({length:targets.length+1},()=>Array.from({length:inputs.length+1},()=>({pairs:[],cost:0})));
  for(let i=1;i<=targets.length;i++)for(let j=1;j<=inputs.length;j++){
    let best=better(dp[i-1][j],dp[i][j-1]);
    const error=Math.abs(sorted[j-1].time-targets[i-1]);
    if(error<=WMs)best=better(best,{pairs:[...dp[i-1][j-1].pairs,[i-1,j-1]],cost:dp[i-1][j-1].cost+error});
    dp[i][j]=best;
  }
  const path=dp[targets.length][inputs.length];
  const pairs=path.pairs.map(([t,j])=>({targetIndex:t,inputIndex:sorted[j].index,errorMs:sorted[j].time-targets[t]}));
  return {pairs,totalAbsErrorMs:path.cost,missedTargetIndices:targets.map((_,i)=>i).filter(i=>!pairs.some(p=>p.targetIndex===i)),extraInputIndices:inputs.map((_,i)=>i).filter(i=>!pairs.some(p=>p.inputIndex===i))};
}
export const matchPerformance=(targets:readonly number[],inputs:readonly number[],WMs:number)=>matchSequence(targets,inputs,WMs,8);
/** Calibration deliberately has its own twelve-target cardinality contract. */
export const matchCalibration=(targets:readonly number[],inputs:readonly number[])=>matchSequence(targets,inputs,350,12);
export const median=(values:readonly number[]):number=>{if(!values.length||values.some(v=>!Number.isFinite(v)))throw new Error('Empty/nonfinite median');const sorted=[...values].sort((a,b)=>a-b);const middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;};
